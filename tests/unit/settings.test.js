/*
 * Pruebas de la normalizacion de preferencias.
 *
 * Lo que hay en chrome.storage no es de fiar: puede venir de una version
 * anterior del esquema, de una edicion manual o de un options.js con un
 * bug. La cache tiene que quedar siempre en un estado valido, porque
 * openPip() la lee de forma SINCRONA y sin margen para validar nada.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, plano } = require("../helpers/entorno.js");
const { DEFAULT_SETTINGS, SPECTRUM_LIMITS, PIP_LIMITS } = require("../helpers/constantes.js");

/** Carga los modulos compartidos con un storage simulado y espera a load(). */
async function preferencias(storage, opciones) {
  const { win } = crearEntorno(undefined, Object.assign({ storage }, opciones));
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
  await win.YTMPip.Settings.load();
  return win.YTMPip.Settings;
}

test("storage vacio: se usan los valores por defecto", async () => {
  const Settings = await preferencias({});
  assert.deepStrictEqual(plano(Settings.get()), DEFAULT_SETTINGS);
});

test("valores validos: se respetan tal cual", async () => {
  const guardado = {
    seekSeconds: 30,
    theme: "light",
    pipSize: "expanded",
    defaultSection: "lyrics",
    lyricsPreference: "hidden",
    videoPreference: "hidden",
    // "hidden" y no "shown" a proposito: el que NO es el valor por defecto
    // es el unico que demuestra que la preferencia se respeta en vez de
    // caer al de serie.
    canvasPreference: "hidden",
    // Las dos del halo, y las dos lejos de su valor de serie ("shown"/
    // "pulse" desde la 1.0.1 — OJO: "pulse" ERA el lejano y ahora es el
    // de serie, por eso aqui va "fixed") por la misma razon que
    // canvasPreference: solo lo distinto demuestra que la normalizacion
    // respeta en vez de pisar.
    haloPreference: "hidden",
    haloMode: "fixed",
    // Un hex y no "source" (el de serie desde la 1.0.1), por lo mismo de
    // arriba. Ya en minusculas: las mayusculas las prueba aparte el caso
    // del saneado.
    haloColor: "#00a1ff",
    spectrumBars: 20,
    spectrumFall: 30,
    spectrumHeight: 60,
    spectrumColor: "#00ff88",
    pipTransparency: 55,
    /*
     * Se guarda una lista de ganancias A MANO y no el nombre de un preset,
     * porque la lista es el caso exigente: un nombre sobrevive a cualquier
     * normalizacion que no lo reconozca —cae al valor por defecto y se nota—,
     * mientras que una lista tiene que sobrevivir al partido por comas, al
     * acotado de cada numero y al vuelto a juntar sin que se mueva un
     * decibelio. El signo negativo esta ahi por lo mismo.
     */
    equalizer: "-4,0,2,0,6",
    /*
     * El ultimo ajuste, para el interruptor de la ventana flotante. Tambien
     * una lista a mano y no un nombre de preset, y aqui hay un motivo de mas
     * que en la linea de arriba: es JUSTO el caso que justifica que exista
     * la clave. Quien elige "Voz" no pierde nada al apagar y encender —el
     * nombre sigue ahi—, pero quien se ha puesto sus cinco numeros a mano
     * los perderia, y esta es la prueba de que no.
     *
     * Distinta del ecualizador de arriba a proposito: si `normalize` leyera
     * la clave equivocada, con las dos iguales seguiria pasando.
     */
    equalizerLast: "3,3,0,0,0",
    // No es una preferencia que nadie escriba en la pagina de opciones:
    // la anota la propia ventana al soltarle el borde. Pero pasa por la
    // misma normalizacion y tiene que salir igual que entro.
    pipLastSize: { width: 500, height: 400 }
  };
  const Settings = await preferencias(guardado);

  assert.deepStrictEqual(plano(Settings.get()), guardado);
});

test("videoPreference desconocida cae a mostrar el vídeo", async () => {
  for (const valor of ["auto", "", null, 1, {}]) {
    const Settings = await preferencias({ videoPreference: valor });
    assert.strictEqual(
      Settings.get().videoPreference,
      DEFAULT_SETTINGS.videoPreference,
      `videoPreference=${String(valor)} deberia haber caido al valor por defecto`
    );
  }
});

