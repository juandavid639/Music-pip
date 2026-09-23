/*
 * Pruebas del modo SOLO CARATULA (el boton "Aa").
 *
 * Peticion de uso: "que sea uno de solo ver caratula sin nombre ni
 * artista". Que el texto desaparezca y que la imagen ocupe su sitio es
 * cosa del CSS, y eso se mira en tools/vista-previa.html, no aqui. Lo que
 * se prueba es lo unico que decide JavaScript: cuando se pone la clase y
 * que esa decision no se mezcle con las otras dos que ya vivian en la
 * cabecera.
 *
 * Esa ultima parte es la que importa. La ventana tiene ya tres elecciones
 * independientes —que ocupa el escenario, si se ve el texto y si se ve el
 * espectro— y compartir un flag entre dos de ellas es exactamente el
 * atajo que en este proyecto ha salido caro cada vez.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

function ventana(opciones) {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
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

  return {
    win,
    doc,
    banco,
    Adapter: win.YTMPip.Adapter,
    PipView: win.YTMPip.PipView,
    raiz: doc.getElementById("ytmpip-root"),
    boton: doc.getElementById("ytmpip-clean-toggle")
  };
}

function conVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: true, lyrics: {} };
}

function sinVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

function soloLetra() {
  return Object.assign(sinVideo(), {
    lyrics: { status: "available", source: "Better Lyrics", lines: [{ text: "una linea", time: 1 }] }
  });
}

test("el boton se ofrece siempre: no depende de lo que traiga la cancion", () => {
  /*
   * A diferencia del de video y el del espectro, este no puede quedarse
   * sin nada que hacer: titulo y artista estan en todas las canciones,
   * aunque sea para decir "Sin reproducción".
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.boton.title, "Sólo carátula");
});

test("EL CASO PEDIDO: pulsar quita el texto y lo anuncia", () => {
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  assert.strictEqual(v.raiz.classList.contains("ytmpip-sin-texto"), false, "premisa");

  v.banco.pulsarSoloCaratula();

  assert.strictEqual(v.raiz.classList.contains("ytmpip-sin-texto"), true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.boton.title, "Ver el título y el artista");
});

test("volver a pulsar devuelve el texto", () => {
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarSoloCaratula();
  v.banco.pulsarSoloCaratula();

  assert.strictEqual(v.raiz.classList.contains("ytmpip-sin-texto"), false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("la eleccion aguanta el cambio de cancion", () => {
  /*
   * Si se reiniciara con cada pista habria que volver a pulsar cada tres
   * minutos, que es tanto como no tener el modo.
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarSoloCaratula();

  v.PipView.onStateUpdate(Object.assign(sinVideo(), { title: "otra" }));

  assert.strictEqual(v.banco.pideSoloCaratula(), true);
  assert.strictEqual(v.raiz.classList.contains("ytmpip-sin-texto"), true);
});

test("quitar el texto NO toca lo que ocupa el escenario, y al reves", () => {
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarSoloCaratula();

  assert.strictEqual(v.banco.pideSoloCaratula(), true);
  assert.strictEqual(v.banco.pideCover(), false, "quitar el texto se llevo por delante el video");

  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.pideCover(), true);
  assert.strictEqual(v.banco.pideSoloCaratula(), true, "apartar el video devolvio el texto");
});

test("con la letra en grande el texto tambien se quita: el boton dice lo que hace", () => {
  /*
   * Aqui cabia una excepcion ("con la letra en grande, deja el titulo") y
   * se descarto a proposito. El boton promete quitar el titulo y el
   * artista; hacerlo a veces si y a veces no obligaria a explicar cuando,
   * y nadie ha pedido esa combinacion.
   */
  const v = ventana();
  v.PipView.onStateUpdate(soloLetra());
  v.banco.pulsarAlternarVideo(); // letra en grande

  v.banco.pulsarSoloCaratula();

  assert.strictEqual(v.raiz.classList.contains("ytmpip-lyrics-stage"), true, "premisa");
  assert.strictEqual(v.raiz.classList.contains("ytmpip-sin-texto"), true);
});
