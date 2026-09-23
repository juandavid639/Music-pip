/*
 * Unica fuente de verdad sobre la estructura del DOM de YouTube Music.
 * Si Google cambia la interfaz, solo este archivo deberia necesitar
 * actualizarse (seccion 11 del documento de arquitectura).
 *
 * Cada selector es una lista ordenada por prioridad:
 *   1. Atributos accesibles (aria-label, aria-*)
 *   2. Roles
 *   3. Etiquetas semanticas / elementos nativos del reproductor
 *   4. Nombres de elementos estables (data-testid, id conocido)
 *   5. Clases CSS como ultimo recurso
 *
 * Las etiquetas traducidas (aria-label en un idioma) NUNCA son el unico
 * metodo de identificacion: siempre se combinan con selectores por rol
 * o por elemento nativo del reproductor (<video>/<ytmusic-player-bar>).
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    playerBar: ["ytmusic-player-bar"],

    mediaElement: ["ytmusic-player video", "video.html5-main-video", "video"],

    playPauseButton: [
      "#play-pause-button",
      "tp-yt-paper-icon-button.play-pause-button",
      '[data-testid="play-pause-button"]',
      '[aria-label*="Pausar" i]',
      '[aria-label*="Pause" i]',
      '[aria-label*="Reproducir" i]',
      '[aria-label*="Play" i]'
    ],

    nextButton: [
      '.next-button',
      '[data-testid="next-button"]',
      '[aria-label*="Siguiente" i]',
      '[aria-label*="Next" i]'
    ],

    previousButton: [
      '.previous-button',
      '[data-testid="previous-button"]',
      '[aria-label*="Anterior" i]',
      '[aria-label*="Previous" i]'
    ],

    title: [
      "ytmusic-player-bar .title.ytmusic-player-bar",
      "ytmusic-player-bar .title",
      '[data-testid="song-title"]'
    ],

    subtitleByline: [
      "ytmusic-player-bar .byline.ytmusic-player-bar",
      "ytmusic-player-bar .byline",
      '[data-testid="song-byline"]'
    ],

    artwork: ["ytmusic-player-bar img.image", "ytmusic-player-bar img.ytmusic-player-bar"],

    progressBar: [
      "#progress-bar",
      'tp-yt-paper-slider#progress-bar',
      '[role="slider"][aria-label*="tiempo" i]',
      '[role="slider"][aria-label*="time" i]'
    ],

    /*
     * El texto "1:35 / 3:18" de la barra de YouTube Music.
     *
     * Es la SEGUNDA fuente del tiempo por pista, y no es redundante: son
     * dos mecanismos distintos de la misma interfaz, asi que es improbable
     * que Google se los lleve por delante a la vez. Ademas no depende del
     * idioma (son digitos y dos puntos) y es literalmente lo que el usuario
     * tiene delante, que es contra lo que se compara cuando algo falla.
     */
    timeInfo: [
      "ytmusic-player-bar .time-info",
      "ytmusic-player-bar span.time-info",
      ".ytmusic-player-bar .time-info"
    ],

    /*
     * Contenedor del reproductor de video. Solo se usa como destino de
     * ULTIMO RECURSO al devolver el <video> que el PiP toma prestado: lo
     * normal es reinsertarlo en su padre original.
     */
    playerContainer: ["ytmusic-player #movie_player", "ytmusic-player", "#player"],

    /*
     * "Me gusta": el renderer expone el atributo `like-status` con los
     * valores LIKE / DISLIKE / INDIFFERENT. Es la unica señal de estado
     * de toda la barra que NO depende del idioma, asi que es la unica
     * cuyo estado reflejamos con seguridad en la ventana flotante.
     */
    likeRenderer: ["ytmusic-player-bar ytmusic-like-button-renderer", "ytmusic-like-button-renderer"],

    likeButton: [
      "ytmusic-player-bar ytmusic-like-button-renderer #button-shape-like button",
      "ytmusic-player-bar ytmusic-like-button-renderer button[aria-label*='Me gusta' i]",
      "ytmusic-player-bar ytmusic-like-button-renderer button[aria-label*='Like' i]"
    ],

    dislikeButton: [
      "ytmusic-player-bar ytmusic-like-button-renderer #button-shape-dislike button",
      "ytmusic-player-bar ytmusic-like-button-renderer button[aria-label*='No me gusta' i]",
      "ytmusic-player-bar ytmusic-like-button-renderer button[aria-label*='Dislike' i]"
    ],

    repeatButton: [
      "ytmusic-player-bar .repeat",
      "ytmusic-player-bar #repeat",
      '[aria-label*="Repetir" i]',
      '[aria-label*="Repeat" i]'
    ],

    shuffleButton: [
      "ytmusic-player-bar .shuffle",
      "ytmusic-player-bar #shuffle",
      '[aria-label*="Aleatorio" i]',
      '[aria-label*="Shuffle" i]'
    ],

    /*
     * ESTRUCTURA REAL DEL PANEL DE LETRAS:
     *
     *   #player-page
     *     .tab-header  x4   -> [0] a continuacion  [1] LETRA  [2] comentarios  [3] relacionado
     *                          (eran 3; «Comentarios» aparecio en 2026 y entro
     *                          DESPUES de la de letras: la posicion [1] siguio
     *                          valiendo de chiripa, y por eso ya no es el
     *                          metodo principal sino el ultimo recurso)
     *     #tab-renderer
     *       ytmusic-description-shelf-renderer     <- caso CON letra
     *         yt-formatted-string.header           "Letra"
     *         yt-formatted-string.description      <- EL TEXTO
     *         yt-formatted-string.footer           "Fuente: LyricFind"
     *       ytmusic-message-renderer               <- caso SIN letra
     *         yt-formatted-string.text             "Letra no disponible"
     *
     * Los selectores anteriores (.lyrics, #contents.ytmusic-...) eran
     * conjeturas y no existian en el DOM: por eso read() siempre devolvia
     * UNAVAILABLE.
     */
    playerPage: ["#player-page", "ytmusic-player-page"],

    tabRenderer: ["#tab-renderer"],

    lyricsTab: [
      'tp-yt-paper-tab[aria-label*="Letra" i]',
      'tp-yt-paper-tab[aria-label*="Lyrics" i]',
      '[role="tab"][aria-label*="Letra" i]',
      '[role="tab"][aria-label*="Lyrics" i]'
    ],

    // Se apunta al .description, NO al shelf entero: arrastrar el shelf
    // metia "Letra" y "Fuente: LyricFind" dentro del propio texto.
    lyricsText: [
      "#tab-renderer ytmusic-description-shelf-renderer yt-formatted-string.description",
      "ytmusic-description-shelf-renderer yt-formatted-string.description",
      "#tab-renderer ytmusic-description-shelf-renderer #contents"
    ],

    lyricsSource: [
      "#tab-renderer ytmusic-description-shelf-renderer yt-formatted-string.footer",
      "ytmusic-description-shelf-renderer yt-formatted-string.footer"
    ],

    // Mensaje explicito de "no hay letra" que renderiza YouTube Music.
    lyricsMessage: [
      "#tab-renderer ytmusic-message-renderer yt-formatted-string.text",
      "#tab-renderer ytmusic-message-renderer"
    ],

    /*
     * Letras inyectadas por la extension Better Lyrics, si el usuario la
     * tiene instalada. Seguimos sin salir de la pagina: esto ya esta en el
     * DOM de music.youtube.com y es lo que el usuario ve en pantalla; no
     * hacemos ninguna peticion de red.
     *
     * Importa porque Better Lyrics OCULTA el panel nativo de YouTube Music
     * (le añade la clase `blyrics-hidden`) y pone el suyo en su lugar. Sin
     * leer esto, con Better Lyrics activa nos quedabamos sin ninguna de las
     * dos fuentes.
     */
    betterLyricsContainer: ["#blyrics-wrapper .blyrics-container", ".blyrics-container"],

    // El enlace del pie con el nombre del proveedor real (LRCLIB, Musixmatch...).
    betterLyricsSource: ["#betterLyricsFooterLink"],

    /*
     * LA COLA ("A continuacion"), el panel lateral del reproductor.
     *
     * AVISO HONESTO: estos selectores estan SIN VERIFICAR contra HTML real,
     * igual que estuvieron los de repetir/aleatorio (y los de letras, que
     * eran conjeturas y costaron un panel que siempre decia "no
     * disponible"). Hay un tools/diagnostico-cola.js para comprobarlos en
     * la pagina de verdad antes de fiarse.
     *
     * El elemento con la cancion que SUENA lleva el atributo `selected`:
     * es la referencia para saber cuales son "las siguientes". Sin ese
     * atributo a la vista no se adivina — mejor no enseñar cola que
     * enseñar la equivocada.
     */
    queueItems: [
      "ytmusic-player-queue ytmusic-player-queue-item",
      "#queue ytmusic-player-queue-item",
      "ytmusic-player-queue-item"
    ]
  };

  /*
   * Sub-selectores DENTRO de un elemento de cola. Viven aparte de SELECTORS
   * porque no se consultan contra el documento sino contra cada elemento,
   * pero viven en ESTE archivo por la misma regla que todo lo demas: la
   * estructura del DOM de YouTube Music no se conoce en ningun otro sitio.
   */
  const QUEUE_ITEM_SELECTORS = {
    title: [".song-title", ".title"],
    byline: [".byline", ".song-info .byline"]
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

  /*
   * Como queryFirst, pero devolviendo TODAS las coincidencias del primer
   * selector que encuentre algo. Se mantiene la prioridad entre selectores:
   * si "ytmusic-player video" encuentra candidatos, el "video" a secas del
   * final no puede colar un elemento de cualquier otra parte de la pagina.
   */
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

  /* "3:18" -> 198. "1:02:03" -> 3723. Cualquier otra cosa -> NaN. */
  function aSegundos(texto) {
    const partes = String(texto == null ? "" : texto).trim().split(":");
    if (partes.length < 2 || partes.length > 3) return NaN;
    let total = 0;
    for (const parte of partes) {
      if (!/^\d{1,2}$/.test(parte)) return NaN;
      total = total * 60 + Number(parte);
    }
    return total;
  }

  function numeroFinito(...candidatos) {
    for (const candidato of candidatos) {
      if (candidato === null || candidato === undefined || candidato === "") continue;
      const n = Number(candidato);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  /*
   * El deslizador de YouTube Music, leido por sus atributos ARIA (y por
   * sus propiedades como respaldo, que es donde Polymer guarda el valor).
   */
  function leerDeslizador(el) {
    if (!el) return null;
    const duration = numeroFinito(el.getAttribute("aria-valuemax"), el.getAttribute("max"), el.max);
    const elapsed = numeroFinito(el.getAttribute("aria-valuenow"), el.getAttribute("value"), el.value);
    if (!(duration > 0) || !Number.isFinite(elapsed)) return null;
    return { elapsed: Math.max(0, Math.min(elapsed, duration)), duration };
  }

  /* Del texto "1:35 / 3:18". El separador puede ser "/" o "•" segun version. */
  function leerTextoDeTiempo(texto) {
    const partes = String(texto == null ? "" : texto).split(/[/•]/);
    if (partes.length !== 2) return null;
    const elapsed = aSegundos(partes[0]);
    const duration = aSegundos(partes[1]);
    if (!Number.isFinite(elapsed) || !(duration > 0)) return null;
    return { elapsed: Math.max(0, Math.min(elapsed, duration)), duration };
  }

  /*
   * ¿Este <video> ya termino de sonar? Un cadaver tipico esta parado al
   * final de su pista: currentTime pegado a duration. El medio segundo de
   * margen es porque los reproductores rara vez llegan al ultimo
   * milisegundo exacto antes de encadenar la siguiente cancion.
   *
   * Con duration invalida (NaN, 0) NO se declara terminado: un video
   * recien creado que aun no cargo metadatos esta empezando, no acabando.
   */
  function videoTerminado(video) {
    if (video.ended) return true;
    const d = video.duration;
    return Number.isFinite(d) && d > 0 && video.currentTime >= d - 0.5;
  }

  /*
   * Entre varios <video> de la pagina, el que de verdad esta sonando.
   *
   * Existir mas de uno no es teorico: al encadenar canciones YouTube Music
   * a veces ABANDONA el <video> de la pista anterior en el DOM, delante
   * del nuevo, y quedarse "con el primero que encuentre el selector" era
   * quedarse con el cadaver. Sintoma exacto reportado dos veces: el titulo
   * de la ventana flotante cambia a la cancion nueva pero la barra se
   * queda clavada donde murio la anterior ("se junta el tiempo entre
   * canciones"). El primer arreglo (tirar el video al devolverlo,
   * discardVideo) solo cubria el cadaver que fabricabamos NOSOTROS con el
   * prestamo; este cubre el que fabrica YouTube Music por su cuenta.
   *
   * Criterio, por orden:
   *   1. Uno que este REPRODUCIENDO (ni pausado ni terminado) gana siempre.
   *   2. Si no, uno que no haya llegado al final: pausado a mitad de
   *      cancion es el usuario con la pausa puesta; parado al final es un
   *      resto de la pista anterior.
   *   3. En empate, el ULTIMO en orden de documento: YouTube Music añade
   *      los elementos nuevos despues de abandonar los viejos.
   */
  function elegirVideoVivo(videos) {
    if (!videos.length) return null;
    const sonando = videos.filter((v) => !v.paused && !v.ended);
    if (sonando.length) return sonando[sonando.length - 1];
    const aMedias = videos.filter((v) => !videoTerminado(v));
    if (aMedias.length) return aMedias[aMedias.length - 1];
    return videos[videos.length - 1];
  }

  /*
   * ¿El <video> que hay en la pagina RELEVA de verdad al prestado?
   *
   * Esta funcion existe porque la regla anterior era "si la pagina tiene un
   * <video> distinto del prestado, el prestado ya no vale". Parecia segura
   * (el nuestro nos lo llevamos, luego cualquier otro tiene que ser nuevo)
   * y es FALSA: la pagina puede tener un <video> que no es ni el nuestro ni
   * el que suena. Un cadaver a medias, por ejemplo el que queda cuando el
   * usuario se salta una cancion por la mitad.
   *
   * Lo que provocaba: la ventana marcaba 7:46 de 9:00 mientras YouTube
   * Music iba por 0:35 de 3:40. La DURACION tambien estaba mal, y esa era
   * la pista: no era una barra congelada, era el <video> equivocado leido
   * en vivo. Y no se quedaba en leerlo mal, porque syncVideoMode() usaba
   * esta misma regla para TIRAR el prestado y quedarse con el cadaver: de
   * ahi el recuadro de video en negro.
   *
   * Ahora hace falta una prueba de verdad para abandonar el prestamo:
   *   1. El prestado no esta en ningun documento: es basura, se cede.
   *   2. El de la pagina esta SONANDO: eso es la cancion de ahora.
   *   3. El prestado ya termino su pista: lo que venga despues es mejor.
   * Un candidato pausado a la mitad no prueba nada, y es justo el que se
   * colaba.
   *
   * Fijarse en la asimetria, que es el corazon del arreglo: "terminado" se
   * le exige al NUESTRO para soltarlo, no al de la pagina para descartarlo.
   * Al reves era el error: "el de la pagina no ha terminado, luego esta
   * vivo" da por bueno cualquier cadaver que se quedo a la mitad.
   */
  function relevoEnPagina(prestado, enPagina) {
    if (!enPagina || enPagina === prestado) return null;
    if (!prestado.isConnected) return enPagina;
    if (!enPagina.paused && !enPagina.ended) return enPagina;
    if (videoTerminado(prestado)) return enPagina;
    return null;
  }

  /*
   * El <video> que la ventana flotante ha tomado prestado.
   *
   * Cuando el PiP muestra video real, mueve el elemento a SU documento.
   * A partir de ese momento un querySelector sobre `document` ya no lo
   * encuentra, y sin esta referencia se romperia todo lo demas: play,
   * pausa, tiempo, volumen... todo pasa por getMediaElement().
   */
  let borrowedMedia = null;

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

    /**
     * Consulta cruda de la pagina, ignorando el prestamo.
     *
     * No es un queryFirst: si hay varios <video> (el nuevo mas un cadaver
     * de la pista anterior), se elige el que esta vivo, no el primero.
     */
    getPageMediaElement() {
      return elegirVideoVivo(queryAll(SELECTORS.mediaElement));
    },

    /**
     * El <video> de la pagina que releva al prestado, o null si ninguno lo
     * hace. Lo usa tambien syncVideoMode() en pip.js: las dos mitades del
     * arreglo TIENEN que decidir con la misma regla, porque cuando no
     * coincidian una leia del elemento bueno y la otra lo tiraba.
     */
    getReplacementFor(prestado) {
      if (!prestado) return null;
      return relevoEnPagina(prestado, this.getPageMediaElement());
    },

    getMediaElement() {
      if (!borrowedMedia) return this.getPageMediaElement();

      /*
       * No se anula `borrowedMedia` aqui: un getter no debe deshacer el
       * prestamo por su cuenta o pip.js se quedaria sin la referencia que
       * necesita para devolver el elemento a su sitio. De eso se encarga
       * syncVideoMode(). Esto solo evita contestar con el elemento muerto
       * mientras tanto.
       */
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
      return queryFirst(SELECTORS.artwork);
    },

    getProgressBarElement() {
      return queryFirst(SELECTORS.progressBar);
    },

    getTimeInfoElement() {
      return queryFirst(SELECTORS.timeInfo);
    },

    /**
     * El tiempo de LA PISTA ACTUAL, `{ elapsed, duration }` en segundos,
     * segun la propia interfaz de YouTube Music. null si no se puede saber.
     *
     * Existe porque el `<video>` NO sirve para esto. YouTube Music reutiliza
     * el mismo elemento y le va añadiendo las pistas a la MISMA linea de
     * tiempo, asi que `currentTime` y `duration` son acumulados de toda la
     * cola: con una cancion de 3:36 seguida de otra de 3:18, el elemento
     * dice 6:54 de duracion. Su barra dice 3:18 porque le resta el
     * desplazamiento de lo ya sonado, y ese resto solo lo sabe ella.
     */
    getPageTrackTime() {
      return (
        leerDeslizador(this.getProgressBarElement()) ||
        leerTextoDeTiempo(this.getTimeInfoElement() && this.getTimeInfoElement().textContent)
      );
    },

    /*
     * undefined A PROPOSITO: aqui el <video> es la verdad sobre "esta
     * sonando" (media.paused), y el lector de metadatos solo pregunta a
     * la pagina cuando NO hay medio. El metodo existe porque entro al
     * contrato en la tanda 3, cuando Spotify —sin <video> ni <audio> en
     * el DOM— obligo a leer ese estado de la interfaz.
     */
    isPagePlaying() {
      return undefined;
    },

    /*
     * La pestaña de letras se busca por su TEXTO («Letra»/«Lyrics») entre
     * las cabeceras del reproductor, y solo si ningun texto se reconoce
     * (otro idioma) se cae a la posicion (la segunda cabecera).
     *
     * Historia: fue al reves —posicion primero— hasta la validacion de
     * fase 0 sobre el sitio real, que enseño dos cosas: (1) las pestañas
     * ya son CUATRO («A continuacion · Letra · Comentarios · Relacionado»)
     * y la de letras sigue siendo la segunda de pura suerte, porque Google
     * puso la nueva «Comentarios» despues y no antes; (2) ninguna cabecera
     * lleva aria-label, asi que el "refuerzo" por aria-label estaba muerto
     * (0 de 4 selectores encontraban nada). El texto no viaja solo: se
     * exige que sea una .tab-header dentro de la pagina del reproductor,
     * cumpliendo la regla de la casa (etiqueta traducida NUNCA como unico
     * metodo de identificacion).
     */
    getLyricsTab() {
      const page = queryFirst(SELECTORS.playerPage);
      if (page) {
        const headers = Array.from(page.querySelectorAll(".tab-header"));
        const porTexto = headers.find(function (h) {
          return /^(letra|lyrics)$/i.test((h.textContent || "").trim());
        });
        if (porTexto) return porTexto;
        if (headers.length > 1) return headers[1];
      }
      return queryFirst(SELECTORS.lyricsTab);
    },

    /**
     * YouTube Music marca la pestaña con `disabled` cuando la cancion no
     * tiene letra. Es la señal mas temprana y fiable de "no disponible":
     * se conoce sin abrir el panel siquiera.
     */
    isLyricsTabDisabled() {
      const tab = this.getLyricsTab();
      if (!tab) return false;
      return tab.hasAttribute("disabled") || tab.getAttribute("aria-disabled") === "true";
    },

    getTabRenderer() {
      return queryFirst(SELECTORS.tabRenderer);
    },

    getLyricsTextElement() {
      return queryFirst(SELECTORS.lyricsText);
    },

    getLyricsSourceElement() {
      return queryFirst(SELECTORS.lyricsSource);
    },

    getLyricsMessageElement() {
      return queryFirst(SELECTORS.lyricsMessage);
    },

    /*
     * Aqui la sincronia va por TIEMPOS (los data-time de Better Lyrics)
     * y el panel nativo no marca la linea que suena: undefined es la
     * verdad, no una carencia. El metodo existe por Spotify, donde la
     * unica señal de sincronia es la marca de la propia pagina.
     */
    getActiveLyricsLineIndex() {
      return undefined;
    },

    getBetterLyricsContainer() {
      return queryFirst(SELECTORS.betterLyricsContainer);
    },

    /**
     * Las lineas de Better Lyrics, en orden.
     *
     * Solo hijas DIRECTAS: cada linea puede contener a su vez la traduccion
     * y la romanizacion como sublineas, y anidarlas en la lista las
     * convertiria en lineas sueltas con el mismo `data-time`.
     */
    getBetterLyricsLines(container) {
      const scope = container || this.getBetterLyricsContainer();
      if (!scope) return [];
      return Array.from(scope.querySelectorAll(":scope > .blyrics--line"));
    },

    /**
     * El nombre del proveedor que Better Lyrics muestra en su pie.
     *
     * Se leen SOLO los nodos de texto directos del enlace. Better Lyrics le
     * cuelga tambien un <span> con un icono SVG, y un SVG puede traer <title>
     * o <desc>, que textContent concatenaria al nombre. Es exactamente la
     * misma trampa del `.footer` de YouTube Music, asi que se evita igual.
     */
    getBetterLyricsSourceName() {
      const link = queryFirst(SELECTORS.betterLyricsSource);
      if (!link) return "";
      return Array.from(link.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join("")
        .trim();
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

    getRepeatButton() {
      return queryFirst(SELECTORS.repeatButton);
    },

    getShuffleButton() {
      return queryFirst(SELECTORS.shuffleButton);
    },

    /**
     * Devuelve "LIKE" | "DISLIKE" | "INDIFFERENT", o undefined si no se
     * puede saber. Independiente del idioma: sale de un atributo, no de
     * una etiqueta traducida.
     */
    getLikeStatus() {
      const renderer = queryFirst(SELECTORS.likeRenderer);
      if (!renderer) return undefined;
      const raw = (renderer.getAttribute("like-status") || "").toUpperCase();
      const { LIKE_STATUS } = YTMPip.CONSTANTS;
      return raw === LIKE_STATUS.LIKE || raw === LIKE_STATUS.DISLIKE || raw === LIKE_STATUS.INDIFFERENT
        ? raw
        : undefined;
    },

    /**
     * Estado de repetir/aleatorio.
     *
     * A diferencia de "me gusta", YouTube Music NO expone estos dos en un
     * atributo estable: la unica pista es el aria-label, que esta
     * traducido. Por eso solo se devuelve true/false cuando el boton trae
     * un `aria-pressed` explicito; en cualquier otro caso se devuelve
     * undefined y la ventana flotante se abstiene de pintar el boton como
     * activo. Preferimos no mostrar estado a mostrar uno inventado.
     */
    isToggleActive(button) {
      if (!button) return undefined;
      const pressed = button.getAttribute("aria-pressed");
      if (pressed === "true") return true;
      if (pressed === "false") return false;
      return undefined;
    },

    /**
     * El modo de repeticion: "NONE", "ALL", "ONE", o undefined si no se sabe.
     *
     * VERIFICADO EN LA PAGINA REAL con tools/diagnostico-relevo.js, pulsando
     * el boton tres veces:
     *
     *     en el BOTON: {title: '"Repetir una" -> "No repetir"'}
     *     en la BARRA: {repeat-mode: '"ONE" -> "NONE"'}
     *     en la BARRA: {repeat-mode: '"NONE" -> "ALL"'}
     *     en la BARRA: {repeat-mode: '"ALL" -> "ONE"'}
     *
     * Tres cosas que decide esa salida:
     *
     * 1. El estado NO esta en el boton. Su `aria-pressed` es null, que es
     *    justo por lo que isToggleActive se abstenia y el usuario no podia
     *    saber si repetir estaba puesto. Esta en un atributo de la BARRA.
     * 2. NO es un booleano. Son tres posiciones, y por eso esto devuelve el
     *    modo y no true/false: un si/no tendria que mentir en una de ellas.
     * 3. Se lee `repeat-mode` y no el `title`, aunque el title tambien
     *    cambie, porque el title viene TRADUCIDO ("Repetir una", "No
     *    repetir"). Los valores del atributo estan en mayusculas y en
     *    ingles en todos los idiomas.
     *
     * Se comprueba que el valor sea uno de los tres conocidos: si YouTube
     * Music inventa un modo nuevo, preferimos no saberlo a pintar algo que
     * no entendemos.
     */
    getRepeatMode() {
      const barra = this.getPlayerBar();
      if (!barra) return undefined;
      const modo = barra.getAttribute("repeat-mode");
      return modo === "NONE" || modo === "ALL" || modo === "ONE" ? modo : undefined;
    },

    /** Los elementos de la cola, en el orden en que YouTube Music los pinta. */
    getQueueItems() {
      return queryAll(SELECTORS.queueItems);
    },

    getQueueItemTitleElement(item) {
      return item ? queryFirst(QUEUE_ITEM_SELECTORS.title, item) : null;
    },

    getQueueItemBylineElement(item) {
      return item ? queryFirst(QUEUE_ITEM_SELECTORS.byline, item) : null;
    },

    /*
     * `selected` es un atributo booleano al estilo Polymer (como `disabled`
     * en la pestaña de letras): esta o no esta, sin valor que interpretar.
     */
    isQueueItemSelected(item) {
      return !!(item && item.hasAttribute && item.hasAttribute("selected"));
    },

    /** Valida que el elemento encontrado realmente pertenezca al reproductor. */
    isValidPlayerBar(el) {
      return !!(el && el.tagName && el.tagName.toLowerCase() === "ytmusic-player-bar");
    },

    // YouTube Music no tiene Canvas: su unico <video> ES la pista (y ya
    // viaja por el prestamo). Devolver ese elemento aqui seria ofrecer
    // de fondo lo mismo que suena.
    getCanvasVideo() {
      return null;
    },

    /*
     * La via de escritura EN LA PAGINA no existe aqui: los saltos y el
     * volumen se escriben sobre el <video> (medioEscribible: true) y el
     * controlador ni llega a preguntar por esta. Prometer una segunda
     * via sin medirla seria inventarse un deslizador.
     */
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
   * El adaptador ya no se autoproclama YTMPip.Adapter: firma el contrato
   * en el registro y ES EL REGISTRO quien publica al elegido segun el
   * hostname. Con un solo adaptador registrado el resultado es identico
   * al de antes; la diferencia se vera cuando YouTube normal y Spotify
   * firmen el suyo.
   *
   * Las capacidades son todas true porque YouTube Music lo tiene todo:
   * es el sitio sobre el que se diseño cada funcion. En particular
   * audioGrafo, porque YTM sirve por MSE sin DRM: conectar su <video> a
   * createMediaElementSource funciona (el espectro lleva meses sonando).
   * En Spotify eso mismo silenciaria el audio (Widevine), y por eso esta
   * capacidad existe.
   */
  YTMPip.Adaptadores.registrar({
    id: "youtube-music",
    nombre: "YouTube Music",
    hostnames: ["music.youtube.com"],
    capacidades: {
      letras: true,
      cola: true,
      repetir: true,
      aleatorio: true,
      meGusta: true,
      medioEscribible: true,
      videoPrestable: true,
      audioGrafo: true
    },
    adapter
  });
})(typeof self !== "undefined" ? self : globalThis);
