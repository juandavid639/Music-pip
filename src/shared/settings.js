/*
 * Acceso centralizado a las preferencias (seccion 12 del documento de
 * arquitectura). Hasta ahora options.js las guardaba en chrome.storage
 * pero nadie las leia: la ventana PiP tenia los valores hardcodeados.
 *
 * Este modulo mantiene una cache sincrona porque openPip() NO puede
 * hacer await antes de llamar a documentPictureInPicture.requestWindow():
 * cualquier await previo consume la activacion de usuario y la API falla
 * con NotAllowedError. Por eso se precarga al inyectar el content script
 * y despues siempre se lee de memoria.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});
  const { STORAGE_KEYS, DEFAULT_SETTINGS, SPECTRUM_LIMITS, PIP_LIMITS } = YTMPip.CONSTANTS;

  let cache = Object.assign({}, DEFAULT_SETTINGS);
  let loaded = false;
  const listeners = new Set();

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  /**
   * Un entero dentro de [min, max], o `fallback`.
   *
   * Redondea en vez de rechazar los decimales porque un <input type=number>
   * con step=1 deja escribirlos igualmente, y tirar un 12,4 al valor por
   * defecto seria castigar al usuario por una tecla.
   *
   * Pura.
   */
  function entero(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const redondeado = Math.round(n);
    return redondeado >= min && redondeado <= max ? redondeado : fallback;
  }

  /**
   * El numero de barras: `"auto"` o un entero dentro de los limites.
   *
   * "auto" va primero porque es el valor por defecto y el unico que no es
   * un numero: dejarlo caer por `entero` lo convertiria en NaN y de ahi al
   * fallback, que casualmente es "auto" otra vez. Funcionaria por
   * accidente, y un acierto por accidente se rompe en cuanto cambie el
   * valor por defecto.
   *
   * Pura.
   */
  function normalizarBarras(value) {
    if (value === "auto") return "auto";
    return entero(value, SPECTRUM_LIMITS.BARS_MIN, SPECTRUM_LIMITS.BARS_MAX, DEFAULT_SETTINGS.spectrumBars);
  }

  /**
   * El color del espectro. Tres formas posibles y solo una es un color:
   *
   *   "accent"   el que diga el tema
   *   "rgb"      ninguno fijo: el arcoiris girando, como los ventiladores
   *              de un ordenador gamer
   *   "#rrggbb"  este y no otro
   *
   * Se exige la forma larga de seis digitos y no se acepta `#abc` ni
   * `rgb(...)` ni un nombre de color. No es purismo: este texto acaba en
   * `contexto.fillStyle` y en una variable CSS, y un valor que el navegador
   * no entienda deja el espectro invisible sin decir nada. El unico sitio
   * que lo produce es un <input type=color>, que SIEMPRE da `#rrggbb`.
   *
   * Ojo con la coincidencia: `"rgb"` se llama asi por como lo llamo quien
   * lo pidio, y NO tiene nada que ver con la funcion CSS `rgb(...)`, que
   * sigue estando prohibida. Son cuatro letras iguales y dos cosas
   * distintas.
   *
   * Pura.
   */
  const UN_COLOR = /^#[0-9a-fA-F]{6}$/;

  /**
   * Una paleta guardada: varios `#rrggbb` separados por comas, o `null` si
   * lo que hay no es una paleta.
   *
   * `null` y no una paleta de reserva, por lo mismo que `normalizarTamano`:
   * "esto no es una paleta" y "esta es la paleta" son respuestas distintas,
   * y quien pregunta necesita distinguirlas para saber si el modo elegido
   * es otro. Inventarse aqui una paleta de reserva convertiria cualquier
   * basura en modo paleta.
   *
   * ACOTA por arriba y RECHAZA por abajo, y la asimetria es a proposito:
   * seis colores son una paleta que se pasa —se queda con los cinco
   * primeros, que es lo que el usuario queria de sobra—, pero UNO no es una
   * paleta que se quede corta, es otra cosa: es el modo "uno mio", que ya
   * existe. Devolver una paleta de un color haria que los dos modos se
   * pisaran.
   *
   * Pura.
   */
  function normalizarPaleta(value) {
    if (typeof value !== "string") return null;
    const trozos = value.split(",");
    // Menos de dos ni se mira: un solo color es el modo "custom", no una
    // paleta, y la coma es lo unico que distingue una forma de la otra.
    if (trozos.length < SPECTRUM_LIMITS.PALETTE_MIN) return null;
    const colores = [];
    for (let i = 0; i < trozos.length && colores.length < SPECTRUM_LIMITS.PALETTE_MAX; i++) {
      const trozo = trozos[i].trim();
      /*
       * Un solo color malo tumba la paleta entera en vez de saltarselo. Es
       * a proposito: saltarlo dejaria una paleta de dos colores donde el
       * usuario puso tres, y el degradado saldria distinto del que eligio
       * sin que nada lo avisara. Un fallo silencioso que cambia lo que se
       * ve es peor que volver al valor por defecto.
       */
      if (!UN_COLOR.test(trozo)) return null;
      colores.push(trozo.toLowerCase());
    }
    return colores.length >= SPECTRUM_LIMITS.PALETTE_MIN ? colores : null;
  }

  function normalizarColor(value) {
    /*
     * LOS MODOS QUE SON SU PROPIO VALOR GUARDADO, y por eso caben en una
     * linea. Ninguno lleva un dato dentro: "accent" es "el del tema", "rgb"
     * es "ve girando" y "source" es "el que mande en lo que se esta viendo".
     * Los que SI llevan dato —"custom" con su color, "palette" con su
     * lista— no estan aqui: se reconocen por la forma, mas abajo. Ver el
     * comentario largo de `unirColor`, que cuenta cual de las dos familias
     * sale gratis.
     */
    if (value === "accent" || value === "rgb" || value === "source") return value;
    if (typeof value === "string" && UN_COLOR.test(value)) return value.toLowerCase();
    /*
     * La paleta se guarda en ESTA misma clave y no en una propia. Tener
     * `spectrumColor: "accent"` y aparte `spectrumPalette: [...]` seria
     * poder guardar dos respuestas a la vez a una pregunta que solo admite
     * una, y antes o despues las dos se contradicen. El modo se deduce de
     * la FORMA de lo guardado: con comas es una paleta, con almohadilla un
     * color, y si no, el nombre del modo.
     */
    const paleta = normalizarPaleta(value);
    if (paleta) return paleta.join(",");
    return DEFAULT_SETTINGS.spectrumColor;
  }

  /**
   * El color del halo: "accent", "source" o un "#rrggbb", y nada mas.
   *
   * NO reutiliza normalizarColor a proposito: aquella acepta ademas "rgb"
   * y paletas con comas porque el espectro tiene esos modos; el halo es
   * una sola luz y no los tiene. Pasar ese saneador aqui dejaria colarse
   * un "rgb" guardado a mano que la ventana no sabria pintar (la variable
   * CSS acabaria valiendo la palabra "rgb", que no es un color).
   *
   * "source" entro despues que el resto: al nacer esta clave se rechazaba
   * porque el halo no sabia resolverla, y ese motivo ya no existe — la
   * ventana pinta el halo con el color muestreado del video o la portada,
   * el mismo que ya media para las barras del espectro.
   *
   * Pura.
   */
  function normalizarColorDeHalo(value) {
    if (value === "accent" || value === "source") return value;
    if (typeof value === "string" && UN_COLOR.test(value)) return value.toLowerCase();
    return DEFAULT_SETTINGS.haloColor;
  }

  /**
   * El tamaño anotado de la ventana: `{ width, height }` o `null`.
   *
   * Devuelve `null` —y no un tamaño de reserva— cuando lo guardado no
   * sirve, porque "no consta ninguno" y "consta este" son dos respuestas
   * distintas y quien pregunta tiene que poder distinguirlas: la primera
   * vez hay que abrir con el tamaño compacto de siempre, y ese numero vive
   * en PIP_DIMENSIONS, no aqui. Si esta funcion se inventara un tamaño,
   * habria dos sitios diciendo cuanto mide una ventana nueva.
   *
   * ACOTA en vez de rechazar cuando el numero es del tipo correcto pero se
   * sale: una ventana de 5000 px de ancho la escribio alguien con dos
   * monitores, y devolverle el tamaño compacto seria peor que devolverle el
   * maximo. Rechaza, en cambio, lo que ni siquiera es un par de numeros:
   * eso no es un tamaño estropeado, es otra cosa.
   *
   * Pura.
   */
  function normalizarTamano(value) {
    if (!value || typeof value !== "object") return null;
    const w = Number(value.width);
    const h = Number(value.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    // El cero y los negativos no son "pequeño": son un valor sin sentido, y
    // acotarlos al minimo disfrazaria de tamaño lo que es un error.
    if (w <= 0 || h <= 0) return null;
    return {
      width: Math.min(PIP_LIMITS.WIDTH_MAX, Math.max(PIP_LIMITS.WIDTH_MIN, Math.round(w))),
      height: Math.min(PIP_LIMITS.HEIGHT_MAX, Math.max(PIP_LIMITS.HEIGHT_MIN, Math.round(h)))
    };
  }

  /*
   * Un valor guardado, dos campos en pantalla.
   *
   * `spectrumBars` es "auto" O un numero, y `spectrumColor` es "accent" O
   * un `#rrggbb`: en los dos casos un solo valor lleva dentro dos
   * preguntas, y la pagina de opciones las hace por separado. Partir y unir
   * viven AQUI, junto a la normalizacion, y no en options.js, porque los
   * tres hablan de la misma forma del dato; separados, cambiar el formato
   * guardado obligaria a acordarse de dos archivos.
   *
   * Las cuatro son puras.
   */
  function partirBarras(value) {
    const limpio = normalizarBarras(value);
    return limpio === "auto"
      ? { modo: "auto", numero: SPECTRUM_LIMITS.BARS_SUGGESTED }
      : { modo: "fixed", numero: limpio };
  }

  /*
   * ACOTA donde `normalizarBarras` RECHAZA, y la diferencia es a proposito.
   * Al leer storage, un 5 significa "esto viene corrupto" y lo mas seguro
   * es volver al valor por defecto. Escribiendolo a mano en la casilla, un
   * 5 significa "quiero pocas": mandar el desplegable de vuelta a
   * "automatico" por eso seria deshacerle al usuario lo que acaba de
   * elegir. Mismo numero, dos intenciones distintas.
   */
  function unirBarras(modo, numero) {
    if (modo !== "fixed") return "auto";
    /*
     * El vacio se aparta a mano porque `Number("")` es 0, no NaN: la
     * casilla recien borrada parecia un numero valido y se acotaba al
     * minimo, asi que borrarla daba ocho barras en silencio. Vacia
     * significa "no he puesto nada", no "ocho".
     */
    const texto = String(numero).trim();
    const n = texto === "" ? NaN : Number(texto);
    if (!Number.isFinite(n)) return SPECTRUM_LIMITS.BARS_SUGGESTED;
    return Math.min(SPECTRUM_LIMITS.BARS_MAX, Math.max(SPECTRUM_LIMITS.BARS_MIN, Math.round(n)));
  }

  /*
   * El unico modo que lleva un color dentro es "custom". Los otros dos son
   * su propio valor guardado, asi que el nombre del modo Y el valor son la
   * misma cadena y no hay que traducir nada. El cuentagotas se queda con el
   * color sugerido para que no nazca en negro cuando el usuario lo destape.
   */
  function partirColor(value) {
    const limpio = normalizarColor(value);
    /*
     * El orden importa: la paleta se pregunta ANTES que el color suelto,
     * porque "#f15a5a,#5af15a" tambien empieza por almohadilla. Al reves,
     * una paleta se leeria como un color propio y el usuario perderia los
     * otros dos al abrir las opciones.
     */
    const paleta = normalizarPaleta(limpio);
    if (paleta) {
      return { modo: "palette", color: SPECTRUM_LIMITS.COLOR_SUGGESTED, paleta };
    }
    /*
     * Los cuentagotas que NO se estan usando nacen con la paleta sugerida,
     * no en negro, por lo mismo que BARS_SUGGESTED: quien destapa la paleta
     * quiere ver un degradado, no elegir tres colores a ciegas para
     * descubrir que hace.
     */
    return limpio.charAt(0) === "#"
      ? { modo: "custom", color: limpio, paleta: SPECTRUM_LIMITS.PALETTE_SUGGESTED.slice() }
      : {
          modo: limpio,
          color: SPECTRUM_LIMITS.COLOR_SUGGESTED,
          paleta: SPECTRUM_LIMITS.PALETTE_SUGGESTED.slice()
        };
  }

  /*
   * Sin red: el unico sitio que produce `color` es un <input type=color>,
   * que siempre da `#rrggbb`, y ademas `normalize` vuelve a validarlo al
   * leerlo de storage. Un normalizarColor aqui no podria atrapar nada, y
   * este proyecto ya borro una red asi en cortesDeBarras.
   *
   * Devolver `modo` tal cual —y no enumerar aqui "accent" y "rgb"— es lo
   * que impide que añadir un cuarto modo obligue a acordarse de esta
   * funcion: la lista de modos vive en el <select> de la pagina de
   * opciones y en normalizarColor, y con eso basta.
   *
   * ESO ERA VERDAD A MEDIAS, y la paleta lo demostro. El truco solo
   * funciona con los modos que SON su propio valor guardado ("accent",
   * "rgb"): añadir uno de esos sigue sin tocar nada. Los modos que LLEVAN
   * UN DATO DENTRO —"custom" con su color, "palette" con su lista— hay que
   * nombrarlos aqui por fuerza, porque alguien tiene que decir de donde
   * sale el dato. Son dos familias de modos y solo una era gratis; el
   * comentario original daba a entender que las dos.
   */
  function unirColor(modo, color, paleta) {
    if (modo === "custom") return color;
    /*
     * Sin red tampoco aqui, y por el mismo motivo que el color suelto: los
     * unicos sitios que producen esta lista son varios <input type=color>,
     * y ademas `normalize` la vuelve a validar al leerla de storage.
     *
     * El `|| []` no es una red, es que `join` no existe en undefined: si
     * llega vacia, sale "" y normalizarColor lo manda al valor por defecto,
     * que es exactamente lo que debe pasar con una paleta que no hay.
     */
    if (modo === "palette") return (paleta || []).join(",");
    return modo;
  }

  /**
   * A que ajuste vuelve el interruptor cuando se vuelve a encender.
   *
   * Es `Ecualizador.normalizar` con UNA regla mas encima: nunca "off". Y esa
   * regla de mas es justo el motivo de que exista esta funcion en vez de
   * llamar a `normalizar` a secas. "Off" es una respuesta perfectamente
   * valida a "como suena ahora" y una respuesta VACIA a "a que vuelvo", que
   * es la pregunta que contesta esta clave; guardar "off" aqui dejaria el
   * interruptor sin sitio al que ir y el boton no haria nada al pulsarlo.
   *
   * Ojo con el camino silencioso: `normalizar` manda a `DEFAULT_SETTINGS.
   * equalizer` —o sea a "off"— todo lo que no reconoce, asi que la basura
   * llega aqui disfrazada de apagado. Por eso se mira el RESULTADO y no la
   * entrada: una sola comparacion cubre "estaba apagado" y "no habia nada
   * que entender", que para esta pregunta son el mismo caso.
   *
   * Pura.
   */
  function ultimoEcualizador(valor) {
    const limpio = YTMPip.Ecualizador.normalizar(valor);
    if (limpio === YTMPip.Ecualizador.APAGADO) return DEFAULT_SETTINGS.equalizerLast;
    return limpio;
  }

  /**
   * Las dos claves del ecualizador a la vez, ya validadas: como suena ahora
   * y a que volver.
   *
   * VAN JUNTAS PORQUE LA REGLA ES UNA SOLA, y esa regla —"al apagar se
   * conserva lo que habia, al encender se anota"— la necesitan los dos sitios
   * que escriben el ecualizador: la lista de la pagina de opciones y el
   * interruptor de la ventana flotante. Escrita en los dos no seria una
   * regla, serian dos, y la que se olvidara de anotar dejaria el interruptor
   * volviendo a "graves" despues de que el usuario hubiera puesto sus cinco
   * numeros a mano.
   *
   * AL APAGAR SE ANOTA LO QUE SONABA, no la anotacion que hubiera. Esto lo
   * corrigio una prueba y merece quedar escrito, porque la version
   * equivocada parecia la buena: "apagar no toca la anotacion" suena
   * razonable y es falso en el unico caso que importa. Quien tenia sus
   * cinco numeros puestos desde antes de que esta clave existiera —o desde
   * cualquier version que no la escribiera— no tiene anotacion ninguna;
   * conservarla habria sido conservar el valor de fabrica y tirar los
   * numeros, que es justo lo que este interruptor existe para no hacer.
   * La anotacion vieja solo vale cuando ya estaba apagado, o sea cuando no
   * hay nada sonando que anotar.
   *
   * Por eso entra el estado ENTERO —`{ equalizer, equalizerLast }`— y no un
   * valor suelto: hacen falta los dos para contestar. Entra por argumento y
   * no se lee de la cache aqui dentro para que la funcion siga siendo pura,
   * que es lo que permite probar la regla sin montar un storage.
   *
   * ENTRA con la forma de las preferencias (`.equalizer`, `.equalizerLast`,
   * o sea lo que devuelve `get()`) y SALE con la forma de storage (claves de
   * STORAGE_KEYS). Hoy los dos nombres coinciden, y por eso da la impresion
   * de que da igual; escribirlo de las dos formas es lo que hara que siga
   * funcionando el dia que dejen de coincidir.
   *
   * Pura. Devuelve un objeto listo para `chrome.storage.local.set`.
   */
  function clavesEcualizador(valor, anteriores) {
    const { APAGADO } = YTMPip.Ecualizador;
    const limpio = YTMPip.Ecualizador.normalizar(valor);
    const previo = anteriores || {};
    const sonaba = YTMPip.Ecualizador.normalizar(previo.equalizer);
    return {
      [STORAGE_KEYS.EQUALIZER]: limpio,
      /*
       * Las dos claves salen SIEMPRE, tambien al encender, cuando la segunda
       * es una copia de la primera. Devolver a veces una y a veces dos
       * obligaria a quien guarda a acordarse de cual toca; asi lo que sale de
       * aqui es el estado completo del ecualizador y se vuelca entero.
       */
      [STORAGE_KEYS.EQUALIZER_LAST]:
        limpio !== APAGADO
          ? limpio
          : ultimoEcualizador(sonaba !== APAGADO ? sonaba : previo.equalizerLast)
    };
  }

  // Nunca confiamos en lo que haya en storage: puede venir de una version
  // anterior del esquema o de una edicion manual.
  function normalize(stored) {
    const raw = Number(stored[STORAGE_KEYS.SEEK_SECONDS]);
    const seekSeconds =
      Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.round(raw) : DEFAULT_SETTINGS.seekSeconds;

    return {
      seekSeconds,
      spectrumBars: normalizarBarras(stored[STORAGE_KEYS.SPECTRUM_BARS]),
      spectrumFall: entero(
        stored[STORAGE_KEYS.SPECTRUM_FALL],
        SPECTRUM_LIMITS.FALL_MIN,
        SPECTRUM_LIMITS.FALL_MAX,
        DEFAULT_SETTINGS.spectrumFall
      ),
      spectrumHeight: entero(
        stored[STORAGE_KEYS.SPECTRUM_HEIGHT],
        SPECTRUM_LIMITS.HEIGHT_MIN,
        SPECTRUM_LIMITS.HEIGHT_MAX,
        DEFAULT_SETTINGS.spectrumHeight
      ),
      spectrumColor: normalizarColor(stored[STORAGE_KEYS.SPECTRUM_COLOR]),
      pipTransparency: entero(
        stored[STORAGE_KEYS.PIP_TRANSPARENCY],
        PIP_LIMITS.TRANSPARENCY_MIN,
        PIP_LIMITS.TRANSPARENCY_MAX,
        DEFAULT_SETTINGS.pipTransparency
      ),
      /*
       * La unica normalizacion de este archivo que NO se escribe aqui. La
       * definicion de "un ecualizador valido" la necesitan tambien la pagina
       * de opciones (para saber que mando pintar) y el grafo de audio (para
       * saber si cruzar la puerta), asi que vive en un sitio al que llegan
       * los tres: src/shared/ecualizador.js.
       *
       * Se lee `YTMPip.Ecualizador` en cada llamada y no una vez arriba con
       * las demas constantes a proposito. `normalize` corre mucho despues de
       * que se carguen todos los scripts, asi que da igual el orden; pero
       * desestructurarlo arriba ATARIA este archivo a cargarse despues del
       * otro, y eso son cuatro sitios que habria que mantener de acuerdo
       * (manifest, options.html, y las pruebas que cargan a mano).
       */
      equalizer: YTMPip.Ecualizador.normalizar(stored[STORAGE_KEYS.EQUALIZER]),
      equalizerLast: ultimoEcualizador(stored[STORAGE_KEYS.EQUALIZER_LAST]),
      theme: pick(stored[STORAGE_KEYS.THEME], ["dark", "light"], DEFAULT_SETTINGS.theme),
      /*
       * "last" es el tercer valor, no una casilla aparte de "recordar el
       * tamaño". Una casilla suelta convertiria una sola pregunta —de que
       * tamaño nace la ventana— en dos que pueden contradecirse ("ampliada"
       * + "recordar" no significa nada), y ya sabemos como acaba eso aqui.
       */
      pipSize: pick(stored[STORAGE_KEYS.PIP_SIZE], ["compact", "expanded", "last"], DEFAULT_SETTINGS.pipSize),
      pipLastSize: normalizarTamano(stored[STORAGE_KEYS.PIP_LAST_SIZE]),
      defaultSection: pick(
        stored[STORAGE_KEYS.DEFAULT_SECTION],
        ["player", "lyrics"],
        DEFAULT_SETTINGS.defaultSection
      ),
      lyricsPreference: pick(
        stored[STORAGE_KEYS.LYRICS_PREFERENCE],
        ["shown", "hidden"],
        DEFAULT_SETTINGS.lyricsPreference
      ),
      videoPreference: pick(
        stored[STORAGE_KEYS.VIDEO_PREFERENCE],
        ["shown", "hidden"],
        DEFAULT_SETTINGS.videoPreference
      ),
      // El fondo Canvas: mismo par de valores que las otras dos
      // preferencias de "enseñar o no" de la ventana.
      canvasPreference: pick(
        stored[STORAGE_KEYS.CANVAS_PREFERENCE],
        ["shown", "hidden"],
        DEFAULT_SETTINGS.canvasPreference
      ),
      // El halo de luz: el "si se ve" con la misma pareja de valores que
      // las demas preferencias de enseñar o no, y el "como se ve" aparte
      // (ver el motivo de que sean dos claves en constants.js).
      haloPreference: pick(
        stored[STORAGE_KEYS.HALO_PREFERENCE],
        ["shown", "hidden"],
        DEFAULT_SETTINGS.haloPreference
      ),
      haloMode: pick(stored[STORAGE_KEYS.HALO_MODE], ["fixed", "pulse"], DEFAULT_SETTINGS.haloMode),
      // Y el color: su propio saneador, mas estrecho que el del espectro
      // ("accent", "source" o un hex; ver normalizarColorDeHalo).
      haloColor: normalizarColorDeHalo(stored[STORAGE_KEYS.HALO_COLOR])
    };
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(cache);
      } catch (err) {
        console.error("[YTMPip] Error en un listener de preferencias", err);
      }
    });
  }

  function load() {
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return Promise.resolve(cache);
    try {
      return Promise.resolve(chrome.storage.local.get(Object.values(STORAGE_KEYS)))
        .then((stored) => {
          cache = normalize(stored || {});
          loaded = true;
          notify();
          return cache;
        })
        .catch(() => cache);
    } catch (err) {
      return Promise.resolve(cache);
    }
  }

  /**
   * Anota el tamaño con el que se ha quedado la ventana.
   *
   * Escribe en storage Y en la cache, en ese orden de importancia pero en
   * la misma llamada, y por eso vive aqui y no en pip.js. Storage sola no
   * bastaria: `watch` ignora esta clave a proposito (ver abajo), asi que
   * nadie recargaria la cache, y cerrar y reabrir el PiP sin tocar ninguna
   * otra preferencia abriria la ventana con el tamaño de antes de ayer.
   * Y la cache sola tampoco: se pierde al recargar la pestaña.
   *
   * Devuelve lo que se ha anotado (ya acotado) para que se pueda comprobar
   * sin espiar la cache.
   */
  function anotarTamano(width, height) {
    const limpio = normalizarTamano({ width, height });
    if (!limpio) return null;
    cache = Object.assign({}, cache, { pipLastSize: limpio });
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;
    try {
      chrome.storage.local.set({ [STORAGE_KEYS.PIP_LAST_SIZE]: limpio });
    } catch (err) {
      // Contexto invalidado: la cache ya esta puesta y la ventana abierta
      // sigue funcionando; lo unico que se pierde es la memoria entre
      // sesiones, que no merece tirar nada por la borda.
    }
    return limpio;
  }

  /**
   * Cambia el ecualizador desde la ventana flotante.
   *
   * Vive aqui y no en pip.js por lo mismo que `anotarTamano`: hay que tocar
   * la cache Y storage en la misma llamada, y quien pinta botones no tiene
   * por que saber que son dos sitios.
   *
   * LA CACHE SE PONE PRIMERO Y ADEMAS SE AVISA, aunque escribir en storage ya
   * dispara `watch` -> `load` -> `notify` por su cuenta (EQUALIZER si esta en
   * CLAVES_QUE_SE_APLICAN, al reves que el tamaño anotado). Ese camino es el
   * bueno y es el que acaba mandando; esto es solo para que el boton no se
   * quede pintado como estaba durante el viaje de ida y vuelta, que es
   * asincrono. Repintar dos veces con el mismo valor no se nota; un
   * interruptor que tarda en moverse, si. Y sin tocar la cache, dos clics
   * seguidos leerian los dos el mismo estado viejo y el segundo no haria
   * nada.
   *
   * El estado anterior sale de la cache justo aqui, y entero: la regla
   * necesita saber ademas QUE SONABA, no solo que habia anotado.
   *
   * Devuelve el valor que queda puesto, para poder comprobarlo sin espiar la
   * cache.
   */
  function guardarEcualizador(valor) {
    const claves = clavesEcualizador(valor, cache);
    const limpio = claves[STORAGE_KEYS.EQUALIZER];
    cache = Object.assign({}, cache, {
      equalizer: limpio,
      equalizerLast: claves[STORAGE_KEYS.EQUALIZER_LAST]
    });
    notify();
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;
    try {
      chrome.storage.local.set(claves);
    } catch (err) {
      // Contexto invalidado: la cache ya esta puesta, asi que el ecualizador
      // cambia en esta sesion; lo unico que se pierde es que sobreviva a
      // cerrar la pestaña.
    }
    return limpio;
  }

  /*
   * La preferencia del fondo Canvas, escrita DESDE LA VENTANA: el boton
   * del fondo vive alli, no en la pagina de opciones. Misma coreografia
   * que guardarEcualizador y por el mismo motivo: la cache primero y con
   * aviso, para que el boton no se quede pintado como estaba durante el
   * viaje asincrono a storage, y para que dos clics seguidos no lean los
   * dos el estado viejo.
   */
  function guardarPreferenciaCanvas(valor) {
    const limpio = valor === "hidden" ? "hidden" : "shown";
    cache = Object.assign({}, cache, { canvasPreference: limpio });
    notify();
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;
    try {
      const claves = {};
      claves[STORAGE_KEYS.CANVAS_PREFERENCE] = limpio;
      chrome.storage.local.set(claves);
    } catch (err) {
      // Contexto invalidado: la cache ya esta puesta; solo se pierde que
      // la eleccion sobreviva a cerrar la ventana.
    }
    return limpio;
  }

  /*
   * La preferencia del halo de luz, escrita DESDE LA VENTANA: el boton ✨
   * vive alli. Misma coreografia que guardarPreferenciaCanvas y por el
   * mismo motivo: la cache primero y con aviso, para que el boton no se
   * quede pintado como estaba durante el viaje asincrono a storage.
   *
   * Solo toca HALO_PREFERENCE, nunca HALO_MODE: el boton enciende y
   * apaga, y el modo elegido en Preferencias tiene que sobrevivir al
   * apagon (es la razon de que sean dos claves, ver constants.js).
   */
  function guardarPreferenciaHalo(valor) {
    const limpio = valor === "hidden" ? "hidden" : "shown";
    cache = Object.assign({}, cache, { haloPreference: limpio });
    notify();
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;
    try {
      const claves = {};
      claves[STORAGE_KEYS.HALO_PREFERENCE] = limpio;
      chrome.storage.local.set(claves);
    } catch (err) {
      // Contexto invalidado: la cache ya esta puesta; solo se pierde que
      // la eleccion sobreviva a cerrar la ventana.
    }
    return limpio;
  }

  /*
   * Cambios en vivo: editar las preferencias actualiza el PiP abierto sin
   * tener que cerrarlo y volverlo a abrir.
   *
   * El tamaño anotado queda FUERA de esta lista, y no por ahorrar: se
   * escribe cada vez que alguien arrastra el borde de la ventana, y
   * recargar por el haria que un solo redimensionado repasara el tema, el
   * alto del espectro, el atenuado y el prestamo del video una y otra vez.
   * Ademas seria trabajo para nada, porque `anotarTamano` ya deja la cache
   * al dia por su cuenta.
   *
   * Y el ultimo ecualizador queda fuera por otro motivo: no es que se
   * escriba mucho, es que NO HAY NADA QUE APLICAR. Es una anotacion que
   * nadie oye; el que se oye es EQUALIZER, que si esta en la lista y que se
   * escribe en la misma llamada siempre que esta cambia. Dejarla dentro
   * haria que apagar el ecualizador —dos claves de golpe— recargara dos
   * veces, y la segunda para nada.
   *
   * La memoria por cancion queda fuera por los DOS motivos a la vez: es
   * una anotacion que este archivo ni siquiera normaliza —su dueño es
   * src/content/ecualizador-por-cancion.js, como PIP_LAST_SIZE lo es de
   * anotarTamano— y ademas fijar una cancion la escribe junto a EQUALIZER
   * en el mismo gesto, asi que dejarla dentro doblaria recargas igual que
   * EQUALIZER_LAST.
   */
  const CLAVES_QUE_SE_APLICAN = Object.values(STORAGE_KEYS).filter(
    (key) =>
      key !== STORAGE_KEYS.PIP_LAST_SIZE &&
      key !== STORAGE_KEYS.EQUALIZER_LAST &&
      key !== STORAGE_KEYS.EQUALIZER_BY_SONG
  );

  function watch() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const relevant = CLAVES_QUE_SE_APLICAN.some((key) => key in changes);
        if (relevant) load();
      });
    } catch (err) {
      // Contexto invalidado: se ignora, el PiP sigue con la cache actual.
    }
  }

  YTMPip.Settings = {
    get: function get() {
      return cache;
    },
    isLoaded: function isLoaded() {
      return loaded;
    },
    load,
    subscribe: function subscribe(fn) {
      listeners.add(fn);
      if (loaded) fn(cache);
      return function unsubscribe() {
        listeners.delete(fn);
      };
    },
    anotarTamano,
    guardarEcualizador,
    guardarPreferenciaCanvas,
    guardarPreferenciaHalo,
    // Puras y expuestas para poder probarlas sin montar un storage entero.
    // Las cuatro ultimas las usa la pagina de opciones.
    ultimoEcualizador,
    clavesEcualizador,
    entero,
    normalizarBarras,
    normalizarColor,
    normalizarPaleta,
    normalizarTamano,
    partirBarras,
    unirBarras,
    partirColor,
    unirColor,
    // La usa la pagina de opciones para deducir el desplegable del color
    // del halo de lo guardado: la MISMA regla que aplica la ventana, no
    // una copia con charAt escrita alli.
    normalizarColorDeHalo
  };

  watch();
  load();
})(typeof self !== "undefined" ? self : globalThis);
