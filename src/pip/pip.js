/*
 * IMPORTANTE: este archivo se inyecta como content script mas (no se
 * carga con <script src> dentro de la ventana PiP). La API
 * documentPictureInPicture crea una ventana nueva cuyo document se
 * manipula por DOM desde el contexto que la abrio; un <script> cargado
 * DENTRO de esa ventana correria en un realm sin acceso a chrome.runtime.
 * Por eso pip.js vive en el mundo aislado de la pestaña de YouTube Music
 * (igual que content-script.js) y construye/actualiza el document de la
 * ventana PiP de forma directa.
 *
 * Fallback: si documentPictureInPicture no esta disponible, se pide al
 * service worker abrir una ventana emergente normal (chrome.windows.create)
 * reutilizando popup.html como interfaz alternativa.
 */
(function (root) {
  const YTMPip = root.YTMPip;
  const { MESSAGE_TYPES, COMMAND_TYPES, createCommand, createMessage, sendMessageSafe, getURLSafe } = YTMPip;
  const { PIP_DIMENSIONS, PIP_BREAKPOINTS, LYRICS_STATUS, LIKE_STATUS, SPECTRUM_LIMITS, PLAYBACK_RATES, PLAYBACK_RATE_NORMAL, SLEEP_TIMER_MINUTES } =
    YTMPip.CONSTANTS;

  /*
   * shared/iconos.js, o un doble que no hace nada.
   *
   * NO ES UN "POR SI ACASO". pip.html deja el emoji escrito detras de cada
   * `data-ico`, y ahi mismo esta escrito para que sirve: para que un fallo
   * al cargar los iconos se quede en "los botones vuelven a los emoji de
   * antes". Sin esta red esa promesa seria mentira, porque la primera
   * llamada reventaria cacheElements y no habria ventana en la que ver el
   * emoji: se pasaria de un dibujo distinto a ninguna ventana.
   *
   * Un dibujo es decoracion. Nada de lo que hay aqui debe impedir abrir.
   */
  const Iconos = YTMPip.Iconos || iconosDeMentira();

  /*
   * shared/textos.js, con la misma red que los iconos y por lo mismo: un
   * texto en otro idioma es informacion, pero ninguna frase debe impedir
   * abrir la ventana. Sin el modulo, t() devuelve la clave pelada, que se
   * ve fea A PROPOSITO: una etiqueta que dice "sin_reproduccion" delata el
   * hueco; una vacia seria un boton mudo que nadie sabria arreglar.
   */
  const t = (clave, subs) => (YTMPip.Textos ? YTMPip.Textos.t(clave, subs) : clave);

  /*
   * El nombre de un preset para una persona, pasando por el catalogo.
   * EQUALIZER_PRESET_LABELS sigue siendo la verdad en español y aqui hace
   * de respaldo: si la clave preset_<nombre> no resuelve (catalogo roto,
   * contexto invalidado sin cache), se sirve la etiqueta de la constante
   * antes que una clave pelada, porque esta si existe siempre.
   */
  function etiquetaPreset(preset) {
    const clave = "preset_" + preset;
    const texto = t(clave);
    return texto === clave ? YTMPip.CONSTANTS.EQUALIZER_PRESET_LABELS[preset] || preset : texto;
  }

  /** Lo mismo para el nombre de una banda; la constante respalda. */
  function etiquetaBanda(banda) {
    const clave = "banda_" + banda.id;
    const texto = t(clave);
    return texto === clave ? banda.etiqueta : texto;
  }

  function iconosDeMentira() {
    // Avisa una vez, al montar: en una instalacion sana esto no ocurre
    // nunca, asi que si ocurre hay que verlo y no que pase en silencio.
    console.warn("[YTMPip] falta shared/iconos.js: los botones se quedan con los emoji");
    return {
      poner: function () {
        return false;
      },
      pintarTodos: function () {
        return 0;
      }
    };
  }

  let pipWindow = null;
  let els = {};
  let expanded = false;
  let lastState = null;
  let degraded = false;
  let unsubscribeSettings = function noop() {};

  // Espera antes de anotar el tamaño de la ventana (ver anotarTamanoPronto).
  let anotarTamanoTimer = null;

  // Cuenta atras para desvanecer los mandos (ver despertarMandos).
  let quietoTimer = null;

  // Video prestado a la ventana flotante (ver borrowVideo/returnVideo).
  let borrowedVideo = null;
  let videoOrigin = null;
  let videoMode = false;

  /*
   * La ventana se agranda sola UNA sola vez, al aparecer el primer video.
   * A partir de ahi manda el usuario: si la coloca a un tamaño, la
   * extension no se lo cambia por detras. Lo que se adapta es el
   * contenido, no la ventana.
   */
  let autoSizedForVideo = false;

  /*
   * "Enseñame la caratula aunque esta cancion tenga video", pedido con el
   * boton de la cabecera. Es una preferencia de ESTA ventana y de este
   * rato: no se guarda en storage, porque la de storage
   * (videoPreference) es la respuesta a otra pregunta —"quiero video en
   * general"— y pisarla desde aqui convertiria un capricho de una cancion
   * en un ajuste permanente que el usuario no recordaria haber tocado.
   *
   * Aguanta entre canciones a proposito, igual que lyricsClosedByUser: si
   * se reiniciara en cada pista, la siguiente con video le devolveria el
   * video en la cara y tendria que volver a pulsar.
   */
  let coverPorPeticion = false;

  /*
   * El gemelo del anterior para las canciones SIN video: "quita la
   * caratula y dame la letra en grande sobre ella". La portada no se
   * pierde, pasa a ser el fondo difuminado que ya existia.
   *
   * Va aparte de coverPorPeticion en vez de compartir un flag porque son
   * dos elecciones distintas sobre dos canciones distintas: quien pidio
   * caratula en un videoclip no ha dicho nada sobre que quiere ver en la
   * siguiente cancion, que a lo mejor ni tiene video.
   */
  let letraOcupaEscenario = false;

  /*
   * Que ofrece la cancion de turno: "video", "letra" o nada. Lo escribe
   * pintarBotonDeEscenario y lo lee el manejador del clic, para que el
   * "que hay entre lo que elegir" se decida en un solo sitio.
   */
  let rolDelEscenario = null;

  /*
   * "Solo la imagen": sin titulo, artista, album ni letra bajo el titulo.
   * Pedido a mano con el boton Aa.
   *
   * Es una pregunta DISTINTA de la del boton anterior. Aquel decide QUE
   * ocupa el escenario (video, caratula o letra); este decide si ademas se
   * ve el texto. Compartir un flag entre las dos obligaria a inventar
   * combinaciones que nadie ha pedido, asi que van separadas igual que
   * coverPorPeticion y letraOcupaEscenario.
   */
  let soloCaratula = false;

  /*
   * El fondo Canvas. `canvasStream` es el chorro capturado del bucle
   * visual de la pagina y `canvasCapturado` el elemento del que salio:
   * se guarda el ELEMENTO para saber cuando recapturar (cancion nueva =
   * Canvas nuevo en el DOM) sin volver a capturar el mismo en cada
   * refresco de estado.
   */
  let canvasStream = null;
  let canvasCapturado = null;

  /*
   * Espectro. `espectroPedido` es lo que quiere el usuario y
   * `espectroDisponible` lo que permite la pista: con audio cifrado no hay
   * nada que medir. El boton solo aparece cuando las dos cosas pueden
   * cumplirse, para no ofrecer lo que no se puede dar.
   */
  let espectroPedido = false;
  let espectroDisponible = false;

  /*
   * El pulso de la caratula. Comparte `espectroDisponible` —los dos
   * dependen de poder capturar el audio— pero tiene su propio interruptor:
   * son dos cosas que se quieren por separado.
   */
  let pulsoPedido = false;
  /*
   * Lo que el usuario PIDE y lo que se esta HACIENDO son dos cosas, igual
   * que `espectroPedido` y `espectroDisponible`. El pulso se apaga solo con
   * la letra en grande, porque entonces no hay escenario a la vista y no hay
   * nada que hacer latir. Con video NO se apaga: late el video.
   *
   * Que sean dos variables sigue siendo lo que permite apagar el EFECTO sin
   * apagar el BOTON: la preferencia del usuario no cambia porque la cancion
   * de turno tape el escenario.
   */
  let pulsoActivo = false;

  /*
   * El halo de luz. `haloEncendido` y `haloModoLatido` son la COPIA LOCAL
   * de lo que dijo applySettings la ultima vez, no una segunda fuente:
   * sincronizarEspectro corre en cada render y leer aqui Settings.get()
   * seria pisar la trampa documentada del suscriptor de storage (la cache
   * puede ir por detras del settings que llega por parametro). Arrancan
   * en falso a proposito: hasta que applySettings hable, no se conecta
   * nada por el halo.
   *
   * `haloLate` es al halo lo que `pulsoActivo` al pulso: lo que de verdad
   * esta pasando, no lo que se pidio.
   *
   * `gestoEnSesion`: el AudioContext nace suspendido si no lo pide un
   * gesto del usuario (la regla escrita junto al boton del pulso). El
   * modo latido es una PREFERENCIA guardada, asi que al abrir la ventana
   * no hay gesto que valga: conectar solos daria un golpe plano leido de
   * un contexto suspendido. El halo con latido guardado sale FIJO y
   * empieza a latir con el primer clic que conecte el audio (el suyo, el
   * del pulso o el del espectro), que son los tres que encienden esto.
   */
  let haloEncendido = false;
  let haloModoLatido = false;
  let haloLate = false;
  let gestoEnSesion = false;
  /*
   * Si el color del halo sigue a la fuente (haloColor === "source"). Es la
   * copia en variable de modulo de un ajuste, como las dos de arriba, y
   * existe por lo mismo: quien pinta el color muestreado (el tic del
   * muestreo, el onload de la sonda de portada) corre en momentos en los
   * que no tiene un `settings` a mano, y leer la cache alli seria correcto
   * hoy y una trampa el dia que alguien lo llame desde un suscriptor de
   * storage. La escribe sincronizarHalo, que es quien recibe los settings.
   */
  let haloSigueLaFuente = false;

  /*
   * UN SOLO rAF PARA LOS DOS. Antes esta variable se llamaba
   * `espectroFrame` y la cadena la mantenia viva el propio dibujado. Con dos
   * efectos serian dos cadenas compitiendo, cada una llamando a
   * requestAnimationFrame por su cuenta y ninguna sabiendo de la otra: el
   * doble de trabajo cuando estan los dos encendidos, y dos sitios de los
   * que acordarse al cerrar la ventana. La cadena es una y dentro se hace lo
   * que este pedido.
   */
  let animacionFrame = null;

  /* ------------------------------------------------------------------
   * El color que sale de lo que se esta viendo (modo "source")
   *
   * Dos colores y no uno, y esa es toda la idea: `objetivo` es lo ultimo
   * que se ha leido de la fuente y `actual` es lo que se esta pintando,
   * que va persiguiendo al otro. Con una sola variable el espectro daria
   * un salto de color cada 400 ms —el tono se mueve 13 grados en el peor
   * caso medido— y se veria como un parpadeo.
   *
   * Los dos son `{h, s, l}` o `null`, y ese `null` significa "no hay color
   * que valga": o la fuente todavia no ha dado ninguno, o lo dio y no
   * llegaba al minimo de imagen coloreada. Se traduce en volver al acento
   * del tema, que es lo que hace `dibujarEspectro` cuando no recibe color.
   * ------------------------------------------------------------------ */
  const MODO_FUENTE = "source";
  const SOURCE_COLOR = SPECTRUM_LIMITS.SOURCE_COLOR;
  let colorFuenteObjetivo = null;
  let colorFuenteActual = null;
  // El temporizador propio del muestreo. NO va en el bucle de pintado:
  // leer un fotograma cuesta el 28 % de uno de animacion (ver SOURCE_COLOR).
  let muestreoFuenteTimer = null;
  // El instante del ultimo fotograma pintado con este color, para que el
  // suavizado sepa cuanto tiempo ha pasado de verdad.
  let colorFuenteMs = 0;
  // El lienzo de 16x16 donde se copia la fuente. Uno solo, reutilizado: se
  // crea a la primera y vive lo que viva el content script.
  let lienzoFuente = null;
  // La portada ya sondeada, para no volver a descargarla en cada tic. Una
  // portada solo cambia al cambiar de cancion.
  let portadaSondeada = "";
  /*
   * FUENTES QUE NO SE DEJAN LEER. `getImageData` sobre un lienzo manchado
   * lanza SecurityError, y no es un fallo pasajero: si el video viene
   * cifrado o la portada no trae cabeceras CORS, va a lanzar SIEMPRE. Sin
   * esta anotacion se reintentaria dos veces y media por segundo para
   * siempre, llenando la consola de la misma excepcion.
   *
   * Son dos anotaciones y no una porque son dos permisos distintos: que un
   * videoclip venga protegido no dice nada de la portada del disco.
   */
  const fuenteVetada = { video: false, portada: false };

  // Mientras el usuario arrastra, render() no debe pisar el valor.
  let seeking = false;
  let changingVolume = false;

  let lastSongKey = "";

  /*
   * Letra sincronizada. Las lineas se pintan una vez por cancion
   * (lyricLineEls, con su firma para no reconstruir en cada render) y un
   * temporizador de la propia ventana va marcando cual suena
   * (activeLyricIndex). El temporizador vive en pipWindow a proposito:
   * muere solo cuando la ventana se cierra.
   */
  let lyricLineEls = []; // [{ el, time }]
  let lyricsSignature = "";
  let activeLyricIndex = -1;
  let lyricsTimer = null;
  /*
   * La SEGUNDA fuente de sincronia: el indice que la propia pagina dice
   * que se canta (state.lyrics.activeLine, hoy solo Spotify). Viaja con
   * el estado, no con el latido, porque alli no hay tiempos que leer.
   * -1 significa "la pagina no lo ha dicho". `letraConTiempos` se decide
   * una vez por letra, al pintarla: es lo que elige que fuente manda.
   */
  let lineaSegunLaPagina = -1;
  let letraConTiempos = false;
  // Si el usuario esta leyendo otra parte de la letra, el autodesplazamiento
  // se aparta un rato en vez de arrancarle el scroll de las manos.
  let userScrollUntil = 0;
  // Cerrar el panel a mano es una orden: el modo karaoke no debe reabrirlo.
  let lyricsClosedByUser = false;

  function supported() {
    return "documentPictureInPicture" in window;
  }

  async function loadTemplate() {
    const res = await fetch(chrome.runtime.getURL("src/pip/pip.html"));
    return res.text();
  }

  function cacheElements(doc) {
    // La plantilla llega con el español escrito dentro (es el plan B, como
    // los emoji tras los SVG); antes de cachear nada se reescribe al idioma
    // del navegador. Aqui y no en openPip: esta es la unica puerta por la
    // que entra un documento nuevo, incluida la del banco de pruebas.
    if (YTMPip.Textos) YTMPip.Textos.aplicar(doc);
    els = {
      root: doc.getElementById("ytmpip-root"),
      backdrop: doc.getElementById("ytmpip-backdrop"),
      canvasFondo: doc.getElementById("ytmpip-canvas-fondo"),
      canvasToggle: doc.getElementById("ytmpip-canvas-toggle"),
      stage: doc.querySelector(".ytmpip-stage"),
      videoSlot: doc.getElementById("ytmpip-video-slot"),
      artwork: doc.getElementById("ytmpip-artwork"),
      info: doc.querySelector(".ytmpip-info"),
      title: doc.getElementById("ytmpip-title"),
      artist: doc.getElementById("ytmpip-artist"),
      album: doc.getElementById("ytmpip-album"),
      currentTime: doc.getElementById("ytmpip-current-time"),
      duration: doc.getElementById("ytmpip-duration"),
      seek: doc.getElementById("ytmpip-seek"),
      seekPreview: doc.getElementById("ytmpip-seek-preview"),
      playPause: doc.getElementById("ytmpip-play-pause"),
      next: doc.getElementById("ytmpip-next"),
      previous: doc.getElementById("ytmpip-previous"),
      seekForward: doc.getElementById("ytmpip-seek-forward"),
      seekBackward: doc.getElementById("ytmpip-seek-backward"),
      like: doc.getElementById("ytmpip-like"),
      mute: doc.getElementById("ytmpip-mute"),
      volume: doc.getElementById("ytmpip-volume"),
      shuffle: doc.getElementById("ytmpip-shuffle"),
      repeat: doc.getElementById("ytmpip-repeat"),
      speed: doc.getElementById("ytmpip-speed"),
      sleep: doc.getElementById("ytmpip-sleep"),
      eq: doc.getElementById("ytmpip-eq"),
      eqBandas: doc.getElementById("ytmpip-eq-bandas"),
      eqPin: doc.getElementById("ytmpip-eq-pin"),
      lyricsToggle: doc.getElementById("ytmpip-lyrics-toggle"),
      micToggle: doc.getElementById("ytmpip-mic-toggle"),
      lyricsPanel: doc.getElementById("ytmpip-lyrics-panel"),
      queueToggle: doc.getElementById("ytmpip-queue-toggle"),
      queuePanel: doc.getElementById("ytmpip-queue-panel"),
      queueList: doc.getElementById("ytmpip-queue-list"),
      queueEmpty: doc.getElementById("ytmpip-queue-empty"),
      lyricsLines: doc.getElementById("ytmpip-lyrics-lines"),
      lyricsText: doc.getElementById("ytmpip-lyrics-text"),
      lyricsSource: doc.getElementById("ytmpip-lyrics-source"),
      nowLine: doc.getElementById("ytmpip-now-line"),
      nextLines: doc.getElementById("ytmpip-next-lines"),
      status: doc.getElementById("ytmpip-status"),
      anuncio: doc.getElementById("ytmpip-anuncio"),
      videoToggle: doc.getElementById("ytmpip-video-toggle"),
      nativePip: doc.getElementById("ytmpip-native-pip"),
      spectrumToggle: doc.getElementById("ytmpip-spectrum-toggle"),
      spectrum: doc.getElementById("ytmpip-spectrum"),
      pulsoToggle: doc.getElementById("ytmpip-pulse-toggle"),
      halo: doc.getElementById("ytmpip-halo"),
      haloToggle: doc.getElementById("ytmpip-halo-toggle"),
      cleanToggle: doc.getElementById("ytmpip-clean-toggle"),
      expandToggle: doc.getElementById("ytmpip-expand-toggle"),
      backToTab: doc.getElementById("ytmpip-back-to-tab"),
      close: doc.getElementById("ytmpip-close")
    };

    /*
     * El rotulo de volver dice EL SITIO QUE TOCA. Estuvo escrito a mano
     * («Volver a YouTube Music») y salia igual encima de Spotify; el
     * nombre vive ahora en el registro de adaptadores, junto al resto de
     * lo que cada sitio declara de si mismo. Sin registro publicado (un
     * banco montado a pelo) se queda el español del HTML, que es el plan
     * B de siempre.
     */
    const registro = YTMPip.Adaptadores && YTMPip.Adaptadores.activo ? YTMPip.Adaptadores.activo() : null;
    if (els.backToTab && registro && registro.nombre) {
      const rotuloDeVolver = t("volver_al_sitio", [registro.nombre]);
      els.backToTab.textContent = rotuloDeVolver;
      els.backToTab.setAttribute("aria-label", rotuloDeVolver);
    }

    /*
     * Los dibujos, en cuanto el documento existe y antes de que se pinte
     * nada. Aqui y no en `wireEvents` porque esto no es un evento: es parte
     * de montar la ventana, y el primer `render` llega enseguida.
     *
     * QUE BOTONES LLEVAN ICONO NO SE DECIDE AQUI. La lista esta en los
     * `data-ico` de pip.html, que es quien sabe que botones hay; esta
     * llamada solo dispara el pintado. Un boton nuevo con su dibujo no
     * necesita tocar este archivo.
     *
     * Los que cambian de dibujo segun el estado —reproducir/pausar, me
     * gusta, volumen, repetir, el del escenario— llevan en el HTML el que
     * les toca al empezar; a partir de ahi los repinta `render`.
     */
    Iconos.pintarTodos(doc);

    /*
     * Las capacidades del sitio son parte de montar la ventana, igual que
     * los iconos: se saben antes del primer render y no cambian mientras
     * la pagina viva (el hostname no se muda en una SPA).
     */
    aplicarCapacidades();
  }

  /*
   * EL PRIMER CONSUMIDOR DE YTMPip.Capacidades.
   *
   * Hasta la tanda 3 la ventana escondia mandos por la via del null: el
   * boton de repetir de la PAGINA no esta -> el de la ventana se esconde
   * (ver renderExtras). Eso valia porque lo que faltaba era el boton.
   * Spotify rompio el esquema: los mandos de ESTA ventana existen
   * siempre; lo que no existe alli es el <video> sobre el que escriben
   * (medido: cero <video>/<audio> con musica sonando). Y eso no se
   * descubre mirando el DOM en cada refresco —en YouTube Music el medio
   * puede faltar UN INSTANTE y el sitio lo tiene—: se declara en el
   * adaptador (medioEscribible: false) y se consume aqui.
   *
   * Los mandos ya no caen todos juntos: el silencio y la velocidad caen
   * con el medio (su unica via), y los saltos y el volumen solo caen si
   * ADEMAS la pagina no acepta escritura (ver saltosPosiblesAhora y
   * volumenPosibleAhora: la segunda via medida en Spotify). Los atajos
   * de teclado equivalentes NO se desactivan a proposito: la regla de
   * "sobre que se escribe" ya vive en PlayerController (medio primero,
   * pagina despues, y sin ninguna via el metodo del adaptador contesta
   * false sin tocar nada), y repetirla aqui seria la misma regla en dos
   * archivos esperando a discrepar. Lo que este interruptor quita es lo
   * VISIBLE: un mando a la vista que no hace nada es la mentira; una
   * tecla que no hace nada es un no-op invisible.
   *
   * Lo que NO esta en la lista, y por que:
   *  - La barra de tiempo: el progreso SI funciona (sale de la pagina) y
   *    lo unico muerto es el arrastre. Eso lo decide paintTimeline, que
   *    es el unico sitio que pinta la barra.
   *  - El ecualizador: su visibilidad la decide pintarEcualizador (con
   *    audioGrafo), porque se repinta con cada cambio de preferencias y
   *    un escondido de una sola vez se desharia solo.
   *  - El espectro y el pulso: ya preguntan por el elemento con
   *    puedeMedirse(), que sin medio contesta que no.
   */
  function capacidad(nombre) {
    const caps = YTMPip.Capacidades;
    // Solo el false DECLARADO esconde: sin registro publicado (un banco
    // de pruebas montado a pelo, un contexto raro) todo queda como antes.
    return !caps || caps[nombre] !== false;
  }

  /*
   * EL MEDIO POR MODOS. `medioEscribible: false` dejo de ser un veto y
   * paso a leerse "sin garantia" cuando el modo video de Spotify enseño
   * un <video> real donde las mediciones originales daban cero (ver el
   * adaptador). La pregunta ahora tiene dos partes y un ORDEN:
   *
   *  - capacidad declarada true -> true SIN MIRAR EL DOM. Esta es la
   *    promesa de siempre: en YouTube Music el medio puede faltar un
   *    instante y mirar el DOM en cada refresco haria parpadear los
   *    mandos. El cortocircuito la conserva intacta.
   *  - declarada false -> se pregunta por el medio VIVO. En Spotify eso
   *    es estable por pista (las de audio no tienen medio, las de video
   *    si), asi que no hay parpadeo: hay cambio real de modo, y los
   *    mandos deben seguirlo.
   */
  function medioEscribibleAhora() {
    if (capacidad("medioEscribible")) return true;
    return Boolean(YTMPip.Adapter && YTMPip.Adapter.getMediaElement());
  }

  /*
   * LA SEGUNDA VIA: sin medio, la PAGINA. Los deslizadores de Spotify
   * aceptan la escritura sintetica (medido en vivo, salto y volumen
   * audibles), asi que los saltos y el volumen ya no caen con el medio:
   * caen solo si TAMPOCO hay donde escribir en la pagina. La sonda es
   * el propio metodo del contrato llamado sin valor ("¿hay range?"),
   * en vivo y por mando —los dos ranges son elementos distintos y
   * ninguno esta garantizado—, igual que el medio por modos. El
   * cortocircuito con el medio conserva la promesa de siempre: con
   * medioEscribible declarado no se mira ningun DOM.
   *
   * El silencio y la velocidad NO tienen segunda via a proposito: el
   * boton de mute de la pagina no esta medido y la velocidad no tiene
   * deslizador que escribir (audioGrafo tampoco ayudaria: no hay
   * elemento). Siguen cayendo con el medio.
   */
  function saltosPosiblesAhora() {
    if (medioEscribibleAhora()) return true;
    return Boolean(YTMPip.Adapter) && YTMPip.Adapter.seekPageTo() === true;
  }

  function volumenPosibleAhora() {
    if (medioEscribibleAhora()) return true;
    return Boolean(YTMPip.Adapter) && YTMPip.Adapter.setPageVolume() === true;
  }

  function aplicarCapacidades() {
    const sinMedio = !medioEscribibleAhora();
    const sinSaltos = !saltosPosiblesAhora();
    const sinVolumen = !volumenPosibleAhora();
    [els.mute, els.speed].forEach((el) => {
      if (el) el.hidden = sinMedio;
    });
    [els.seekForward, els.seekBackward].forEach((el) => {
      if (el) el.hidden = sinSaltos;
    });
    if (els.volume) els.volume.hidden = sinVolumen;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  function runCommand(type, extra) {
    YTMPip.PlayerController.execute(createCommand(type, extra));
  }

  /* ------------------------------------------------------------------
   * Video real
   *
   * Document Picture-in-Picture permite MOVER un elemento a la ventana
   * flotante; es su uso canonico. Se mueve el <video> de YouTube Music
   * tal cual (no una copia ni un stream capturado) y se devuelve intacto
   * al cerrar.
   *
   * Dos cuidados imprescindibles:
   *  1. Guardar donde estaba (padre y hermano siguiente) para reinsertarlo
   *     en la MISMA posicion; si no, YouTube Music descoloca su layout.
   *  2. Guardar su atributo `style`, porque YTM le pone estilos en linea
   *     y pip.css se los machaca con !important mientras esta prestado.
   * ------------------------------------------------------------------ */

  function borrowVideo() {
    if (borrowedVideo) return true;
    if (!els.videoSlot) return false;

    const media = YTMPip.Adapter.getPageMediaElement();
    if (!media || !media.parentNode) return false;

    videoOrigin = {
      parent: media.parentNode,
      nextSibling: media.nextSibling,
      style: media.getAttribute("style")
    };

    try {
      // appendChild entre documentos adopta el nodo automaticamente.
      els.videoSlot.appendChild(media);
    } catch (err) {
      console.warn("[YTMPip] No se pudo mover el vídeo a la ventana flotante", err);
      videoOrigin = null;
      return false;
    }

    borrowedVideo = media;
    // Sin esto, getMediaElement() dejaria de encontrarlo y se romperian
    // play/pausa/tiempo/volumen.
    YTMPip.Adapter.setBorrowedMedia(media);
    els.videoSlot.hidden = false;
    return true;
  }

  /*
   * Suelta el prestamo y deja de considerar nuestro el elemento. Comun a
   * las dos salidas posibles: devolverlo o tirarlo.
   */
  function releaseLoan() {
    const prestado = { video: borrowedVideo, origin: videoOrigin };
    borrowedVideo = null;
    videoOrigin = null;
    YTMPip.Adapter.setBorrowedMedia(null);
    if (els.videoSlot) els.videoSlot.hidden = true;
    return prestado;
  }

  /*
   * Tira el video prestado en vez de devolverlo.
   *
   * Se usa cuando YouTube Music ya se ha fabricado otro: el nuestro es un
   * cadaver que no volvera a emitir un solo `timeupdate`.
   *
   * Reinsertarlo seria PEOR que tirarlo, y esta es la parte que no era
   * evidente: returnVideo() lo devuelve a su posicion ORIGINAL, que esta
   * ANTES del nuevo en el orden del documento. Cuando el adaptador se
   * quedaba con el primer <video> que encontraba, acto seguido
   * borrowVideo() volvia a prestarse el muerto y la ventana seguia
   * congelada exactamente igual.
   *
   * Hoy el adaptador ya distingue el video vivo entre varios candidatos
   * (elegirVideoVivo), asi que reinsertarlo no volveria a congelar nada.
   * Se sigue tirando por dos razones: la pagina acumularia un <video>
   * huerfano por cada cancion encadenada, y no obligar al adaptador a
   * adivinar es una defensa mas.
   *
   * Lo cubre "un <video> muerto reinsertado YA NO gana" en
   * tests/selectors/adapter.test.js.
   */
  function discardVideo() {
    if (!borrowedVideo) return;
    const { video } = releaseLoan();
    try {
      video.remove();
    } catch (err) {
      console.warn("[YTMPip] No se pudo descartar el vídeo reemplazado", err);
    }
  }

  function returnVideo() {
    if (!borrowedVideo) return;

    const { video, origin } = releaseLoan();

    try {
      if (!origin) return;

      if (origin.style === null) video.removeAttribute("style");
      else video.setAttribute("style", origin.style);

      // Si YouTube Music re-renderizo mientras lo teniamos, el padre
      // original puede haber desaparecido: se cae al contenedor del
      // reproductor antes que dejar el elemento huerfano.
      const parent =
        origin.parent && origin.parent.isConnected ? origin.parent : YTMPip.Adapter.getPlayerContainer();
      if (!parent) return;

      if (origin.nextSibling && origin.nextSibling.parentNode === parent) {
        parent.insertBefore(video, origin.nextSibling);
      } else {
        parent.appendChild(video);
      }
    } catch (err) {
      console.warn("[YTMPip] No se pudo devolver el vídeo a YouTube Music", err);
    }
  }

  /**
   * Decide si la ventana debe estar en modo video y actua en consecuencia.
   * Se reevalua en cada actualizacion de estado porque una cancion puede
   * traer imagen y la siguiente no.
   */
  /*
   * Pinta el boton de alternar a partir de lo que YA decidieron
   * syncVideoMode (¿hay video?) y render (¿hay letra?). No vuelve a
   * preguntarselo: recibe las dos respuestas hechas.
   *
   * Es la leccion que costo el fallo del video en negro. Una regla escrita
   * dos veces no son dos copias de una regla: son dos reglas, y acaban
   * discrepando. Aqui el boton solo se pinta.
   *
   * El boton siempre responde a la misma pregunta —que ocupa el escenario,
   * el hueco grande de la ventana— pero las opciones dependen de lo que
   * traiga la cancion. Con video se elige entre video y caratula; sin
   * video, entre caratula y letra en grande. Son excluyentes (o hay video
   * o no lo hay), asi que un solo boton basta y la cabecera no se llena.
   */
  function pintarBotonDeEscenario(hayVideo, hayLetra) {
    rolDelEscenario = hayVideo ? "video" : hayLetra ? "letra" : null;
    // El microfono de la cabecera depende del rol recien decidido (ver
    // sincronizarMicDeCabecera), asi que se repasa aqui y ANTES del
    // return de abajo: el rol cambia aunque no haya boton que pintar.
    sincronizarMicDeCabecera();
    if (!els.videoToggle) return;

    els.videoToggle.hidden = rolDelEscenario === null;
    if (rolDelEscenario === null) return;

    const enVideo = rolDelEscenario === "video";
    const pulsado = enVideo ? coverPorPeticion : letraOcupaEscenario;
    els.videoToggle.setAttribute("aria-pressed", String(pulsado));

    if (enVideo) {
      Iconos.poner(els.videoToggle, pulsado ? "video" : "caratula");
      els.videoToggle.title = pulsado ? t("ver_video") : t("ver_caratula");
      els.videoToggle.setAttribute(
        "aria-label",
        pulsado ? t("mostrar_video") : t("mostrar_caratula_video")
      );
    } else {
      Iconos.poner(els.videoToggle, pulsado ? "caratula" : "letra");
      els.videoToggle.title = pulsado ? t("ver_caratula") : t("ver_letra_grande");
      els.videoToggle.setAttribute(
        "aria-label",
        pulsado ? t("mostrar_caratula_letra") : t("mostrar_letra")
      );
    }
  }

  /*
   * El microfono de la cabecera: la entrada de EMERGENCIA a la letra.
   *
   * Sintoma reportado (Spotify, ventana bajita): "no aparece la opcion de
   * activar la letra". El boton «Letras» vive en la fila de extras y la
   * densidad mini la esconde entera (display:none en pip.css); en Spotify
   * con la vista de la pagina cerrada el lector se queda en LOADING (cero
   * lineas que leer) y tampoco hay karaoke bajo el titulo. Resultado:
   * CERO entradas a la letra en una ventana baja. Este boton es esa
   * entrada, y por eso hace EXACTAMENTE lo que «Letras» (mismo manejador,
   * alternarPanelDeLetra) en vez de tener politica propia.
   *
   * Se enseña solo cuando no hay otra entrada a la vista:
   *  - en mini: con la ventana alta la fila «Letras» ya se ve y este
   *    boton seria el mismo dos veces;
   *  - sin el boton de escenario ofreciendo YA el microfono: con letra
   *    disponible y sin video aquel boton pinta el MISMO dibujo para otra
   *    cosa (la letra en grande), y dos dibujos iguales con significados
   *    distintos es justo el fallo contra el que avisa iconos.js;
   *  - con las letras permitidas en preferencias. La llave NO se vuelve a
   *    leer de Settings.get(): se lee la decision que applySettings ya
   *    escribio en el hidden del boton «Letras», porque ese manejador
   *    corre tambien como suscriptor de storage, o sea ANTES de que lo
   *    nuevo este guardado en la cache. Misma llave, escrita en un solo
   *    sitio.
   */
  function sincronizarMicDeCabecera() {
    if (!els.micToggle || !els.root) return;
    const mini = els.root.classList.contains("ytmpip-mini");
    const letrasApagadas = Boolean(els.lyricsToggle && els.lyricsToggle.hidden);
    els.micToggle.hidden = !(mini && rolDelEscenario !== "letra" && !letrasApagadas);
  }

  /*
   * Lo unico que hace el boton. No manda ningun comando a YouTube Music:
   * es local a esta ventana y la musica no se entera.
   *
   * Mueve el flag que toque y vuelve a renderizar, nada mas. render()
   * llama a syncVideoMode() y recalcula de paso el modo karaoke, asi que
   * al pasar a caratula la letra ocupa sola el hueco que deja el video.
   * Decidir aqui cualquiera de esas dos cosas seria la copia de la regla
   * que en este proyecto ya salio cara una vez.
   *
   * Cual de los dos flags mueve NO se calcula aqui: se lee el papel que
   * dejo escrito el pintor, que es quien ya resolvio que ofrece la
   * cancion. Si se volviera a deducir en este sitio, tendriamos otra vez
   * la misma regla en dos archivos… o en dos funciones.
   */
  function alternarEscenario() {
    if (rolDelEscenario === "video") {
      coverPorPeticion = !coverPorPeticion;
    } else if (rolDelEscenario === "letra") {
      letraOcupaEscenario = !letraOcupaEscenario;
    }
    if (lastState) render(lastState);
  }

  /* ------------------------------------------------------------------
   * El video flotante DEL NAVEGADOR (PiP nativo)
   *
   * La unica via medida para ver el video DRM de Spotify (2026-09-16,
   * en vivo: requestPictureInPicture abrio la ventanita con el video
   * cifrado dentro, 293x165). Esta ventana no puede CONTENER ese video
   * —adoptarlo rompe la sesion de claves, por eso videoPrestable es
   * false— pero si puede INVOCAR la ventana del navegador, que lo
   * compone el solo sin enseñarle jamas los cuadros a JS: el DRM
   * protege los bytes, no la ventana.
   *
   * Quien decide si se ofrece es el estado (nativePipAvailable, ver
   * readNativePip en metadata-reader.js); aqui solo se pinta y se
   * alterna. La llamada va directa al video del adaptador, por la
   * misma via local que ya usa el latido de la letra.
   * ------------------------------------------------------------------ */

  function pintarBotonPipNativo(state) {
    if (!els.nativePip) return;
    els.nativePip.hidden = !(state && state.nativePipAvailable);
    if (els.nativePip.hidden) return;
    const media = YTMPip.Adapter.getMediaElement();
    const flotando = Boolean(
      media && media.ownerDocument && media.ownerDocument.pictureInPictureElement === media
    );
    els.nativePip.setAttribute("aria-pressed", String(flotando));
  }

  function alternarPipNativo() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media || typeof media.requestPictureInPicture !== "function") return;

    // Segundo clic: la ventanita ya flota, se recoge.
    const documento = media.ownerDocument;
    if (documento && documento.pictureInPictureElement === media) {
      if (typeof documento.exitPictureInPicture === "function") {
        // El catch vacio no traga un fallo nuestro: si salir falla es
        // porque la ventanita ya no estaba (el usuario la cerro con su X).
        documento.exitPictureInPicture().catch(() => {});
      }
      els.nativePip.setAttribute("aria-pressed", "false");
      return;
    }

    media
      .requestPictureInPicture()
      .then(() => {
        els.nativePip.setAttribute("aria-pressed", "true");
      })
      .catch((e) => {
        /*
         * EL BORDE DEL GESTO. requestPictureInPicture exige activacion
         * de usuario, y el clic ocurrio en ESTA ventana, no en la pagina
         * dueña del video. Si Chrome no propaga el gesto entre las dos,
         * cae aqui con NotAllowedError: se dice en voz alta (el anuncio
         * aria-live y la consola) en vez de reventar en silencio o
         * fingir que la ventanita se abrio.
         */
        if (els.anuncio) els.anuncio.textContent = t("pip_nativo_rechazado");
        console.warn("YTMPip: PiP nativo rechazado:", e && e.name, e && e.message);
      });
  }

  /* ------------------------------------------------------------------
   * El fondo Canvas
   *
   * El bucle visual de Spotify (su "Canvas"), de fondo en ESTA ventana.
   * La via es captureStream() sobre el <video> del Canvas de la pagina,
   * la unica que funciono de las dos medidas (2026-09-16, consola del
   * usuario): reutilizar su URL blob esta muerto —la pagina la revoca,
   * ERR_FILE_NOT_FOUND— y el chorro capturado reprodujo de verdad
   * (1080x1920, 1 pista de video). El Canvas se midio SIN DRM, por eso
   * el chorro trae cuadros; el video de pista (cifrado) daria negro, y
   * por eso getCanvasVideo() jamas lo devuelve.
   *
   * Tres voces y ninguna pisa a las otras: el ESTADO dice si la cancion
   * trae Canvas (canvasAvailable), la PREFERENCIA dice si el usuario lo
   * quiere (canvasPreference, se recuerda entre sesiones), y el
   * ADAPTADOR entrega el elemento en el momento de capturar, porque por
   * el estado solo viaja un booleano: un elemento no cabe en un mensaje.
   * ------------------------------------------------------------------ */

  function apagarFondoCanvas() {
    if (canvasStream && typeof canvasStream.getTracks === "function") {
      // Soltar las pistas DE VERDAD: un chorro vivo seguiria copiando
      // cuadros del Canvas de la pagina para un fondo que ya nadie ve.
      canvasStream.getTracks().forEach((pista) => pista.stop());
    }
    canvasStream = null;
    canvasCapturado = null;
    if (els.canvasFondo) {
      els.canvasFondo.srcObject = null;
      els.canvasFondo.hidden = true;
    }
  }

  function sincronizarFondoCanvas(state) {
    const senal = Boolean(state && state.canvasAvailable);
    const quiere = YTMPip.Settings.get().canvasPreference !== "hidden";

    if (els.canvasToggle) {
      // Sin Canvas en la cancion no se ofrece el boton: seria un mando
      // de algo que no existe. La preferencia solo decide el encendido.
      els.canvasToggle.hidden = !senal;
      els.canvasToggle.setAttribute("aria-pressed", String(senal && quiere));
    }

    if (!senal || !quiere) {
      apagarFondoCanvas();
      return;
    }

    const canvas =
      YTMPip.Adapter && typeof YTMPip.Adapter.getCanvasVideo === "function"
        ? YTMPip.Adapter.getCanvasVideo()
        : null;
    if (!canvas || typeof canvas.captureStream !== "function") {
      // La señal llego vieja (el panel se cerro entre medias) o este
      // navegador no sabe capturar: se recoge y queda el fondo difuminado
      // de siempre, que es la degradacion honesta.
      apagarFondoCanvas();
      return;
    }

    if (canvas !== canvasCapturado) {
      // Cancion nueva, Canvas nuevo: el chorro viejo apunta a un elemento
      // que ya no se actualiza. Se suelta y se captura el que toca.
      apagarFondoCanvas();
      try {
        canvasStream = canvas.captureStream();
      } catch (err) {
        console.warn("YTMPip: no se pudo capturar el Canvas:", err && err.message);
        return;
      }
      canvasCapturado = canvas;
      // El <video> de fondo lleva autoplay+muted en el HTML: con el
      // chorro puesto arranca solo, sin play() que exija gesto.
      if (els.canvasFondo) els.canvasFondo.srcObject = canvasStream;
    }

    if (els.canvasFondo) els.canvasFondo.hidden = false;
  }

  function alternarFondoCanvas() {
    const apagado = YTMPip.Settings.get().canvasPreference === "hidden";
    // La preferencia se guarda (cache primero, storage despues): quien
    // no quiera fondo no tiene que apagarlo en cada cancion.
    YTMPip.Settings.guardarPreferenciaCanvas(apagado ? "shown" : "hidden");
    if (lastState) render(lastState);
  }

  /* ------------------------------------------------------------------
   * Solo caratula
   *
   * Quitar el texto no es esconder cuatro parrafos: es que la imagen se
   * quede con el hueco que dejan. Las dos cosas las hace el CSS con la
   * clase `ytmpip-sin-texto`; aqui solo se pone y se quita, y el boton se
   * limita a contar en que estado esta.
   * ------------------------------------------------------------------ */

  function alternarSoloCaratula() {
    soloCaratula = !soloCaratula;
    if (lastState) render(lastState);
  }

  function pintarBotonLimpio() {
    if (!els.cleanToggle) return;
    els.cleanToggle.setAttribute("aria-pressed", String(soloCaratula));
    els.cleanToggle.title = soloCaratula ? t("ver_titulo_artista") : t("solo_caratula");
    els.cleanToggle.setAttribute(
      "aria-label",
      soloCaratula ? t("mostrar_titulo_artista") : t("ocultar_titulo_artista")
    );
  }

  /* ------------------------------------------------------------------
   * Espectro
   *
   * El modulo de audio entrega numeros; esto los convierte en barras. La
   * separacion no es ceremonia: medir no depende del tamaño de la ventana
   * y pintar no depende de nada mas.
   * ------------------------------------------------------------------ */

  // Ancho de referencia por barra, en pixeles CSS. No es el ancho real:
  // el real sale de repartir el canvas, esto solo decide CUANTAS caben.
  const ANCHO_POR_BARRA = 7;
  const BARRAS_MIN = 8;
  const BARRAS_MAX = 40;

  /**
   * Cuantas barras caben en `ancho` pixeles, o las que pida `preferidas`.
   *
   * Con un numero fijo el espectro sale ridiculo en los dos extremos: en
   * la ventana mini las barras se solapan hasta parecer un bloque, y en la
   * ampliada quedan cuatro columnas gordas. Por eso el reparto por ancho
   * sigue siendo lo que se hace si nadie dice nada. Los topes existen
   * porque por debajo de ocho ya no es un espectro sino un vumetro, y por
   * encima de cuarenta las barras bajan de un pixel y se pierden en el
   * redondeo.
   *
   * Cuando `preferidas` es un numero MANDA, y no se vuelve a acotar: ya
   * viene acotado de la normalizacion, y volver a hacerlo aqui seria tener
   * el rango escrito en dos sitios. Tampoco se mira si "cabe": si alguien
   * pide cuarenta barras en la ventana mini es que quiere cuarenta barras
   * apretadas, y corregirselo en silencio seria ignorar la preferencia que
   * acaba de guardar.
   *
   * Pura.
   */
  function barrasParaAncho(ancho, preferidas) {
    if (Number.isFinite(preferidas)) return preferidas;
    if (!(ancho > 0)) return BARRAS_MIN;
    return Math.max(BARRAS_MIN, Math.min(BARRAS_MAX, Math.floor(ancho / ANCHO_POR_BARRA)));
  }

  /* ---------- El arcoiris giratorio ("RGB", como los gamer) ----------
   *
   * Dos movimientos a la vez, y hacen falta los dos:
   *
   *   - el REPARTO: cada barra lleva un tono distinto, asi que en una sola
   *     foto ya se ve un degradado y no un bloque de color;
   *   - el GIRO: todo el degradado avanza con el reloj, que es lo que
   *     convierte el degradado en el efecto que se pidio.
   *
   * Con solo el giro, el espectro entero seria un color liso cambiando
   * despacio y a ratos se confundiria con el fondo. Con solo el reparto
   * seria un arcoiris quieto.
   *
   * El arco es de 300 y no de 360 grados para que la ultima barra no acabe
   * en el mismo tono con el que empieza la primera: cerrando la vuelta
   * entera, los dos extremos del espectro salen del mismo color y el
   * degradado parece cortado por la mitad.
   */
  const RGB_PERIODO_MS = 6000;
  const RGB_ARCO = 300;

  /**
   * El tono (0-359) que le toca a la barra `indice` de `total` en el
   * instante `ms`. Pura, y expuesta para poder probarla: es la unica parte
   * del efecto que se puede comprobar sin mirar la pantalla.
   */
  function matizRgb(ms, indice, total) {
    const giro = ((ms % RGB_PERIODO_MS) / RGB_PERIODO_MS) * 360;
    // Con una sola barra no hay nada que repartir, y dividir por cero
    // dejaria el tono en NaN y la barra sin pintar.
    const reparto = total > 1 ? (indice / (total - 1)) * RGB_ARCO : 0;
    return (giro + reparto) % 360;
  }

  /*
   * ---------- La paleta propia ----------
   *
   * El degradado de la paleta NO se calcula aqui: vive en
   * shared/paleta.js, y se llama con `YTMPip.Paleta.colorDePaleta`.
   *
   * Estuvo aqui, al lado del arcoiris, que es donde parecia que tocaba.
   * Duro hasta escribir la vista previa de la pagina de opciones, que
   * enseña el degradado mientras se eligen los colores: options.html no
   * carga este archivo —es otro documento, con su propia lista de
   * scripts— asi que la unica forma de tener el degradado alli era
   * copiarlo. Una vista previa que interpola distinto que el espectro no
   * es una vista previa; y el dia que alguien cambie la interpolacion en
   * un archivo, el otro seguira mintiendo sin que ninguna prueba se
   * entere.
   */

  function alternarEspectro() {
    gestoEnSesion = true;
    espectroPedido = !espectroPedido;
    if (lastState) render(lastState);
  }

  function alternarPulso() {
    gestoEnSesion = true;
    pulsoPedido = !pulsoPedido;
    if (lastState) render(lastState);
  }

  /*
   * El boton ✨ solo toca la PREFERENCIA de encendido, nunca el modo: por
   * eso son dos claves y no una de tres valores (el razonamiento vive en
   * constants.js). Apagar y volver a encender devuelve el halo tal y como
   * estaba, latiendo o fijo. El clic cuenta como gesto: si el modo
   * guardado era latido, este mismo clic es el que desbloquea el audio.
   */
  function alternarHalo() {
    gestoEnSesion = true;
    const apagado = YTMPip.Settings.get().haloPreference === "hidden";
    YTMPip.Settings.guardarPreferenciaHalo(apagado ? "shown" : "hidden");
    if (lastState) render(lastState);
  }

  function arrancarAnimacion() {
    if (animacionFrame !== null || !pipWindow || pipWindow.closed) return;
    animacionFrame = pipWindow.requestAnimationFrame(fotograma);
  }

  function pararAnimacion() {
    if (animacionFrame === null) return;
    if (pipWindow && !pipWindow.closed) pipWindow.cancelAnimationFrame(animacionFrame);
    animacionFrame = null;
    /*
     * La caratula se deja QUIETA al parar. Sin esto se congelaria a mitad de
     * un golpe —un 0,7 de escala grabado en la variable CSS— y ahi se
     * quedaria hasta el proximo encendido: una portada permanentemente un
     * 4 % mas grande sin ninguna razon visible.
     */
    ponerPulso(0);
    // Misma cortesia para el halo: parado a mitad de golpe se quedaria
    // brillando de mas para siempre.
    ponerHaloGolpe(0);
  }

  /**
   * El unico rAF de la ventana. Hace lo que este pedido y se reprograma solo
   * mientras quede algo que hacer; cuando no queda nada, la cadena se corta
   * sin que nadie tenga que acordarse de pararla.
   *
   * `ms` lo entrega el propio requestAnimationFrame. Se pasa hacia abajo en
   * vez de leer el reloj dentro del modulo de audio: es el mismo instante
   * para todo el fotograma, y una prueba puede mover el tiempo sin fingir
   * `performance` entera.
   */
  function fotograma(ms) {
    animacionFrame = null;
    if (!pipWindow || pipWindow.closed) return;

    let quedaTrabajo = false;
    /*
     * `dibujarEspectro` dice si merece la pena volver a llamarla. Distingue
     * dos "no he pintado" que no son lo mismo: el canvas todavia sin tamaño
     * es "vuelve en el fotograma siguiente", y un canvas sin contexto 2d es
     * "esto no va a pasar nunca". Sin esa distincion, o se pierde el
     * reintento del primer caso o se gira a sesenta fotogramas por segundo
     * para siempre en el segundo.
     */
    if (els.spectrum && !els.spectrum.hidden) {
      if (dibujarEspectro(ms)) quedaTrabajo = true;
    }
    if (pulsoActivo || haloLate) {
      /*
       * `leerPulso` devuelve null cuando no hay analizador montado. Eso NO
       * es cero: es "no se sabe", y poner cero seria afirmar que no hay
       * graves. Se deja todo como estaba.
       *
       * UNA lectura para los dos efectos: son el mismo golpe en el mismo
       * instante, y leer dos veces pagaria el getByteFrequencyData doble.
       * Cada uno escribe SU variable CSS; encender el halo jamas mueve la
       * caratula ni al reves.
       */
      const golpe = YTMPip.Espectro.leerPulso(ms);
      if (golpe !== null) {
        if (pulsoActivo) ponerPulso(golpe);
        if (haloLate) ponerHaloGolpe(golpe);
      }
      quedaTrabajo = true;
    }

    if (quedaTrabajo) arrancarAnimacion();
  }

  /**
   * Publica la fuerza del golpe (0..1) para que la hoja de estilos decida
   * que hacer con ella.
   *
   * AQUI NO HAY NINGUN TAMAÑO. Cuanto crece la portada con un golpe entero
   * vive en pip.css, en `--ytmpip-pulse-strength`, junto al resto de las
   * decisiones sobre como se ve esto. Escribir aqui un `scale(1.06)` seria
   * repartir el mismo efecto entre dos archivos.
   */
  function ponerPulso(golpe) {
    if (!els.root) return;
    const valor = Number.isFinite(golpe) ? Math.min(1, Math.max(0, golpe)) : 0;
    // Redondeado a tres decimales: mas precision no se ve y obligaria al
    // navegador a recalcular el transform por cambios invisibles.
    els.root.style.setProperty("--ytmpip-pulse", valor.toFixed(3));
  }

  /**
   * El hermano del anterior para el halo. Variable CSS PROPIA a proposito:
   * si el halo escribiera `--ytmpip-pulse`, encenderlo en modo latido
   * pondria a bailar la caratula aunque el 💓 estuviera apagado. Cuanto
   * brilla un golpe entero vive en pip.css (`--ytmpip-halo-fuerza`).
   */
  function ponerHaloGolpe(golpe) {
    if (!els.root) return;
    const valor = Number.isFinite(golpe) ? Math.min(1, Math.max(0, golpe)) : 0;
    els.root.style.setProperty("--ytmpip-halo-golpe", valor.toFixed(3));
  }

  /* ------------------------------------------------------------------
   * De donde sale el color del modo "source"
   *
   * TODO LO QUE TOCA PIXELES ESTA AQUI Y SOLO AQUI. La cuenta —quien gana,
   * si gana por bastante, como se deja presentable— vive en
   * shared/color-fuente.js, que no sabe lo que es un canvas y por eso se
   * puede probar con veinte pixeles inventados. Este trozo es el que pone
   * el fotograma en el lienzo y el que se come el SecurityError.
   *
   * SE SIGUE LO QUE HAY EN EL ESCENARIO, que es la promesa de la opcion:
   * con video prestado, el video; si no, la portada. No es una preferencia
   * aparte porque no seria una pregunta que nadie quiera contestar dos
   * veces: quien pide "el color de lo que estoy viendo" ya ha dicho todo.
   * ------------------------------------------------------------------ */

  /**
   * El contexto 2d del lienzo de muestra, creandolo la primera vez.
   *
   * SALE DEL DOCUMENTO DE LA PESTAÑA, no del de la ventana flotante, y es a
   * proposito: el de la ventana muere con ella, asi que habria que
   * reconstruirlo en cada apertura y acordarse de soltarlo en cada cierre.
   * Este no se enseña a nadie —nunca se inserta en el DOM—, asi que de que
   * documento cuelgue solo cambia cuanto vive.
   *
   * `willReadFrequently` porque de eso se trata: sin esa pista el navegador
   * deja el lienzo en la GPU y cada `getImageData` obliga a traerselo de
   * vuelta, que es la parte cara de los 4,467 ms medidos.
   */
  function contextoDeMuestra() {
    if (!lienzoFuente) {
      lienzoFuente = document.createElement("canvas");
      lienzoFuente.width = SOURCE_COLOR.EDGE;
      lienzoFuente.height = SOURCE_COLOR.EDGE;
    }
    return lienzoFuente.getContext("2d", { willReadFrequently: true });
  }

  /**
   * Copia `origen` —un <video> o una <img>— al lienzo y devuelve el color
   * que manda, o `null`.
   *
   * `cual` dice a que anotacion de `fuenteVetada` apuntar si la lectura
   * resulta prohibida. Se pasa desde fuera en vez de deducirlo del tipo del
   * elemento porque quien llama ya lo sabe, y adivinarlo aqui seria
   * preguntar dos veces lo mismo.
   */
  function colorDe(origen, cual) {
    const contexto = contextoDeMuestra();
    if (!contexto) return null;
    try {
      contexto.drawImage(origen, 0, 0, SOURCE_COLOR.EDGE, SOURCE_COLOR.EDGE);
      const pixeles = contexto.getImageData(0, 0, SOURCE_COLOR.EDGE, SOURCE_COLOR.EDGE);
      return YTMPip.ColorFuente.deImagen(pixeles);
    } catch (err) {
      /*
       * Aqui casi siempre es un SecurityError: el lienzo quedo manchado
       * porque la fuente no da permiso para leerla. No se distingue el tipo
       * de excepcion a proposito —cualquier fallo al leer esta fuente va a
       * repetirse igual en el tic siguiente— y lo unico que cambia es que se
       * deja de intentar.
       */
      fuenteVetada[cual] = true;
      console.warn("[YTMPip] no se puede leer el color de esta fuente (" + cual + ")", err);
      return null;
    }
  }

  /**
   * Un tic del muestreo: mira la fuente que este en el escenario.
   *
   * El video se lee EN CADA TIC porque cambia; la portada solo cuando es
   * otra, y por eso `portadaSondeada` guarda la ultima. Sin esa memoria se
   * descargaria la misma imagen dos veces y media por segundo para volver a
   * calcular exactamente el mismo color.
   */
  function muestrearFuente() {
    if (videoMode && borrowedVideo) {
      if (fuenteVetada.video) return;
      /*
       * `readyState` por debajo de 2 es "todavia no hay un fotograma": el
       * elemento existe pero `drawImage` copiaria un rectangulo vacio y el
       * color saldria negro. No es un error, es un "aun no", asi que se deja
       * el objetivo como estaba en vez de ponerlo a null: cambiar de cancion
       * apagaria el color durante el buffering y lo volveria a encender.
       */
      if (borrowedVideo.readyState < 2 || !borrowedVideo.videoWidth) return;
      colorFuenteObjetivo = colorDe(borrowedVideo, "video");
      pintarColorFuenteEnHalo();
      return;
    }
    pedirColorDeLaPortada();
  }

  /**
   * Lleva el color muestreado al halo, si el halo lo esta siguiendo.
   *
   * EL HALO NO TIENE BUCLE DE FOTOGRAMAS PROPIO y este es el motivo de que
   * su suavizado no sea `colorDeLaFuente`: aquella acerca el color UN PASO
   * POR LLAMADA y vive del rAF del espectro; con el halo fijo y el espectro
   * apagado ese bucle no corre, y arrancarlo solo para acercar un color
   * seria un rAF eterno trabajando para nadie. Aqui se escribe el OBJETIVO
   * tal cual en la variable de siempre y el suavizado lo pone la hoja de
   * estilos (la transition de box-shadow de #ytmpip-halo): el color cambia
   * una vez por cancion —o cada tic del muestreo en modo video—, no sesenta
   * veces por segundo.
   *
   * Sin color (portada en blanco y negro, o muestreo recien parado) la
   * variable SE QUITA y el CSS cae solo a var(--ytmpip-accent): la misma
   * promesa documentada del modo fuente del espectro — no hay color que
   * mande, se vuelve al del tema, y quitarla es ademas el mismo mecanismo
   * con el que "accent" funciona desde la tanda del color.
   */
  function pintarColorFuenteEnHalo() {
    if (!haloSigueLaFuente || !els.halo) return;
    if (colorFuenteObjetivo) {
      els.halo.style.setProperty(
        "--ytmpip-halo-color",
        YTMPip.Paleta.hslACss(colorFuenteObjetivo)
      );
    } else {
      els.halo.style.removeProperty("--ytmpip-halo-color");
    }
  }

  /**
   * Descarga la portada CON PERMISO DE LECTURA y saca su color cuando llegue.
   *
   * NO SE LEE LA <img> QUE YA ESTA EN LA VENTANA, que era lo evidente y
   * saldria gratis. Esa imagen se cargo sin `crossOrigin`, asi que dibujarla
   * mancha el lienzo y `getImageData` no la deja leer. Para poder leerla
   * habria que ponerle `crossOrigin="anonymous"` a la portada de verdad, y
   * ahi esta el problema: si algun dia esa peticion fallara —cabeceras que
   * cambian, un dominio nuevo—, la imagen no cargaria Y EL USUARIO SE
   * QUEDARIA SIN PORTADA. Se estaria arriesgando lo principal de la ventana
   * para decorar unas barras.
   *
   * Con una sonda aparte, el peor caso es que no haya color. La portada que
   * se ve no se toca.
   *
   * El precio es una segunda descarga —el navegador cachea por separado las
   * peticiones con CORS y sin el—, y se paga una vez por cancion sobre una
   * imagen que el CDN acaba de servir.
   */
  function pedirColorDeLaPortada() {
    if (fuenteVetada.portada) return;
    const url = lastState && lastState.artworkUrl;
    if (!url) return;
    if (url === portadaSondeada) return;
    portadaSondeada = url;

    const sonda = new Image();
    sonda.crossOrigin = "anonymous";
    sonda.onload = () => {
      // La cancion pudo cambiar mientras se descargaba. Pintar entonces el
      // color de la portada anterior seria peor que no pintar ninguno:
      // seria un color equivocado con toda la apariencia de ser el bueno.
      if (portadaSondeada !== url) return;
      colorFuenteObjetivo = colorDe(sonda, "portada");
      pintarColorFuenteEnHalo();
    };
    sonda.onerror = () => {
      /*
       * Sin veto: esto NO es "las portadas no se dejan leer". Puede ser una
       * URL rota, un corte de red o una sola imagen sin cabeceras. Vetar la
       * fuente entera por una portada dejaria el modo apagado el resto de la
       * sesion, y la siguiente cancion a lo mejor va bien.
       */
      if (portadaSondeada !== url) return;
      colorFuenteObjetivo = null;
      pintarColorFuenteEnHalo();
    };
    sonda.src = url;
  }

  /**
   * Enciende o apaga el muestreo. `visible` es si el espectro esta a la
   * vista y `settings` lo que dicen las preferencias.
   *
   * LOS DOS ENTRAN POR ARGUMENTO Y NINGUNO SE LEE AQUI DENTRO, por el mismo
   * motivo que en `aplicarAtenuado`: quien llama ya los tiene, y uno de los
   * dos —los settings— puede venir de unas preferencias que todavia no
   * estan en la cache. Leerlas por dentro dejaria esta funcion aplicando el
   * ajuste anterior justo cuando la llaman para aplicar el nuevo.
   *
   * DOS CLIENTES desde la tanda del halo segun la caratula: el espectro en
   * modo fuente (si esta a la vista: muestrear para un canvas escondido es
   * trabajo para nadie) y el halo en modo fuente (si esta encendido). El
   * deseo del halo se lee de los SETTINGS y no de els.halo.hidden a
   * proposito: en applySettings esta funcion corre ANTES que
   * sincronizarHalo, o sea antes de que el hidden diga la verdad nueva; los
   * settings ya la dicen. El halo ademas no depende del estado de la pista
   * —no necesita medio, solo la portada—, asi que su deseo no lleva
   * `visible`.
   */
  function sincronizarColorFuente(visible, settings) {
    const alguienQuiere =
      (visible && settings.spectrumColor === MODO_FUENTE) ||
      (settings.haloPreference !== "hidden" && settings.haloColor === MODO_FUENTE);
    if (!alguienQuiere) {
      pararMuestreoFuente();
      return;
    }
    if (muestreoFuenteTimer !== null || !pipWindow || pipWindow.closed) return;
    // Una lectura YA, antes del primer intervalo: si no, el espectro se
    // pasaria los primeros 400 ms pintado con el acento y cambiaria de color
    // solo, que parece un fallo justo al encenderlo.
    muestrearFuente();
    muestreoFuenteTimer = pipWindow.setInterval(muestrearFuente, SOURCE_COLOR.SAMPLE_MS);
  }

  /**
   * Para el muestreo y OLVIDA el color.
   *
   * Se olvida a proposito, en vez de guardarlo por si se vuelve: lo guardado
   * seria el color de la cancion que sonaba al apagar, y volver a encender
   * media hora despues pintaria las barras con el de una cancion que ya no
   * suena, para luego corregirse solo. Empezar sin color es empezar con la
   * verdad, y la primera lectura llega en el mismo instante.
   *
   * `portadaSondeada` tambien: si no, al volver se saltaria la sonda de la
   * cancion actual creyendo que ya se hizo.
   *
   * PERO SOLO SI HABIA MUESTREO EN MARCHA. Esta funcion corre en cada
   * render con el espectro escondido (sincronizarColorFuente la llama al
   * ver `visible` en falso), y olvidar tambien ahi borraba un color recien
   * fijado ANTES de que nadie llegara a pintarlo. El olvido es para la
   * transicion encendido -> apagado; sin nada en marcha no hay nada que
   * parar ni que olvidar.
   */
  function pararMuestreoFuente() {
    if (muestreoFuenteTimer === null) return;
    if (pipWindow && !pipWindow.closed) pipWindow.clearInterval(muestreoFuenteTimer);
    muestreoFuenteTimer = null;
    colorFuenteObjetivo = null;
    colorFuenteActual = null;
    colorFuenteMs = 0;
    portadaSondeada = "";
    /*
     * El olvido tambien limpia el halo: con el objetivo ya en null esta
     * llamada QUITA la variable y el borde vuelve al acento. Sin ella, el
     * halo se quedaria brillando con el color de la cancion que sonaba al
     * apagar el muestreo — exactamente la mentira que este olvido existe
     * para no contar. Si el halo no sigue a la fuente (un hex suyo, o el
     * acento), el pintor se abstiene y su color ni se toca.
     */
    pintarColorFuenteEnHalo();
  }

  /**
   * El color con el que pintar este fotograma, o `null` si no hay ninguno.
   *
   * Aqui SOLO se lleva la cuenta del tiempo y se guarda el resultado; el
   * acercamiento lo hace `ColorFuente.acercar`, que es puro y esta probado.
   */
  function colorDeLaFuente(ms) {
    if (!colorFuenteObjetivo) return null;
    /*
     * El primer fotograma no tiene un "antes" del que medir. Con `dt` a cero
     * el paso es cero, que con `actual` todavia vacio da el objetivo tal
     * cual: se empieza en el color de la fuente y no en uno de transicion.
     */
    const dt = colorFuenteMs ? ms - colorFuenteMs : 0;
    colorFuenteMs = ms;
    colorFuenteActual = YTMPip.ColorFuente.acercar(colorFuenteActual, colorFuenteObjetivo, dt);
    return YTMPip.Paleta.hslACss(colorFuenteActual);
  }

  /**
   * Pinta las barras y devuelve si tiene sentido volver a llamarla.
   *
   * Ya NO se reprograma sola: de eso se encarga `fotograma`, que es quien
   * sabe si ademas hay pulso pendiente.
   *
   * El color NO se escribe aqui: se lee la variable CSS que ya define el
   * tema. Copiarla a este archivo seria tener el color en dos sitios, y en
   * cuanto alguien tocase el tema claro el espectro se quedaria pintando
   * en rojo oscuro sobre blanco. Es la misma leccion que el resto del
   * proyecto, aplicada a algo tan tonto como un color.
   */
  function dibujarEspectro(ms) {
    const canvas = els.spectrum;
    const caja = canvas.getBoundingClientRect();
    // Mientras el canvas no tenga tamaño no hay nada que pintar, pero
    // tampoco es un fallo: `true` para que el bucle lo reintente.
    if (!(caja.width > 0) || !(caja.height > 0)) return true;

    // Sin 2d no lo va a haber nunca. `false` corta la cadena en vez de
    // repetir el intento sesenta veces por segundo para siempre.
    const contexto = canvas.getContext("2d");
    if (!contexto) return false;

    // El canvas mide en pixeles reales y se estira por CSS: sin esta
    // escala, en una pantalla de densidad doble las barras salen borrosas.
    const escala = pipWindow.devicePixelRatio || 1;
    const ancho = Math.max(1, Math.round(caja.width * escala));
    const alto = Math.max(1, Math.round(caja.height * escala));
    if (canvas.width !== ancho) canvas.width = ancho;
    if (canvas.height !== alto) canvas.height = alto;

    const preferencias = YTMPip.Settings.get();
    const barras = YTMPip.Espectro.leerBarras(
      barrasParaAncho(caja.width, preferencias.spectrumBars),
      preferencias.spectrumFall
    );
    contexto.clearRect(0, 0, ancho, alto);

    if (barras && barras.length) {
      const paso = ancho / barras.length;
      // Un sexto de hueco entre barras: proporcional, para que el aire se
      // vea igual con ocho barras que con cuarenta.
      const grosor = Math.max(1, paso - Math.max(1, paso / 6));
      /*
       * Un color fijo se pone UNA vez para las barras que haya; el arcoiris
       * hay que ponerlo barra por barra, porque cada una lleva el suyo.
       *
       * Cuando es fijo se lee `--ytmpip-spectrum-color`, no
       * `--ytmpip-accent`. Esa variable vale el acento del tema salvo que
       * las preferencias digan otra cosa, y quien decide eso es
       * applySettings. Preguntar aqui si el color es propio o del tema
       * seria hacer la misma pregunta en dos sitios.
       *
       * Los modos "rgb" y paleta SI se preguntan aqui, y no hay duplicado:
       * ninguno de los dos tiene UN color que meter en la variable CSS
       * —tienen uno por barra—, asi que applySettings no puede responderlos
       * por adelantado.
       */
      const ciclico = preferencias.spectrumColor === "rgb";
      // La lista se parte una vez por fotograma, no una vez por barra:
      // dentro del bucle serian cuarenta split() por cada 16 ms.
      const paleta = ciclico ? null : YTMPip.Settings.normalizarPaleta(preferencias.spectrumColor);
      const porBarra = ciclico || paleta;
      if (!porBarra) {
        /*
         * «Del video o la carátula» es el TERCER modo de color fijo, y el
         * unico que puede no tener respuesta: una portada en blanco y negro
         * no tiene un color que mande. Ese `null` cae solo en la variable
         * CSS de la derecha, que es el acento del tema, sin preguntar nada
         * mas: "no hay color de la fuente" y "no se ha pedido color de la
         * fuente" quieren pintar lo mismo, asi que no hacen falta dos ramas.
         *
         * Se pregunta por el modo AQUI y no en applySettings, como el
         * arcoiris y la paleta, porque el color cambia entre fotogramas sin
         * que las preferencias se hayan tocado: applySettings no tiene
         * ocasion de escribirlo.
         */
        const deLaFuente =
          preferencias.spectrumColor === MODO_FUENTE ? colorDeLaFuente(ms) : null;
        contexto.fillStyle =
          deLaFuente ||
          pipWindow.getComputedStyle(els.root).getPropertyValue("--ytmpip-spectrum-color").trim() ||
          SPECTRUM_LIMITS.COLOR_SUGGESTED;
      }
      // El reloj se lee UNA vez por fotograma: leerlo dentro del bucle
      // repartiria las barras por el tiempo que tarda en pintarse el
      // fotograma en vez de por su posicion.
      const ahora = ciclico ? (pipWindow.performance || Date).now() : 0;

      for (let i = 0; i < barras.length; i++) {
        if (ciclico) {
          contexto.fillStyle = "hsl(" + matizRgb(ahora, i, barras.length) + ", 100%, 60%)";
        } else if (paleta) {
          contexto.fillStyle = YTMPip.Paleta.colorDePaleta(paleta, i, barras.length);
        }
        const altura = Math.max(1, (barras[i] / 255) * alto);
        contexto.fillRect(i * paso, alto - altura, grosor, altura);
      }
    }

    return true;
  }

  /**
   * Enciende o apaga los DOS efectos que viven del analizador —las barras y
   * el pulso de la caratula— segun lo que el usuario pidio y lo que la
   * pista permite. Se llama en cada render porque las dos cosas cambian: una
   * con los botones y la otra al cambiar de cancion.
   *
   * `letraEnGrande` entra como argumento y no se recalcula: con la letra
   * ocupando el escenario, ni el canvas ni la portada estan a la vista.
   * Medir para nadie seria gastar un fotograma por nada.
   *
   * UN SOLO SITIO DECIDE SI HAY CONEXION, y es esta funcion. Los dos efectos
   * comparten el AudioContext: montarlo por separado seria capturar el audio
   * dos veces y tener dos ciclos de vida que pueden contradecirse. Por eso
   * `conectar` se llama una vez, y `desconectar` solo cuando NINGUNO de los
   * dos lo quiere.
   */
  function sincronizarEspectro(letraEnGrande) {
    if (!els.spectrum || !els.spectrumToggle) return;

    const media = YTMPip.Adapter.getMediaElement();
    espectroDisponible = YTMPip.Espectro.puedeMedirse(media);
    els.spectrumToggle.hidden = !espectroDisponible;
    els.spectrumToggle.setAttribute("aria-pressed", String(espectroPedido));
    els.spectrumToggle.title = espectroPedido ? t("ocultar_espectro") : t("ver_espectro");
    els.spectrumToggle.setAttribute(
      "aria-label",
      espectroPedido ? t("ocultar_espectro_musica") : t("mostrar_espectro_musica")
    );

    /*
     * El boton del pulso depende de LO MISMO que el del espectro: de que se
     * pueda capturar el audio. Se lee la variable que ya se acaba de
     * calcular en vez de volver a preguntar a `puedeMedirse`, porque
     * preguntarlo dos veces en la misma funcion es exactamente como se
     * empiezan a contradecir dos respuestas.
     */
    /*
     * EL BOTON NO DICE "CARATULA", y dejo de decirlo el dia que el pulso
     * empezo a valer tambien para el video. Decia "Pulso de la caratula"
     * mientras hacia latir un videoclip: una etiqueta que cuenta lo
     * contrario de lo que pasa es peor que una etiqueta vaga.
     *
     * Se descarto la otra salida —cambiar el texto segun `videoMode`, que
     * esta ahi mismo y saldria gratis— porque el boton pasaria a decir dos
     * cosas distintas segun la cancion, y lo que hace es UNA. Vago y cierto
     * antes que preciso y cambiante.
     */
    if (els.pulsoToggle) {
      els.pulsoToggle.hidden = !espectroDisponible;
      els.pulsoToggle.setAttribute("aria-pressed", String(pulsoPedido));
      const etiqueta = pulsoPedido ? t("imagen_quieta") : t("imagen_lata");
      els.pulsoToggle.title = pulsoPedido ? t("quitar_pulso") : t("pulso_graves");
      els.pulsoToggle.setAttribute("aria-label", etiqueta);
    }

    /*
     * `conectar` se llama aqui y no en el manejador del clic para que el
     * relevo de <video> entre canciones lo arregle el propio refresco: el
     * modulo compara el elemento y se reengancha solo. Puesto en el clic,
     * el espectro se congelaria en la cancion siguiente, que es el fallo
     * que este proyecto ya ha visto tres veces.
     *
     * NO se vuelve a mirar `espectroDisponible`: `conectar` ya se lo
     * pregunta a puedeMedirse por dentro. Aqui estuvo escrito tambien, y
     * la verificacion por mutacion enseño que se podia borrar sin que
     * ninguna prueba se enterase, que es la definicion de regla duplicada.
     * Arriba si hace falta, porque enseñar el boton no pasa por conectar.
     */
    /*
     * El halo en modo latido es el TERCER cliente del analizador, con dos
     * matices propios. `gestoEnSesion`: latido es una preferencia GUARDADA,
     * y conectar sin gesto leeria ceros de un AudioContext suspendido (la
     * regla del pulso); sin gesto el halo sale fijo, no late. Y
     * `letraEnGrande` tambien lo apaga: no por invisibilidad —el borde se
     * ve con letra en grande—, sino porque mantener vivo `conectado` aqui
     * pondria en true la linea de abajo que enseña el canvas del espectro,
     * y el espectro con letra en grande es la regresion documentada. Con
     * letra en grande el halo queda fijo, que ademas molesta menos leyendo.
     */
    const haloQuiereLatir = haloEncendido && haloModoLatido && gestoEnSesion;
    const alguienQuiere = (espectroPedido || pulsoPedido || haloQuiereLatir) && !letraEnGrande;
    const conectado = alguienQuiere && YTMPip.Espectro.conectar(media);

    /*
     * EL PULSO YA NO PREGUNTA SI HAY VIDEO.
     *
     * Aqui ponia `&& !videoMode`, con este motivo escrito al lado: "el pulso
     * solo tiene sentido sobre una PORTADA; en modo video la caratula esta en
     * display:none, asi que escalarla no se ve". La primera mitad era una
     * suposicion y la segunda era verdad. Lo cierto es que en modo video hay
     * algo en el escenario —el video— y escalar ESE si se ve; lo que no se
     * veia era escalar una portada escondida detras de el.
     *
     * El arreglo no toca esta linea mas que para quitarle la condicion: quien
     * decide QUE crece es la hoja de estilos, que ahora escala tambien
     * `.ytmpip-video-slot`. Este archivo sigue sin saber que es lo que late,
     * igual que sigue sin saber cuanto crece.
     *
     * Lo que SI queda es `letraEnGrande`, mas arriba, dentro de
     * `alguienQuiere`: con la letra ocupando el escenario no hay ni portada ni
     * video a la vista, y ahi la FFT por fotograma si seria para nadie.
     */
    pulsoActivo = conectado && pulsoPedido;
    /*
     * Al apagarse hay que DEVOLVER LA IMAGEN A SU SITIO, y no basta con
     * dejar de medir. La variable CSS se queda con el ultimo valor escrito,
     * asi que apagar el pulso a mitad de un golpe dejaria la portada un
     * 4 % mas grande para siempre. `pararAnimacion` ya lo hace, pero solo
     * corre cuando se apagan los dos efectos: con el espectro encendido, el
     * bucle sigue vivo y nadie pasaria por ahi.
     */
    if (!pulsoActivo) ponerPulso(0);

    /*
     * Mismo par pedido/activo que el pulso: `haloModoLatido` es lo que el
     * usuario guardo, `haloLate` lo que de verdad pasa este render. Y el
     * mismo cero al apagarse: sin el, el borde se quedaria brillando con
     * el ultimo golpe escrito.
     */
    haloLate = conectado && haloEncendido && haloModoLatido;
    if (!haloLate) ponerHaloGolpe(0);

    els.spectrum.hidden = !(conectado && espectroPedido);

    /*
     * El muestreo del color se enciende AQUI, junto a la linea que decide si
     * el canvas se ve, y no en el manejador del boton. Es la misma razon por
     * la que `conectar` esta aqui: lo que enciende y apaga el espectro son
     * tres cosas —el boton, la letra en grande y si la pista se deja medir—,
     * y esta funcion es la unica que las conoce todas. Puesto en el clic, el
     * color se quedaria muestreando para un canvas que la letra acaba de
     * tapar.
     */
    sincronizarColorFuente(!els.spectrum.hidden, YTMPip.Settings.get());

    if (!els.spectrum.hidden || pulsoActivo || haloLate) {
      arrancarAnimacion();
      return;
    }

    pararAnimacion();
    // Nadie mira: se suelta el AudioContext en vez de dejarlo analizando
    // para el vacio. Volver a montarlo cuesta un clic, que es justo lo que
    // habra hecho el usuario cuando haga falta otra vez.
    // El halo cuenta por su DESEO (haloQuiereLatir), no por haloLate: con
    // letra en grande late=false pero soltar el contexto obligaria a otro
    // gesto al volver, y el gesto ya se gasto.
    if (!espectroPedido && !pulsoPedido && !haloQuiereLatir) YTMPip.Espectro.desconectar();
  }

  function syncVideoMode(state) {
    const permitido = YTMPip.Settings.get().videoPreference !== "hidden";
    /*
     * hasVideo dice la verdad de la PAGINA ("la pista trae imagen");
     * videoPrestable dice la verdad de la VENTANA ("ese video se puede
     * adoptar aqui"). Desde la tanda del medio por modos, en Spotify las
     * dos discrepan: el modo video tiene un <video> real con DRM, y
     * hasVideo pasa a true — pero adoptarlo romperia la sesion de claves
     * (pantalla negra). Sin esta puerta, la ventana ofrecia el conmutador
     * de un video que jamas podra enseñar, y el rol "letra en grande" del
     * mismo boton desaparecia por darle prioridad a un video imposible.
     */
    const puede = Boolean(state && state.hasVideo) && capacidad("videoPrestable");
    const quiere = permitido && !coverPorPeticion;

    /*
     * Se DEVUELVE, no se pinta el boton aqui: quien lo pinta necesita
     * ademas saber si hay letra, y eso se resuelve mas abajo en render().
     * Esta funcion sigue siendo la unica dueña de la regla del video.
     *
     * Sin video en la pista no hay nada que alternar, y con el video
     * desactivado en preferencias ofrecerlo seria abrir una puerta que
     * contradice el ajuste que el propio usuario puso.
     */
    const hayVideoQueAlternar = puede && permitido;

    /*
     * Si YouTube Music creo un <video> nuevo, el prestado ya no sirve: se
     * TIRA, no se devuelve. Ver discardVideo() para por que devolverlo
     * dejaba la ventana congelada igual.
     *
     * Quien decide si hay relevo es el adaptador, no este archivo. Aqui
     * habia una copia de la regla ("cualquier <video> en la pagina distinto
     * del prestado"), y esa copia era la mitad cara del fallo: bastaba un
     * cadaver pausado a medias en la pagina para que tirasemos el elemento
     * que estaba sonando y nos quedasemos con el muerto. El sintoma era el
     * recuadro de video en negro con un tiempo y una duracion que no eran
     * los de la cancion.
     */
    if (borrowedVideo && YTMPip.Adapter.getReplacementFor(borrowedVideo)) discardVideo();

    const deberia = quiere && puede;
    if (deberia && !borrowedVideo) borrowVideo();
    else if (!deberia && borrowedVideo) returnVideo();

    const nuevoModo = Boolean(borrowedVideo);
    if (nuevoModo !== videoMode) {
      videoMode = nuevoModo;
      applyLayout();

      /*
       * Cortesia de una sola vez: si aparece un video y la ventana se
       * quedo con el tamaño compacto, se agranda para que se vea. No se
       * repite nunca mas en esta ventana, porque a partir de ahi cualquier
       * tamaño puede ser el que el usuario eligio a mano y cambiarselo
       * seria pelearse con el.
       */
      if (nuevoModo && !autoSizedForVideo) {
        autoSizedForVideo = true;
        const size = measure();
        if (size && size.height < PIP_DIMENSIONS.VIDEO.height) {
          resizeWindow(PIP_DIMENSIONS.VIDEO);
        }
      }
    }

    return hayVideoQueAlternar;
  }

  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------
   * Autoajuste
   *
   * La maquetacion la decide el tamaño REAL de la ventana, no la
   * preferencia. La preferencia solo elige con que tamaño se abre; en
   * cuanto el usuario la redimensiona a mano, manda lo que mida.
   * ------------------------------------------------------------------ */

  /**
   * Decide el nivel de detalle a partir de las medidas. Es una funcion
   * pura a proposito: es la unica parte del PiP que se puede probar sin
   * una ventana flotante de verdad.
   */
  function densityFor(width, height) {
    const mini = height < PIP_BREAKPOINTS.HEIGHT_MINI;
    return {
      mini,
      // "tight" y "mini" son excluyentes: mini ya implica todo lo de tight.
      tight: !mini && height < PIP_BREAKPOINTS.HEIGHT_TIGHT,
      narrow: width < PIP_BREAKPOINTS.WIDTH_NARROW
    };
  }

  function measure() {
    if (!pipWindow || pipWindow.closed) return null;
    const width = pipWindow.innerWidth || 0;
    const height = pipWindow.innerHeight || 0;
    return width && height ? { width, height } : null;
  }

  /**
   * Decide la maquetacion completa: nivel de detalle (por tamaño) mas la
   * forma de colocar las piezas (que ademas depende de si hay video).
   *
   * Pura y expuesta para poder probarla, igual que densityFor: las tres
   * formas son excluyentes entre si y eso conviene tenerlo clavado por una
   * prueba, porque si dos coincidieran las reglas CSS se solaparian.
   */
  function layoutFor(width, height, hasVideo, letraEnGrande) {
    const { mini, tight, narrow } = densityFor(width, height);

    /*
     * Superpuesto: el contenido ocupa la ventana entera y los mandos flotan
     * encima translucidos, como en cualquier reproductor a pantalla
     * completa. Dos situaciones distintas acaban pidiendo lo mismo.
     *
     * 1. Ventana pequeña Y con video. En un videoclip el titulo es
     *    informacion que la propia imagen ya esta dando; repartir el poco
     *    alto que queda entre texto y video deja las dos cosas ilegibles.
     *
     * 2. La letra en grande, A CUALQUIER TAMAÑO. Y el tamaño no pinta nada
     *    aqui porque el problema no era la falta de sitio: era que la fila
     *    de mandos se colocaba encima de las lineas ("la barra cubre la
     *    letra"). Ponerle un umbral de alto lo arreglaria en las ventanas
     *    pequeñas y lo dejaria igual de tapado en las grandes, que son
     *    justo en las que uno se pone a leer la letra.
     */
    const overlay = Boolean(letraEnGrande) || (mini && hasVideo);

    return {
      mini,
      tight,
      narrow,
      /*
       * Fila (miniatura pequeña + texto al lado) o columna (imagen grande
       * arriba). Con video nunca se pasa a fila: quien abre un videoclip
       * quiere ver el video, no una miniatura de 56 px.
       *
       * `!overlay` no es una precaucion: sin el, la letra en grande en una
       * ventana baja daria compacto Y superpuesto a la vez, y las dos
       * familias de reglas CSS se pisarian. Hay una prueba que recorre
       * todos los tamaños para que nunca vuelvan a coincidir dos.
       */
      compact: mini && !hasVideo && !overlay,
      expanded: !mini && !hasVideo && !overlay,
      overlay
    };
  }

  function applyDensity() {
    if (!pipWindow || !els.root) return;
    const size = measure();
    if (!size) return;

    /*
     * Si la letra ocupa el escenario NO se vuelve a deducir aqui: se lee la
     * clase que ya escribio render(), que es quien lo decidio con las tres
     * condiciones (karaoke, sin video y el boton pulsado). Repetir esa
     * cuenta en esta funcion seria la regla duplicada de siempre, y ademas
     * aqui faltan dos de los tres datos.
     *
     * A cambio hay una obligacion: render() tiene que llamar a applyDensity
     * DESPUES de poner la clase. Si no, en el cambio de escenario esta
     * funcion leeria la del render anterior.
     */
    const l = layoutFor(
      size.width,
      size.height,
      videoMode,
      els.root.classList.contains("ytmpip-lyrics-stage")
    );
    els.root.classList.toggle("ytmpip-mini", l.mini);
    els.root.classList.toggle("ytmpip-tight", l.tight);
    els.root.classList.toggle("ytmpip-narrow", l.narrow);
    els.root.classList.toggle("compact", l.compact);
    els.root.classList.toggle("expanded", l.expanded);
    els.root.classList.toggle("ytmpip-overlay", l.overlay);
    // Despues de las clases a proposito: la banda depende de que filas
    // deja visibles la densidad recien puesta.
    ajustarBandasDeMandos();
    // Y el microfono de cabecera por lo mismo: lee la clase ytmpip-mini
    // que se acaba de poner (es la entrada a la letra cuando mini
    // esconde la fila de «Letras»).
    sincronizarMicDeCabecera();
  }

  /*
   * LAS BANDAS DE LA LETRA EN GRANDE, medidas en vez de fijas.
   *
   * Los 86/148 px del CSS eran la pila de mandos medida en la vista previa
   * a 380 px de ancho, y ahi son verdad. Pero la fila de extras hace
   * `flex-wrap`, y en cuanto se parte en dos lineas (medido: a 300 px de
   * ancho la pila de abajo pasa de 131 a 165 px) el numero fijo se queda
   * corto: la letra asoma entre la barra de tiempo y el transporte y la
   * atribucion de la licencia queda EN MEDIO del transporte, que es
   * exactamente el desorden del pantallazo que motivo este arreglo. El
   * punto de quiebre ademas depende de QUE botones esten visibles (en
   * Spotify sinMedio esconde silencio y velocidad), asi que ningun numero
   * escrito a mano vale para todos los sitios a la vez.
   *
   * La regla pasa a ser una sola: la banda MIDE lo que miden los mandos.
   * Se mide aqui y se escribe la variable (mismo patron que
   * --ytmpip-spectrum-height y --ytmpip-played: pip.js escribe, el CSS
   * consume); los valores del CSS se quedan como reserva para antes de la
   * primera medida y para la vista previa, que no ejecuta este archivo.
   * Escribir la variable no mueve las filas —solo el relleno del panel,
   * los degradados y el ancla de la atribucion— asi que no hay bucle
   * medida-escritura-medida.
   *
   * SIN MEDIDA NO SE ESCRIBE: con las filas midiendo 0 (documento aun sin
   * maquetar) se deja la reserva del CSS, que es la misma abstencion de
   * siempre — mejor un numero aproximado que uno inventado con ceros.
   */
  function ajustarBandasDeMandos() {
    const root = els.root;
    const enEscenario =
      root.classList.contains("ytmpip-overlay") &&
      root.classList.contains("ytmpip-lyrics-stage");
    if (!enEscenario) {
      root.style.removeProperty("--ytmpip-mandos-arriba");
      root.style.removeProperty("--ytmpip-mandos-abajo");
      return;
    }

    const visible = (el) => {
      if (!el) return null;
      const caja = el.getBoundingClientRect();
      return caja.height > 0 ? caja : null;
    };
    const cajaRoot = root.getBoundingClientRect();
    if (!(cajaRoot.height > 0)) return;

    // Arriba: cabecera + titulo. Abajo: la primera fila de mandos que siga
    // visible manda (la barra de tiempo; si faltara, el transporte...).
    // Las acciones secundarias siguen en la lista A PROPOSITO aunque el
    // escenario las tenga en display:none (miden 0 y el filtro las suelta):
    // la lista enumera candidatas y la VISIBILIDAD decide, asi que si el
    // CSS un dia las devuelve, la banda las cubre sola sin tocar esto.
    const arriba = [".ytmpip-header", ".ytmpip-body"]
      .map((s) => visible(root.querySelector(s)))
      .filter(Boolean)
      .reduce((max, caja) => Math.max(max, caja.bottom - cajaRoot.top), 0);
    const abajo = [".ytmpip-progress-row", ".ytmpip-controls", ".ytmpip-extras", ".ytmpip-secondary-actions"]
      .map((s) => visible(root.querySelector(s)))
      .filter(Boolean)
      .reduce((max, caja) => Math.max(max, cajaRoot.bottom - caja.top), 0);
    if (!(arriba > 0) || !(abajo > 0)) return;

    // La franja de la atribucion se LEE del CSS, no se repite aqui: si un
    // dia cambia alli, esta cuenta la sigue sola. Sin valor legible, la
    // hoja no cargo y no hay nada sensato que escribir.
    const atribucion = parseFloat(
      pipWindow.getComputedStyle(root).getPropertyValue("--ytmpip-atribucion")
    );
    if (!Number.isFinite(atribucion)) return;

    root.style.setProperty("--ytmpip-mandos-arriba", Math.ceil(arriba) + "px");
    root.style.setProperty("--ytmpip-mandos-abajo", Math.ceil(abajo + atribucion) + "px");
  }

  /*
   * El tamaño que se ANOTA es el exterior, no el hueco donde se pinta.
   *
   * Los dos existen y no tienen por que valer lo mismo: el navegador puede
   * poner una barra suya alrededor del contenido. Hay que anotar el
   * exterior porque es el que se le pide a requestWindow() al abrir.
   * Anotar el interior y volver a pedirlo como si fuera exterior encogeria
   * la ventana un poco EN CADA SESION —se piden 300, salen 270, se anotan
   * 270, se piden 270, salen 240— hasta dejarla en el minimo. Es un fallo
   * que no se ve el primer dia y que a la decima vez ya no tiene arreglo
   * desde dentro.
   *
   * El `||` no es un "por si acaso" decorativo: si el exterior no
   * estuviera expuesto o saliera 0, el interior es la mejor medida que hay
   * y una ventana un poco pequeña es mejor que no recordar nada. Cual de
   * los dos casos es el real lo mide tools/diagnostico-tamano-ventana.js.
   */
  function tamanoAnotable() {
    if (!pipWindow || pipWindow.closed) return null;
    const width = pipWindow.outerWidth || pipWindow.innerWidth || 0;
    const height = pipWindow.outerHeight || pipWindow.innerHeight || 0;
    return width && height ? { width, height } : null;
  }

  /*
   * Arrastrar un borde dispara decenas de "resize". Escribir en storage en
   * cada uno seria absurdo, asi que se espera a que el usuario suelte.
   *
   * El temporizador cuelga de pipWindow a proposito, como el de la letra:
   * sus timers mueren con ella y asi no queda ninguno intentando medir una
   * ventana que ya no existe. Ese mismo motivo obliga a lo de abajo: quien
   * redimensiona y cierra dentro del medio segundo se quedaria sin anotar
   * nada, y por eso "pagehide" vacia el temporizador a mano.
   */
  const ESPERA_ANOTAR_TAMANO_MS = 500;

  function anotarTamanoPronto() {
    if (!pipWindow) return;
    if (anotarTamanoTimer) pipWindow.clearTimeout(anotarTamanoTimer);
    anotarTamanoTimer = pipWindow.setTimeout(anotarTamanoYa, ESPERA_ANOTAR_TAMANO_MS);
  }

  /*
   * Se anota SIEMPRE, aunque la preferencia diga "compacta" o "ampliada".
   * La anotacion no manda sobre nada: solo la lee quien haya elegido
   * "el ultimo". Anotarla siempre significa que quien cambie la
   * preferencia manaña ya tiene un tamaño que recordar, en vez de estrenar
   * la opcion con un `null` y la ventana pequeña de siempre.
   */
  function anotarTamanoYa() {
    anotarTamanoTimer = null;
    const size = tamanoAnotable();
    if (!size) return;
    YTMPip.Settings.anotarTamano(size.width, size.height);
  }

  function alRedimensionar() {
    applyDensity();
    anotarTamanoPronto();
  }

  /*
   * ---------- Los mandos se quitan de en medio ----------
   *
   * A los tres segundos sin tocar nada, `#ytmpip-root` se marca como
   * "quieto" y el CSS desvanece cabecera, barra de progreso, botones y
   * extras. Cualquier señal de vida los devuelve.
   *
   * EL TEMPORIZADOR VIVE AQUI Y EL ASPECTO EN EL CSS. Se podria haber hecho
   * entero con `:hover`, y de hecho el modo superpuesto lo hacia asi, pero
   * `:hover` no oculta nada mientras el raton este parado ENCIMA de la
   * ventana, y lo que se pidio es que se oculten siempre.
   *
   * QUE CUENTA COMO SEÑAL DE VIDA, y por que cada cosa:
   *   - `pointermove`: lo obvio, y cubre raton, lapiz y dedo de una vez.
   *   - `pointerdown`: un toque en una pantalla tactil no mueve el puntero
   *     antes de pulsar. Sin esto, en tactil los mandos volverian DESPUES
   *     de haber pulsado a ciegas.
   *   - `keydown`: acabamos de poner atajos de teclado. Subir el volumen
   *     con la flecha y no ver moverse el control seria absurdo.
   *   - `wheel`: la rueda mueve la lista de la letra sin mover el puntero.
   *   - `focusin`: llegar a un boton con el tabulador es usar la ventana.
   *     El CSS ademas lo cubre con `:focus-within`, y el doble cinturon es
   *     a proposito: si el foco entra y sale rapido, el `:focus-within` se
   *     apaga solo, pero el temporizador ya se ha reiniciado y da los tres
   *     segundos completos.
   *
   * Los eventos se escuchan en CAPTURA para que se cuenten aunque otro
   * manejador pare la propagacion. Un atajo que se traga su evento no
   * significa que el usuario no este ahi: significa exactamente lo
   * contrario.
   */
  const ESPERA_OCULTAR_MANDOS_MS = 3000;
  const CLASE_QUIETO = "ytmpip-quieto";
  const SENALES_DE_VIDA = ["pointermove", "pointerdown", "keydown", "wheel", "focusin"];

  function ocultarMandosYa() {
    quietoTimer = null;
    if (!els.root) return;
    els.root.classList.add(CLASE_QUIETO);
  }

  function despertarMandos() {
    if (els.root) els.root.classList.remove(CLASE_QUIETO);
    if (!pipWindow) return;
    if (quietoTimer) pipWindow.clearTimeout(quietoTimer);
    quietoTimer = pipWindow.setTimeout(ocultarMandosYa, ESPERA_OCULTAR_MANDOS_MS);
  }

  function cablearQuietud(doc) {
    if (!doc) return;
    for (let i = 0; i < SENALES_DE_VIDA.length; i++) {
      doc.addEventListener(SENALES_DE_VIDA[i], despertarMandos, true);
    }
    // Se arranca despierto y con la cuenta en marcha: abrir la ventana es
    // usarla. Nacer "quieto" habria enseñado los mandos sólo tras mover el
    // raton, y quien acaba de abrirla espera verlos.
    despertarMandos();
  }

  function watchWindowSize() {
    if (!pipWindow) return;
    pipWindow.addEventListener("resize", alRedimensionar);
    // El evento resize no cubre todos los casos (p. ej. el propio
    // navegador ajustando la ventana al entrar en PiP); el observer si.
    if (typeof pipWindow.ResizeObserver === "function") {
      new pipWindow.ResizeObserver(alRedimensionar).observe(pipWindow.document.documentElement);
    }
    applyDensity();
  }

  /*
   * Con que tamaño se abre la ventana.
   *
   * Son dos preguntas, no una, y por eso devuelve dos cosas: con que
   * medidas nace la ventana, y si cuenta como "ampliada" a efectos del
   * boton ⤢. La segunda no se deduce de la primera con un `===`: un
   * tamaño recordado a mano casi nunca coincide al pixel con
   * PIP_DIMENSIONS.EXPANDED, y si `expandida` saliera de comparar
   * igualdad, el primer clic en ⤢ de una ventana recordada grande la
   * ENCOGERIA a 380x560. El boton dice "ampliar"; encoger es lo contrario
   * de lo que promete.
   *
   * Por eso se mira solo el ALTO: lo que el boton ⤢ enseña de mas —la
   * caratula grande, el panel de letras— crece hacia abajo, y es tambien
   * el alto lo que miran los umbrales de layoutFor. Una ventana recordada
   * tan alta como la ampliada ya esta enseñando lo mismo, asi que el
   * siguiente clic debe compactar.
   *
   * `ultimo` puede ser null (nunca se ha anotado ninguno): entonces manda
   * el compacto de siempre, no un numero inventado aqui.
   *
   * Pura y expuesta para poder probarla sin abrir ninguna ventana.
   */
  function dimensionesIniciales(pipSize, ultimo) {
    if (pipSize === "expanded") {
      return {
        width: PIP_DIMENSIONS.EXPANDED.width,
        height: PIP_DIMENSIONS.EXPANDED.height,
        expandida: true
      };
    }
    if (pipSize === "last" && ultimo) {
      return {
        width: ultimo.width,
        height: ultimo.height,
        expandida: ultimo.height >= PIP_DIMENSIONS.EXPANDED.height
      };
    }
    return {
      width: PIP_DIMENSIONS.COMPACT.width,
      height: PIP_DIMENSIONS.COMPACT.height,
      expandida: false
    };
  }

  /** Redimension explicita. Solo desde el boton ⤢, al abrir y al primer video. */
  function resizeWindow(dims) {
    if (!pipWindow || pipWindow.closed || !dims) return;
    try {
      pipWindow.resizeTo(dims.width, dims.height);
    } catch (err) {
      // El navegador puede restringir el resize programatico; se ignora.
      // No pasa nada: applyDensity() ya adapta el contenido a lo que haya.
    }
    applyDensity();
  }

  function applyLayout() {
    if (!pipWindow || !els.root) return;
    els.root.classList.toggle("ytmpip-video-mode", videoMode);
    applyDensity();
  }

  /*
   * El panel de letras necesita alto para verse: en una ventana baja esta
   * oculto por CSS (.ytmpip-mini) y el boton pareceria no hacer nada. Por
   * eso, y solo en ese caso, se agranda la ventana.
   *
   * `auto: true` marca las aperturas que decide la extension (modo
   * karaoke), y esas NO redimensionan: agrandar la ventana que el usuario
   * dejo pequeña, sin que haya pedido nada, es pelearse con el. Si la
   * ventana es baja, el panel seguira oculto por CSS y lo que se vera es
   * la linea actual bajo el titulo.
   */
  function setLyricsVisible(visible, opts) {
    if (!els.lyricsPanel) return;
    const show = visible && YTMPip.Settings.get().lyricsPreference !== "hidden";
    els.lyricsPanel.hidden = !show;
    els.lyricsToggle.setAttribute("aria-expanded", String(show));
    // El microfono de cabecera es OTRO mando del MISMO panel: o su
    // aria-expanded dice lo mismo, o uno de los dos miente.
    if (els.micToggle) els.micToggle.setAttribute("aria-expanded", String(show));

    if (!show || (opts && opts.auto)) return;
    const size = measure();
    if (size && size.height < PIP_BREAKPOINTS.HEIGHT_TIGHT) {
      expanded = true;
      resizeWindow(PIP_DIMENSIONS.EXPANDED);
    }
  }

  /* El boton "Letras". Con nombre y fuera del cableado para que las
     pruebas pulsen ESTE manejador y no una imitacion suya. */
  function alternarPanelDeLetra() {
    const abrir = els.lyricsPanel.hidden;
    // Es la decision del usuario la que cuenta: si cierra, el modo
    // karaoke no vuelve a abrir el panel en esta ventana.
    lyricsClosedByUser = !abrir;
    // El hueco elastico es uno solo: abrir la letra es cerrar la cola.
    if (abrir && els.queuePanel && !els.queuePanel.hidden) setQueueVisible(false);
    /*
     * OPEN_LYRICS solo al ABRIR. Mandarlo tambien al cerrar parecia
     * inofensivo en YouTube Music (re-pulsar la pestaña ya seleccionada
     * no hace nada), pero el boton de letras de Spotify es un ALTERNADOR:
     * el comando del cierre CERRABA la vista de la pagina, y a la
     * siguiente apertura el controlador se abstenia (la vista ya estaba
     * "como pedida"... cerrada). Panel y pagina quedaban en contrafase
     * permanente: nuestro boton "no hacia nada". Cerrar NUESTRO panel no
     * toca la pagina a proposito: no se le cierra al usuario lo que el
     * dejo abierto en su pestaña.
     */
    if (abrir) runCommand(COMMAND_TYPES.OPEN_LYRICS);
    setLyricsVisible(abrir);
  }

  /*
   * El panel de la cola copia el criterio de alto del de letras (ver
   * setLyricsVisible): en una ventana baja esta oculto por CSS y el boton
   * pareceria no hacer nada, asi que solo en ese caso se agranda la
   * ventana. Aqui no hay variante `auto`: la cola no se abre nunca sola.
   */
  function setQueueVisible(visible) {
    if (!els.queuePanel) return;
    els.queuePanel.hidden = !visible;
    els.queueToggle.setAttribute("aria-expanded", String(visible));
    if (!visible) return;
    const size = measure();
    if (size && size.height < PIP_BREAKPOINTS.HEIGHT_TIGHT) {
      expanded = true;
      resizeWindow(PIP_DIMENSIONS.EXPANDED);
    }
  }

  /* El boton "Siguientes". Con nombre por lo mismo que el de letras. */
  function alternarPanelDeCola() {
    const abrir = els.queuePanel.hidden;
    if (abrir && els.lyricsPanel && !els.lyricsPanel.hidden) {
      /*
       * Cerrar la letra para dejar sitio cuenta como decision del usuario:
       * sin este flag, el modo karaoke la reabriria en el siguiente estado
       * y los dos paneles se pelearian por el mismo hueco.
       */
      lyricsClosedByUser = true;
      setLyricsVisible(false);
    }
    setQueueVisible(abrir);
  }

  /* ------------------------------------------------------------------
   * Atenuar la ventana mientras suena
   *
   * Lo pidio el usuario como "colocar transparente el pip mientras se
   * reproduce la musica". Conviene ser exacto con lo que hace y lo que no:
   * baja la opacidad del CONTENIDO, asi que por debajo se ve el fondo de la
   * propia ventana, no el escritorio. Una ventana de navegador de verdad
   * traslucida no depende de esta extension y esta sin comprobar; hay un
   * `tools/diagnostico-transparencia.js` para salir de dudas.
   * ------------------------------------------------------------------ */

  /**
   * La opacidad que le toca a la ventana. Pura y expuesta para probarla.
   *
   * Pausada vuelve entera SIEMPRE, y no es un capricho: la ventana medio
   * borrada es la señal de que la musica sigue: si tambien se atenuara en
   * pausa, el estado dejaria de distinguirse.
   *
   * No se acota el porcentaje aqui. El techo vive en PIP_LIMITS y lo
   * aplica la normalizacion; volver a ponerlo en esta linea seria tener el
   * mismo limite en dos sitios, que es como este proyecto se ha metido en
   * casi todos sus fallos.
   *
   * La cuenta se escribe (100 - t) / 100 y no 1 - t / 100 por un motivo
   * tonto pero visible: la segunda forma da 0.19999999999999996 para un 80,
   * y ese numero acabaria tal cual dentro de la variable CSS.
   */
  function opacidadDelPip(transparencia, sonando) {
    if (!sonando || !(transparencia > 0)) return 1;
    return (100 - transparencia) / 100;
  }

  /*
   * El porcentaje entra por argumento en vez de leerse aqui de las
   * preferencias. Los dos que llaman lo tienen ya: applySettings recibe el
   * objeto entero, y render puede pedirlo. Leerlo por dentro convertiria a
   * esta funcion en una segunda fuente de la misma preferencia, y ademas
   * haria imposible aplicar un valor que aun no este en la cache.
   */
  function aplicarAtenuado(sonando, transparencia) {
    if (!els.root) return;
    els.root.style.setProperty("--ytmpip-opacidad", String(opacidadDelPip(transparencia, sonando)));
  }

  // Preferencias -> UI. Se llama al abrir y en cada cambio en storage.
  function applySettings(settings) {
    if (!pipWindow || pipWindow.closed || !els.root) return;

    pipWindow.document.documentElement.classList.toggle("ytmpip-theme-light", settings.theme === "light");

    const seek = settings.seekSeconds;
    els.seekForward.setAttribute("aria-label", t("adelantar_segundos", [seek]));
    els.seekForward.title = t("adelantar_s", [seek]);
    els.seekBackward.setAttribute("aria-label", t("retroceder_segundos", [seek]));
    els.seekBackward.title = t("retroceder_s", [seek]);

    /*
     * El ecualizador se pinta desde aquí y sólo desde aquí, incluso cuando
     * el clic sale de esta misma ventana. Es la única forma de que el botón
     * diga la verdad: quien manda es lo guardado, y lo guardado puede
     * cambiarlo también la página de opciones con el PiP abierto.
     */
    pintarEcualizador(settings.equalizer);

    /*
     * El alto y el color del espectro salen por variables CSS y no por
     * estilos directos sobre el canvas: la hoja de estilos sigue siendo la
     * que decide COMO se coloca (posicion, opacidad, que no robe clics) y
     * estas dos solo le dan los numeros. Escribir aqui `height` a pelo
     * dejaria la maquetacion repartida entre dos archivos.
     *
     * El color se pone SIEMPRE, tambien cuando es el del tema: asi la
     * variable vuelve sola al acento al desmarcar el color propio. Dejar de
     * escribirla habria conservado el valor anterior para siempre.
     *
     * Que valores NO son un color lo dice `partirColor`, que es la misma
     * funcion que usa la pagina de opciones para saber si enseña el
     * cuentagotas. Escribir aqui la lista ("accent" o "rgb") la dejaria en
     * dos sitios, y el dia que aparezca un cuarto modo el espectro se
     * pondria a pintar con el nombre del modo como si fuera un color.
     */
    els.root.style.setProperty("--ytmpip-spectrum-height", settings.spectrumHeight + "%");
    els.root.style.setProperty(
      "--ytmpip-spectrum-color",
      YTMPip.Settings.partirColor(settings.spectrumColor).modo === "custom"
        ? settings.spectrumColor
        : "var(--ytmpip-accent)"
    );

    /*
     * Cambiar el modo de color en la pagina de opciones tiene que encender o
     * apagar el muestreo AL MOMENTO, con la ventana ya abierta. Sin esto,
     * elegir «Del video o la carátula» no haria nada hasta la siguiente
     * cancion —que es cuando vuelve a pasarse por `sincronizarEspectro`— y
     * apagarlo dejaria un temporizador leyendo fotogramas para nadie.
     *
     * El modo se pasa desde `settings`, no desde la cache: este manejador
     * corre TAMBIEN como suscriptor de storage, o sea antes de que lo nuevo
     * este guardado en `Settings.get()`.
     */
    sincronizarColorFuente(Boolean(els.spectrum && !els.spectrum.hidden), settings);

    // El atenuado depende ADEMAS de si la musica esta sonando, asi que el
    // valor lo pone render(); aqui solo se le pide que lo repase, porque
    // acaba de cambiar el porcentaje.
    if (lastState) aplicarAtenuado(lastState.playing, settings.pipTransparency);

    const lyricsOff = settings.lyricsPreference === "hidden";
    els.lyricsToggle.hidden = lyricsOff;
    if (lyricsOff) setLyricsVisible(false);
    // El microfono de cabecera sigue la MISMA llave, leida del hidden
    // recien escrito arriba: apagar las letras en preferencias lo apaga
    // al momento tambien en mini, sin esperar al proximo estado.
    sincronizarMicDeCabecera();

    // Desactivar el video en preferencias debe devolverlo al momento.
    if (settings.videoPreference === "hidden" && borrowedVideo) {
      returnVideo();
      videoMode = false;
      applyLayout();
    } else if (lastState) {
      syncVideoMode(lastState);
    }

    // Y el fondo Canvas igual: apagarlo (desde el boton de otra ventana
    // o donde sea que viva la preferencia) no puede esperar al proximo
    // estado, que tardaria un latido con el fondo mintiendo.
    if (lastState) sincronizarFondoCanvas(lastState);

    /*
     * El halo: primero se copian los settings a las variables del modulo
     * (este manejador corre tambien como suscriptor de storage, ANTES de
     * que la cache tenga lo nuevo — de ahi que se pase `settings` y no se
     * lea Settings.get()), y despues se repasa la conexion del audio,
     * porque cambiar el modo a latido con la ventana abierta tiene que
     * arrancar ya, no en la proxima cancion. El argumento de
     * sincronizarEspectro es la verdad YA PINTADA en el escenario: la
     * clase la puso applyLayout y aqui solo se lee.
     */
    sincronizarHalo(settings);
    if (lastState) sincronizarEspectro(els.root.classList.contains("ytmpip-lyrics-stage"));
  }

  /**
   * Pinta lo que el halo tiene de PREFERENCIA pura: la capa se ve o no, y
   * el boton ✨ cuenta lo que hara el proximo clic. Lo que depende del
   * audio (latir o no) NO esta aqui: eso lo decide sincronizarEspectro,
   * que es quien conoce al analizador.
   */
  function sincronizarHalo(settings) {
    haloEncendido = settings.haloPreference !== "hidden";
    haloModoLatido = settings.haloMode === "pulse";
    haloSigueLaFuente = settings.haloColor === MODO_FUENTE;
    if (els.halo) {
      els.halo.hidden = !haloEncendido;
      /*
       * El color: un hex propio se escribe en linea y "accent" QUITA la
       * variable en vez de escribir el color del tema. El CSS ya sabe caer
       * a var(--ytmpip-accent) cuando la variable no esta; copiar aqui el
       * valor del tema seria escribirlo por segunda vez y dejar de seguirlo
       * cuando el usuario cambie de tema. Se decide por la FORMA del valor
       * (empieza por #), la misma regla con la que se guardo.
       *
       * "source" es el tercer camino: pinta YA lo que el muestreo tenga
       * —en applySettings esta funcion corre DESPUES de
       * sincronizarColorFuente, o sea con el muestreo ya encendido y su
       * primera lectura hecha si habia video; la portada llega asincrona y
       * pintara sola al llegar— y sin nada muestreado el pintor quita la
       * variable, que es caer al acento hasta que haya color.
       */
      if (haloSigueLaFuente) {
        pintarColorFuenteEnHalo();
      } else if (String(settings.haloColor).charAt(0) === "#") {
        els.halo.style.setProperty("--ytmpip-halo-color", settings.haloColor);
      } else {
        els.halo.style.removeProperty("--ytmpip-halo-color");
      }
    }
    if (els.haloToggle) {
      els.haloToggle.setAttribute("aria-pressed", String(haloEncendido));
      els.haloToggle.title = haloEncendido ? t("quitar_halo") : t("ver_halo");
      els.haloToggle.setAttribute(
        "aria-label",
        haloEncendido ? t("ocultar_halo_luz") : t("mostrar_halo_luz")
      );
    }
  }

  /* ---------- Barra de progreso arrastrable ---------- */

  /*
   * El boton de repetir, con sus TRES posiciones.
   *
   * Sintoma reportado: "se oprime el boton de repetir pero no se si esta
   * activo o no; el de aleatorio si, porque cambia de cancion". Tenia
   * razon: hasta ahora el estado se leia del `aria-pressed` del boton de
   * YouTube Music, que no existe (es null), asi que la ventana se abstenia
   * siempre y el boton nunca se encendia.
   *
   * Un booleano no sirve aqui. Repetir va NONE -> ALL -> ONE, y con dos
   * estados habria que mentir en uno: "encendido" no distingue repetir la
   * lista de repetir esta cancion, que es justo lo que el usuario quiere
   * saber al pulsar. Por eso cambia el dibujo ademas del encendido.
   *
   * Con el modo desconocido se vuelve al comportamiento de antes: sin
   * `aria-pressed` y con el dibujo neutro. Preferimos no decir nada a decir
   * algo inventado.
   *
   * NONE y ALL comparten dibujo, y no es un descuido: lo que los separa es
   * el encendido (`aria-pressed`), que es color. ONE necesita dibujo propio
   * porque "repetir esta cancion" y "repetir la lista" estan los dos
   * encendidos y el color no puede distinguirlos.
   */
  const ICONO_REPETIR = { NONE: "repetir", ALL: "repetir", ONE: "repetir-una" };
  // Claves del catálogo, no frases: la frase la da t() en el idioma que toque.
  const ETIQUETA_REPETIR = {
    NONE: "repetir_desactivado",
    ALL: "repetir_lista",
    ONE: "repetir_cancion"
  };

  function pintarRepetir(modo) {
    if (!els.repeat) return;
    const conocido = modo === "NONE" || modo === "ALL" || modo === "ONE";
    Iconos.poner(els.repeat, conocido ? ICONO_REPETIR[modo] : "repetir");
    if (!conocido) {
      els.repeat.removeAttribute("aria-pressed");
      els.repeat.title = t("repetir");
      els.repeat.setAttribute("aria-label", t("repetir"));
      return;
    }
    els.repeat.setAttribute("aria-pressed", String(modo !== "NONE"));
    els.repeat.title = t(ETIQUETA_REPETIR[modo]);
    els.repeat.setAttribute("aria-label", t(ETIQUETA_REPETIR[modo]));
  }

  /* ---------- Velocidad de reproducción ---------- */

  /**
   * Cómo se escribe una velocidad para que la lea una persona.
   *
   * El signo de multiplicar de verdad (×, U+00D7), no una equis: "1.5x" es
   * como lo escribe un programador, "1,5×" es como se lee. El separador
   * decimal ya no está escrito aquí: es del idioma —coma en español, punto
   * en inglés— así que sale del catálogo como cualquier otro texto. Pura
   * mientras el catálogo no cambie, que es lo que la caché garantiza.
   */
  function textoVelocidad(rate) {
    return String(rate).replace(".", t("separador_decimal")) + "×";
  }

  /**
   * La siguiente posición del ciclo.
   *
   * BUSCA LA ACTUAL EN LA LISTA en vez de llevar un índice guardado, y esa
   * es toda la gracia. La velocidad de verdad la manda el <video>, no esta
   * ventana: si YouTube Music recarga la pista y la devuelve a 1×, un índice
   * propio seguiría creyendo que vamos por 1,5× y el siguiente clic saltaría
   * a 0,75× sin pasar por donde el usuario esperaba. Preguntándoselo al
   * estado, el ciclo siempre avanza desde lo que de verdad está sonando.
   *
   * Si la actual NO está en la lista —porque la puso otro, o porque quedó a
   * medias— `indexOf` da -1 y se aterriza en el primer valor, que es 1×.
   * Ver el comentario de PLAYBACK_RATES: ese orden está elegido para que
   * este caso caiga en la velocidad normal y no en la lenta.
   *
   * Pura.
   */
  function siguienteVelocidad(actual) {
    const i = PLAYBACK_RATES.indexOf(actual);
    return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
  }

  function pintarVelocidad(rate) {
    if (!els.speed) return;
    const valor = Number.isFinite(rate) && rate > 0 ? rate : PLAYBACK_RATE_NORMAL;
    const normal = valor === PLAYBACK_RATE_NORMAL;
    els.speed.textContent = textoVelocidad(valor);
    /*
     * El encendido marca "esto NO está como de fábrica", igual que en
     * repetir con NONE. A 1× el botón se queda neutro aunque siga estando
     * ahí: si se encendiera siempre, el color dejaría de significar nada.
     */
    els.speed.setAttribute("aria-pressed", String(!normal));
    const etiqueta = normal
      ? t("velocidad_normal")
      : t("velocidad_valor", [textoVelocidad(valor)]);
    els.speed.setAttribute("aria-label", etiqueta);
    els.speed.title = etiqueta;
  }

  /* ---------- Temporizador de apagado ---------- */

  /**
   * La siguiente posición del ciclo: apagado → 15 → 30 → 60 → apagado.
   *
   * Devuelve MINUTOS para el comando, con 0 significando "apágalo". Cicla
   * sobre lo que se PIDIÓ (`sleepTimer.minutes`), no sobre lo que queda:
   * el restante baja cada segundo y no está nunca en la lista. Es el mismo
   * criterio que la velocidad —preguntarle al estado, no al botón— y la
   * misma red: un valor que no esté en la lista (lo puso un comando raro)
   * aterriza en la primera opción, que es la corta.
   *
   * Pura.
   */
  function siguienteTemporizador(actualMin) {
    const i = SLEEP_TIMER_MINUTES.indexOf(actualMin);
    if (i === -1) return SLEEP_TIMER_MINUTES[0];
    // Después de la última opción toca apagar, no volver a empezar: un
    // ciclo sin salida sería un temporizador que no se puede quitar.
    if (i === SLEEP_TIMER_MINUTES.length - 1) return 0;
    return SLEEP_TIMER_MINUTES[i + 1];
  }

  /**
   * Deja el botón contando lo que hay: la luna si no hay plazo, y los
   * minutos que quedan si lo hay.
   *
   * EL NÚMERO VA CON PRIMA ("29′"), que es el símbolo de los minutos, por
   * el mismo criterio tipográfico que el "1,5×" de la velocidad: "29 min"
   * no cabe en un botón de 28 px sin empujar la fila. El `Math.ceil` no es
   * un redondeo cualquiera: techo, para que el botón nunca diga "0′"
   * mientras el plazo siga vivo —cero minutos con la música sonando sería
   * un cartel mintiendo—; el último minuto entero dice "1′".
   *
   * La cifra sólo avanza cuando cae un minuto, aunque esto se llame cuatro
   * veces por segundo: el texto que se escribe sale ya redondeado.
   */
  function pintarTemporizador(sleepTimer) {
    if (!els.sleep) return;
    const armado = Boolean(sleepTimer && Number.isFinite(sleepTimer.remainingMs));
    els.sleep.setAttribute("aria-pressed", String(armado));

    if (!armado) {
      Iconos.poner(els.sleep, "luna");
      const etiqueta = t("temporizador_apagado");
      els.sleep.setAttribute("aria-label", etiqueta);
      els.sleep.title = etiqueta;
      return;
    }

    const min = Math.max(1, Math.ceil(sleepTimer.remainingMs / 60000));
    const texto = min + "′";
    // Escribir textContent borra el SVG de la luna; se compara antes para
    // no tirar el nodo de texto y recrearlo cuatro veces por segundo.
    if (els.sleep.textContent !== texto) els.sleep.textContent = texto;
    const etiqueta =
      min === 1
        ? t("temporizador_menos_minuto")
        : t("temporizador_minutos", [min]);
    els.sleep.setAttribute("aria-label", etiqueta);
    els.sleep.title = etiqueta;
  }

  /**
   * Cómo se llama un valor del ecualizador para una persona: «apagado», la
   * etiqueta del preset, o «ajuste propio» para cinco números a mano.
   *
   * Era el cuerpo de `pintarEcualizador` y se sacó cuando la chincheta lo
   * necesitó también: su `title` dice QUÉ ajuste quedó fijado, y con la
   * regla dentro del otro pintado habría acabado escrita dos veces. Es la
   * regla de nombrar, no la de pintar; por eso se va ella y no se llama de
   * un pintado al otro.
   *
   * AHORA DICE CUÁL, y durante mucho tiempo no pudo.
   *
   * Aquí ponía que decir el nombre del ajuste era imposible sin repetirse,
   * porque «Más graves» y «Voz» estaban escritos en el desplegable de
   * options.html y copiarlos sería tenerlos en dos sitios. El razonamiento
   * era correcto y la conclusión estaba mal: lo que había que arreglar no
   * era este botón, era que el nombre de un preset viviera dentro del HTML
   * de una página. Se movió a EQUALIZER_PRESET_LABELS y entonces no hubo
   * nada que copiar. Renunciar a una función para no duplicar un dato suele
   * significar que el dato está en el sitio equivocado.
   *
   * Los cinco números a mano no tienen nombre que dar, y ahí sí se escribe
   * uno aquí —«ajuste propio»— sin ningún remordimiento: no es la copia de
   * ninguna etiqueta, es la descripción de un estado. El desplegable lo
   * llama «A mi gusto» porque allí es una opción que se elige; aquí es lo
   * que hay puesto.
   */
  function nombreDelAjuste(valor) {
    const Eq = YTMPip.Ecualizador;
    if (Eq.estaApagado(valor)) return t("eq_apagado");
    const preset = Eq.presetDe(valor);
    /*
     * `presetDe` devuelve null cuando lo guardado son cinco números.
     * `etiquetaPreset` pasa por el catálogo y cae en la constante —o en la
     * clave— si no hay etiqueta: es la misma red que pone options.js en el
     * desplegable, y por lo mismo —una opción muda es peor que una fea—.
     */
    return preset ? etiquetaPreset(preset) : t("eq_ajuste_propio");
  }

  /**
   * Deja el botón del ecualizador contando si está encendido y cuál hay.
   *
   * El valor entra por argumento, como en `aplicarAtenuado` y por lo mismo:
   * quien llama ya lo tiene (applySettings recibe el objeto entero), y
   * leerlo aquí dentro haría de esta función una segunda fuente de la misma
   * preferencia.
   *
   * El botón SIGUE SIENDO UN INTERRUPTOR: enciende y apaga, no pasa de un
   * preset al siguiente. Lo que cambia es lo que cuenta de sí mismo.
   */
  function pintarEcualizador(valor) {
    if (!els.eq) return;
    /*
     * EL INTERRUPTOR DE CAPACIDADES, aqui dentro y no en
     * aplicarCapacidades, porque este pintado corre con cada cambio de
     * preferencias y desharia un escondido de una sola vez. Sin grafo de
     * audio (audioGrafo: false, Spotify) el ecualizador es imposible, y
     * el peligro es doble porque la preferencia es GLOBAL: encendido en
     * YouTube Music, esta ventana pintaria el boton activo y las
     * barritas sobre una musica a la que no toca ni una banda — un mando
     * muerto Y encendido. Se esconden el boton, la chincheta y el
     * dibujo; la preferencia NO se toca, que en el sitio que si puede
     * siga sonando como estaba.
     */
    const sinGrafo = !capacidad("audioGrafo");
    els.eq.hidden = sinGrafo;
    if (els.eqPin) els.eqPin.hidden = sinGrafo;
    if (sinGrafo) {
      if (els.eqBandas) els.eqBandas.hidden = true;
      return;
    }
    const encendido = !YTMPip.Ecualizador.estaApagado(valor);
    els.eq.setAttribute("aria-pressed", String(encendido));

    const etiqueta = t("ecualizador_estado", [nombreDelAjuste(valor)]);
    els.eq.setAttribute("aria-label", etiqueta);
    els.eq.title = etiqueta;

    pintarBandasEcualizador(valor, encendido);
  }

  /**
   * Las barritas: la FORMA del ajuste, al lado del botón que dice su nombre.
   *
   * POR QUÉ ADEMÁS DEL NOMBRE. Porque el nombre puede mentir sin querer, y
   * el preset por defecto es el ejemplo: «Más graves» tiene los 60 Hz a
   * cero: no sube ningún grave, baja lo que compite con ellos. Quien lea el
   * nombre entenderá una cosa y quien mire el dibujo entenderá la que es.
   * Y para unos números a mano no hay nombre que valga: ahí el dibujo es lo
   * único que puede contar qué hay puesto.
   *
   * SE DIBUJA A PARTIR DE `ganancias()`, la misma función que usa la página
   * de opciones para colocar los deslizadores y la misma que usa el grafo
   * para montar los filtros. No hay ninguna conversión propia aquí: si el
   * dibujo y el sonido se separaran algún día, sería porque `ganancias`
   * cambió, y entonces se separarían los tres a la vez, que es lo correcto.
   *
   * APAGADO SE ESCONDE, no se dibuja plano. Cinco barras a cero y cinco
   * barras apagadas se verían casi igual, y significan cosas muy distintas:
   * "plano" cruza la puerta de createMediaElementSource y "off" no.
   */
  function pintarBandasEcualizador(valor, encendido) {
    const caja = els.eqBandas;
    if (!caja) return;

    caja.hidden = !encendido;
    if (!encendido) return;

    const { EQUALIZER_BANDS, EQUALIZER_LIMITS } = YTMPip.CONSTANTS;
    const dbs = YTMPip.Ecualizador.ganancias(valor);

    /*
     * Las barras se crean una vez y se reaprovechan. La condición mira el
     * NÚMERO de hijos, no si hay alguno: así una sexta banda en
     * EQUALIZER_BANDS reconstruye el dibujo en vez de dejarlo enseñando
     * cinco para siempre.
     */
    if (caja.childElementCount !== EQUALIZER_BANDS.length) {
      const doc = caja.ownerDocument;
      caja.textContent = "";
      for (let i = 0; i < EQUALIZER_BANDS.length; i++) {
        const columna = doc.createElement("span");
        columna.className = "ytmpip-eq-banda";
        columna.appendChild(doc.createElement("i"));
        caja.appendChild(columna);
      }
    }

    const partes = [];
    for (let i = 0; i < EQUALIZER_BANDS.length; i++) {
      const db = dbs[i] || 0;
      /*
       * El tope de cada lado por separado. Hoy son simétricos (±12) y
       * dividir siempre por GAIN_MAX daría lo mismo; el día que no lo sean,
       * las bajadas se saldrían del dibujo sin que nada avisara.
       */
      const tope = db >= 0 ? EQUALIZER_LIMITS.GAIN_MAX : Math.abs(EQUALIZER_LIMITS.GAIN_MIN);
      const alto = tope ? Math.min(Math.abs(db) / tope, 1) * 50 : 0;

      const barra = caja.children[i].firstElementChild;
      // Arriba del cero si sube; colgando de él si baja.
      barra.style.top = (db >= 0 ? 50 - alto : 50) + "%";
      barra.style.height = alto + "%";

      partes.push(etiquetaBanda(EQUALIZER_BANDS[i]) + " " + (db > 0 ? "+" : "") + db);
    }

    /*
     * Los números, en el `title`. El dibujo contesta "¿qué forma tiene?" de
     * un vistazo y esto contesta "¿cuánto exactamente?" a quien se pare a
     * preguntarlo, sin gastar un pixel de una ventana de 340 px.
     */
    caja.title = partes.join(" · ");
  }

  /**
   * El clic del interruptor: apagar, o volver a lo último que hubo.
   *
   * Las DOS preferencias se leen en la misma llamada a `get()`. Con dos
   * llamadas seguidas podrían caer a los lados de una recarga de la caché
   * —storage.onChanged la repone entera— y se apagaría un ecualizador para
   * encender el anterior de otro.
   *
   * No se pinta nada aquí: `guardarEcualizador` avisa a los suscriptores, y
   * `applySettings` es uno de ellos. Pintar además a mano sería dejar el
   * botón con dos maneras de moverse, y el día que discreparan ganaría la
   * de después, que no se sabe cuál es.
   */
  function alternarEcualizador() {
    const ajustes = YTMPip.Settings.get();
    const encendido = !YTMPip.Ecualizador.estaApagado(ajustes.equalizer);
    YTMPip.Settings.guardarEcualizador(
      encendido ? YTMPip.Ecualizador.APAGADO : ajustes.equalizerLast
    );
  }

  /**
   * Deja la chincheta contando la verdad: clavada si la canción que suena
   * tiene ecualizador fijado, y apagada del todo si aún no consta canción.
   *
   * No recibe el estado por argumento, al revés que `pintarEcualizador`, y
   * es la misma asimetría que el temporizador: la verdad de la memoria por
   * canción vive en YTMPip.EcualizadorPorCancion, EN ESTE MISMO REALM, y
   * preguntarle a él no puede quedarse viejo como una foto del estado.
   *
   * El `title` de la chincheta clavada dice QUÉ quedó fijado —«Fijado:
   * Nocturno»—, porque lo fijado puede no ser lo que suena ahora mismo (el
   * usuario puede tocar el ecualizador después de fijar) y un botón que
   * solo dijera "fijado" invitaría a creer que fijó lo de ahora.
   */
  function pintarMemoriaEcualizador() {
    if (!els.eqPin) return;
    const M = YTMPip.EcualizadorPorCancion;
    const hayCancion = Boolean(M && M.cancionActual() !== null);
    els.eqPin.disabled = !hayCancion;
    const fijado = hayCancion ? M.guardada() : null;
    els.eqPin.setAttribute("aria-pressed", String(fijado !== null));
    const etiqueta =
      fijado !== null
        ? t("fijado_a_cancion", [nombreDelAjuste(fijado)])
        : t("fijar_ecualizador");
    els.eqPin.setAttribute("aria-label", etiqueta);
    els.eqPin.title = etiqueta;
  }

  /*
   * El clic de la chincheta: fijar lo que suena, o soltar lo fijado. Como
   * el interruptor de al lado, NO va por `runCommand`: cambia una memoria
   * NUESTRA, no pide nada al reproductor.
   *
   * Se repinta AL MOMENTO, como el temporizador y por lo mismo: con la
   * música pausada el siguiente latido puede no llegar nunca, y una
   * chincheta que no se clava al clic parece rota. Aquí no hay suscriptor
   * que repinte por nosotros: fijar no cambia ninguna preferencia de
   * Settings (el ajuste ya sonaba), así que applySettings ni se entera.
   */
  function alternarMemoriaEcualizador() {
    const M = YTMPip.EcualizadorPorCancion;
    if (!M) return;
    if (M.guardada() !== null) M.olvidar();
    else M.recordar();
    pintarMemoriaEcualizador();
  }

  function paintSlider(input) {
    if (!input) return;
    const max = Number(input.max) || 0;
    const pct = max > 0 ? (Number(input.value) / max) * 100 : 0;
    input.style.setProperty("--ytmpip-played", `${pct}%`);
  }

  function showSeekPreview() {
    if (!els.seek || !els.seekPreview) return;
    const max = Number(els.seek.max) || 0;
    const value = Number(els.seek.value) || 0;
    els.seekPreview.textContent = formatTime(value);
    els.seekPreview.hidden = false;
    // El pulgar recorre el ancho util, no el ancho total: se corrige con
    // la mitad de su tamaño en cada extremo para que el globo lo siga.
    const ratio = max > 0 ? value / max : 0;
    const ancho = els.seek.offsetWidth || 0;
    const pulgar = 11;
    els.seekPreview.style.left = `${pulgar / 2 + ratio * (ancho - pulgar)}px`;
  }

  function wireSeekBar() {
    if (!els.seek) return;

    const empezar = () => {
      seeking = true;
      showSeekPreview();
    };

    els.seek.addEventListener("pointerdown", empezar);
    els.seek.addEventListener("keydown", empezar);

    els.seek.addEventListener("input", () => {
      seeking = true;
      paintSlider(els.seek);
      showSeekPreview();
      if (els.currentTime) els.currentTime.textContent = formatTime(Number(els.seek.value));
    });

    // "change" se dispara al soltar (raton) o al terminar con teclado.
    els.seek.addEventListener("change", () => {
      const destino = Number(els.seek.value);
      seeking = false;
      if (els.seekPreview) els.seekPreview.hidden = true;
      runCommand(COMMAND_TYPES.SEEK_TO, { seconds: destino });
    });

    /*
     * Soltar SIEMPRE termina el arrastre, aunque el valor no haya cambiado.
     *
     * `change` no basta y esta es la trampa: solo se dispara si el valor
     * cambio de verdad. Un clic sobre el pulgar donde ya estaba, o un
     * pointerdown y soltar sin mover, dejaban `seeking` en true para
     * siempre — y con el flag colgado render() deja de tocar la barra y el
     * contador: exactamente el mismo sintoma de "barra congelada" que
     * estabamos persiguiendo por otro lado. `blur` lo arreglaba, pero solo
     * cuando el foco se iba a otro sitio, que en una ventana con cuatro
     * botones puede tardar toda la cancion.
     */
    const terminar = () => {
      seeking = false;
      if (els.seekPreview) els.seekPreview.hidden = true;
    };

    els.seek.addEventListener("pointerup", terminar);
    els.seek.addEventListener("pointercancel", terminar);
    // Si el puntero se va sin soltar dentro, no dejamos el estado colgado.
    els.seek.addEventListener("blur", terminar);
  }

  /*
   * Poner el volumen en un porcentaje: mueve el control Y manda la orden.
   *
   * Existe porque ahora hay DOS formas de subir el volumen —arrastrar el
   * control y las flechas del teclado— y "cuanto es el volumen" no puede
   * ser una cuenta escrita en dos sitios. El deslizador ya trae su valor
   * puesto por el navegador y aqui se lo reasigna a si mismo, que no hace
   * nada; el teclado, en cambio, no tiene quien se lo ponga, y sin esta
   * linea el control se quedaria quieto mientras la musica sube.
   *
   * Lo que NO hace es tocar `changingVolume`: ese flag significa "el
   * usuario tiene el dedo encima, no le muevas el control por debajo", y
   * es cierto durante un arrastre y falso al pulsar una flecha. Lo pone
   * quien arrastra, que es el unico que lo sabe.
   */
  function mandarVolumen(porcentaje) {
    const nivel = Math.min(100, Math.max(0, Math.round(porcentaje)));
    if (els.volume) {
      els.volume.value = nivel;
      paintSlider(els.volume);
    }
    runCommand(COMMAND_TYPES.SET_VOLUME, { level: nivel / 100 });
    return nivel;
  }

  function wireVolume() {
    if (els.volume) {
      els.volume.addEventListener("input", () => {
        changingVolume = true;
        mandarVolumen(Number(els.volume.value));
      });
      els.volume.addEventListener("change", () => {
        changingVolume = false;
      });
      els.volume.addEventListener("blur", () => {
        changingVolume = false;
      });
    }
    if (els.mute) {
      els.mute.addEventListener("click", silenciar);
    }
  }

  /* ------------------------------------------------------------------
   * Acciones
   *
   * Cada una de estas funciones es UNA cosa que la ventana sabe hacer, y
   * existe como funcion con nombre —en vez de vivir dentro del listener
   * del boton— porque ahora hay dos maneras de pedirla: el boton y el
   * teclado. Si el atajo repitiera el cuerpo del listener, "que hace la
   * barra espaciadora" y "que hace el boton de play" serian dos reglas
   * distintas esperando a separarse: exactamente el error que este
   * proyecto lleva pagando desde el principio.
   * ------------------------------------------------------------------ */

  /*
   * TOGGLE_PLAY y no un PLAY/PAUSE calculado aqui. Antes esta funcion
   * leia el medio y elegia el comando: una SEGUNDA COPIA de la decision
   * que el controlador ya toma delante del <video> (sus pruebas lo
   * llaman "el comando de quien no sabe si suena"). En Spotify la copia
   * ademas mentia: sin medio en el DOM elegia PLAY siempre, sonara o
   * no, y solo funcionaba porque el clic ciego del controlador
   * degeneraba en alternador — dos errores cancelandose. El boton de
   * esta ventana ES un alternador; pide alternar y quien sabe decide.
   */
  function alternarReproduccion() {
    runCommand(COMMAND_TYPES.TOGGLE_PLAY);
  }

  function siguienteCancion() {
    runCommand(COMMAND_TYPES.NEXT_TRACK);
  }

  function cancionAnterior() {
    runCommand(COMMAND_TYPES.PREVIOUS_TRACK);
  }

  // Los segundos se leen en cada llamada (no se capturan al cablear) para
  // que un cambio en preferencias tenga efecto sin reabrir la ventana.
  function adelantar() {
    runCommand(COMMAND_TYPES.SEEK_FORWARD, { seconds: YTMPip.Settings.get().seekSeconds });
  }

  function retroceder() {
    runCommand(COMMAND_TYPES.SEEK_BACKWARD, { seconds: YTMPip.Settings.get().seekSeconds });
  }

  function silenciar() {
    runCommand(COMMAND_TYPES.TOGGLE_MUTE);
  }

  /*
   * El paso del volumen con las flechas. Cinco y no uno: con uno haria
   * falta pulsar veinte veces para notar algo. Y no diez, porque el
   * volumen es lo unico de esta ventana que no tiene deshacer: pasarse es
   * un susto en los auriculares.
   */
  const PASO_VOLUMEN = 5;

  /*
   * De donde sale "el volumen de ahora": del propio deslizador, que es lo
   * que el usuario esta viendo. Leerlo del <video> seria mas directo pero
   * mentiria en el unico caso que importa: con el sonido silenciado el
   * control marca 0 y el video conserva su volumen, asi que subir desde el
   * video daria un salto que no se corresponde con nada de lo que hay en
   * pantalla.
   */
  function volumenActual() {
    if (!els.volume) return 0;
    const valor = Number(els.volume.value);
    return Number.isFinite(valor) ? valor : 0;
  }

  function subirVolumen() {
    mandarVolumen(volumenActual() + PASO_VOLUMEN);
  }

  function bajarVolumen() {
    mandarVolumen(volumenActual() - PASO_VOLUMEN);
  }

  /* ------------------------------------------------------------------
   * Atajos de teclado
   * ------------------------------------------------------------------ */

  /*
   * Que tecla hace que. Los nombres de la izquierda son los de
   * KeyboardEvent.key; los de la derecha, acciones de ACCIONES.
   *
   * La eleccion no es mia: son las mismas que YouTube lleva usando toda
   * la vida (k para pausar, j y l para saltar diez segundos, m para
   * silenciar). Inventarme otras seria pedirle al usuario que aprenda un
   * teclado nuevo para la misma musica.
   */
  const ATAJOS = {
    " ": "reproduccion",
    k: "reproduccion",
    ArrowRight: "adelantar",
    l: "adelantar",
    ArrowLeft: "retroceder",
    j: "retroceder",
    ArrowUp: "subirVolumen",
    ArrowDown: "bajarVolumen",
    n: "siguiente",
    p: "anterior",
    m: "silenciar"
  };

  /*
   * Que acciones aguantan que se mantenga la tecla pulsada.
   *
   * Dejar el dedo en la flecha para subir el volumen poco a poco es lo
   * que cualquiera espera. Dejarlo en la "n" salta treinta canciones en
   * dos segundos, y de eso no se vuelve: la cola ya no esta donde estaba.
   * Pausar treinta veces seguidas tampoco tiene sentido.
   */
  const ADMITEN_REPETICION = ["adelantar", "retroceder", "subirVolumen", "bajarVolumen"];

  /*
   * Tipos de <input> que NO se escriben con letras. Cualquier otro tipo
   * —incluido el vacio, que para el navegador es "text"— es un campo de
   * texto, y en un campo de texto la "m" es una eme y no un silenciador.
   *
   * Va escrito por lo que NO es a proposito: la lista de tipos que si son
   * de texto (text, search, url, email, tel, password, date, number…)
   * crece con cada version de HTML, y olvidarse de uno significa comerse
   * lo que el usuario escribe. Olvidarse en esta lista, en cambio, solo
   * significa que un atajo no funciona en un control raro.
   */
  const TIPOS_QUE_NO_ESCRIBEN = [
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit"
  ];

  /*
   * Que atajo corresponde a una pulsacion, o null si ninguno.
   *
   * `pulsacion`: { key, ctrl, alt, meta, repetida }.
   * `foco`: { etiqueta, tipo, rol, editable } — lo que hay enfocado, ya
   * leido del DOM por focoDe(). Se pasa como datos y no como elemento
   * para que esta funcion sea pura y se pueda probar entera sin montar
   * una ventana flotante, que es justo lo que jsdom no puede darme.
   *
   * El orden de las reglas es el orden de las prioridades, y todas dicen
   * lo mismo: el navegador ya tenia dueño para esas teclas y esta ventana
   * no es quien para quitarselo.
   *
   * Pura y expuesta para poder probarla.
   */
  function atajoPara(pulsacion, foco) {
    if (!pulsacion || !pulsacion.key) return null;
    const donde = foco || {};

    // 1. Con Ctrl, Alt o Cmd la combinacion es del navegador o del
    //    sistema (Ctrl+W cierra, Alt+Flecha navega). Ni tocarlas.
    if (pulsacion.ctrl || pulsacion.alt || pulsacion.meta) return null;

    // 2. Donde se escribe, se escribe. Ninguna tecla es un atajo dentro
    //    de un campo de texto ni de algo editable.
    if (donde.editable) return null;
    if (donde.etiqueta === "textarea") return null;
    if (donde.etiqueta === "input" && TIPOS_QUE_NO_ESCRIBEN.indexOf(donde.tipo) === -1) return null;

    /*
     * Se normaliza DESPUES de descartar los campos de texto: en un campo
     * de texto da igual si la tecla era "M" o "m", no se toca ninguna de
     * las dos. Solo las teclas de una letra se pasan a minuscula; hacerlo
     * con todas convertiria "ArrowUp" en "arrowup" y el mapa dejaria de
     * encontrarla.
     */
    const tecla = pulsacion.key.length === 1 ? pulsacion.key.toLowerCase() : pulsacion.key;

    /*
     * 3. Un deslizador enfocado se mueve con las flechas, y eso es suyo.
     *    Robarselo para el volumen dejaria la barra de tiempo imposible
     *    de usar con teclado. Solo se comprueban las flechas y no Inicio,
     *    Fin o AvPag —que el deslizador tambien atiende— porque esta
     *    funcion no las reclama: una guardia contra una tecla que nadie
     *    pide es codigo que no hace nada y que nadie descubre roto.
     */
    const esFlecha = tecla === "ArrowUp" || tecla === "ArrowDown" || tecla === "ArrowLeft" || tecla === "ArrowRight";
    const deslizador = donde.etiqueta === "input" && donde.tipo === "range";
    if (deslizador && esFlecha) return null;
    if (donde.etiqueta === "select" && esFlecha) return null;

    /*
     * 4. Un boton enfocado se pulsa con la barra espaciadora. Sin esto,
     *    tabular hasta "siguiente" y pulsar espacio pausaria la musica en
     *    vez de cambiar de cancion, que es lo contrario de lo que el foco
     *    esta prometiendo.
     *
     *    Se mira el ROL y no solo la etiqueta porque las lineas de la
     *    letra son <div role="button" tabindex="0">: son botones para
     *    todo el mundo menos para un `tagName === "button"`.
     *
     *    Enter no aparece aqui por lo mismo que Inicio y Fin: no esta en
     *    ATAJOS, asi que no hay nada que devolverle a nadie.
     */
    const esBoton = donde.etiqueta === "button" || donde.rol === "button";
    if (esBoton && tecla === " ") return null;

    if (!Object.prototype.hasOwnProperty.call(ATAJOS, tecla)) return null;
    const accion = ATAJOS[tecla];

    // 5. Y lo ultimo, mantener la tecla pulsada.
    if (pulsacion.repetida && ADMITEN_REPETICION.indexOf(accion) === -1) return null;

    return accion;
  }

  /*
   * Traduce el elemento enfocado a los cuatro datos que atajoPara mira.
   * Es la unica parte que toca el DOM, y es deliberadamente tonta: todo
   * lo que decida algo vive en la funcion pura de arriba.
   */
  function focoDe(el) {
    if (!el) return { etiqueta: "", tipo: "", rol: "", editable: false };
    return {
      etiqueta: String(el.tagName || "").toLowerCase(),
      tipo: String(el.type || "").toLowerCase(),
      rol: el.getAttribute ? String(el.getAttribute("role") || "").toLowerCase() : "",
      editable: Boolean(el.isContentEditable)
    };
  }

  const ACCIONES = {
    reproduccion: alternarReproduccion,
    adelantar: adelantar,
    retroceder: retroceder,
    siguiente: siguienteCancion,
    anterior: cancionAnterior,
    subirVolumen: subirVolumen,
    bajarVolumen: bajarVolumen,
    silenciar: silenciar
  };

  function manejarAtajo(event) {
    const accion = atajoPara(
      {
        key: event.key,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
        repetida: event.repeat
      },
      focoDe(event.target)
    );
    if (!accion) return;
    /*
     * Solo se corta el evento cuando el atajo se queda con el: la barra
     * espaciadora hace scroll y las flechas mueven el panel de la letra, y
     * las dos cosas ademas de la accion serian un salto raro. Cuando
     * atajoPara devuelve null no se llama a esto, y por eso escribir en un
     * campo de texto sigue funcionando igual que antes.
     */
    event.preventDefault();
    ACCIONES[accion]();
  }

  /*
   * Los atajos van en el DOCUMENTO de la ventana flotante, no en el de la
   * pestaña: son de esta ventana y solo funcionan cuando la tiene el foco.
   * Poner atajos globales en music.youtube.com seria pisar los suyos, que
   * ya existen y son estos mismos.
   *
   * Es una funcion de una linea porque el banco de pruebas tambien la
   * llama: si el registro estuviera escrito dentro de wireEvents, las
   * pruebas tendrian que repetirlo, y entonces estarian probando SU
   * cableado en vez del de la ventana de verdad.
   */
  function cablearAtajos(doc) {
    if (!doc) return;
    doc.addEventListener("keydown", manejarAtajo);
  }

  function wireEvents() {
    els.playPause.addEventListener("click", alternarReproduccion);
    els.next.addEventListener("click", siguienteCancion);
    els.previous.addEventListener("click", cancionAnterior);
    els.seekForward.addEventListener("click", adelantar);
    els.seekBackward.addEventListener("click", retroceder);

    /*
     * El documento se pide a los propios elementos y no a pipWindow: son
     * el mismo en la ventana de verdad, pero el banco de pruebas monta la
     * interfaz en un documento aparte —jsdom no sabe abrir ventanas
     * flotantes— y preguntarle a la ventana devolveria el documento de la
     * pestaña. Los atajos tienen que ir donde esta la interfaz.
     */
    cablearAtajos(els.root ? els.root.ownerDocument : null);
    // Mismo documento y por el mismo motivo que los atajos.
    cablearQuietud(els.root ? els.root.ownerDocument : null);

    wireSeekBar();
    wireVolume();

    els.like.addEventListener("click", () => runCommand(COMMAND_TYPES.TOGGLE_LIKE));
    els.repeat.addEventListener("click", () => runCommand(COMMAND_TYPES.TOGGLE_REPEAT));
    els.shuffle.addEventListener("click", () => runCommand(COMMAND_TYPES.TOGGLE_SHUFFLE));

    /*
     * El comando lleva la velocidad FINAL, no un "acelera". Así el ciclo
     * vive en un solo sitio —aquí— y el content script se limita a escribir
     * el número: si algún día el popup quiere ofrecer las mismas
     * velocidades, comparte la lista, no una segunda copia del ciclo.
     *
     * Se arranca de `lastState` y no de lo que ponga el botón. Son la misma
     * cosa mientras nada falle, pero el texto del botón es una FOTO de lo
     * último que se pintó y el estado es lo que dice el <video> ahora; leer
     * el botón sería preguntarle a la interfaz por la verdad en vez de al
     * reproductor.
     */
    if (els.speed) {
      els.speed.addEventListener("click", () => {
        const actual = lastState && Number.isFinite(lastState.playbackRate)
          ? lastState.playbackRate
          : PLAYBACK_RATE_NORMAL;
        runCommand(COMMAND_TYPES.SET_PLAYBACK_RATE, { rate: siguienteVelocidad(actual) });
      });
    }

    /*
     * El temporizador de apagado, calcado de la velocidad en lo esencial:
     * viaja el número final en minutos (0 = apágalo) y el ciclo vive aquí.
     *
     * PERO NO SE ARRANCA DE `lastState`, y la diferencia está pensada. La
     * velocidad lee el estado porque su verdad vive en el <video> y el
     * estado es su reflejo más fresco. La verdad del temporizador es
     * YTMPip.TemporizadorApagado, que vive EN ESTE MISMO REALM —igual que
     * runCommand ejecuta PlayerController en local—, así que se le
     * pregunta a él. Leer `lastState` aquí tendría dos agujeros que la
     * velocidad no tiene: dos clics dentro del rebote de 150 ms ciclarían
     * desde el mismo sitio (15 → 15 en vez de 15 → 30), y con la música
     * PAUSADA no hay latido, o sea que el estado podría llevar parado
     * desde ayer.
     *
     * Por lo mismo se repinta AL MOMENTO: pausado, el siguiente latido
     * puede no llegar nunca, y un botón que no reacciona al clic parece
     * roto.
     */
    if (els.sleep) {
      els.sleep.addEventListener("click", () => {
        const T = YTMPip.TemporizadorApagado;
        if (!T) return;
        const puesto = T.estado();
        runCommand(COMMAND_TYPES.SET_SLEEP_TIMER, {
          minutes: siguienteTemporizador(puesto ? puesto.minutes : 0)
        });
        pintarTemporizador(T.estado());
      });
    }

    /*
     * El ecualizador NO va por `runCommand`. Los demás botones piden algo al
     * reproductor de YouTube Music, que es quien manda sobre el <video>;
     * éste cambia una PREFERENCIA NUESTRA, y quien manda sobre eso es
     * storage. El cable que monta el grafo ya escucha ese cambio (ver
     * `sincronizarEcualizador` en content-script.js), así que mandar además
     * un comando sería pedir dos veces lo mismo por dos caminos.
     */
    if (els.eq) els.eq.addEventListener("click", alternarEcualizador);
    if (els.eqPin) els.eqPin.addEventListener("click", alternarMemoriaEcualizador);

    if (els.videoToggle) els.videoToggle.addEventListener("click", alternarEscenario);
    if (els.nativePip) els.nativePip.addEventListener("click", alternarPipNativo);
    if (els.canvasToggle) els.canvasToggle.addEventListener("click", alternarFondoCanvas);
    if (els.cleanToggle) els.cleanToggle.addEventListener("click", alternarSoloCaratula);
    /*
     * El clic es ademas la activacion de usuario que el AudioContext
     * necesita para arrancar sin quedarse suspendido: por eso `conectar`
     * ocurre dentro de este render sincrono y no en un await posterior.
     */
    if (els.spectrumToggle) els.spectrumToggle.addEventListener("click", alternarEspectro);
    if (els.pulsoToggle) els.pulsoToggle.addEventListener("click", alternarPulso);
    if (els.haloToggle) els.haloToggle.addEventListener("click", alternarHalo);

    els.lyricsToggle.addEventListener("click", alternarPanelDeLetra);
    // El microfono de cabecera es la MISMA orden dicha desde otro sitio:
    // el mismo manejador, no una copia con politica propia (ver
    // sincronizarMicDeCabecera para cuando se enseña).
    if (els.micToggle) els.micToggle.addEventListener("click", alternarPanelDeLetra);
    if (els.queueToggle) els.queueToggle.addEventListener("click", alternarPanelDeCola);

    /*
     * Letra interactiva. Un solo manejador delegado para todas las lineas:
     * se crean de nuevo con cada cancion y cablearlas una a una seria
     * repetir el error de los listeners irrecuperables.
     */
    if (els.lyricsLines) {
      const saltarALinea = (target) => {
        const lineaEl = target && target.closest ? target.closest(".ytmpip-lyric-line") : null;
        if (!lineaEl) return;
        const item = lyricLineEls.find((l) => l.el === lineaEl);
        if (!item || item.time === null) return;
        runCommand(COMMAND_TYPES.SEEK_TO, { seconds: item.time });
        // Saltar a una linea es querer verla: el autodesplazamiento vuelve.
        userScrollUntil = 0;
      };
      els.lyricsLines.addEventListener("click", (event) => saltarALinea(event.target));
      els.lyricsLines.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        saltarALinea(event.target);
      });
    }

    if (els.lyricsPanel) {
      // Scroll manual detectado: el autodesplazamiento se aparta un rato.
      const apartarse = () => {
        userScrollUntil = Date.now() + 4000;
      };
      els.lyricsPanel.addEventListener("wheel", apartarse, { passive: true });
      els.lyricsPanel.addEventListener("touchmove", apartarse, { passive: true });
    }

    if (els.nowLine) {
      // La linea actual es la miniatura de la letra: un clic la despliega.
      els.nowLine.addEventListener("click", () => {
        lyricsClosedByUser = false;
        setLyricsVisible(true);
      });
    }
    // El ⤢ ahora es lo unico que cambia el TAMAÑO de la ventana a peticion
    // del usuario; la maquetacion la deduce sola de lo que mida despues.
    els.expandToggle.addEventListener("click", () => {
      expanded = !expanded;
      resizeWindow(expanded ? PIP_DIMENSIONS.EXPANDED : PIP_DIMENSIONS.COMPACT);
    });
    els.backToTab.addEventListener("click", () => {
      // El content script no puede enfocar su propia pestaña: solo el
      // service worker tiene chrome.tabs.update / chrome.windows.update.
      sendMessageSafe(
        createMessage(MESSAGE_TYPES.COMMAND, { command: createCommand(COMMAND_TYPES.FOCUS_SOURCE_TAB) })
      ).then((response) => {
        if (!response || !response.ok) {
          console.warn("[YTMPip] No se pudo enfocar la pestaña de YouTube Music", response);
          if (els.status) {
            els.status.textContent = t("no_se_pudo_volver");
          }
        }
      });
    });
    els.close.addEventListener("click", closePip);
  }

  function closePip() {
    // El video se devuelve en "pagehide", que tambien cubre el cierre
    // hecho por el usuario desde el boton del navegador.
    if (pipWindow && !pipWindow.closed) pipWindow.close();
    pipWindow = null;
  }

  function requestFallbackWindow() {
    sendMessageSafe(createMessage(MESSAGE_TYPES.OPEN_FALLBACK_WINDOW));
  }

  async function openPip() {
    // Abrir una ventana nueva si necesita la extension viva: pip.html y
    // pip.css se cargan como web_accessible_resources.
    if (!YTMPip.isContextValid()) {
      console.info("[YTMPip] La extension se recargo; recarga la pestaña (F5) antes de abrir el PiP.");
      return;
    }
    if (!supported()) {
      requestFallbackWindow();
      return;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.focus();
      return;
    }

    // Lectura SINCRONA de la cache de preferencias: un await aqui, antes
    // de requestWindow(), consumiria la activacion de usuario del clic.
    const settings = YTMPip.Settings.get();
    const initialDims = dimensionesIniciales(settings.pipSize, settings.pipLastSize);
    expanded = initialDims.expandida;

    pipWindow = await documentPictureInPicture.requestWindow({
      width: initialDims.width,
      height: initialDims.height
    });

    const link = pipWindow.document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/pip/pip.css");
    pipWindow.document.head.append(link);

    pipWindow.document.body.innerHTML = await loadTemplate();
    cacheElements(pipWindow.document);
    wireEvents();
    videoMode = false;
    autoSizedForVideo = false;
    // Ventana nueva, decision nueva: el usuario no ha pedido nada todavia.
    coverPorPeticion = false;
    letraOcupaEscenario = false;
    rolDelEscenario = null;
    soloCaratula = false;
    espectroPedido = false;
    espectroDisponible = false;
    pulsoPedido = false;
    pulsoActivo = false;
    // El halo: lo que dura una sesion muere con ella. El gesto NO se
    // hereda de la ventana anterior (regla del AudioContext), y haloLate
    // lo recalculara sincronizarEspectro. Encendido y modo NO se tocan:
    // son preferencia, y applySettings los repone enseguida.
    haloLate = false;
    gestoEnSesion = false;
    // El fondo Canvas: pagehide ya solto el chorro de la ventana anterior,
    // pero si aquella murio sin despedirse las variables seguirian
    // apuntando a un chorro de otra vida. Soltar dos veces no cuesta nada.
    apagarFondoCanvas();
    // El rAF de la ventana anterior murio con su documento; la variable no.
    animacionFrame = null;
    // Y su temporizador de anotar el tamaño, igual: murio con ella, pero la
    // variable seguiria apuntando a un numero de otra ventana y el primer
    // clearTimeout de esta se lo pediria a la ventana equivocada.
    anotarTamanoTimer = null;
    // Y la cuenta atras de los mandos, por lo mismo.
    quietoTimer = null;

    // Ventana nueva, letra desde cero: los elementos de la anterior
    // murieron con su documento.
    clearLyricLines();
    lyricsClosedByUser = false;
    userScrollUntil = 0;
    /*
     * El temporizador cuelga de pipWindow a proposito: sus timers mueren
     * con la ventana, asi que no puede quedar un tick huerfano resaltando
     * lineas de un documento que ya no existe. 300 ms es suficiente para
     * que el resalte parezca instantaneo sin hacer trabajo de mas.
     *
     * Un solo latido para la barra y la letra: las dos leen el mismo
     * <video> y no tiene sentido consultarlo dos veces por tick.
     */
    lyricsTimer = pipWindow.setInterval(() => {
      tickTimeline();
      tickLyrics();
    }, 300);

    watchWindowSize();
    applyLayout();
    applySettings(YTMPip.Settings.get());

    // "Seccion abierta por defecto": si es letras, se abre el panel (lo
    // que ademas fuerza el modo ampliado) y se pide a YouTube Music que
    // cargue su pestaña de letras para tener contenido que mostrar.
    if (YTMPip.Settings.get().defaultSection === "lyrics") {
      runCommand(COMMAND_TYPES.OPEN_LYRICS);
      setLyricsVisible(true);
    }

    pipWindow.addEventListener("pagehide", () => {
      /*
       * Lo PRIMERO, y a mano: quien mueve el borde y cierra la ventana
       * inmediatamente deja un temporizador de anotar pendiente, y ese
       * temporizador muere con la ventana sin llegar a escribir. Aqui la
       * ventana todavia se puede medir; tres lineas mas abajo ya no.
       *
       * Va escrito dentro de este manejador, y no como un listener suyo
       * registrado en watchWindowSize(), porque el orden importa: los
       * manejadores corren en el orden en que se registraron y este acaba
       * poniendo pipWindow a null. Un segundo listener funcionaria hoy y
       * dejaria de funcionar el dia que alguien mueva una linea, en
       * silencio y sin que ninguna prueba se entere.
       */
      anotarTamanoYa();
      // Devolver el video ANTES de soltar la ventana: despues los
      // elementos de su documento quedan inservibles.
      returnVideo();
      videoMode = false;
      /*
       * El chorro del Canvas NO muere con la ventana: captureStream corre
       * en la PAGINA, como el AudioContext. Sin esto quedaria copiando
       * cuadros para un <video> que ya no existe.
       */
      apagarFondoCanvas();
      /*
       * El AudioContext NO muere con la ventana: cuelga del content script,
       * que sigue vivo en la pestaña. Sin este cierre quedaria un analizador
       * abierto por cada vez que se abre y se cierra el PiP.
       */
      pararAnimacion();
      /*
       * Y el muestreo del color por lo mismo, aunque su temporizador si
       * cuelgue de la ventana y muera con ella: lo que NO muere es el color
       * leido, que se quedaria en las variables del content script y se
       * pintaria en la siguiente apertura antes de la primera lectura. Un
       * espectro que nace con el color de la cancion anterior.
       */
      pararMuestreoFuente();
      YTMPip.Espectro.desconectar();
      // Los timers de la ventana mueren con ella; aqui solo se sueltan
      // las referencias a elementos que ya no existen.
      lyricsTimer = null;
      lyricLineEls = [];
      lyricsSignature = "";
      activeLyricIndex = -1;
      lineaSegunLaPagina = -1;
      letraConTiempos = false;
      pipWindow = null;
      unsubscribeSettings();
    });

    unsubscribeSettings = YTMPip.Settings.subscribe(applySettings);

    if (lastState) render(lastState);
  }

  /* ------------------------------------------------------------------
   * Letra sincronizada
   *
   * Con Better Lyrics cada linea llega con el segundo en que empieza a
   * cantarse (data-time), asi que la letra deja de ser un bloque estatico:
   * la linea que suena se resalta, la lista se desplaza sola hasta ella y
   * un clic sobre cualquier linea salta a ese momento de la cancion.
   *
   * La letra nativa de YouTube Music (LyricFind) no trae tiempos: se
   * pinta por lineas igualmente, pero sin resaltar ni saltar. Preferimos
   * no animar nada a fingir una sincronizacion inventada.
   *
   * La de Spotify tampoco trae tiempos, pero trae otra cosa: la PAGINA
   * marca que linea se canta (state.lyrics.activeLine, medido
   * 2026-09-16) y ese indice enciende el resalte, el desplazamiento y la
   * letra en grande. Lo que NO enciende es el salto con clic: saltar
   * necesita un tiempo al que ir, y sigue sin haberlo.
   * ------------------------------------------------------------------ */

  /**
   * Que linea esta sonando en el segundo `currentTime`: la de mayor tiempo
   * de inicio que ya haya empezado. -1 si ninguna ha empezado o si la
   * letra no trae tiempos.
   *
   * Pura y expuesta para poder probarla, como timelineFor. Dos detalles
   * con intencion:
   *  - No se asume que las lineas vengan ordenadas: se busca el maximo,
   *    no el ultimo del recorrido.
   *  - Las lineas con time null se SALTAN. Compararlas directamente seria
   *    una trampa silenciosa: null <= 30 es true en JavaScript (null se
   *    convierte en 0) y todas las lineas de una letra sin tiempos
   *    pasarian el filtro como si empezaran en el segundo 0.
   */
  function activeLyricAt(lines, currentTime) {
    if (!Array.isArray(lines) || !Number.isFinite(currentTime)) return -1;
    let mejor = -1;
    let mejorTiempo = -Infinity;
    for (let i = 0; i < lines.length; i++) {
      const linea = lines[i];
      if (!linea || !Number.isFinite(linea.time)) continue;
      if (linea.time <= currentTime && linea.time >= mejorTiempo) {
        mejor = i;
        mejorTiempo = linea.time;
      }
    }
    return mejor;
  }

  function clearLyricLines() {
    lyricLineEls = [];
    lyricsSignature = "";
    activeLyricIndex = -1;
    lineaSegunLaPagina = -1;
    letraConTiempos = false;
    if (els.lyricsLines) els.lyricsLines.textContent = "";
    ocultarLineaEnVivo();
  }

  /**
   * Pinta la letra linea a linea. La firma evita reconstruir el DOM en
   * cada render (que llega con cada timeupdate): solo se rehace cuando la
   * letra de verdad cambia, es decir, al cambiar de cancion o de fuente.
   */
  function buildLyricLines(lines) {
    const firma = lines.map((l) => `${l.time}\u0000${l.text}`).join("\n");
    if (firma === lyricsSignature) return;

    lyricsSignature = firma;
    activeLyricIndex = -1;
    lineaSegunLaPagina = -1;
    /*
     * Que fuente de sincronia manda se decide UNA vez por letra, aqui:
     * con algun tiempo a la vista manda el reloj (late aqui mismo cada
     * 300 ms y ademas permite saltar con un clic); sin tiempos, si la
     * pagina marca la linea, manda la pagina. Decidirlo en cada tick
     * seria recorrer la letra entera tres veces por segundo.
     */
    letraConTiempos = lines.some((linea) => Number.isFinite(linea.time));
    els.lyricsLines.textContent = "";

    const doc = pipWindow.document;
    lyricLineEls = lines.map((linea) => {
      const p = doc.createElement("p");
      p.className = "ytmpip-lyric-line";
      // Una linea en blanco es un separador de estrofa: ocupa su hueco.
      p.textContent = linea.text || "\u00A0";
      const time = Number.isFinite(linea.time) ? linea.time : null;
      if (time !== null) {
        p.classList.add("ytmpip-lyric-clickable");
        // Interactiva tambien con teclado: cada linea con tiempo es un
        // boton de "saltar a este momento".
        p.setAttribute("role", "button");
        p.tabIndex = 0;
        p.setAttribute("aria-label", t("ir_a", [formatTime(time), linea.text]));
      }
      els.lyricsLines.appendChild(p);
      return { el: p, time };
    });
  }

  /** El panel puede estar "abierto" pero oculto por CSS (ventana baja). */
  function lyricsPanelDisplayed() {
    if (!pipWindow || !els.lyricsPanel || els.lyricsPanel.hidden) return false;
    return pipWindow.getComputedStyle(els.lyricsPanel).display !== "none";
  }

  /*
   * Cuantas lineas siguientes se dejan escritas. El cuanto de VERDAD lo
   * decide el CSS por densidad: en una ventana baja sobran y se ocultan.
   * Se preparan aqui para no tener el numero en dos sitios.
   */
  const LINEAS_SIGUIENTES = 3;

  function proximasLineas(desde) {
    const textos = [];
    for (let i = desde + 1; i < lyricLineEls.length && textos.length < LINEAS_SIGUIENTES; i++) {
      const texto = lyricLineEls[i].el.textContent;
      // Los separadores de estrofa son un espacio duro. Como adelanto no
      // dicen nada, asi que se saltan y se enseña el verso de despues: la
      // pregunta que responde esto es "que frase viene", no "cuanto falta".
      if (!texto || texto === "\u00A0") continue;
      textos.push(texto);
    }
    return textos;
  }

  function pintarProximas(textos) {
    if (!els.nextLines) return;
    if (!textos.length) {
      els.nextLines.hidden = true;
      els.nextLines.textContent = "";
      els.nextLines.dataset.firma = "";
      return;
    }
    const firma = textos.join("\n");
    // Sin esta comparacion se reconstruirian los <p> en cada latido (varias
    // veces por segundo) y la letra parpadearia.
    if (els.nextLines.dataset.firma !== firma) {
      els.nextLines.dataset.firma = firma;
      els.nextLines.textContent = "";
      for (const texto of textos) {
        const p = pipWindow.document.createElement("p");
        p.className = "ytmpip-next-line";
        p.textContent = texto;
        els.nextLines.appendChild(p);
      }
    }
    els.nextLines.hidden = false;
  }

  /*
   * La linea que suena y su adelanto se esconden SIEMPRE juntos: dejar el
   * adelanto solo, sin la frase actual encima, seria letra suelta sin
   * contexto. Un unico sitio que lo haga evita que se separen.
   */
  function ocultarLineaEnVivo() {
    if (els.nowLine) els.nowLine.hidden = true;
    pintarProximas([]);
  }

  function updateNowLine() {
    if (!els.nowLine || !els.root) return;
    const item = activeLyricIndex >= 0 ? lyricLineEls[activeLyricIndex] : null;
    /*
     * Solo con letra sincronizada —por tiempo (la linea trae el suyo) o
     * por la pagina (el indice activo es el que ella marca)—, solo sin
     * video (con video manda el video) y solo si el panel completo no
     * esta ya a la vista: dos veces la misma linea en pantalla es ruido.
     */
    const sincronizada = Boolean(item) && (item.time !== null || activeLyricIndex === lineaSegunLaPagina);
    const show = sincronizada && els.root.classList.contains("ytmpip-karaoke") && !lyricsPanelDisplayed();
    if (!show) {
      ocultarLineaEnVivo();
      return;
    }
    els.nowLine.hidden = false;
    pintarProximas(proximasLineas(activeLyricIndex));
    const texto = item.el.textContent;
    if (els.nowLine.textContent !== texto) {
      els.nowLine.textContent = texto;
      // Reinicia la animacion de entrada: quitar la clase, forzar reflow,
      // ponerla. Sin el reflow el navegador funde ambos cambios y no
      // reproduce nada.
      els.nowLine.classList.remove("ytmpip-line-swap");
      void els.nowLine.offsetWidth;
      els.nowLine.classList.add("ytmpip-line-swap");
    }
  }

  /**
   * Cuanto hay que desplazar el panel para dejar la linea centrada. Pura y
   * a partir de rectangulos, no de offsetTop: offsetTop se mide contra el
   * antepasado posicionado, que no tiene por que ser el panel.
   */
  function centrarEnElPanel(cajaLinea, cajaPanel, scrollActual) {
    const relativa = cajaLinea.top - cajaPanel.top;
    return scrollActual + relativa - (cajaPanel.height - cajaLinea.height) / 2;
  }

  /*
   * EL FALLO REPORTADO: "al cambiar la ventana de tamaño aparece el error
   * visual en la parte inferior" y "se oculta la opcion de poner video". Los
   * dos eran esto, y el diagnostico lo dijo en una linea: body.scrollTop
   * valia 43.6, asi que la cabecera entera estaba en y=-36..-10, fuera de la
   * ventana por arriba, y con ella el boton de video.
   *
   * Lo provocaba scrollIntoView, que desplaza TODOS los antepasados con
   * scroll hasta dejar el elemento a la vista, no solo el panel. Y el
   * `overflow: hidden` de html/body no protege: prohibe el scroll del
   * usuario, no el programatico. Por eso el CSS parecia correcto y la vista
   * previa no reproducia nada — alli no corre este temporizador.
   *
   * Se desplaza el panel a mano y punto: ningun antepasado se entera.
   */
  function scrollLyricIntoView(el) {
    if (!lyricsPanelDisplayed()) return;
    // El usuario esta leyendo otra parte: no se le arranca el scroll.
    if (Date.now() < userScrollUntil) return;
    const panel = els.lyricsPanel;
    if (!panel) return;
    const reducido =
      typeof pipWindow.matchMedia === "function" &&
      pipWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = centrarEnElPanel(el.getBoundingClientRect(), panel.getBoundingClientRect(), panel.scrollTop);
    panel.scrollTo({ top: top, behavior: reducido ? "auto" : "smooth" });
  }

  function setActiveLyric(idx) {
    const previo = lyricLineEls[activeLyricIndex];
    if (previo) previo.el.classList.remove("ytmpip-lyric-active");

    activeLyricIndex = idx;
    const actual = idx >= 0 ? lyricLineEls[idx] : null;
    if (actual) {
      actual.el.classList.add("ytmpip-lyric-active");
      scrollLyricIntoView(actual.el);
    }
    updateNowLine();
  }

  /*
   * El latido de la letra. Va por temporizador propio (y no dentro de
   * render) porque el resalte debe seguir al segundo actual aunque no
   * cambie nada mas del estado.
   *
   * Tambien por TrackTimeline: los `data-time` de la letra son de la
   * PISTA (empiezan en cero) y el <video> de YouTube Music va acumulando
   * la cola entera. Comparar los unos con el otro funciona en la primera
   * cancion de la sesion y se va desfasando en las siguientes, justo lo
   * que le pasaba a la barra.
   */
  function tickLyrics() {
    if (!pipWindow || pipWindow.closed || !lyricLineEls.length) return;
    let idx;
    if (letraConTiempos) {
      // El reloj manda. Sin medio que leer no se decide nada: apagar el
      // resalte porque el <video> desaparecio un instante seria mentir.
      if (!YTMPip.Adapter.getMediaElement()) return;
      idx = activeLyricAt(lyricLineEls, YTMPip.TrackTimeline.read().elapsed);
    } else {
      /*
       * Sin tiempos manda la PAGINA, y para eso no hace falta medio
       * ninguno: el indice ya llego con el estado (en Spotify modo
       * audio no hay <video> que consultar, y con la puerta de arriba
       * el resalte no se moveria jamas). -1 cuando la pagina no marca
       * nada, que apaga el resalte: una letra sin ninguna fuente de
       * sincronia es un bloque estatico, como siempre fue.
       */
      idx = lineaSegunLaPagina;
    }
    if (idx !== activeLyricIndex) setActiveLyric(idx);
    else updateNowLine();
  }

  /*
   * Los tres estados se distinguen visualmente. Antes "cargando" y "no
   * disponible" se veian casi igual, y el usuario no sabia si esperar o
   * si la cancion simplemente no tenia letra.
   */
  function renderLyrics(lyrics) {
    const disponible = lyrics.status === LYRICS_STATUS.AVAILABLE;
    els.lyricsText.classList.toggle("ytmpip-placeholder", !disponible);

    const lineas = disponible && Array.isArray(lyrics.lines) && lyrics.lines.length ? lyrics.lines : null;

    if (els.lyricsLines) {
      els.lyricsLines.hidden = !lineas;
      if (lineas) {
        buildLyricLines(lineas);
        /*
         * El indice de la pagina se recoge SIEMPRE que hay lineas, no
         * solo al reconstruirlas: viaja con cada estado y cambia mucho
         * mas a menudo que la letra. Si el sitio se abstiene (undefined,
         * o un indice fuera de la letra pintada), -1: mejor apagar el
         * resalte que dejarlo clavado en un verso que ya no se canta.
         */
        lineaSegunLaPagina =
          Number.isInteger(lyrics.activeLine) && lyrics.activeLine >= 0 && lyrics.activeLine < lyricLineEls.length
            ? lyrics.activeLine
            : -1;
      } else {
        clearLyricLines();
      }
    }
    els.lyricsText.hidden = Boolean(lineas);

    if (disponible) {
      if (!lineas) els.lyricsText.textContent = lyrics.text;
      // La atribucion de la fuente se muestra porque es la licencia bajo
      // la que YouTube Music sirve el texto.
      els.lyricsSource.textContent =
        lyrics.source && lyrics.source !== "youtube-music" ? t("fuente", [lyrics.source]) : "";
      return;
    }

    els.lyricsSource.textContent = "";
    if (lyrics.status === LYRICS_STATUS.LOADING) {
      els.lyricsText.textContent = t("cargando_letras");
    } else if (lyrics.status === LYRICS_STATUS.ERROR) {
      els.lyricsText.textContent = t("error_letras");
    } else {
      els.lyricsText.textContent = t("sin_letra");
    }
  }

  /*
   * La cola se repinta SOLO si cambio: render() llega con cada timeupdate
   * (debounced) y reconstruir cinco nodos cuatro veces por segundo seria
   * tirar trabajo. La firma son titulos y artistas, lo mismo que se pinta:
   * si la firma coincide, lo pintado coincide.
   *
   * Se pinta aunque el panel este cerrado, a proposito: son cinco filas, y
   * asi abrir el panel es solo quitar un `hidden`, sin un estado "abierto
   * pero aun sin contenido" que haga parecer roto el boton.
   */
  let lastQueueSignature = null;

  function renderQueue(state) {
    if (!els.queueList) return;
    const canciones = Array.isArray(state.upNext) ? state.upNext : [];
    const firma = canciones.map((c) => c.title + "|" + c.artist).join("~");
    if (firma === lastQueueSignature) return;
    lastQueueSignature = firma;

    els.queueEmpty.hidden = canciones.length > 0;
    els.queueList.hidden = canciones.length === 0;

    const doc = els.queueList.ownerDocument;
    els.queueList.replaceChildren(
      ...canciones.map((cancion) => {
        const li = doc.createElement("li");
        li.className = "ytmpip-queue-item";
        const titulo = doc.createElement("span");
        titulo.className = "ytmpip-queue-title";
        titulo.textContent = cancion.title;
        const artista = doc.createElement("span");
        artista.className = "ytmpip-queue-artist";
        artista.textContent = cancion.artist || "";
        li.append(titulo, artista);
        return li;
      })
    );
  }

  function renderExtras(state) {
    // "Me gusta": es el unico de los tres cuyo estado real conocemos, via
    // el atributo like-status (independiente del idioma).
    const conocido = state.likeStatus !== undefined;
    els.like.hidden = !conocido;
    if (conocido) {
      const gustado = state.likeStatus === LIKE_STATUS.LIKE;
      els.like.setAttribute("aria-pressed", String(gustado));
      // Dos dibujos y no uno relleno con CSS: el hueco del corazon vacio
      // es parte del trazo, no un relleno que se pueda quitar. El COLOR
      // sigue viniendo de `[aria-pressed="true"]`, como en el resto.
      Iconos.poner(els.like, gustado ? "corazon-lleno" : "corazon");
      els.like.setAttribute("aria-label", gustado ? t("quitar_me_gusta") : t("me_gusta"));
    }

    // Repetir y aleatorio: se ocultan si YouTube Music no ofrece el boton,
    // porque un boton que no hace nada es peor que ningun boton.
    els.repeat.hidden = !YTMPip.Adapter.getRepeatButton();
    els.shuffle.hidden = !YTMPip.Adapter.getShuffleButton();
    pintarRepetir(state.repeatMode);
    // aria-pressed solo cuando de verdad se sabe (ver isToggleActive).
    if (state.shuffleOn === undefined) els.shuffle.removeAttribute("aria-pressed");
    else els.shuffle.setAttribute("aria-pressed", String(state.shuffleOn));

    // Volumen: no se toca mientras el usuario arrastra el control.
    if (!changingVolume && els.volume) {
      const nivel = Number.isFinite(state.volume) ? Math.round(state.volume * 100) : 100;
      els.volume.value = state.muted ? 0 : nivel;
      paintSlider(els.volume);
    }
    pintarVelocidad(state.playbackRate);
    pintarTemporizador(state.sleepTimer);
    // La chincheta se repinta con cada estado porque el cambio de cancion
    // llega por aqui: alSonar ya corrio (va antes que este render en el
    // latido), asi que la memoria contesta por la cancion que se ve.
    pintarMemoriaEcualizador();

    if (els.mute) {
      const silenciado = Boolean(state.muted) || state.volume === 0;
      Iconos.poner(els.mute, silenciado ? "volumen-mudo" : "volumen");
      els.mute.setAttribute("aria-label", silenciado ? t("quitar_silencio") : t("silenciar"));
      els.mute.setAttribute("aria-pressed", String(silenciado));
    }
  }

  /*
   * Que enseñar en la barra y en el contador, a partir de lo que dice el
   * <video>. Funcion pura para poder probarla: la maquetacion ya me enseño
   * que lo que no se puede probar se rompe en silencio.
   *
   * EL FALLO QUE ORIGINO ESTO: la barra se acotaba con Math.min(t, dur)
   * pero el contador de texto pintaba `state.currentTime` a pelo. En cuanto
   * el reproductor daba un tiempo mayor que la duracion -- al encadenar la
   * siguiente cancion, cuando el elemento aun no ha publicado la duracion
   * nueva -- las dos mitades de la misma informacion se contradecian: los
   * digitos seguian subiendo mientras la barra estaba clavada en el tope.
   *
   * La invariante, y esta si se puede sostener: EL CONTADOR Y LA BARRA
   * NUNCA SE CONTRADICEN. Salen los dos del mismo numero.
   *
   * Si la duracion no se conoce (0, NaN o Infinity, que es lo que devuelve
   * un MediaSource al que aun no le han fijado la duracion) no se arrastra
   * el tiempo de la pista anterior: se muestra 0:00 y la barra se
   * deshabilita. Preferimos decir "todavia no lo se" a mentir con
   * seguridad, y dura lo que tarde el siguiente `timeupdate`.
   */
  function timelineFor(currentTime, duration) {
    const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const raw = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
    return {
      duration: dur,
      elapsed: dur ? Math.min(raw, dur) : 0,
      seekable: dur > 0
    };
  }

  /*
   * El UNICO sitio que pinta la barra y las dos etiquetas de tiempo.
   *
   * Lo pintan dos llamadores (render, con el estado que llega por mensaje,
   * y tickTimeline, leyendo el <video> directamente) y por eso tiene que
   * ser una sola funcion: la invariante "el contador y la barra nunca se
   * contradicen" no sobrevive a dos copias del mismo calculo, que fue
   * exactamente como se rompio la primera vez.
   */
  function paintTimeline(linea) {
    if (!els.duration) return;
    els.duration.textContent = formatTime(linea.duration);

    // La barra no se toca mientras el usuario la esta arrastrando: seria
    // un tira y afloja entre su dedo y las actualizaciones del reproductor.
    if (seeking || !els.seek) return;

    // Los cuatro salen del MISMO numero. Ver timelineFor.
    els.seek.max = linea.duration;
    els.seek.value = linea.elapsed;
    /*
     * Dos motivos para deshabilitar, cada uno con su dueño: sin duracion
     * conocida no hay donde saltar (lo dice timelineFor), y sin NINGUNA
     * via de escritura el salto no tiene sobre que escribir. La segunda
     * pregunta dejo de ser solo el medio: en Spotify el arrastre acaba
     * en el range de la pagina via seekPageTo (medido en vivo con salto
     * audible), asi que la barra se habilita tambien por esa via. La
     * barra se queda VISIBLE incluso sin ninguna: el progreso si
     * funciona —sale de la pagina— y quitarla entera castigaria lo
     * vivo por culpa de lo muerto.
     */
    els.seek.disabled = !linea.seekable || !saltosPosiblesAhora();
    els.seek.setAttribute(
      "aria-valuetext",
      `${formatTime(linea.elapsed)} de ${formatTime(linea.duration)}`
    );
    paintSlider(els.seek);
    els.currentTime.textContent = formatTime(linea.elapsed);
  }

  /*
   * El latido de la barra: lee el <video> que suena AHORA y repinta.
   *
   * Por que existe, que es la parte que importa. La barra se alimentaba
   * SOLO de los mensajes del content script, y ese camino tiene cuatro
   * eslabones: acertar con el <video> vivo -> tener los listeners puestos
   * en ese elemento -> que el mensaje se envie -> que llegue. Si cualquiera
   * se rompe, la barra se queda clavada donde estaba y no hay nada que la
   * recupere. Eso es "se junta el tiempo entre canciones", reportado tres
   * veces, y cada arreglo anterior tapaba UN eslabon.
   *
   * La letra, en cambio, nunca se congelo ("va sincronizado perfecto"):
   * porque su resalte lee currentTime del elemento cada 300 ms y no
   * depende de ningun mensaje. Misma ventana, mismo elemento, dos niveles
   * de fiabilidad completamente distintos. Esto le da a la barra el mismo
   * latido: se repara sola en 300 ms sin importar cual de los cuatro
   * eslabones haya fallado.
   *
   * No sustituye a render(): el estado sigue trayendo titulo, portada,
   * "me gusta" y letra, que no se pueden leer del <video>.
   */
  function tickTimeline() {
    if (!pipWindow || pipWindow.closed || !els.seek) return;
    /*
     * El interruptor de capacidades se re-consulta AQUI, en el mismo
     * latido y ANTES de rendirse por falta de medio, porque en Spotify
     * el medio va y viene POR PISTA (las de video lo tienen, las de
     * audio no) y un escondido de una sola vez al montar se quedaria
     * mintiendo al primer cambio de modo. En YouTube Music esto no
     * cuesta ni parpadea: con la capacidad declarada la funcion ni
     * mira el DOM.
     */
    aplicarCapacidades();
    if (!YTMPip.Adapter.getMediaElement()) return;
    /*
     * Por TrackTimeline y no por `media.currentTime`: el <video> de YouTube
     * Music lleva TODA la cola en una sola linea de tiempo, asi que su
     * tiempo y su duracion son acumulados. Leerlos a pelo es exactamente lo
     * que hacia que los tiempos se sumaran entre canciones.
     */
    const { elapsed, duration } = YTMPip.TrackTimeline.read();
    paintTimeline(timelineFor(elapsed, duration));
  }

  /*
   * Reacciona al cambio de canción con las dos caras de la misma noticia:
   * la animación para quien mira y el anuncio aria-live para quien no.
   * Van juntas porque comparten la única pregunta que importa —¿esto que
   * llegó es OTRA canción?— y contestarla en dos sitios sería tener dos
   * copias de lastSongKey desincronizándose en silencio.
   *
   * La PRIMERA canción no se anuncia ni se anima a propósito: no es un
   * cambio, es el estado con el que la ventana nace, y quien acaba de
   * abrirla tiene el título delante (su lector puede leerlo del propio
   * nodo). El anuncio existe para el momento contrario: la música avanzó
   * sola mientras nadie miraba la ventana.
   */
  function alCambiarDeCancion(state) {
    const key = `${state.title || ""}|${state.artist || ""}`;
    if (key === lastSongKey) return;
    const primera = lastSongKey === "";
    lastSongKey = key;
    if (primera || !pipWindow) return;

    /*
     * Sin título no hay anuncio: «Ahora suena» sin canción es ruido en el
     * oído de quien no puede ignorarlo con la vista. La región ya existe en
     * el HTML desde el montaje (los lectores sólo vigilan regiones que
     * conocían); aquí sólo se escribe el texto.
     */
    if (els.anuncio && state.title) {
      els.anuncio.textContent = state.artist
        ? t("ahora_suena_de", [state.title, state.artist])
        : t("ahora_suena", [state.title]);
    }

    if (!els.info) return;
    els.info.classList.add("ytmpip-changing");
    pipWindow.setTimeout(() => {
      if (els.info) els.info.classList.remove("ytmpip-changing");
    }, 200);
  }

  function render(state) {
    lastState = state;
    if (!pipWindow || pipWindow.closed || !els.root) return;

    if (degraded) {
      // El PiP sigue leyendo la pagina y controlando la reproduccion; lo
      // unico roto es el puente con el service worker (y por tanto el
      // boton "volver a la pestaña").
      els.status.textContent = t("extension_recargada");
      els.status.classList.add("disconnected");
    } else {
      els.status.textContent = state.connected ? t("conectado") : t("desconectado");
      els.status.classList.toggle("disconnected", !state.connected);
    }

    alCambiarDeCancion(state);
    const hayVideoQueAlternar = syncVideoMode(state);

    /*
     * Modo karaoke: sin video y con letra, la letra pasa a ser la
     * protagonista del hueco que el video no ocupa. El panel se abre solo
     * (sin redimensionar la ventana: eso seria decidir por el usuario) y,
     * cuando el panel no cabe, la linea que suena aparece bajo el titulo.
     */
    const karaoke =
      !videoMode &&
      Boolean(state.lyrics && state.lyrics.status === LYRICS_STATUS.AVAILABLE) &&
      YTMPip.Settings.get().lyricsPreference !== "hidden";
    els.root.classList.toggle("ytmpip-karaoke", karaoke);

    /*
     * Letra en grande: la portada deja el escenario y pasa a ser el fondo
     * difuminado, que ya se construia con esa misma imagen. No es un modo
     * nuevo de la ventana, es el mismo karaoke sin la miniatura delante.
     *
     * Solo cabe ofrecerlo cuando no hay video: con videoclip el escenario
     * ya esta ocupado y el boton significa otra cosa.
     */
    const letraEnGrande = karaoke && !hayVideoQueAlternar && letraOcupaEscenario;
    els.root.classList.toggle("ytmpip-lyrics-stage", letraEnGrande);
    // Con la letra en grande los mandos pasan a flotar encima, y quien
    // decide eso es layoutFor. Va DESPUES de la clase a proposito: es de
    // ahi de donde applyDensity lee la respuesta.
    applyDensity();

    // El boton se pinta con las dos respuestas ya calculadas, nunca
    // recalculandolas.
    pintarBotonDeEscenario(hayVideoQueAlternar, karaoke);
    pintarBotonPipNativo(state);
    sincronizarFondoCanvas(state);

    /*
     * "Solo la imagen" no depende de la cancion: si el usuario lo pidio, se
     * respeta tambien con video y con la letra en grande. Es lo que dice el
     * boton —quita el texto— y anadirle excepciones seria inventar
     * combinaciones que nadie ha pedido.
     */
    els.root.classList.toggle("ytmpip-sin-texto", soloCaratula);
    pintarBotonLimpio();

    // Despues de syncVideoMode: si la ventana acaba de tomar prestado el
    // <video>, el espectro tiene que engancharse a ESE elemento.
    sincronizarEspectro(letraEnGrande);

    /*
     * El panel se abre solo en dos casos, y solo se decide aqui. Que la
     * letra ocupe el escenario IMPLICA el panel abierto: sin el, quitar la
     * portada dejaria la ventana vacia. Por eso `letraEnGrande` pasa por
     * encima del "lo cerre yo" — es una peticion nueva y posterior. Esa
     * regla estuvo tambien en el manejador del clic hasta que la
     * verificacion por mutacion enseño que sobraba: se podia romper una de
     * las dos copias sin que ninguna prueba se enterase.
     */
    /*
     * Con la COLA abierta el karaoke no abre la letra: el usuario acaba de
     * pedir ese hueco para otra cosa, y abrirsela encima seria pelearse
     * con el. Cubre tambien `letraEnGrande`, que solo puede estar activo
     * por un estado anterior: el clic que abrio la cola ya cerro el panel.
     */
    const colaAbierta = els.queuePanel && !els.queuePanel.hidden;
    if (
      els.lyricsPanel &&
      els.lyricsPanel.hidden &&
      !colaAbierta &&
      (letraEnGrande || (karaoke && !lyricsClosedByUser))
    ) {
      setLyricsVisible(true, { auto: true });
    }
    if (!karaoke) ocultarLineaEnVivo();

    els.title.textContent = state.title || t("sin_reproduccion");
    els.title.title = state.title || "";
    els.artist.textContent = state.artist || "";
    els.album.textContent = state.album || "";

    const art = state.artworkUrl || getURLSafe("assets/placeholders/artwork.svg");
    els.artwork.src = art;
    els.artwork.alt = state.title ? t("portada_de", [state.title]) : t("sin_portada");
    if (els.backdrop) {
      // Se reutiliza la portada ya descargada: sin peticion extra.
      els.backdrop.style.backgroundImage = state.artworkUrl ? `url("${state.artworkUrl}")` : "";
      els.backdrop.classList.toggle("ytmpip-has-art", Boolean(state.artworkUrl));
    }

    paintTimeline(timelineFor(state.currentTime, state.duration));

    els.playPause.setAttribute("aria-label", state.playing ? t("pausar") : t("reproducir"));
    Iconos.poner(els.playPause, state.playing ? "pausar" : "reproducir");
    aplicarAtenuado(state.playing, YTMPip.Settings.get().pipTransparency);

    renderExtras(state);
    renderLyrics(state.lyrics || {});
    renderQueue(state);
  }

  function setDegraded(value) {
    degraded = Boolean(value);
    if (lastState) render(lastState);
  }

  YTMPip.PipView = {
    open: openPip,
    close: closePip,
    onStateUpdate: render,
    ensureLauncher: ensureLauncherButton,
    destacarLanzador: destacarLanzador,
    setDegraded: setDegraded,
    // Se exponen solo para poder probarlas: son las unicas decisiones de
    // maquetacion que no necesitan una ventana flotante real.
    atajoPara: atajoPara,
    // colorDePaleta NO se reexporta aqui a proposito: se prueba donde vive,
    // en YTMPip.Paleta. Reexportarla daria dos nombres para una funcion y
    // una prueba que pasara por este apodo no diria nada de la de verdad.
    densityFor: densityFor,
    dimensionesIniciales: dimensionesIniciales,
    layoutFor: layoutFor,
    timelineFor: timelineFor,
    activeLyricAt: activeLyricAt,
    barrasParaAncho: barrasParaAncho,
    matizRgb: matizRgb,
    opacidadDelPip: opacidadDelPip,

    /*
     * Banco de pruebas de la barra de tiempo.
     *
     * Abrir la ventana de verdad necesita documentPictureInPicture, que
     * jsdom no tiene, asi que durante mucho tiempo TODO lo que pasaba
     * dentro de la ventana quedo sin pruebas. El precio se ha pagado tres
     * veces con el mismo fallo: la barra congelada al encadenar canciones.
     *
     * Esto monta los elementos sobre un documento cualquiera para poder
     * ejercitar el latido. No es un atajo para probar la ventana entera:
     * es el minimo para que "la barra se repara sola" deje de depender de
     * que yo lea bien el codigo.
     */
    __bancoDePruebas: {
      /*
       * Monta la interfaz y la cablea ENTERA, con wireEvents, que es lo
       * mismo que corre al abrir la ventana de verdad.
       *
       * Antes solo cableaba la barra de tiempo, que era lo unico que
       * alguna prueba necesitaba. Cablear solo un trozo tenia una trampa
       * fina: al añadir el cableado del teclado hacia falta ademas el de
       * los botones para poder comparar unos con otros, y dos entradas
       * distintas al banco significaban que llamar a las dos registraba la
       * barra de tiempo dos veces —y un solo arrastre mandaba dos saltos—.
       * Una sola puerta no tiene ese problema.
       */
      montar(win, doc) {
        pipWindow = win;
        cacheElements(doc);
        wireEvents();
      },
      // Anotar el tamaño AHORA, sin esperar el medio segundo del rebote:
      // es lo que hace "pagehide" cuando alguien cierra recien movido el
      // borde, y lo unico de esta parte que se puede ejercitar sin una
      // ventana flotante de verdad.
      anotarTamanoAhora: anotarTamanoYa,
      /*
       * Engancha el vigilante del tamaño a la ventana. En la ventana de
       * verdad lo llama openPip; aqui hace falta llamarlo a mano porque
       * openPip necesita documentPictureInPicture, que jsdom no tiene.
       *
       * Lo que si se puede ejercitar es lo de dentro: el evento "resize"
       * de una ventana jsdom es un evento normal y corriente.
       */
      vigilarTamano: watchWindowSize,
      /*
       * Desvanecer los mandos AHORA, sin esperar los tres segundos. El
       * temporizador de verdad lo arranca `cablearQuietud`, que ya corre
       * dentro de `montar`; esto es para poder comprobar el resultado sin
       * que la prueba tenga que dormir tres segundos de reloj.
       */
      ocultarMandosAhora: ocultarMandosYa,
      claseQuieto: CLASE_QUIETO,
      tickTimeline: tickTimeline,
      estaArrastrando: () => seeking,
      syncVideoMode: syncVideoMode,
      prestarVideo: borrowVideo,
      videoPrestado: () => borrowedVideo,
      // El manejador de verdad, no una copia suya: es la misma funcion que
      // cablea wireEvents() al boton.
      pulsarAlternarVideo: alternarEscenario,
      pulsarLetras: alternarPanelDeLetra,
      /*
       * El pintor del boton de escenario de verdad, el que llama render()
       * con las dos respuestas hechas (¿hay video?, ¿hay letra?). Las
       * pruebas del microfono de cabecera necesitan mover el rol sin
       * montar un estado entero, y una imitacion del pintor probaria la
       * imitacion.
       */
      pintarEscenario: pintarBotonDeEscenario,
      pulsarSoloCaratula: alternarSoloCaratula,
      pulsarEspectro: alternarEspectro,
      pulsarPulso: alternarPulso,
      // El mismo manejador al que se suscribe la ventana de verdad, no una
      // copia: es lo unico que traduce preferencias a variables CSS.
      aplicarPreferencias: applySettings,
      pideCover: () => coverPorPeticion,
      pideLetraEnGrande: () => letraOcupaEscenario,
      pideSoloCaratula: () => soloCaratula,
      pideEspectro: () => espectroPedido,
      pidePulso: () => pulsoPedido,
      pulsaAhora: () => pulsoActivo,
      // El manejador real del ✨, y la verdad del latido del halo (el par
      // pedido/activo del pulso, en version halo).
      pulsarHalo: alternarHalo,
      haloLateAhora: () => haloLate,
      sincronizarEspectro: sincronizarEspectro,
      /*
       * El color de la fuente, por la puerta de atras. Lo que NO se puede
       * ejercitar aqui es la lectura de pixeles —jsdom no pinta, asi que
       * `getImageData` devuelve ceros— y por eso el muestreo no esta
       * expuesto: fingirlo daria una prueba que solo comprueba el fingido.
       *
       * Lo que si es de verdad es lo de despues: puesto un color objetivo,
       * que `dibujarEspectro` lo lleve al `fillStyle` suavizado, y que
       * apagar el modo lo olvide. Eso son las dos costuras entre el modulo
       * puro y la ventana, que es donde se rompen las cosas.
       */
      fijarColorFuente: (hsl) => {
        colorFuenteObjetivo = hsl;
      },
      colorFuentePintado: () => colorFuenteActual,
      sincronizarColorFuente: sincronizarColorFuente,
      // El bucle de verdad, para poder pasarle un reloj y comprobar que el
      // pulso llega a la variable CSS sin esperar a un rAF real.
      unFotograma: fotograma,
      proximasLineas: proximasLineas,
      centrarEnElPanel: centrarEnElPanel,
      refrescarLineaEnVivo: updateNowLine,
      fijarLineaActiva: setActiveLyric,
      // El latido de la letra de verdad, el mismo que corre cada 300 ms
      // en la ventana: es donde vive la regla de que fuente de sincronia
      // manda (el reloj si hay tiempos, la pagina si no).
      latidoDeLetra: tickLyrics
    }
  };

  /*
   * Red de seguridad: si la pestaña se descarga con el PiP abierto, hay
   * que devolver el <video> igualmente. Sin esto, YouTube Music podria
   * quedarse sin su elemento multimedia en una recarga.
   */
  /*
   * La flecha NO es decorativa: addEventListener le pasa el Event al
   * manejador. Si returnVideo llegara a aceptar algun argumento (por
   * ejemplo un "descartalo"), recibiria el Event, que es siempre
   * truthy, y una simple recarga de pestaña dejaria a YouTube Music sin
   * reproductor. Se llama sin argumentos a proposito.
   */
  window.addEventListener("pagehide", () => returnVideo());

  /*
   * Boton inyectado en la propia pagina de YouTube Music.
   *
   * Es el disparador PRINCIPAL y el unico 100% confiable:
   * documentPictureInPicture.requestWindow() exige activacion de usuario
   * transitoria en el MISMO documento que la invoca. Un clic en el icono
   * de la extension ocurre en el contexto del navegador/popup, no en la
   * pestaña, y esa activacion no se transfiere (falla con NotAllowedError).
   * Un clic sobre este boton si es un gesto real en este documento.
   */
  const LAUNCHER_ID = "ytmpip-launcher";

  function ensureLauncherButton() {
    if (!document.body || document.getElementById(LAUNCHER_ID)) return;

    const btn = document.createElement("button");
    btn.id = LAUNCHER_ID;
    btn.type = "button";
    btn.textContent = "PiP";
    btn.title = t("abrir_ventana_music_pip_title");
    btn.setAttribute("aria-label", t("abrir_ventana_music_pip"));
    btn.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:88px",
      "z-index:9999",
      "min-width:48px",
      "min-height:40px",
      "padding:0 12px",
      "border:none",
      "border-radius:20px",
      "background:#ff0000",
      "color:#fff",
      "font:600 13px/1 'Segoe UI',Roboto,Arial,sans-serif",
      "cursor:pointer",
      "box-shadow:0 2px 8px rgba(0,0,0,.5)"
    ].join(";");

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPip().catch((err) => console.error("[YTMPip] No se pudo abrir el PiP", err));
    });

    document.body.appendChild(btn);
  }

  /*
   * Llamar la atencion sobre el boton cuando el icono de la extension no ha
   * podido abrir la ventana.
   *
   * Se anima con la API de animaciones y no con CSS a proposito: meter unos
   * @keyframes en music.youtube.com seria dejar rastro en una pagina que no
   * es nuestra, y este parpadeo dura tres segundos.
   *
   * Devuelve si se ha podido destacar. La guarda de `animate` no es
   * decorativa: jsdom no la implementa, y sin ella la prueba de que el boton
   * se crea reventaria por el adorno en vez de por lo que mide.
   */
  function destacarLanzador() {
    ensureLauncherButton();
    const btn = document.getElementById(LAUNCHER_ID);
    if (!btn) return false;
    if (typeof btn.animate !== "function") return true;
    btn.animate(
      [
        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" },
        { transform: "scale(1.18)", boxShadow: "0 0 0 12px rgba(241,90,90,.35)" },
        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }
      ],
      { duration: 600, iterations: 3 }
    );
    return true;
  }

  // Disparador secundario: el service worker (clic en el icono de la
  // extension). Puede fallar por falta de activacion de usuario; se
  // mantiene por conveniencia cuando el navegador si la propaga.
  window.addEventListener("ytmpip:open-pip", () => {
    openPip().catch((err) => console.error("[YTMPip] No se pudo abrir el PiP", err));
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLauncherButton);
  } else {
    ensureLauncherButton();
  }
})(typeof self !== "undefined" ? self : globalThis);
