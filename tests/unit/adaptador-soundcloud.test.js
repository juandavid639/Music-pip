/*
 * EL ADAPTADOR DE SOUNDCLOUD (tanda AV), contra la fixture medida en vivo
 * (tests/fixtures/soundcloud-sonando.html). Lo que se fija aqui es lo que
 * se midio, no lo que se supone: ni <audio> ni <video> en el DOM, «playing»
 * en el boton, el titulo limpio en el span[aria-hidden], la caratula de 50
 * pedida a 500, el tiempo en segundos en la barra de progreso, las clases de
 * repetir y aleatorio, y saltar escribiendo un clic en la barra.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

const URL = "https://soundcloud.com/forss/flickermood";

function soundcloud() {
  return entornoContenido("soundcloud-sonando.html", { url: URL });
}

const plano = (x) => JSON.parse(JSON.stringify(x));

test("en soundcloud.com elige el adaptador de SoundCloud y declara lo que no puede", () => {
  const e = soundcloud();
  const activo = e.YTMPip.Adaptadores.activo();
  assert.strictEqual(activo.id, "soundcloud");
  assert.strictEqual(activo.nombre, "SoundCloud");
  assert.deepStrictEqual(plano(e.YTMPip.Capacidades), {
    letras: false,
    cola: false,
    repetir: true,
    aleatorio: true,
    meGusta: false,
    medioEscribible: false,
    videoPrestable: false,
    audioGrafo: false
  });
});

test("el estado sale entero de la barra: titulo limpio, artista, caratula grande y tiempos", () => {
  const e = soundcloud();
  const s = e.YTMPip.MetadataReader.read();
  assert.strictEqual(s.siteName, "SoundCloud");
  assert.strictEqual(s.title, "Flickermood", "se colo la frase para lectores de pantalla");
  assert.strictEqual(s.artist, "Forss");
  assert.strictEqual(s.artworkUrl, "https://i1.sndcdn.com/artworks-000067273316-smsiqx-t500x500.jpg");
  assert.strictEqual(s.currentTime, 10);
  assert.strictEqual(s.duration, 213);
  assert.strictEqual(s.playing, true);
  assert.strictEqual(s.repeatMode, "NONE");
  assert.strictEqual(s.shuffleOn, false);
  assert.strictEqual(s.likeStatus, undefined, "me gusta exige cuenta: no se sabe");
  assert.deepStrictEqual(plano(s.upNext), []);
});

test("en pausa (sin «playing») dice que no suena", () => {
  const e = soundcloud();
  e.win.document.querySelector(".playControls__play").classList.remove("playing");
  assert.strictEqual(e.YTMPip.MetadataReader.read().playing, false);
});

test("repetir lee las tres posiciones y aleatorio su clase", () => {
  const e = soundcloud();
  const A = e.YTMPip.Adapter;
  const repetir = e.win.document.querySelector(".repeatControl");
  repetir.classList.add("m-one");
  assert.strictEqual(A.getRepeatMode(), "ONE");
  repetir.classList.replace("m-one", "m-all");
  assert.strictEqual(A.getRepeatMode(), "ALL");
  repetir.classList.replace("m-all", "m-none");
  assert.strictEqual(A.getRepeatMode(), "NONE");
  const aleatorio = e.win.document.querySelector(".shuffleControl");
  aleatorio.classList.add("m-shuffling");
  assert.strictEqual(A.isToggleActive(aleatorio), true);
});

test("saltar escribe un clic en la barra, en la fraccion que toca (lo medido en vivo)", () => {
  const e = soundcloud();
  const A = e.YTMPip.Adapter;
  const barra = e.win.document.querySelector(".playbackTimeline__progressWrapper");
  barra.getBoundingClientRect = () => ({ left: 100, top: 10, width: 500, height: 20 });
  const eventos = [];
  for (const tipo of ["mousedown", "mouseup", "click"]) {
    barra.addEventListener(tipo, (ev) => eventos.push([ev.type, ev.clientX]));
  }
  assert.strictEqual(A.seekPageTo(), true, "la sonda dice que hay donde saltar");
  assert.deepStrictEqual(eventos, [], "la sonda no toca nada");
  // A un CUARTO y no a la mitad: un salto que siempre cayera en medio
  // pasaria con la mitad.
  assert.strictEqual(A.seekPageTo(53.25), true);
  assert.deepStrictEqual(eventos, [
    ["mousedown", 225],
    ["mouseup", 225],
    ["click", 225]
  ]);
});

test("el volumen no se ofrece: el deslizador de SoundCloud solo existe con el raton encima", () => {
  const A = soundcloud().YTMPip.Adapter;
  assert.strictEqual(A.setPageVolume(0.5), false);
  assert.strictEqual(A.getPageVolume(), null);
});

test("sonando con la barra entera, la salud no echa nada en falta", () => {
  const e = soundcloud();
  const s = e.YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, true);
  assert.deepStrictEqual(plano(s.faltan), []);
});
