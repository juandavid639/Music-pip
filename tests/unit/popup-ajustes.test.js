/*
 * EL MENU CON PESTAÑAS Y AJUSTES RAPIDOS (tanda AO).
 *
 * Pedido por el autor con una captura del menu de Better Lyrics: «tener un
 * control pequeño de las opciones y agregar otra opción que diga avanzada
 * para ver en detalle todo lo que tenemos».
 *
 * EL BANCO monta popup.html de verdad, con SUS scripts en SU orden (leidos
 * del HTML: si alguien quita settings.js de la lista, el banco lo sufre
 * igual que el menu). El storage avisa de cada escritura, propia o ajena,
 * como Chrome: el menu pinta lo guardado venga de donde venga.
 *
 * LO QUE NO: como se ve. El carril y la bolita del interruptor son de la
 * hoja, y de la hoja solo se lee como texto la regla que hace funcionar
 * las pestañas (que [hidden] gane al display del panel).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const HTML = fs.readFileSync(path.join(RAIZ, "src/popup/popup.html"), "utf8");
const HOJA = fs.readFileSync(path.join(RAIZ, "src/popup/popup.css"), "utf8");

/** Los scripts que carga popup.html, en su orden, como rutas desde la raiz. */
function scriptsDelMenu() {
  return [...HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => path.posix.join("src/popup", m[1]));
}

const pulso = () => new Promise((r) => setTimeout(r, 10));

async function menu(guardado = {}) {
  const dom = new JSDOM(HTML, { runScripts: "outside-only", // https y no chrome-extension: jsdom no da localStorage a un origen que
    // no conoce, y el menu recuerda la pestaña ahi.
    url: "https://menu.test/src/popup/popup.html" });
  const win = dom.window;
  win.self = win;
  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  const escrituras = [];
  win.chrome = {
    i18n: i18nFalso({}),
    runtime: {
      id: "id-de-prueba",
      getURL: (p) => "chrome-extension://id-de-prueba/" + p,
      sendMessage: () => Promise.resolve({ state: { connected: true, title: "x", artist: "y" } }),
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get: () => Promise.resolve(JSON.parse(JSON.stringify(almacen))),
        set(valores) {
          escrituras.push(valores);
          const cambios = {};
          for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
          Object.assign(almacen, valores);
          oyentes.forEach((fn) => fn(cambios, "local"));
          return Promise.resolve();
        }
      },
      onChanged: { addListener: (fn) => oyentes.push(fn) }
    }
  };
  cargar(win, ...scriptsDelMenu());
  await pulso();
  const doc = win.document;
  const $ = (id) => doc.getElementById(id);
  return {
    win,
    doc,
    $,
    almacen,
    escrituras,
    /** La ultima escritura, en plano: el objeto nace en la ventana jsdom. */
    ultima: () => JSON.parse(JSON.stringify(escrituras[escrituras.length - 1])),
    interruptor: (clave) => doc.querySelector(`[role="switch"][data-clave="${clave}"]`),
    segmento: (clave, valor) => doc.querySelector(`.ytmpip-popup-segmentos[data-clave="${clave}"] [data-valor="${valor}"]`),
    /** Lo que escribe otro contexto (la ventana, Preferencias). */
    ajeno(valores) {
      const cambios = {};
      for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
      Object.assign(almacen, valores);
      oyentes.forEach((fn) => fn(cambios, "local"));
    }
  };
}

/* ---------------- Las pestañas ---------------- */

test("abre en «Ahora suena», con los ajustes escondidos", async () => {
  const m = await menu();
  assert.strictEqual(m.$("ytmpip-pestana-ahora").getAttribute("aria-selected"), "true");
  assert.strictEqual(m.$("ytmpip-panel-ahora").hidden, false);
  assert.strictEqual(m.$("ytmpip-panel-ajustes").hidden, true);
});