test("videoPreference \"hidden\" se respeta", async () => {
  const Settings = await preferencias({ videoPreference: "hidden" });
  assert.strictEqual(Settings.get().videoPreference, "hidden");
});

test("seekSeconds fuera del rango [1,60] cae al valor por defecto", async () => {
  for (const valor of [0, -5, 61, 1000, NaN, Infinity, null, undefined, "abc", {}]) {
    const Settings = await preferencias({ seekSeconds: valor });
    assert.strictEqual(
      Settings.get().seekSeconds,
      DEFAULT_SETTINGS.seekSeconds,
      `seekSeconds=${String(valor)} deberia haber caido al valor por defecto`
    );
  }
});

test("seekSeconds acepta los extremos del rango", async () => {
  assert.strictEqual((await preferencias({ seekSeconds: 1 })).get().seekSeconds, 1);
  assert.strictEqual((await preferencias({ seekSeconds: 60 })).get().seekSeconds, 60);
});

test("seekSeconds decimal se redondea (el input numerico permite escribirlos)", async () => {
  assert.strictEqual((await preferencias({ seekSeconds: 15.4 })).get().seekSeconds, 15);
  assert.strictEqual((await preferencias({ seekSeconds: 15.6 })).get().seekSeconds, 16);
});

test("seekSeconds numerico en texto se acepta (chrome.storage puede devolver strings)", async () => {
  assert.strictEqual((await preferencias({ seekSeconds: "25" })).get().seekSeconds, 25);
});

test("haloColor: hex con mayusculas baja a minusculas, y lo que no es accent, source ni hex cae al tema", async () => {
  /*
   * El caso venenoso es "rgb": para el COLOR DEL ESPECTRO es un modo
   * valido, y un saneador perezoso que reutilizara normalizarColor lo
   * dejaria pasar — la variable CSS del halo acabaria valiendo la
   * palabra "rgb", que no pinta nada. El del halo tiene que rechazarlo.
   *
   * "source" estuvo en esta lista de rechazados hasta la tanda del halo
   * segun la caratula: se rechazaba porque el halo no sabia resolverlo, y
   * ese motivo ya no existe — ahora es el tercer modo y sobrevive tal
   * cual. "rgb" sigue siendo veneno: el halo sigue sin saber que hacer
   * con esa palabra.
   */
  assert.strictEqual((await preferencias({ haloColor: "#ABCDEF" })).get().haloColor, "#abcdef");
  assert.strictEqual((await preferencias({ haloColor: "source" })).get().haloColor, "source");
  for (const valor of ["rgb", "#f00", "#00ff88,#ff0000", "", null, 7, {}]) {
    const Settings = await preferencias({ haloColor: valor });
    assert.strictEqual(
      Settings.get().haloColor,
      DEFAULT_SETTINGS.haloColor,
      `haloColor=${String(valor)} deberia haber caido al color del tema`
    );
  }
});

test("un valor de enumeracion desconocido cae al valor por defecto", async () => {
  const Settings = await preferencias({
    theme: "midnight",
    pipSize: "gigante",
    defaultSection: "video",
    lyricsPreference: "quiza"
  });

  assert.strictEqual(Settings.get().theme, DEFAULT_SETTINGS.theme);
  assert.strictEqual(Settings.get().pipSize, DEFAULT_SETTINGS.pipSize);
  assert.strictEqual(Settings.get().defaultSection, DEFAULT_SETTINGS.defaultSection);
  assert.strictEqual(Settings.get().lyricsPreference, DEFAULT_SETTINGS.lyricsPreference);
});

test("una preferencia corrupta no arrastra a las demas", async () => {
  const Settings = await preferencias({ theme: "midnight", seekSeconds: 45 });
  assert.strictEqual(Settings.get().theme, DEFAULT_SETTINGS.theme);
  assert.strictEqual(Settings.get().seekSeconds, 45, "seekSeconds era valido y debia sobrevivir");
});

test("get() es sincrono y devuelve valores utilizables antes de load()", () => {
  // Requisito duro: openPip() no puede hacer await antes de
  // documentPictureInPicture.requestWindow(), porque cualquier await
  // consume la activacion de usuario y la API falla con NotAllowedError.
  const { win } = crearEntorno(undefined, { storage: { theme: "light" } });
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");

  const inmediato = win.YTMPip.Settings.get();
  assert.deepStrictEqual(plano(inmediato), DEFAULT_SETTINGS);
  assert.strictEqual(win.YTMPip.Settings.isLoaded(), false);
});

