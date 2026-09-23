/*
 * EL GRAFO: el unico sitio de toda la extension donde el audio se TOCA.
 *
 * src/shared/ecualizador.js decide QUE hay que hacer (que frecuencias, cuantos
 * decibelios, cuanto hay que bajar la entrada para no recortar) y se puede
 * probar entero con `node --test`. Este archivo solo obedece: coge un plan ya
 * decidido y lo convierte en nodos de Web Audio. La division no es cosmetica:
 * todo lo que se puede OIR mal vive en el otro archivo, donde hay pruebas.
 *
 * ------------------------------------------------------------------
 * LA PUERTA DE UN SOLO SENTIDO
 * ------------------------------------------------------------------
 *
 * createMediaElementSource(video) es irreversible. Desde esa llamada el audio
 * del elemento deja de salir por su ruta normal y sale UNICAMENTE por el
 * grafo. No hay funcion que lo deshaga; ni desconectar el nodo, ni cerrar el
 * contexto (cerrarlo es lo peor que se puede hacer: entonces no sale por
 * ningun sitio). La unica marcha atras es recargar la pestaña.
 *
 * De ahi salen las tres reglas que gobiernan este archivo:
 *
 * 1. NO SE CRUZA LA PUERTA SIN QUE EL USUARIO LO PIDA. Un plan `null` —el
 *    ecualizador apagado— no llama a createMediaElementSource ni de casualidad.
 *    Por eso "off" y "plano" no son lo mismo aunque suenen igual: "plano" ya
 *    esta dentro del grafo, "off" ni ha entrado.
 *
 * 2. UNA FUENTE QUE HA CRUZADO NUNCA SE QUEDA SIN SALIDA. Lo primero que se
 *    hace tras cruzar, antes de montar un solo filtro, es conectarla a
 *    ctx.destination. Si todo lo demas revienta, la musica ya tiene por donde
 *    salir. Apagar el ecualizador despues de haber cruzado no es "deshacer":
 *    es puentear, fuente -> destination y los filtros fuera del camino.
 *
 * 3. EL CONTEXTO NO SE CIERRA JAMAS. `desconectar()` del espectro si lo
 *    cerraba, y podia, porque alli el audio era una copia de captureStream().
 *    Aqui no lo es.
 *
 * ------------------------------------------------------------------
 * POR QUE HAY UNA "TOMA" QUE NO HACE NADA
 * ------------------------------------------------------------------
 *
 * La cadena es:
 *
 *     fuente -> entrada(preamp) -> filtro0 -> ... -> filtro4 -> toma -> limitador -> destination
 *                                                                  \-> analizadores
 *
 * `toma` es un GainNode a 1: no cambia el sonido. Existe para ser un punto de
 * enganche ESTABLE. Los analizadores del espectro se cuelgan de ahi, y si
 * colgaran del ultimo filtro habria que recablearlos cada vez que la cadena se
 * reconstruye. Un nodo que no hace nada a cambio de que nadie tenga que
 * recablear nada es un cambio barato.
 *
 * Y cuelgan DESPUES de los filtros a proposito: asi el espectro enseña lo que
 * de verdad se esta oyendo. Subes los graves y las barras graves crecen.
 *
 * ------------------------------------------------------------------
 * LO QUE AQUI NO ESTA MEDIDO
 * ------------------------------------------------------------------
 *
 * El <video> viaja al documento de la ventana flotante cuando se abre el PiP.
 * La fuente de Web Audio esta atada al ELEMENTO, no al documento, asi que
 * *deberia* dar igual. NO ESTA COMPROBADO en la pagina real. Hasta que
 * tools/diagnostico-ecualizador.js lo mida con el PiP abierto, esto es una
 * suposicion y se escribe como suposicion.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  /*
   * Cuanto tarda un cambio de ganancia en llegar a su sitio.
   *
   * Poner `param.value = x` a pelo salta de un valor a otro entre dos muestras
   * consecutivas, y un salto en el valor de una señal es un chasquido: se oye
   * cada vez que se mueve un mando. `setTargetAtTime` reparte el cambio por una
   * curva. 20 ms es lo bastante corto para que el mando parezca inmediato y lo
   * bastante largo para que no se oiga el escalon.
   */
  const SEGUNDOS_RAMPA = 0.02;

  /*
   * Que elemento ya cruzo la puerta y con que nodo.
   *
   * Hace falta recordarlo porque createMediaElementSource LANZA
   * InvalidStateError la segunda vez que se le pide el mismo elemento. No es
   * un caso raro: pasa en cuanto el usuario apaga y vuelve a encender el
   * ecualizador sin cambiar de cancion.
   *
   * WeakMap y no Map para no ser nosotros quienes impidan que el navegador
   * tire un <video> que la pagina ya ha descartado.
   */
  const fuentes = new WeakMap();

  let ctx = null;
  let elemento = null;
  let fuente = null;
  let entrada = null;
  let filtros = [];
  let toma = null;
  let limitador = null;
  let encendido = false;

  function hayWebAudio() {
    return typeof (root.AudioContext || root.webkitAudioContext) === "function";
  }

  /**
   * Si de este elemento se PODRIA ecualizar el audio. Barato: no crea nada y
   * sobre todo no cruza nada.
   *
   * Con `mediaKeys` la pista viene cifrada y el navegador entrega silencio al
   * grafo a proposito. Ahi cruzar la puerta no es que no sirva: es que deja al
   * usuario sin musica hasta que recargue.
   */
  function puedeEcualizarse(video) {
    return Boolean(video) && !video.mediaKeys && hayWebAudio();
  }

  /** Si este elemento ya paso por createMediaElementSource. */
  function cruzado(video) {
    return Boolean(video) && fuentes.has(video);
  }

  /*
   * UN SOLO AudioContext para toda la vida de la pagina, creado la primera vez
   * que hace falta y nunca cerrado.
   *
   * Perezoso porque un contexto creado sin un clic detras nace suspendido por
   * la politica de autoreproduccion, y un contexto suspendido en esta cadena
   * es silencio, no un espectro plano.
   */
  function contextoActual() {
    if (ctx) return ctx;
    if (!hayWebAudio()) return null;
    try {
      const Contexto = root.AudioContext || root.webkitAudioContext;
      ctx = new Contexto();
    } catch (err) {
      console.warn("[YTMPip] No se pudo crear el contexto de audio", err);
      ctx = null;
    }
    return ctx;
  }

  /*
   * Levanta el contexto si se ha suspendido solo.
   *
   * Esto no es una precaucion de manual, es LA vigilancia que sostiene toda la
   * funcion. El navegador suspende contextos por su cuenta (pestaña al fondo,
   * politica de autoreproduccion), y un contexto suspendido con la puerta ya
   * cruzada no da un espectro plano: da SILENCIO. Quien llame que lo llame a
   * menudo; es gratis cuando ya esta en marcha.
   */
  function reanudar() {
    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * LA PUERTA. Devuelve el nodo fuente del elemento, cruzando si es la primera
   * vez. `null` si no se ha podido, y en ese caso NO se ha tocado nada: el
   * audio sigue saliendo por donde salia.
   */
  function fuenteDe(video) {
    const c = contextoActual();
    if (!c) return null;

    const guardada = fuentes.get(video);
    if (guardada) return guardada;

    let nueva;
    try {
      nueva = c.createMediaElementSource(video);
    } catch (err) {
      console.warn("[YTMPip] No se pudo enrutar el audio del elemento", err);
      return null;
    }

    /*
     * REGLA 2, y va aqui y no tres lineas mas abajo. En cuanto esa llamada
     * vuelve, el audio de este elemento ya no sale por ningun sitio: lo
     * primero que se hace es darle uno. Si el montaje de los filtros falla
     * despues, se oye la cancion sin ecualizar, que es un fallo aburrido; si
     * esta linea estuviera al final, se oiria silencio.
     */
    try {
      nueva.connect(c.destination);
    } catch (err) {
      console.warn("[YTMPip] La fuente cruzo la puerta y no se pudo dar salida", err);
    }
    fuentes.set(video, nueva);
    return nueva;
  }

  function ajustarSuave(param, valor) {
    if (!param) return;
    if (typeof param.setTargetAtTime === "function" && ctx) {
      param.setTargetAtTime(valor, ctx.currentTime, SEGUNDOS_RAMPA);
    } else {
      param.value = valor;
    }
  }

  function ajustarYa(param, valor) {
    if (param) param.value = valor;
  }

  /*
   * Monta la cadena de proceso una sola vez y la deja cableada entre si.
   *
   * No se reconstruye al cambiar de preset ni al mover un mando: eso solo
   * cambia VALORES, y cambiar valores es `aplicar`. Solo se reconstruye si el
   * numero de bandas no cuadra, que hoy no puede pasar porque viene de
   * EQUALIZER_BANDS, pero mañana puede si alguien añade una banda.
   */
  function construirCadena(numFiltros) {
    const c = contextoActual();
    if (!c) return false;
    if (toma && filtros.length === numFiltros) return true;

    try {
      entrada = c.createGain();
      filtros = [];
      for (let i = 0; i < numFiltros; i++) filtros.push(c.createBiquadFilter());
      toma = c.createGain();
      toma.gain.value = 1;

      let anterior = entrada;
      for (let i = 0; i < filtros.length; i++) {
        anterior.connect(filtros[i]);
        anterior = filtros[i];
      }
      anterior.connect(toma);

      /*
       * EL LIMITADOR VA DESPUES DE `toma`, o sea despues del punto del que
       * cuelga el espectro, y eso es deliberado: las barras enseñan lo que
       * hacen los filtros, no lo que el limitador les quita en los picos. Si
       * colgara antes, subir los graves haria bailar TODAS las barras hacia
       * abajo cada vez que entrara el bombo, que es cierto pero no es lo que
       * el usuario ha pedido mirar.
       *
       * `createDynamicsCompressor` es de siempre y no falta en ningun
       * navegador con Web Audio, pero si faltara la cadena no se queda sin
       * salida: se conecta `toma` directamente al destino. Se oiria sin red,
       * que es peor que con ella y muchisimo mejor que en silencio.
       */
      if (typeof c.createDynamicsCompressor === "function") {
        limitador = c.createDynamicsCompressor();
        toma.connect(limitador);
        limitador.connect(c.destination);
      } else {
        limitador = null;
        toma.connect(c.destination);
      }
    } catch (err) {
      console.warn("[YTMPip] No se pudo montar la cadena de filtros", err);
      entrada = null;
      filtros = [];
      toma = null;
      limitador = null;
      return false;
    }
    return true;
  }

  /*
   * Los cinco numeros del limitador, traducidos a los nombres de Web Audio.
   *
   * Es la unica traduccion de nombres de toda la cadena y esta aqui a
   * proposito: `plan` habla el idioma de este proyecto y los nodos hablan el
   * de la especificacion. Que los dos vocabularios se toquen en un solo sitio
   * es lo que permite que ecualizador.js se pruebe sin navegador.
   *
   * TODOS A PELO Y NINGUNO CON RAMPA, al reves que las ganancias. Estos
   * parametros no son la señal: son la forma de la red. Cambiarlos no produce
   * un escalon en el audio, y ademas solo cambian cuando cambian las
   * constantes, o sea nunca durante una cancion.
   */
  function aplicarLimitador(ajustes) {
    if (!limitador || !ajustes) return;
    ajustarYa(limitador.threshold, ajustes.umbralDb);
    ajustarYa(limitador.knee, ajustes.rodillaDb);
    ajustarYa(limitador.ratio, ajustes.ratio);
    ajustarYa(limitador.attack, ajustes.ataqueS);
    ajustarYa(limitador.release, ajustes.relajacionS);
  }

  /*
   * Vuelca los numeros del plan en los nodos. No cablea nada.
   *
   * El tipo, la frecuencia y la Q se ponen a pelo y la ganancia con rampa: los
   * dos primeros no son la señal, son la forma del filtro, y cambiarlos de
   * golpe no produce un escalon en el audio. La ganancia si.
   *
   * La Q solo se toca si el plan trae una. En un shelf ese parametro no es el
   * ancho de la campana sino la resonancia del escalon, y cualquier cosa que
   * no sea el 0,707 de fabrica mete un pico en la esquina. Por eso
   * EQUALIZER_BANDS no le da Q a los shelf y por eso aqui no se inventa una.
   */
  function aplicar(plan) {
    if (!plan || !entrada || !toma) return false;
    ajustarSuave(entrada.gain, plan.entrada);
    aplicarLimitador(plan.limitador);
    for (let i = 0; i < filtros.length && i < plan.filtros.length; i++) {
      const nodo = filtros[i];
      const banda = plan.filtros[i];
      nodo.type = banda.tipo;
      ajustarYa(nodo.frequency, banda.hz);
      if (typeof banda.q === "number") ajustarYa(nodo.Q, banda.q);
      ajustarSuave(nodo.gain, banda.db);
    }
    return true;
  }

  /*
   * Saca los filtros del camino sin deshacer nada, porque no se puede deshacer
   * nada: fuente -> destination y a correr.
   *
   * La cadena se queda montada y `toma` se queda conectada a destination. No
   * suena porque no le entra nada, y dejarla ahi evita recablear cuando el
   * usuario vuelva a encender —que es lo normal, se apaga para comparar—.
   */
  function puentear() {
    const c = ctx;
    if (!fuente || !c) return;
    try {
      fuente.disconnect();
      fuente.connect(c.destination);
    } catch (err) {
      console.warn("[YTMPip] No se pudo puentear el ecualizador", err);
    }
    encendido = false;
  }

  /** El elemento anterior vuelve a su camino directo antes de olvidarlo. */
  function soltarAnterior(video) {
    if (!fuente || !ctx || elemento === video) return;
    try {
      fuente.disconnect();
      fuente.connect(ctx.destination);
    } catch (err) {
      // Un elemento que la pagina ya tiro no tiene por que quejarse limpio.
    }
  }

  /**
   * Deja el audio del elemento sonando segun el plan.
   *
   * `plan` null significa apagado, y apagado NO CRUZA LA PUERTA: si este
   * elemento no habia entrado nunca en el grafo, esta funcion no toca
   * absolutamente nada y devuelve true, porque el estado pedido —el audio
   * saliendo por su ruta normal— ya se cumple.
   *
   * Devuelve si el audio ha quedado como se pedia.
   */
  function montar(video, plan) {
    if (!video) return false;

    if (!plan) {
      if (cruzado(video)) {
        if (video !== elemento) {
          soltarAnterior(video);
          elemento = video;
          fuente = fuentes.get(video);
        }
        puentear();
      }
      encendido = false;
      return true;
    }

    if (!puedeEcualizarse(video)) return false;

    const nueva = fuenteDe(video);
    if (!nueva) return false;

    if (video !== elemento) {
      soltarAnterior(video);
      elemento = video;
      fuente = nueva;
    }

    if (!construirCadena(plan.filtros.length)) {
      // La cadena no existe pero la puerta si esta cruzada: el audio se queda
      // saliendo directo, sin ecualizar, que es lo que hizo `fuenteDe`.
      encendido = false;
      return false;
    }

    try {
      fuente.disconnect();
      fuente.connect(entrada);
    } catch (err) {
      console.warn("[YTMPip] No se pudo enchufar la fuente a los filtros", err);
      puentear();
      return false;
    }

    aplicar(plan);
    reanudar();
    encendido = true;
    return true;
  }

  /** Puentea el elemento que estuviera ecualizandose. */
  function apagar() {
    puentear();
  }

  /**
   * El nodo del que hay que colgar los analizadores del espectro cuando el
   * ecualizador esta en marcha. `null` cuando no lo esta, y entonces el
   * espectro sigue con su captureStream() de siempre.
   */
  function nodoDeAnalisis() {
    return encendido ? toma : null;
  }

  YTMPip.GrafoAudio = {
    puedeEcualizarse,
    cruzado,
    montar,
    apagar,
    reanudar,
    aplicar,
    contextoActual,
    nodoDeAnalisis,
    activo: () => encendido,
    elementoActual: () => elemento,
    SEGUNDOS_RAMPA
  };
})(typeof self !== "undefined" ? self : globalThis);
