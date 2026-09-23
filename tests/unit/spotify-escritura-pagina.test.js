/*
 * Pruebas de la ESCRITURA EN LA PAGINA (tanda de saltos y volumen de
 * Spotify): los metodos 40-42 del contrato (seekPageTo, setPageVolume,
 * getPageVolume), su enrutado en PlayerController (medio primero,
 * pagina despues) y el destape de los mandos en la ventana.
 *
 * Todo lo raro esta MEDIDO en vivo (2026-09-16, la pestaña real del
 * usuario, tools/diagnostico-seek-volumen.js):
 *  - el range de progreso habla en MILISEGUNDOS (max=161983 para 2:41)
 *    y va cuantizado a step=5000; el de volumen es 0..1 con step=0.1;
 *  - la escritura sintetica FUNCIONA: setter nativo del prototipo +
 *    evento 'input' burbujeando; el salto de +5 s SE OYO y el texto de
 *    posicion lo siguio; el volumen subio de forma audible;
 *  - hay DOS ranges señuelo en la pagina (LayoutResizer__resize-bar,
 *    los tiradores de ancho de los paneles): un selector generico de
 *    range escribe en un panel, no en la musica. El fixture los trae.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, entornoContenido, RAIZ } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

function rangos(win) {
  return {
    progreso: win.document.querySelector("[data-testid='playback-progressbar'] input"),
    volumen: win.document.querySelector("[data-testid='volume-bar'] input"),
    senuelos: Array.from(
      win.document.querySelectorAll("[data-testid='LayoutResizer__resize-bar'] input")
    )
  };
}

/** Entorno de Spotify con el controlador cargado ademas de los lectores. */
function spotifyConControlador() {
  const entorno = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  cargar(entorno.win, "src/content/player-controller.js");
  return entorno;
}

/* ==================================================================
 * 1. El adaptador: escribir donde se midio y en las unidades medidas
 * ================================================================== */

test("seekPageTo escribe MILISEGUNDOS en el range del testid y JAMAS en un señuelo", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  const { progreso, volumen, senuelos } = rangos(win);

  /*
   * La premisa que hace morder a la prueba: el fixture trae los CUATRO
   * ranges del censo. Sin los señuelos, un selector generico de range
   * pasaria en verde vigilando nada.
   */
  assert.strictEqual(
    win.document.querySelectorAll("input[type='range']").length,
    4,
    "premisa: el censo medido son 4 ranges (señuelo, progreso, volumen, señuelo)"
  );

  assert.strictEqual(YTMPip.Adapter.seekPageTo(115), true, "no pudo escribir");
  // 115 SEGUNDOS del contrato -> 115000 MILISEGUNDOS del DOM de Spotify.
  assert.strictEqual(progreso.value, "115000", "no convirtio a milisegundos");
  assert.strictEqual(senuelos[0].value, "280", "escribio en el tirador del panel izquierdo");
  assert.strictEqual(senuelos[1].value, "320", "escribio en el tirador del panel derecho");
  assert.strictEqual(volumen.value, "0.4", "el salto toco el volumen");
});

test("la escritura despacha 'input' y 'change' burbujeando: es lo que React escucha", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  const { progreso } = rangos(win);

  /*
   * Sin el evento, el value cambia y la pagina NI SE ENTERA (React lee
   * los cambios por su listener delegado, no mirando el DOM). El
   * diagnostico en vivo escribio value + input y la musica salto: las
   * dos mitades del truco son la medicion, y esta prueba vigila que
   * ninguna se caiga por separado.
   */
  const recibidos = { input: [], change: [] };
  win.document.addEventListener("input", (e) => recibidos.input.push(e.target));
  win.document.addEventListener("change", (e) => recibidos.change.push(e.target));

  YTMPip.Adapter.seekPageTo(30);

  /*
   * IDENTIDAD, no deepStrictEqual: dos nodos jsdom distintos comparan
   * "iguales" en profundidad (sin propiedades propias enumerables), y
   * con eso un evento salido del SEÑUELO pasaba por bueno. Lo destapo
   * el mutante del ancla generica en la primera pasada de mutaciones.
   */
  assert.strictEqual(recibidos.input.length, 1, "el 'input' no burbujeo hasta el documento");
  assert.strictEqual(recibidos.input[0], progreso, "el 'input' salio de otro range");
  assert.strictEqual(recibidos.change.length, 1, "el 'change' no burbujeo hasta el documento");
  assert.strictEqual(recibidos.change[0], progreso, "el 'change' salio de otro range");
});

