/*
 * Orquestador principal ejecutado en music.youtube.com. Observa cambios
 * del DOM con MutationObserver (debounced), construye el PlayerState,
 * lo envia al service worker y ejecuta los PlayerCommand recibidos.
 */
(function (root) {
  const YTMPip = root.YTMPip;
  const { MESSAGE_TYPES, COMMAND_TYPES, createMessage, sendMessageSafe } = YTMPip;
  const { OBSERVER_DEBOUNCE_MS, LYRICS_STATUS } = YTMPip.CONSTANTS;

  let lastSentSignature = null;
  let debounceTimer = null;
  let mediaElement = null;
  let observer = null;
  let orphaned = false;

  /*
   * Al recargar la extension este content script queda huerfano: se pierde
   * el puente chrome.runtime, pero NO el acceso al DOM ni al <video>.
   *
   * Por eso el modo degradado no apaga nada: el bucle
   * MutationObserver -> buildState -> PipView.onStateUpdate es 100% local
   * (lee el DOM de la pagina y escribe en el document de la ventana PiP)
   * y sigue funcionando perfectamente. Lo unico que se desactiva es el
   * envio de mensajes al service worker, que solo sirve para persistir el
   * ultimo estado conocido para el popup / ventana de respaldo.
   *
   * Apagar el observer aqui era un error: congelaba la caratula y los
   * metadatos aunque los controles siguieran respondiendo.
   */
  YTMPip.onContextInvalidated = function onContextInvalidated() {
    if (orphaned) return;
    orphaned = true;
    // console.info y no warn/error: esto es una condicion NORMAL de
    // desarrollo (recargar la extension), se recupera sola con un F5 y
    // no debe ensuciar la lista de errores de chrome://extensions.
    console.info(
      "[YTMPip] La extension se recargo: se pierde la sincronizacion con el " +
        "service worker, pero la ventana PiP sigue actualizandose localmente. " +
        "Recarga la pestaña (F5) para restaurar todo."
    );
    if (YTMPip.PipView && YTMPip.PipView.setDegraded) YTMPip.PipView.setDegraded(true);
  };

  function songKeyOf(metadata) {
    return metadata.title + "||" + metadata.artist;
  }

  function buildState() {
    const metadata = YTMPip.MetadataReader.read();
    const songKeyBefore = songKeyOf(metadata);

    // LyricsReader ya distingue LOADING de UNAVAILABLE por si mismo, asi
    // que se le pregunta siempre. Antes se cortocircuitaba con
    // isTabPresent() y cualquier ausencia se reportaba como "no hay letra".
    const read = YTMPip.LyricsReader.read();

    // Descarta la lectura si la cancion cambio durante el proceso, para
    // nunca mostrar letras de la pista anterior (requisito Fase 2).
    const songKeyAfter = songKeyOf(YTMPip.MetadataReader.read());
    const lyrics =
      songKeyAfter === songKeyBefore
        ? read
        : { status: LYRICS_STATUS.LOADING, text: undefined, source: "youtube-music" };

    // El temporizador de apagado viaja con el estado para que la ventana
    // pueda enseñar la cuenta atras: null cuando esta apagado.
    const sleepTimer = YTMPip.TemporizadorApagado ? YTMPip.TemporizadorApagado.estado() : null;

    return Object.assign({}, metadata, { lyrics, sleepTimer });
  }

  function stateSignature(state) {
    return [
      state.connected,
      state.playing,
      state.title,
      state.artist,
      state.album,
      Math.floor(state.currentTime),
      Math.floor(state.duration),
      state.lyrics && state.lyrics.status,
      state.lyrics && state.lyrics.text ? state.lyrics.text.length : 0,
      /*
       * lyrics.activeLine NO va en la firma a proposito: cambia con cada
       * verso y su unico consumidor es la ventana local, que recibe
       * onStateUpdate SIEMPRE (linea de arriba), con firma o sin ella.
       * Meterlo seria mandar el estado entero al service worker cada
       * pocos segundos para que lo lea nadie: ni el popup ni la ventana
       * de respaldo sincronizan letra. Mismo criterio que el minuto del
       * temporizador, dos comentarios mas abajo.
       */
      /*
       * Los TITULOS, no solo el numero: al avanzar la cancion la cola puede
       * seguir midiendo cinco y ser otra. Sin esto, el cambio tipico de la
       * cola (rota una posicion) no viajaria nunca al service worker.
       */
      state.upNext ? state.upNext.map((c) => c.title).join("~") : "",
      /*
       * Del temporizador viaja el MINUTO, no el milisegundo: el restante
       * baja con cada `timeupdate`, y meterlo entero en la firma haria que
       * ningun estado se pareciera al anterior mientras hubiera plazo
       * puesto —cuatro envios por segundo al service worker para contar
       * una cifra que solo cambia una vez por minuto—. La ventana local no
       * pierde nada: onStateUpdate le llega siempre, con firma o sin ella.
       */
      state.sleepTimer ? state.sleepTimer.minutes + ":" + Math.ceil(state.sleepTimer.remainingMs / 60000) : ""
    ].join("|");
  }

  function sendState(state) {
    if (orphaned) return;
    const signature = stateSignature(state);
    if (signature === lastSentSignature) return;
    lastSentSignature = signature;
    sendMessageSafe(createMessage(MESSAGE_TYPES.STATE_UPDATE, { state }));
  }

  function scheduleUpdate(delayMs) {
    if (debounceTimer) return;
    debounceTimer = setTimeout(
      () => {
        debounceTimer = null;
        const state = buildState();
        /*
         * La memoria por cancion escucha el MISMO latido que todo lo
         * demas, y ANTES de pintar: si la cancion que empieza trae un
         * ecualizador fijado, alSonar lo escribe en Settings aqui mismo y
         * el repintado de abajo ya sale con el interruptor en su sitio.
         * No tiene observador propio por lo mismo que el temporizador:
         * otro MutationObserver seria una segunda definicion de "cambio
         * de cancion" esperando a discrepar de esta.
         */
        if (YTMPip.EcualizadorPorCancion) YTMPip.EcualizadorPorCancion.alSonar(state);
        // Primero la UI local (siempre funciona), despues el envio remoto
        // (puede estar desactivado en modo degradado). Este orden evita
        // que un fallo de mensajeria bloquee el render.
        if (YTMPip.PipView) YTMPip.PipView.onStateUpdate(state);
        sendState(state);
      },
      delayMs || OBSERVER_DEBOUNCE_MS
    );
  }

  /*
   * Los eventos del <video> son el latido de la interfaz: cada `timeupdate`
   * es lo que repinta el contador y la barra. Si dejan de llegar, la
   * ventana flotante se queda congelada en el ultimo estado que vio.
   */
  const MEDIA_EVENTS = ["play", "pause", "timeupdate", "loadedmetadata", "ended"];

  /*
   * Un unico manejador con nombre, reutilizado para todos los eventos y
   * todos los elementos.
   *
   * Antes se suscribia con una flecha anonima creada dentro del forEach.
   * Eso hace la suscripcion IRREVERSIBLE: removeEventListener necesita la
   * misma referencia de funcion, y esa referencia se perdia en cuanto
   * terminaba el bucle. No habia forma de desengancharse aunque se
   * quisiera.
   */
  function onMediaEvent(evt) {
    /*
     * `play` ademas DESPIERTA EL ECUALIZADOR. Un AudioContext creado sin un
     * gesto del usuario nace suspendido, y suspendido no deja pasar el
     * audio: con el ecualizador encendido eso no es una barra plana como en
     * el espectro, es silencio. El navegador tambien lo suspende solo
     * cuando la pestaña lleva un rato al fondo.
     *
     * Va colgado de `play` y no de cada evento porque `timeupdate` llega
     * cuatro veces por segundo, y `reanudar` ya se guarda de zarandear un
     * contexto que esta en marcha, pero llamarlo mil veces por cancion para
     * no hacer nada es ruido.
     */
    if (evt && evt.type === "play" && YTMPip.GrafoAudio) YTMPip.GrafoAudio.reanudar();
    /*
     * El latido es tambien el reloj del temporizador de apagado: mientras
     * suena la musica, `timeupdate` llega cuatro veces por segundo, asi que
     * el plazo se atrapa sin depender de un setTimeout que el navegador
     * pueda retrasar. `comprobar` sin plazo puesto es una comparacion con
     * null: llamarlo en cada evento no cuesta nada. El "pause" que provoca
     * dispara su propio evento, que es el que refresca la ventana.
     */
    if (YTMPip.TemporizadorApagado) YTMPip.TemporizadorApagado.comprobar();
    scheduleUpdate();
  }

  /*
   * EL ECUALIZADOR SIGUE AL <video> QUE SUENA AHORA.
   *
   * Vive aqui y no en pip.js por dos motivos, y el segundo es el que manda:
   *
   *   1. Es el mismo problema que `attachMediaListeners` —YouTube Music
   *      fabrica un elemento nuevo al encadenar la pista siguiente— y las
   *      dos respuestas se dan en el mismo sitio para que no puedan
   *      contradecirse.
   *   2. El ecualizador NO depende de que la ventana flotante este abierta.
   *      Puesto en pip.js, cerrar la ventana devolveria el sonido a plano
   *      sin que nadie lo hubiera pedido, y volver a abrirla lo encenderia
   *      otra vez. La preferencia dice como suena la musica, no como se ve
   *      la ventana.
   *
   * No hace falta preguntar si esta apagado: `plan` devuelve `null` cuando
   * lo esta y `montar` con `null` no cruza la puerta de un solo sentido. La
   * pregunta se hace en un solo sitio, que es src/shared/ecualizador.js.
   */
  function sincronizarEcualizador() {
    if (!YTMPip.GrafoAudio || !YTMPip.Ecualizador) return false;
    /*
     * Sin `if (!media) return false` a proposito, y no es un descuido: aqui
     * habia uno y lo quito una prueba de mutacion. Borrarlo no tumbaba
     * ninguna prueba porque `montar` empieza por `if (!video) return false`,
     * o sea que las dos lineas contestaban la misma pregunta.
     *
     * Dejarlo era el fallo de siempre —«una regla duplicada en dos archivos
     * no es una regla, son dos»— y aqui ademas caro: la pregunta que se
     * responde delante de esa puerta es CUANDO SE CRUZA, y tenerla escrita
     * en dos sitios es tener dos sitios que pueden dejar de estar de
     * acuerdo. El que manda es `montar`, que es el que abre la puerta.
     */
    return YTMPip.GrafoAudio.montar(
      YTMPip.Adapter.getMediaElement(),
      YTMPip.Ecualizador.plan(YTMPip.Settings.get().equalizer)
    );
  }

  /*
   * Mantiene la suscripcion apuntando al <video> que suena AHORA.
   *
   * YouTube Music no reutiliza siempre el mismo elemento: al encadenar la
   * pista siguiente puede fabricarse uno nuevo y abandonar el anterior. El
   * viejo no lanza ningun evento de despedida; simplemente deja de emitir.
   * Si no nos mudamos, el latido se para y la ventana se queda con el
   * ultimo fotograma de la cancion anterior: barra llena y contador parado
   * mientras la pagina ya va por el segundo 16 de la siguiente.
   *
   * Desengancharse del viejo no es solo higiene de memoria. Sin ello cada
   * cambio de cancion acumula otro juego de cinco suscripciones sobre un
   * elemento que ya no pinta nada, y todas siguen llamando a
   * scheduleUpdate() si algo las despierta.
   */
  function attachMediaListeners() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media || media === mediaElement) return;

    if (mediaElement) {
      MEDIA_EVENTS.forEach((evt) => mediaElement.removeEventListener(evt, onMediaEvent));
    }

    mediaElement = media;
    MEDIA_EVENTS.forEach((evt) => media.addEventListener(evt, onMediaEvent));

    /*
     * El relevo de elemento es tambien el relevo del ecualizador, y va
     * DESPUES de mudar la suscripcion a proposito: si `montar` fallara, lo
     * que se pierde es el ecualizador, no el latido de la interfaz.
     *
     * Sin esta linea el sintoma seria de los caros de encontrar: el
     * ecualizador funcionaria perfectamente en la cancion en la que se
     * enciende y dejaria de hacer nada en la siguiente, sin ningun error
     * en la consola. Es el mismo fallo que este proyecto ya ha pagado tres
     * veces con el espectro y el contador.
     */
    sincronizarEcualizador();

    /*
     * Aqui NO se llama a scheduleUpdate(). Se puso y ninguna prueba
     * notaba quitarlo, asi que se fue a mirar por que: los dos unicos
     * sitios que llaman a esta funcion (init y el MutationObserver) ya lo
     * hacen justo despues, y el debounce colapsa las dos llamadas en una.
     * Habria sido codigo que parece prudente y no hace nada.
     */
  }

  function handleCommand(command) {
    YTMPip.PlayerController.execute(command);
    // Abrir letras puede tardar un instante en renderizar el panel.
    scheduleUpdate(command && command.type === COMMAND_TYPES.OPEN_LYRICS ? 350 : OBSERVER_DEBOUNCE_MS);
  }

  function init() {
    attachMediaListeners();

    /*
     * Cambiar el ecualizador en la pagina de opciones se tiene que oir sin
     * cambiar de cancion. `subscribe` ademas dispara al momento si las
     * preferencias ya estaban cargadas, asi que esta linea vale tanto para
     * "lo acaban de mover" como para "ya estaba encendido al abrir la
     * pestaña".
     *
     * No se guarda la funcion para desuscribirse: este content script vive
     * lo que vive la pestaña, y darse de baja solo tendria sentido si
     * hubiera un momento en que dejara de importar como suena la musica.
     */
    YTMPip.Settings.subscribe(sincronizarEcualizador);

    observer = new MutationObserver(() => {
      attachMediaListeners();
      // YouTube Music es una SPA: si reescribe el DOM y borra el boton
      // lanzador, se vuelve a inyectar (la comprobacion es un getElementById).
      if (YTMPip.PipView) YTMPip.PipView.ensureLauncher();
      scheduleUpdate();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "aria-label", "class"]
    });

    scheduleUpdate();

    sendMessageSafe(createMessage(MESSAGE_TYPES.CONTENT_SCRIPT_READY));

    window.addEventListener("beforeunload", () => {
      sendMessageSafe(createMessage(MESSAGE_TYPES.TAB_DISCONNECTED));
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === MESSAGE_TYPES.COMMAND) {
      handleCommand(message.command);
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === MESSAGE_TYPES.REQUEST_CURRENT_STATE) {
      sendResponse({ state: buildState() });
      return true;
    }
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})(typeof self !== "undefined" ? self : globalThis);
