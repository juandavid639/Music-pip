/*
 * Pruebas del video flotante DEL NAVEGADOR (PiP nativo).
 *
 * El video DRM de Spotify no se puede adoptar en esta ventana (mover el
 * elemento rompe la sesion de claves: videoPrestable false, medido en
 * vivo). Pero el navegador SI sabe flotarlo el solo: medido en vivo el
 * 2026-09-16, requestPictureInPicture abrio la ventanita nativa con el
 * video cifrado dentro (293x165). El DRM protege los bytes, no la
 * ventana.
 *
 * Dos mitades, como el propio arreglo:
 *  - el estado (readNativePip en metadata-reader.js) decide si la puerta
 *    existe: video con dimensiones reales, la API presente, sin veto de
 *    la pagina (disablePictureInPicture) y con permiso del documento;
 *  - la ventana (pip.js) solo pinta el boton cuando el estado lo dice y,
 *    al clic, llama al video del adaptador por la via local de siempre.
 *
 * El borde que estas pruebas NO pueden medir: si Chrome propaga la
 * activacion de usuario desde la ventana PiP hasta la pagina dueña del
 * video. Si no la propaga, cae NotAllowedError, y la ultima prueba fija
 * que ese fallo se dice en voz alta en vez de tragarse en silencio.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, entornoContenido, RAIZ } = require("../helpers/entorno.js");

/** jsdom no implementa el motor multimedia: se simulan las propiedades. */
function simularMedia(win, props) {
  const video = win.document.querySelector("video");
  for (const [clave, valor] of Object.entries(props)) {
    Object.defineProperty(video, clave, { value: valor, configurable: true });
  }
  return video;
}

/*
 * El decorado completo de un video "flotable": dimensiones reales, la
 * API presente y el documento con permiso. Cada prueba negativa quita
 * UNA pieza para fijar que esa pieza es necesaria.
 */
function videoFlotable(win, extras) {
  const video = simularMedia(win, Object.assign({ videoWidth: 1280, videoHeight: 720 }, extras));
  video.requestPictureInPicture = () => Promise.resolve();
  Object.defineProperty(win.document, "pictureInPictureEnabled", {
    value: true,
    configurable: true
  });
  return video;
}

test("nativePipAvailable: true con video real, API y permiso del documento", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  videoFlotable(win);
  assert.strictEqual(YTMPip.MetadataReader.read().nativePipAvailable, true);
});

