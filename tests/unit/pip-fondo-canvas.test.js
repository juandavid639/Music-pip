/*
 * Pruebas del FONDO CANVAS: el bucle visual de Spotify detras de la
 * ventana flotante.
 *
 * Todo lo raro de esta tanda esta MEDIDO en vivo (2026-09-16, la pestaña
 * real del usuario):
 *  - el Canvas es un <video> vertical 321x574, muted, loop, SIN DRM
 *    (mediaKeys null), colgado del testid NPV_Panel_OpenDiv;
 *  - su blob: esta revocado: reutilizar la URL da ERR_FILE_NOT_FOUND
 *    (la via A, muerta), asi que la UNICA via es captureStream() desde
 *    el elemento de la pagina (la via B, medida: 1080x1920, 1 pista de
 *    video, reproduce=true);
 *  - el video DE PISTA ([data-testid='video-player-npv'] video) SI tiene
 *    DRM: capturarlo daria cuadros negros, y por eso las guardas de
 *    getCanvasVideo() existen.
 *
 * Dos mitades, como el PiP nativo: el adaptador (metodo 39 del contrato,
 * getCanvasVideo con sus guardas) y la ventana (boton 🌌, captureStream,
 * preferencia recordada, y soltar las pistas cuando el fondo se apaga).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, entornoContenido, RAIZ } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

/*
 * El Canvas del fixture, con la propiedad `muted` puesta a mano.
 *
 * jsdom NO inicializa la propiedad `muted` desde el atributo (medido
 * aqui: <video muted> da v.muted false); Chrome si lo hace, por spec.
 * La guarda del adaptador mira la propiedad porque es lo que se midio
 * en la pagina real, asi que la prueba repone lo que jsdom se come.
 */
function canvasDelFixture(win) {
  const video = win.document.querySelector(
    "[data-testid='NPV_Panel_OpenDiv'] .canvasVideoContainerNPV video"
  );
  assert.ok(video, "premisa: el fixture trae el Canvas dentro del testid del panel");
  video.muted = true;
  return video;
}

/** Un chorro falso de captureStream que sabe contar cuantas veces lo pararon. */
function chorroFalso() {
  const pista = {
    paradas: 0,
    stop() {
      this.paradas += 1;
    }
  };
  return {
    pista,
    getTracks() {
      return [pista];
    }
  };
}

/* ==================================================================
 * 1. El adaptador: getCanvasVideo() y sus guardas
 * ================================================================== */

test("getCanvasVideo(): encuentra el bucle mudo y JAMAS el video de pista", () => {
  const { win, YTMPip } = entornoContenido("spotify-video.html", { url: URL_DE_SPOTIFY });
  const canvas = canvasDelFixture(win);

  /*
   * La premisa que hace muerder a la guarda: el selector del ancla
   * ([NPV_Panel_OpenDiv] video) encuentra a LOS DOS videos del panel.
   * Si el fixture perdiera el video de pista, esta prueba vigilaria nada.
   */
  const pista = win.document.querySelector("[data-testid='video-player-npv'] video");
  assert.ok(pista, "premisa: el modo video trae el video de pista dentro del panel");
  assert.strictEqual(
    win.document.querySelectorAll("[data-testid='NPV_Panel_OpenDiv'] video").length,
    2,
    "premisa: el ancla ve a los dos candidatos"
  );

  const elegido = YTMPip.Adapter.getCanvasVideo();
  assert.strictEqual(elegido, canvas, "no eligio el Canvas");
  assert.notStrictEqual(elegido, pista, "eligio el video DRM de la pista");

  /*
   * Y DESORDENADO tambien: con el video de pista PRIMERO en el documento,
   * un getCanvasVideo sin guardas devolveria la pista (find se queda con
   * el primero). El orden medido hoy pone el Canvas delante, pero el
   * orden del DOM de Spotify no es un contrato: eligen las guardas.
   */
  const panel = win.document.querySelector("[data-testid='NPV_Panel_OpenDiv']");
  panel.insertBefore(pista.parentNode, panel.firstChild);
  assert.strictEqual(YTMPip.Adapter.getCanvasVideo(), canvas, "con la pista primero, eligio la pista");
});

test("sin panel no hay Canvas: null, sin inventar", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  canvasDelFixture(win);
  // Con panel esta (premisa de que lo que se quita a continuacion contaba).
  assert.ok(YTMPip.Adapter.getCanvasVideo(), "premisa: con panel el Canvas se encuentra");

  // El usuario cierra la Fila de reproduccion: el panel entero se va.
  win.document.querySelector("[data-testid='NPV_Panel_OpenDiv']").remove();
  assert.strictEqual(YTMPip.Adapter.getCanvasVideo(), null);
});

