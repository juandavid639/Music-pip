/*
 * Tipos de mensaje y comandos compartidos entre content script,
 * service worker, popup y ventana PiP. Ver seccion 10 del documento
 * de arquitectura (PlayerCommand / PlayerState).
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  // Mensajes que viaja por chrome.runtime.sendMessage / tabs.sendMessage
  YTMPip.MESSAGE_TYPES = {
    // content-script -> service-worker -> pip
    STATE_UPDATE: "STATE_UPDATE",
    TAB_DISCONNECTED: "TAB_DISCONNECTED",

    // pip/popup -> service-worker -> content-script
    COMMAND: "COMMAND",

    // popup -> service-worker
    OPEN_PIP_REQUEST: "OPEN_PIP_REQUEST",
    FIND_MUSIC_TAB: "FIND_MUSIC_TAB",

    // content-script -> service-worker (documentPictureInPicture no soportado)
    OPEN_FALLBACK_WINDOW: "OPEN_FALLBACK_WINDOW",

    // content-script -> service-worker (registro de pestaña activa)
    CONTENT_SCRIPT_READY: "CONTENT_SCRIPT_READY",

    // pip -> service-worker (solicita el ultimo estado conocido)
    REQUEST_CURRENT_STATE: "REQUEST_CURRENT_STATE"
  };

  // PlayerCommand.type (ver seccion 10)
  YTMPip.COMMAND_TYPES = {
    PLAY: "PLAY",
    PAUSE: "PAUSE",
    /*
     * Alternar, para quien NO SABE si suena o no: el atajo de teclado del
     * navegador llega al service worker, y lo unico que este tiene es una
     * cache del ultimo estado, que puede mentir. Decidir PLAY o PAUSE con
     * ella seria pausar lo pausado cada vez que la cache va por detras.
     * El unico que lo sabe seguro es el <video>, asi que la decision viaja
     * hasta el.
     */
    TOGGLE_PLAY: "TOGGLE_PLAY",
    NEXT_TRACK: "NEXT_TRACK",
    PREVIOUS_TRACK: "PREVIOUS_TRACK",
    SEEK_FORWARD: "SEEK_FORWARD",
    SEEK_BACKWARD: "SEEK_BACKWARD",
    // Salto absoluto: lo usa la barra de progreso arrastrable, que envia
    // el segundo exacto en vez de un delta.
    SEEK_TO: "SEEK_TO",
    SET_VOLUME: "SET_VOLUME",
    // Velocidad absoluta, no un "mas rapido"/"mas lento". El ciclo de
    // valores vive en quien pulsa el boton; aqui viaja el numero final.
    SET_PLAYBACK_RATE: "SET_PLAYBACK_RATE",
    /*
     * Temporizador de apagado, en minutos ABSOLUTOS desde ahora ({ minutes }).
     * Cero apaga el temporizador. Igual que la velocidad: el ciclo de
     * valores vive en quien pulsa el boton; aqui viaja el numero final.
     * El plazo vive en el CONTENT SCRIPT y no en el service worker: muere
     * con la pestaña, que es exactamente lo que debe hacer un "apaga ESTA
     * musica en 30 minutos", y no necesita el permiso "alarms".
     */
    SET_SLEEP_TIMER: "SET_SLEEP_TIMER",
    TOGGLE_MUTE: "TOGGLE_MUTE",
    TOGGLE_LIKE: "TOGGLE_LIKE",
    TOGGLE_REPEAT: "TOGGLE_REPEAT",
    TOGGLE_SHUFFLE: "TOGGLE_SHUFFLE",
    OPEN_LYRICS: "OPEN_LYRICS",
    FOCUS_SOURCE_TAB: "FOCUS_SOURCE_TAB"
  };

  YTMPip.createCommand = function createCommand(type, payload) {
    return Object.assign({ type }, payload || {});
  };

  YTMPip.createMessage = function createMessage(type, data) {
    return Object.assign({ type }, data || {});
  };

  /*
   * Cuando la extension se recarga (chrome://extensions) o se actualiza, los
   * content scripts ya inyectados quedan huerfanos: su chrome.runtime sigue
   * existiendo pero chrome.runtime.id es undefined y sendMessage lanza
   * "Extension context invalidated" de forma SINCRONA. Un .catch() no
   * atrapa eso, asi que el error escapa y rompe el handler completo.
   */
  YTMPip.isContextValid = function isContextValid() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch (err) {
      return false;
    }
  };

  // chrome.runtime.getURL tambien lanza con el contexto invalidado.
  YTMPip.getURLSafe = function getURLSafe(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch (err) {
      return "";
    }
  };

  // Envio tolerante: nunca lanza. Devuelve la respuesta o null.
  YTMPip.sendMessageSafe = function sendMessageSafe(message) {
    if (!YTMPip.isContextValid()) {
      YTMPip.onContextInvalidated && YTMPip.onContextInvalidated();
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
    } catch (err) {
      YTMPip.onContextInvalidated && YTMPip.onContextInvalidated();
      return Promise.resolve(null);
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
