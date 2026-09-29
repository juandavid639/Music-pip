/*
 * LA VISTA PREVIA DE PREFERENCIAS (tanda W).
 *
 * El marco src/options/vista-previa.html viaja en el paquete y se incrusta
 * en Preferencias como «lo que se verá». Hasta aqui no lo cargaba ninguna
 * prueba, y la auditoria del 2026-09-28 le encontro tres cosas:
 *  - no pasaba por el catalogo: con Chrome en ingles seguia en español,
 *    y con dos textos escritos a mano («Conectado», «Letra: …»);
 *  - traia titulo, artista y cuatro versos de una cancion REAL;
 *  - sus treinta botones de verdad recibian el foco del teclado sin hacer
 *    nada.
 *
 * Se carga el marco de verdad en jsdom, con `fetch` sirviendo pip.html del
 * disco, en los dos sitios donde vive: dentro de la extension (con
 * chrome.i18n) y en la rejilla de tools/ (sin chrome).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

const PIP_HTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
const MARCO = fs.readFileSync(path.join(RAIZ, "src/options/vista-previa.html"), "utf8");
const OPCIONES = fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8");

async function marco({ conChrome = true, query = "?letra=1&escenario=1", getMessage } = {}) {
  const { win } = crearEntorno(undefined, { url: "chrome-extension://id/src/options/vista-previa.html" + query });
  if (!conChrome) delete win.chrome;
  else if (getMessage) win.chrome.i18n = { getMessage };
  let listo;
  const hecho = new Promise((r) => (listo = r));
  win.fetch = async () => ({ text: async () => PIP_HTML });
  // jsdom no trae requestAnimationFrame: uno que APUNTA los fotogramas, para
  // poder avanzarlos a mano (el mismo truco que pip-espectro.test.js).
  const fotogramas = [];
  win.requestAnimationFrame = (fn) => fotogramas.push(fn);
  /*
   * Los scripts, en el orden en que los pide el propio vista-previa.html:
   * la lista escrita a mano aqui se quedo vieja en cuanto el marco empezo a
   * leer las preferencias (tanda AD). Leida del archivo no puede.
   */
  const scripts = [...MARCO.matchAll(/<script src="\.\.\/([^"]+)"><\/script>/g)].map((m) => "src/" + m[1]);
  cargar(win, ...scripts, "src/options/vista-previa.js");
  // El .then del fetch: dos vueltas de microtareas y una de macrotarea.
  setTimeout(listo, 0);
  await hecho;
  await new Promise((r) => setTimeout(r, 0));
  const $ = (id) => win.document.getElementById(id);
  return { win, doc: win.document, $, fotogramas };
}

test("REGRESION TANDA W: dentro de la extension, la vista previa habla el idioma del catalogo", async () => {
  const INGLES = { conectado: "Connected", fuente: "Source: $1", idioma: "en" };
  const m = await marco({
    getMessage: (clave, subs) => (INGLES[clave] || "").replace("$1", subs && subs[0])
  });
  assert.strictEqual(m.$("ytmpip-status").textContent, "Connected");
  assert.strictEqual(m.$("ytmpip-lyrics-source").textContent, "Source: Better Lyrics");
  assert.strictEqual(m.doc.documentElement.getAttribute("lang"), "en");
});

test("fuera de la extension (la rejilla de tools/) se queda el español, no las claves peladas", async () => {
  const m = await marco({ conChrome: false });
  assert.strictEqual(m.$("ytmpip-status").textContent, "Conectado");
  assert.strictEqual(m.$("ytmpip-lyrics-source").textContent, "Fuente: Better Lyrics");
});

test("REGRESION TANDA W: el cuerpo del marco es inerte (sus botones no reciben el foco)", async () => {
  const m = await marco();
  assert.strictEqual(m.doc.body.inert, true);
});

test("REGRESION TANDA W: la cancion de ejemplo es inventada", async () => {
  /*
   * No se puede probar que un texto NO sea de nadie; lo que se fija es que
   * no vuelvan los de antes, y que los de ahora sean los escritos para
   * esta vista previa.
   */
  const m = await marco();
  const todo = m.doc.body.textContent;
  for (const viejo of ["Ginger Root", "Weather", "Rikki", "Sorry, don't want you to visit"]) {
    assert.ok(!todo.includes(viejo), `vuelve a aparecer «${viejo}»`);
  }
  assert.strictEqual(m.$("ytmpip-title").textContent, "Luz de madrugada");
});

