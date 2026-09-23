/*
 * Opcion A del documento (seccion 7): usar UNICAMENTE letras que YA ESTAN
 * en la pagina. No se consulta ninguna API externa, no se hace scraping de
 * terceros y no se almacena el texto. Lo unico que hacemos es leer lo que
 * el usuario ya tiene delante en music.youtube.com.
 *
 * Hay DOS fuentes posibles en esa pagina, y se miran en este orden:
 *
 *   1. Better Lyrics, si el usuario tiene esa extension instalada.
 *   2. El panel nativo de YouTube Music (LyricFind).
 *
 * El orden NO es arbitrario. Better Lyrics OCULTA el panel nativo (le pone
 * la clase `blyrics-hidden`) y planta el suyo encima. Con el orden inverso
 * nos quedabamos con lo que YTM dice del panel que ya nadie ve: si YTM no
 * tenia letra devolviamos UNAVAILABLE aunque Better Lyrics la estuviera
 * mostrando en pantalla en ese mismo momento. Ese era justo el sintoma
 * reportado: "no tengo letra y con Better Lyrics si la trae".
 *
 * Maquina de estados de la ruta nativa (el lector original colapsaba todo
 * en UNAVAILABLE):
 *
 *   pestaña de letras con `disabled`        -> UNAVAILABLE  (la cancion no tiene letra)
 *   ytmusic-message-renderer con texto      -> UNAVAILABLE  (YTM lo dice explicitamente)
 *   panel aun no abierto / sin renderizar   -> LOADING      (hay que abrirlo)
 *   .description con texto                  -> AVAILABLE
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});
  const { LYRICS_STATUS } = YTMPip.CONSTANTS;

  /*
   * `lines` es la letra partida en lineas, cada una con el segundo en que
   * empieza a cantarse (`time`) o null si no se sabe. El texto plano se
   * conserva ADEMAS de las lineas: es la firma con la que el resto del
   * sistema detecta que la letra cambio, y el formato que entienden el
   * popup y la ventana de respaldo, que no sincronizan nada.
   */
  /*
   * `activeLine` es el indice de la linea que la PAGINA dice que se esta
   * cantando, y solo viaja cuando el sitio lo sabe (hoy, Spotify: sus
   * lineas no traen tiempos y la unica sincronia posible es esta marca).
   * Number.isInteger y no un truthy: el indice 0 es una linea tan valida
   * como cualquier otra, y un truthy se la comeria.
   */
  function result(status, text, source, lines, activeLine) {
    return {
      status,
      text: text || undefined,
      source: source || "youtube-music",
      lines: lines && lines.length ? lines : undefined,
      activeLine: Number.isInteger(activeLine) ? activeLine : undefined
    };
  }

  // "Fuente: LyricFind" / "Source: LyricFind" -> "LyricFind"
  function parseSource(raw) {
    if (!raw) return "youtube-music";
    const clean = raw.trim();
    const match = clean.match(/(?:fuente|source)\s*:\s*(.+)$/i);
    return (match ? match[1] : clean).trim() || "youtube-music";
  }

  /*
   * Una linea de letra es UNA linea visual. Colapsa cualquier espacio,
   * salto o indentacion que venga del marcado.
   *
   * Solo vale para Better Lyrics y NO para la ruta nativa: alli las lineas
   * viven separadas por \n dentro de un mismo elemento, y aplastarlas
   * dejaria la cancion entera en un parrafo.
   */
  function unaLinea(texto) {
    return (texto || "").replace(/\s+/g, " ").trim();
  }

  /*
   * Lo que cuelga de una linea y NO es la letra: traduccion, romanizacion
   * y coros de fondo. textContent las concatenaria todas en un renglon
   * ilegible; es el mismo error que ya cometimos leyendo el `.footer` de
   * YouTube Music y que acababa con "Fuente: LyricFind" pegado a la letra.
   *
   * Van los dos nombres de los coros a proposito: `blyrics-background-lyric`
   * es el de la version publicada y `blyrics-background-line` el de la
   * reescritura que Better Lyrics aun no ha publicado.
   */
  const SUBLINEAS =
    ".blyrics--translated, .blyrics--romanized, .blyrics-background-lyric, .blyrics-background-line";

  /*
   * El texto de UNA linea de Better Lyrics.
   *
   * Hay que contemplar DOS maquetaciones porque Better Lyrics reescribio
   * la suya y la version nueva todavia no esta publicada:
   *
   *  - Publicada: una palabra por <span class="blyrics--word">, emitidos
   *    PEGADOS, sin un solo espacio entre ellos. El hueco lo pinta el CSS
   *    con `margin-right` sobre los que llevan `blyrics--has-trailing-space`.
   *    Por eso textContent devuelve "Walkingdownthestreettonight": no es
   *    que se pierdan los espacios, es que nunca estuvieron en el DOM.
   *  - Sin publicar: aparece `.blyrics-line-main` y los espacios SI son
   *    nodos de texto de verdad, asi que basta con colapsar.
   *
   * Se distinguen mirando si existe `.blyrics-line-main`, que es justo lo
   * que introduce la version nueva.
   */
  function betterLyricsLineText(line) {
    // Los interludios no traen texto, solo un icono SVG animado. Se marcan
    // para que no desaparezcan silenciosamente y se note la pausa.
    if (line.getAttribute("data-instrumental") === "true") return "♪";

    const main = line.querySelector(".blyrics-line-main");
    if (main) {
      const copia = main.cloneNode(true);
      /*
       * En la version nueva las palabras largas llevan dentro un
       * `.blyrics-word-highlight` que DUPLICA su propio texto para poder
       * animarlo. Sin quitarlo saldria "streetstreet".
       */
      copia.querySelectorAll(".blyrics-word-highlight").forEach((el) => el.remove());
      copia.querySelectorAll(SUBLINEAS).forEach((el) => el.remove());
      return unaLinea(copia.textContent);
    }

    const words = Array.from(line.querySelectorAll(".blyrics--word"));
    if (words.length) return unirPalabras(words);

    /*
     * Red de seguridad por si Better Lyrics vuelve a cambiar de
     * maquetacion: se cae al texto completo quitando antes las sublineas
     * conocidas, en vez de devolver vacio. Preferimos una linea aproximada
     * a perder la letra.
     */
    const copia = line.cloneNode(true);
    copia.querySelectorAll(SUBLINEAS).forEach((el) => el.remove());
    return unaLinea(copia.textContent);
  }

  /*
   * Reconstruye la linea a partir de las palabras sueltas.
   *
   * El espacio se pone SOLO donde Better Lyrics dice que lo hay
   * (`blyrics--has-trailing-space`), nunca entre todas las palabras. La
   * diferencia importa: una palabra muy larga la parte en varios <span>
   * seguidos que hay que volver a pegar SIN espacio, o "intentions"
   * saldria como "inten tions".
   */
  function unirPalabras(words) {
    let texto = "";
    for (const word of words) {
      // Los coros de fondo marcan la palabra y tambien su envoltorio.
      if (word.closest(".blyrics-background-lyric, .blyrics-background-line")) continue;
      texto += word.textContent || "";
      if (word.classList.contains("blyrics--has-trailing-space")) texto += " ";
    }
    return unaLinea(texto);
  }

  /**
   * Letras inyectadas por Better Lyrics, o null si no hay nada que leer.
   *
   * Devolver null (y no un UNAVAILABLE) es deliberado: significa "esta
   * fuente no sabe", no "no hay letra". Asi la ruta nativa sigue teniendo
   * su oportunidad.
   */
  function readBetterLyrics(Adapter) {
    const container = Adapter.getBetterLyricsContainer();
    if (!container) return null;

    // Better Lyrics dice explicitamente que tampoco la ha encontrado.
    if (container.getAttribute("data-no-lyrics") === "true") return null;

    const lines = Adapter.getBetterLyricsLines(container);
    if (!lines.length) return null;

    /*
     * Cada linea sale con SU tiempo de inicio, leido del `data-time` que
     * la propia Better Lyrics usa para su animacion. Es lo que permite a
     * la ventana flotante resaltar la linea que suena y saltar a ella con
     * un clic; sin tiempos la letra solo puede ser un bloque estatico.
     *
     * parseFloat y no Number: el atributo podria traer unidades o basura
     * al final. Si no es un numero finito se guarda null ("no se cuando
     * empieza"), nunca 0, que significaria "empieza al principio".
     */
    const lineas = lines
      .map((line) => {
        const t = parseFloat(line.getAttribute("data-time"));
        return { text: betterLyricsLineText(line), time: Number.isFinite(t) ? t : null };
      })
      .filter((linea) => linea.text);

    const text = lineas.map((linea) => linea.text).join("\n").trim();
    if (!text) return null;

    // El pie lleva el proveedor real (LRCLIB, Musixmatch...). Si no se
    // puede leer, al menos se dice de donde ha salido.
    const provider = Adapter.getBetterLyricsSourceName
      ? Adapter.getBetterLyricsSourceName()
      : "";
    return result(
      LYRICS_STATUS.AVAILABLE,
      text,
      provider ? provider + " (Better Lyrics)" : "Better Lyrics",
      lineas
    );
  }

  YTMPip.LyricsReader = {
    read() {
      const Adapter = YTMPip.Adapter;

      // 0. Better Lyrics primero: si esta activa, es lo que el usuario ve.
      const better = readBetterLyrics(Adapter);
      if (better) return better;

      // 1. La señal mas barata y temprana: la pestaña esta deshabilitada.
      if (Adapter.isLyricsTabDisabled()) {
        return result(LYRICS_STATUS.UNAVAILABLE);
      }

      // 2. YouTube Music afirma explicitamente que no hay letra.
      const message = Adapter.getLyricsMessageElement();
      if (message && (message.textContent || "").trim()) {
        return result(LYRICS_STATUS.UNAVAILABLE);
      }

      // 3. Texto presente -> disponible.
      const textEl = Adapter.getLyricsTextElement();
      const text = textEl ? (textEl.textContent || "").trim() : "";
      if (text) {
        const sourceEl = Adapter.getLyricsSourceElement();
        /*
         * La letra nativa (LyricFind) no trae tiempos: sus lineas van con
         * time null, que rio abajo significa "no se puede sincronizar ni
         * saltar a esta linea". Las lineas en blanco se CONSERVAN: son los
         * separadores de estrofa, y ademas garantizan la invariante de que
         * unir las lineas con \n reconstruye el texto exacto.
         */
        const lineas = text.split("\n").map((linea) => ({ text: linea, time: null }));
        /*
         * Solo la ruta nativa pregunta por la linea activa: Better Lyrics
         * ya sincroniza por tiempos y no necesita la marca. La cota
         * (activa < lineas.length) protege de un desfase entre las dos
         * lecturas del DOM: el texto se parte con trim() y un indice de
         * la pagina podria señalar una linea que aqui ya no existe.
         */
        const activa = Adapter.getActiveLyricsLineIndex();
        return result(
          LYRICS_STATUS.AVAILABLE,
          text,
          parseSource(sourceEl && sourceEl.textContent),
          lineas,
          Number.isInteger(activa) && activa >= 0 && activa < lineas.length ? activa : undefined
        );
      }

      // 4. Ni texto ni mensaje de error: el panel todavia no se ha
      // renderizado. No es "no disponible", es "aun no lo sabemos".
      return result(LYRICS_STATUS.LOADING);
    },

    /**
     * Indica si la pestaña de letras existe en la pagina. Sigue siendo
     * util como puerta de entrada, pero ya no decide el estado: una
     * pestaña presente y deshabilitada significa "sin letra".
     */
    isTabPresent() {
      return !!YTMPip.Adapter.getLyricsTab();
    },

    /*
     * El panel solo se puebla cuando la pestaña esta seleccionada.
     * Tres señales porque cada sitio marca "abierto" a su manera:
     * aria-selected e iron-selected son de YouTube Music (pestañas
     * Polymer); aria-pressed es de Spotify (medido: el boton de letras
     * lleva aria-pressed="true" y data-active="true" con la vista
     * /lyrics abierta, y es un boton, no una pestaña).
     */
    isPanelOpen() {
      const tab = YTMPip.Adapter.getLyricsTab();
      if (!tab) return false;
      return (
        tab.getAttribute("aria-selected") === "true" ||
        tab.getAttribute("aria-pressed") === "true" ||
        tab.classList.contains("iron-selected")
      );
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
