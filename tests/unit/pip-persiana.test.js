/*
 * LA PERSIANA DE LA LETRA (tanda BD).
 *
 * El reporte del autor, con captura: «con la interfaz donde iniciar la letra
 * se queda muy pequeño y el espacio de arriba queda sobrando… que sea
 * ajustable desde donde inicia la letra… un arrastrable de la linea para
 * definir el campo de la letra». El tirador del borde de arriba del panel
 * fija la fraccion de la ventana que es letra; la caratula se encoge y la
 * fila de extras se aparta.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, plano, RAIZ } = require("../helpers/entorno.js");

function ventana(storage = {}) {
  const escrituras = [];
  const { win } = crearEntorno(undefined, { storage });
  win.chrome.storage.local.set = (valores) => {
    escrituras.push(valores);
    return Promise.resolve();
  };
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
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);
  // Una ventana de 800 de alto, para que las cuentas sean redondas.
  Object.defineProperty(win, "innerHeight", { value: 800, configurable: true });
  return {
    win,
    doc,
    escrituras,
    Settings: win.YTMPip.Settings,
    raiz: doc.getElementById("ytmpip-root"),
    tirador: doc.getElementById("ytmpip-persiana")
  };
}

function puntero(v, tipo, y) {
  v.tirador.dispatchEvent(new v.win.MouseEvent(tipo, { bubbles: true, cancelable: true, clientY: y }));
}

test("el tirador vive dentro del panel de la letra, y es un separador con nombre", () => {
  const v = ventana();
  assert.strictEqual(v.tirador.parentElement.id, "ytmpip-lyrics-panel");
  assert.strictEqual(v.tirador.getAttribute("role"), "separator");
  assert.ok(v.tirador.getAttribute("aria-label"));
});

test("TANDA BD: arrastrar fija lo que queda por debajo del puntero, y se anota al soltar", () => {
  const v = ventana();
  puntero(v, "pointerdown", 500);
  puntero(v, "pointermove", 320); // por debajo quedan 480 de 800: el 60 %
  assert.ok(v.raiz.classList.contains("ytmpip-letra-a-medida"));
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-alto-letra"), "60.0vh");
  assert.strictEqual(v.tirador.getAttribute("aria-valuenow"), "60");
  assert.deepStrictEqual(v.escrituras, [], "mientras se arrastra no se escribe nada");

  puntero(v, "pointerup", 320);
  assert.deepStrictEqual(plano(v.escrituras), [{ lyricsPanelShare: 0.6 }]);
  assert.strictEqual(v.Settings.get().lyricsPanelShare, 0.6);
});

test("sin pulsar, mover el raton por encima no mueve nada", () => {
  const v = ventana();
  puntero(v, "pointermove", 100);
  assert.ok(!v.raiz.classList.contains("ytmpip-letra-a-medida"));
});

test("los topes: ni menos de un quinto ni mas del 85 %", () => {
  const v = ventana();
  puntero(v, "pointerdown", 500);
  puntero(v, "pointermove", 10);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-alto-letra"), "85.0vh");
  puntero(v, "pointermove", 790);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-alto-letra"), "20.0vh");
});

test("doble clic: vuelve el alto de siempre, y se olvida", () => {
  const v = ventana();
  puntero(v, "pointerdown", 500);
  puntero(v, "pointermove", 320);
  puntero(v, "pointerup", 320);
  v.tirador.dispatchEvent(new v.win.MouseEvent("dblclick", { bubbles: true }));
  assert.ok(!v.raiz.classList.contains("ytmpip-letra-a-medida"));
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-alto-letra"), "");
  assert.deepStrictEqual(plano(v.escrituras.pop()), { lyricsPanelShare: null });
});

test("con el teclado: flecha arriba da mas letra, de 5 en 5", () => {
  const v = ventana({ lyricsPanelShare: 0.5 });
  return v.Settings.load().then(() => {
    v.tirador.dispatchEvent(new v.win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    assert.strictEqual(v.Settings.get().lyricsPanelShare, 0.55);
    assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-alto-letra"), "55.0vh");
  });
});

test("lo guardado se normaliza: basura se olvida, lo de fuera se acota", async () => {
  for (const [guardado, esperado] of [["hola", null], [-1, null], [2, 0.85], [0.1, 0.2], [0.333333, 0.333]]) {
    const v = ventana({ lyricsPanelShare: guardado });
    await v.Settings.load();
    assert.strictEqual(v.Settings.get().lyricsPanelShare, esperado, `guardado ${guardado}`);
  }
});

test("la hoja: el panel toma el alto pedido y la fila de extras se aparta", () => {
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  assert.match(css, /ytmpip-letra-a-medida \.ytmpip-lyrics-panel:not\(\[hidden\]\) \{\s*flex: 0 0 var\(--ytmpip-alto-letra\);/);
  assert.match(css, /ytmpip-letra-a-medida:not\(\.ytmpip-lyrics-stage\) \.ytmpip-extras \{\s*display: none;/);
  assert.match(css, /\.ytmpip-persiana \{[^}]*position: sticky;/);
});
