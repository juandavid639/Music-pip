/*
 * EL MODO CINE (tanda BA), en la ventana montada: el boton, la clase que
 * quita las filas de abajo y el superpuesto. La decision pura (layoutFor)
 * se fija en pip-density.
 *
 * El reporte del autor, con captura: «cuando tenemos la pestaña abierta y
 * quiero ponerla más grande, digamos que quiero ver el video más grande,
 * pierdo mucho espacio en la interfaz».
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

function ventana() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
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
  // Una ventana grande, como la de la captura (1066x772).
  Object.defineProperty(win, "innerWidth", { value: 1066, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: 772, configurable: true });
  return { win, doc, banco, raiz: doc.getElementById("ytmpip-root"), boton: doc.getElementById("ytmpip-cinema-toggle") };
}

const conVideo = () => ({ connected: true, playing: true, title: "x", artist: "y", hasVideo: true, lyrics: {} });
const sinVideo = () => ({ connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} });

function pintar(v, estado) {
  v.banco.syncVideoMode(estado);
  v.win.YTMPip.PipView.onStateUpdate(estado);
}

test("el boton solo aparece con video", () => {
  const v = ventana();
  pintar(v, sinVideo());
  assert.strictEqual(v.boton.hidden, true, "sin video no hay nada que ver en grande");
  pintar(v, conVideo());
  assert.strictEqual(v.boton.hidden, false);
});

test("TANDA BA: pulsarlo deja el video a ventana entera y quita las filas de abajo", () => {
  const v = ventana();
  pintar(v, conVideo());
  assert.ok(!v.raiz.classList.contains("ytmpip-overlay"), "premisa: en grande y sin cine, no se superpone");

  v.boton.click();
  assert.ok(v.raiz.classList.contains("ytmpip-overlay"), "el video pasa a ocupar la ventana");
  assert.ok(v.raiz.classList.contains("ytmpip-cine"), "y se van volumen, Letras, Siguientes y Volver");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");

  v.boton.click();
  assert.ok(!v.raiz.classList.contains("ytmpip-overlay"));
  assert.ok(!v.raiz.classList.contains("ytmpip-cine"));
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("si la cancion deja de traer video, el cine se apaga solo (sin quedarse a medias)", () => {
  const v = ventana();
  pintar(v, conVideo());
  v.boton.click();
  pintar(v, sinVideo());
  assert.ok(!v.raiz.classList.contains("ytmpip-cine"));
  assert.ok(!v.raiz.classList.contains("ytmpip-overlay"));
  assert.strictEqual(v.boton.hidden, true);
});

test("la hoja quita las filas de abajo en cine, y solo en cine", () => {
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const regla = css.match(/#ytmpip-root\.ytmpip-cine \.ytmpip-extras,\s*#ytmpip-root\.ytmpip-cine \.ytmpip-secondary-actions\s*\{\s*display:\s*none;/);
  assert.ok(regla, "falta la regla del modo cine");
});

test("en una ventana pequeña con video se superpone, pero eso NO es el modo cine", () => {
  // El superpuesto por falta de sitio ya existia y conserva sus filas: la
  // clase de cine solo la pone el boton.
  const v = ventana();
  Object.defineProperty(v.win, "innerWidth", { value: 340, configurable: true });
  Object.defineProperty(v.win, "innerHeight", { value: 202, configurable: true });
  pintar(v, conVideo());
  assert.ok(v.raiz.classList.contains("ytmpip-overlay"), "premisa: pequeña y con video, se superpone");
  assert.ok(!v.raiz.classList.contains("ytmpip-cine"));
});
