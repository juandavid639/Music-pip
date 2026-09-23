/*
 * El registro de adaptadores: el contrato que cualquier sitio debe firmar.
 *
 * Hasta ahora la extension conocia un solo sitio (YouTube Music) y el
 * adaptador se autoproclamaba YTMPip.Adapter al cargar. Para sumar sitios
 * (YouTube normal, Spotify) hacia falta nombrar la interfaz que hasta hoy
 * era implicita: los 37 metodos que el resto de modulos llama sin saber
 * en que pagina estan.
 *
 * Este modulo NO sabe nada de ningun sitio. Solo tres cosas:
 *
 * 1. EL CONTRATO: la lista de metodos que un adaptador debe implementar
 *    (todos, aunque el sitio no tenga la funcion: mejor un metodo que
 *    devuelve null que un TypeError en mitad del bucle de estado) y la
 *    lista de capacidades que debe declarar.
 *
 * 2. LAS CAPACIDADES: booleanos que dicen que TIENE el sitio, no que
 *    devuelve el DOM en este instante. La distincion importa: en YouTube
 *    Music getRepeatButton() puede devolver null un momento porque la
 *    barra aun no pinto, pero el sitio TIENE repetir. En Spotify el sitio
 *    directamente no permitira tocar el audio (Widevine: conectar un
 *    <video> con DRM a createMediaElementSource SILENCIA el sonido), y
 *    eso no se descubre mirando el DOM: se declara aqui, de antemano,
 *    con `audioGrafo: false`.
 *
 * 3. LA ELECCION: al registrarse un adaptador se relee location.hostname
 *    y gana el primero registrado cuyo hostnames lo contenga; si ninguno
 *    coincide, queda el primero registrado (asi los entornos de prueba y
 *    cualquier contexto raro siguen teniendo adaptador). El elegido se
 *    publica como YTMPip.Adapter —el nombre que todos los consumidores
 *    ya usan, que por eso no cambio— y sus capacidades como
 *    YTMPip.Capacidades.
 *
 * La validacion de registrar() es deliberadamente estricta y revienta
 * con Error: un adaptador a medio escribir debe morir al cargar la
 * extension, en la cara del desarrollador, no en produccion cuando el
 * orquestador llame al metodo numero 29 y no exista.
 */