test("nativePipAvailable: false en modo cancion (video 0x0), aunque todo lo demas este", () => {
  /*
   * El <video> de YouTube Music en modo cancion existe pero mide 0x0:
   * flotar ESO seria abrir una ventanita negra. La señal exige la misma
   * vara que el modo video de la propia ventana (readHasVideo).
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  videoFlotable(win, { videoWidth: 0, videoHeight: 0 });
  assert.strictEqual(YTMPip.MetadataReader.read().nativePipAvailable, false);
});

test("nativePipAvailable: false si la pagina lo veta con disablePictureInPicture", () => {
  // En Spotify se midio false (por eso el boton existe); si algun dia lo
  // ponen en true, la ventana debe dejar de prometer la puerta.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  videoFlotable(win, { disablePictureInPicture: true });
  assert.strictEqual(YTMPip.MetadataReader.read().nativePipAvailable, false);
});

/* ----------------------------------------------------------------------
 * La otra mitad: la ventana. El mismo banco que las demas pruebas del
 * PiP, con el fixture de YouTube Music para que el adaptador tenga un
 * <video> de verdad que entregar en getMediaElement().
 * -------------------------------------------------------------------- */

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

  // jsdom no maqueta: los desplazamientos se anulan.
  win.Element.prototype.scrollTo = function () {};
  win.Element.prototype.scrollIntoView = function () {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    video: win.document.querySelector("video"),
    boton: doc.getElementById("ytmpip-native-pip"),
    anuncio: doc.getElementById("ytmpip-anuncio")
  };
}

function estado(nativePipAvailable) {
  /*
   * hasVideo va en false A PROPOSITO: con true, el escenario de ESTA
   * ventana tomaria prestado el <video> (el adaptador de YTM del banco
   * es prestable) y el elemento cambiaria de documento a mitad de
   * prueba. La situacion que se modela es la de Spotify, donde el video
   * NUNCA se muda (videoPrestable false) y por eso existe este boton.
   * El prestamo tiene sus propias pruebas.
   */
  return {
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    nativePipAvailable: nativePipAvailable
  };
}

// Las promesas del clic se resuelven en microtareas: un tick basta.
function tick() {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

test("el boton 🎬 solo se pinta cuando el estado trae la señal", () => {
  const v = ventana();

  assert.strictEqual(v.boton.hidden, true, "premisa: el boton nace escondido");

  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.boton.hidden, false, "con la señal, el boton no salio");

  // La señal se apaga (cambio de pista, veto nuevo): el boton se recoge.
  v.PipView.onStateUpdate(estado(false));
  assert.strictEqual(v.boton.hidden, true, "sin la señal, el boton se quedo");

  // Y un estado viejo que ni conoce el campo tampoco lo enseña.
  v.PipView.onStateUpdate(estado(undefined));
  assert.strictEqual(v.boton.hidden, true, "un estado sin el campo pinto el boton");
});

test("el clic pide requestPictureInPicture AL VIDEO DEL ADAPTADOR", async () => {
  const v = ventana();
  const llamadas = [];
  v.video.requestPictureInPicture = function () {
    // `this` es quien recibio la llamada: tiene que ser el video de la
    // pagina, no un elemento de esta ventana.
    llamadas.push(this);
    return Promise.resolve();
  };

  v.PipView.onStateUpdate(estado(true));
  v.boton.click();
  await tick();

  assert.strictEqual(llamadas.length, 1, "el clic no pidio la ventanita (o la pidio dos veces)");
  assert.strictEqual(llamadas[0], v.video, "se la pidio a otro elemento");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true", "el boton no cuenta que flota");
});

test("con la ventanita ya abierta, el clic la recoge (exitPictureInPicture)", () => {
  const v = ventana();
  let salidas = 0;
  v.video.requestPictureInPicture = () => {
    throw new Error("con el video ya flotando no se pide otra ventanita");
  };
  Object.defineProperty(v.win.document, "pictureInPictureElement", {
    value: v.video,
    configurable: true
  });
  v.win.document.exitPictureInPicture = () => {
    salidas += 1;
    return Promise.resolve();
  };

  v.PipView.onStateUpdate(estado(true));
  // La pintura ya lo sabe: el video esta flotando y el boton lo cuenta.
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true", "la pintura no vio la ventanita abierta");

  v.boton.click();
  assert.strictEqual(salidas, 1, "el clic no recogio la ventanita");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false", "el boton sigue contando que flota");
});

test("NotAllowedError: el rechazo se dice en el anuncio, sin reventar", async () => {
  /*
   * EL BORDE DEL GESTO. Si Chrome no propaga la activacion de usuario
   * desde esta ventana hasta la pagina, la promesa cae con
   * NotAllowedError. La ventana lo confiesa por el anuncio aria-live
   * con la frase del catalogo español DE VERDAD (el doble de chrome.i18n
   * del banco contesta con el mismo archivo que Chrome) y no se rompe.
   */
  const v = ventana();
  const rechazo = Object.assign(new Error("user gesture required"), { name: "NotAllowedError" });
  v.video.requestPictureInPicture = () => Promise.reject(rechazo);
  const avisos = [];
  v.win.console.warn = (...args) => avisos.push(args.join(" "));

  v.PipView.onStateUpdate(estado(true));
  v.boton.click();
  await tick();

  const frase = v.win.chrome.i18n.getMessage("pip_nativo_rechazado");
  assert.ok(frase, "premisa: la clave existe en el catalogo español");
  assert.strictEqual(v.anuncio.textContent, frase, "el rechazo no llego al anuncio");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false", "el boton fingio que la ventanita se abrio");
  assert.ok(
    avisos.some((a) => a.includes("NotAllowedError")),
    "la consola no cuenta el porque"
  );

  // La ventana sigue viva: el siguiente estado se pinta sin quejarse.
  v.PipView.onStateUpdate(estado(false));
  assert.strictEqual(v.boton.hidden, true);
});