test("isLoaded pasa a true despues de leer storage", async () => {
  const Settings = await preferencias({ theme: "light" });
  assert.strictEqual(Settings.isLoaded(), true);
  assert.strictEqual(Settings.get().theme, "light");
});

test("subscribe recibe las preferencias y devuelve una funcion para darse de baja", async () => {
  const { win } = crearEntorno(undefined, { storage: { theme: "light", seekSeconds: 20 } });
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");

  const recibidas = [];
  const baja = win.YTMPip.Settings.subscribe((s) => recibidas.push(s.theme));

  // OJO: settings.js llama a load() por su cuenta al inyectarse (es lo que
  // deja la cache lista para la lectura sincrona de openPip). Esa carga
  // automatica ya esta en vuelo, asi que el listener recibe DOS avisos:
  // el de la precarga y el de esta llamada explicita.
  await win.YTMPip.Settings.load();
  assert.deepStrictEqual(recibidas, ["light", "light"], "el listener debia recibir la carga inicial");

  baja();
  await win.YTMPip.Settings.load();
  assert.deepStrictEqual(
    recibidas,
    ["light", "light"],
    "tras darse de baja no debia recibir nada mas"
  );
});

test("subscribe con la cache ya cargada dispara de inmediato", async () => {
  const Settings = await preferencias({ pipSize: "expanded" });
  let visto = null;
  Settings.subscribe((s) => {
    visto = s.pipSize;
  });
  assert.strictEqual(visto, "expanded");
});

test("un listener que lanza no impide que los demas se enteren", async () => {
  const { win } = crearEntorno(undefined, { storage: { theme: "light" } });
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");

  let segundoLlamado = false;
  win.YTMPip.Settings.subscribe(() => {
    throw new Error("listener defectuoso");
  });
  win.YTMPip.Settings.subscribe(() => {
    segundoLlamado = true;
  });

  await win.YTMPip.Settings.load();
  assert.strictEqual(segundoLlamado, true);
});

test("contexto invalidado: load() no lanza y conserva los valores por defecto", async () => {
  const Settings = await preferencias({ theme: "light" }, { contextoValido: false });
  assert.deepStrictEqual(plano(Settings.get()), DEFAULT_SETTINGS);
  assert.strictEqual(Settings.isLoaded(), false);
});

/* ====================================================================
 * Preferencias del espectro
 *
 * Todo lo de aqui abajo es aritmetica y comparacion de cadenas: se prueba
 * porque tiene logica, no porque toque el DOM. Como se VE el espectro no
 * se prueba aqui —eso es CSS, y se mira en tools/vista-previa.html—; lo
 * que se prueba es que el numero que llega a pintar sea el correcto.
 * ==================================================================== */

/** Las funciones puras, sin montar un storage. */
function puras() {
  const { win } = crearEntorno(undefined, { storage: {} });
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
  return win.YTMPip.Settings;
}

test("espectro: storage vacio deja los valores por defecto — los de siempre, salvo el color", async () => {
  const s = (await preferencias({})).get();
  assert.strictEqual(s.spectrumBars, "auto");
  assert.strictEqual(s.spectrumFall, 12, "12 es la caida que el espectro tenia antes de ser configurable");
  assert.strictEqual(s.spectrumHeight, 34, "34% era el alto fijo que estaba escrito en el CSS");
  assert.strictEqual(s.spectrumColor, "source", "desde la 1.0.1 el color de serie sigue a la fuente");
});

test("la 1.0.1 estrena de serie: halo latiendo y colores segun la fuente (decision fijada)", async () => {
  /*
   * Decision del autor tras publicar la 1.0.0, con sus palabras: «que el
   * halo aumente conforme la musica, lo mismo de el color con caratula,
   * barras tambien con video; las otras creo que estan bien». Esta prueba
   * clava SOLO las tres claves que cambiaron — el resto de defaults sigue
   * anclado en sus pruebas de siempre, que es donde esta el porque de
   * cada uno. Los tres degradan con elegancia en frio: "pulse" sale fijo
   * hasta el primer clic que toque audio (regla del gesto, tanda J) y
   * "source" cae al color del tema hasta que haya caratula muestreada
   * (la ausencia de la variable ES el mecanismo, tandas K y M).
   */
  const s = (await preferencias({})).get();
  assert.strictEqual(s.haloMode, "pulse", "el halo de serie late con la musica");
  assert.strictEqual(s.haloColor, "source", "el halo de serie toma el color de la caratula");
  assert.strictEqual(s.spectrumColor, "source", "las barras de serie toman el color de la fuente");
});

