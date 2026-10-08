/*
 * El adaptador de SoundCloud (tanda AV).
 *
 * MEDIDO EN VIVO el 2026-10-08 sobre soundcloud.com (una pista publica, sin
 * cuenta), no supuesto:
 *
 *  - NO HAY <audio> NI <video> EN EL DOM (0 y 0). Como en Spotify, sin
 *    elemento no hay ecualizador ni espectro (audioGrafo false), y si suena
 *    o no se le pregunta a la pagina: el boton de reproducir lleva la clase
 *    «playing» mientras suena.
 *  - El titulo esta en a.playbackSoundBadge__titleLink, pero su texto lleva
 *    delante una frase para lectores de pantalla («Pista actual: ...»). El
 *    titulo limpio esta en su span[aria-hidden]. El artista,
 *    a.playbackSoundBadge__lightLink, viene limpio.
 *  - La caratula es un background-image de 50x50 (-t50x50 en la URL), y
 *    SoundCloud sirve la misma a 500x500 cambiando ese trozo.
 *  - El tiempo esta en la barra de progreso (role=progressbar) como
 *    aria-valuenow / aria-valuemax, EN SEGUNDOS.
 *  - SALTAR FUNCIONA escribiendo un clic en la barra: mousedown+mouseup en
 *    la mitad llevo la pista del segundo 35 al 107 de 213.
 *  - Repetir: sin clase = apagado; luego m-one, m-all, m-none. Aleatorio:
 *    m-shuffling mientras esta puesto.
 *  - Me gusta exige cuenta (pulsarlo abre el inicio de sesion): meGusta false.
 *  - La cola («A continuacion») se pinta solo al abrirla: cola false.
 *  - No hay letra: letras false.
 *
 * El volumen no se escribe: el deslizador es un panel flotante que solo
 * existe al pasar el raton. setPageVolume contesta que no y la ventana
 * esconde su mando, como con Spotify sin medio.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    playerBar: [".playControls"],
    playPauseButton: [".playControls__play"],
    nextButton: [".skipControl__next", ".playControls__next"],
    previousButton: [".skipControl__previous", ".playControls__prev"],
    title: [".playbackSoundBadge__titleLink span[aria-hidden='true']", ".playbackSoundBadge__titleLink span[aria-hidden]"],
    titleLink: [".playbackSoundBadge__titleLink"],
    subtitleByline: [".playbackSoundBadge__lightLink"],
    artwork: [".playbackSoundBadge__avatar .sc-artwork span", ".playbackSoundBadge__avatar span[style]"],
    progressBar: [".playbackTimeline__progressWrapper[role='progressbar']", ".playbackTimeline__progressWrapper"],
    timeInfo: [".playbackTimeline__timePassed"],
    repeatButton: [".repeatControl"],
    shuffleButton: [".shuffleControl"]
  };

  function queryFirst(selectorList, scope) {
    for (const selector of selectorList) {
      try {
        const el = (scope || document).querySelector(selector);
        if (el) return el;
      } catch (err) {
        // selector invalido en este navegador: se prueba el siguiente
      }
    }
    return null;
  }

  /*
   * La caratula grande. El fondo viene como url("...-t50x50.jpg"); se pide
   * la de 500. Se devuelve un objeto con `src` y no un <img>: el lector solo
   * mira `src`, y crear un <img> haria que el navegador la descargara otra
   * vez por su cuenta.
   */
  function caratulaGrande(span) {
    const fondo = (span && span.style && span.style.backgroundImage) || "";
    const m = /url\(["']?([^"')]+)["']?\)/.exec(fondo);
    if (!m) return null;
    return { src: m[1].replace(/-t\d+x\d+(\.\w+)$/, "-t500x500$1") };
  }

  function numeroDe(el, atributo) {
    const n = el ? Number(el.getAttribute(atributo)) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  const adapter = {
    schemaVersion: YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION,
    SELECTORS,

    getPlayerBar() {
      return queryFirst(SELECTORS.playerBar);
    },
    isValidPlayerBar(el) {
      return !!(el && el.classList && el.classList.contains("playControls"));
    },
    // Sin <audio> ni <video> en el DOM: nada que prestar ni que medir.
    setBorrowedMedia() {},
    getPageMediaElement() {
      return null;
    },
    getReplacementFor() {
      return null;
    },
    getMediaElement() {
      return null;
    },
    getPlayerContainer() {
      return null;
    },
    getCanvasVideo() {
      return null;
    },

    getPlayPauseButton() {
      return queryFirst(SELECTORS.playPauseButton);
    },
    getNextButton() {
      return queryFirst(SELECTORS.nextButton);
    },
    getPreviousButton() {
      return queryFirst(SELECTORS.previousButton);
    },

    getTitleElement() {
      return queryFirst(SELECTORS.title);
    },
    getSubtitleElement() {
      return queryFirst(SELECTORS.subtitleByline);
    },
    getArtworkElement() {
      return caratulaGrande(queryFirst(SELECTORS.artwork));
    },

    getProgressBarElement() {
      return queryFirst(SELECTORS.progressBar);
    },
    getTimeInfoElement() {
      return queryFirst(SELECTORS.timeInfo);
    },
    getPageTrackTime() {
      const barra = this.getProgressBarElement();
      const elapsed = numeroDe(barra, "aria-valuenow");
      const duration = numeroDe(barra, "aria-valuemax");
      if (elapsed === null || duration === null || duration <= 0) return null;
      return { elapsed, duration };
    },
    isPagePlaying() {
      const boton = this.getPlayPauseButton();
      if (!boton) return undefined;
      return boton.classList.contains("playing");
    },

    /*
     * Saltar: un clic escrito en la barra, en la fraccion que toca. Medido:
     * SoundCloud lo atiende igual que un clic de verdad. Sin argumento es la
     * sonda («¿hay donde saltar?») y no toca nada.
     */
    seekPageTo(segundos) {
      const barra = this.getProgressBarElement();
      const duracion = numeroDe(barra, "aria-valuemax");
      if (!barra || !duracion || duracion <= 0) return false;
      if (typeof segundos !== "number" || !Number.isFinite(segundos)) return true;
      const caja = barra.getBoundingClientRect();
      if (!(caja.width > 0)) return false;
      const fraccion = Math.min(1, Math.max(0, segundos / duracion));
      const x = caja.left + caja.width * fraccion;
      const y = caja.top + caja.height / 2;
      const vista = barra.ownerDocument.defaultView;
      for (const tipo of ["mousedown", "mouseup", "click"]) {
        barra.dispatchEvent(new vista.MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
      }
      return true;
    },
    setPageVolume() {
      return false;
    },
    getPageVolume() {
      return null;
    },

    // Sin letra en SoundCloud (letras: false).
    getLyricsTab() {
      return null;
    },
    isLyricsTabDisabled() {
      return true;
    },
    getTabRenderer() {
      return null;
    },
    getLyricsTextElement() {
      return null;
    },
    getLyricsSourceElement() {
      return null;
    },
    getLyricsMessageElement() {
      return null;
    },
    getActiveLyricsLineIndex() {
      return undefined;
    },
    getBetterLyricsContainer() {
      return null;
    },
    getBetterLyricsLines() {
      return [];
    },
    getBetterLyricsSourceName() {
      return "";
    },

    // Me gusta exige cuenta (meGusta: false): no se ofrece.
    getLikeButton() {
      return null;
    },
    getDislikeButton() {
      return null;
    },
    getLikeStatus() {
      return undefined;
    },

    getRepeatButton() {
      return queryFirst(SELECTORS.repeatButton);
    },
    getShuffleButton() {
      return queryFirst(SELECTORS.shuffleButton);
    },
    /*
     * El unico interruptor que se pregunta es el aleatorio, y su estado es
     * una clase. Cualquier otro boton: «no se sabe», no un false inventado.
     */
    isToggleActive(button) {
      if (!button || !button.classList) return undefined;
      if (button.classList.contains("shuffleControl")) return button.classList.contains("m-shuffling");
      return undefined;
    },
    getRepeatMode() {
      const boton = this.getRepeatButton();
      if (!boton) return undefined;
      if (boton.classList.contains("m-one")) return "ONE";
      if (boton.classList.contains("m-all")) return "ALL";
      // m-none, o ninguna clase todavia (al cargar): apagado.
      return "NONE";
    },

    // La cola solo existe con su panel abierto (cola: false).
    getQueueItems() {
      return [];
    },
    getQueueItemTitleElement() {
      return null;
    },
    getQueueItemBylineElement() {
      return null;
    },
    isQueueItemSelected() {
      return false;
    }
  };

  YTMPip.Adaptadores.registrar({
    id: "soundcloud",
    nombre: "SoundCloud",
    hostnames: ["soundcloud.com"],
    capacidades: {
      letras: false,
      cola: false,
      repetir: true,
      aleatorio: true,
      meGusta: false,
      medioEscribible: false,
      videoPrestable: false,
      audioGrafo: false
    },
    adapter
  });
})(typeof self !== "undefined" ? self : globalThis);
