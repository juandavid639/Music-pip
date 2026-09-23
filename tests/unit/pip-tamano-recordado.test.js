/*
 * Pruebas de "LA VENTANA RECUERDA SU TAMAÑO".
 *
 * Lo pedido fue que la ventana flotante vuelva a abrirse como se quedo. Son
 * tres piezas y las tres se prueban aqui:
 *
 *   1. Que se guarda (normalizarTamano): una anotacion absurda o corrupta
 *      no puede abrir una ventana de 20x20 px, porque una ventana asi no se
 *      puede agarrar por el borde para devolverla a su sitio.
 *   2. Con que se abre (dimensionesIniciales): la decision entera, incluido
 *      que significa el boton ⤢ cuando la ventana ya nace grande.
 *   3. El cable: que soltar el borde escriba, y que escribirlo NO dispare
 *      el repaso de preferencias.
 *
 * NO se prueba que el navegador respete el tamaño que se le pide, ni si lo
 * que se pide es el hueco interior o la ventana entera. Eso no lo puede
 * contestar jsdom, que no tiene ventanas flotantes: lo mide
 * tools/diagnostico-tamano-ventana.js.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, plano, RAIZ } = require("../helpers/entorno.js");
const { PIP_LIMITS, PIP_DIMENSIONS, DEFAULT_SETTINGS } = require("../helpers/constantes.js");

/** Solo las preferencias, que es lo unico que dos de las tres piezas tocan. */
async function preferencias(storage) {
  const { win } = crearEntorno(undefined, { storage });
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
  await win.YTMPip.Settings.load();
  return win.YTMPip.Settings;
}

/** La ventana flotante montada, para la parte del cable. */
function ventana(opciones = {}) {
  const escrituras = [];
  const lecturas = { veces: 0 };
  const { win } = crearEntorno(undefined, opciones);

  const almacen = opciones.storage || {};
  win.chrome.storage.local.set = (valores) => {
    escrituras.push(valores);
    return Promise.resolve();
  };
  win.chrome.storage.local.get = () => {
    lecturas.veces += 1;
    return Promise.resolve(almacen);
  };
  // Se sustituye ANTES de cargar settings.js porque watch() se registra
  // durante la carga; despues ya seria tarde.
  const oyentes = [];
  win.chrome.storage.onChanged.addListener = (fn) => oyentes.push(fn);

  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return { win, doc, banco, escrituras, lecturas, oyentes, Settings: win.YTMPip.Settings };
}

/*
 * jsdom da innerWidth/outerWidth como propiedades del prototipo, no del
 * objeto, asi que asignarlas no hace nada: hay que redefinirlas. Sin esto
 * la prueba mediria siempre los 1024x768 de fabrica y no probaria nada.
 */
function conTamano(win, exterior, interior) {
  const medidas = {
    outerWidth: exterior.width,
    outerHeight: exterior.height,
    innerWidth: (interior || exterior).width,
    innerHeight: (interior || exterior).height
  };
  for (const clave of Object.keys(medidas)) {
    Object.defineProperty(win, clave, { value: medidas[clave], configurable: true });
  }
}

/* ------------------------------------------------------------------
 * 1. Que se guarda
 * ------------------------------------------------------------------ */

test("un tamaño normal se guarda tal cual", async () => {
  const { normalizarTamano } = await preferencias({});

  assert.deepStrictEqual(plano(normalizarTamano({ width: 500, height: 400 })), {
    width: 500,
    height: 400
  });
});

test("no consta ningun tamaño: null, que no es lo mismo que uno pequeño", async () => {
  /*
   * Devolver aqui el compacto seria escribir el tamaño por defecto en un
   * segundo sitio. Quien tiene que saberlo es quien abre la ventana, y ya
   * lo sabe: esta en PIP_DIMENSIONS.
   */
  const { normalizarTamano } = await preferencias({});

  for (const valor of [null, undefined, 0, "", "500x400", [], NaN]) {
    assert.strictEqual(normalizarTamano(valor), null, `normalizarTamano(${String(valor)})`);
  }
});

test("media anotacion no es una anotacion", async () => {
  const { normalizarTamano } = await preferencias({});

  assert.strictEqual(normalizarTamano({ width: 500 }), null);
  assert.strictEqual(normalizarTamano({ height: 400 }), null);
  assert.strictEqual(normalizarTamano({ width: "ancho", height: 400 }), null);
  assert.strictEqual(normalizarTamano({ width: Infinity, height: 400 }), null);
  assert.strictEqual(normalizarTamano({ width: 0, height: 400 }), null);
  assert.strictEqual(normalizarTamano({ width: -300, height: 400 }), null);
});

