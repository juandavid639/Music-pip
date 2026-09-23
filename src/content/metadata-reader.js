/*
 * Lee titulo, artista, portada, tiempo actual y duracion desde el DOM
 * de YouTube Music, apoyandose unicamente en YTMPip.Adapter.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  function cleanText(el) {
    if (!el) return "";
    return (el.textContent || "").trim();
  }

  function readArtworkUrl() {
    const img = YTMPip.Adapter.getArtworkElement();
    if (!img || !img.src) return undefined;
    // YouTube Music suele servir thumbnails con un sufijo de tamano (=w60-h60...).
    // Se solicita una version mas grande cuando el patron es reconocible.
    return img.src.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
  }

  function readTitleAndArtist() {
    const title = cleanText(YTMPip.Adapter.getTitleElement());
    const subtitle = cleanText(YTMPip.Adapter.getSubtitleElement());
    // El "byline" suele tener el formato "Artista • Album • Año"
    const parts = subtitle
      .split("•")
      .map((p) => p.trim())
      .filter(Boolean);
    return {
      title,
      artist: parts[0] || "",
      album: parts[1] || undefined
    };
  }

  /*
   * OJO: el tiempo NO sale del <video>.
   *
   * YouTube Music reutiliza el mismo elemento y le añade las pistas a la
   * misma linea de tiempo, asi que `currentTime` y `duration` son acumulados
   * de toda la cola: tras una cancion de 3:36 y otra de 3:18, el elemento
   * dice 6:54. Ver src/content/track-timeline.js.
   */
  function readTrackTime() {
    const { elapsed, duration } = YTMPip.TrackTimeline.read();
    return { currentTime: elapsed, duration };
  }

  /*
   * Detecta si la pista actual trae imagen ademas de sonido.
   *
   * En modo "cancion" YouTube Music reproduce SOLO AUDIO: el <video>
   * existe igualmente pero mide 0x0. Por eso no basta con que haya un
   * elemento <video>; hay que mirar videoWidth. De esto depende que la
   * ventana flotante muestre el video real o se quede con la portada.
   */
  function readHasVideo(media) {
    if (!media) return false;
    return Number(media.videoWidth) > 0 && Number(media.videoHeight) > 0;
  }

  /*
   * Detecta si el video puede flotar en la ventanita NATIVA del navegador
   * (requestPictureInPicture). Es la unica via medida para ver el video
   * DRM de Spotify (2026-09-16, en vivo: la ventanita se abrio con el
   * video cifrado dentro, 293x165): el navegador la compone el solo y
   * nunca entrega los cuadros a JS, asi que el cifrado no la toca — el
   * DRM protege los bytes, no la ventana.
   *
   * La señal es estructural, no un caso especial de Spotify: pista con
   * imagen de verdad (readHasVideo: en modo cancion el <video> de YTM
   * mide 0x0 y no hay nada que flotar), la pagina no lo veta
   * (disablePictureInPicture, medido false en Spotify) y el documento lo
   * permite (pictureInPictureEnabled, medido true). El typeof cubre
   * navegadores sin la API: prometer el boton alli seria mentir.
   */
  function readNativePip(media) {
    return (
      readHasVideo(media) &&
      typeof media.requestPictureInPicture === "function" &&
      media.disablePictureInPicture !== true &&
      Boolean(media.ownerDocument) &&
      media.ownerDocument.pictureInPictureEnabled === true
    );
  }

  function readAudio(media) {
    const NORMAL = YTMPip.CONSTANTS.PLAYBACK_RATE_NORMAL;
    if (!media) {
      /*
       * Sin medio el volumen ya no se inventa: en Spotify lo sabe el
       * deslizador de la pagina (getPageVolume, 0..1 medido) y el mando
       * de la ventana pinta este numero — con el 1 fijo de antes
       * marcaba 100% con la pagina al 40% y saltaba de vuelta tras cada
       * arrastre. null = "no hay range" y queda el 1 de siempre, que en
       * los sitios con medio ni se llega a consultar.
       */
      const volumenDePagina = YTMPip.Adapter.getPageVolume();
      return {
        volume: volumenDePagina === null ? 1 : volumenDePagina,
        muted: false,
        playbackRate: NORMAL
      };
    }
    const volume = Number(media.volume);
    const rate = Number(media.playbackRate);
    return {
      volume: Number.isFinite(volume) ? volume : 1,
      muted: Boolean(media.muted),
      /*
       * SE PUBLICA LO QUE EL <video> DICE AHORA, no lo ultimo que se le
       * pidio. La diferencia importa porque `playbackRate` vuelve a
       * `defaultPlaybackRate` cada vez que el elemento hace `load()`, y
       * YouTube Music recarga la pista por su cuenta sin avisar a nadie. Si
       * la ventana recordase el 1,5x que mando, seguiria enseñandolo
       * mientras la musica ya va a velocidad normal: un mando que no
       * coincide con lo que se oye es peor que no tener mando.
       *
       * No se REAPLICA la velocidad al detectar que ha vuelto a 1. Seria
       * facil y seria inventarse una politica —"la velocidad es pegajosa"—
       * que nadie ha pedido y que ademas no se puede comprobar desde aqui
       * si es lo que quiere el usuario. Primero hay que saber si YouTube
       * Music la resetea de verdad: ver tools/diagnostico-velocidad.js.
       *
       * El cero no es "parado", es un valor que no deberia existir: con
       * playbackRate 0 el elemento no avanza y el boton no tendria ninguna
       * posicion que enseñar.
       */
      playbackRate: Number.isFinite(rate) && rate > 0 ? rate : NORMAL
    };
  }

  /*
   * Las canciones que vienen DESPUES de la que suena, [{ title, artist }].
   *
   * La referencia es el elemento con `selected`: sin el no se sabe donde
   * esta "ahora" dentro de la cola, y se devuelve lista vacia en vez de
   * adivinar. Es la misma politica que repetir/aleatorio: preferimos no
   * enseñar cola a enseñar una inventada (por ejemplo, dar por "siguientes"
   * canciones que ya sonaron).
   *
   * Se corta a QUEUE_MAX_ITEMS AQUI y no en la ventana: la cola real puede
   * traer cientos de elementos y este objeto viaja en cada actualizacion de
   * estado hacia el service worker.
   *
   * El byline se parte por "•" igual que el de la barra: mismo formato,
   * misma regla, y solo se queda el artista porque en una fila de la
   * ventana no cabe mas.
   */
  function readUpNext() {
    const Adapter = YTMPip.Adapter;
    const items = Adapter.getQueueItems();
    const selectedAt = items.findIndex((item) => Adapter.isQueueItemSelected(item));
    if (selectedAt === -1) return [];
    return items
      .slice(selectedAt + 1, selectedAt + 1 + YTMPip.CONSTANTS.QUEUE_MAX_ITEMS)
      .map((item) => {
        const title = cleanText(Adapter.getQueueItemTitleElement(item));
        const byline = cleanText(Adapter.getQueueItemBylineElement(item));
        return { title, artist: byline.split("•")[0].trim() };
      })
      // Un elemento sin titulo no es una cancion que anunciar: puede ser un
      // separador o una fila a medio pintar por el virtual scroll.
      .filter((cancion) => cancion.title !== "");
  }

  /*
   * El nombre humano del sitio ("Spotify", "YouTube Music", "YouTube").
   *
   * Sale del registro de adaptadores, que ya lo exige al registrar (ver
   * adapter-registry.js): aqui no se inventa ningun rotulo, solo se
   * transporta el que el adaptador declaro. El popup lo usa para decir
   * "Conectado a Spotify" en vez de mentir con "YouTube Music" en todas
   * partes.
   *
   * undefined = "no se sabe" (registro sin exponer, escenario de prueba
   * antiguo): el consumidor cae a un texto generico, no a un nombre
   * inventado. Y queda FUERA de stateSignature a proposito, como
   * nativePipAvailable: el sitio no cambia en la vida de la pagina, no
   * hay nada que "detectar".
   */
  function readSiteName() {
    if (!YTMPip.Adaptadores || typeof YTMPip.Adaptadores.activo !== "function") {
      return undefined;
    }
    const registro = YTMPip.Adaptadores.activo();
    return registro && registro.nombre ? registro.nombre : undefined;
  }

  YTMPip.MetadataReader = {
    read() {
      const Adapter = YTMPip.Adapter;
      const media = Adapter.getMediaElement();
      const { title, artist, album } = readTitleAndArtist();
      const { currentTime, duration } = readTrackTime();
      const { volume, muted, playbackRate } = readAudio(media);
      // Una sola lectura del DOM: preguntarlo dos veces abre la puerta a que
      // el usuario pulse entre medias y el estado salga incoherente consigo
      // mismo (repeatMode "ALL" con repeatOn false).
      const repeatMode = Adapter.getRepeatMode();

      return {
        connected: true,
        // Ver readSiteName: viaja con el estado pero fuera de la firma.
        siteName: readSiteName(),
        // Con medio, el es la verdad. Sin medio (Spotify: cero <video> y
        // cero <audio> en el DOM, medido dos veces), se le pregunta a la
        // pagina via isPagePlaying(); === true convierte su undefined
        // ("no se puede saber") en false, que es lo que ya significaba
        // "sin medio no suena nada" para los consumidores.
        playing: media ? !media.paused && !media.ended : Adapter.isPagePlaying() === true,
        title,
        artist,
        album,
        artworkUrl: readArtworkUrl(),
        currentTime,
        duration,
        hasVideo: readHasVideo(media),
        // El PiP nativo del navegador: ver readNativePip. Solo lo consume
        // la ventana local (como lyrics.activeLine), no viaja en la firma.
        nativePipAvailable: readNativePip(media),
        // El Canvas: el bucle visual de Spotify (getCanvasVideo, con sus
        // guardas medidas alli). Booleano a proposito: el ELEMENTO no
        // puede viajar en el estado; la ventana se lo vuelve a pedir al
        // adaptador en el momento de capturar. Fuera de la firma, como
        // nativePipAvailable: es una señal local, no un cambio de pista.
        canvasAvailable: Boolean(Adapter.getCanvasVideo()),
        volume,
        muted,
        playbackRate,
        likeStatus: Adapter.getLikeStatus(),
        // undefined = "no se puede saber". Ver isToggleActive() en el
        // adaptador: no inventamos estado cuando YouTube Music no lo expone.
        //
        // Repetir NO es un booleano: son tres posiciones (NONE/ALL/ONE) y
        // viven en un atributo de la barra, no en el boton. Ver
        // getRepeatMode(). `repeatOn` se sigue publicando porque es lo que
        // significa "esta puesto" para quien solo quiera encender la luz.
        repeatMode,
        repeatOn: repeatMode === undefined ? undefined : repeatMode !== "NONE",
        shuffleOn: Adapter.isToggleActive(Adapter.getShuffleButton()),
        upNext: readUpNext()
      };
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