test("la sonda (llamar sin valor) contesta que hay donde escribir SIN tocar nada", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  const { progreso, volumen } = rangos(win);

  let eventos = 0;
  win.document.addEventListener("input", () => (eventos += 1));

  assert.strictEqual(YTMPip.Adapter.seekPageTo(), true, "la sonda de saltos nego el range");
  assert.strictEqual(YTMPip.Adapter.setPageVolume(), true, "la sonda de volumen nego el range");
  assert.strictEqual(progreso.value, "20000", "la sonda MOVIO la cancion");
  assert.strictEqual(volumen.value, "0.4", "la sonda MOVIO el volumen");
  assert.strictEqual(eventos, 0, "la sonda desperto a la pagina");
});

test("sin range no se promete nada: false/false/null, con los señuelos AUN delante", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  win.document.querySelector("[data-testid='playback-progressbar']").remove();
  win.document.querySelector("[data-testid='volume-bar']").remove();

  // La premisa: quedan DOS ranges (los señuelos). Si los metodos
  // contestaran mirando "algun range de la pagina", aqui mentirian.
  const { senuelos } = rangos(win);
  assert.strictEqual(senuelos.length, 2, "premisa: los señuelos siguen en la pagina");

  assert.strictEqual(YTMPip.Adapter.seekPageTo(), false, "la sonda prometio saltos sin range");
  assert.strictEqual(YTMPip.Adapter.seekPageTo(60), false, "dijo que escribio sin range");
  assert.strictEqual(YTMPip.Adapter.setPageVolume(), false, "la sonda prometio volumen sin range");
  assert.strictEqual(YTMPip.Adapter.setPageVolume(0.5), false, "dijo que escribio sin range");
  assert.strictEqual(YTMPip.Adapter.getPageVolume(), null, "leyo un volumen de la nada");

  assert.strictEqual(senuelos[0].value, "280", "sin su range, escribio en un señuelo");
  assert.strictEqual(senuelos[1].value, "320", "sin su range, escribio en un señuelo");
});

/* ==================================================================
 * 2. El controlador: medio primero, pagina despues
 * ================================================================== */

test("los ±10 s sin medio van a la pagina, sumando sobre el tiempo QUE DICE la pagina", () => {
  const { win, YTMPip } = spotifyConControlador();
  const { progreso } = rangos(win);
  const TYPES = YTMPip.COMMAND_TYPES;

  // Premisa del fixture: el texto va por 0:19 (la verdad medida; el
  // value del range esta cuantizado a 20000 y por eso NO es la base).
  assert.strictEqual(YTMPip.TrackTimeline.read().elapsed, 19, "premisa: la pagina dice 0:19");

  YTMPip.PlayerController.execute({ type: TYPES.SEEK_FORWARD, seconds: 10 });
  assert.strictEqual(progreso.value, "29000", "19+10 s no acabaron en el range (en ms)");

  // El texto del fixture sigue diciendo 0:19: la resta parte de ahi.
  YTMPip.PlayerController.execute({ type: TYPES.SEEK_BACKWARD, seconds: 10 });
  assert.strictEqual(progreso.value, "9000", "19-10 s no acabaron en el range (en ms)");
});

test("SEEK_TO sin medio (el arrastre de la barra) acaba en el range, acotado a la pista", () => {
  const { win, YTMPip } = spotifyConControlador();
  const { progreso } = rangos(win);
  const TYPES = YTMPip.COMMAND_TYPES;

  YTMPip.PlayerController.execute({ type: TYPES.SEEK_TO, seconds: 100 });
  assert.strictEqual(progreso.value, "100000");

  // Fuera de la pista, la cota del controlador manda al final (161,983 s).
  YTMPip.PlayerController.execute({ type: TYPES.SEEK_TO, seconds: 500 });
  assert.strictEqual(Math.round(Number(progreso.value)), 161983, "se salio de la pista");

  // Y la porqueria de siempre no salta al principio: null no es 0.
  YTMPip.PlayerController.execute({ type: TYPES.SEEK_TO, seconds: null });
  assert.strictEqual(Math.round(Number(progreso.value)), 161983, "un seconds perdido movio la cancion");
});

test("SET_VOLUME sin medio escribe el deslizador 0..1 de la pagina, y el estado lo publica", () => {
  const { win, YTMPip } = spotifyConControlador();
  const { volumen } = rangos(win);
  const TYPES = YTMPip.COMMAND_TYPES;

  // El estado ANTES de tocar nada: 0.4 es lo que dice la pagina, no un
  // 1 inventado (el mando de la ventana pinta este numero).
  assert.strictEqual(YTMPip.MetadataReader.read().volume, 0.4, "el estado no publica el volumen de la pagina");

  YTMPip.PlayerController.execute({ type: TYPES.SET_VOLUME, level: 0.85 });
  // 0.85 tal cual: la cuantizacion a decimas (step=0.1) es de Spotify,
  // no nuestra; en la pagina real el value asentado seria 0.9.
  assert.strictEqual(volumen.value, "0.85");
  assert.strictEqual(YTMPip.MetadataReader.read().volume, 0.85, "el estado no siguio a la pagina");

  // Sin el range, el estado vuelve al 1 de siempre: no hay que inventar.
  win.document.querySelector("[data-testid='volume-bar']").remove();
  assert.strictEqual(YTMPip.MetadataReader.read().volume, 1);
});