test("un Canvas con DRM se rechaza: capturarlo daria cuadros negros", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  const canvas = canvasDelFixture(win);
  // El Canvas real se midio con mediaKeys null; si algun dia Spotify lo
  // cifra, captureStream entregaria cuadros negros y el fondo seria una
  // mancha. Mejor no ofrecerlo.
  Object.defineProperty(canvas, "mediaKeys", { value: {}, configurable: true });
  assert.strictEqual(YTMPip.Adapter.getCanvasVideo(), null);
});

test("canvasAvailable: true con Canvas en Spotify, false en YouTube Music", () => {
  const spotify = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  canvasDelFixture(spotify.win);
  assert.strictEqual(spotify.YTMPip.MetadataReader.read().canvasAvailable, true);

  // Y sin panel, la señal se apaga en el siguiente estado.
  spotify.win.document.querySelector("[data-testid='NPV_Panel_OpenDiv']").remove();
  assert.strictEqual(spotify.YTMPip.MetadataReader.read().canvasAvailable, false);

  // YouTube Music no tiene Canvas: su unico video ES la pista.
  const ytm = entornoContenido("controles-completos.html");
  assert.strictEqual(ytm.YTMPip.MetadataReader.read().canvasAvailable, false);
});

/* ----------------------------------------------------------------------
 * La otra mitad: la ventana. El mismo banco que las demas pruebas del
 * PiP, pero viviendo en open.spotify.com con el fixture de Spotify, para
 * que el registro elija al adaptador de verdad y getCanvasVideo() tenga
 * un panel real que leer.
 * -------------------------------------------------------------------- */

function ventana(fixture = "spotify-sonando.html", url = URL_DE_SPOTIFY) {
  const { win } = crearEntorno(leerFixture(fixture), url ? { url } : {});
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    // Los TRES adaptadores, como en el manifest: es el registro quien
    // elige por hostname (aqui, open.spotify.com -> spotify).
    "src/content/youtube-music-adapter.js",
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js",
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
    fondo: doc.getElementById("ytmpip-canvas-fondo"),
    boton: doc.getElementById("ytmpip-canvas-toggle"),
    volver: doc.getElementById("ytmpip-back-to-tab")
  };
}

function estado(canvasAvailable) {
  /*
   * hasVideo en false A PROPOSITO: modela el modo audio de Spotify, que
   * es donde vive el Canvas. Con true, el escenario tomaria prestado un
   * <video> y el elemento cambiaria de documento a mitad de prueba (el
   * prestamo tiene sus propias pruebas).
   */
  return {
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    canvasAvailable: canvasAvailable
  };
}

/** El decorado entero: Canvas con muted repuesto y captureStream contado. */
function conCanvasCapturable(v) {
  const canvas = canvasDelFixture(v.win);
  const chorro = chorroFalso();
  let capturas = 0;
  canvas.captureStream = () => {
    capturas += 1;
    return chorro;
  };
  return { canvas, chorro, cuantasCapturas: () => capturas };
}

test("el boton 🌌 solo se pinta cuando el estado trae la señal", () => {
  const v = ventana();

  assert.strictEqual(v.boton.hidden, true, "premisa: el boton nace escondido");

  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.boton.hidden, false, "con la señal, el boton no salio");

  v.PipView.onStateUpdate(estado(false));
  assert.strictEqual(v.boton.hidden, true, "sin la señal, el boton se quedo");

  // Un estado viejo que ni conoce el campo tampoco lo enseña.
  v.PipView.onStateUpdate(estado(undefined));
  assert.strictEqual(v.boton.hidden, true, "un estado sin el campo pinto el boton");
});

test("con la señal y la preferencia de serie, el fondo se enchufa al chorro del Canvas", () => {
  const v = ventana();
  const { chorro, cuantasCapturas } = conCanvasCapturable(v);

  assert.strictEqual(v.fondo.hidden, true, "premisa: el fondo nace escondido");

  v.PipView.onStateUpdate(estado(true));

  assert.strictEqual(cuantasCapturas(), 1, "no capturo el Canvas (o lo capturo varias veces)");
  assert.strictEqual(v.fondo.srcObject, chorro, "el fondo no lleva el chorro del Canvas");
  assert.strictEqual(v.fondo.hidden, false, "el fondo sigue escondido");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true", "el boton no cuenta que esta puesto");

  // El MISMO Canvas en el siguiente latido no se recaptura: el chorro
  // vivo ya copia sus cuadros solo.
  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(cuantasCapturas(), 1, "recapturo el mismo Canvas en cada latido");
  assert.strictEqual(chorro.pista.paradas, 0, "paro un chorro que seguia haciendo falta");
});

