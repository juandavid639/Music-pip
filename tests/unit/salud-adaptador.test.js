/*
 * LA SALUD DEL ADAPTADOR: DECIR QUE EL SITIO CAMBIO (tanda AK).
 *
 * Cuando YouTube Music o Spotify cambian su HTML, el adaptador deja de
 * encontrar cosas y la ventana... sigue ahi, con el titulo vacio y botones
 * que no hacen nada. El usuario ve una extension rota y no sabe por que;
 * el autor se entera por una reseña de una estrella.
 *
 * La regla: mientras SUENA algo (y solo entonces: sin musica, que no haya
 * boton ni titulo es lo normal), faltar una pieza vital es noticia. El
 * estado lleva la lista (`piezasQueFaltan`), la ventana lo dice en su
 * linea de estado y la consola lo apunta una vez, con los nombres, para
 * quien vaya a arreglarlo. La lista de piezas vitales vive en el registro
 * de adaptadores, la misma para los tres sitios.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { entornoContenido, entornoPagina, crearEntorno, cargar, leerFixture, pulso, RAIZ } = require("../helpers/entorno.js");

function sonando(win) {
  const video = win.document.querySelector("video");
  Object.defineProperty(video, "paused", { get: () => false, configurable: true });
  return video;
}

/*
 * controles-completos.html no trae el boton de reproducir ni el de
 * siguiente (fija otras cosas); la pagina real siempre los tiene. Aqui se
 * añaden con los selectores principales del adaptador.
 */
const CON_BOTONES = leerFixture("controles-completos.html").replace(
  "<ytmusic-player-bar repeat-mode=\"ONE\">",
  "<ytmusic-player-bar repeat-mode=\"ONE\"><tp-yt-paper-icon-button id=\"play-pause-button\"></tp-yt-paper-icon-button><tp-yt-paper-icon-button class=\"next-button\"></tp-yt-paper-icon-button>"
);

const SIN_TITULO = CON_BOTONES.replace(
  /<yt-formatted-string class="title[^>]*>[^<]*<\/yt-formatted-string>/,
  ""
);

function contenidoCon(html) {
  const { win } = crearEntorno(html);
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/content/adapter-registry.js", "src/content/youtube-music-adapter.js", "src/content/track-timeline.js", "src/content/metadata-reader.js");
  return { win, YTMPip: win.YTMPip };
}

test("con todo en su sitio y sonando: comprobable y sin nada que falte", () => {
  const e = contenidoCon(CON_BOTONES);
  sonando(e.win);
  const s = e.YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, true);
  assert.deepStrictEqual([...s.faltan], []);
});

test("sonando sin titulo en la pagina: el titulo falta", () => {
  const { win } = crearEntorno(SIN_TITULO);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/messages.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js"
  );
  sonando(win);
  const s = win.YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, true);
  assert.ok(s.faltan.includes("titulo"), "no echo en falta el titulo: " + s.faltan.join(","));
});

test("sin nada sonando no se juzga: que falten piezas es lo normal", () => {
  const e = entornoContenido("vacio.html");
  const s = e.YTMPip.Adaptadores.salud();
  assert.strictEqual(s.comprobable, false);
});

test("el estado lleva la lista, vacia si todo esta bien", () => {
  const e = contenidoCon(CON_BOTONES);
  sonando(e.win);
  assert.deepStrictEqual([...e.YTMPip.MetadataReader.read().piezasQueFaltan], []);
});

test("el estado no acusa a nadie cuando no suena nada", () => {
  const e = entornoContenido("vacio.html");
  assert.deepStrictEqual([...e.YTMPip.MetadataReader.read().piezasQueFaltan], []);
});

test("la consola lo apunta UNA vez, con los nombres de lo que falta", async () => {
  const avisos = [];
  const e = entornoPagina("controles-completos.html", {
    antesDeCargar(win) {
      win.console.warn = (...a) => avisos.push(a.join(" "));
    }
  });
  const video = sonando(e.win);
  e.win.document.querySelector(".title.ytmusic-player-bar").remove();
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();
  const delSitio = avisos.filter((a) => /titulo/.test(a));
  assert.strictEqual(delSitio.length, 1, "avisos: " + JSON.stringify(avisos));
});

/* ---- La ventana ---- */

function ventana() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/shared/formas-espectro.js",
    "src/pip/pip.js"
  );
  win.requestAnimationFrame = () => 0;
  win.cancelAnimationFrame = () => {};
  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);
  return { win, PipView: win.YTMPip.PipView, estado: doc.getElementById("ytmpip-status") };
}

const CATALOGO = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/es/messages.json"), "utf8"));

test("la ventana lo dice en su linea de estado, y deja de decirlo cuando vuelve", () => {
  const v = ventana();
  const base = { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
  v.PipView.onStateUpdate(Object.assign({}, base, { piezasQueFaltan: ["titulo"] }));
  assert.strictEqual(v.estado.textContent, CATALOGO.sitio_cambio.message);
  assert.ok(v.estado.classList.contains("disconnected"), "el aviso deberia verse como un aviso");

  v.PipView.onStateUpdate(Object.assign({}, base, { piezasQueFaltan: [] }));
  assert.strictEqual(v.estado.textContent, CATALOGO.conectado.message);
});

test("el catalogo ingles tambien trae el aviso", () => {
  const en = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/en/messages.json"), "utf8"));
  assert.ok(en.sitio_cambio && en.sitio_cambio.message);
});
