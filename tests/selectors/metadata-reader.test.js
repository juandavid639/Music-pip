/*
 * Pruebas de lectura de metadatos desde el DOM de YouTube Music.
 *
 * Igual que con las letras, el riesgo aqui es el fallo silencioso: si un
 * selector deja de encontrar el titulo, la ventana PiP muestra una cadena
 * vacia en vez de gritar. Estos tests fijan el contrato contra HTML real.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

/** jsdom no implementa el motor multimedia: se simulan las propiedades. */
function simularMedia(win, props) {
  const video = win.document.querySelector("video");
  for (const [clave, valor] of Object.entries(props)) {
    Object.defineProperty(video, clave, { value: valor, configurable: true });
  }
  return video;
}

test("titulo, artista y album se extraen del byline", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.title, "Bohemian Rhapsody");
  assert.strictEqual(meta.artist, "Queen");
  assert.strictEqual(meta.album, "A Night at the Opera");
});

test("el año del byline no se cuela en el album", () => {
  // El formato real es "Artista • Album • Año": solo interesan los dos
  // primeros tramos.
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const meta = YTMPip.MetadataReader.read();

  assert.ok(!meta.album.includes("1975"), `album contaminado: ${meta.album}`);
  assert.ok(!meta.artist.includes("•"), "el separador no debe sobrevivir");
});

test("byline sin album: artista presente, album undefined", () => {
  const { YTMPip } = entornoContenido("letras-no-disponibles.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.title, "Untitled Instrumental");
  assert.strictEqual(meta.artist, "Artista Desconocido");
  assert.strictEqual(meta.album, undefined);
});

test("la portada se pide en alta resolucion", () => {
  // YouTube sirve la miniatura de la barra a 60x60; para el PiP se
  // reescribe el sufijo de tamaño.
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  assert.strictEqual(
    YTMPip.MetadataReader.read().artworkUrl,
    "https://lh3.googleusercontent.com/abc=w544-h544-l90-rj"
  );
});

test("sin portada en el DOM, artworkUrl queda undefined", () => {
  const { YTMPip } = entornoContenido("letras-panel-cerrado.html");
  assert.strictEqual(YTMPip.MetadataReader.read().artworkUrl, undefined);
});

test("playing es false mientras el video este pausado", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  assert.strictEqual(YTMPip.MetadataReader.read().playing, false);
});

test("playing es true con el video en marcha", () => {
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { paused: false, ended: false });
  assert.strictEqual(YTMPip.MetadataReader.read().playing, true);
});

test("una pista terminada no cuenta como reproduciendose", () => {
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { paused: false, ended: true });
  assert.strictEqual(YTMPip.MetadataReader.read().playing, false);
});

/*
 * VELOCIDAD DE REPRODUCCION.
 *
 * Estas dos pruebas nacieron de una mutacion que sobrevivio: cambiar el
 * lector para que publicara SIEMPRE velocidad normal no ponia en rojo ni un
 * test. Las pruebas del boton le pasan el estado a mano, asi que ninguna
 * miraba de donde sale ese numero. El fallo real que tapan es que el mando
 * enseñe 1,5x mientras la musica ya va a 1x.
 */
test("la velocidad se lee del <video>, no se da por supuesta", () => {
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { playbackRate: 1.5 });
  assert.strictEqual(YTMPip.MetadataReader.read().playbackRate, 1.5);
});

test("una velocidad imposible no se publica como si fuera buena", () => {
  /*
   * El cero no es "parado": es un elemento que no avanza, y el boton no
   * tendria ninguna posicion del ciclo que enseñar. Se cae a la normal, que
   * es lo unico que se puede afirmar sin inventar.
   */
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  const NORMAL = win.YTMPip.CONSTANTS.PLAYBACK_RATE_NORMAL;

  for (const malo of [0, -1, NaN, Infinity]) {
    simularMedia(win, { playbackRate: malo });
    assert.strictEqual(
      YTMPip.MetadataReader.read().playbackRate,
      NORMAL,
      `playbackRate ${String(malo)} deberia caer a la normal`
    );
  }
});

test("tiempo actual y duracion se leen del elemento multimedia", () => {
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { currentTime: 42.5, duration: 355 });
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.currentTime, 42.5);
  assert.strictEqual(meta.duration, 355);
});

test("duracion no finita (emision en directo) se reporta como 0", () => {
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { currentTime: 10, duration: Infinity });
  assert.strictEqual(YTMPip.MetadataReader.read().duration, 0);
});

test("duracion aun desconocida (NaN) no propaga NaN a la barra de progreso", () => {
  // Un NaN aqui llegaba a la anchura CSS de la barra y la dejaba rota.
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  simularMedia(win, { currentTime: 0, duration: NaN });
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.duration, 0);
  assert.strictEqual(meta.currentTime, 0);
});

test("sin reproductor: no lanza y devuelve campos vacios", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.title, "");
  assert.strictEqual(meta.artist, "");
  assert.strictEqual(meta.playing, false);
  assert.strictEqual(meta.duration, 0);
  assert.strictEqual(meta.artworkUrl, undefined);
});

