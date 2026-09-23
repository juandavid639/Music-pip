/*
 * Pruebas del ADELANTO de la letra: las lineas que vienen despues de la
 * que suena, bajo el titulo, apagadas y sin negrita.
 *
 * Peticion de uso: "puede mostrar que viene despues". Lo unico que hay que
 * decidir aqui es CUALES, y por eso es lo unico que se prueba. El "cuantas
 * caben" no se prueba: vive en el CSS de densidad, junto a las reglas que
 * ya esconden el album, los extras y las acciones, y comprobarlo desde
 * JavaScript significaria escribir esos umbrales por segunda vez.
 *
 * La trampa concreta son los separadores de estrofa: en la letra vienen
 * como lineas en blanco, y de adelanto no dicen absolutamente nada.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

function ventana() {
  const { win } = crearEntorno();
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

  // jsdom no implementa scrollIntoView, y resaltar una linea lo llama para
  // centrarla. Aqui no se mide el desplazamiento, solo que no reviente.
  win.Element.prototype.scrollIntoView = function () {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return { win, doc, banco, PipView: win.YTMPip.PipView };
}

/* Una letra con separador de estrofa en medio, como las de verdad. */
function conLetra(lines) {
  return {
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    lyrics: { status: "available", lines, source: "Better Lyrics" }
  };
}

const LINEAS = [
  { text: "Sorry, don't want you to visit, no", time: 10 },
  { text: "", time: 13 },
  { text: "I've been on my own since the day that I was born", time: 14 },
  { text: "And I don't need anybody, no", time: 18 },
  { text: "Tell me why you keep on calling me at night", time: 22 },
  { text: "Last one", time: 26 }
];

function preparada(lines) {
  const v = ventana();
  v.PipView.onStateUpdate(conLetra(lines || LINEAS));
  /*
   * El array sale de dentro de jsdom, asi que su prototipo es el Array de
   * ESA ventana y no el de Node. deepStrictEqual compara prototipos y
   * fallaria con los dos arrays identicos en pantalla, que es de las cosas
   * mas desconcertantes que le pueden pasar a alguien leyendo el error.
   */
  v.proximas = (i) => [...v.banco.proximasLineas(i)];
  return v;
}

/*
 * La linea en vivo solo sale cuando el panel completo NO se ve, que en la
 * ventana real es cosa del CSS de densidad. Aqui no hay hoja de estilos, y
 * ademas el modo karaoke abre el panel solo, asi que hay que cerrarlo a
 * mano para reproducir la ventana pequeña. Sin esto la premisa de las dos
 * pruebas de abajo seria falsa y pasarian sin comprobar nada.
 */
function conElPanelCerrado(v) {
  v.doc.getElementById("ytmpip-lyrics-panel").hidden = true;
  v.banco.fijarLineaActiva(0);
  v.banco.refrescarLineaEnVivo();
  return v;
}

test("el adelanto es lo que viene DESPUES de la que suena", () => {
  const v = preparada();

  assert.deepStrictEqual(v.proximas(0), [
    "I've been on my own since the day that I was born",
    "And I don't need anybody, no",
    "Tell me why you keep on calling me at night"
  ]);
});

test("los separadores de estrofa no se cuelan como adelanto", () => {
  /*
   * La linea 1 esta en blanco. Si se enseñara, el usuario veria un hueco
   * donde esperaba la frase siguiente: el adelanto responde a "que frase
   * viene", no a "cuanto falta para la siguiente estrofa".
   */
  const v = preparada();
  const proximas = v.proximas(0);

  assert.ok(!proximas.includes(""), "se colo la linea en blanco");
  assert.ok(!proximas.includes("\u00A0"), "se colo el espacio duro con el que se pinta el separador");
});

test("cerca del final se enseñan las que quedan y ninguna mas", () => {
  // Sin este corte se leerian posiciones fuera del array y el adelanto
  // acabaria con huecos vacios al terminar la cancion.
  const v = preparada();

  assert.deepStrictEqual(v.proximas(4), ["Last one"]);
  assert.deepStrictEqual(v.proximas(5), []);
});

test("nunca se preparan mas de tres", () => {
  // Tres es el tope de pip.js; el CSS recorta despues por altura. Si aqui
  // se colara una cuarta, en la ventana mas alta apareceria una linea que
  // ninguna regla de densidad sabe esconder.
  const largo = Array.from({ length: 20 }, (_, i) => ({ text: "linea " + i, time: i }));
  const v = preparada(largo);

  assert.strictEqual(v.proximas(0).length, 3);
});

test("la linea que suena y su adelanto aparecen y desaparecen juntos", () => {
  /*
   * Que se separen es el fallo caro: un adelanto suelto, sin la frase
   * actual encima, es letra sin contexto en mitad de la ventana. Por eso
   * hay una sola funcion que los esconde y esta prueba mira el DOM, no la
   * variable.
   */
  const v = conElPanelCerrado(preparada());
  const linea = v.doc.getElementById("ytmpip-now-line");
  const adelanto = v.doc.getElementById("ytmpip-next-lines");

  assert.strictEqual(linea.hidden, false, "premisa: la linea que suena esta a la vista");
  assert.strictEqual(adelanto.hidden, false);
  assert.ok(adelanto.children.length > 0, "premisa: el adelanto tiene lineas");

  // Sin letra la ventana vuelve a ser solo portada: las dos se van.
  v.PipView.onStateUpdate({ connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} });

  assert.strictEqual(linea.hidden, true);
  assert.strictEqual(adelanto.hidden, true, "el adelanto se quedo solo en pantalla");
});

test("repintar con la misma letra no reconstruye los parrafos", () => {
  /*
   * updateNowLine corre en cada latido, varias veces por segundo. Si cada
   * pasada rehiciera los <p>, la letra parpadearia. La firma es lo que lo
   * evita, asi que se comprueba que los nodos son los MISMOS objetos.
   */
  const v = conElPanelCerrado(preparada());

  const antes = [...v.doc.getElementById("ytmpip-next-lines").children];
  assert.ok(antes.length > 0, "premisa: hay parrafos que rehacer");
  v.banco.refrescarLineaEnVivo();
  v.banco.refrescarLineaEnVivo();
  const despues = [...v.doc.getElementById("ytmpip-next-lines").children];

  /*
   * Uno a uno con === y no con deepStrictEqual sobre las dos listas: dos
   * <p> recien creados con el mismo texto son estructuralmente iguales, asi
   * que la comparacion profunda los daba por buenos y la prueba pasaba con
   * los parrafos rehechos en cada latido, que es justo lo que vigila.
   */
  assert.strictEqual(despues.length, antes.length);
  for (let i = 0; i < antes.length; i++) {
    assert.ok(despues[i] === antes[i], "se rehizo el parrafo " + i + ": la letra parpadearia");
  }
});
