/*
 * LA PUERTA QUE SE CERRO: el evento "ytmpip:open-pip" (tanda AI).
 *
 * pip.js escuchaba en window un evento con ese nombre y abria la ventana
 * al oirlo. Los eventos de window cruzan los mundos aislados, asi que
 * cualquier script de la PAGINA (YouTube, Spotify o un anuncio) podia
 * pedir abrir la ventana flotante. Chrome exige un gesto del usuario para
 * requestWindow y eso acotaba el daño, pero la puerta no la usaba nadie: el
 * service worker solo la llamaba cuando PipView no existia, que es
 * justamente cuando este oyente tampoco (los dos los pone pip.js).
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, leerFixture } = require("../helpers/entorno.js");

function pagina() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  let pedidas = 0;
  win.documentPictureInPicture = {
    requestWindow() {
      pedidas++;
      return Promise.reject(Object.assign(new Error("sin gesto"), { name: "NotAllowedError" }));
    }
  };
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
  return { win, pedidas: () => pedidas };
}

test("un script de la pagina ya no puede pedir la ventana con un evento", async () => {
  const p = pagina();
  p.win.dispatchEvent(new p.win.Event("ytmpip:open-pip"));
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(p.pedidas(), 0, "el evento de la pagina llego a requestWindow");
});

test("premisa del banco: el boton de la pagina SI llega a pedirla", async () => {
  // Sin esto, la prueba de arriba pasaria tambien con un banco roto que no
  // sabe abrir nada.
  const p = pagina();
  p.win.YTMPip.PipView.ensureLauncher();
  p.win.document.getElementById("ytmpip-launcher").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(p.pedidas(), 1);
});
