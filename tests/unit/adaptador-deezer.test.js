/*
 * EL ADAPTADOR DE DEEZER (tanda AW), contra la fixture medida en vivo en la
 * cuenta del autor (tests/fixtures/deezer-sonando.html). Se fija lo medido:
 * el estado en el data-testid (no en el aria-label, que dice la accion
 * siguiente), el tiempo del range en segundos, los artistas separados como
 * se leen, y saltar con la secuencia de arrastrar (escribir el range solo,
 * o hacer un clic, no saltaba).
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

const URL = "https://www.deezer.com/es/channels/explore/";
const plano = (x) => JSON.parse(JSON.stringify(x));

function deezer() {
  return entornoContenido("deezer-sonando.html", { url: URL });
}

test("en www.deezer.com elige el adaptador de Deezer y declara lo que no puede", () => {
  const e = deezer();
  assert.strictEqual(e.YTMPip.Adaptadores.activo().id, "deezer");
  assert.deepStrictEqual(plano(e.YTMPip.Capacidades), {
    letras: false,
    cola: false,
    repetir: true,
    aleatorio: true,
    meGusta: true,
    medioEscribible: false,
    videoPrestable: false,
    audioGrafo: false
  });
});

test("el estado sale entero: titulo, artistas con su espacio, caratula, tiempos", () => {
  const s = deezer().YTMPip.MetadataReader.read();
  assert.strictEqual(s.siteName, "Deezer");
  assert.strictEqual(s.title, "BbY WOW");
  assert.strictEqual(s.artist, "KAROL G, Judeline, Rusowsky", "los artistas salen pegados por comas");
  assert.strictEqual(s.artworkUrl, "https://cdn-images.dzcdn.net/images/cover/f794dd1931dac42fc13f938850b686c6/500x500.jpg");
  assert.strictEqual(s.currentTime, 3);
  assert.strictEqual(s.duration, 30, "sin Premium, 30 segundos: se lee tal cual");
  assert.strictEqual(s.playing, true);
  assert.strictEqual(s.repeatMode, "NONE");
  assert.strictEqual(s.shuffleOn, false);
  assert.strictEqual(s.likeStatus, "INDIFFERENT");
});

test("el estado se lee del testid, no del aria-label (que dice la accion siguiente)", () => {
  const e = deezer();
  const A = e.YTMPip.Adapter;
  const d = e.win.document;
  const repetir = d.querySelector("[data-testid^='repeat_button']");
  // Lo medido: con «all» el aria-label ya dice «Repetir esta canción».
  repetir.setAttribute("data-testid", "repeat_button_all");
  repetir.setAttribute("aria-label", "Repetir esta canción");
  assert.strictEqual(A.getRepeatMode(), "ALL");
  repetir.setAttribute("data-testid", "repeat_button_single");
  repetir.setAttribute("aria-label", "Repetición desactivada");
  assert.strictEqual(A.getRepeatMode(), "ONE");
  d.querySelector("[data-testid^='shuffle_play_button']").setAttribute("data-testid", "shuffle_play_button_on");
  assert.strictEqual(e.YTMPip.MetadataReader.read().shuffleOn, true);
  d.querySelector("[data-testid^='play_button']").setAttribute("data-testid", "play_button_play");
  assert.strictEqual(e.YTMPip.MetadataReader.read().playing, false);
});

test("saltar hace la secuencia de arrastrar: pulsar, escribir el valor y soltar", () => {
  const e = deezer();
  const barra = e.win.document.querySelector("[data-testid='progress_bar']");
  barra.getBoundingClientRect = () => ({ left: 100, top: 10, width: 300, height: 12 });
  const pasos = [];
  for (const tipo of ["pointerdown", "mousedown", "input", "change", "pointerup", "mouseup"]) {
    barra.addEventListener(tipo, () => pasos.push(tipo + ":" + barra.value));
  }
  const A = e.YTMPip.Adapter;
  assert.strictEqual(A.seekPageTo(), true, "la sonda dice que hay donde saltar");
  assert.deepStrictEqual(pasos, [], "la sonda no toca nada");
  assert.strictEqual(A.seekPageTo(7), true);
  assert.deepStrictEqual(pasos, ["pointerdown:3", "mousedown:3", "input:7", "change:7", "pointerup:7", "mouseup:7"]);
});

test("el volumen no se ofrece: su deslizador solo existe con el panel abierto", () => {
  const A = deezer().YTMPip.Adapter;
  assert.strictEqual(A.setPageVolume(0.5), false);
});

test("sonando con la barra entera, la salud no echa nada en falta", () => {
  const s = deezer().YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, true);
  assert.deepStrictEqual(plano(s.faltan), []);
});
