/*
 * EL MODULO COMPARTIDO DEL ESPECTRO (tanda AD): shared/formas-espectro.js.
 *
 * La geometria (barrasParaAncho, puntosDeOnda, rayosDelAnillo, matizRgb)
 * se prueba en pip-espectro.test.js, donde estaba; aqui se prueba lo que
 * nacio con la mudanza: la regla de que modos llevan un color por barra,
 * que ahora preguntan la ventana y la vista previa en el mismo sitio.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar } = require("../helpers/entorno.js");

function formas() {
  const { win } = crearEntorno(undefined);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/shared/formas-espectro.js"
  );
  return win.YTMPip.FormasEspectro;
}

test("colorDeBarraPara: el arcoiris y la paleta dan un color por barra", () => {
  const F = formas();
  const arcoiris = F.colorDeBarraPara("rgb", 0, 4);
  assert.match(arcoiris(0), /^hsl\(/);
  assert.notStrictEqual(arcoiris(0), arcoiris(3), "todas las barras del mismo tono");
  const paleta = F.colorDeBarraPara("#ff0000,#0000ff", 0, 4);
  assert.ok(paleta, "la paleta no se reconocio");
  assert.notStrictEqual(paleta(0), paleta(3));
});

test("...y los modos de UN color devuelven null: el color lo pone quien llama", () => {
  const F = formas();
  for (const modo of ["accent", "source", "#00ff88"]) {
    assert.strictEqual(F.colorDeBarraPara(modo, 0, 4), null, modo);
  }
});

test("pintar sin barras no dibuja nada (ni revienta)", () => {
  const F = formas();
  const ordenes = [];
  const ctx = new Proxy({}, { get: (_, orden) => (...args) => ordenes.push([orden, ...args]) });
  F.pintar(ctx, { barras: [], ancho: 100, alto: 50, escala: 1, forma: "bars" });
  assert.strictEqual(ordenes.length, 0);
});