test("en Preferencias, el marco no es una parada de tabulador y el «Guardado.» se anuncia", () => {
  assert.match(OPCIONES, /<iframe[^>]*id="vistaPrevia"[^>]*tabindex="-1"/s);
  assert.match(OPCIONES, /<p id="status" role="status"><\/p>/);
  assert.match(OPCIONES, /<main class="ytmpip-pagina">/);
});

/* ==================================================================
 * La tanda AD: la vista previa pinta las preferencias guardadas
 * ================================================================== */

/*
 * Un marco con las preferencias SEMBRADAS y un storage que avisa: cambiar
 * `guardado` y avisar es lo que pasa cuando Preferencias guarda.
 */
async function marcoCon(guardado, extra = {}) {
  const { win } = crearEntorno(undefined, {
    url: "chrome-extension://id/src/options/vista-previa.html?espectro=1",
    storage: guardado
  });
  const oyentes = [];
  win.chrome.storage.onChanged = { addListener: (fn) => oyentes.push(fn) };
  win.matchMedia = (consulta) => ({
    matches: consulta.includes("reduced-motion") ? Boolean(extra.menosMovimiento) : false,
    addEventListener() {}
  });
  const fotogramas = [];
  win.requestAnimationFrame = (fn) => fotogramas.push(fn);
  win.fetch = async () => ({ text: async () => PIP_HTML });
  const scripts = [...MARCO.matchAll(/<script src="\.\.\/([^"]+)"><\/script>/g)].map((m) => "src/" + m[1]);
  cargar(win, ...scripts, "src/options/vista-previa.js");
  const esperar = () => new Promise((r) => setTimeout(r, 0));
  await esperar();
  await esperar();
  const $ = (id) => win.document.getElementById(id);
  return {
    win,
    doc: win.document,
    $,
    fotogramas,
    async cambiar(valores) {
      Object.assign(guardado, valores);
      const cambios = {};
      for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
      oyentes.forEach((fn) => fn(cambios, "local"));
      await esperar();
      await esperar();
    }
  };
}

test("REGRESION TANDA AD: la vista previa pinta las preferencias guardadas, no los valores de serie", async () => {
  const m = await marcoCon({ theme: "light", coverStyle: "vinyl", spectrumStyle: "ring", haloPreference: "hidden" });
  assert.strictEqual(m.doc.documentElement.classList.contains("ytmpip-theme-light"), true, "el tema");
  assert.strictEqual(m.$("ytmpip-root").classList.contains("ytmpip-vinilo"), true, "el disco");
  assert.strictEqual(m.$("ytmpip-spectrum").classList.contains("ytmpip-espectro-anillo"), true, "la forma");
  assert.strictEqual(m.$("ytmpip-halo").hidden, true, "el halo");
});

test("REGRESION TANDA AD: cambiar una opcion la repinta al momento", async () => {
  const m = await marcoCon({ theme: "dark", coverStyle: "square" });
  assert.strictEqual(m.$("ytmpip-root").classList.contains("ytmpip-vinilo"), false, "premisa");
  await m.cambiar({ coverStyle: "vinyl", theme: "light" });
  assert.strictEqual(m.$("ytmpip-root").classList.contains("ytmpip-vinilo"), true);
  assert.strictEqual(m.doc.documentElement.classList.contains("ytmpip-theme-light"), true);
});

