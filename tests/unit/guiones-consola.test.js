/*
 * LOS GUIONES DE CONSOLA DE LA TANDA AL, EJECUTADOS DE VERDAD.
 *
 * Un guion de consola que nadie ejecuta envejece peor que el codigo: se
 * pega el dia de publicar, revienta, y ese dia no hay tiempo de arreglarlo.
 * Aqui se pegan los dos en una pagina jsdom con la extension cargada (el
 * mismo mundo que el contexto «Music PiP» de DevTools) y se mira lo que
 * dejan en el portapapeles.
 *
 * La prueba fuerte es la de ida y vuelta de la fixture: capturar la pagina,
 * cargar lo capturado como si fuera una fixture nueva y comprobar que el
 * adaptador lee lo MISMO. Si el recorte dejara fuera un antepasado que un
 * selector necesita, el titulo saldria vacio.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

const MODULOS = [
  "src/shared/constants.js",
  "src/shared/textos.js",
  "src/shared/messages.js",
  "src/shared/ecualizador.js",
  "src/shared/settings.js",
  "src/content/adapter-registry.js",
  "src/content/youtube-music-adapter.js",
  "src/content/youtube-adapter.js",
  "src/content/spotify-adapter.js",
  "src/content/track-timeline.js",
  "src/content/metadata-reader.js",
  "src/content/lyrics-reader.js"
];

/*
 * controles-completos.html no trae el boton de reproducir ni el de
 * siguiente (fija otras cosas); la pagina real siempre los tiene. Aqui se
 * añaden con los selectores principales del adaptador.
 */
const CON_BOTONES = leerFixture("controles-completos.html").replace(
  "<ytmusic-player-bar repeat-mode=\"ONE\">",
  "<ytmusic-player-bar repeat-mode=\"ONE\"><tp-yt-paper-icon-button id=\"play-pause-button\"></tp-yt-paper-icon-button><tp-yt-paper-icon-button class=\"next-button\"></tp-yt-paper-icon-button>"
);

function pagina(html, opciones) {
  const { win } = crearEntorno(html, opciones);
  cargar(win, ...MODULOS);
  const copiado = [];
  win.copy = (texto) => copiado.push(texto);
  const errores = [];
  win.console.error = (...a) => errores.push(a.join(" "));
  win.console.table = () => {};
  win.console.log = () => {};
  return { win, copiado, errores };
}

function pegar(win, archivo) {
  win.eval(fs.readFileSync(path.join(RAIZ, "tools", archivo), "utf8"));
}

test("fixture: sin el contexto de la extension, lo dice y no copia nada", () => {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  const errores = [];
  win.console.error = (...a) => errores.push(a.join(" "));
  const copiado = [];
  win.copy = (t) => copiado.push(t);
  pegar(win, "diagnostico-fixture.js");
  assert.strictEqual(copiado.length, 0);
  assert.match(errores.join("\n"), /Music PiP/);
});

test("fixture: IDA Y VUELTA — lo capturado se lee igual que el original", () => {
  const original = pagina(leerFixture("controles-completos.html"));
  pegar(original.win, "diagnostico-fixture.js");
  assert.strictEqual(original.copiado.length, 1, "no dejo nada en el portapapeles");
  const capturado = original.copiado[0];
  assert.match(capturado, /^<!doctype html>/);
  assert.match(capturado, /diagnostico-fixture\.js/);

  const antes = original.win.YTMPip.MetadataReader.read();
  const copia = pagina(capturado);
  const despues = copia.win.YTMPip.MetadataReader.read();
  for (const campo of ["title", "artist", "album", "artworkUrl", "likeStatus", "repeatMode"]) {
    assert.deepStrictEqual(despues[campo], antes[campo], "el campo «" + campo + "» no sobrevive a la captura");
  }
});

for (const fixture of ["letras-disponibles.html", "letras-no-disponibles.html", "letras-better-lyrics-nueva.html", "cola.html"]) {
  test("fixture: IDA Y VUELTA con " + fixture + " (letra y cola incluidas)", () => {
    const original = pagina(leerFixture(fixture));
    pegar(original.win, "diagnostico-fixture.js");
    const Y1 = original.win.YTMPip;
    const copia = pagina(original.copiado[0]).win.YTMPip;
    // En JSON: cada lectura nace en SU ventana jsdom y los prototipos no coinciden.
    const letra = (Y) => JSON.stringify(Y.LyricsReader.read());
    assert.strictEqual(letra(copia), letra(Y1), "la letra no sobrevive a la captura");
    const cola = (Y) => JSON.stringify(Y.MetadataReader.read().upNext);
    assert.strictEqual(cola(copia), cola(Y1), "la cola no sobrevive a la captura");
  });
}

test("fixture: IDA Y VUELTA en Spotify, cuyos selectores cuelgan de antepasados con data-testid", () => {
  const url = { url: "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY" };
  const original = pagina(leerFixture("spotify-sonando.html"), url);
  pegar(original.win, "diagnostico-fixture.js");
  const antes = original.win.YTMPip.MetadataReader.read();
  assert.ok(antes.title, "premisa: la fixture de Spotify se lee con titulo");
  const despues = pagina(original.copiado[0], url).win.YTMPip.MetadataReader.read();
  for (const campo of ["title", "artist", "artworkUrl", "playing", "likeStatus"]) {
    assert.deepStrictEqual(despues[campo], antes[campo], "el campo «" + campo + "» no sobrevive a la captura");
  }
});

test("fixture: se quitan scripts, estilos en linea y manejadores de evento", () => {
  // El <script> DENTRO de la barra: fuera de ella no se captura, y la
  // prueba no veia si se quitaba (primera pasada de la mutacion AL).
  const html = leerFixture("controles-completos.html").replace(
    '<ytmusic-player-bar repeat-mode="ONE">',
    '<ytmusic-player-bar repeat-mode="ONE" style="color:red" onclick="x()"><script>alert(1)</script>'
  );
  const p = pagina(html);
  pegar(p.win, "diagnostico-fixture.js");
  const capturado = p.copiado[0];
  assert.doesNotMatch(capturado, /<script/i);
  assert.doesNotMatch(capturado, /onclick|style="color:red"/);
});

test("publicacion: con todo en su sitio, el veredicto es bueno", () => {
  // La pagina entera, como la ve quien va a publicar: la vista flotante
  // cargada, su boton puesto, la API del navegador y una cancion sonando.
  const p = pagina(CON_BOTONES);
  p.win.documentPictureInPicture = {};
  cargar(p.win, "src/content/player-controller.js", "src/content/audio-spectrum.js", "src/shared/iconos.js", "src/pip/pip.js");
  p.win.YTMPip.PipView.ensureLauncher();
  const video = conTiempos(p.win.document.querySelector("video"), 30, 200);
  Object.defineProperty(video, "paused", { get: () => false, configurable: true });
  pegar(p.win, "diagnostico-publicacion.js");
  assert.strictEqual(p.copiado.length, 1);
  assert.doesNotMatch(p.copiado[0], /FALLO/, p.copiado[0]);
  assert.match(p.copiado[0], /music\.youtube\.com/);
});

test("publicacion: sin titulo en la pagina, lo señala", () => {
  const html = CON_BOTONES.replace(/<yt-formatted-string class="title[^>]*>[^<]*<\/yt-formatted-string>/, "");
  const p = pagina(html);
  pegar(p.win, "diagnostico-publicacion.js");
  assert.match(p.copiado[0], /FALLO/);
  assert.match(p.copiado[0], /estado: titulo/);
});