test("espectro: numeros fuera de rango caen al valor por defecto", async () => {
  const fuera = {
    spectrumBars: [7, 41, -1, 0, "muchas", null, {}],
    spectrumFall: [0, -3, 61, 1000, "rapido", null, {}],
    spectrumHeight: [9, 101, -20, "alto", null, {}]
  };
  for (const clave of Object.keys(fuera)) {
    for (const valor of fuera[clave]) {
      const s = (await preferencias({ [clave]: valor })).get();
      assert.strictEqual(
        s[clave],
        DEFAULT_SETTINGS[clave],
        `${clave}=${String(valor)} deberia haber caido al valor por defecto`
      );
    }
  }
});

test("espectro: los extremos de cada rango se aceptan", async () => {
  const { BARS_MIN, BARS_MAX, FALL_MIN, FALL_MAX, HEIGHT_MIN, HEIGHT_MAX } = SPECTRUM_LIMITS;
  const s = (await preferencias({ spectrumBars: BARS_MIN, spectrumFall: FALL_MIN, spectrumHeight: HEIGHT_MIN })).get();
  assert.deepStrictEqual(
    [s.spectrumBars, s.spectrumFall, s.spectrumHeight],
    [BARS_MIN, FALL_MIN, HEIGHT_MIN]
  );

  const t = (await preferencias({ spectrumBars: BARS_MAX, spectrumFall: FALL_MAX, spectrumHeight: HEIGHT_MAX })).get();
  assert.deepStrictEqual(
    [t.spectrumBars, t.spectrumFall, t.spectrumHeight],
    [BARS_MAX, FALL_MAX, HEIGHT_MAX]
  );
});

test("espectro: chrome.storage puede devolver numeros en texto", async () => {
  const s = (await preferencias({ spectrumBars: "20", spectrumFall: "30", spectrumHeight: "50" })).get();
  assert.deepStrictEqual([s.spectrumBars, s.spectrumFall, s.spectrumHeight], [20, 30, 50]);
});

test("espectro: los decimales se redondean, no se rechazan", async () => {
  // Un <input type=number> con step=1 deja escribir 34,6 igualmente. Tirar
  // ese valor al de por defecto seria castigar al usuario por una tecla.
  const s = (await preferencias({ spectrumBars: 20.4, spectrumFall: 30.6, spectrumHeight: 49.5 })).get();
  assert.deepStrictEqual([s.spectrumBars, s.spectrumFall, s.spectrumHeight], [20, 31, 50]);
});

test('espectro: "auto" sobrevive y no se convierte en numero', async () => {
  assert.strictEqual((await preferencias({ spectrumBars: "auto" })).get().spectrumBars, "auto");
});

test("espectro: solo se acepta un color #rrggbb, y en minusculas", async () => {
  assert.strictEqual((await preferencias({ spectrumColor: "#00FF88" })).get().spectrumColor, "#00ff88");
  assert.strictEqual((await preferencias({ spectrumColor: "accent" })).get().spectrumColor, "accent");

  // Formas que el navegador entiende en CSS pero que aqui NO se aceptan:
  // el unico sitio que produce este valor es un <input type=color>, y
  // colarse una que fillStyle no entienda deja el espectro invisible.
  for (const valor of ["#fff", "rgb(0,0,0)", "red", "#gggggg", "#0f0f0f0", "", null, 16711680]) {
    assert.strictEqual(
      (await preferencias({ spectrumColor: valor })).get().spectrumColor,
      DEFAULT_SETTINGS.spectrumColor,
      `spectrumColor=${String(valor)} deberia haber caido al valor por defecto`
    );
  }
});

