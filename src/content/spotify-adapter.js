/*
 * Unica fuente de verdad sobre la estructura del DOM de open.spotify.com,
 * el tercer firmante del contrato de adaptadores. Misma regla que sus
 * hermanos: si Spotify cambia la interfaz, solo este archivo deberia
 * necesitar actualizarse.
 *
 * NINGUN selector de este archivo es una conjetura. Todos salen de CUATRO
 * diagnosticos sobre paginas reales de open.spotify.com (2026-09-14,
 * tools/diagnostico-spotify.js a -4.js), mas dos experimentos de clic del
 * usuario (los tres estados de repetir, los dos del aleatorio).
 *
 * EL HALLAZGO QUE DEFINE ESTE ADAPTADOR: el audio NO ESTA en la pagina.
 * Con musica sonando, dos de las tres pasadas midieron CERO elementos
 * <video>/<audio> en el DOM; la tercera encontro uno solo, y era el
 * "Canvas" (un bucle VISUAL de 6,9 s, muted=true, en el panel lateral).
 * Spotify reproduce el audio fuera del arbol del documento, asi que:
 *
 *   - getPageMediaElement() devuelve null SIEMPRE. Devolver el Canvas
 *     seria mentirle a todos los consumidores: esta silenciado, dura 7
 *     segundos y no sabe nada de la cancion.
 *   - audioGrafo: false. No es (solo) el DRM: no hay elemento del que
 *     colgar un grafo. Sin espectro, sin ecualizador, sin velocidad.
 *   - videoPrestable: false. Lo unico prestable seria el bucle mudo.
 *   - El tiempo, el estado de reproduccion y el volumen que publica el
 *     resto del sistema salen de LA PAGINA o no salen: de ahi
 *     getPageTrackTime() (textos de la barra inferior) y el metodo
 *     isPagePlaying() (el icono del boton de play/pausa), que entro al
 *     contrato en esta tanda.
 *
 * EL MODO VIDEO ES OTRO ANIMAL (medido 2026-09-16, consola en vivo del
 * usuario, tres pasadas). Cuando la pista es un video musical ("Cambiar
 * a audio" visible), SI hay un <video> real en el DOM: blob:, 2560x1080,
 * sin silenciar, duracion 164,36 s —la pista ENTERA, no el Canvas—,
 * colgado de data-testid 'video-player-npv'. Pero llego con
 * mediaKeys != null: DRM (EME). Adoptar un <video> cifrado en otro
 * documento rompe la sesion de claves, asi que el prestamo daria negro
 * o parada: videoPrestable sigue false, ahora POR CIFRADO MEDIDO, no
 * por ausencia. La ventana muestra la caratula tambien en modo video, y
 * eso es lo declarado, no una regresion. En la misma sesion se midio el
 * modo audio otra vez: 0 medios, la medicion original sigue vigente.
 *
 * Desde la tanda del medio por modos, getMediaElement() SI devuelve ese
 * video cuando existe (anclado a video-player-npv para no devolver el
 * Canvas): el DRM impide prestarlo, no controlarlo. medioEscribible
 * sigue declarado false y pasa a leerse como "sin garantia": la ventana
 * consulta el medio vivo antes de esconder los mandos de escritura.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const SELECTORS = {
    // La barra inferior entera; es un <aside>, no un <footer> (medido:
    // en la vista de letras el <footer> desaparece y esta sigue).
    playerBar: ["[data-testid='now-playing-bar']"],

    playPauseButton: ["[data-testid='control-button-playpause']"],
    nextButton: ["[data-testid='control-button-skip-forward']"],
    previousButton: ["[data-testid='control-button-skip-back']"],

    /*
     * Anclados a la ficha de "sonando ahora": sueltos, los data-testid
     * de titulo/artista casan DOS veces (barra inferior + panel derecho,
     * medido) y la caratula TRES. El ancla los deja en uno.
     */
    title: [
      "[data-testid='now-playing-widget'] [data-testid='context-item-info-title']",
      "[data-testid='now-playing-widget'] [data-testid='context-item-link']"
    ],

    // El "byline" es el contenedor de los enlaces de artista; su
    // textContent ya trae "A, B" con varios artistas (medido en la cola).
    subtitleByline: [
      "[data-testid='now-playing-widget'] [data-testid='context-item-info-subtitles']"
    ],

    /*
     * OJO, MEDIDO Y CONFESADO: cuando la cancion trae Canvas, el video
     * mudo LE ROBA EL HUECO a la caratula en la barra (una pasada entera
     * del diagnostico sin ningun cover-art-image). En ese caso no hay
     * elemento que devolver y la ventana cae a su caratula de reserva,
     * que es la respuesta honesta.
     */
    artwork: [
      "[data-testid='now-playing-widget'] [data-testid='cover-art-image']",
      "[data-testid='now-playing-widget'] img"
    ],

    progressBar: ["[data-testid='playback-progressbar']"],

    /*
     * El <input type=range> de la barra: su max esta en MILISEGUNDOS y es
     * exacto (max=161983 con la cancion de 2:41), pero su value va
     * CUANTIZADO a saltos de 5000 ms (step medido). Sirve la duracion;
     * para el transcurrido gana el texto, que avanza de 1 en 1 s.
     */
    progressInput: [
      "[data-testid='playback-progressbar'] input[type='range']",
      "[data-testid='playback-progressbar'] input"
    ],

    timeInfo: ["[data-testid='playback-position']"],
    timeDuration: ["[data-testid='playback-duration']"],

    /*
     * El deslizador de volumen (medido 2026-09-16, censo de ranges):
     * min=0 max=1 step=0.1, o sea que la pagina CUANTIZA a decimas
     * (escribir 0.85 dejo 0.9, y el cambio se oyo). El ancla por testid
     * no es adorno: el censo encontro ademas DOS ranges señuelo
     * (LayoutResizer__resize-bar, los tiradores de ancho de los
     * paneles); un selector generico de range caeria en uno de ellos.
     */
    volumeInput: [
      "[data-testid='volume-bar'] input[type='range']",
      "[data-testid='volume-bar'] input"
    ],

    /*
     * EL VIDEO DEL MODO VIDEO. Medido en vivo (2026-09-16): cuando la
     * pista es un video musical hay un <video> real colgado de
     * data-testid 'video-player-npv' — blob:, la pista entera, sin
     * silenciar. El ANCLA no es adorno: sin ella un querySelector de
     * 'video' a secas devolveria el Canvas (el bucle mudo de 7 s del
     * panel lateral), que es exactamente el elemento que este adaptador
     * lleva prohibido devolver desde su primera medicion.
     */
    videoDeModoVideo: ["[data-testid='video-player-npv'] video"],

    /*
     * EL CANVAS, por fin con nombre propio. Medido en vivo (2026-09-16,
     * consola del usuario): 321x574 vertical, loop=true, muted=true,
     * mediaKeys=null (SIN DRM), src blob:, y su testid mas cercano es
     * NPV_Panel_OpenDiv (el panel lateral de "sonando ahora"). El
     * selector casa TODO video del panel —tambien el de modo video, que
     * cuelga del mismo panel—, por eso getCanvasVideo() filtra por las
     * señas medidas del bucle en vez de fiarse del primero.
     */
    videosDelPanel: ["[data-testid='NPV_Panel_OpenDiv'] video"],

    // Destino de ultimo recurso del contrato de prestamo; aqui nunca se
    // presta nada (videoPrestable: false), pero el metodo debe contestar.
    playerContainer: ["[data-testid='now-playing-bar']"],

    /*
     * "Me gusta" es el boton de guardar de la ficha (aria-label "Agregar
     * a Tus me gusta", pero eso es idioma): el UNICO boton con
     * aria-checked dentro del widget (medido: 1). Su testid 'add-button'
     * NO es de fiar: en una pasada casaba tambien con el de la pagina de
     * album y en otra con ninguno.
     */
    likeButton: ["[data-testid='now-playing-widget'] button[aria-checked]"],

    repeatButton: ["[data-testid='control-button-repeat']"],

    /*
     * EL ALEATORIO FANTASMA: existe, se ve, y es el unico boton de la
     * zona de controles SIN data-testid (medido: 5 botones, 4 con nombre).
     * Se caza por esa ausencia, que es lo unico estable que tiene.
     */
    shuffleButton: ["[data-testid='player-controls'] button:not([data-testid])"],

    lyricsTab: ["[data-testid='lyrics-button']"],

    // Las lineas de la vista de letras (medido: 33 en una cancion real).
    // Solo existen con la vista abierta; cerrada, 0.
    lyricsLines: ["main [data-testid='lyrics-line']", "[data-testid='lyrics-line']"],

    /*
     * LA COLA: el panel derecho es un <aside> con DOS <ul> (medido):
     * el primero es "Estas escuchando" (1 fila) y el segundo lo que
     * viene (12 filas). La separacion es ESTRUCTURAL —primer ul contra
     * el resto— porque los aria-label ("Estas escuchando", "Siguiente")
     * vienen traducidos. Sin panel abierto no hay filas y no se adivina.
     */
    queueItems: ["aside ul li"]
  };

  /*
   * Sub-selectores DENTRO de una fila de cola. El titulo vive en un span
   * con clase de la libreria encore (e-10860-line-clamp, medido), que
   * cambiara de numero el dia que Spotify actualice la libreria; por eso
   * getQueueItemTitleElement lleva ademas una busqueda estructural.
   */
  const QUEUE_ITEM_SELECTORS = {
    title: ["span.e-10860-line-clamp"]
  };

  /*
   * "ESTA SONANDO" SIN IDIOMA. El aria-label del boton de play/pausa
   * viene traducido ("Pausar"/"Reproducir"), asi que la señal es el
   * DIBUJO: el path del SVG medido con musica sonando (dos barras de
   * pausa) empieza distinto que el medido en pausa (triangulo de play).
   * Si Spotify redibuja el icono, la respuesta pasa a ser undefined
   * ("no se puede saber"), nunca una mentira.
   *
   * Verificado en vivo tambien en MODO VIDEO (2026-09-16), en ambos
   * estados: sonando dio el prefijo de pausa y pausado el de play. El
   * boton de la barra inferior es el mismo en los dos modos.
   */
  const ICONO_DE_PAUSA_PREFIJO = "M2.7 1"; // se ve el icono de pausa => suena
  const ICONO_DE_PLAY_PREFIJO = "M3 1.713"; // se ve el icono de play => pausado

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

  /** "2:41" -> 161, "1:02:03" -> 3723; null si no es un tiempo. */
  function parsearTiempo(texto) {
    const limpio = (texto || "").trim();
    if (!/^\d+(:\d{2})+$/.test(limpio)) return null;
    return limpio.split(":").reduce((total, parte) => total * 60 + Number(parte), 0);
  }

  /*
   * EL TRUCO DEL SETTER NATIVO, la unica forma medida de ESCRIBIR en la
   * pagina (2026-09-16, en vivo: el salto se oyo y el volumen tambien).
   * React reemplaza el setter de `value` en la INSTANCIA del input para
   * enterarse de los cambios; escribiendo por el setter del PROTOTIPO y
   * despachando 'input' (burbujeando, que es donde React escucha) el
   * cambio le llega como si fuera del usuario. El 'change' acompaña por
   * si algun oyente clasico lo espera; solo, no basta.
   *
   * Prototipo y Event salen de la VENTANA DEL INPUT, no de la de este
   * modulo: el elemento vive en el documento de la pagina y un setter
   * de otro reino no es el suyo.
   */
  function escribirEnRange(input, valor) {
    const ventana = input.ownerDocument && input.ownerDocument.defaultView;
    if (!ventana || !ventana.HTMLInputElement) return false;
    const descriptor = Object.getOwnPropertyDescriptor(
      ventana.HTMLInputElement.prototype,
      "value"
    );
    if (!descriptor || !descriptor.set) return false;
    descriptor.set.call(input, String(valor));
    input.dispatchEvent(new ventana.Event("input", { bubbles: true }));
    input.dispatchEvent(new ventana.Event("change", { bubbles: true }));
    return true;
  }

  /*
   * Los elementos sinteticos, el mismo truco que la caratula derivada de
   * YouTube normal: los lectores solo saben leer .src o .textContent de
   * UN elemento, y aqui lo que hay son 33 divs de letra o una URL. El
   * adaptador fabrica UN portador desconectado (nunca se inserta en el
   * DOM) y lo reutiliza porque los lectores consultan varias veces por
   * segundo.
   */
  let letrasSinteticas = null;
  let fuenteSintetica = null;

  const adapter = {
    schemaVersion: YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION,
    SELECTORS,

    getPlayerBar() {
      return queryFirst(SELECTORS.playerBar);
    },

    /*
     * ============ EL MEDIO QUE EXISTE POR MODOS ============
     * Ver la cabecera del archivo. En modo AUDIO el audio no vive en el
     * DOM y el unico <video> ocasional es el Canvas mudo de 7 s: los
     * metodos del prestamo contestan la verdad, nada. En modo VIDEO hay
     * un <video> real (medido: la pista entera, en video-player-npv),
     * pero viene CIFRADO (mediaKeys != null), y el prestamo se queda
     * igualmente en nada: adoptar un video con DRM en otro documento
     * rompe la sesion de claves y daria negro o parada.
     *
     * getMediaElement() es el UNICO que cambia por modo: es el medio de
     * CONTROL (saltos, volumen, silencio, velocidad, play/pause), y
     * escribir sobre un elemento cifrado si funciona — el DRM protege
     * los bytes, no las propiedades. Las tres puertas de Web Audio no
     * necesitan enterarse: espectro y grafo ya exigen !mediaKeys por su
     * cuenta (puedeMedirse, puedeEcualizarse), y esa guarda se midio
     * ANTES de darles un elemento que por fin la pone a prueba.
     */
    setBorrowedMedia() {
      // Nunca hay nada que prestar; se acepta la llamada y no se guarda
      // nada, porque getPageMediaElement jamas entrega un elemento.
    },

    getPageMediaElement() {
      return null;
    },

    getReplacementFor() {
      return null;
    },

    getMediaElement() {
      return queryFirst(SELECTORS.videoDeModoVideo);
    },

    /*
     * El bucle visual de la cancion (Canvas), para usarlo DE FONDO en la
     * ventana; null si la cancion no trae o el panel esta cerrado.
     *
     * Las guardas son las señas medidas del bucle, y cada una veta algo
     * concreto: loop y muted (el Canvas es un bucle silencioso; el video
     * de pista no es ninguna de las dos cosas), sin mediaKeys (el Canvas
     * se midio SIN DRM; con DRM captureStream daria cuadros negros y el
     * fondo seria una mentira), y nunca el elemento de getMediaElement()
     * (la pista no es el fondo de si misma, ni siquiera si algun dia
     * llegara con loop puesto).
     */
    getCanvasVideo() {
      const pista = queryFirst(SELECTORS.videoDeModoVideo);
      const candidatos = queryAll(SELECTORS.videosDelPanel);
      return (
        candidatos.find(
          (video) =>
            video !== pista &&
            video.loop === true &&
            video.muted === true &&
            !video.mediaKeys
        ) || null
      );
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

    /*
     * AQUI LA PAGINA ES LA UNICA VERDAD, el inverso exacto de YouTube
     * normal: alli el <video> sabia el tiempo y la barra mentia; aqui no
     * hay <video> y la barra inferior es lo unico que lo sabe.
     *
     * El transcurrido sale del TEXTO (avanza de 1 en 1 s, medido) y no
     * del value del <input>, que va cuantizado a saltos de 5000 ms
     * (medido: texto "0:19" con value=20000). La duracion sale del max
     * del <input>, que esta en milisegundos exactos (max=161983 para la
     * cancion de 2:41), con el texto de reserva.
     *
     * TrackTimeline con esto y sin media hace lo correcto: publica el
     * tiempo de la pagina tal cual, sin desplazamientos.
     */
    getPageTrackTime() {
      const elapsed = parsearTiempo(
        this.getTimeInfoElement() && this.getTimeInfoElement().textContent
      );
      if (elapsed === null) return null;

      let duration = null;
      const input = queryFirst(SELECTORS.progressInput);
      const maxMs = input && Number(input.max);
      if (Number.isFinite(maxMs) && maxMs > 0) {
        duration = maxMs / 1000;
      } else {
        const duracionTexto = queryFirst(SELECTORS.timeDuration);
        duration = parsearTiempo(duracionTexto && duracionTexto.textContent);
      }
      if (duration === null) return null;

      return { elapsed, duration };
    },

    /*
     * EL METODO 37, el que trajo esta tanda al contrato. En YTM y en
     * YouTube el <video> dice si suena; aqui lo dice el icono del boton
     * (ver ICONO_DE_*): si se ve el icono de pausa es que suena, si se
     * ve el de play es que esta pausado, y si el dibujo no se reconoce,
     * undefined.
     */
    isPagePlaying() {
      const boton = this.getPlayPauseButton();
      if (!boton) return undefined;
      const path = boton.querySelector("svg path");
      const dibujo = (path && path.getAttribute("d")) || "";
      if (dibujo.indexOf(ICONO_DE_PAUSA_PREFIJO) === 0) return true;
      if (dibujo.indexOf(ICONO_DE_PLAY_PREFIJO) === 0) return false;
      return undefined;
    },

    /*
     * ============ ESCRITURA EN LA PAGINA (metodos 40-42) ============
     * En modo audio no hay medio sobre el que escribir, pero los
     * deslizadores de la barra SI aceptan la escritura sintetica
     * (medido 2026-09-16: el salto de +5 s se OYO y el texto de
     * posicion lo siguio; el volumen subio de forma audible y el value
     * quedo donde la pagina lo cuantizo). Los dos escritores llamados
     * SIN numero son la sonda: contestan si hay donde escribir y no
     * tocan nada — es lo que consulta la ventana antes de destapar los
     * mandos, la misma pregunta en vivo que ya hace con el medio.
     */

    /*
     * El range de progreso habla en MILISEGUNDOS (max=161983 para la
     * cancion de 2:41, medido); el contrato habla en segundos, como
     * todo el resto del sistema. La conversion vive aqui, en el unico
     * modulo que sabe en que unidades esta el DOM de Spotify. AQUI NO
     * HAY COTA a proposito: la cota de pista ([0, duration]) es del
     * controlador, que es quien sabe de que pista viene el salto, y el
     * recorte final a [min, max] lo hace el propio range por spec
     * (sanitizacion de value, comprobada tambien en jsdom); una
     * tercera copia de la misma regla no vigilaria nada. OJO
     * CONFESADO: el step medido es 5000, asi que la pagina puede
     * asentar el salto en el multiplo de 5 s mas cercano.
     */
    seekPageTo(segundos) {
      const input = queryFirst(SELECTORS.progressInput);
      const maxMs = input && Number(input.max);
      if (!input || !Number.isFinite(maxMs) || maxMs <= 0) return false;
      if (typeof segundos !== "number" || !Number.isFinite(segundos)) return true; // sonda
      return escribirEnRange(input, segundos * 1000);
    },

    /*
     * El de volumen ya esta en 0..1 (min=0 max=1, medido): sin
     * conversion, y sin cota por lo mismo que arriba (el controlador
     * acota a [0, 1] y el range se recorta solo). La CUANTIZACION a
     * decimas (step=0.1) es de la pagina y no se imita aqui: se
     * escribe el valor pedido y Spotify asienta el suyo, que es lo que
     * luego leera getPageVolume().
     */
    setPageVolume(volumen) {
      const input = queryFirst(SELECTORS.volumeInput);
      if (!input) return false;
      if (typeof volumen !== "number" || !Number.isFinite(volumen)) return true; // sonda
      return escribirEnRange(input, volumen);
    },

    /*
     * El lector del trio: el deslizador de la ventana pinta
     * state.volume y sin medio ese numero tiene que salir de AQUI o es
     * un invento (el lector de metadatos inventaba 1 y el mando
     * marcaba 100% con la pagina al 40%). null = "no hay range", que
     * el lector traduce a su valor de siempre. Sin recorte a [0, 1]
     * por la misma razon que los escritores: el value de un range ya
     * viene saneado a [min, max] por spec (aqui min=0 max=1, medido),
     * y una copia de esa regla seria un mutante inmortal.
     */
    getPageVolume() {
      const input = queryFirst(SELECTORS.volumeInput);
      const valor = input && Number(input.value);
      return Number.isFinite(valor) ? valor : null;
    },

    /*
     * LETRAS: existen (33 lineas medidas) pero solo con la VISTA DE
     * LETRAS abierta —es una ruta (/lyrics), no un panel—. El boton
     * getLyricsTab() la abre y cierra, y lleva aria-pressed de verdad
     * (medido: "true" con la vista abierta), asi que el lector sabe
     * cuando esta abierta.
     */
    getLyricsTab() {
      return queryFirst(SELECTORS.lyricsTab);
    },

    /*
     * false SIEMPRE, y es una confesion: cuando la cancion no trae letra
     * Spotify lo dice en el aria-label del boton ("Parece que no tenemos
     * la letra..."), que viene TRADUCIDO, y no se midio ninguna señal
     * independiente del idioma. Antes que leer español, no se sabe:
     * el estado queda en "cargando" en vez de en "no disponible".
     */
    isLyricsTabDisabled() {
      return false;
    },

    getTabRenderer() {
      return null;
    },

    /*
     * Las 33 lineas viven en divs sueltos y el lector nativo espera UN
     * elemento con la letra entera separada por \n (asi la parte en
     * lineas). El portador sintetico las junta con \n; sin lineas a la
     * vista devuelve null, que el lector entiende como "aun no se sabe".
     */
    getLyricsTextElement() {
      const lineas = queryAll(SELECTORS.lyricsLines);
      if (!lineas.length) return null;
      const texto = lineas
        .map((linea) => (linea.textContent || "").trim())
        .join("\n")
        .trim();
      if (!texto) return null;
      if (!letrasSinteticas) letrasSinteticas = document.createElement("div");
      if (letrasSinteticas.textContent !== texto) letrasSinteticas.textContent = texto;
      return letrasSinteticas;
    },

    // El proveedor de la letra: Spotify no lo pinta en la vista, asi que
    // el portador dice el unico origen honesto que se conoce.
    getLyricsSourceElement() {
      if (!fuenteSintetica) {
        fuenteSintetica = document.createElement("span");
        fuenteSintetica.textContent = "Spotify";
      }
      return fuenteSintetica;
    },

    getLyricsMessageElement() {
      return null;
    },

    /*
     * EL METODO 38: que linea se esta CANTANDO, segun la propia pagina.
     *
     * Las lineas de Spotify no traen tiempos, asi que la sincronia por
     * currentTime es imposible. Lo que si hay (medido 2026-09-16, diez
     * fotos en veinte segundos) es una marca de la pagina: la linea que
     * suena lleva una clase que NINGUNA otra linea repite, y esa marca
     * se muda de linea al avanzar la cancion (indices 3 -> 8 en la
     * medicion). No hay ningun atributo estructural (solo dir, class y
     * data-testid) y las clases vienen MINIFICADAS: cazar un nombre
     * concreto moriria en el siguiente despliegue de Spotify. Por eso
     * aqui no se busca una clase, se CALCULA: se cuenta cuantas lineas
     * lleva cada clase y gana la linea que tenga una clase de recuento
     * uno.
     *
     * Si ninguna linea lleva una clase unica, o la llevan varias (un
     * DOM a medio mutar, un rediseño), undefined: "no se sabe" es mejor
     * que resaltar un verso al azar.
     */
    getActiveLyricsLineIndex() {
      const lineas = queryAll(SELECTORS.lyricsLines);
      if (!lineas.length) return undefined;

      const recuento = new Map();
      for (const linea of lineas) {
        for (const clase of linea.classList) {
          recuento.set(clase, (recuento.get(clase) || 0) + 1);
        }
      }

      let indice = -1;
      let marcadas = 0;
      lineas.forEach((linea, i) => {
        for (const clase of linea.classList) {
          if (recuento.get(clase) === 1) {
            marcadas += 1;
            indice = i;
            return;
          }
        }
      });
      if (marcadas !== 1) return undefined;

      /*
       * El indice se devuelve en el espacio de la LETRA EMITIDA, no en
       * el del DOM. Medido en vivo 2026-09-16 (segunda pasada): 68
       * lyrics-line en el DOM pero 65 lineas emitidas, porque el
       * portador sintetico de arriba une los textos y su trim() final
       * se come las vacias del frente y del final (las interiores, los
       * separadores de estrofa, se conservan). Devolver el indice del
       * DOM a secas desfasaba el resalte exactamente esas vacias del
       * frente (+2 en la medicion). Aqui se restan; si la marca cae en
       * una vacia del frente el indice mapeado seria negativo y el
       * adaptador se abstiene; si cae en la vacia del final, el indice
       * queda fuera de rango y lo caza la cota del lector.
       */
      let vaciasAlFrente = 0;
      while (
        vaciasAlFrente < lineas.length &&
        !(lineas[vaciasAlFrente].textContent || "").trim()
      ) {
        vaciasAlFrente += 1;
      }
      const emitido = indice - vaciasAlFrente;
      return emitido >= 0 ? emitido : undefined;
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

    // Spotify no tiene "no me gusta" en el reproductor (medido: ningun
    // boton con esa pinta en la barra). null es la verdad.
    getDislikeButton() {
      return null;
    },

    /*
     * Sin "no me gusta", el estado solo tiene dos posiciones honestas:
     * guardada (LIKE) o no (INDIFFERENT). DISLIKE aqui no existe, y
     * sin boton a la vista no se inventa: undefined.
     */
    getLikeStatus() {
      const guardada = this.isToggleActive(this.getLikeButton());
      if (guardada === undefined) return undefined;
      const { LIKE_STATUS } = YTMPip.CONSTANTS;
      return guardada ? LIKE_STATUS.LIKE : LIKE_STATUS.INDIFFERENT;
    },

    getRepeatButton() {
      return queryFirst(SELECTORS.repeatButton);
    },

    getShuffleButton() {
      return queryFirst(SELECTORS.shuffleButton);
    },

    /*
     * Spotify reparte el estado entre DOS atributos segun el boton
     * (medido): las letras llevan aria-pressed y me-gusta/repetir llevan
     * aria-checked. Se miran los dos, en ese orden. El aleatorio no
     * lleva NINGUNO (medido encendido y apagado: null los dos), asi que
     * para el la respuesta es undefined: boton clicable, estado ilegible.
     *
     * "mixed" cuenta como activo: es "repetir una", que es una forma de
     * estar puesto.
     */
    isToggleActive(button) {
      if (!button) return undefined;
      const pressed = button.getAttribute("aria-pressed");
      if (pressed === "true") return true;
      if (pressed === "false") return false;
      const checked = button.getAttribute("aria-checked");
      if (checked === "true" || checked === "mixed") return true;
      if (checked === "false") return false;
      return undefined;
    },

    /*
     * MEDIDO CON TRES CLICS DEL USUARIO sobre el boton real:
     *
     *   aria-checked="false"  aria-label "Activar repeticion"      -> NONE
     *   aria-checked="true"   aria-label "Repetir una cancion"     -> ALL
     *   aria-checked="mixed"  aria-label "Desactivar repeticion"   -> ONE
     *
     * (el aria-label describe el SIGUIENTE clic, no el estado; por eso
     * "Repetir una cancion" corresponde a ALL). aria-checked habla sin
     * idioma, igual que el repeat-mode de YTM, y se traduce al mismo
     * vocabulario NONE/ALL/ONE. Un valor desconocido es undefined.
     */
    getRepeatMode() {
      const boton = this.getRepeatButton();
      if (!boton) return undefined;
      const checked = boton.getAttribute("aria-checked");
      if (checked === "false") return "NONE";
      if (checked === "true") return "ALL";
      if (checked === "mixed") return "ONE";
      return undefined;
    },

    getQueueItems() {
      return queryAll(SELECTORS.queueItems);
    },

    /*
     * El titulo por su clase medida y, cuando la libreria encore cambie
     * de numero, por estructura: el primer span con texto que no este
     * dentro de un enlace ni de un boton y que no sea el envoltorio de
     * artistas (ese contiene <a>).
     */
    getQueueItemTitleElement(item) {
      if (!item) return null;
      const porClase = queryFirst(QUEUE_ITEM_SELECTORS.title, item);
      if (porClase) return porClase;
      const spans = item.querySelectorAll("span");
      for (const span of spans) {
        if (span.closest("a") || span.closest("button")) continue;
        if (span.querySelector("a")) continue;
        if ((span.textContent || "").trim()) return span;
      }
      return null;
    },

    /*
     * El envoltorio de los artistas es el PADRE del primer enlace de la
     * fila (medido: un span cuyo textContent ya es "Nico Hernandez,
     * Banda Los Recoditos" con las comas puestas). Estructural a
     * proposito: la clase del span es ofuscada y rotara.
     */
    getQueueItemBylineElement(item) {
      const enlace = item && item.querySelector("a");
      return enlace ? enlace.parentElement : null;
    },

    /*
     * "Seleccionada" es pertenecer al PRIMER <ul> del panel ("Estas
     * escuchando", medido con 1 fila): las filas no llevan selected ni
     * aria-current (medido: null en todas). Con esto readUpNext hace lo
     * de siempre: lo que viene DESPUES de la seleccionada, que aqui es
     * todo lo del segundo ul en adelante.
     */
    isQueueItemSelected(item) {
      if (!item || !item.closest) return false;
      const aside = item.closest("aside");
      if (!aside) return false;
      const primerUl = aside.querySelector("ul");
      return !!primerUl && item.closest("ul") === primerUl;
    },

    isValidPlayerBar(el) {
      return !!(el && el.getAttribute && el.getAttribute("data-testid") === "now-playing-bar");
    }
  };

  /*
   * Solo open.spotify.com: es el unico hostname del reproductor web.
   *
   * Las capacidades, con su evidencia:
   *   letras:    true   33 lyrics-line medidas; boton con aria-pressed
   *   cola:      true   panel con 2 ul medidos (1 sonando + 12 siguientes)
   *   repetir:   true   aria-checked false/true/mixed, medido a 3 clics
   *   aleatorio: true   el boton existe y se clica; su ESTADO es ilegible
   *                     (sin testid, sin aria-checked: medido en ambos estados)
   *   meGusta:   true   boton unico con aria-checked en la ficha
   *   medioEscribible: false  se lee como SIN GARANTIA, no como veto: en modo
   *                      audio getMediaElement() es null y los mandos de
   *                      escritura son mentira; en modo video existe (medido)
   *                      y la ventana lo comprueba en vivo antes de esconder
   *   videoPrestable: false  en modo audio no hay video que prestar (solo el
   *                      Canvas mudo de 7 s); en modo video lo hay pero con
   *                      DRM medido (mediaKeys != null): prestado daria negro
   *   audioGrafo: false  el audio no esta en el DOM (0 elementos con musica
   *                      sonando, medido dos veces): no hay de donde colgar
   *                      un grafo, y con DRM ademas saldria silencio
   */
  YTMPip.Adaptadores.registrar({
    id: "spotify",
    nombre: "Spotify",
    hostnames: ["open.spotify.com"],
    capacidades: {
      letras: true,
      cola: true,
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