test("EL CASO QUE IMPORTA: una anotacion absurda no abre una ventana inagarrable", async () => {
  /*
   * No es por llevarle la contraria al usuario —el navegador ya acota lo
   * que se le pide—: es que un storage corrupto o editado a mano abriria
   * una ventana de 20x20 px, y esa ventana no tiene borde que agarrar. El
   * usuario se quedaria sin forma de arreglarlo desde dentro, igual que
   * con una transparencia del 100 %.
   */
  const { normalizarTamano } = await preferencias({});

  const diminuta = plano(normalizarTamano({ width: 20, height: 20 }));
  assert.strictEqual(diminuta.width, PIP_LIMITS.WIDTH_MIN);
  assert.strictEqual(diminuta.height, PIP_LIMITS.HEIGHT_MIN);

  const gigante = plano(normalizarTamano({ width: 99999, height: 99999 }));
  assert.strictEqual(gigante.width, PIP_LIMITS.WIDTH_MAX);
  assert.strictEqual(gigante.height, PIP_LIMITS.HEIGHT_MAX);
});

test("el minimo deja pasar ventanas pequeñas pero utilizables", async () => {
  /*
   * El tope inferior va POR DEBAJO de los umbrales de maquetacion a
   * proposito: con menos de 290 px de ancho la ventana ya sabe apañarse
   * (modo estrecho, modo mini). Lo que no puede es no tener borde.
   */
  const { normalizarTamano } = await preferencias({});
  const pequeña = plano(normalizarTamano({ width: 260, height: 180 }));

  assert.deepStrictEqual(pequeña, { width: 260, height: 180 });
});

test("un tamaño con decimales se guarda redondeado", async () => {
  // El navegador puede dar medidas fraccionarias con zoom; pedir 340.4 px
  // de ancho no significa nada.
  const { normalizarTamano } = await preferencias({});

  assert.deepStrictEqual(plano(normalizarTamano({ width: 340.4, height: 200.6 })), {
    width: 340,
    height: 201
  });
});

test("lo que hay en storage pasa por la misma criba al cargarse", async () => {
  const Settings = await preferencias({ pipLastSize: { width: 10, height: 10 } });

  assert.deepStrictEqual(plano(Settings.get().pipLastSize), {
    width: PIP_LIMITS.WIDTH_MIN,
    height: PIP_LIMITS.HEIGHT_MIN
  });
});

/* ------------------------------------------------------------------
 * 2. Con que se abre
 * ------------------------------------------------------------------ */

test("sin tocar nada, la ventana se abre como siempre", async () => {
  const d = ventana().win.YTMPip.PipView.dimensionesIniciales;

  assert.strictEqual(DEFAULT_SETTINGS.pipSize, "compact", "premisa: de fabrica es la compacta");
  assert.deepStrictEqual(plano(d("compact", null)), {
    width: PIP_DIMENSIONS.COMPACT.width,
    height: PIP_DIMENSIONS.COMPACT.height,
    expandida: false
  });
  assert.deepStrictEqual(plano(d("expanded", null)), {
    width: PIP_DIMENSIONS.EXPANDED.width,
    height: PIP_DIMENSIONS.EXPANDED.height,
    expandida: true
  });
});

test("EL CASO PEDIDO: con «el ultimo» se abre con el tamaño anotado", () => {
  const d = ventana().win.YTMPip.PipView.dimensionesIniciales;

  assert.deepStrictEqual(plano(d("last", { width: 512, height: 384 })), {
    width: 512,
    height: 384,
    expandida: false
  });
});

test("la primera vez no hay ninguno anotado y se abre compacta", () => {
  /*
   * Nadie estrena la opcion con un tamaño guardado. Si esto cayera en un
   * numero inventado, la primera ventana de cada usuario nuevo saldria de
   * un tamaño que no ha elegido nadie.
   */
  const d = ventana().win.YTMPip.PipView.dimensionesIniciales;

  assert.deepStrictEqual(plano(d("last", null)), {
    width: PIP_DIMENSIONS.COMPACT.width,
    height: PIP_DIMENSIONS.COMPACT.height,
    expandida: false
  });
});

test("«el ultimo» no le quita el sitio a la preferencia elegida", () => {
  // El tamaño se anota siempre, incluso con "compacta" puesta. Que exista
  // una anotacion no puede cambiar lo que el usuario pidio.
  const d = ventana().win.YTMPip.PipView.dimensionesIniciales;
  const anotado = { width: 900, height: 700 };

  assert.strictEqual(plano(d("compact", anotado)).width, PIP_DIMENSIONS.COMPACT.width);
  assert.strictEqual(plano(d("expanded", anotado)).width, PIP_DIMENSIONS.EXPANDED.width);
});

