/*
 * EL ADAPTADOR DE APPLE MUSIC (tanda AY), contra la fixture medida en vivo
 * sin cuenta (tests/fixtures/applemusic-sonando.html). Se fija lo medido:
 * el medio es el <audio> y NUNCA el <video> de la caratula animada, la linea
 * «Artista — Album» repetida de la marquesina, la caratula pedida grande,
 * nada de Web Audio (el avance es de otro origen sin CORS; la puerta del
 * espectro se prueba en espectro-y-grafo) y que, en
 * avances, la falta de «siguiente» no es un cambio del sitio.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

const URL = "https://music.apple.com/es/album/canciones-de-prueba/1";
const plano = (x) => JSON.parse(JSON.stringify(x));

// jsdom no reproduce: el <audio> se pone «sonando» a mano, en el segundo 12
// de un avance de 90.
function apple({ sonando = true } = {}) {
  const e = entornoContenido("applemusic-sonando.html", { url: URL });
  const audio = e.win.document.querySelector("audio");
  Object.defineProperty(audio, "paused", { configurable: true, get: () => !sonando });
  Object.defineProperty(audio, "duration", { configurable: true, get: () => 90 });
  audio.currentTime = 12;
  return e;
}

test("en music.apple.com elige el adaptador de Apple Music y declara lo que no puede", () => {
  const e = apple();
  assert.strictEqual(e.YTMPip.Adaptadores.activo().id, "apple-music");
  assert.deepStrictEqual(plano(e.YTMPip.Capacidades), {
    letras: false,
    cola: false,
    repetir: false,
    aleatorio: false,
    meGusta: false,
    medioEscribible: true,
    videoPrestable: false,
    audioGrafo: false
  });
});

test("el medio es el <audio>, nunca el <video> de la caratula animada", () => {
  const e = apple();
  const A = e.YTMPip.Adapter;
  assert.strictEqual(A.getMediaElement().tagName, "AUDIO");
  assert.strictEqual(A.getPageMediaElement().tagName, "AUDIO");
});

test("el estado sale entero: titulo sin repetir, artista y album, caratula grande, tiempos", () => {
  const s = apple().YTMPip.MetadataReader.read();
  assert.strictEqual(s.siteName, "Apple Music");
  assert.strictEqual(s.title, "Luz de madrugada", "la marquesina repite el texto: se toma uno");
  assert.strictEqual(s.artist, "Los Ejemplos");
  assert.strictEqual(s.album, "Canciones de prueba");
  assert.strictEqual(
    s.artworkUrl,
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/aa/bb/cc/cancion.jpg/600x600bb.jpg"
  );
  assert.strictEqual(s.currentTime, 12);
  assert.strictEqual(s.duration, 90);
  assert.strictEqual(s.playing, true);
});

test("reproducir/pausar es el boton VISIBLE de los dos que hay siempre", () => {
  const e = apple();
  const d = e.win.document;
  const A = e.YTMPip.Adapter;
  assert.ok(A.getPlayPauseButton().classList.contains("playback-play__pause"), "sonando: el de pausa");
  d.querySelector(".playback-play__pause").setAttribute("aria-hidden", "true");
  d.querySelector(".playback-play__play").removeAttribute("aria-hidden");
  assert.ok(A.getPlayPauseButton().classList.contains("playback-play__play"), "en pausa: el de reproducir");
});

test("la caratula sale del srcset, no del 1x1.gif del <img>", () => {
  const e = apple();
  e.win.document.querySelector("[data-testid='player-lcd-artwork'] source").remove();
  assert.strictEqual(e.YTMPip.MetadataReader.read().artworkUrl || null, null, "sin srcset, el gif no es una caratula");
});

test("en pausa el <audio> manda: dice que no suena", () => {
  assert.strictEqual(apple({ sonando: false }).YTMPip.MetadataReader.read().playing, false);
});

test("sin «Artista — Album» (solo artista) la linea es el artista solo", () => {
  const e = apple();
  const d = e.win.document;
  const items = d.querySelectorAll("[data-testid='player-lcd'] .marquee--secondary [data-testid='marquee-text-item']");
  for (let i = 1; i < items.length; i++) items[i].remove();
  const s = e.YTMPip.MetadataReader.read();
  assert.strictEqual(s.artist, "Los Ejemplos");
  assert.ok(!s.album, "no se inventa album");
});

test("saltar y el volumen van al <audio>: la pagina no tiene que hacer nada", () => {
  const A = apple().YTMPip.Adapter;
  assert.strictEqual(A.seekPageTo(30), false);
  assert.strictEqual(A.setPageVolume(0.5), false);
});

test("siguiente y anterior se buscan por su etiqueta y no se confunden con pausa", () => {
  const e = apple();
  const A = e.YTMPip.Adapter;
  assert.strictEqual(A.getNextButton(), null, "en avances no hay siguiente");
  assert.strictEqual(A.getPreviousButton(), null);
  const zona = e.win.document.querySelector("[data-testid='playback-controls']");
  for (const etiqueta of ["Previous", "Next"]) {
    const b = e.win.document.createElement("button");
    b.setAttribute("aria-label", etiqueta);
    zona.appendChild(b);
  }
  assert.strictEqual(A.getNextButton().getAttribute("aria-label"), "Next");
  assert.strictEqual(A.getPreviousButton().getAttribute("aria-label"), "Previous");
});

test("en un avance, la falta de «siguiente» no es un cambio del sitio", () => {
  const s = apple().YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, true);
  assert.deepStrictEqual(plano(s.faltan), []);
});

test("fuera de un avance, sin «siguiente» la salud SI avisa", () => {
  const e = apple();
  e.win.document.querySelector("[data-testid='preview-badge']").remove();
  const s = e.YTMPip.Adaptadores.salud();
  assert.ok(Array.from(s.faltan).length > 0, "una cuenta sin siguiente es un sitio cambiado");
});