(function (root) {
  const YTMPip = root.YTMPip;

  /*
   * Los 42 metodos del contrato: 36 contados sobre el adaptador de
   * YouTube Music al momento de firmarlo, mas isPagePlaying(), que entro
   * en la tanda 3 porque Spotify no tiene <video> ni <audio> en el DOM y
   * "esta sonando" solo se puede leer de la pagina, mas
   * getActiveLyricsLineIndex(), que entro con la letra sincronizada de
   * Spotify: alli las lineas no traen tiempos y la que se canta la marca
   * LA PAGINA (una clase que solo lleva una linea), asi que el indice
   * hay que preguntarselo al sitio, mas getCanvasVideo(), que entro con
   * el fondo Canvas: el bucle visual mudo de Spotify (sin DRM, medido)
   * que la ventana usa de fondo via captureStream, mas el trio de
   * ESCRITURA EN LA PAGINA (seekPageTo, setPageVolume, getPageVolume):
   * en Spotify los saltos y el volumen no tienen <video> sobre el que
   * escribir, pero sus deslizadores ACEPTAN la escritura sintetica
   * (setter nativo + evento input, medido 2026-09-16 con salto y subida
   * de volumen AUDIBLES). Si un consumidor nuevo empieza a llamar un
   * metodo nuevo, tiene que entrar AQUI ademas de en cada adaptador: la
   * prueba de contrato compara esta lista contra los adaptadores
   * registrados y delata al que se quede corto.
   */
  const METODOS_DEL_CONTRATO = [
    // El reproductor y el <video> (incluido el mecanismo de prestamo del PiP)
    "getPlayerBar",
    "isValidPlayerBar",
    "setBorrowedMedia",
    "getPageMediaElement",
    "getReplacementFor",
    "getMediaElement",
    "getPlayerContainer",
    // El Canvas: el bucle VISUAL del sitio (no es la musica), si lo hay
    "getCanvasVideo",
    // Controles de transporte
    "getPlayPauseButton",
    "getNextButton",
    "getPreviousButton",
    // Metadatos de la pista
    "getTitleElement",
    "getSubtitleElement",
    "getArtworkElement",
    // La linea de tiempo segun LA PAGINA (el <video> de YTM acumula la cola)
    "getProgressBarElement",
    "getTimeInfoElement",
    "getPageTrackTime",
    "isPagePlaying",
    /*
     * Escritura EN LA PAGINA, para cuando el medio no esta en el DOM.
     * Los dos escritores contestan si pudieron; llamados SIN valor son
     * la sonda ("¿hay donde escribir?") y no tocan nada. El lector
     * existe porque el deslizador de la ventana pinta state.volume, y
     * sin medio ese numero tiene que salir de la pagina o es un invento.
     */
    "seekPageTo",
    "setPageVolume",
    "getPageVolume",
    // Letras del propio sitio
    "getLyricsTab",
    "isLyricsTabDisabled",
    "getTabRenderer",
    "getLyricsTextElement",
    "getLyricsSourceElement",
    "getLyricsMessageElement",
    "getActiveLyricsLineIndex",
    // Letras de la extension Better Lyrics, si convive
    "getBetterLyricsContainer",
    "getBetterLyricsLines",
    "getBetterLyricsSourceName",
    // Valoracion y modos
    "getLikeButton",
    "getDislikeButton",
    "getLikeStatus",
    "getRepeatButton",
    "getShuffleButton",
    "isToggleActive",
    "getRepeatMode",
    // La cola de reproduccion
    "getQueueItems",
    "getQueueItemTitleElement",
    "getQueueItemBylineElement",
    "isQueueItemSelected"
  ];

  /*
   * Las ocho capacidades. Todas obligatorias y todas booleanas: un
   * adaptador no puede callarse una (se le olvido pensar en ella) ni
   * inventarse otra (probablemente un error de tecleo que nadie leeria).
   *
   * `medioEscribible` entro cuando la ventana empezo a CONSUMIR las
   * capacidades: ninguna de las siete originales decia si el volumen, el
   * silencio, la velocidad y los saltos tienen sobre que escribir.
   * audioGrafo no lo dice (es Web Audio, no escrituras) y videoPrestable
   * tampoco (es el prestamo visual). En Spotify el audio no esta en el
   * DOM y esos cuatro mandos escriben sobre un elemento que no existe.
   */
  const CAPACIDADES_DEL_CONTRATO = [
    "letras", // el sitio trae panel de letras propio
    "cola", // hay lista de "a continuacion" legible
    "repetir", // existe el boton y su modo se puede leer
    "aleatorio", // existe el boton de reproduccion aleatoria
    "meGusta", // valoracion me gusta / no me gusta
    "medioEscribible", // hay <video>/<audio> sobre el que escribir volumen/velocidad/saltos
    "videoPrestable", // el <video> se puede prestar a la ventana PiP
    "audioGrafo" // el audio ADMITE Web Audio (false con DRM: se silenciaria)
  ];

  const registrados = [];
  let activo = null;

  function fallo(mensaje) {
    throw new Error("YTMPip.Adaptadores.registrar: " + mensaje);
  }

  function validar(def) {
    if (!def || typeof def !== "object") fallo("falta la definicion del adaptador");
    if (typeof def.id !== "string" || !def.id) fallo("falta el id");
    if (registrados.some((r) => r.id === def.id)) fallo("id duplicado: " + def.id);

    /*
     * El nombre HUMANO del sitio ("Spotify", no "spotify"): lo consume la
     * ventana para rotulos como «Volver a Spotify». Entro cuando se vio el
     * boton diciendo «Volver a YouTube Music» sobre Spotify: el rotulo
     * estaba escrito a mano y nadie declaraba como se llama cada sitio.
     */
    if (typeof def.nombre !== "string" || !def.nombre) {
      fallo("«" + def.id + "» no declara nombre (el rotulo humano del sitio)");
    }

    if (!Array.isArray(def.hostnames) || def.hostnames.length === 0) {
      fallo("«" + def.id + "» no declara hostnames");
    }
    def.hostnames.forEach((h) => {
      if (typeof h !== "string" || !h) fallo("«" + def.id + "» tiene un hostname invalido");
    });

    if (!def.capacidades || typeof def.capacidades !== "object") {
      fallo("«" + def.id + "» no declara capacidades");
    }
    CAPACIDADES_DEL_CONTRATO.forEach((cap) => {
      if (typeof def.capacidades[cap] !== "boolean") {
        fallo("«" + def.id + "» no declara la capacidad «" + cap + "» como booleano");
      }
    });
    Object.keys(def.capacidades).forEach((cap) => {
      if (CAPACIDADES_DEL_CONTRATO.indexOf(cap) === -1) {
        fallo("«" + def.id + "» declara una capacidad desconocida: «" + cap + "»");
      }
    });

    if (!def.adapter || typeof def.adapter !== "object") {
      fallo("«" + def.id + "» no trae el adaptador");
    }
    METODOS_DEL_CONTRATO.forEach((metodo) => {
      if (typeof def.adapter[metodo] !== "function") {
        fallo("«" + def.id + "» no implementa " + metodo + "()");
      }
    });
    if (def.adapter.schemaVersion === undefined) fallo("«" + def.id + "» no trae schemaVersion");
    if (!def.adapter.SELECTORS || typeof def.adapter.SELECTORS !== "object") {
      fallo("«" + def.id + "» no trae SELECTORS");
    }
  }

  /** El registrado que atiende ese hostname, o el primero como red. */
  function elegir(hostname) {
    const porHost = registrados.find((def) => def.hostnames.indexOf(hostname) !== -1);
    return porHost || registrados[0] || null;
  }

  /*
   * Se reelige en CADA registro y no solo al final porque no hay "final":
   * los content scripts cargan en el orden del manifest y nadie avisa
   * cuando termino el ultimo. Reelegir es barato y deja el registro
   * siempre coherente: con un solo adaptador registrado, ese; en cuanto
   * aparece uno que coincide con el hostname real, ese.
   */
  function reelegir() {
    const hostname = (root.location && root.location.hostname) || "";
    activo = elegir(hostname);
    if (!activo) return;
    YTMPip.Adapter = activo.adapter;
    YTMPip.Capacidades = activo.capacidades;
  }

  YTMPip.Adaptadores = {
    METODOS_DEL_CONTRATO,
    CAPACIDADES_DEL_CONTRATO,

    registrar(def) {
      validar(def);
      registrados.push(def);
      reelegir();
      return def;
    },

    elegir,

    activo() {
      return activo;
    },

    registradosIds() {
      return registrados.map((def) => def.id);
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
