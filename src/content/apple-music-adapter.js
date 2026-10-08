/*
 * El adaptador de Apple Music (tanda AY).
 *
 * MEDIDO EN VIVO el 2026-10-08 en music.apple.com, en el navegador
 * integrado, SIN CUENTA (avances de 90 segundos), no supuesto:
 *
 *  - HAY UN <audio> DE VERDAD en el DOM: el avance, servido desde el CDN de
 *    iTunes (otro origen, sin CORS). Y hay ademas un <video> que NO es la
 *    musica: es la caratula animada del album (1080 de ancho, 14 segundos).
 *    El medio es siempre el <audio>; el <video> no se toca ni se presta.
 *  - ESCRIBIR EN EL <audio> FUNCIONA: currentTime 65 -> 10 (la barra de la
 *    pagina lo siguio) y volume 0.5 -> 0.3 se quedaron. Por eso
 *    medioEscribible: los saltos, el volumen y la velocidad van al elemento,
 *    como en YouTube, sin clics sinteticos.
 *  - Sin Web Audio (audioGrafo false): el avance es de otro origen sin CORS
 *    y medirlo o ecualizarlo daria silencio; con cuenta, el audio entero
 *    lleva DRM. Ni ecualizador ni barras.
 *  - La barra con la vista ancha: [data-testid='player-bar']. El titulo y el
 *    artista, en las marquesinas de [data-testid='player-lcd'] (cada texto
 *    sale repetido para el desplazamiento: se toma el primero). La linea de
 *    abajo es «Artista — Album».
 *  - La caratula, 80x80 («80x80bb-60.jpg»): Apple sirve la misma a 600.
 *  - El progreso es un input[role=slider] DENTRO DE UN SHADOW ROOT
 *    (amp-playback-controls-progress); con el <audio> a mano no hace falta.
 *  - EN AVANCES SIN CUENTA LA BARRA SOLO TIENE REPRODUCIR/PAUSAR: ni
 *    siguiente, ni anterior, ni repetir, ni aleatorio. Con suscripcion
 *    existiran, pero NO SE HAN MEDIDO: siguiente/anterior se buscan por su
 *    etiqueta (inferido), y repetir, aleatorio, me gusta, cola y letra no se
 *    ofrecen hasta medirlos.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    playerBar: ["[data-testid='player-bar']"],
    playPauseButton: ["[data-testid='playback-controls'] .playback-play__play", ".playback-play__play"],
    title: ["[data-testid='player-lcd'] .marquee--primary [data-testid='marquee-text-item']"],
    artistLine: ["[data-testid='player-lcd'] .marquee--secondary [data-testid='marquee-text-item']"],
    artwork: ["[data-testid='player-lcd-artwork'] img"],
    previewBadge: ["[data-testid='preview-badge']"],
    media: ["audio"]
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
   * Siguiente / anterior: no se midieron (en avances no existen). Se buscan
   * por su etiqueta en ingles o en español dentro de los mandos; sin
   * coincidencia, null: mejor un boton que no se ofrece que uno que pausa.
   */
  function botonPorNombre(patron) {
    const zona = queryFirst(["[data-testid='playback-controls']", "[data-testid='player-bar']"]);
    if (!zona) return null;
    return (
      Array.from(zona.querySelectorAll("button")).find((b) =>
        patron.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || ""))
      ) || null
    );
  }

  /*
   * «Artista — Album» viene partido en fragmentos de marquesina (y repetido
   * para el desplazamiento). Se rehace como «Artista • Album», el separador
   * que el lector de metadatos ya sabe partir en artista y album.
   */
  let lineaLimpia = null;
  function subtitulo() {
    const trozos = Array.from(document.querySelectorAll(SELECTORS.artistLine[0])).map((e) => (e.textContent || "").trim());
    if (!trozos.length) return null;
    const raya = trozos.indexOf("—");
    const artista = trozos[0];
    const album = raya !== -1 ? trozos[raya + 1] : "";
    const texto = album ? artista + " • " + album : artista;
    if (!lineaLimpia) lineaLimpia = document.createElement("span");
    if (lineaLimpia.textContent !== texto) lineaLimpia.textContent = texto;
    return lineaLimpia;
  }

  function caratulaGrande(img) {
    if (!img || !img.src) return null;
    return { src: img.src.replace(/\/\d+x\d+bb(-\d+)?\.(jpg|webp|png)$/, "/600x600bb.$2") };
  }

  const adapter = {
    schemaVersion: YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION,
    SELECTORS,

    getPlayerBar() {
      return queryFirst(SELECTORS.playerBar);
    },
    isValidPlayerBar(el) {
      return !!(el && el.getAttribute && el.getAttribute("data-testid") === "player-bar");
    },
    // El <audio> es el medio. El <video> es la caratula animada: ni se mide
    // ni se presta (videoPrestable false).
    setBorrowedMedia() {},
    getPageMediaElement() {
      return queryFirst(SELECTORS.media);
    },
    getReplacementFor() {
      return null;
    },
    getMediaElement() {
      return queryFirst(SELECTORS.media);
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
      return botonPorNombre(/\b(next|siguiente)\b/i);
    },
    getPreviousButton() {
      return botonPorNombre(/\b(previous|anterior)\b/i);
    },

    getTitleElement() {
      return queryFirst(SELECTORS.title);
    },
    getSubtitleElement() {
      return subtitulo();
    },
    getArtworkElement() {
      return caratulaGrande(queryFirst(SELECTORS.artwork));
    },

    getProgressBarElement() {
      return null;
    },
    getTimeInfoElement() {
      return null;
    },
    // Con el <audio> a mano, el tiempo es el suyo (track-timeline lo lee
    // del medio). La pagina no tiene que contar nada.
    getPageTrackTime() {
      return null;
    },
    isPagePlaying() {
      const audio = this.getMediaElement();
      return audio ? !audio.paused && !audio.ended : undefined;
    },
    seekPageTo() {
      return false;
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
      return null;
    },
    getDislikeButton() {
      return null;
    },
    getLikeStatus() {
      return undefined;
    },
    getRepeatButton() {
      return null;
    },
    getShuffleButton() {
      return null;
    },
    isToggleActive() {
      return undefined;
    },
    getRepeatMode() {
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
    },

    /*
     * En los avances sin cuenta no existe «siguiente»: no es que el sitio
     * haya cambiado, es que ese modo no lo tiene (ver salud() en el
     * registro).
     */
    piezasNoVitalesAhora() {
      return queryFirst(SELECTORS.previewBadge) ? ["getNextButton"] : [];
    }
  };

  YTMPip.Adaptadores.registrar({
    id: "apple-music",
    nombre: "Apple Music",
    hostnames: ["music.apple.com"],
    capacidades: {
      letras: false,
      cola: false,
      repetir: false,
      aleatorio: false,
      meGusta: false,
      medioEscribible: true,
      videoPrestable: false,
      audioGrafo: false
    },
    adapter
  });
})(typeof self !== "undefined" ? self : globalThis);
