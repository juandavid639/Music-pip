/*
 * Pruebas del boton de REPETIR en la ventana flotante.
 *
 * EL SINTOMA REPORTADO: "se oprime el boton de repetir pero no se si esta
 * activo o no; el de aleatorio si, porque cambia de cancion".
 *
 * La causa no estaba en la ventana sino en la lectura: el estado se
 * buscaba en el `aria-pressed` del boton de YouTube Music, que es null. La
 * ventana hacia lo correcto con lo que le llegaba —abstenerse— y por eso
 * el boton no se encendia jamas.
 *
 * Verificado en la pagina real con tools/diagnostico-relevo.js: el modo
 * vive en ytmusic-player-bar[repeat-mode] y son TRES posiciones,
 * NONE -> ALL -> ONE. De ahi que aqui no se pruebe un booleano: lo que hay
 * que fijar es que se distinga repetir la lista de repetir esta cancion,
 * que es justo lo que el usuario queria saber al pulsar.
 *
 * Que el boton se pinte con el color de acento cuando aria-pressed es
 * "true" ya es cosa del CSS (.ytmpip-icon-button[aria-pressed="true"]) y
 * eso se mira en tools/vista-previa.html, no aqui.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

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

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  return { win, doc, PipView: win.YTMPip.PipView, boton: doc.getElementById("ytmpip-repeat") };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

test("EL SINTOMA REPORTADO: con repetir puesto, el boton se enciende y dice cual", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ repeatMode: "ALL" }));

  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.match(v.boton.title, /lista/i);
});

test("repetir una cancion no se confunde con repetir la lista", () => {
  /*
   * El corazon del arreglo. Con un booleano los dos casos serian el mismo
   * "encendido" y el usuario seguiria sin saber que va a pasar al terminar
   * la cancion, que es la pregunta que hacia.
   */
  const v = ventana();

  v.PipView.onStateUpdate(estado({ repeatMode: "ALL" }));
  const dibujoLista = v.boton.dataset.ico;
  const tituloLista = v.boton.title;

  v.PipView.onStateUpdate(estado({ repeatMode: "ONE" }));

  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true", "una cancion en bucle sigue siendo repetir");
  /*
   * SE MIRA `data-ico` Y NO `textContent`. Antes el boton llevaba un emoji
   * escrito dentro y bastaba con leer su texto; ahora lleva un <svg>, cuyo
   * `textContent` es la cadena vacia para los dos modos. Comparar textos
   * seguiria pasando —""===""— y la prueba habria dejado de mirar nada sin
   * ponerse en rojo ni una vez.
   *
   * `data-ico` es el nombre del dibujo que iconos.js deja escrito al
   * pintarlo, o sea exactamente "cual de los dos se esta viendo".
   */
  assert.notStrictEqual(v.boton.dataset.ico, dibujoLista, "el dibujo tiene que distinguirlos");
  assert.ok(v.boton.querySelector("svg"), "y tiene que ser un dibujo, no un emoji");
  assert.notStrictEqual(v.boton.title, tituloLista, "el texto tiene que distinguirlos");
});

test("sin repetir, el boton se apaga", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ repeatMode: "ALL" }));
  v.PipView.onStateUpdate(estado({ repeatMode: "NONE" }));

  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("REGRESION: con el modo desconocido no se inventa un estado", () => {
  /*
   * Es la regla que este proyecto ya tenia y que no se pierde con el
   * cambio: si YouTube Music deja de exponer el modo, mejor un boton sin
   * estado que un boton diciendo "apagado" sin haberlo comprobado.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ repeatMode: "ALL" }));
  v.PipView.onStateUpdate(estado({ repeatMode: undefined }));

  assert.strictEqual(v.boton.getAttribute("aria-pressed"), null);
  assert.strictEqual(v.boton.title, "Repetir");
});

test("el estado del boton se anuncia tambien para quien no ve el dibujo", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ repeatMode: "ONE" }));

  assert.strictEqual(v.boton.getAttribute("aria-label"), v.boton.title);
  assert.notStrictEqual(v.boton.getAttribute("aria-label"), "Repetir");
});