test("el tema de la caratula tiñe la vista previa con el color de su portada de mentira", async () => {
  const m = await marcoCon({ theme: "source" });
  const html = m.doc.documentElement;
  assert.notStrictEqual(html.style.getPropertyValue("--ytmpip-bg-rgb"), "", "sin tinte");
  assert.match(html.style.getPropertyValue("--ytmpip-accent"), /^rgb\(/);
  await m.cambiar({ theme: "dark" });
  assert.strictEqual(html.style.getPropertyValue("--ytmpip-bg-rgb"), "", "el tinte se quedo al cambiar de tema");
});

test("el halo lleva el color elegido; con el del tema la variable se quita", async () => {
  const m = await marcoCon({ haloPreference: "shown", haloColor: "#00ff88" });
  assert.strictEqual(m.$("ytmpip-halo").style.getPropertyValue("--ytmpip-halo-color"), "#00ff88");
  await m.cambiar({ haloColor: "accent" });
  assert.strictEqual(m.$("ytmpip-halo").style.getPropertyValue("--ytmpip-halo-color"), "");
});

test("REGRESION TANDA AD: el espectro de la vista previa se dibuja con el MISMO codigo que la ventana", async () => {
  // La onda solo la sabe trazar shared/formas-espectro.js: si la vista
  // previa pintara sus propias barras, aqui habria rectangulos y no curvas.
  const m = await marcoCon({ spectrumStyle: "wave", spectrumBars: 8 });
  const ordenes = [];
  const ctx = {};
  for (const o of ["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "quadraticCurveTo", "stroke", "fill", "closePath"]) {
    ctx[o] = (...a) => ordenes.push([o, ...a]);
  }
  const lienzo = m.$("ytmpip-spectrum");
  lienzo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 60 });
  lienzo.getContext = () => ctx;
  m.fotogramas.shift()(1000);
  assert.strictEqual(ordenes.filter((o) => o[0] === "quadraticCurveTo").length, 7, "ocho puntos, siete curvas");
  assert.strictEqual(ordenes.filter((o) => o[0] === "fillRect").length, 0);
});

test("el halo «latiendo» late en la vista previa; el fijo no", async () => {
  const m = await marcoCon({ haloPreference: "shown", haloMode: "pulse" });
  const root = m.$("ytmpip-root");
  m.fotogramas.shift()(250); // en pleno golpe del bombo de mentira
  assert.ok(Number(root.style.getPropertyValue("--ytmpip-halo-golpe")) > 0.5);
  await m.cambiar({ haloMode: "fixed" });
  m.fotogramas.shift()(250);
  assert.strictEqual(root.style.getPropertyValue("--ytmpip-halo-golpe"), "0");
});

test("con menos movimiento pedido se pinta y no se anima", async () => {
  const m = await marcoCon({}, { menosMovimiento: true });
  m.fotogramas.shift()(0);
  assert.strictEqual(m.fotogramas.length, 0, "se pidio otro fotograma");
});

/* ---------- Preferencias: la vista previa acompaña al scroll ---------- */

test("REGRESION TANDA AD: la vista previa vive FUERA de la primera tarjeta, en su bloque pegado", () => {
  const { JSDOM } = require("jsdom");
  const doc = new JSDOM(OPCIONES).window.document;
  const lateral = doc.getElementById("lateralVistaPrevia");
  assert.ok(lateral, "no hay bloque lateral");
  assert.ok(lateral.contains(doc.getElementById("vistaPrevia")), "el marco no esta en el bloque");
  assert.strictEqual(doc.getElementById("seccion-ventana").contains(lateral), false, "sigue dentro de la tarjeta");
  const css = doc.querySelector("style").textContent;
  const i = css.indexOf(".ytmpip-lateral {");
  assert.match(css.slice(i, css.indexOf("}", i)), /position:\s*sticky/);
  assert.match(css, /@media \(min-width: 1180px\)[\s\S]*grid-template-columns/, "sin columnas en pantalla ancha");
  assert.match(css, /\.ytmpip-lateral\[data-tamano="grande"\]\s*\{\s*position:\s*static/, "la grande pegada arriba taparia media pagina");
});

test("la vista previa enseña el acento propio (tanda AE), y el de la cancion manda con su tema", async () => {
  const m = await marcoCon({ theme: "dark", accentColor: "#12ab34" });
  const html = m.doc.documentElement;
  assert.strictEqual(html.style.getPropertyValue("--ytmpip-accent"), "#12ab34");
  await m.cambiar({ theme: "source" });
  assert.notStrictEqual(html.style.getPropertyValue("--ytmpip-accent"), "#12ab34", "con el tema de la caratula manda la cancion");
  await m.cambiar({ theme: "dark", accentColor: "default" });
  assert.strictEqual(html.style.getPropertyValue("--ytmpip-accent"), "", "«el de siempre» deja mandar a la hoja");
});

test("la ayuda de la vista previa ya no dice que los ajustes no la cambian", () => {
  assert.doesNotMatch(OPCIONES, /no cambian esta vista/);
});
