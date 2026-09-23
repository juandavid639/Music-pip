/*
 * ESPECTRO: lectura del audio que esta sonando.
 *
 * Este modulo SOLO mide. No pinta nada y no sabe que existe una ventana
 * flotante: entrega numeros y quien quiera los dibuja. La razon es que
 * dibujar depende del tamaño de la ventana y medir no, y mezclarlo obligaria
 * a tener el AudioContext atado al ciclo de vida de un canvas.
 *
 * POR QUE captureStream() Y NO createMediaElementSource()
 *
 * El camino de manual para analizar audio es createMediaElementSource(video),
 * y es una puerta de un solo sentido: desde esa llamada el sonido del
 * elemento deja de salir por su ruta normal y sale por el AudioContext. Si el
 * contexto se queda suspendido —y se suspende solo, por politica de
 * autoreproduccion o al pasar la pestaña a segundo plano— la musica se calla
 * y no se arregla sin recargar la pagina. No hay `undo`.
 *
 * captureStream() entrega una COPIA del audio y deja el elemento sonando por
 * donde sonaba. Si este modulo entero falla, lo peor que pasa es que no hay
 * espectro; la musica no se entera. En una extension cuyo unico proposito es
 * escuchar musica, esa diferencia es la que decide el diseño.
 *
 * Por lo mismo la cadena termina en el analizador y NUNCA se conecta a
 * ctx.destination: conectarla sonaria una segunda vez, con eco.
 *
 * VERIFICADO EN LA PAGINA REAL antes de escribir esto, con
 * tools/diagnostico-espectro.js sobre music.youtube.com:
 *
 *     DRM: no
 *     pistas de audio: 1 (live)
 *     movimiento: 35 de 35
 *     seguia sonando: si (524.1 → 526.1)
 *
 * Si algun dia YouTube Music sirve la musica cifrada, `conectar` devolvera
 * false por `video.mediaKeys` y el boton del espectro no se ofrecera. No se
 * inventa un espectro falso a partir del tiempo de la cancion: seria una
 * animacion disfrazada de dato.
 *
 * ------------------------------------------------------------------
 * LA EXCEPCION: CUANDO EL ECUALIZADOR YA ESTA ENCENDIDO
 * ------------------------------------------------------------------
 *
 * Todo lo de arriba vale mientras el audio salga por su ruta normal. Si el
 * usuario enciende el ecualizador, src/content/audio-grafo.js ya ha cruzado la
 * puerta y el audio va por un grafo. Ahi este modulo NO monta un captureStream
 * de mas: se cuelga de la toma que el grafo le ofrece.
 *
 * No es una optimizacion, es evitar una pelea. Ya se midio una vez que dos
 * consumidores de captureStream() sobre el mismo <video> se ahogan entre ellos
 * (los fotogramas perdidos pasaron de 1,3% a 64,6%), y ademas no esta claro
 * que captureStream siga llevando audio despues de createMediaElementSource.
 * La forma de no tener que contestar esa pregunta es que las dos cosas no
 * convivan nunca.
 *
 * De regalo, el espectro pasa a enseñar lo que DE VERDAD se esta oyendo: la
 * toma esta detras de los filtros, asi que subir graves engorda las barras
 * graves. Con la copia no podia: la copia sale de antes del ecualizador.
 *
 * Lo que esto obliga a cambiar aqui son dos cosas, y las dos son la misma
 * idea —la toma es PRESTADA—:
 *   - el contexto prestado NO SE CIERRA nunca (es el del grafo, y cerrarlo
 *     con la puerta cruzada deja al usuario sin musica),
 *   - de la toma prestada solo se desconecta lo que se le colgo, nodo por
 *     nodo. Un `disconnect()` a secas sobre ella la soltaria tambien de
 *     destination, que es cortar la cancion.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const TAMANO_FFT = 256;
  // Cuanto puede bajar una barra en un fotograma, sobre 255. Subir es
  // instantaneo (ver `suavizar`).
  const CAIDA_POR_FOTOGRAMA = 12;

  /*
   * EL PULSO: SEGUNDO ANALIZADOR, Y NO ES CAPRICHO.
   *
   * Las barras y el golpe de bombo NO se pueden medir con el mismo
   * analizador, y la aritmetica lo dice sin lugar a dudas. Con fftSize 256
   * hay 128 bandas repartidas hasta ~22 kHz, o sea 172 Hz POR BANDA: los
   * graves de verdad (20-120 Hz) caben enteros dentro de la banda 0, que
   * ademas es la componente continua. A esa resolucion "los graves" y "el
   * ruido de 0 Hz" son el mismo numero, y no hay forma de separarlos.
   *
   * La salida facil era subirle el fftSize al analizador de las barras.
   * Se descarto: `cortesDeBarras` reparte en logaritmico sobre el numero de
   * bandas que haya, asi que cambiarlo cambia el agrupado de TODAS las
   * barras, que es comportamiento ya verificado y que nadie ha pedido tocar.
   * Un AnalyserNode de mas colgando de la misma fuente cuesta una FFT por
   * fotograma y no toca nada de lo que ya funciona.
   *
   * 2048 -> 1024 bandas -> ~21,5 Hz por banda: de 20 a 120 Hz caen cinco
   * bandas, y la 0 se puede saltar.
   */
  const TAMANO_FFT_GRAVES = 2048;
  const GRAVES_DESDE_HZ = 20;
  const GRAVES_HASTA_HZ = 120;
  /*
   * Cuanto tarda la referencia en olvidar. Es lo que convierte "suena fuerte"
   * en "suena mas fuerte QUE HACE UN MOMENTO", que es lo unico que significa
   * un golpe. Sin esto, una cancion masterizada bajita no latiria nunca y una
   * alta latiria siempre, y las dos tienen bombo.
   */
  const MS_ADAPTACION = 1500;
  /*
   * Cuantos decibelios por encima de su propia referencia son un golpe
   * entero. En dB porque es la unidad en la que se mide, no un porcentaje
   * sobre un numero que no es lineal: esa confusion ya costo un instrumento
   * roto en tools/diagnostico-ecualizador.js.
   */
  const GOLPE_DB = 9;
  // Lo que tarda el pulso en volver a cero desde arriba. Subir es
  // instantaneo, por lo mismo que las barras: el golpe dura menos que un
  // fotograma y retrasarlo se nota como desincronizado con la musica.
  const MS_CAIDA = 250;

  let ctx = null;
  let fuente = null;
  let analizador = null;
  let bandas = null;
  let analizadorGraves = null;
  let bandasGraves = null;
  let elementoConectado = null;
  let pistaConectada = null;
  let fuenteConectada = "";
  /*
   * Si el contexto y la fuente son del grafo del ecualizador y no nuestros.
   * Lo que decide es QUIEN LIMPIA: lo prestado no se cierra ni se desconecta
   * entero, solo se le quita lo que uno mismo le colgo.
   */
  let prestado = false;
  let alturas = [];
  // `null` y no 0: "todavia no hay referencia" no es "la referencia es
  // silencio absoluto". Con 0 el primer fotograma daria un golpe enorme.
  let baseDb = null;
  let pulso = 0;
  let msUltimo = 0;

  /**
   * Donde empieza y acaba cada barra dentro de las bandas del analizador.
   *
   * No es un reparto a partes iguales, y esa es toda la gracia. El analizador
   * entrega bandas LINEALES en frecuencia: con 128 bandas hasta ~22 kHz, la
   * primera mitad del espectro cubre de 0 a 11 kHz, donde no hay casi nada de
   * musica. Repartido a partes iguales, tres cuartas partes de las barras se
   * quedan clavadas a cero y el resultado parece roto.
   *
   * El oido percibe la frecuencia de forma logaritmica, asi que los cortes se
   * reparten igual: las barras graves cubren pocas bandas y las agudas
   * muchas. `Math.max(anterior + 1, ...)` garantiza que ninguna barra se
   * quede sin al menos una banda, que es lo que pasaria abajo del todo, donde
   * la curva es tan plana que dos cortes seguidos caen en el mismo indice.
   *
   * Pura: devuelve un array de numBarras+1 cortes, empezando en 0 y
   * terminando en numBandas.
   */
  function cortesDeBarras(numBandas, numBarras) {
    if (!(numBandas > 0) || !(numBarras > 0)) return [];
    // Con mas barras que bandas no hay reparto posible: se piden menos.
    const barras = Math.min(numBarras, numBandas);
    const cortes = [0];
    for (let i = 1; i <= barras; i++) {
      const logaritmico = Math.round(Math.pow(numBandas, i / barras));
      cortes.push(Math.min(numBandas, Math.max(cortes[i - 1] + 1, logaritmico)));
    }
    /*
     * Aqui habia un `cortes[barras] = numBandas` "por si el redondeo se
     * queda corto". La verificacion por mutacion enseño que no se puede
     * romper: en la ultima vuelta el exponente es i/barras === 1 exacto y
     * Math.pow(n, 1) devuelve n, asi que el ultimo corte YA es numBandas
     * siempre. Una red que no puede atrapar nada solo hace creer que hay
     * red.
     */
    return cortes;
  }

  /**
   * La media de cada grupo de bandas. Media y no maximo a proposito: el
   * maximo hace que una sola banda ruidosa levante la barra entera y el
   * espectro tiembla sin relacion con lo que se oye.
   *
   * Pura.
   */
  function agruparEnBarras(valores, cortes) {
    const salida = [];
    for (let i = 0; i < cortes.length - 1; i++) {
      const desde = cortes[i];
      const hasta = cortes[i + 1];
      let suma = 0;
      for (let j = desde; j < hasta; j++) suma += valores[j];
      salida.push(suma / (hasta - desde));
    }
    return salida;
  }

  /**
   * Sube de golpe y baja despacio.
   *
   * Un golpe de bateria dura menos que un fotograma: si la bajada fuera
   * inmediata, la barra estaria abajo antes de que el ojo la viera y el
   * espectro parpadearia en vez de moverse. Subir si tiene que ser inmediato,
   * porque retrasar el golpe es justo lo que se nota como desincronizado con
   * la musica.
   *
   * Pura.
   */
  function suavizar(anterior, objetivo, caida) {
    if (!(anterior > 0)) return objetivo;
    if (objetivo >= anterior) return objetivo;
    return Math.max(objetivo, anterior - caida);
  }

  /**
   * La media en DECIBELIOS de las bandas que caen entre dos frecuencias.
   * `-Infinity` cuando ahi no hay nada que medir.
   *
   * EN dB Y NO EN BYTES, y esta es la leccion del ecualizador escrita en
   * codigo. `getByteFrequencyData` no entrega volumen: reparte el rango
   * [minDecibels, maxDecibels] = [-100, -30] en 256 pasos, o sea 0,2745 dB
   * por paso, y APLASTA CONTRA EL 255 todo lo que pase de -30 dB. Los graves
   * de una cancion masterizada viven justo ahi arriba, asi que el pulso se
   * quedaria plano precisamente en las canciones que mas pegan. En float no
   * hay techo y la resta entre dos lecturas ya sale en dB.
   *
   * La banda 0 se salta siempre: es la componente continua (0 Hz), que no es
   * sonido.
   *
   * Pura.
   */
  function mediaDb(valores, hzPorBanda, desdeHz, hastaHz) {
    if (!valores || !valores.length || !(hzPorBanda > 0)) return -Infinity;
    const desde = Math.max(1, Math.floor(desdeHz / hzPorBanda));
    /*
     * Este acotado SOBREVIVE a la verificacion por mutacion y se queda a
     * sabiendas. No puede cambiar el resultado: pasarse del final da
     * `undefined`, que el filtro de abajo descarta igual que un -Infinity.
     * Lo que acota es EL BUCLE, no la media. Ver tools/mutar-pulso.js, donde
     * esta anotado como superviviente en vez de fingir una prueba que lo
     * proteja.
     */
    const hasta = Math.min(valores.length - 1, Math.ceil(hastaHz / hzPorBanda));
    let suma = 0;
    let cuenta = 0;
    for (let i = desde; i <= hasta; i++) {
      // El silencio absoluto llega como -Infinity y envenenaria la media.
      if (Number.isFinite(valores[i])) {
        suma += valores[i];
        cuenta++;
      }
    }
    return cuenta ? suma / cuenta : -Infinity;
  }

  /**
   * Cuanto pesa la lectura nueva en la referencia, dado el hueco real entre
   * fotogramas.
   *
   * SE CUENTA EN MILISEGUNDOS Y NO EN FOTOGRAMAS a proposito: un factor fijo
   * por fotograma haria que la referencia se adaptase al DOBLE de rapido en
   * una pantalla de 120 Hz, y el pulso se veria distinto en cada maquina
   * sin que nada lo explicara. Es el mismo error que los emoji, aplicado al
   * tiempo.
   *
   * Se acota a 1: tras un paron largo —la pestaña en segundo plano— la
   * referencia salta al valor actual en vez de arrastrar un pasado que ya no
   * describe nada. Eso da golpe cero en ese fotograma, que es justo lo
   * honesto: de un salto en el tiempo no se puede deducir un golpe.
   *
   * Pura.
   */
  function alfaPara(msTranscurridos, msAdaptacion) {
    if (!(msTranscurridos > 0) || !(msAdaptacion > 0)) return 1;
    return Math.min(1, msTranscurridos / msAdaptacion);
  }

  /**
   * Que parte de un golpe entero (0..1) es estar `nivelDb` sobre `baseDb`.
   *
   * Por DEBAJO de la referencia no hay golpe negativo: hay silencio relativo,
   * y eso es 0. La carátula se encoge por debajo de su tamaño solo si alguien
   * lo pide expresamente, y nadie lo ha pedido.
   *
   * Pura.
   */
  function fuerzaDeGolpe(nivelDb, baseDb, spanDb) {
    if (!Number.isFinite(nivelDb) || !Number.isFinite(baseDb) || !(spanDb > 0)) return 0;
    const exceso = (nivelDb - baseDb) / spanDb;
    if (!(exceso > 0)) return 0;
    return Math.min(1, exceso);
  }

  /**
   * Si de este elemento se PODRIA sacar un espectro. Barato: no monta nada
   * ni crea ningun AudioContext.
   *
   * Existe separada de `conectar` porque son dos preguntas en dos momentos:
   * esta decide si se enseña el boton, y se hace en cada refresco; conectar
   * decide si se enciende, y solo se hace cuando el usuario lo pulsa. Crear
   * el AudioContext antes de que nadie lo pida seria trabajo tirado, y
   * ademas hacerlo sin un clic detras lo deja suspendido por la politica de
   * autoreproduccion.
   *
   * Con `mediaKeys` la pista viene cifrada y el navegador entrega silencio a
   * proposito: mejor no ofrecer el boton que ofrecer una linea plana.
   */
  function puedeMedirse(video) {
    if (!video) return false;
    // Con el ecualizador encendido da igual que el elemento sepa o no hacer
    // captureStream: el audio ya esta dentro de un grafo del que se puede
    // medir directamente.
    if (tomaDelGrafo(video)) return true;
    return !video.mediaKeys && typeof video.captureStream === "function";
  }

  /**
   * La toma del ecualizador para ESTE elemento, o null.
   *
   * Se pregunta por el elemento y no solo por "hay ecualizador": el grafo
   * puede estar encendido sobre otro <video> —la pagina los cambia al
   * encadenar canciones— y colgarse de una toma que lleva otro audio seria un
   * espectro que no tiene nada que ver con lo que se oye.
   *
   * Se lee de YTMPip en cada llamada en vez de guardarse arriba: el grafo
   * puede no estar cargado (esto tambien corre en pruebas que solo cargan el
   * espectro) y el estado cambia cada vez que alguien toca el interruptor.
   */
  function tomaDelGrafo(video) {
    const grafo = YTMPip.GrafoAudio;
    if (!grafo || !video) return null;
    if (!grafo.activo() || grafo.elementoActual() !== video) return null;
    const nodo = grafo.nodoDeAnalisis();
    const contexto = grafo.contextoActual();
    return nodo && contexto ? { nodo, ctx: contexto } : null;
  }

  /**
   * Si la pista capturada ya se ha terminado. Una MediaStreamTrack que
   * termina no vuelve a la vida: entrega silencio para siempre. Esto no
   * supone nada sobre YouTube Music, es como funciona una pista.
   *
   * Se pregunta "esta muerta" y no "esta viva" a proposito. Una pista real
   * siempre dice `live` o `ended`; pero si alguna vez no dijera nada,
   * "no esta viva" obligaria a remontar el analizador en CADA fotograma, y
   * un AudioContext por fotograma es mucho peor que un espectro plano.
   * Solo se remonta ante una señal positiva de muerte.
   */
  function pistaTerminada() {
    return Boolean(pistaConectada) && pistaConectada.readyState === "ended";
  }

  /**
   * La fuente que esta sonando ahora mismo en el elemento.
   *
   * Pura.
   */
  function fuenteDe(video) {
    return (video && video.currentSrc) || "";
  }

  /**
   * Si el elemento esta sonando algo DISTINTO de lo que se capturo.
   *
   * Esta pregunta existe porque medir en la pagina real dejo sin argumentos
   * a la anterior. Al pulsar "siguiente" a mano, YouTube Music reutiliza el
   * MISMO <video> y solo le cambia el blob:
   *
   *     elemento video#1 -> video#1 (EL MISMO, solo cambio la fuente)
   *     fuente nueva: blob:https://music.youtube.com/56e3b52b-...
   *
   * y la pista capturada NO se marca como `ended`: se queda `live` sin
   * llevar audio. `pistaTerminada` preguntaba justo por lo unico que no
   * pasaba, asi que el analizador seguia montado sobre una copia muda. Eso
   * era el "se congela al cambiar de cancion" y por eso el salto automatico
   * si funcionaba: alli la pista si llega a terminarse.
   *
   * La fuente VACIA no cuenta como fuente nueva. Entre dos canciones el
   * elemento pasa un rato sin `currentSrc`, y tratar eso como un cambio
   * remontaria el analizador en cada refresco durante toda la carga; montar
   * un AudioContext no es gratis. Vacia significa "todavia no se", no "otra".
   *
   * Pura respecto al modulo salvo por `fuenteConectada`, que es el dato que
   * compara.
   */
  function fuenteCambio(video) {
    const actual = fuenteDe(video);
    if (!actual || !fuenteConectada) return false;
    return actual !== fuenteConectada;
  }

  /*
   * Engancharse al elemento que suena. Devuelve si hay espectro disponible.
   *
   * DOS cosas pueden caducar aqui, y durante un tiempo solo se vigilaba una:
   *
   * 1. El ELEMENTO. YouTube Music cambia de <video> al encadenar canciones
   *    (la historia larga esta en el README). Sin comparar el elemento, el
   *    analizador se queda pegado a uno muerto.
   *
   * 2. La PISTA capturada. captureStream() entrega una copia del audio de
   *    ESE momento; cuando el elemento cambia de fuente, esa copia termina
   *    aunque el elemento siga siendo el mismo objeto. El analizador
   *    entonces sigue montado, `conectado()` sigue diciendo que si, y lo
   *    que se lee son ceros: el espectro se queda plano y hay que apagarlo
   *    y encenderlo a mano. Ese era el sintoma reportado.
   *
   * Comparar el elemento no puede cubrir el caso 2, porque en el caso 2 el
   * elemento no ha cambiado. Son dos preguntas distintas y hacen falta las
   * dos.
   *
   * 3. La FUENTE. Y este es el caso que de verdad reportaba el usuario, que
   *    durante dos intentos se confundio con el 2. Al cambiar de cancion a
   *    mano el elemento se queda, la fuente cambia, y la pista capturada se
   *    queda `live` sin llevar audio: ni el caso 1 ni el 2 se enteran. Ver
   *    `fuenteCambio`, donde esta la medicion que lo demostro.
   *
   * Son TRES preguntas y ninguna implica a las otras.
   *
   * 4. Y desde el ecualizador, LA FORMA DE MEDIR. Encender o apagar el
   *    ecualizador no cambia ni el elemento ni la pista ni la fuente, pero
   *    cambia de donde hay que colgarse. Sin esta cuarta pregunta, encender el
   *    ecualizador con el espectro ya en marcha dejaria las dos cosas
   *    conviviendo, que es justo lo que el encabezado de este archivo dice que
   *    no puede pasar.
   */
  function conectar(video) {
    if (!video) return false;
    const grafo = tomaDelGrafo(video);
    if (
      video === elementoConectado &&
      analizador &&
      Boolean(grafo) === prestado &&
      !pistaTerminada() &&
      !fuenteCambio(video)
    ) {
      // La politica de autoreproduccion puede suspenderlo DESPUES de
      // montarlo (al pasar la pestaña a segundo plano, por ejemplo). Un
      // contexto suspendido tambien lee ceros, y aqui es gratis levantarlo.
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    }
    if (!puedeMedirse(video)) return false;

    desconectar();

    let stream = null;
    if (!grafo) {
      try {
        stream = video.captureStream();
      } catch (err) {
        console.warn("[YTMPip] No se pudo capturar el audio para el espectro", err);
        return false;
      }

      if (!stream || !stream.getAudioTracks().length) return false;
    }

    try {
      if (grafo) {
        /*
         * Prestado: ni contexto propio ni fuente propia. Los dos analizadores
         * de abajo se cuelgan de la toma exactamente igual que se colgaban de
         * la copia, asi que de aqui para adelante no cambia nada mas.
         */
        ctx = grafo.ctx;
        fuente = grafo.nodo;
        prestado = true;
      } else {
        const Contexto = root.AudioContext || root.webkitAudioContext;
        ctx = new Contexto();
        fuente = ctx.createMediaStreamSource(stream);
        prestado = false;
      }
      analizador = ctx.createAnalyser();
      analizador.fftSize = TAMANO_FFT;
      // El analizador ya suaviza entre lecturas; se deja bajo porque encima
      // se aplica `suavizar`, y dos suavizados seguidos dan un espectro
      // perezoso que va por detras de la musica.
      analizador.smoothingTimeConstant = 0.5;
      fuente.connect(analizador);
      bandas = new Uint8Array(analizador.frequencyBinCount);
      /*
       * El de los graves cuelga de la MISMA fuente, en paralelo. No se
       * encadena detras del otro: los analizadores dejan pasar el audio tal
       * cual, pero encadenarlos ataria el ciclo de vida de uno al del otro
       * sin ganar nada.
       *
       * Suavizado CERO, al reves que el de las barras. Ahi el 0,5 sirve para
       * que el dibujo no tiemble; aqui arrastraria cada lectura hacia la
       * anterior, que es exactamente lo que borra un golpe de bombo. Suavizar
       * antes de medir un cambio es medir otra cosa.
       */
      analizadorGraves = ctx.createAnalyser();
      analizadorGraves.fftSize = TAMANO_FFT_GRAVES;
      analizadorGraves.smoothingTimeConstant = 0;
      fuente.connect(analizadorGraves);
      bandasGraves = new Float32Array(analizadorGraves.frequencyBinCount);
      elementoConectado = video;
      /*
       * Ni pista ni fuente cuando es prestado, Y ES A PROPOSITO. Las dos son
       * fechas de caducidad de UNA COPIA: la pista se termina y la copia se
       * queda muda cuando cambia la cancion. La toma del grafo no caduca por
       * ninguna de las dos cosas, porque no es una copia de un momento: cuelga
       * del elemento, y el elemento sigue siendo el mismo aunque le cambien el
       * blob. Apuntarlas aqui obligaria a remontar los analizadores en cada
       * cancion sin que nada lo justifique.
       */
      pistaConectada = stream ? stream.getAudioTracks()[0] : null;
      // Se apunta DESPUES de capturar, no antes: lo que hay que recordar es
      // que fuente estaba sonando cuando se hizo esta copia concreta.
      fuenteConectada = stream ? fuenteDe(video) : "";
    } catch (err) {
      console.warn("[YTMPip] No se pudo montar el analizador de audio", err);
      desconectar();
      return false;
    }

    // La politica de autoreproduccion puede dejarlo suspendido. Se pide
    // reanudar y se sigue: si no lo consigue, se leen ceros y quien pinta
    // decide, pero la MUSICA no depende de esto en ningun caso.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  }

  function desconectar() {
    try {
      if (prestado) {
        /*
         * LO PRESTADO NO SE CIERRA NI SE SUELTA ENTERO.
         *
         * `fuente.disconnect()` a secas es lo natural de escribir aqui y es
         * exactamente el fallo que dejaria al usuario sin musica: esa fuente
         * es la toma del ecualizador y tambien va a ctx.destination, asi que
         * soltarla entera corta la cancion, y no se arregla apagando el
         * espectro porque la puerta ya esta cruzada. Se le quita SOLO lo que
         * este modulo le colgo, nodo por nodo.
         *
         * Y el contexto no se cierra, por lo mismo: es del grafo.
         */
        if (fuente && analizador) fuente.disconnect(analizador);
        if (fuente && analizadorGraves) fuente.disconnect(analizadorGraves);
      } else {
        if (fuente) fuente.disconnect();
        if (ctx && ctx.state !== "closed") ctx.close();
      }
    } catch (err) {
      // Cerrar un contexto ya cerrado no es un problema que nadie deba ver.
    }
    prestado = false;
    ctx = null;
    fuente = null;
    analizador = null;
    bandas = null;
    analizadorGraves = null;
    bandasGraves = null;
    /*
     * La referencia del pulso SE TIRA, y esta si cambia el comportamiento
     * (al reves que las dos lineas comentadas mas abajo). Sobrevive a
     * `desconectar` porque es una variable del modulo, no del analizador: sin
     * borrarla, la cancion siguiente empezaria comparandose con el nivel de
     * graves de la anterior y daria un pulso clavado arriba o clavado abajo
     * durante el segundo y medio que tarda en adaptarse.
     */
    baseDb = null;
    pulso = 0;
    msUltimo = 0;
    elementoConectado = null;
    /*
     * Esta linea SOBREVIVE a la verificacion por mutacion, y se queda a
     * sabiendas. No puede cambiar el comportamiento: `pistaConectada` solo
     * se lee dentro de la guarda que exige `video === elementoConectado`, y
     * eso ya es imposible con el elemento a null. No es una red que no
     * atrapa nada —esas se borran, ver cortesDeBarras—: es que desconectar
     * promete soltarlo TODO, y quedarse agarrado a una pista muerta cuando
     * se sueltan las otras cinco cosas seria una promesa a medias.
     */
    pistaConectada = null;
    /*
     * SOBREVIVE A LA MUTACION, exactamente igual que la linea de arriba y
     * por la misma razon: `fuenteConectada` solo se lee dentro de una guarda
     * que exige `video === elementoConectado`, y con el elemento a null eso
     * no se cumple nunca. La proxima conexion la sobrescribe antes de que
     * nadie pueda leerla.
     *
     * Aqui escribi primero que esta linea SI cambiaba el comportamiento "y
     * hay una prueba que lo dice", y escribi ademas esa prueba. Las dos
     * cosas eran mentira: la prueba pasaba por el elemento a null, no por
     * esta linea, y la mutacion lo enseño en la primera vuelta. La prueba se
     * borro; la linea se queda, porque desconectar promete soltarlo TODO y
     * soltar seis de siete cosas es una promesa a medias.
     */
    fuenteConectada = "";
    alturas = [];
  }

  /**
   * Las alturas (0..255) de `numBarras` barras, ya suavizadas. null si no
   * hay analizador montado.
   *
   * `caida` es la velocidad, y entra por parametro en vez de leerse de las
   * preferencias aqui dentro. Este modulo SOLO mide: si supiera que existe
   * una pagina de opciones habria que montar un storage simulado para
   * probar una funcion que lo unico que hace es restar. Quien pinta ya lee
   * las preferencias por otros motivos, asi que le sale gratis pasarla.
   */
  function leerBarras(numBarras, caida) {
    if (!analizador || !bandas) return null;
    const velocidad = Number.isFinite(caida) ? caida : CAIDA_POR_FOTOGRAMA;
    analizador.getByteFrequencyData(bandas);
    const crudas = agruparEnBarras(bandas, cortesDeBarras(bandas.length, numBarras));
    if (alturas.length !== crudas.length) alturas = crudas.slice();
    else {
      for (let i = 0; i < crudas.length; i++) {
        alturas[i] = suavizar(alturas[i], crudas[i], velocidad);
      }
    }
    return alturas;
  }

  /**
   * La fuerza del golpe de graves AHORA, entre 0 y 1. `null` si no hay
   * analizador montado.
   *
   * `msAhora` lo pone quien llama y no se lee aqui de `performance` por dos
   * razones: rAF ya entrega ese numero (asi que no hay que pedirlo dos
   * veces), y una prueba puede mover el reloj sin fingir el reloj global.
   *
   * LO QUE DEVUELVE ES RELATIVO A LA PROPIA CANCION, no absoluto. "Los
   * graves estan a -32 dB" no dice nada: hay canciones enteras a -32 dB. Lo
   * que se ve como un golpe es que los graves esten por encima de donde
   * llevan estando, y por eso hay una referencia que persigue al nivel por
   * detras. Es la misma idea que la banda de control del ecualizador: el
   * dato util es la DIFERENCIA, no el valor.
   */
  function leerPulso(msAhora) {
    if (!analizadorGraves || !bandasGraves || !ctx) return null;
    analizadorGraves.getFloatFrequencyData(bandasGraves);

    const ahora = Number.isFinite(msAhora) ? msAhora : 0;
    /*
     * El primer fotograma no tiene hueco anterior que medir: dt 0 significa
     * "no se cuanto ha pasado", y todo lo de abajo lo resuelve hacia el
     * presente —la referencia salta al nivel actual y el pulso cae entero—
     * en vez de inventarse un golpe.
     *
     * Aqui habia un `Math.max(0, ...)` y se quito: era la MISMA regla escrita
     * por tercera vez. Los dos unicos sitios que usan dt ya preguntan si es
     * mayor que cero —`alfaPara` y las dos caidas— porque tienen que tratar
     * el dt 0 del primer fotograma de todas formas. Un reloj que va hacia
     * atras sale por ese mismo camino sin ayuda de nadie, asi que el acotado
     * no protegia nada: sobrevivia a la mutacion.
     */
    const dt = msUltimo > 0 ? ahora - msUltimo : 0;
    msUltimo = ahora;

    const hzPorBanda = ctx.sampleRate / 2 / bandasGraves.length;
    const nivel = mediaDb(bandasGraves, hzPorBanda, GRAVES_DESDE_HZ, GRAVES_HASTA_HZ);

    /*
     * Silencio absoluto: el pulso se apaga, pero LA REFERENCIA NO SE TOCA.
     * Dejar que el silencio la arrastre hacia abajo haria que la primera nota
     * despues de una pausa —o el arranque de la cancion— saliera disparada
     * como un golpe maximo que nadie ha oido.
     */
    if (!Number.isFinite(nivel)) {
      pulso = Math.max(0, pulso - (dt > 0 ? dt / MS_CAIDA : 1));
      return pulso;
    }

    if (baseDb === null) {
      // Primera lectura de la cancion: no hay pasado contra el que comparar,
      // asi que no hay golpe. Inventarse uno seria dar un salto al empezar.
      baseDb = nivel;
      pulso = 0;
      return pulso;
    }

    // El golpe se mide contra la referencia ANTERIOR y solo despues se
    // adapta. Al reves, un golpe fuerte tiraria de la referencia en el mismo
    // fotograma y se estaria midiendo en parte contra si mismo.
    const crudo = fuerzaDeGolpe(nivel, baseDb, GOLPE_DB);
    baseDb += (nivel - baseDb) * alfaPara(dt, MS_ADAPTACION);

    pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1));
    return pulso;
  }

  YTMPip.Espectro = {
    puedeMedirse,
    conectar,
    desconectar,
    leerBarras,
    leerPulso,
    conectado: () => Boolean(analizador),
    // De donde se esta midiendo. Lo mira el diagnostico y lo miran las
    // pruebas, porque "hay espectro" no distingue el caso que importa: que el
    // ecualizador y el espectro nunca esten tirando los dos del mismo <video>.
    usandoElGrafo: () => prestado,
    // Puras y expuestas para poder probarlas sin audio real, que es lo unico
    // que aqui se puede probar de verdad.
    cortesDeBarras,
    agruparEnBarras,
    suavizar,
    mediaDb,
    alfaPara,
    fuerzaDeGolpe,
    CAIDA_POR_FOTOGRAMA,
    GRAVES_DESDE_HZ,
    GRAVES_HASTA_HZ,
    GOLPE_DB,
    MS_ADAPTACION,
    MS_CAIDA
  };
})(typeof self !== "undefined" ? self : globalThis);