test("una ventana recordada grande cuenta como ampliada, y el ⤢ la compacta", () => {
  /*
   * EL FALLO QUE ESTO EVITA: `expanded` es lo unico que decide que hace el
   * siguiente clic en ⤢. Si una ventana recordada de 900x700 naciera
   * marcada como "no ampliada", el primer clic en un boton que dice
   * "ampliar" la habria ENCOGIDO a 380x560.
   *
   * Se mira el alto y no el ancho porque lo que el boton enseña de mas
   * —la caratula grande, el panel de letras— crece hacia abajo.
   */
  const d = ventana().win.YTMPip.PipView.dimensionesIniciales;
  const alto = PIP_DIMENSIONS.EXPANDED.height;

  assert.strictEqual(plano(d("last", { width: 900, height: alto + 100 })).expandida, true);
  assert.strictEqual(plano(d("last", { width: 900, height: alto })).expandida, true);
  assert.strictEqual(plano(d("last", { width: 900, height: alto - 1 })).expandida, false);
  // Una ventana ancha pero baja no enseña nada de mas: sigue sin ser la ampliada.
  assert.strictEqual(plano(d("last", { width: 1400, height: 240 })).expandida, false);
});

test("la pagina de opciones no ofrece ningun tamaño que la ventana rechace", async () => {
  /*
   * La lista de tamaños validos esta escrita DOS veces: en el desplegable
   * de options.html y en la normalizacion de settings.js. Son la misma
   * regla, y una regla duplicada en dos archivos no es una regla, son dos.
   * Esto las obliga a decir lo mismo.
   *
   * El sintoma si se separaran seria de los peores: elegir la opcion nueva
   * en la pagina, verla guardada, y que la ventana la ignorase en silencio
   * cayendo al valor por defecto.
   */
  const html = fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8");
  // Sin el ">" final: desde el segundo rediseño el select lleva ademas
  // class="ytmpip-select-real" (la piel de pildoras) y el ancla con ">"
  // pegado dejaria de encontrarlo.
  const bloque = html.slice(html.indexOf('<select id="pipSize"'));
  const select = bloque.slice(0, bloque.indexOf("</select>"));
  const ofrecidos = [...select.matchAll(/value="([^"]+)"/g)].map((m) => m[1]);

  assert.ok(ofrecidos.includes("last"), "la pagina no ofrece recordar el ultimo tamaño");

  for (const valor of ofrecidos) {
    const Settings = await preferencias({ pipSize: valor });
    assert.strictEqual(
      Settings.get().pipSize,
      valor,
      `la pagina ofrece "${valor}" y la ventana lo tira a la basura`
    );
  }
});

/* ------------------------------------------------------------------
 * 3. El cable
 * ------------------------------------------------------------------ */

test("anotar el tamaño lo deja escrito Y en la cache de la misma llamada", async () => {
  /*
   * Las dos cosas hacen falta y por motivos distintos. Storage sola no
   * bastaria: la cache no se recarga con esta clave (ver la prueba de mas
   * abajo), asi que cerrar y reabrir sin tocar nada mas abriria la ventana
   * con el tamaño de anteayer. La cache sola tampoco: muere al recargar la
   * pestaña.
   */
  const v = ventana();
  await v.Settings.load();

  const devuelto = v.Settings.anotarTamano(640, 480);

  assert.deepStrictEqual(plano(devuelto), { width: 640, height: 480 });
  assert.deepStrictEqual(plano(v.Settings.get().pipLastSize), { width: 640, height: 480 });
  assert.deepStrictEqual(plano(v.escrituras.pop()), { pipLastSize: { width: 640, height: 480 } });
});

test("una medida imposible no se anota en ningun sitio", async () => {
  // Si la ventana se estuviera cerrando y midiera 0, sobreescribir la
  // anotacion buena con un cero seria perder el tamaño para siempre.
  const v = ventana();
  await v.Settings.load();
  v.Settings.anotarTamano(640, 480);
  v.escrituras.length = 0;

  assert.strictEqual(v.Settings.anotarTamano(0, 0), null);
  assert.strictEqual(v.Settings.anotarTamano(NaN, 480), null);

  assert.deepStrictEqual(v.escrituras, []);
  assert.deepStrictEqual(plano(v.Settings.get().pipLastSize), { width: 640, height: 480 });
});

test("EL CABLE: al cerrar se anota lo que mide la ventana", async () => {
  const v = ventana();
  await v.Settings.load();
  conTamano(v.win, { width: 700, height: 500 });
  v.escrituras.length = 0;

  v.banco.anotarTamanoAhora();

  assert.deepStrictEqual(plano(v.escrituras.pop()), { pipLastSize: { width: 700, height: 500 } });
});

