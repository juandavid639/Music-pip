/*
 * Ejecuta PlayerCommand sobre los controles reales de YouTube Music.
 * Estrategia (seccion 6): localizar el elemento multimedia cuando sea
 * posible (play/pause/seek) y, para next/previous, disparar clic sobre
 * el boton correspondiente localizado via YTMPip.Adapter.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});
  const COMMAND_TYPES = YTMPip.COMMAND_TYPES;

  function clickIfPresent(el) {
    if (!el) return false;
    el.click();
    return true;
  }

  /*
   * Convierte a numero SOLO lo que de verdad es un numero, y devuelve null
   * para todo lo demas.
   *
   * No vale con Number(x) + Number.isFinite(x): Number(null), Number(""),
   * Number(false) y Number([]) valen 0, que es finito. Un comando que
   * llegara con `seconds: null` (un campo que se perdio por el camino)
   * pasaba el filtro y saltaba al principio de la cancion. Se aceptan
   * cadenas numericas a proposito porque el valor de un <input type=range>
   * es texto.
   */
  function toFiniteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  /*
   * EL CLIC CIEGO, y por que ya no existe. Sin medio no hay play() ni
   * pause() que llamar: solo queda el boton de la pagina, y ese boton
   * es un ALTERNADOR. Pulsarlo sin saber el estado hacia lo contrario
   * de lo pedido la mitad de las veces, y en Spotify (medio null
   * SIEMPRE, medido) esa mitad era real: "pausar lo ya pausado"
   * ARRANCABA la musica — y el temporizador de apagado manda PAUSE al
   * expirar, o sea musica sonando de madrugada por pedir silencio.
   *
   * La regla: un alternador solo se pulsa sabiendo que el estado
   * actual es EL CONTRARIO del pedido. Lo dice isPagePlaying(), el
   * metodo 37 del contrato, que existe exactamente para esto. Con
   * undefined ("no se puede saber": YTM y YouTube sin medio) se
   * ABSTIENE, por la asimetria de los fallos: no obedecer deja las
   * cosas como estaban; pulsar a ciegas puede hacer lo contrario. Es
   * la misma regla que el boton de repetir con el modo ilegible: mejor
   * no inventar. TOGGLE_PLAY no necesita nada de esto: alternar es lo
   * unico que un alternador hace bien a ciegas.
   */
  function play() {
    const media = YTMPip.Adapter.getMediaElement();
    if (media && media.paused) {
      media.play().catch(() => clickIfPresent(YTMPip.Adapter.getPlayPauseButton()));
      return;
    }
    if (!media && YTMPip.Adapter.isPagePlaying() === false) {
      clickIfPresent(YTMPip.Adapter.getPlayPauseButton());
    }
  }

  function pause() {
    const media = YTMPip.Adapter.getMediaElement();
    if (media && !media.paused) {
      media.pause();
      return;
    }
    if (!media && YTMPip.Adapter.isPagePlaying() === true) {
      clickIfPresent(YTMPip.Adapter.getPlayPauseButton());
    }
  }

  /*
   * No repite la logica de play/pause: pregunta al <video> y delega. La
   * rama sin media va al boton, que es lo que hacen las otras dos en ese
   * caso; aqui ademas es la respuesta exacta, porque el boton de la pagina
   * ya es un alternador.
   */
  function togglePlay() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media) {
      clickIfPresent(YTMPip.Adapter.getPlayPauseButton());
      return;
    }
    if (media.paused) play();
    else pause();
  }

  function nextTrack() {
    clickIfPresent(YTMPip.Adapter.getNextButton());
  }

  function previousTrack() {
    clickIfPresent(YTMPip.Adapter.getPreviousButton());
  }

  /*
   * Los dos saltos van por TrackTimeline y no por `media.currentTime` a
   * secas, porque el <video> de YouTube Music lleva una linea de tiempo
   * continua con TODA la cola dentro. Dos consecuencias:
   *
   *  - "ir al minuto 2" es escribir `desplazamiento + 120`, no 120.
   *  - acotar con `media.duration` acotaba al final de la COLA: un salto
   *    adelante cerca del final se colaba en la cancion siguiente.
   *
   * SIN MEDIO ya no se devuelve el silencio: se intenta LA PAGINA
   * (seekPageTo, metodo 40). En Spotify modo audio el tiempo sale de la
   * barra de la pagina (TrackTimeline sin media publica eso tal cual) y
   * la escritura sintetica sobre su range esta medida en vivo con salto
   * audible. El orden es el de siempre: el medio primero, porque cuando
   * existe es la verdad inmediata; la pagina, cuando no hay medio. El
   * destino se acota a [0, duration] AQUI porque el adaptador no sabe
   * de que pista viene el delta; el suyo es el recorte en unidades del
   * DOM.
   */
  function seekBy(deltaSeconds) {
    const media = YTMPip.Adapter.getMediaElement();
    const { elapsed, duration } = YTMPip.TrackTimeline.read();
    if (!(duration > 0)) return;
    if (media) {
      media.currentTime = YTMPip.TrackTimeline.toMediaTime(elapsed + deltaSeconds);
      return;
    }
    YTMPip.Adapter.seekPageTo(Math.min(duration, Math.max(0, elapsed + deltaSeconds)));
  }

  // Si el comando no trae "seconds" (por ejemplo si llega reenviado desde
  // una pagina de extension), se cae a la preferencia del usuario.
  function seekSecondsFallback() {
    return (YTMPip.Settings && YTMPip.Settings.get().seekSeconds) || 10;
  }

  /*
   * Salto absoluto para la barra arrastrable. Se acota al rango real de la
   * pista: un valor fuera de [0, duration] deja el <video> en un estado
   * del que YouTube Music no siempre se recupera.
   */
  function seekTo(seconds) {
    const media = YTMPip.Adapter.getMediaElement();
    const target = toFiniteNumber(seconds);
    if (target === null) return;
    const { duration } = YTMPip.TrackTimeline.read();
    if (!(duration > 0)) return;
    if (media) {
      media.currentTime = YTMPip.TrackTimeline.toMediaTime(target);
      return;
    }
    // Sin medio, a la pagina (ver seekBy): mismo destino, misma cota.
    YTMPip.Adapter.seekPageTo(Math.min(duration, Math.max(0, target)));
  }

  /*
   * El volumen se aplica DIRECTAMENTE sobre el elemento multimedia en vez
   * de arrastrar el deslizador de YouTube Music. Es el mismo criterio que
   * ya seguian play/pause y los saltos: actuar sobre el <video> es
   * inmediato y no depende de que el deslizador exista ni de como este
   * implementado. YouTube Music sincroniza su propia interfaz a partir
   * del elemento.
   */
  function setVolume(level) {
    const media = YTMPip.Adapter.getMediaElement();
    const value = toFiniteNumber(level);
    if (value === null) return;
    if (media) {
      media.volume = Math.min(1, Math.max(0, value));
      // Subir el volumen con el sonido silenciado no haria nada audible.
      if (media.volume > 0 && media.muted) media.muted = false;
      return;
    }
    /*
     * Sin medio, a la pagina (setPageVolume, metodo 41). La regla del
     * silenciado no se replica: el boton de mute de la pagina de
     * Spotify no esta medido y aqui no hay `muted` que leer; escribir
     * el volumen es exactamente lo que la pagina hace con su propio
     * deslizador, que tambien des-silencia por su cuenta si quiere.
     */
    YTMPip.Adapter.setPageVolume(Math.min(1, Math.max(0, value)));
  }

  /*
   * La velocidad se escribe sobre el <video>, igual que el volumen y por el
   * mismo motivo: es inmediato y no depende de que YouTube Music ofrezca un
   * control para esto, que no lo ofrece.
   *
   * `preservesPitch` se pone a mano aunque HOY sea el valor por defecto en
   * Chrome. Sin correccion de tono, 1,25x no suena "un poco mas rapido":
   * suena a otra cancion, medio tono mas arriba. Eso es un fallo que SOLO se
   * detecta escuchando —ninguna prueba de este proyecto puede oir—, asi que
   * el unico sitio donde se puede evitar es aqui, escribiendolo. Que hoy
   * coincida con el defecto no lo hace redundante: lo hace barato.
   *
   * Se ACOTA en vez de rechazar lo que se sale, por lo mismo que el volumen:
   * un 40 que llega de un comando raro es un error de quien lo manda, y
   * dejar el <video> a 4x es recuperable; dejarlo en un estado que YouTube
   * Music no entiende, no.
   */
  function setPlaybackRate(rate) {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media) return;
    const value = toFiniteNumber(rate);
    if (value === null) return;
    const limites = YTMPip.CONSTANTS.PLAYBACK_RATE_LIMITS;
    media.playbackRate = Math.min(limites.MAX, Math.max(limites.MIN, value));
    if ("preservesPitch" in media) media.preservesPitch = true;
  }

  function toggleMute() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media) return;
    media.muted = !media.muted;
  }

  function toggleLike() {
    clickIfPresent(YTMPip.Adapter.getLikeButton());
  }

  function toggleRepeat() {
    clickIfPresent(YTMPip.Adapter.getRepeatButton());
  }

  function toggleShuffle() {
    clickIfPresent(YTMPip.Adapter.getShuffleButton());
  }

  /*
   * OPEN_LYRICS significa ABRIR, pero el boton de letras de Spotify es un
   * alternador (medido en vivo): pulsarlo con la vista ya abierta la
   * CIERRA. Es el mismo problema del clic ciego de play/pause, y la misma
   * regla: un alternador solo se pulsa sabiendo que el estado actual es el
   * contrario del pedido. isPanelOpen() ya distingue "abierta" (true) de
   * "cerrada o ilegible" (false); con true se abstiene. En YouTube Music
   * la guarda tambien vale: re-pulsar la pestaña seleccionada no hacia
   * nada, asi que ahorrarse ese clic no cambia nada alli.
   */
  function openLyrics() {
    if (YTMPip.LyricsReader && YTMPip.LyricsReader.isPanelOpen()) return;
    clickIfPresent(YTMPip.Adapter.getLyricsTab());
  }

  function focusSourceTab() {
    // El enfoque de pestaña se coordina desde el service worker (chrome.tabs.update),
    // el content script solo necesita confirmar que sigue "vivo".
    window.focus();
  }

  YTMPip.PlayerController = {
    execute(command) {
      if (!command || !command.type) return;
      switch (command.type) {
        case COMMAND_TYPES.PLAY:
          return play();
        case COMMAND_TYPES.PAUSE:
          return pause();
        case COMMAND_TYPES.TOGGLE_PLAY:
          return togglePlay();
        case COMMAND_TYPES.NEXT_TRACK:
          return nextTrack();
        case COMMAND_TYPES.PREVIOUS_TRACK:
          return previousTrack();
        case COMMAND_TYPES.SEEK_FORWARD:
          return seekBy(Math.abs(command.seconds || seekSecondsFallback()));
        case COMMAND_TYPES.SEEK_BACKWARD:
          return seekBy(-Math.abs(command.seconds || seekSecondsFallback()));
        case COMMAND_TYPES.SEEK_TO:
          return seekTo(command.seconds);
        case COMMAND_TYPES.SET_VOLUME:
          return setVolume(command.level);
        case COMMAND_TYPES.SET_PLAYBACK_RATE:
          return setPlaybackRate(command.rate);
        /*
         * Este es el unico caso que no toca los controles de YouTube Music:
         * fija un plazo NUESTRO. Pasa igualmente por aqui porque es un
         * PlayerCommand como los demas —viaja por los mismos cables desde
         * la ventana o el popup— y tener un segundo despacho de comandos
         * en otro archivo seria la regla duplicada de siempre.
         */
        case COMMAND_TYPES.SET_SLEEP_TIMER:
          return YTMPip.TemporizadorApagado && YTMPip.TemporizadorApagado.fijar(command.minutes);
        case COMMAND_TYPES.TOGGLE_MUTE:
          return toggleMute();
        case COMMAND_TYPES.TOGGLE_LIKE:
          return toggleLike();
        case COMMAND_TYPES.TOGGLE_REPEAT:
          return toggleRepeat();
        case COMMAND_TYPES.TOGGLE_SHUFFLE:
          return toggleShuffle();
        case COMMAND_TYPES.OPEN_LYRICS:
          return openLyrics();
        case COMMAND_TYPES.FOCUS_SOURCE_TAB:
          return focusSourceTab();
        default:
          return;
      }
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