test("pulsar «Ajustes» cambia de panel, y solo la elegida entra con el tabulador", async () => {
  const m = await menu();
  m.$("ytmpip-pestana-ajustes").click();
  assert.strictEqual(m.$("ytmpip-panel-ajustes").hidden, false);
  assert.strictEqual(m.$("ytmpip-panel-ahora").hidden, true);
  assert.strictEqual(m.$("ytmpip-pestana-ajustes").getAttribute("aria-selected"), "true");
  assert.strictEqual(m.$("ytmpip-pestana-ajustes").tabIndex, 0);
  assert.strictEqual(m.$("ytmpip-pestana-ahora").tabIndex, -1);
});

test("las flechas del teclado mueven entre pestañas", async () => {
  const m = await menu();
  const ahora = m.$("ytmpip-pestana-ahora");
  ahora.dispatchEvent(new m.win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.strictEqual(m.$("ytmpip-panel-ajustes").hidden, false);
  assert.strictEqual(m.doc.activeElement, m.$("ytmpip-pestana-ajustes"));
  m.$("ytmpip-pestana-ajustes").dispatchEvent(new m.win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.strictEqual(m.$("ytmpip-panel-ahora").hidden, false, "la ultima vuelve a la primera");
});

test("el menu recuerda la ultima pestaña abierta", async () => {
  const m = await menu();
  m.$("ytmpip-pestana-ajustes").click();
  assert.strictEqual(m.win.localStorage.getItem("ytmpip-popup-pestana"), "ytmpip-pestana-ajustes");
});

test("«Avanzada» es un enlace a Preferencias en otra pestaña, fuera del tablist", async () => {
  const m = await menu();
  const enlace = m.$("ytmpip-popup-options-link");
  assert.strictEqual(enlace.tagName, "A");
  assert.match(enlace.getAttribute("href"), /options\/options\.html$/);
  assert.strictEqual(enlace.getAttribute("target"), "_blank");
  assert.strictEqual(enlace.closest('[role="tablist"]'), null, "un enlace dentro del tablist miente al lector de pantalla");
  assert.match(enlace.textContent, /Avanzada/);
});

test("la hoja hace que [hidden] gane al display del panel", () => {
  assert.match(HOJA, /\.ytmpip-popup-panel\[hidden\]\s*\{\s*display:\s*none;/);
});

/* ---------------- Los ajustes rapidos ---------------- */

test("con storage vacio pinta los valores de serie: halo latiendo, onda, tema oscuro", async () => {
  const m = await menu();
  assert.strictEqual(m.interruptor("haloPreference").getAttribute("aria-checked"), "true");
  assert.strictEqual(m.interruptor("haloMode").getAttribute("aria-checked"), "true");
  assert.strictEqual(m.interruptor("coverStyle").getAttribute("aria-checked"), "false");
  assert.strictEqual(m.segmento("spectrumStyle", "wave").getAttribute("aria-pressed"), "true");
  assert.strictEqual(m.segmento("spectrumStyle", "bars").getAttribute("aria-pressed"), "false");
  assert.strictEqual(m.segmento("theme", "dark").getAttribute("aria-pressed"), "true");
});

test("pinta lo guardado, no lo escrito en el HTML", async () => {
  const m = await menu({ haloPreference: "hidden", coverStyle: "vinyl", theme: "light", spectrumStyle: "ring" });
  assert.strictEqual(m.interruptor("haloPreference").getAttribute("aria-checked"), "false");
  assert.strictEqual(m.interruptor("coverStyle").getAttribute("aria-checked"), "true");
  assert.strictEqual(m.segmento("theme", "light").getAttribute("aria-pressed"), "true");
  assert.strictEqual(m.segmento("spectrumStyle", "ring").getAttribute("aria-pressed"), "true");
  assert.strictEqual(m.segmento("spectrumStyle", "wave").getAttribute("aria-pressed"), "false");
});

test("un interruptor escribe SU clave con SU valor, y se ve en el acto", async () => {
  const m = await menu();
  m.interruptor("coverStyle").click();
  assert.deepStrictEqual(m.ultima(), { coverStyle: "vinyl" });
  assert.strictEqual(m.interruptor("coverStyle").getAttribute("aria-checked"), "true");
  m.interruptor("coverStyle").click();
  assert.deepStrictEqual(m.ultima(), { coverStyle: "square" });
});

test("el latido del halo se apaga a «fijo», no a otra cosa", async () => {
  const m = await menu();
  m.interruptor("haloMode").click();
  assert.deepStrictEqual(m.ultima(), { haloMode: "fixed" });
});

test("un segmento escribe su valor y deja pulsado solo ese", async () => {
  const m = await menu();
  m.segmento("theme", "source").click();
  assert.deepStrictEqual(m.ultima(), { theme: "source" });
  const pulsados = [...m.doc.querySelectorAll('[data-clave="theme"] [aria-pressed="true"]')].map((b) => b.dataset.valor);
  assert.deepStrictEqual(pulsados, ["source"]);
});

test("lo que cambia otro contexto (la ventana, Preferencias) se ve aqui", async () => {
  const m = await menu();
  m.ajeno({ haloPreference: "hidden", spectrumStyle: "bars" });
  await pulso();
  assert.strictEqual(m.interruptor("haloPreference").getAttribute("aria-checked"), "false");
  assert.strictEqual(m.segmento("spectrumStyle", "bars").getAttribute("aria-pressed"), "true");
});

test("CENSO: cada clave y cada valor del menu los entiende settings.js tal cual", async () => {
  /*
   * Una errata en el HTML («vinilo» en vez de «vinyl») escribiria algo que
   * la ventana tira al leer: el mando pareceria funcionar y no haria nada.
   * Se mira contra las reglas de verdad: la clave tiene que ser una
   * preferencia que se aplica, y Settings.normalize tiene que devolver el
   * valor sin cambiarlo.
   */
  const m = await menu();
  const S = m.win.YTMPip.Settings;
  const pares = [];
  m.doc.querySelectorAll('[role="switch"][data-clave]').forEach((el) => {
    pares.push([el.dataset.clave, el.dataset.si], [el.dataset.clave, el.dataset.no]);
  });
  m.doc.querySelectorAll(".ytmpip-popup-segmentos[data-clave]").forEach((g) => {
    g.querySelectorAll("[data-valor]").forEach((b) => pares.push([g.dataset.clave, b.dataset.valor]));
  });
  assert.ok(pares.length >= 19, "premisa: el menu tiene sus mandos (" + pares.length + ")");
  for (const [clave, valor] of pares) {
    assert.ok(S.seAplica(clave), "«" + clave + "» no es una preferencia que se aplique");
    assert.strictEqual(S.normalize({ [clave]: valor })[clave], valor, clave + "=" + valor + " no sobrevive al saneador");
  }
});

test("cada interruptor tiene nombre (aria-labelledby a un texto que existe)", async () => {
  const m = await menu();
  m.doc.querySelectorAll('[role="switch"]').forEach((el) => {
    const etiqueta = m.$(el.getAttribute("aria-labelledby"));
    assert.ok(etiqueta && etiqueta.textContent.trim(), "interruptor sin nombre: " + el.dataset.clave);
  });
});

test("TANDA AP: el icono de la extension abre ESTE menu", () => {
  /*
   * Lo destapo el autor al probar la 1.2.1: el menu con pestañas no salia
   * al pulsar el icono, porque desde la fase 0 el manifiesto no tenia
   * default_popup (el icono intentaba abrir la ventana y solo conseguia
   * hacer parpadear el boton de la pagina). Sin esta linea del manifiesto
   * todo lo de arriba se prueba en un menu al que no llega nadie.
   */
  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
  assert.strictEqual(manifiesto.action.default_popup, "src/popup/popup.html");
  assert.ok(fs.existsSync(path.join(RAIZ, manifiesto.action.default_popup)));
});
