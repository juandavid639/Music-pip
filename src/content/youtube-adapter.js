/*
 * Unica fuente de verdad sobre la estructura del DOM de www.youtube.com
 * (el YouTube normal), hermano del adaptador de YouTube Music. Misma
 * regla: si Google cambia la interfaz, solo este archivo deberia
 * necesitar actualizarse.
 *
 * NINGUN selector de este archivo es una conjetura. Todos salen de dos
 * pasadas de tools/diagnostico-youtube.js sobre paginas reales
 * (2026-09-14): un video suelto (watch?v=5sSfADAsmfg) y un video dentro
 * de un Mix (watch?v=lw1FAHzBci4&list=RD..., panel de cola con 25
 * items). Es la leccion de la fase 0: los selectores imaginados de
 * letras costaron un panel que siempre decia "no disponible".
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    /*
     * YouTube normal no tiene barra inferior tipo <ytmusic-player-bar>:
     * el papel de "raiz del reproductor" lo hace #movie_player, que es
     * unico en la pagina (medido) y contiene video, controles y barra.
     */
    playerBar: ["#movie_player", "ytd-player"],

    /*
     * MEDIDO: la pagina tiene DOS <video> a la vez (el que suena y una
     * precarga pausada fuera del reproductor), pero "#movie_player video"
     * encuentra exactamente uno: el vivo. Los genericos del final son
     * paracaidas, y por eso elegirVideoVivo sigue existiendo aqui.
     */
    mediaElement: ["#movie_player video", "video.html5-main-video", "video"],

    // Medido: title="Pausa (k)", aria-label presente, visible=true.
    playPauseButton: [".ytp-play-button"],

    /*
     * OJO: siguiente/anterior son <a>, no <button>, y en un video suelto
     * estan OCULTOS (medido: visible=false). Dentro de una lista se
     * muestran (medido: visible=true). Se devuelven igual: clickIfPresent
     * los pulsa y es el reproductor quien decide que hacer.
     */
    nextButton: [".ytp-next-button"],
    previousButton: [".ytp-prev-button"],

    /*
     * "#title" a secas casa OCHO elementos en la pagina (medido): solo
     * el selector profundo dentro de ytd-watch-metadata es unico.
     */
    title: [
      "ytd-watch-metadata #title h1 yt-formatted-string",
      "ytd-watch-metadata #title",
      "h1.ytd-watch-metadata"
    ],

    /*
     * El "subtitulo" de un video es el nombre del canal. No trae el
     * formato "Artista • Album" de YTM, y no hace falta: metadata-reader
     * parte por "•" y con un solo trozo se queda con el canal entero.
     */
    subtitleByline: [
      "ytd-watch-metadata #owner ytd-channel-name a",
      "ytd-watch-metadata #owner #channel-name a"
    ],

    // La raiz de la pagina de visionado; lleva el atributo video-id
    // (medido: video-id="5sSfADAsmfg"), del que sale la caratula.
    watchRoot: ["ytd-watch-flexy"],

    /*
     * MEDIDO Y DESCARTADO PARA EL TIEMPO: con los controles ocultos la
     * barra se queda helada (aria-valuenow=16 con el video en 40.3).
     * Se expone porque el contrato lo pide; getPageTrackTime NO la lee.
     */
    progressBar: [".ytp-progress-bar"],

    // Mismo defecto que la barra: el texto "0:16" solo se refresca con
    // los controles a la vista. Expuesto por contrato, no por confianza.
    timeInfo: [".ytp-time-current"],

    /*
     * Destino de ULTIMO RECURSO al devolver el <video> prestado.
     * Medido: el padre real del <video> es div.html5-video-container.
     */
    playerContainer: ["#movie_player .html5-video-container", "#movie_player"],

    /*
     * Sin anclar a ytd-watch-metadata, "like-button-view-model button"
     * casa TRES elementos en la pagina (medido): el bueno y copias en
     * otras superficies. El anclado va primero; el suelto queda de
     * paracaidas de ULTIMO recurso, y no es de fiar: el diagnostico
     * midio cuantos hay, no en que orden estan.
     */
    likeButton: [
      "ytd-watch-metadata segmented-like-dislike-button-view-model like-button-view-model button",
      "ytd-watch-metadata like-button-view-model button",
      "like-button-view-model button"
    ],

    dislikeButton: [
      "ytd-watch-metadata segmented-like-dislike-button-view-model dislike-button-view-model button",
      "ytd-watch-metadata dislike-button-view-model button",
      "dislike-button-view-model button"
    ],

    /*
     * LA COLA: el panel lateral de listas de reproduccion. Medido dos
     * veces: en un video suelto el panel EXISTE pero con 0 items; dentro
     * de un Mix trae los 25 items y el que suena lleva el atributo
     * `selected` (igual que en YTM, la referencia para "las siguientes").
     */
    queueItems: [
      "ytd-playlist-panel-renderer ytd-playlist-panel-video-renderer",
      "ytd-playlist-panel-video-renderer"
    ]
  };

  /*
   * Sub-selectores DENTRO de un elemento de cola. Medidos sobre el Mix
   * real: #video-title y #byline devolvieron titulo y canal en los 25.
   */
  const QUEUE_ITEM_SELECTORS = {
    title: ["#video-title"],
    byline: ["#byline"]
  };

  function queryFirst(selectorList, root2) {
    const scope = root2 || document;
    for (const selector of selectorList) {
      try {
        const el = scope.querySelector(selector);
        if (el) return el;
      } catch (err) {
        // selector invalido en este navegador/version; se intenta el siguiente
      }
    }
    return null;
  }

  function queryAll(selectorList, root2) {
    const scope = root2 || document;
    for (const selector of selectorList) {
      try {
        const els = scope.querySelectorAll(selector);
        if (els.length) return Array.from(els);
      } catch (err) {
        // selector invalido en este navegador/version; se intenta el siguiente
      }
    }
    return [];
  }

  /*
   * La logica de "cual de los <video> esta vivo" es la misma que en el
   * adaptador de YouTube Music, donde vive su historia completa (dos
   * reportes de "se junta el tiempo entre canciones" y el recuadro en
   * negro del relevo). Se duplica en vez de compartirse porque cada
   * adaptador es autonomo: el dia que Spotify firme el contrato no
   * queremos una telaraña de dependencias entre adaptadores. Y aplica
   * aqui de verdad: el diagnostico encontro DOS <video> tambien en
   * youtube.com (el vivo y una precarga pausada).
   */
  function videoTerminado(video) {
    if (video.ended) return true;
    const d = video.duration;
    return Number.isFinite(d) && d > 0 && video.currentTime >= d - 0.5;
  }

  function elegirVideoVivo(videos) {
    if (!videos.length) return null;
    const sonando = videos.filter((v) => !v.paused && !v.ended);
    if (sonando.length) return sonando[sonando.length - 1];
    const aMedias = videos.filter((v) => !videoTerminado(v));
    if (aMedias.length) return aMedias[aMedias.length - 1];
    return videos[videos.length - 1];
  }

  function relevoEnPagina(prestado, enPagina) {
    if (!enPagina || enPagina === prestado) return null;
    if (!prestado.isConnected) return enPagina;
    if (!enPagina.paused && !enPagina.ended) return enPagina;
    if (videoTerminado(prestado)) return enPagina;
    return null;
  }

  /* El <video> que la ventana flotante ha tomado prestado (ver YTM). */
  let borrowedMedia = null;

  /*
   * YouTube normal NO pinta ninguna <img> con la caratula: la caratula
   * ES el video. Pero la miniatura existe en su CDN y la URL se deriva
   * del video-id de ytd-watch-flexy. Para que metadata-reader no tenga
   * que conocer este truco (el solo sabe leer .src de un elemento), el
   * adaptador fabrica UNA <img> desconectada que hace de portadora de
   * .src; no se inserta en ningun DOM. Se reutiliza siempre el mismo
   * elemento porque el lector consulta varias veces por segundo.
   *
   * hqdefault y no maxresdefault: la primera existe para TODOS los
   * videos; la grande devuelve 404 en muchos y una caratula rota es
   * peor que una caratula modesta.
   */
  let artworkSintetica = null;

  const adapter = {
    schemaVersion: YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION,
    SELECTORS,

    getPlayerBar() {
      return queryFirst(SELECTORS.playerBar);
    },

    /** Lo registra pip.js al prestarse el video; null al devolverlo. */
    setBorrowedMedia(el) {
      borrowedMedia = el || null;
    },

    getPageMediaElement() {
      return elegirVideoVivo(queryAll(SELECTORS.mediaElement));
    },

    getReplacementFor(prestado) {
      if (!prestado) return null;
      return relevoEnPagina(prestado, this.getPageMediaElement());
    },

    getMediaElement() {
      if (!borrowedMedia) return this.getPageMediaElement();
      // Igual que en YTM: un getter no deshace el prestamo, solo evita
      // contestar con el elemento muerto. De anular se encarga pip.js.
      return this.getReplacementFor(borrowedMedia) || borrowedMedia;
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
      const flexy = queryFirst(SELECTORS.watchRoot);
      const videoId = flexy && flexy.getAttribute("video-id");
      if (!videoId) return null;
      const src = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
      if (!artworkSintetica) artworkSintetica = document.createElement("img");
      if (artworkSintetica.getAttribute("src") !== src) artworkSintetica.setAttribute("src", src);
      return artworkSintetica;
    },

    getProgressBarElement() {
      return queryFirst(SELECTORS.progressBar);
    },

    getTimeInfoElement() {
      return queryFirst(SELECTORS.timeInfo);
    },

    /*
     * null A PROPOSITO, y es la decision mas importante del adaptador.
     *
     * En YouTube Music el <video> acumula la cola entera y solo su
     * interfaz sabe el tiempo de la pista. En YouTube normal es AL REVES,
     * y esta medido: video.duration=1318.6 s (21:58, exactamente la
     * duracion del video) mientras la barra mentia con aria-valuenow=16
     * con el video en 40.3 — la barra y .ytp-time-current solo se
     * refrescan con los controles a la vista; con el raton fuera se
     * quedan helados.
     *
     * Devolver null hace que TrackTimeline conteste con el <video> a
     * secas y olvide el desplazamiento, que aqui siempre es 0: cada
     * video estrena su propia linea de tiempo.
     */
    getPageTrackTime() {
      return null;
    },

    /*
     * undefined A PROPOSITO: igual que en YouTube Music, el <video> es
     * la verdad sobre "esta sonando" y el lector de metadatos solo
     * pregunta a la pagina cuando NO hay medio. El metodo entro al
     * contrato en la tanda 3 por Spotify, que no tiene medio en el DOM.
     */
    isPagePlaying() {
      return undefined;
    },

    /*
     * LETRAS: no existen en youtube.com (medido: 0 cabeceras .tab-header,
     * ningun panel). capacidades.letras=false lo anuncia; estos metodos
     * cumplen el contrato contestando "no hay", que es la verdad. La
     * pestaña no esta "deshabilitada" (eso significaria "esta cancion no
     * trae letra"): directamente no existe.
     */
    getLyricsTab() {
      return null;
    },

    isLyricsTabDisabled() {
      return false;
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

    // Sin panel de letras no hay linea que se cante: undefined.
    getActiveLyricsLineIndex() {
      return undefined;
    },

    // Better Lyrics solo se inyecta en music.youtube.com; aqui no hay
    // nada que buscar.
    getBetterLyricsContainer() {
      return null;
    },

    getBetterLyricsLines() {
      return [];
    },

    getBetterLyricsSourceName() {
      return "";
    },

    getPlayerContainer() {
      return queryFirst(SELECTORS.playerContainer);
    },

    getLikeButton() {
      return queryFirst(SELECTORS.likeButton);
    },

    getDislikeButton() {
      return queryFirst(SELECTORS.dislikeButton);
    },

    // Medido: 0 botones de repetir y 0 de aleatorio en toda la pagina.
    // capacidades.repetir y .aleatorio van en false por esta evidencia.
    getRepeatButton() {
      return null;
    },

    getShuffleButton() {
      return null;
    },

    /*
     * En YTM el estado de "me gusta" vive en el atributo like-status de
     * un renderer. Aqui vive en el aria-pressed de CADA boton, y esta
     * medido que son reales: like devolvio "true" y dislike "false" en
     * la pagina de verdad. Se componen los dos en el mismo vocabulario
     * LIKE/DISLIKE/INDIFFERENT que el resto del sistema ya habla.
     */
    getLikeStatus() {
      const like = this.isToggleActive(this.getLikeButton());
      const dislike = this.isToggleActive(this.getDislikeButton());
      if (like === undefined && dislike === undefined) return undefined;
      const { LIKE_STATUS } = YTMPip.CONSTANTS;
      if (like === true) return LIKE_STATUS.LIKE;
      if (dislike === true) return LIKE_STATUS.DISLIKE;
      return LIKE_STATUS.INDIFFERENT;
    },

    isToggleActive(button) {
      if (!button) return undefined;
      const pressed = button.getAttribute("aria-pressed");
      if (pressed === "true") return true;
      if (pressed === "false") return false;
      return undefined;
    },

    // Sin boton de repetir no hay modo que leer: undefined es "no se
    // puede saber", el mismo vocabulario del adaptador de YTM.
    getRepeatMode() {
      return undefined;
    },

    getQueueItems() {
      return queryAll(SELECTORS.queueItems);
    },

    getQueueItemTitleElement(item) {
      return item ? queryFirst(QUEUE_ITEM_SELECTORS.title, item) : null;
    },

    getQueueItemBylineElement(item) {
      return item ? queryFirst(QUEUE_ITEM_SELECTORS.byline, item) : null;
    },

    // `selected` es un atributo booleano igual que en YTM (medido:
    // selected=true en el item que sonaba, false en los demas).
    isQueueItemSelected(item) {
      return !!(item && item.hasAttribute && item.hasAttribute("selected"));
    },

    isValidPlayerBar(el) {
      if (!el || !el.tagName) return false;
      return el.id === "movie_player" || el.tagName.toLowerCase() === "ytd-player";
    },

    // YouTube tampoco tiene Canvas: el unico <video> es la pista.
    getCanvasVideo() {
      return null;
    },

    // Igual que en YouTube Music: aqui se escribe sobre el <video>
    // (medioEscribible: true) y la via de pagina no esta medida.
    seekPageTo() {
      return false;
    },

    setPageVolume() {
      return false;
    },

    getPageVolume() {
      return null;
    }
  };

  /*
   * Solo www.youtube.com: Chrome redirige youtube.com al www, y
   * m.youtube.com es OTRO DOM que nadie ha auditado — reclamarlo seria
   * volver a los selectores imaginados.
   *
   * Las capacidades, con su evidencia:
   *   letras:    false  0 cabeceras .tab-header, ningun panel de letra
   *   cola:      true   panel con 25 items, selected/#video-title/#byline medidos
   *   repetir:   false  0 botones de repetir en la pagina
   *   aleatorio: false  0 botones de aleatorio en la pagina
   *   meGusta:   true   aria-pressed real en like y dislike
   *   medioEscribible: true  el <video> de #movie_player acepta volumen,
   *                     velocidad y currentTime (es el mismo sobre el que
   *                     ya operan play/pause y los saltos)
   *   videoPrestable: true  #movie_player video unico, padre .html5-video-container
   *   audioGrafo: true  mismo servido por MSE sin DRM que YTM (mismo <video>
   *                     de la plataforma); createMediaElementSource no silencia
   */
  YTMPip.Adaptadores.registrar({
    id: "youtube",
    nombre: "YouTube",
    hostnames: ["www.youtube.com"],
    capacidades: {
      letras: false,
      cola: true,
      repetir: false,
      aleatorio: false,
      meGusta: true,
      medioEscribible: true,
      videoPrestable: true,
      audioGrafo: true
    },
    adapter
  });
})(typeof self !== "undefined" ? self : globalThis);
