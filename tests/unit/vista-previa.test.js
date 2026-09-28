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
const OPCIONES = fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8");

async function marco({ conChrome = true, query = "?letra=1&escenario=1", getMessage } = {}) {
  const { win } = crearEntorno(undefined, { url: "chrome-extension://id/src/options/vista-previa.html" + query });
  if (!conChrome) delete win.chrome;
  else if (getMessage) win.chrome.i18n = { getMessage };
  let listo;
  const hecho = new Promise((r) => (listo = r));
  win.fetch = async () => ({ text: async () => PIP_HTML });
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/iconos.js", "src/options/vista-previa.js");
  // El .then del fetch: dos vueltas de microtareas y una de macrotarea.
  setTimeout(listo, 0);
  await hecho;
  await new Promise((r) => setTimeout(r, 0));
  const $ = (id) => win.document.getElementById(id);
  return { win, doc: win.document, $ };
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
