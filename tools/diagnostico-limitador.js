/*
 * DIAGNOSTICO: ¿CUANTO ESTA RECORTANDO EL LIMITADOR?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO.
 *
 * ------------------------------------------------------------------
 * DE DONDE SALE ESTE ARCHIVO
 * ------------------------------------------------------------------
 *
 * El ecualizador tenia un fallo: la preamplificacion valia -(pico + 3), asi
 * que la banda mas subida acababa siempre en -3 dB exactos y el ecualizador
 * no podia subir nada, solo bajar el resto. Se cambio por un limitador al
 * final de la cadena.
 *
 * Al probarlo, el reporte fue: "no diria que suena mas fuerte
 * particularmente pero talvez si mas profundo el bajo".
 *
 * Esa frase admite DOS explicaciones que por oido no se separan:
 *
 *   A. El limitador trabaja todo el rato. YouTube Music viene masterizado
 *      casi al tope; si se le suben +8 dB de graves, los picos se salen y el
 *      limitador los devuelve al techo. El realce se oye como timbre pero el
 *      nivel no sube, porque el limitador esta haciendo dinamicamente lo
 *      mismo que hacia el peaje fijo que se acaba de quitar. Si es esto, el
 *      arreglo esta a medias y el aviso de la pagina de opciones —que dice
 *      que el limitador actua "solo cuando hace falta"— vuelve a mentir.
 *
 *   B. El limitador casi no actua. A 60 Hz el oido es poco sensible: +8 dB
 *      ahi añaden poquisimo volumen percibido y mucha PROFUNDIDAD, que es
 *      literalmente la palabra del reporte. Si es esto, no hay nada que
 *      arreglar y lo que hay que corregir es lo que promete la interfaz.
 *
 * Las separa un solo numero, y no es opinable: `DynamicsCompressorNode`
 * expone `reduction`, cuantos decibelios esta quitando AHORA MISMO.
 *
 * ------------------------------------------------------------------
 * POR QUE ESTE ARCHIVO NO REUTILIZA diagnostico-ecualizador.js
 * ------------------------------------------------------------------
 *
 * Aquel contesta "¿se puede ecualizar el audio de esta pagina?" y para eso
 * mide energia por bandas de frecuencia. Este contesta "¿cuanto recorta el
 * limitador y cuanto nivel se pierde por el camino?" y para eso mide dos
 * cosas que aquel no mira: `reduction` y el nivel RMS de salida.
 *
 * Son preguntas distintas con instrumentos distintos. Meterlas en el mismo
 * archivo habria hecho uno que contesta las dos a medias.
 *
 * ------------------------------------------------------------------
 * ANTES DE PEGARLO — DOS CONDICIONES, Y LA SEGUNDA NO ES OPCIONAL
 * ------------------------------------------------------------------
 *
 *   1. Una cancion sonando, y a poder ser una con pegada (bombo, bajo).
 *      Con una balada suave el limitador no tiene nada que hacer y la
 *      medida sale plana sin que eso signifique nada.
 *
 *   2. EL ECUALIZADOR DE LA EXTENSION, APAGADO, Y LA PESTAÑA RECARGADA
 *      DESPUES DE APAGARLO. `createMediaElementSource` es una puerta de un
 *      solo sentido: si la extension ya la cruzo, este script no puede
 *      volver a cruzarla y se va a negar a seguir. Apagar el ecualizador no
 *      deshace nada; hay que RECARGAR (F5).
 *
 *      Y «apagado» quiere decir «Apagado (no tocar el audio)», el primero de
 *      la lista. NO «Plano». Los dos suenan igual —los dos dejan las cinco
 *      bandas a cero— pero «Plano» monta el grafo igualmente, o sea cruza la
 *      puerta para no hacer nada. Es la unica opcion de la lista que suena
 *      como apagado sin serlo, y ya se llevo por delante un intento de
 *      medida.
 *
 * Igual que el otro diagnostico, esto va en dos partes:
 *
 *   PARTE 1 — se ejecuta sola al pegar. No toca nada.
 *   PARTE 2 — hay que pedirla escribiendo:
 *
 *                 ytmpipLimitador.medir()
 *
 *             Cruza la puerta. Al terminar, RECARGA LA PESTAÑA.
 *
 * ------------------------------------------------------------------
 * QUE VA A PASAR Y QUE HAY QUE ESCUCHAR
 * ------------------------------------------------------------------
 *
 * Son tres fases que se repiten dos veces, unos veinte segundos en total:
 *
 *   plano       los cinco filtros a cero, con limitador.
 *   graves      el preset de verdad [8, 3, 0, 0, 1], con limitador.
 *   SIN RED     el mismo preset con el limitador desactivado.
 *
 * LA TERCERA VA A SONAR MAL A PROPOSITO. Sin limitador y con +8 dB sobre
 * material que ya viene al tope, la señal se sale de la escala y recorta:
 * eso se oye como distorsion sucia en los golpes. Oirla ES el resultado —es
 * exactamente lo que el limitador esta evitando— asi que no la calles: es la
 * unica de las tres que demuestra por si sola para que sirve la red.
 *
 * Cada fase se mide DOS VECES en momentos distintos de la cancion, porque la
 * cancion cambia de volumen sola y una sola pasada no distingue "lo hizo el
 * limitador" de "llego el estribillo". Si las dos vueltas de una misma fase
 * salen muy distintas, la salida lo dice y la medida no vale: repite con
 * otro trozo de cancion.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[limitador]", "color:#5aa9f1;font-weight:bold", ...args);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  /*
   * Las lineas que hay que ver de lejos —el aviso de la puerta, los
   * veredictos— van por aqui y no por `log`.
   *
   * ESTO LO PIDIO LA CONSOLA DEL USUARIO. `log` ya gasta su propio "%c" en
   * pintar la etiqueta, y console.log solo interpreta los "%c" que van en el
   * PRIMER argumento: colar otro en el segundo no lo colorea, lo imprime tal
   * cual. En su pantalla se leyo literalmente
   *
   *     [limitador] %cLA PUERTA YA ESTABA CRUZADA. color:#f15a5a;...
   *
   * o sea que justo las lineas escritas para que no pasen desapercibidas
   * eran las mas ilegibles de la salida. Aqui la etiqueta y el texto van en
   * una sola cadena de formato, que es la unica forma de que el estilo se
   * aplique a los dos.
   */
  const destacar = (texto, color) =>
    console.log("%c[limitador] " + texto, `color:${color};font-weight:bold`);

  /* Los numeros reales del proyecto, copiados de src/shared/constants.js.
   *
   * COPIADOS A MANO Y A PROPOSITO: esto se pega en una consola que no puede
   * importar nada del proyecto. Si algun dia dejan de cuadrar, la medida
   * deja de hablar de la extension y pasa a hablar de otra cosa parecida;
   * por eso van juntos y con el nombre del archivo del que salen. */
  const BANDAS = [
    { hz: 60, tipo: "lowshelf" },
    { hz: 250, tipo: "peaking", q: 1 },
    { hz: 1000, tipo: "peaking", q: 1 },
    { hz: 4000, tipo: "peaking", q: 1 },
    { hz: 12000, tipo: "highshelf" }
  ];
  const PRESET_PLANO = [0, 0, 0, 0, 0];
  const PRESET_GRAVES = [0, 4, -6, -2, 1];
  const LIMITADOR = { UMBRAL_DB: 0, RODILLA_DB: 0, RATIO: 20, ATAQUE_S: 0.003, RELAJACION_S: 0.25 };
  /*
   * LA PREAMPLIFICACION, que antes no estaba aqui porque antes valia cero.
   * Es `-subidaDelPico`. Para el "graves" de hoy la banda mas alta es el +4
   * de 250 Hz; sus vecinas estan en 0 y en −6, o sea que ninguna esta subida
   * y no se cobra solape. Cuatro arriba, cuatro abajo. Los −6 y los −2 no
   * entran en la cuenta: bajar no puede recortar, asi que sale gratis.
   */
  const PREAMP_GRAVES_DB = -4;

  const video = Array.from(document.querySelectorAll("video")).find(
    (v) => v.readyState > 0 && !v.paused
  );

  if (!video) {
    log("No encuentro ningun <video> reproduciendo. Pon una cancion y vuelve a pegar esto.");
    return;
  }

  /* ================================================================
   * PARTE 1 — sin tocar nada
   * ================================================================ */

  log("PARTE 1: mirando sin tocar.");
  log("DRM:", video.mediaKeys ? "SI — pista cifrada" : "no");

  if (video.mediaKeys) {
    log("Con DRM el navegador entrega silencio a proposito. NO cruces la puerta.");
    return;
  }

  destacar("PARTE 2 — cruza la puerta y NO se puede deshacer.", "#e8a33d");
  log("Comprueba antes que el ecualizador de la extension esta APAGADO y que has");
  log("recargado la pestaña DESPUES de apagarlo. Si no, esto se va a negar a seguir.");
  log("Cuando lo tengas, escribe:  ytmpipLimitador.medir()");
  log("Dura unos 20 segundos. La tercera fase suena mal A PROPOSITO.");
  log("Al terminar, RECARGA LA PESTAÑA para devolver el audio a su ruta normal.");

  /* ================================================================
   * PARTE 2 — la puerta de un solo sentido
   * ================================================================ */

  /**
   * El nivel de la señal, en decibelios, medido en el dominio del TIEMPO.
   *
   * POR QUE RMS Y NO ENERGIA POR BANDAS, que es lo que mide el otro
   * diagnostico: la pregunta de aqui es "¿suena mas fuerte?", y eso es el
   * nivel de la onda entera, no como se reparte entre frecuencias. Un
   * espectro puede cambiar de forma —y cambia, para eso esta el filtro— sin
   * que el nivel se mueva un decibelio. Justamente lo que hay que averiguar.
   */
  function nivelDb(analizador, buffer) {
    analizador.getFloatTimeDomainData(buffer);
    let suma = 0;
    for (let i = 0; i < buffer.length; i++) suma += buffer[i] * buffer[i];
    const rms = Math.sqrt(suma / buffer.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  /**
   * Cuanto esta quitando el limitador, en dB (0 = nada, negativo = recorta).
   *
   * `reduction` fue un AudioParam en la especificacion vieja y es un numero
   * suelto en la nueva. Chrome lleva años con la nueva, pero leer las dos
   * formas cuesta una linea y evita que el diagnostico devuelva `undefined`
   * en un navegador que no sea el de siempre, que es el caso en el que mas
   * falta hace que sea legible.
   */
  function reduccionDe(limitador) {
    const r = limitador.reduction;
    return typeof r === "number" ? r : r && typeof r.value === "number" ? r.value : NaN;
  }

  function media(lista) {
    const buenos = lista.filter(Number.isFinite);
    if (!buenos.length) return NaN;
    return buenos.reduce((a, b) => a + b, 0) / buenos.length;
  }

  const db = (n) => (Number.isFinite(n) ? n.toFixed(1) + " dB" : "sin señal");

  async function medir() {
    let ctx;
    let fuente;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      fuente = ctx.createMediaElementSource(video);
    } catch (err) {
      /*
       * El contexto SI se creo —lo que fallo es la linea siguiente—, asi que
       * hay que cerrarlo. Chrome no deja tener muchos AudioContext vivos por
       * pagina, y quien vea este aviso va a reintentar: dejando uno colgado
       * en cada intento, al sexto el fallo cambia y ya no habla de la puerta.
       */
      if (ctx) ctx.close();

      if (err && err.name === "InvalidStateError") {
        destacar("LA PUERTA YA ESTABA CRUZADA.", "#f15a5a");
        log("Alguien ya metio este <video> en un AudioContext: casi seguro la propia");
        log("extension. No ha corrido ninguna fase, no hay nada medido.");
        log("");
        log("OJO CON LA TRAMPA: en la lista de opciones, «Plano» NO es «Apagado».");
        log("«Plano» monta el grafo con las cinco bandas a cero —cruza la puerta");
        log("para no hacer nada—; solo «Apagado (no tocar el audio)» no la cruza.");
        log("Elige ese, RECARGA la pestaña (apagar no deshace nada) y vuelve a pegar esto.");
        return;
      }
      log("No se pudo cruzar la puerta:", err);
      return;
    }

    /* La misma cadena que monta src/content/audio-grafo.js, en el mismo
     * orden: fuente -> entrada -> cinco filtros -> toma -> limitador -> destino.
     * El analizador cuelga DEL LIMITADOR, o sea del final del todo, porque lo
     * que se quiere medir es lo que llega al altavoz. (En la extension cuelga
     * de `toma`, antes del limitador, y eso es correcto ALLI por otro motivo:
     * el espectro tiene que dibujar lo que hacen los filtros, no lo que el
     * limitador les quita.) */
    const entrada = ctx.createGain();
    entrada.gain.value = 1;
    fuente.connect(entrada);

    const filtros = BANDAS.map((banda) => {
      const f = ctx.createBiquadFilter();
      f.type = banda.tipo;
      f.frequency.value = banda.hz;
      if (typeof banda.q === "number") f.Q.value = banda.q;
      f.gain.value = 0;
      return f;
    });

    let anterior = entrada;
    for (const f of filtros) {
      anterior.connect(f);
      anterior = f;
    }

    const toma = ctx.createGain();
    toma.gain.value = 1;
    anterior.connect(toma);

    const limitador = ctx.createDynamicsCompressor();
    toma.connect(limitador);
    limitador.connect(ctx.destination);

    const analizador = ctx.createAnalyser();
    analizador.fftSize = 2048;
    limitador.connect(analizador);
    const ondas = new Float32Array(analizador.fftSize);

    if (ctx.state === "suspended") await ctx.resume();

    function ponerFase(fase) {
      /* La entrada va con los filtros y no aparte: en la extension los dos
       * salen del mismo `plan`, y separarlos aqui permitiria medir una
       * combinacion que alli no puede existir. */
      entrada.gain.value = Math.pow(10, fase.preamp / 20);
      filtros.forEach((f, i) => {
        f.gain.value = fase.ganancias[i];
      });

      limitador.threshold.value = LIMITADOR.UMBRAL_DB;
      limitador.knee.value = LIMITADOR.RODILLA_DB;
      limitador.ratio.value = LIMITADOR.RATIO;
      limitador.attack.value = LIMITADOR.ATAQUE_S;
      limitador.release.value = LIMITADOR.RELAJACION_S;
    }

    /*
     * LAS TRES FASES CAMBIARON DE PREGUNTA, y conviene saber por que porque
     * la version anterior de este archivo medira otra cosa.
     *
     * Antes eran plano / graves / graves-sin-limitador, y contestaban «¿el
     * limitador se esta comiendo el realce?». Contestaron que si: trabajaba
     * el 100 % del tiempo. Esa pregunta ya esta contestada y arreglada.
     *
     * La de ahora es la de despues: «¿el arreglo funciono?». Y para eso la
     * tercera fase no es quitar la red —con la entrada ya bajada casi no hay
     * nada que atrapar, o sea que no enseñaria nada— sino quitar la
     * PREAMPLIFICACION, que es lo que se acaba de poner. Reproduce el estado
     * anterior, el que el usuario oyo y rechazo, para poder compararlo en la
     * misma cancion y con el mismo instrumento.
     *
     * Se espera: en las dos primeras el limitador casi mudo (es una red y no
     * hay nada que atrapar); en la tercera, trabajando sin parar.
     */
    const FASES = [
      { nombre: "plano", ganancias: PRESET_PLANO, preamp: 0 },
      { nombre: "graves", ganancias: PRESET_GRAVES, preamp: PREAMP_GRAVES_DB },
      { nombre: "SIN PREAMPLIFICAR", ganancias: PRESET_GRAVES, preamp: 0 }
    ];
    const VUELTAS = 2;
    const MUESTRAS = 60;
    const CADA_MS = 50;

    const resultados = FASES.map(() => []);

    log("Empezando. No toques nada durante unos 20 segundos.");

    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      for (let i = 0; i < FASES.length; i++) {
        const fase = FASES[i];
        ponerFase(fase);

        /* Medio segundo de cortesia antes de empezar a contar.
         *
         * El limitador tiene 250 ms de relajacion: justo despues de cambiar
         * los filtros sigue arrastrando la reduccion del ajuste anterior.
         * Contar esas muestras seria atribuirle a esta fase el trabajo de la
         * fase de antes. */
        await esperar(500);

        const niveles = [];
        const reducciones = [];
        for (let m = 0; m < MUESTRAS; m++) {
          await esperar(CADA_MS);
          niveles.push(nivelDb(analizador, ondas));
          reducciones.push(reduccionDe(limitador));
        }

        const rs = reducciones.filter(Number.isFinite);
        resultados[i].push({
          nivel: media(niveles),
          reduccionMedia: media(reducciones),
          reduccionPico: rs.length ? Math.min(...rs) : NaN,
          // Cuanto rato esta trabajando, no solo cuanto quita cuando trabaja.
          // Un limitador que quita 6 dB el 2 % del tiempo es una red; uno que
          // quita 2 dB el 90 % del tiempo es un control de volumen.
          porcentajeActivo: rs.length
            ? Math.round((rs.filter((r) => r < -0.5).length / rs.length) * 100)
            : NaN
        });

        log(
          `vuelta ${vuelta + 1} — ${fase.nombre}: nivel ${db(
            resultados[i][vuelta].nivel
          )}, recorta ${db(resultados[i][vuelta].reduccionMedia)} de media, ` +
            `pico ${db(resultados[i][vuelta].reduccionPico)}, ` +
            `activo el ${resultados[i][vuelta].porcentajeActivo} % del tiempo`
        );
      }
    }

    /* Se deja en plano: si el usuario tarda en recargar, que no se quede
     * escuchando la ultima fase, que es a proposito la mala. */
    ponerFase(FASES[0]);

    /* ---------------- el veredicto ---------------- */

    const resumen = FASES.map((fase, i) => {
      const vueltas = resultados[i];
      return {
        nombre: fase.nombre,
        nivel: media(vueltas.map((v) => v.nivel)),
        reduccion: media(vueltas.map((v) => v.reduccionMedia)),
        activo: media(vueltas.map((v) => v.porcentajeActivo)),
        /*
         * DOS dispersiones, una por cada cosa que se mide, y no una sola.
         *
         * ESTO LO PIDIERON TRES MEDIDAS TIRADAS A LA BASURA. Habia una sola
         * dispersion —la del nivel— y anulaba el veredicto ENTERO. Pero el
         * veredicto no se apoya en el nivel: se apoya en `activo`, que es lo
         * que el limitador declara sobre su propio trabajo. En las tres
         * tandas el nivel bailo hasta 9 dB con la cancion mientras `activo`
         * en graves se quedaba clavado en 85-100 % en las seis vueltas y en
         * tres generos distintos. O sea que el numero que decidia estaba
         * limpio y lo tapaba el ruido de otro.
         *
         * Cada conclusion se vigila con el ruido del numero en el que se
         * apoya. Mezclarlos era tirar la buena por culpa de la mala.
         */
        dispersion: Math.abs(vueltas[0].nivel - vueltas[1].nivel),
        dispersionActivo: Math.abs(vueltas[0].porcentajeActivo - vueltas[1].porcentajeActivo)
      };
    });

    console.table(
      resumen.map((r) => ({
        fase: r.nombre,
        "nivel de salida": db(r.nivel),
        "recorte medio": db(r.reduccion),
        "% del tiempo recortando": Number.isFinite(r.activo) ? Math.round(r.activo) + " %" : "?",
        "vueltas: dif. de nivel": db(r.dispersion),
        "vueltas: dif. de %": Number.isFinite(r.dispersionActivo) ? r.dispersionActivo + " %" : "?"
      }))
    );

    const plano = resumen[0];
    const graves = resumen[1];
    const sinPreamp = resumen[2];
    const subida = graves.nivel - plano.nivel;
    const loQueCuesta = plano.nivel - graves.nivel;
    const ruidoNivel = Math.max(plano.dispersion, graves.dispersion);

    /* ---- primero el veredicto, que se apoya en `activo` ---- */

    log("---");

    if (Number.isFinite(graves.dispersionActivo) && graves.dispersionActivo > 25) {
      destacar("EL VEREDICTO NO VALE.", "#f15a5a");
      log(
        `Las dos vueltas de "graves" no se parecen: el limitador trabajo el ` +
          `${graves.dispersionActivo} % del tiempo mas en una que en otra. Repite.`
      );
    } else if (Number.isFinite(graves.activo) && graves.activo > 50) {
      destacar("EL ARREGLO NO LLEGO: el limitador sigue trabajando sin parar.", "#f15a5a");
      log(
        `Con el preset y su preamplificacion puesta trabaja el ${Math.round(graves.activo)} % ` +
          `del tiempo y recorta ${db(graves.reduccion)} de media. Con la entrada ya bajada ` +
          "no deberia tener casi nada que atrapar."
      );
      log("O la preamplificacion no esta llegando al grafo, o se esta quedando corta:");
      log("compara con la fila SIN PREAMPLIFICAR, que es el estado anterior. Si las dos");
      log("filas se parecen, la entrada no esta bajando y hay que mirar audio-grafo.js.");
    } else if (Number.isFinite(graves.activo) && graves.activo < 20) {
      destacar("EL ARREGLO LLEGO: el limitador ha vuelto a ser una red.", "#4caf50");
      log(
        `Solo recorta el ${Math.round(graves.activo)} % del tiempo. La entrada baja ` +
          `${Math.abs(PREAMP_GRAVES_DB)} dB por delante, asi que al limitador ya no le ` +
          "llega nada que aplastar y solo esta ahi por si acaso, que es su trabajo."
      );
      log(`Lo que cuesta: la fase "graves" suena ${db(loQueCuesta)} mas floja que "plano".`);
      log("Eso NO es un fallo: es lo que vale anadir graves a musica que ya viene al tope.");
    } else {
      destacar("EN TIERRA DE NADIE.", "#e8a33d");
      log("Ni trabaja tanto como antes ni tan poco como para darlo por cerrado.");
      log("Mira la tabla y repitelo con una cancion de mas pegada.");
    }

    /*
     * LA FILA QUE DEMUESTRA QUE EL INSTRUMENTO NO MIENTE. Si "SIN
     * PREAMPLIFICAR" no sale trabajando mucho mas que "graves", entonces la
     * medida no esta distinguiendo las dos cosas y el veredicto de arriba no
     * vale aunque haya salido verde: podria estar diciendo "casi no trabaja"
     * porque la cancion venia floja, no porque el arreglo funcione.
     *
     * Es la misma idea que tenia la fase "SIN RED" en la version anterior:
     * una fase que se sabe COMO tiene que salir, para poder desconfiar del
     * resto si sale de otra forma.
     */
    log("---");
    if (Number.isFinite(sinPreamp.activo) && Number.isFinite(graves.activo)) {
      if (sinPreamp.activo > graves.activo + 25) {
        log(
          `Contraste: sin preamplificar, el limitador trabaja el ` +
            `${Math.round(sinPreamp.activo)} % del tiempo frente al ` +
            `${Math.round(graves.activo)} % de ahora. Eso es lo que se quito de encima.`
        );
      } else {
        destacar("CUIDADO: las dos fases de graves salen casi iguales.", "#e8a33d");
        log("La medida no esta distinguiendo con preamplificacion de sin ella, asi que el");
        log("veredicto de arriba no vale aunque haya salido bien. Repite con otra cancion.");
      }
    }

    /*
     * "Plano" son los cinco filtros a cero y la entrada sin tocar: por ahi no
     * pasa nada que no estuviera ya en la cancion. Si AUN ASI el limitador
     * trabaja, el umbral esta puesto respecto a una holgura que no existe.
     * Esto es lo que delato el fallo la primera vez y por eso se sigue
     * mirando: elegir "Plano" y que te comprima es lo contrario de lo que
     * promete la palabra.
     */
    if (Number.isFinite(plano.dispersionActivo) && plano.dispersionActivo <= 25) {
      if (plano.activo > 50) {
        destacar("Y ADEMAS: con las cinco bandas a CERO el limitador tambien trabaja.", "#e8a33d");
        log(
          `El ${Math.round(plano.activo)} % del tiempo, recortando ${db(plano.reduccion)}. ` +
            "Ahi no hay realce ninguno: el umbral esta por debajo de la cancion."
        );
      }
    } else {
      log(`("Plano" no se puede juzgar: sus dos vueltas se llevan ${plano.dispersionActivo} %.)`);
    }

    /* ---- y aparte lo que se apoya en el nivel, que es lo ruidoso ---- */

    log("---");
    if (Number.isFinite(ruidoNivel) && ruidoNivel > Math.abs(subida)) {
      log(
        `La comparacion de VOLUMEN no vale: la cancion se movio ${db(ruidoNivel)} sola, ` +
          `mas que los ${db(subida)} que se estan midiendo. Los numeros de nivel, ignoralos.`
      );
      return;
    }
    log(`Subir los graves cambia el nivel en ${db(subida)}.`);
    log(`El limitador se esta comiendo ${db(loQueSeCome)} frente a no tener red.`);
  }

  window.ytmpipLimitador = { medir };
})();