test("se anota la ventana ENTERA, no el hueco donde se pinta", async () => {
  /*
   * EL FALLO QUE ESTO EVITA, y que no se ve el primer dia: si se anotara
   * el interior y luego se pidiera como si fuera el exterior, la ventana
   * encogeria el margen del navegador EN CADA SESION —700, 660, 620…—
   * hasta quedarse en el minimo.
   */
  const v = ventana();
  await v.Settings.load();
  /*
   * El hueco interior es mas ESTRECHO y mas BAJO que la ventana entera:
   * el navegador se queda un margen por los dos lados. Al escribir esto
   * puse el mismo ancho en los dos y la prueba solo vigilaba el alto; el
   * ancho podia estar leyendo el hueco interior y nadie se enteraba. Lo
   * canto la mutacion, que sobrevivio.
   */
  conTamano(v.win, { width: 700, height: 500 }, { width: 684, height: 460 });
  v.escrituras.length = 0;

  v.banco.anotarTamanoAhora();

  const anotado = plano(v.escrituras.pop()).pipLastSize;
  assert.strictEqual(anotado.width, 700);
  assert.strictEqual(anotado.height, 500);
});

test("si no hay exterior se anota el interior, que es mejor que nada", async () => {
  const v = ventana();
  await v.Settings.load();
  conTamano(v.win, { width: 0, height: 0 }, { width: 700, height: 460 });
  v.escrituras.length = 0;

  v.banco.anotarTamanoAhora();

  assert.deepStrictEqual(plano(v.escrituras.pop()), { pipLastSize: { width: 700, height: 460 } });
});

test("EL CASO PEDIDO: soltar el borde anota el tamaño nuevo", async () => {
  /*
   * El camino entero, y el unico que el usuario ve: la ventana cambia de
   * tamaño, se espera a que suelte, y queda escrito.
   *
   * La espera no es un sleep al tuntun: hay un rebote de medio segundo a
   * proposito, porque arrastrar un borde dispara decenas de "resize" y
   * escribir en cada uno seria absurdo.
   */
  const v = ventana();
  await v.Settings.load();
  v.banco.vigilarTamano();
  v.escrituras.length = 0;

  conTamano(v.win, { width: 820, height: 610 });
  v.win.dispatchEvent(new v.win.Event("resize"));

  assert.deepStrictEqual(v.escrituras, [], "escribio antes de que el usuario soltara el borde");

  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.deepStrictEqual(plano(v.escrituras.pop()), { pipLastSize: { width: 820, height: 610 } });
});

test("varios tirones seguidos anotan una sola vez, y el ultimo tamaño", async () => {
  // Lo que hace el rebote: un arrastre son decenas de eventos y una sola
  // escritura, la del tamaño con el que se quedo.
  const v = ventana();
  await v.Settings.load();
  v.banco.vigilarTamano();
  v.escrituras.length = 0;

  for (const alto of [300, 400, 500]) {
    conTamano(v.win, { width: 600, height: alto });
    v.win.dispatchEvent(new v.win.Event("resize"));
  }

  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.strictEqual(v.escrituras.length, 1, "un solo arrastre escribio en storage varias veces");
  assert.deepStrictEqual(plano(v.escrituras[0]), { pipLastSize: { width: 600, height: 500 } });
});

test("mover el borde NO repasa las preferencias de la ventana", async () => {
  /*
   * El tamaño anotado esta fuera de la lista de claves que disparan una
   * recarga, y no por ahorrar: un solo arrastre escribe decenas de veces,
   * y cada recarga repasaria el tema, el alto del espectro, el atenuado y
   * el prestamo del video. Ademas seria trabajo para nada, porque
   * anotarTamano ya deja la cache al dia por su cuenta.
   */
  const v = ventana();
  await v.Settings.load();
  const lecturasIniciales = v.lecturas.veces;
  assert.ok(v.oyentes.length > 0, "premisa: alguien escucha los cambios de storage");

  for (const oyente of v.oyentes) {
    oyente({ pipLastSize: { newValue: { width: 640, height: 480 } } }, "local");
  }

  assert.strictEqual(v.lecturas.veces, lecturasIniciales, "un redimensionado recargo todo");
});

test("cambiar una preferencia de verdad si repasa la ventana", async () => {
  // El otro lado: la excepcion es UNA clave, no un apagon de los cambios
  // en vivo. Sin esto, la excepcion podria haberse llevado por delante
  // todas las demas y ninguna prueba lo notaria.
  const v = ventana();
  await v.Settings.load();
  const lecturasIniciales = v.lecturas.veces;

  for (const oyente of v.oyentes) {
    oyente({ theme: { newValue: "light" } }, "local");
  }

  assert.strictEqual(v.lecturas.veces, lecturasIniciales + 1);
});
