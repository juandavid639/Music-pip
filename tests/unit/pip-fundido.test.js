/*
 * EL FUNDIDO ENTRE CARATULAS (tanda AB).
 *
 * Al cambiar de cancion, la portada vieja se queda encima como una copia
 * («saliente») y se desvanece cuando la nueva ya se puede pintar. Comprobado
 * en Chrome con el pip.js real (pagina temporal, borrada): copia con la
 * vieja, desvanecido tras decode(), fuera al medio segundo; y el fondo
 * difuminado ya se fundia solo (Chrome lanza la transicion de
 * background-image que la hoja declaraba).
 *
 * jsdom no carga imagenes ni tiene decode(): el codigo trata «sin decode»
 * como «lista ya», que es justo lo que deja probar el reparto de la copia.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

const HOJA = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

function ventana({ menosMovimiento = false } = {}) {
  const { win } = crearEntorno(undefined);
  win.matchMedia = (consulta) => ({ matches: consulta.includes("reduced-motion") ? menosMovimiento : false, addEventListener() {} });
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
  const img = doc.getElementById("ytmpip-artwork");
  return {
    win,
    doc,
    img,
    cambiar: (url) => banco.cambiarCaratula(url),
    copias: () => [...doc.querySelectorAll(".ytmpip-saliente")],
    tic: () => new Promise((r) => setTimeout(r, 0))
  };
}

const UNA = "https://ejemplo/una.jpg";
const OTRA = "https://ejemplo/otra.jpg";

test("la primera portada no funde: no hay nada de lo que venir", () => {
  const v = ventana();
  v.cambiar(UNA);
  assert.strictEqual(v.img.getAttribute("src"), UNA);
  assert.strictEqual(v.copias().length, 0);
});

test("REGRESION TANDA AB: al cambiar de portada, la vieja se queda encima como copia", () => {
  const v = ventana();
  v.cambiar(UNA);
  v.cambiar(OTRA);
  const [copia] = v.copias();
  assert.ok(copia, "sin copia el cambio es de golpe");
  assert.strictEqual(copia.getAttribute("src"), UNA, "la copia es la portada VIEJA");
  assert.strictEqual(v.img.getAttribute("src"), OTRA, "y la de verdad ya es la nueva");
  assert.strictEqual(copia.previousElementSibling, v.img, "encima de la nueva, en el mismo escenario");
  assert.strictEqual(copia.hasAttribute("id"), false, "dos elementos con el mismo id");
  assert.strictEqual(copia.getAttribute("aria-hidden"), "true", "el lector leeria dos portadas");
  assert.strictEqual(copia.style.animation, "none", "con el vinilo la copia giraria desde cero");
});

test("REGRESION TANDA AB: la MISMA portada no crea copia (render la reasigna cuatro veces por segundo)", () => {
  const v = ventana();
  v.cambiar(UNA);
  for (let i = 0; i < 5; i++) v.cambiar(UNA);
  assert.strictEqual(v.copias().length, 0);
});

test("cuando la nueva esta lista la copia se desvanece, y al medio segundo se va", async () => {
  const v = ventana();
  v.cambiar(UNA);
  v.cambiar(OTRA);
  await v.tic();
  const [copia] = v.copias();
  assert.strictEqual(copia.classList.contains("ytmpip-desvaneciendo"), true);
  await new Promise((r) => setTimeout(r, 560));
  assert.strictEqual(v.copias().length, 0, "la copia se quedo para siempre");
});

test("dos cambios seguidos dejan UNA copia, la de la ultima vieja", () => {
  const v = ventana();
  v.cambiar(UNA);
  v.cambiar(OTRA);
  v.cambiar("https://ejemplo/tercera.jpg");
  const copias = v.copias();
  assert.strictEqual(copias.length, 1);
  assert.strictEqual(copias[0].getAttribute("src"), OTRA);
});

test("con menos movimiento pedido no hay fundido, solo el cambio", () => {
  const v = ventana({ menosMovimiento: true });
  v.cambiar(UNA);
  v.cambiar(OTRA);
  assert.strictEqual(v.img.getAttribute("src"), OTRA);
  assert.strictEqual(v.copias().length, 0);
});

test("la hoja pone la copia encima, en el mismo sitio, y la desvanece con transicion", () => {
  const i = HOJA.indexOf(".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente {");
  assert.notStrictEqual(i, -1);
  const regla = HOJA.slice(i, HOJA.indexOf("}", i));
  assert.match(regla, /position:\s*absolute/);
  assert.match(regla, /inset:\s*0/);
  assert.match(regla, /transition:\s*opacity/);
  const j = HOJA.indexOf(".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente.ytmpip-desvaneciendo {");
  assert.notStrictEqual(j, -1);
  assert.match(HOJA.slice(j, HOJA.indexOf("}", j)), /opacity:\s*0/);
});
