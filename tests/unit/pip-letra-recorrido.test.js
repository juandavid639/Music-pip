/*
 * LA LETRA A LA PAR DE BETTER LYRICS Y SU RECORRIDO (tandas BB y BC).
 *
 * El reporte del autor, con captura: «tenemos un poco atrasada la
 * visualizacion de la letra… en vivo va una linea adelante y nosotros no
 * hemos pasado a esa linea». Y despues: la letra que sigue un poco mas
 * oscura, y el recorrido de la linea que suena, «puede ser un detalle
 * ganador».
 *
 * El atraso tenia dos causas. La grande (el reloj de la pagina en segundos
 * enteros) vive en track-timeline.test.js. La pequeña es esta: Better
 * Lyrics enciende cada linea 0,115 s antes de su tiempo.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, entornoContenido, RAIZ } = require("../helpers/entorno.js");

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
  win.Element.prototype.scrollTo = function () {};
  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);
  const media = win.YTMPip.Adapter.getPageMediaElement();
  return {
    win,
    doc,
    banco,
    PipView: win.YTMPip.PipView,
    enElSegundo(s) {
      conTiempos(media, s, 300);
      banco.latidoDeLetra();
    },
    parrafos: () => [...doc.getElementById("ytmpip-lyrics-lines").children]
  };
}

const LINEAS = [
  { text: "Primera linea", time: 10, duration: 4, palabras: null },
  // Una palabra corta y una larga: el recorrido va por letras.
  { text: "Hola despacito", time: 14, duration: 3, palabras: [[4, 14, 0.5], [8, 14.5, 2]] },
  { text: "Tercera", time: 18, duration: null, palabras: null }
];

function conLetra(v) {
  v.PipView.onStateUpdate({
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    lyrics: { status: "available", source: "Better Lyrics", lines: LINEAS }
  });
}

const activas = (v) => v.parrafos().map((p, i) => (p.classList.contains("ytmpip-lyric-active") ? i : -1)).filter((i) => i >= 0);

test("TANDA BB: la linea se enciende con el mismo adelanto que Better Lyrics (0,115 s)", () => {
  const v = ventana();
  conLetra(v);
  v.enElSegundo(13.9);
  assert.deepStrictEqual(activas(v), [1], "a 0,1 s de su tiempo, Better Lyrics ya la tiene encendida");
  v.enElSegundo(13.8);
  assert.deepStrictEqual(activas(v), [0], "un cuarto de segundo antes, todavia no");
});

test("TANDA BC: la linea que suena lleva el recorrido, por letras de sus palabras", () => {
  const v = ventana();
  conLetra(v);
  v.enElSegundo(15.0);
  const [, segunda] = v.parrafos();
  assert.ok(segunda.classList.contains("ytmpip-lyric-recorrido"));
  // t = 15,115: «Hola» (4) cantada entera y «despacito» (8) en 0,615/2.
  const esperado = ((4 + 8 * (0.615 / 2)) / 12) * 100;
  const avance = parseFloat(segunda.querySelector(".ytmpip-lyric-texto").style.getPropertyValue("--ytmpip-avance"));
  assert.ok(Math.abs(avance - esperado) < 0.2, `avance ${avance}, esperado ${esperado.toFixed(1)}`);
});

test("al pasar de linea, la anterior suelta el recorrido", () => {
  const v = ventana();
  conLetra(v);
  v.enElSegundo(15.0);
  v.enElSegundo(19.0);
  const [, segunda, tercera] = v.parrafos();
  assert.ok(!segunda.classList.contains("ytmpip-lyric-recorrido"));
  assert.strictEqual(segunda.querySelector(".ytmpip-lyric-texto").style.getPropertyValue("--ytmpip-avance"), "");
  assert.ok(tercera.classList.contains("ytmpip-lyric-recorrido"));
});

test("el texto de la linea sigue entero dentro del <span> (la linea en vivo y las proximas lo leen)", () => {
  const v = ventana();
  conLetra(v);
  assert.deepStrictEqual(v.parrafos().map((p) => p.textContent), LINEAS.map((l) => l.text));
});

test("avanceDeLinea: sin palabras reparte la duracion, y sin duracion hasta la siguiente", () => {
  const { avanceDeLinea } = ventana().PipView;
  assert.strictEqual(avanceDeLinea(LINEAS[0], 9, 14), 0, "antes de empezar, nada");
  assert.strictEqual(avanceDeLinea(LINEAS[0], 11, 14), 0.25, "1 s de 4");
  assert.strictEqual(avanceDeLinea(LINEAS[0], 20, 14), 1, "acabada, entera");
  assert.strictEqual(avanceDeLinea(LINEAS[2], 19, 22), 0.25, "sin duracion: hasta la siguiente (1 de 4)");
  assert.strictEqual(avanceDeLinea(LINEAS[2], 19, null), 1, "sin nada con que medir, entera: mejor que congelada a medias");
});

test("avanceDeLinea: con palabras se para en la larga y corre en la corta", () => {
  const { avanceDeLinea } = ventana().PipView;
  const linea = LINEAS[1];
  assert.strictEqual(avanceDeLinea(linea, 14.25, null), (4 * 0.5) / 12, "a media «Hola»");
  assert.strictEqual(avanceDeLinea(linea, 14.5, null), 4 / 12, "«Hola» entera, «despacito» sin empezar");
  assert.strictEqual(avanceDeLinea(linea, 15.5, null), (4 + 4) / 12, "a media «despacito»");
});

test("la hoja: lo que viene mas apagado, y el recorrido con la variable", () => {
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  assert.match(css, /\.ytmpip-lyric-active ~ \.ytmpip-lyric-line \{\s*opacity: 0\.6;/);
  assert.match(css, /ytmpip-lyrics-stage \.ytmpip-lyric-active ~ \.ytmpip-lyric-line \{\s*opacity: 0\.35;/);
  assert.match(css, /\.ytmpip-lyric-recorrido \.ytmpip-lyric-texto \{[^}]*var\(--ytmpip-avance/);
  assert.match(css, /\.ytmpip-lyric-recorrido \.ytmpip-lyric-texto \{[^}]*background-clip: text;/);
});

test("el lector: cada linea de Better Lyrics trae su duracion, y las palabras sus tiempos", () => {
  const e = entornoContenido("letras-better-lyrics.html");
  const sinDuraciones = e.YTMPip.LyricsReader.read().lines[0];
  assert.strictEqual(sinDuraciones.duration, 3.2);
  assert.strictEqual(sinDuraciones.palabras, null, "palabras sin data-duration: la ventana reparte la linea entera");

  const linea = e.win.document.querySelector(".blyrics--line");
  linea.querySelectorAll(".blyrics--word").forEach((w) => w.setAttribute("data-duration", "0.3"));
  const conPalabras = e.YTMPip.LyricsReader.read().lines[0];
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(conPalabras.palabras)),
    [[7, 12.4, 0.3], [4, 12.9, 0.3], [3, 13.1, 0.3], [6, 13.4, 0.3], [7, 13.8, 0.3]],
    "«(tonight)», el coro de fondo, no cuenta: no esta en el texto de la linea"
  );
});