/* ------------------------------------------------------------------ *
 * Campos añadidos con el vídeo real y los controles secundarios.
 * ------------------------------------------------------------------ */

test("REGRESION: una pista de solo audio no cuenta como vídeo", () => {
  /*
   * En modo "canción" YouTube Music mantiene el <video> en el DOM pero lo
   * deja a 0x0. Si bastara con que el elemento existiera, la ventana
   * flotante cambiaria a modo vídeo en TODAS las canciones y mostraria un
   * rectangulo negro en lugar de la portada.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  simularMedia(win, { videoWidth: 0, videoHeight: 0 });

  assert.strictEqual(YTMPip.MetadataReader.read().hasVideo, false);
});

test("un videoclip con dimensiones reales si activa el modo vídeo", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  simularMedia(win, { videoWidth: 1280, videoHeight: 720 });

  assert.strictEqual(YTMPip.MetadataReader.read().hasVideo, true);
});

test("sin elemento multimedia, hasVideo es false", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  assert.strictEqual(YTMPip.MetadataReader.read().hasVideo, false);
});

test("volumen y silencio se leen del elemento multimedia", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const video = win.document.querySelector("video");
  video.volume = 0.25;
  video.muted = true;

  const meta = YTMPip.MetadataReader.read();
  assert.strictEqual(meta.volume, 0.25);
  assert.strictEqual(meta.muted, true);
});

test("sin reproductor el volumen se reporta al maximo y sin silencio", () => {
  // Es el valor que hace que el deslizador de la ventana flotante arranque
  // en una posicion coherente en vez de a cero.
  const { YTMPip } = entornoContenido("vacio.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.volume, 1);
  assert.strictEqual(meta.muted, false);
});

test("el estado de me gusta viaja en el estado", () => {
  const { YTMPip } = entornoContenido("controles-completos.html");
  assert.strictEqual(YTMPip.MetadataReader.read().likeStatus, "LIKE");
});

test("el modo de repeticion viaja en el estado, y aleatorio sigue siendo undefined", () => {
  // La asimetria real: el modo de repetir se puede saber (esta en la barra)
  // y el de aleatorio no (no lo expone nadie). undefined significa "no se
  // sabe", y la ventana se abstiene en vez de inventarse un estado.
  const { YTMPip } = entornoContenido("controles-completos.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.repeatMode, "ONE");
  assert.strictEqual(meta.repeatOn, true);
  assert.strictEqual(meta.shuffleOn, undefined);
});

test("repeatOn resume el modo sin perder cual es: NONE es el unico apagado", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const barra = win.document.querySelector("ytmusic-player-bar");

  barra.setAttribute("repeat-mode", "NONE");
  assert.strictEqual(YTMPip.MetadataReader.read().repeatOn, false);

  barra.setAttribute("repeat-mode", "ALL");
  const meta = YTMPip.MetadataReader.read();
  assert.strictEqual(meta.repeatOn, true);
  assert.strictEqual(meta.repeatMode, "ALL", "el resumen no puede tragarse cual de los dos encendidos es");
});

test("sin barra de reproductor no se inventa estado de los toggles", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  const meta = YTMPip.MetadataReader.read();

  assert.strictEqual(meta.likeStatus, undefined);
  assert.strictEqual(meta.repeatOn, undefined);
  assert.strictEqual(meta.shuffleOn, undefined);
});

/* ------------------------------------------------------------------ *
 * El nombre del sitio viaja en el estado (siteName).
 *
 * Es el dato con el que el menu de la barra dice «Conectado a Spotify»
 * en vez del "YouTube Music" fijo de antes. Sale del registro de
 * adaptadores, que ya obliga a declarar `nombre` al registrarse, y va
 * FUERA de stateSignature a proposito (el sitio no cambia dentro de una
 * pagina), como nativePipAvailable.
 * ------------------------------------------------------------------ */

test("siteName es el nombre humano del adaptador activo", () => {
  // Fixture de YouTube Music sin url: no coincide ningun hostname y el
  // registro se queda con el primero registrado, que es el de YTM.
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  assert.strictEqual(YTMPip.MetadataReader.read().siteName, "YouTube Music");
});

test("en una pestaña de Spotify el estado dice Spotify", () => {
  // El nombre HUMANO del registro, no el id minusculo ("spotify"): es lo
  // que el menu pinta tal cual dentro de «Conectado a $1».
  const { YTMPip } = entornoContenido("spotify-sonando.html", {
    url: "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY"
  });
  assert.strictEqual(YTMPip.MetadataReader.read().siteName, "Spotify");
});

test("sin registro que preguntar, siteName queda undefined y read no revienta", () => {
  /*
   * Modela un contexto sin adaptador elegido (o un YTMPip a medio
   * cargar). undefined significa "no se sabe": el menu se cae al
   * «Conectado» generico en vez de inventarse un sitio.
   */
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  YTMPip.Adaptadores.activo = () => null;

  const meta = YTMPip.MetadataReader.read();
  assert.strictEqual(meta.siteName, undefined);
  assert.strictEqual(meta.title, "Bohemian Rhapsody", "el resto de la lectura sigue entera");
});
