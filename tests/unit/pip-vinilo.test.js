/*
 * LA CARATULA EN DISCO DE VINILO (tanda AA).
 *
 * Casi todo es CSS, y el CSS no se puede ver en jsdom: se lee la hoja como
 * texto y se comprueban las DECISIONES que sostienen el comportamiento
 * (como hacen las pruebas de la tanda L). Lo que si es JavaScript —las dos
 * clases de la raiz— se prueba montando la ventana.
 *
 * Mirado a ojo en la vista previa: disco, agujero, borde, y 45° por segundo
 * (una vuelta cada 8 s). La primera mirada enseñó un cuadrado girando: la
 * regla de la ventana ampliada ganaba por orden con la misma especificidad.
 * La prueba de la especificidad de abajo existe por eso.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

const HOJA = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

function regla(selector) {
  const i = HOJA.indexOf(selector + " {");
  assert.notStrictEqual(i, -1, `falta la regla ${selector}`);
  return HOJA.slice(i, HOJA.indexOf("}", i));
}

/** Especificidad (ids, clases) de un selector sencillo como los de la hoja. */
function especificidad(selector) {
  const sinPseudo = selector.replace(/:not\(([^)]*)\)/g, " $1");
  return [(sinPseudo.match(/#[\w-]+/g) || []).length, (sinPseudo.match(/\.[\w-]+/g) || []).length];
}

async function ventana(guardado = {}) {
  const { win } = crearEntorno(undefined, { storage: guardado });
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
  await win.YTMPip.Settings.load();
  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);
  banco.aplicarPreferencias(win.YTMPip.Settings.get());
  return { win, doc, banco, PipView: win.YTMPip.PipView, raiz: doc.getElementById("ytmpip-root") };
}

const SONANDO = { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };

test("REGRESION TANDA AA: con el disco de vinilo elegido, la raiz lleva la clase", async () => {
  const v = await ventana({ coverStyle: "vinyl" });
  assert.strictEqual(v.raiz.classList.contains("ytmpip-vinilo"), true);
});

test("...y con la cuadrada (la de serie) no", async () => {
  const v = await ventana();
  assert.strictEqual(v.raiz.classList.contains("ytmpip-vinilo"), false);
});

test("la raiz dice si esta sonando, y deja de decirlo al pausar", async () => {
  const v = await ventana({ coverStyle: "vinyl" });
  v.PipView.onStateUpdate(SONANDO);
  assert.strictEqual(v.raiz.classList.contains("ytmpip-sonando"), true);
  v.PipView.onStateUpdate(Object.assign({}, SONANDO, { playing: false }));
  assert.strictEqual(v.raiz.classList.contains("ytmpip-sonando"), false);
});

test("EL GIRO ES `rotate` Y NO `transform`: si no, pisaria el latido de los graves", () => {
  const i = HOJA.indexOf("@keyframes ytmpip-girar");
  assert.notStrictEqual(i, -1, "falta la animacion del giro");
  const fotogramas = HOJA.slice(i, HOJA.indexOf("}\n}", i));
  assert.match(fotogramas, /rotate:\s*360deg/);
  assert.doesNotMatch(fotogramas, /transform/, "el giro con transform borra el scale del latido");
});

test("el disco gira solo mientras suena: parado de serie, en marcha con la clase de sonar", () => {
  const disco = regla("#ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork");
  assert.match(disco, /animation:\s*ytmpip-girar/);
  assert.match(disco, /animation-play-state:\s*paused/);
  assert.match(disco, /border-radius:\s*50%/);
  assert.match(disco, /mask-image:\s*radial-gradient/, "sin agujero no es un disco");
  const sonando = regla("#ytmpip-root.ytmpip-vinilo.ytmpip-sonando .ytmpip-stage .ytmpip-artwork");
  assert.match(sonando, /animation-play-state:\s*running/);
});

test("REGRESION TANDA AA: la regla del disco le gana a la de la ventana ampliada", () => {
  // Con la misma especificidad ganaba la ampliada (va despues en la hoja) y
  // el disco salia como un cuadrado de radio 10 px girando.
  const disco = especificidad("#ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork");
  const ampliada = especificidad("#ytmpip-root.expanded .ytmpip-artwork");
  assert.ok(
    disco[0] > ampliada[0] || (disco[0] === ampliada[0] && disco[1] > ampliada[1]),
    `disco ${disco} contra ampliada ${ampliada}`
  );
});

test("con menos movimiento pedido el disco no gira", () => {
  // Hay varios bloques de «menos movimiento» en la hoja: se busca el que
  // habla del disco, no el ultimo.
  const bloques = HOJA.split("@media (prefers-reduced-motion: reduce) {")
    .slice(1)
    .map((b) => b.slice(0, b.indexOf("\n}\n")));
  const delDisco = bloques.find((b) => b.includes("#ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork"));
  assert.ok(delDisco, "ningun bloque de menos movimiento para el disco");
  assert.match(delDisco, /animation:\s*none/);
});
