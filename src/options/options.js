(function () {
  const {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    SPECTRUM_LIMITS,
    EQUALIZER_BANDS,
    EQUALIZER_PRESETS,
    EQUALIZER_PRESET_LABELS,
    EQUALIZER_LIMITS,
    PIP_DIMENSIONS
  } = self.YTMPip.CONSTANTS;
  const { partirBarras, unirBarras, partirColor, unirColor, clavesEcualizador, normalizarColorDeHalo } =
    self.YTMPip.Settings;
  const { colorDePaleta } = self.YTMPip.Paleta;
  const Ecualizador = self.YTMPip.Ecualizador;

  /*
   * Los textos en el idioma del navegador. El atajo con respaldo es el
   * mismo que en pip.js: si textos.js no cargo, la clave pelada —un fallo
   * que se ve— antes que una pagina muda.
   */
  const t = (clave, subs) => (self.YTMPip.Textos ? self.YTMPip.Textos.t(clave, subs) : clave);

  /*
   * Los textos ESCRITOS en options.html se reescriben en su idioma antes
   * de tocar nada mas. Si una clave no resuelve, el nodo conserva el
   * español del HTML, que es el plan B a proposito.
   */
  if (self.YTMPip.Textos) self.YTMPip.Textos.aplicar(document);

  /*
   * El valor del desplegable que NO es un preset.
   *
   * Empieza por dos guiones bajos para que no pueda chocar nunca con un
   * nombre de EQUALIZER_PRESETS: el dia que alguien añada un preset
   * llamado "manual", esto seguiria significando otra cosa.
   */
  const MANUAL = "__manual";

  /*
   * El ecualizador TAL Y COMO ESTA GUARDADO, no como esta el formulario.
   *
   * Esta pagina no tiene interruptor —tiene una lista con "Apagado" dentro—,
   * asi que esto no se enseña en ningun sitio. Se mantiene porque ELEGIR
   * "APAGADO" AQUI ES APAGAR, y apagar tiene que dejar anotado a donde
   * volver igual que si se hubiera apagado desde la ventana flotante. Si no,
   * quien ajusta sus cinco numeros aqui, los apaga aqui y luego pulsa el
   * boton de la ventana, se encuentra "graves".
   *
   * Y hace falta la pareja entera, no solo la anotacion, porque al apagar lo
   * que se anota es LO QUE SONABA (ver `clavesEcualizador`).
   *
   * Es una variable y no una lectura del formulario porque al apagar los
   * deslizadores se van a cero (`pintarEcualizador` con "off" da cinco
   * ceros): en el momento de guardar, la pagina ya no sabe que habia antes.
   *
   * Se siembra al cargar y se pone al dia en cada guardado con lo que
   * `clavesEcualizador` haya decidido, que es quien manda. Leerla de
   * `Settings.get()` habria sido depender de una cache que se refresca por
   * storage.onChanged, o sea con retraso: dos cambios seguidos y el segundo
   * usa el estado del primero sin actualizar.
   */
  let ecualizadorGuardado = null;

  const fields = {
    seekSeconds: document.getElementById("seekSeconds"),
    theme: document.getElementById("theme"),
    pipSize: document.getElementById("pipSize"),
    defaultSection: document.getElementById("defaultSection"),
    lyricsPreference: document.getElementById("lyricsPreference"),
    videoPreference: document.getElementById("videoPreference"),
    // El fondo Canvas de Spotify. Hasta ahora solo se alternaba con el
    // boton 🌌 de la ventana; la clave y su saneado ya existian
    // (settings.js), esta pagina solo le pone cara al ajuste guardado.
    canvasPreference: document.getElementById("canvasPreference"),
    // El halo de luz: UN desplegable de tres que en storage son DOS claves
    // (el porque vive en constants.js y en el comentario del HTML).
    halo: document.getElementById("halo"),
    // El color del halo: dos respuestas (tema / mio) y un cuentagotas.
    // A diferencia del desplegable de arriba, SIEMPRE se guarda: el color
    // es "a que volver al encender", como el modo.
    haloColorMode: document.getElementById("haloColorMode"),
    haloColor: document.getElementById("haloColor"),
    spectrumBarsMode: document.getElementById("spectrumBarsMode"),
    spectrumBarsCount: document.getElementById("spectrumBarsCount"),
    spectrumFall: document.getElementById("spectrumFall"),
    spectrumHeight: document.getElementById("spectrumHeight"),
    spectrumColorMode: document.getElementById("spectrumColorMode"),
    spectrumColor: document.getElementById("spectrumColor"),
    spectrumPaletteCount: document.getElementById("spectrumPaletteCount"),
    equalizerPreset: document.getElementById("equalizerPreset"),
    pipTransparency: document.getElementById("pipTransparency")
  };
  const status = document.getElementById("status");
  const equalizerBox = document.getElementById("equalizerBands");
  const equalizerPreamp = document.getElementById("equalizerPreamp");
  const barsCountLabel = document.getElementById("spectrumBarsCountLabel");
  const colorLabel = document.getElementById("spectrumColorLabel");
  const haloColorLabel = document.getElementById("haloColorLabel");
  const haloSourceHint = document.getElementById("haloSourceHint");
  const accentHint = document.getElementById("spectrumAccentHint");
  const sourceHint = document.getElementById("spectrumSourceHint");
  const accentSwatch = document.getElementById("spectrumAccentSwatch");
  const paletteBox = document.getElementById("spectrumPaletteBox");
  const palettePreview = document.getElementById("spectrumPalettePreview");

  /*
   * Los cuentagotas de la paleta estan ESCRITOS en options.html, no creados
   * aqui con createElement. Esto los recoge en el orden en que se van a
   * leer, y de paso comprueba que la pagina y las constantes cuenten lo
   * mismo: si PALETTE_MAX sube y nadie añade el input, la paleta se
   * quedaria corta en silencio.
   */
  const paletteInputs = [];
  for (let i = 0; ; i++) {
    const input = document.getElementById("spectrumPalette" + i);
    if (!input) break;
    paletteInputs.push(input);
  }
  if (paletteInputs.length !== SPECTRUM_LIMITS.PALETTE_MAX) {
    console.warn(
      "[YTMPip] options.html tiene " +
        paletteInputs.length +
        " cuentagotas de paleta y PALETTE_MAX vale " +
        SPECTRUM_LIMITS.PALETTE_MAX +
        ". Sobra o falta uno en src/options/options.html."
    );
  }
  // Y el desplegable del "cuantos" tiene los mismos dos extremos escritos a
  // mano, con el mismo riesgo de quedarse atras.
  {
    const opciones = [...fields.spectrumPaletteCount.options].map((o) => Number(o.value));
    const min = Math.min(...opciones);
    const max = Math.max(...opciones);
    if (min !== SPECTRUM_LIMITS.PALETTE_MIN || max !== SPECTRUM_LIMITS.PALETTE_MAX) {
      console.warn(
        "[YTMPip] el desplegable «cuantos colores» va de " +
          min +
          " a " +
          max +
          " y las constantes dicen de " +
          SPECTRUM_LIMITS.PALETTE_MIN +
          " a " +
          SPECTRUM_LIMITS.PALETTE_MAX +
          "."
      );
    }
  }

  /* ---------- Los deslizadores del ecualizador ----------
   *
   * Mismo patron que los cuentagotas de la paleta y por el mismo motivo:
   * escritos en el HTML, recogidos aqui, y comprobados contra las
   * constantes. Un deslizador que falte no da ningun error: la banda
   * simplemente no se puede tocar nunca.
   *
   * Lo que NO se copia del HTML son los numeros. El rango, el paso, la
   * frecuencia y el nombre de cada banda salen de shared/constants.js, que
   * es donde estan definidos. Escritos tambien en el HTML, cambiar el techo
   * de +12 dB alli dejaria esta pagina ofreciendo un rango que el nucleo
   * acota luego en silencio.
   */
  const bandInputs = [];
  for (let i = 0; ; i++) {
    const input = document.getElementById("equalizerBand" + i);
    if (!input) break;
    bandInputs.push({
      input,
      label: document.getElementById("equalizerBand" + i + "Label"),
      salida: document.getElementById("equalizerBand" + i + "Value")
    });
  }
  if (bandInputs.length !== EQUALIZER_BANDS.length) {
    console.warn(
      "[YTMPip] options.html tiene " +
        bandInputs.length +
        " deslizadores de ecualizador y EQUALIZER_BANDS define " +
        EQUALIZER_BANDS.length +
        ". Sobra o falta uno en src/options/options.html."
    );
  }
  bandInputs.forEach((banda, i) => {
    const definicion = EQUALIZER_BANDS[i];
    banda.input.min = String(EQUALIZER_LIMITS.GAIN_MIN);
    banda.input.max = String(EQUALIZER_LIMITS.GAIN_MAX);
    banda.input.step = String(EQUALIZER_LIMITS.GAIN_STEP);
    if (!definicion) return;
    // "Graves · 60 Hz". La frecuencia se enseña porque es lo unico que
    // distingue "Cuerpo" de "Medios" para quien no sabe a que suena cada
    // palabra, y a 250 Hz frente a 1 kHz eso si se puede comprobar de oido.
    //
    // El nombre sale del catalogo (banda_<id>), con la etiqueta de
    // constants.js de respaldo: mismo par catalogo+constante que usa
    // pip.js para nombrar estas bandas, para que las dos paginas digan
    // la misma palabra en el mismo idioma.
    const hz = definicion.hz >= 1000 ? definicion.hz / 1000 + " kHz" : definicion.hz + " Hz";
    const claveBanda = "banda_" + definicion.id;
    const nombreBanda = t(claveBanda);
    const texto = (nombreBanda === claveBanda ? definicion.etiqueta : nombreBanda) + " · " + hz;
    if (banda.label) banda.label.textContent = texto;
    banda.input.setAttribute("aria-label", texto);
  });

  /*
   * El desplegable tiene los `value` escritos a mano, con el mismo riesgo de
   * quedarse atras que el "cuantos colores" de abajo. Se comprueba en los dos
   * sentidos: un preset sin opcion no se puede elegir nunca, y una opcion sin
   * preset se guardaria y `normalizar` la tiraria al valor por defecto sin
   * decir nada.
   *
   * El TEXTO, en cambio, se escribe desde aqui: vive en
   * EQUALIZER_PRESET_LABELS para que la ventana flotante pueda nombrar el
   * ajuste puesto sin copiarselo a esta pagina. Ver el comentario de esa
   * constante.
   */
  {
    const enLaPagina = [...fields.equalizerPreset.options]
      .map((o) => o.value)
      .filter((v) => v !== Ecualizador.APAGADO && v !== MANUAL);
    const enConstantes = Object.keys(EQUALIZER_PRESETS);
    const faltan = enConstantes.filter((n) => enLaPagina.indexOf(n) === -1);
    const sobran = enLaPagina.filter((n) => enConstantes.indexOf(n) === -1);
    if (faltan.length || sobran.length) {
      console.warn(
        "[YTMPip] el desplegable del ecualizador no cuadra con EQUALIZER_PRESETS." +
          (faltan.length ? " Faltan en options.html: " + faltan.join(", ") + "." : "") +
          (sobran.length ? " Sobran en options.html: " + sobran.join(", ") + "." : "")
      );
    }

    /*
     * Y el nombre de cada uno. Un preset sin etiqueta dejaria una opcion en
     * BLANCO —elegible, guardable y muda—, que es peor que no ofrecerla: el
     * desplegable se abriria con un hueco. Por eso se avisa y ademas se
     * rellena con el `value`, que es feo pero se lee.
     */
    const sinNombre = [];
    for (const opcion of fields.equalizerPreset.options) {
      if (opcion.value === Ecualizador.APAGADO || opcion.value === MANUAL) continue;
      const etiqueta = EQUALIZER_PRESET_LABELS[opcion.value];
      if (!etiqueta) sinNombre.push(opcion.value);
      // El catalogo (preset_<clave>) por delante y la constante de
      // respaldo, igual que las bandas: la ventana flotante nombra estos
      // mismos ajustes y las dos tienen que decir la misma palabra.
      const clavePreset = "preset_" + opcion.value;
      const traducido = t(clavePreset);
      opcion.textContent = traducido !== clavePreset ? traducido : etiqueta || opcion.value;
    }
    if (sinNombre.length) {
      console.warn(
        "[YTMPip] estos presets no tienen nombre en EQUALIZER_PRESET_LABELS y " +
          "se enseñan con su clave: " +
          sinNombre.join(", ") +
          "."
      );
    }
  }

  /** Los decibelios de cada deslizador, de graves a agudos. */
  function gananciasElegidas() {
    return bandInputs.map((banda) => Number(banda.input.value) || 0);
  }

  /**
   * Lo que hay que guardar segun como estan los mandos: `"off"`, el nombre
   * de un preset, o los cinco numeros.
   *
   * El desplegable manda sobre los deslizadores y no al reves. Es la unica
   * respuesta que no se contradice: elegir "Voz" tiene que sonar a voz
   * aunque los deslizadores se hayan quedado enseñando otra cosa un
   * instante, y quien mueve un deslizador ya pasa por `MANUAL` antes de
   * llegar aqui.
   */
  function valorDelEcualizador() {
    const elegido = fields.equalizerPreset.value;
    if (elegido === Ecualizador.APAGADO) return Ecualizador.APAGADO;
    if (elegido === MANUAL) return gananciasElegidas().join(",");
    return elegido;
  }

  /**
   * Deja los deslizadores y el aviso de preamplificacion contando lo mismo
   * que el desplegable.
   *
   * `Ecualizador.ganancias` contesta por los tres casos —apagado, preset y
   * numeros sueltos— y por eso no hay ningun `if` de modo aqui. Apagado da
   * cinco ceros, que es lo correcto para unos mandos que ademas se van a
   * esconder.
   */
  function pintarEcualizador() {
    const valor = valorDelEcualizador();
    const db = Ecualizador.ganancias(valor);
    bandInputs.forEach((banda, i) => {
      banda.input.value = String(db[i] ?? 0);
      if (banda.salida) banda.salida.textContent = (db[i] > 0 ? "+" : "") + (db[i] ?? 0) + " dB";
    });

    // Con el ecualizador apagado los mandos se ESCONDEN en vez de quedarse
    // apagados: moverlos sin querer cruzaria la puerta de un solo sentido
    // en la maquina de alguien que solo estaba mirando.
    equalizerBox.hidden = valor === Ecualizador.APAGADO;

    /*
     * TRES MENSAJES, y los tres han tenido que cambiar dos veces. Vale la
     * pena dejar escrito por que, porque el patron se repite: las dos veces
     * el texto describia el ecualizador que se habia programado y no el que
     * sonaba, y las dos veces lo pillo el usuario oyendo.
     *
     *   1. El primero decia que es normal que el volumen general quede mas
     *      bajo «porque lo que se oye es la diferencia entre bandas».
     *      Justificaba un fallo en vez de delatarlo: la banda mas alta
     *      acababa SIEMPRE en −3 dB y el ecualizador no podia subir nada.
     *
     *   2. El segundo decia que la entrada no se toca porque «de los picos se
     *      encarga un limitador, que solo actua cuando hace falta, asi que
     *      subir una banda se oye como una subida de verdad». Medido sobre
     *      musica real (tools/diagnostico-limitador.js), el limitador actuaba
     *      el 100 % del tiempo y la subida era de 0,7 dB. Las dos mitades de
     *      la frase eran falsas.
     *
     * El de ahora no promete volumen, porque no lo hay que prometer: sobre
     * material que ya viene al tope, anadir graves es forzosamente quitar el
     * resto. Dice el precio con su numero y manda a quien quiera volumen al
     * unico sitio donde esta, que es el control del sistema.
     *
     * Y HAN CAMBIADO UNA TERCERA VEZ, esta sin que nada sonara mal: hablaban
     * de «la entrada», que es como se llama esto por dentro y no algo que
     * exista para quien lee la pagina. Lo dijo el usuario de las otras dos
     * veces: «la descripcion la dejaste como para verla yo, que soy el
     * editor». Lo que se cuenta es lo mismo; lo que cambia es que ahora se
     * cuenta con palabras de quien esta oyendo musica.
     */
    if (!equalizerPreamp) return;
    const preamp = Ecualizador.preamplificacion(valor);
    const haySubida = Ecualizador.subidaDelPico(Ecualizador.ganancias(valor)) > 0;
    if (preamp !== 0) {
      equalizerPreamp.textContent = t("preamp_baja", [Math.abs(preamp)]);
    } else if (haySubida) {
      /*
       * HOY NO SE LLEGA AQUI, y esta escrito a proposito. Con el umbral del
       * limitador en cero su margen es cero, asi que cualquier banda subida
       * cobra preamplificacion y este caso no existe. Vuelve solo si alguien
       * baja UMBRAL_DB, o sea si le vuelve a fiar trabajo al limitador; la
       * prueba que lo cubre hace justo eso.
       */
      equalizerPreamp.textContent = t("preamp_cabe");
    } else {
      equalizerPreamp.textContent = t("preamp_nada");
    }
  }

  /* ---------- De que color es "el del tema" ----------
   *
   * La opcion «El del tema» era la que menos se entendia, y con razon: era
   * una etiqueta ciega. Con «Uno mio» el color se ve en el cuentagotas;
   * con esta habia que elegirla, guardar y abrir la ventana flotante para
   * averiguar de que estabamos hablando.
   *
   * DE DONDE SALE EL COLOR, que es la parte delicada. El acento NO es el
   * mismo en los dos temas (#ff0000 en oscuro, #d32f2f en claro) y vive en
   * src/pip/pip.css, que es su fuente de la verdad; el COLOR_SUGGESTED de
   * constants.js dice de si mismo, en su propio comentario, que no lo es
   * —es solo por donde empieza el cuentagotas del modo "uno mio"—.
   *
   * Copiar aqui los dos hexadecimales habria sido la trampa de siempre: una
   * muestra que enseña un color y una ventana que pinta otro es peor que no
   * enseñar nada, porque la primera version SI coincidiria y el dia que
   * alguien retoque el CSS nadie se enteraria.
   *
   * Asi que se lee el CSS de verdad. Se busca POR SELECTOR y no por orden
   * de aparicion: mover el bloque del tema claro dentro del archivo no debe
   * intercambiar los colores de la muestra.
   */
  const ACENTO_VAR = "--ytmpip-accent";
  const SELECTOR_POR_TEMA = {
    dark: ":root",
    light: "html.ytmpip-theme-light"
  };
  let acentos = null;

  function leerAcentosDelCss() {
    return fetch(chrome.runtime.getURL("src/pip/pip.css"))
      .then((r) => r.text())
      .then((texto) => {
        const hoja = new CSSStyleSheet();
        hoja.replaceSync(texto);
        const encontrados = {};
        for (const regla of hoja.cssRules) {
          if (!regla.style || !regla.selectorText) continue;
          const valor = regla.style.getPropertyValue(ACENTO_VAR).trim();
          if (!valor) continue;
          for (const tema of Object.keys(SELECTOR_POR_TEMA)) {
            if (regla.selectorText === SELECTOR_POR_TEMA[tema]) encontrados[tema] = valor;
          }
        }
        // Que falte uno significa que el CSS cambio de selector o de
        // variable. Se avisa en vez de callar: la muestra seguira pintando
        // algo, y sin el aviso ese algo pasaria por bueno.
        for (const tema of Object.keys(SELECTOR_POR_TEMA)) {
          if (!encontrados[tema]) {
            console.warn(
              "[YTMPip] no se encontro " +
                ACENTO_VAR +
                " para el tema '" +
                tema +
                "' en src/pip/pip.css (selector esperado: " +
                SELECTOR_POR_TEMA[tema] +
                ")."
            );
          }
        }
        acentos = encontrados;
      })
      .catch((error) => {
        console.warn("[YTMPip] no se pudo leer src/pip/pip.css para la muestra del acento:", error);
        acentos = {};
      })
      .then(pintarMuestraAcento);
  }

  function pintarMuestraAcento() {
    if (!accentSwatch) return;
    const delTema = acentos ? acentos[fields.theme.value] : null;
    accentSwatch.style.background = delTema || SPECTRUM_LIMITS.COLOR_SUGGESTED;
  }

  /* ---------- La vista previa de la paleta ---------- */

  /** Los colores destapados ahora mismo, de la primera barra a la ultima. */
  function coloresElegidos() {
    const cuantos = Number(fields.spectrumPaletteCount.value) || SPECTRUM_LIMITS.PALETTE_MIN;
    return paletteInputs.slice(0, cuantos).map((input) => input.value);
  }

  /*
   * El degradado de verdad, pintado con la MISMA funcion que pinta las
   * barras de la ventana flotante. Un `linear-gradient` de CSS habria sido
   * una linea de codigo, pero CSS interpola en otro espacio de color y el
   * resultado no es el de colorDePaleta: la vista previa mentiria justo en
   * lo que se esta eligiendo.
   *
   * Se pinta una columna de UN pixel por cada pixel de ancho —y no ocho o
   * cuarenta barras— porque aqui no se esta contestando cuantas barras
   * habra, que es otra pregunta y tiene su propio campo mas arriba. Lo que
   * se enseña es por que colores pasa el degradado, y para eso cuantas mas
   * muestras, mejor.
   */
  function pintarVistaPrevia() {
    if (!palettePreview || !palettePreview.getContext) return;
    const contexto = palettePreview.getContext("2d");
    if (!contexto) return;
    /*
     * El canvas se estira al ancho de la caja con CSS, asi que el mapa de
     * bits se pone del tamaño al que se va a ver. Sin esto se pintarian
     * 240 columnas y el navegador las estiraria hasta unas 360: un
     * degradado estirado no se nota mucho, pero la vista previa dejaria de
     * ser exactamente lo que colorDePaleta devuelve, que es su unico
     * motivo de existir.
     *
     * El `width` del HTML queda de reserva para cuando clientWidth es 0,
     * que es lo que vale un elemento aun sin maquetar.
     */
    const medido = Math.round(palettePreview.clientWidth);
    const ancho = medido > 0 ? medido : palettePreview.width;
    if (palettePreview.width !== ancho) palettePreview.width = ancho;
    const alto = palettePreview.height;
    const colores = coloresElegidos();
    contexto.clearRect(0, 0, ancho, alto);
    for (let x = 0; x < ancho; x++) {
      contexto.fillStyle = colorDePaleta(colores, x, ancho);
      contexto.fillRect(x, 0, 1, alto);
    }
  }

  // La casilla del numero y los cuentagotas solo tienen sentido cuando el
  // desplegable de al lado los pide. Se llama al cargar y en cada cambio.
  function mostrarCamposDependientes() {
    const barrasFijas = fields.spectrumBarsMode.value === "fixed";
    fields.spectrumBarsCount.hidden = !barrasFijas;
    barsCountLabel.hidden = !barrasFijas;

    const modo = fields.spectrumColorMode.value;

    const colorPropio = modo === "custom";
    fields.spectrumColor.hidden = !colorPropio;
    colorLabel.hidden = !colorPropio;

    // El cuentagotas del halo, con la misma regla que el del espectro:
    // solo cuando el desplegable de al lado dice "un color mio".
    const haloPropio = fields.haloColorMode.value === "custom";
    fields.haloColor.hidden = !haloPropio;
    haloColorLabel.hidden = !haloPropio;
    // Y el aviso del modo fuente del halo, hermano del sourceHint de mas
    // abajo y por el mismo motivo: es el unico modo que a veces no da color.
    haloSourceHint.hidden = fields.haloColorMode.value !== "source";

    accentHint.hidden = modo !== "accent";
    /*
     * «Del video o la carátula» no abre ningun campo —no hay nada que
     * elegir— pero si necesita explicarse, porque es el unico modo que a
     * veces no da color. Sin este aviso, una portada en blanco y negro se lee
     * como que la opcion no funciona.
     */
    sourceHint.hidden = modo !== "source";

    const conPaleta = modo === "palette";
    paletteBox.hidden = !conPaleta;
    if (conPaleta) {
      // Los cuentagotas que sobran se ocultan, no se borran: volver de 5 a
      // 3 y otra vez a 5 tiene que devolver los mismos colores, no dos
      // negros. Lo que no se ve sigue ahi con su valor.
      const cuantos = Number(fields.spectrumPaletteCount.value) || SPECTRUM_LIMITS.PALETTE_MIN;
      paletteInputs.forEach((input, i) => (input.hidden = i >= cuantos));
      pintarVistaPrevia();
    }

    // La piel repintada al final, cuando los selects ya dicen la verdad:
    // esta funcion corre al cargar y tras cada guardado, que son exactamente
    // los dos momentos en que un select puede haber cambiado sin que las
    // pildoras se enteren (load() escribe values a mano, y save() puede
    // acotar numeros). Un tercer sitio queda fuera: mover una banda del
    // ecualizador tambien escribe un value a mano, y alli se repinta en su
    // propio listener porque no pasa por aqui.
    sincronizarPildoras();
    pintarDeslizadores();
  }

  /* ---------- Las pildoras ----------
   *
   * La piel de los desplegables desde el segundo rediseño. Cada grupo
   * declara en data-para el id de su <select>; los botones escriben el
   * value y disparan change, y el guardado sigue siendo cosa del select:
   * las pildoras no guardan, EMPUJAN. Quitar el select habria obligado a
   * reescribir save/load y sus pruebas por un cambio de piel.
   *
   * El estado visible es aria-pressed y no una clase, para que lo que se ve
   * y lo que oye un lector de pantalla sean el mismo atributo.
   */
  const gruposDePildoras = [];
  for (const grupo of document.querySelectorAll(".ytmpip-pildoras[data-para]")) {
    const select = document.getElementById(grupo.dataset.para);
    const botones = [...grupo.querySelectorAll("button[data-valor]")];
    if (!select) {
      console.warn(
        "[YTMPip] el grupo de pildoras data-para=\"" +
          grupo.dataset.para +
          "\" no tiene <select> con ese id en options.html."
      );
      continue;
    }
    /*
     * El censo, como el de la paleta y el de las bandas: pildoras y
     * opciones tienen que contar lo mismo Y EN EL MISMO ORDEN. Una pildora
     * de menos seria una respuesta que existe pero no se puede elegir, y
     * una de mas guardaria un valor que el saneador tiraria en silencio.
     */
    const valoresDeOpciones = [...select.options].map((o) => o.value).join("|");
    const valoresDePildoras = botones.map((b) => b.dataset.valor).join("|");
    if (valoresDeOpciones !== valoresDePildoras) {
      console.warn(
        "[YTMPip] las pildoras de #" +
          select.id +
          " (" +
          valoresDePildoras +
          ") no cuadran con sus opciones (" +
          valoresDeOpciones +
          ") en options.html."
      );
    }
    for (const boton of botones) {
      /*
       * Las pildoras que nacen VACIAS (los cuatro presets del ecualizador)
       * copian el texto de su opcion, que a estas alturas ya lo escribio el
       * bloque de EQUALIZER_PRESET_LABELS pasando por el catalogo. Copiar
       * DESDE la opcion y no desde la constante es a proposito: el nombre
       * sigue teniendo una sola escritura, y estas lineas ni se enteran de
       * que existe un ecualizador.
       */
      if (!boton.textContent.trim()) {
        const opcion = [...select.options].find((o) => o.value === boton.dataset.valor);
        if (opcion) boton.textContent = opcion.textContent;
      }
      boton.addEventListener("click", () => {
        // Repetir el clic sobre la elegida no debe guardar otra vez: un
        // change sintetico con el mismo valor seria una escritura en
        // storage que no cambia nada y un "Guardado" mentiroso.
        if (select.value === boton.dataset.valor) return;
        select.value = boton.dataset.valor;
        /*
         * Repintar ANTES de disparar change: el guardado de verdad confirma
         * por su callback, pero en Chrome ese callback es asincrono y la
         * pildora debe encenderse con el dedo encima, no un instante
         * despues.
         */
        sincronizarPildoras();
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    gruposDePildoras.push({ select, botones });
  }

  /** Enciende en cada grupo la pildora que dice lo mismo que su select. */
  function sincronizarPildoras() {
    for (const { select, botones } of gruposDePildoras) {
      for (const boton of botones) {
        boton.setAttribute("aria-pressed", String(select.value === boton.dataset.valor));
      }
    }
  }

  /* ---------- Los deslizadores con marcas ----------
   *
   * Los numericos del segundo rediseño: el input[type=range] es el campo de
   * siempre (mismo id, mismo change que guarda), esto solo le añade el
   * valor vivo de al lado, el carril lleno hasta el valor y las tres marcas
   * de debajo. Los del ecualizador NO entran: no viven bajo
   * .ytmpip-deslizador y tienen su propia fila con su output en dB.
   */
  const deslizadores = [...document.querySelectorAll(".ytmpip-deslizador input[type=range]")];

  for (const mando of deslizadores) {
    /*
     * Las marcas min / recomendado / max, escritas desde el propio input y
     * desde DEFAULT_SETTINGS. En el HTML serian una copia silenciosa: si un
     * limite o un valor de fabrica cambiara en constants.js, la pagina
     * seguiria enseñando el viejo sin que ninguna prueba lo viera.
     *
     * La de enmedio solo existe si hay un valor de fabrica NUMERICO y
     * ESTRICTAMENTE entre los extremos: el atenuado nace en 0 (que ya es el
     * extremo izquierdo) y el numero de barras no tiene valor propio (la
     * clave de fabrica es la conjunta spectrumBars). Enseñar "0 ·
     * recomendado" encima del minimo seria decir dos veces lo mismo.
     */
    const marcas = mando.parentElement.querySelector(".ytmpip-marcas");
    if (marcas && marcas.children.length === 3) {
      const minimo = Number(mando.min);
      const maximo = Number(mando.max);
      const deFabrica = DEFAULT_SETTINGS[mando.id];
      marcas.children[0].textContent = mando.min;
      marcas.children[1].textContent =
        typeof deFabrica === "number" && deFabrica > minimo && deFabrica < maximo
          ? deFabrica + " · " + t("marca_recomendado")
          : "";
      marcas.children[2].textContent = mando.max;
    }
    // `input` y no `change`: el numero y el carril siguen al dedo. El
    // guardado sigue siendo el change de siempre (listener de `fields`).
    mando.addEventListener("input", () => pintarDeslizador(mando));
  }

  /** El valor vivo y el porcentaje de carril lleno de UN deslizador. */
  function pintarDeslizador(mando) {
    const vivo = document.getElementById(mando.id + "Vivo");
    if (vivo) vivo.textContent = mando.value;
    const minimo = Number(mando.min);
    const maximo = Number(mando.max);
    const parte = maximo > minimo ? ((Number(mando.value) - minimo) / (maximo - minimo)) * 100 : 0;
    mando.style.setProperty("--lleno", parte + "%");
  }

  function pintarDeslizadores() {
    deslizadores.forEach(pintarDeslizador);
  }

  /* ---------- La vista previa incrustada ----------
   *
   * El iframe de vista-previa.html, que es la ventana DE VERDAD con una
   * cancion de mentira. Los dos botones la ponen a los dos tamaños de
   * apertura leyendo PIP_DIMENSIONS, las mismas medidas que usa openPip:
   * escribirlas aqui seria la copia de siempre, y ademas una que MIENTE
   * bonito (la vista previa seguiria abriendose, solo que con otro tamaño
   * que el de la ventana real).
   */
  const vistaPrevia = document.getElementById("vistaPrevia");
  const botonesDeVista = [
    { boton: document.getElementById("vistaPreviaPequena"), tamano: PIP_DIMENSIONS.COMPACT },
    { boton: document.getElementById("vistaPreviaGrande"), tamano: PIP_DIMENSIONS.EXPANDED }
  ];

  function ponerVistaPrevia(elegido) {
    if (!vistaPrevia) return;
    vistaPrevia.style.width = elegido.tamano.width + "px";
    vistaPrevia.style.height = elegido.tamano.height + "px";
    for (const { boton } of botonesDeVista) {
      if (boton) boton.setAttribute("aria-pressed", String(boton === elegido.boton));
    }
  }

  for (const entrada of botonesDeVista) {
    if (entrada.boton) entrada.boton.addEventListener("click", () => ponerVistaPrevia(entrada));
  }
  // Nace pequeña, que es tambien el tamaño de fabrica de la ventana; los
  // width/height del HTML son solo para el instante antes de esta linea.
  ponerVistaPrevia(botonesDeVista[0]);

  function load() {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), (stored) => {
      fields.seekSeconds.value = stored[STORAGE_KEYS.SEEK_SECONDS] ?? DEFAULT_SETTINGS.seekSeconds;
      fields.theme.value = stored[STORAGE_KEYS.THEME] ?? DEFAULT_SETTINGS.theme;
      fields.pipSize.value = stored[STORAGE_KEYS.PIP_SIZE] ?? DEFAULT_SETTINGS.pipSize;
      fields.defaultSection.value = stored[STORAGE_KEYS.DEFAULT_SECTION] ?? DEFAULT_SETTINGS.defaultSection;
      fields.lyricsPreference.value = stored[STORAGE_KEYS.LYRICS_PREFERENCE] ?? DEFAULT_SETTINGS.lyricsPreference;
      fields.videoPreference.value = stored[STORAGE_KEYS.VIDEO_PREFERENCE] ?? DEFAULT_SETTINGS.videoPreference;
      fields.canvasPreference.value = stored[STORAGE_KEYS.CANVAS_PREFERENCE] ?? DEFAULT_SETTINGS.canvasPreference;

      /*
       * El desplegable del halo se DEDUCE de las dos claves, como el del
       * ecualizador se deduce de lo guardado: apagado gana —da igual que
       * modo espere debajo— y encendido enseña el modo. No hay clave
       * "halo" propia: seria una tercera respuesta a una pregunta que ya
       * tiene dos.
       */
      fields.halo.value =
        (stored[STORAGE_KEYS.HALO_PREFERENCE] ?? DEFAULT_SETTINGS.haloPreference) === "hidden"
          ? "off"
          : (stored[STORAGE_KEYS.HALO_MODE] ?? DEFAULT_SETTINGS.haloMode);

      /*
       * El color del halo, deducido por la FORMA con el MISMO saneador que
       * usa la ventana (nada de repetir aqui la regla con un charAt): un
       * hex es "un color mio" y las dos palabras son su propio modo
       * ("accent" el del tema, "source" el de la caratula). El cuentagotas
       * oculto nace con el rojo sugerido —la misma constante con la que
       * nace el del espectro— para que abrir "Un color mio" no enseñe un
       * negro que nadie eligio.
       */
      const colorDeHalo = normalizarColorDeHalo(stored[STORAGE_KEYS.HALO_COLOR]);
      const haloPropio = colorDeHalo !== "accent" && colorDeHalo !== "source";
      fields.haloColorMode.value = haloPropio ? "custom" : colorDeHalo;
      fields.haloColor.value = haloPropio ? colorDeHalo : SPECTRUM_LIMITS.COLOR_SUGGESTED;

      const barras = partirBarras(stored[STORAGE_KEYS.SPECTRUM_BARS]);
      fields.spectrumBarsMode.value = barras.modo;
      fields.spectrumBarsCount.value = barras.numero;

      /*
       * partirColor devuelve SIEMPRE las tres cosas —modo, color suelto y
       * paleta—, aunque solo una este en uso. Asi cambiar de «Uno mio» a
       * «Una paleta mia» y volver no borra nada por el camino: los campos
       * que estaban ocultos ya traian con que nacer.
       */
      const color = partirColor(stored[STORAGE_KEYS.SPECTRUM_COLOR]);
      fields.spectrumColorMode.value = color.modo;
      fields.spectrumColor.value = color.color;
      fields.spectrumPaletteCount.value = color.paleta.length;
      color.paleta.forEach((hex, i) => {
        if (paletteInputs[i]) paletteInputs[i].value = hex;
      });

      /*
       * El desplegable no guarda su propio estado: se DEDUCE de lo
       * guardado, igual que el modo del color. `presetDe` devuelve `null`
       * cuando son numeros sueltos, y ese `null` es justo lo que significa
       * "A mi gusto". Guardar ademas un campo "modo" habria sido tener dos
       * respuestas a una pregunta que solo admite una.
       */
      const ecualizador = Ecualizador.normalizar(stored[STORAGE_KEYS.EQUALIZER]);
      /*
       * En crudo a proposito: `clavesEcualizador` valida por su cuenta, y
       * validarlo tambien aqui seria escribir dos veces la misma regla.
       *
       * Se copia campo a campo, con los nombres de las preferencias, en vez
       * de pasar `stored` entero: hoy las claves de storage se llaman igual
       * que los campos, y por eso pasarlo entero funcionaria; el dia que
       * dejen de llamarse igual, esto sigue funcionando y aquello no.
       */
      ecualizadorGuardado = {
        equalizer: stored[STORAGE_KEYS.EQUALIZER],
        equalizerLast: stored[STORAGE_KEYS.EQUALIZER_LAST]
      };
      fields.equalizerPreset.value =
        ecualizador === Ecualizador.APAGADO
          ? Ecualizador.APAGADO
          : Ecualizador.presetDe(ecualizador) || MANUAL;
      // Los deslizadores se ponen ANTES de pintar, porque con "A mi gusto"
      // los numeros guardados solo estan en ellos: valorDelEcualizador los
      // lee para reconstruir la lista.
      Ecualizador.ganancias(ecualizador).forEach((db, i) => {
        if (bandInputs[i]) bandInputs[i].input.value = String(db);
      });

      fields.spectrumFall.value = stored[STORAGE_KEYS.SPECTRUM_FALL] ?? DEFAULT_SETTINGS.spectrumFall;
      fields.spectrumHeight.value = stored[STORAGE_KEYS.SPECTRUM_HEIGHT] ?? DEFAULT_SETTINGS.spectrumHeight;
      fields.pipTransparency.value =
        stored[STORAGE_KEYS.PIP_TRANSPARENCY] ?? DEFAULT_SETTINGS.pipTransparency;

      mostrarCamposDependientes();
      pintarMuestraAcento();
      pintarEcualizador();
    });
  }

  function save() {
    const seekSeconds = Math.min(60, Math.max(1, Number(fields.seekSeconds.value) || DEFAULT_SETTINGS.seekSeconds));
    const barras = unirBarras(fields.spectrumBarsMode.value, fields.spectrumBarsCount.value);
    /*
     * Las dos claves del ecualizador salen de una sola llamada, y ya
     * NORMALIZADAS. Guardar el crudo tendria que dar igual —settings.js
     * normaliza al leer—, pero esta pagina es justo la que enseña lo
     * guardado, asi que lo escrito y lo que suena no pueden ser dos cosas
     * distintas. Es la misma regla que unirBarras, que tambien acota antes
     * de escribir.
     *
     * La decision de que va en cada clave NO se toma aqui: vive en
     * settings.js porque el interruptor de la ventana flotante necesita la
     * misma, y una regla escrita en dos archivos son dos reglas.
     */
    /*
     * El halo, de un valor a dos claves. «Apagado» escribe SOLO el
     * interruptor y deja el modo guardado tal cual —omitir la clave es lo
     * que lo conserva—: asi «Latiendo» sobrevive a un apagado, que es la
     * misma promesa que hace el boton ✨ de la ventana. Con el halo
     * encendido el valor del desplegable ES el modo.
     */
    const halo = {};
    if (fields.halo.value === "off") {
      halo[STORAGE_KEYS.HALO_PREFERENCE] = "hidden";
    } else {
      halo[STORAGE_KEYS.HALO_PREFERENCE] = "shown";
      halo[STORAGE_KEYS.HALO_MODE] = fields.halo.value;
    }
    /*
     * El color SIEMPRE se escribe, tambien con el halo en «Apagado»: es
     * "a que volver al encender", como el modo, solo que este desplegable
     * es independiente del de arriba y no necesita el truco de omitir la
     * clave. Con «El del tema» se guarda la palabra "accent" y con «Del
     * video o la caratula» la palabra "source", no ningun hex resuelto:
     * guardarlo resuelto dejaria de seguir al tema (o a la cancion) al
     * cambiar. Solo «Un color mio» guarda un hex, que es el del
     * cuentagotas.
     */
    halo[STORAGE_KEYS.HALO_COLOR] =
      fields.haloColorMode.value === "custom" ? fields.haloColor.value : fields.haloColorMode.value;
    const ecualizador = clavesEcualizador(valorDelEcualizador(), ecualizadorGuardado);
    ecualizadorGuardado = {
      equalizer: ecualizador[STORAGE_KEYS.EQUALIZER],
      equalizerLast: ecualizador[STORAGE_KEYS.EQUALIZER_LAST]
    };
    chrome.storage.local.set(
      Object.assign(ecualizador, halo, {
        [STORAGE_KEYS.SEEK_SECONDS]: seekSeconds,
        [STORAGE_KEYS.THEME]: fields.theme.value,
        [STORAGE_KEYS.PIP_SIZE]: fields.pipSize.value,
        [STORAGE_KEYS.DEFAULT_SECTION]: fields.defaultSection.value,
        [STORAGE_KEYS.LYRICS_PREFERENCE]: fields.lyricsPreference.value,
        [STORAGE_KEYS.VIDEO_PREFERENCE]: fields.videoPreference.value,
        [STORAGE_KEYS.CANVAS_PREFERENCE]: fields.canvasPreference.value,
        [STORAGE_KEYS.SPECTRUM_BARS]: barras,
        [STORAGE_KEYS.SPECTRUM_FALL]: Number(fields.spectrumFall.value),
        [STORAGE_KEYS.SPECTRUM_HEIGHT]: Number(fields.spectrumHeight.value),
        [STORAGE_KEYS.SPECTRUM_COLOR]: unirColor(
          fields.spectrumColorMode.value,
          fields.spectrumColor.value,
          coloresElegidos()
        ),
        [STORAGE_KEYS.PIP_TRANSPARENCY]: Number(fields.pipTransparency.value)
      }),
      () => {
        // Lo guardado puede no ser lo escrito: unirBarras acota. Se devuelve
        // a la casilla para que el usuario vea el numero que de verdad hay.
        if (barras !== "auto") fields.spectrumBarsCount.value = barras;
        mostrarCamposDependientes();
        // El acento depende del tema, y el tema se elige en esta misma
        // pagina: cambiarlo tiene que mover la muestra en el acto.
        pintarMuestraAcento();
        // Y elegir un preset tiene que MOVER los deslizadores: son la unica
        // forma de ver que hace "Voz" antes de ponerse a escuchar.
        pintarEcualizador();
        status.textContent = t("guardado");
        setTimeout(() => (status.textContent = ""), 1500);
      }
    );
  }

  Object.values(fields).forEach((field) => field.addEventListener("change", save));
  paletteInputs.forEach((input) => input.addEventListener("change", save));

  /*
   * `input` ademas de `change`, y solo para la vista previa: el cuentagotas
   * nativo va soltando `input` mientras se arrastra por la rueda de color y
   * `change` solo al cerrarlo. Sin esto el degradado no se moveria hasta
   * despues de elegir, que es justo cuando ya no hace falta verlo. No se
   * guarda en cada `input` a proposito: serian decenas de escrituras en
   * storage por cada color elegido.
   */
  paletteInputs.forEach((input) => input.addEventListener("input", pintarVistaPrevia));
  fields.spectrumPaletteCount.addEventListener("input", mostrarCamposDependientes);

  /*
   * MOVER UN DESLIZADOR ES DEJAR DE USAR EL PRESET, y por eso el
   * desplegable se pasa a "A mi gusto" ANTES de guardar. Sin esta linea el
   * mando volveria solo a su sitio en cuanto se soltara: `save` guardaria
   * el preset —que es lo que sigue diciendo el desplegable— y
   * `pintarEcualizador` repintaria los cinco con los numeros del preset.
   * Se veria como un deslizador que no se deja mover.
   *
   * Es `input` y no `change`: con `change` el desplegable no cambiaria
   * hasta soltar el raton, y hasta entonces la pagina estaria enseñando un
   * preset con los numeros de otra cosa.
   */
  bandInputs.forEach((banda) => {
    banda.input.addEventListener("input", () => {
      fields.equalizerPreset.value = MANUAL;
      // Repintar en cada `input` para que el numero de al lado siga al
      // mando. NO se guarda aqui: arrastrar un deslizador de -12 a +12
      // serian veinticuatro escrituras en storage, y cada una despierta al
      // ecualizador de la pestaña.
      pintarEcualizador();
      // La linea de arriba escribio el value del select a mano, sin evento:
      // sin esto las pildoras seguirian encendiendo el preset que se acaba
      // de abandonar hasta el proximo guardado.
      sincronizarPildoras();
    });
    banda.input.addEventListener("change", save);
  });

  leerAcentosDelCss();
  load();
})();