test("espectro: una preferencia corrupta no arrastra a las demas", async () => {
  const s = (await preferencias({ spectrumBars: 999, spectrumFall: 25, spectrumColor: "azul" })).get();
  assert.strictEqual(s.spectrumBars, DEFAULT_SETTINGS.spectrumBars);
  assert.strictEqual(s.spectrumFall, 25, "spectrumFall era valido y debia sobrevivir");
  assert.strictEqual(s.spectrumColor, DEFAULT_SETTINGS.spectrumColor);
});

test("partirBarras: reparte el valor guardado en los dos campos de la pagina", () => {
  // `plano` por lo mismo de siempre: los objetos creados dentro de jsdom
  // no son reference-equal con los de Node.
  const { partirBarras } = puras();
  assert.deepStrictEqual(plano(partirBarras("auto")), {
    modo: "auto",
    numero: SPECTRUM_LIMITS.BARS_SUGGESTED
  });
  assert.deepStrictEqual(plano(partirBarras(20)), { modo: "fixed", numero: 20 });
});

test("partirBarras: con 'auto' la casilla NO nace vacia", () => {
  // Si naciera vacia, al cambiar el desplegable a "fijo" se guardaria NaN,
  // la normalizacion lo mandaria a "auto" y el desplegable se volveria solo
  // a la posicion de la que el usuario acababa de salir.
  const { partirBarras } = puras();
  const numero = partirBarras("auto").numero;
  assert.ok(
    Number.isFinite(numero) && numero >= SPECTRUM_LIMITS.BARS_MIN && numero <= SPECTRUM_LIMITS.BARS_MAX,
    `la sugerencia (${numero}) tenia que ser un numero valido del rango`
  );
});

test("unirBarras: el modo automatico ignora lo que ponga la casilla", () => {
  const { unirBarras } = puras();
  assert.strictEqual(unirBarras("auto", 20), "auto");
});

test("unirBarras ACOTA donde normalizarBarras RECHAZA", () => {
  const { unirBarras, normalizarBarras } = puras();
  // Escrito a mano, un 5 significa "quiero pocas": se acota al minimo.
  assert.strictEqual(unirBarras("fixed", 5), SPECTRUM_LIMITS.BARS_MIN);
  assert.strictEqual(unirBarras("fixed", 999), SPECTRUM_LIMITS.BARS_MAX);
  // Leido de storage, un 5 significa "esto viene corrupto": al valor por defecto.
  assert.strictEqual(normalizarBarras(5), DEFAULT_SETTINGS.spectrumBars);
});

test("unirBarras: la casilla vacia no manda el desplegable de vuelta a automatico", () => {
  const { unirBarras } = puras();
  assert.strictEqual(unirBarras("fixed", ""), SPECTRUM_LIMITS.BARS_SUGGESTED);
  assert.strictEqual(unirBarras("fixed", "abc"), SPECTRUM_LIMITS.BARS_SUGGESTED);
});

/*
 * ESTA PRUEBA ESTUVO ROJA SIN QUE NADIE LO SUPIERA, y merece la pena dejar
 * escrito por que. Cuando `partirColor` empezo a devolver tambien la paleta
 * sugerida —para que los cuentagotas de la paleta no nacieran en negro— este
 * `deepStrictEqual` dejo de cuadrar. No lo vio nadie porque desde entonces
 * cada ronda ha corrido solo los archivos que tocaba, y ninguna toco este.
 * Aparecio al correr la suite entera por otra cosa (añadir el ecualizador).
 *
 * La leccion no es "correrlo todo siempre": correrlo todo cada vez cuesta
 * tiempo y no encuentra nada nueve de cada diez veces. Es que una prueba con
 * `deepStrictEqual` sobre un objeto COMPLETO se rompe cada vez que ese objeto
 * crece, aunque lo que comprueba siga bien, asi que o se corre de vez en
 * cuando o no es una red, es un adorno.
 */
test("partirColor: con el color del tema el cuentagotas nace con algo", () => {
  const { partirColor } = puras();
  assert.deepStrictEqual(plano(partirColor("accent")), {
    modo: "accent",
    color: SPECTRUM_LIMITS.COLOR_SUGGESTED,
    paleta: SPECTRUM_LIMITS.PALETTE_SUGGESTED
  });
  assert.deepStrictEqual(plano(partirColor("#00ff88")), {
    modo: "custom",
    color: "#00ff88",
    paleta: SPECTRUM_LIMITS.PALETTE_SUGGESTED
  });
});

