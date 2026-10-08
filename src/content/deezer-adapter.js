/*
 * El adaptador de Deezer (tanda AW).
 *
 * MEDIDO EN VIVO el 2026-10-08 en la cuenta del autor (Claude en Chrome; sin
 * Premium, asi que avances de 30 segundos), no supuesto:
 *
 *  - NO HAY <audio> NI <video> EN EL DOM: sin ecualizador ni barras
 *    (audioGrafo false), como Spotify y SoundCloud.
 *  - Todo lleva data-testid, y el ESTADO va en el propio testid:
 *    play_button_pause mientras suena (play_button_play en pausa),
 *    repeat_button_off -> all -> single, shuffle_play_button_off/on,
 *    add_to_favorite_button_off. Los aria-label describen la accion
 *    SIGUIENTE («Repetir esta cancion» cuando ya repite la lista): leer el
 *    estado de ahi seria leerlo al reves.
 *  - El progreso es un <input type=range> en segundos (max 30 sin Premium).
 *  - SALTAR: escribir el range (setter nativo + input/change) NO salta; un
 *    clic en la barra tampoco. Salta la secuencia completa de arrastrar:
 *    pulsar en la barra, escribir el valor y soltar (medido: 17 -> 7). Deezer
 *    confirma el salto al soltar.
 *  - El volumen vive en un panel que solo existe abierto: no se ofrece.
 *  - La cola solo existe con su panel abierto: cola false. No hay letra en
 *    la barra: letras false.
 *  - Favoritos: se lee del testid (_off/_on). El «_on» se infiere del par
 *    medido «_off» y no se midio: no se pulso, porque cambiaria la cuenta.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    playerBar: ["[data-testid='miniplayer_container']"],
    playPauseButton: ["[data-testid^='play_button']"],
    nextButton: ["[data-testid='next_track_button']"],
    previousButton: ["[data-testid='previous_track_button']"],
    title: ["[data-testid='miniplayer_container'] [data-testid='item_title']", "[data-testid='item_title']"],
    subtitleByline: ["[data-testid='miniplayer_container'] [data-testid='item_subtitle']", "[data-testid='item_subtitle']"],
    artwork: ["[data-testid='miniplayer_container'] [data-testid='item_cover'] img", "[data-testid='item_cover'] img"],
    progressBar: ["[data-testid='progress_bar']"],
    timeInfo: ["[data-testid='elapsed_time']"],
    likeButton: ["[data-testid^='add_to_favorite_button']"],
    repeatButton: ["[data-testid^='repeat_button']"],
    shuffleButton: ["[data-testid^='shuffle_play_button']"]
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

  function testid(el) {
    return (el && el.getAttribute("data-testid")) || "";
  }

  /*
   * Los artistas vienen como enlaces seguidos separados por comas SIN
   * espacio («KAROL G,Judeline,Rusowsky»). Se devuelve un <span> aparte con
   * «, » entre ellos, reutilizado (como la letra sintetica de Spotify): el
   * lector solo mira su texto, y el del sitio no se toca.
   */
  let artistasLimpios = null;
  function subtitulo() {
    const original = queryFirst(SELECTORS.subtitleByline);
    if (!original) return null;
    const enlaces = Array.from(original.querySelectorAll("a"))
      .map((a) => (a.textContent || "").trim())
      .filter(Boolean);
    const texto = enlaces.length ? enlaces.join(", ") : (original.textContent || "").trim();
    if (!artistasLimpios) artistasLimpios = document.createElement("span");
    if (artistasLimpios.textContent !== texto) artistasLimpios.textContent = texto;
    return artistasLimpios;
  }

  const adapter = {
    schemaVersion: YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION,
    SELECTORS,

    getPlayerBar() {
      return queryFirst(SELECTORS.playerBar);
    },
    isValidPlayerBar(el) {
      return testid(el) === "miniplayer_container";
    },
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
      return subtitulo();
    },
    getArtworkElement() {
      return queryFirst(SELECTORS.artwork);
    },

    getProgressBarElement() {
      return queryFirst(SELECTORS.progressBar);
    },
    getTimeInfoElement() {
      return queryFirst(SELECTORS.timeInfo);
    },
    getPageTrackTime() {
      const barra = this.getProgressBarElement();
      const elapsed = barra ? Number(barra.value) : NaN;
      const duration = barra ? Number(barra.max) : NaN;
      if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) return null;
      return { elapsed, duration };
    },
    isPagePlaying() {
      const id = testid(this.getPlayPauseButton());
      if (id === "play_button_pause") return true;
      if (id === "play_button_play") return false;
      return undefined;
    },

    /*
     * Saltar: la secuencia de arrastrar, que es lo unico que Deezer atendio
     * (ver arriba). Sin argumento es la sonda y no toca nada.
     */
    seekPageTo(segundos) {
      const barra = this.getProgressBarElement();
      const max = barra ? Number(barra.max) : NaN;
      if (!barra || !Number.isFinite(max) || max <= 0) return false;
      if (typeof segundos !== "number" || !Number.isFinite(segundos)) return true;
      const vista = barra.ownerDocument.defaultView;
      const caja = barra.getBoundingClientRect();
      const valor = Math.min(max, Math.max(0, segundos));
      const x = caja.left + (caja.width || 0) * (valor / max);
      const y = caja.top + (caja.height || 0) / 2;
      const raton = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
      const Puntero = vista.PointerEvent || vista.MouseEvent;
      barra.dispatchEvent(new Puntero("pointerdown", Object.assign({ pointerId: 1, isPrimary: true }, raton)));
      barra.dispatchEvent(new vista.MouseEvent("mousedown", raton));
      const fijar = Object.getOwnPropertyDescriptor(vista.HTMLInputElement.prototype, "value").set;
      fijar.call(barra, String(valor));
      barra.dispatchEvent(new vista.Event("input", { bubbles: true }));
      barra.dispatchEvent(new vista.Event("change", { bubbles: true }));
      barra.dispatchEvent(new Puntero("pointerup", Object.assign({ pointerId: 1, isPrimary: true }, raton)));
      barra.dispatchEvent(new vista.MouseEvent("mouseup", raton));
      return true;
    },
    setPageVolume() {
      return false;
    },
    getPageVolume() {
      return null;
    },

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

    getLikeButton() {
      return queryFirst(SELECTORS.likeButton);
    },
    getDislikeButton() {
      return null;
    },
    getLikeStatus() {
      const id = testid(this.getLikeButton());
      const { LIKE_STATUS } = YTMPip.CONSTANTS;
      if (id.endsWith("_on")) return LIKE_STATUS.LIKE;
      if (id.endsWith("_off")) return LIKE_STATUS.INDIFFERENT;
      return undefined;
    },

    getRepeatButton() {
      return queryFirst(SELECTORS.repeatButton);
    },
    getShuffleButton() {
      return queryFirst(SELECTORS.shuffleButton);
    },
    /*
     * El estado de un interruptor es el final de su testid. Cualquier otro
     * final: «no se sabe», no un false inventado.
     */
    isToggleActive(button) {
      const id = testid(button);
      if (id.endsWith("_on")) return true;
      if (id.endsWith("_off")) return false;
      return undefined;
    },
    getRepeatMode() {
      const id = testid(this.getRepeatButton());
      if (id === "repeat_button_off") return "NONE";
      if (id === "repeat_button_all") return "ALL";
      if (id === "repeat_button_single") return "ONE";
      return undefined;
    },

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
    id: "deezer",
    nombre: "Deezer",
    hostnames: ["www.deezer.com"],
    capacidades: {
      letras: false,
      cola: false,
      repetir: true,
      aleatorio: true,
      meGusta: true,
      medioEscribible: false,
      videoPrestable: false,
      audioGrafo: false
    },
    adapter
  });
})(typeof self !== "undefined" ? self : globalThis);