test("el clic apaga el fondo, suelta las pistas y RECUERDA la preferencia", () => {
  const v = ventana();
  const { chorro, cuantasCapturas } = conCanvasCapturable(v);
  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.fondo.hidden, false, "premisa: el fondo esta puesto");

  v.boton.click();

  assert.strictEqual(chorro.pista.paradas, 1, "el clic no solto las pistas del chorro");
  assert.strictEqual(v.fondo.hidden, true, "el fondo sigue a la vista");
  assert.strictEqual(v.fondo.srcObject, null, "el fondo sigue enchufado al chorro muerto");
  assert.strictEqual(
    v.win.YTMPip.Settings.get().canvasPreference,
    "hidden",
    "la preferencia no se guardo: en la proxima cancion volveria solo"
  );
  // El boton se queda: la señal sigue, lo apagado es la preferencia.
  assert.strictEqual(v.boton.hidden, false, "el boton se escondio con la señal viva");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false", "el boton sigue contando que esta puesto");

  // El segundo clic lo vuelve a querer: recaptura y reenchufa.
  v.boton.click();
  assert.strictEqual(v.win.YTMPip.Settings.get().canvasPreference, "shown");
  assert.strictEqual(cuantasCapturas(), 2, "al reencenderlo no volvio a capturar");
  assert.strictEqual(v.fondo.hidden, false, "reencendido, el fondo no volvio");
});

test("perder la señal suelta las pistas aunque nadie haya clicado", () => {
  const v = ventana();
  const { chorro } = conCanvasCapturable(v);
  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.fondo.hidden, false, "premisa: el fondo esta puesto");

  // Cancion nueva sin Canvas (o panel cerrado): la señal se apaga.
  v.PipView.onStateUpdate(estado(false));

  assert.strictEqual(chorro.pista.paradas, 1, "el chorro quedo vivo copiando cuadros para nadie");
  assert.strictEqual(v.fondo.hidden, true, "el fondo se quedo a la vista");
  assert.strictEqual(v.fondo.srcObject, null, "el fondo sigue enchufado");
});

test("un Canvas nuevo (cancion nueva) recaptura y suelta el viejo", () => {
  const v = ventana();
  const { canvas, chorro } = conCanvasCapturable(v);
  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.fondo.srcObject, chorro, "premisa: el primer Canvas esta capturado");

  /*
   * Cambio de cancion: Spotify tira el elemento y pone otro. El chorro
   * viejo apunta a un video que ya no se actualiza: hay que soltarlo y
   * capturar el nuevo.
   */
  const nuevo = v.win.document.createElement("video");
  nuevo.muted = true;
  nuevo.loop = true;
  const chorro2 = chorroFalso();
  nuevo.captureStream = () => chorro2;
  canvas.replaceWith(nuevo);

  v.PipView.onStateUpdate(estado(true));

  assert.strictEqual(chorro.pista.paradas, 1, "el chorro del Canvas viejo quedo vivo");
  assert.strictEqual(v.fondo.srcObject, chorro2, "el fondo no se paso al Canvas nuevo");
  assert.strictEqual(v.fondo.hidden, false, "el fondo se quedo escondido tras el relevo");
});

test("el rotulo de volver dice el sitio que toca", () => {
  /*
   * El fallo que arregla: la ventana decia «Volver a YouTube Music»
   * encima de Spotify. El rotulo sale del catalogo de verdad (el doble
   * de chrome.i18n contesta con el mismo archivo que Chrome) con el
   * nombre que el adaptador declara al registrarse.
   */
  const spotify = ventana();
  const rotuloSpotify = spotify.win.chrome.i18n.getMessage("volver_al_sitio", ["Spotify"]);
  assert.strictEqual(rotuloSpotify, "Volver a Spotify", "premisa: la clave con hueco existe");
  assert.strictEqual(spotify.volver.textContent, rotuloSpotify);
  assert.strictEqual(spotify.volver.getAttribute("aria-label"), rotuloSpotify);

  // Y en YouTube Music sigue diciendo lo de siempre, ahora por el registro.
  const ytm = ventana("controles-completos.html", null);
  assert.strictEqual(ytm.volver.textContent, "Volver a YouTube Music");
});