test("partirColor: la sugerencia es un #rrggbb que el <input type=color> acepta", () => {
  const { partirColor } = puras();
  assert.match(partirColor("accent").color, /^#[0-9a-f]{6}$/);
});

test("unirColor: el modo del tema ignora el color elegido", () => {
  const { unirColor } = puras();
  assert.strictEqual(unirColor("accent", "#00ff88"), "accent");
  assert.strictEqual(unirColor("custom", "#00ff88"), "#00ff88");
});

test("partir y unir son inversas: lo que se guarda vuelve igual", () => {
  const { partirBarras, unirBarras, partirColor, unirColor } = puras();
  for (const valor of ["auto", 8, 24, 40]) {
    const { modo, numero } = partirBarras(valor);
    assert.strictEqual(unirBarras(modo, numero), valor, `las barras ${valor} no volvieron igual`);
  }
  for (const valor of ["accent", "rgb", "#00ff88", "#f15a5a"]) {
    const { modo, color } = partirColor(valor);
    assert.strictEqual(unirColor(modo, color), valor, `el color ${valor} no volvio igual`);
  }
});

/* ====================================================================
 * El color que no es un color: "rgb"
 *
 * El tercer modo del espectro no guarda ningun color porque los recorre
 * todos. Lo que hay que clavar es que la normalizacion NO lo confunda ni
 * con un color propio ni con basura, porque las consecuencias son
 * distintas y las dos son silenciosas: tratado como color acabaria en
 * `fillStyle = "rgb"` y no se pintaria nada; tratado como basura volveria
 * al acento y el usuario veria que su eleccion "no se guarda".
 * ==================================================================== */

test('espectro: "rgb" se guarda tal cual, no cae al valor por defecto', async () => {
  assert.strictEqual((await preferencias({ spectrumColor: "rgb" })).get().spectrumColor, "rgb");
});

test('espectro: "rgb" no es un color propio, asi que no abre el cuentagotas', () => {
  const { partirColor } = puras();
  const partido = partirColor("rgb");
  assert.strictEqual(partido.modo, "rgb");
  assert.notStrictEqual(partido.modo, "custom");
  // Y el cuentagotas, aunque este escondido, sigue naciendo con algo
  // valido: el usuario puede destaparlo en cualquier momento.
  assert.match(partido.color, /^#[0-9a-f]{6}$/);
});

test('espectro: "RGB" en mayusculas no cuela', () => {
  // Se acepta lo que produce el <select>, que es exactamente "rgb". Un
  // valor parecido viene de una edicion manual o de otra version, y ahi lo
  // seguro es volver al valor por defecto.
  const { normalizarColor } = puras();
  assert.strictEqual(normalizarColor("RGB"), DEFAULT_SETTINGS.spectrumColor);
  assert.strictEqual(normalizarColor("rgb(0,0,0)"), DEFAULT_SETTINGS.spectrumColor);
});

/* ====================================================================
 * Atenuar la ventana mientras suena
 * ==================================================================== */

test("atenuado: quien no ha pedido nada no se encuentra la ventana desvanecida", async () => {
  assert.strictEqual((await preferencias({})).get().pipTransparency, 0);
});

test("atenuado: fuera de [0, 80] se vuelve al cero", async () => {
  // El 100 es el caso importante y por eso esta en la lista: dejaria la
  // ventana invisible, y el atenuado se deshace pasando el raton por
  // encima de algo que se pueda ver.
  for (const valor of [-1, 81, 100, 1000, "mucho", null, {}, NaN]) {
    assert.strictEqual(
      (await preferencias({ pipTransparency: valor })).get().pipTransparency,
      DEFAULT_SETTINGS.pipTransparency,
      `pipTransparency=${String(valor)} deberia haber caido al valor por defecto`
    );
  }
});

test("atenuado: los extremos del rango se aceptan", async () => {
  const { TRANSPARENCY_MIN, TRANSPARENCY_MAX } = PIP_LIMITS;
  assert.strictEqual(
    (await preferencias({ pipTransparency: TRANSPARENCY_MIN })).get().pipTransparency,
    TRANSPARENCY_MIN
  );
  assert.strictEqual(
    (await preferencias({ pipTransparency: TRANSPARENCY_MAX })).get().pipTransparency,
    TRANSPARENCY_MAX
  );
});