test("regresion YTM: el volumen sigue escribiendose en su <video> y la via de pagina contesta que no", () => {
  const entorno = entornoContenido("controles-completos.html");
  cargar(entorno.win, "src/content/player-controller.js");
  const { win, YTMPip } = entorno;

  const media = win.document.querySelector("video");
  assert.ok(media, "premisa: el fixture de YTM trae su <video>");

  YTMPip.PlayerController.execute({ type: YTMPip.COMMAND_TYPES.SET_VOLUME, level: 0.5 });
  assert.strictEqual(media.volume, 0.5, "el volumen dejo de escribirse en el medio");

  // Y los metodos de pagina dicen la verdad de YTM: esa via no existe.
  assert.strictEqual(YTMPip.Adapter.seekPageTo(), false);
  assert.strictEqual(YTMPip.Adapter.setPageVolume(), false);
  assert.strictEqual(YTMPip.Adapter.getPageVolume(), null);
});

/* ==================================================================
 * 3. La ventana: destapar solo lo que tiene donde escribir
 * ================================================================== */

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
    "src/content/youtube-music-adapter.js",
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  win.Element.prototype.scrollTo = function () {};
  win.Element.prototype.scrollIntoView = function () {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    seek: doc.getElementById("ytmpip-seek"),
    adelantar: doc.getElementById("ytmpip-seek-forward"),
    retroceder: doc.getElementById("ytmpip-seek-backward"),
    volumen: doc.getElementById("ytmpip-volume"),
    silencio: doc.getElementById("ytmpip-mute"),
    velocidad: doc.getElementById("ytmpip-speed")
  };
}

// hasVideo false: el modo audio de Spotify, que es donde vive esta tanda
// (con true el escenario tomaria prestado un video a mitad de prueba).
function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false },
    extra
  );
}

test("en Spotify se destapan saltos y volumen (via pagina); silencio y velocidad NO", () => {
  const v = ventana();

  assert.strictEqual(v.adelantar.hidden, false, "el +10 s quedo escondido con range vivo");
  assert.strictEqual(v.retroceder.hidden, false, "el -10 s quedo escondido con range vivo");
  assert.strictEqual(v.volumen.hidden, false, "el volumen quedo escondido con range vivo");
  // El mute de la pagina no esta medido y la velocidad no tiene
  // deslizador: sin medio, siguen cayendo. Destaparlos seria mentir.
  assert.strictEqual(v.silencio.hidden, true, "el silencio se destapo sin via de escritura");
  assert.strictEqual(v.velocidad.hidden, true, "la velocidad se destapo sin via de escritura");

  // Y en YouTube Music los cinco siguen a la vista: medioEscribible
  // declarado true, sin mirar ningun DOM (la promesa de siempre).
  const ytm = ventana("controles-completos.html", null);
  [ytm.adelantar, ytm.retroceder, ytm.volumen, ytm.silencio, ytm.velocidad].forEach((el) => {
    assert.strictEqual(el.hidden, false, "un mando de YTM amanecio escondido");
  });
});

test("la barra se habilita por la via de pagina y el arrastre acaba en el range de Spotify", () => {
  const v = ventana();
  const progreso = v.win.document.querySelector("[data-testid='playback-progressbar'] input");

  v.PipView.onStateUpdate(estado({ currentTime: 19, duration: 161.983 }));
  assert.strictEqual(v.seek.disabled, false, "la barra quedo muerta con la via de pagina viva");

  // El arrastre del usuario: soltar dispara 'change' con el destino.
  v.seek.value = "100";
  v.seek.dispatchEvent(new v.win.Event("change", { bubbles: true }));
  assert.strictEqual(progreso.value, "100000", "el arrastre no acabo en el range de la pagina");

  // Si Spotify quita el range (o la barra aun no pinto), la barra de la
  // ventana vuelve a solo-lectura EN EL MISMO LATIDO, sin quedarse
  // prometiendo un arrastre que moriria en el adaptador.
  v.win.document.querySelector("[data-testid='playback-progressbar']").remove();
  v.PipView.onStateUpdate(estado({ currentTime: 19, duration: 161.983 }));
  assert.strictEqual(v.seek.disabled, true, "sin range la barra siguio prometiendo el arrastre");
});
