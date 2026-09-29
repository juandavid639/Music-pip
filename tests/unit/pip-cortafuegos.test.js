/*
 * EL CORTAFUEGOS DE LA VENTANA (tanda AH).
 *
 * De donde sale. render() pinta una docena de cosas seguidas (estado,
 * modo video, escenario, fondo Canvas, espectro, titulo, caratula, barra,
 * extras, letra, cola) y el bucle de fotogramas otras tres (espectro,
 * pulso, halo). Hasta aqui, una excepcion en cualquiera de ellas se
 * llevaba por delante TODO lo que venia detras: un cambio del DOM de
 * YouTube que rompiera la lectura del fondo Canvas dejaba la ventana con
 * el titulo de la cancion anterior para siempre, y un lienzo que fallara
 * cortaba la cadena de fotogramas y con ella el pulso y el halo.
 *
 * La regla: cada seccion va aislada. Si falla, se apunta UNA vez en la
 * consola (con la traza, para poder arreglarla) y las demas siguen. Una
 * vez y no en cada repintado: render corre varias veces por segundo, y un
 * error repetido cuatro veces por segundo tapa cualquier otro mensaje.
 *
 * LO QUE NO: arreglar el fallo. El cortafuegos no oculta errores, los
 * contiene; la seccion rota sigue rota hasta que alguien lea la consola.
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
  const fotogramas = [];
  win.requestAnimationFrame = (fn) => fotogramas.push(fn);
  win.cancelAnimationFrame = () => {};

  const errores = [];
  win.console.error = (...args) => errores.push(args);

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);
  return { win, doc, banco, errores, PipView: win.YTMPip.PipView, $: (id) => doc.getElementById(id) };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "Rebelión", artist: "Joe Arroyo", hasVideo: false, lyrics: {} },
    extra
  );
}

/* Un estado cuyo campo `hasVideo` revienta al leerlo: rompe las secciones
 * que lo miran (el modo video va de las primeras) y no las demas. */
function estadoEnvenenado(extra) {
  const s = estado(extra);
  Object.defineProperty(s, "hasVideo", {
    get() {
      throw new Error("hasVideo roto a proposito");
    }
  });
  return s;
}

test("una seccion rota no se lleva por delante el titulo, que va despues", () => {
  const v = ventana();
  assert.doesNotThrow(() => v.PipView.onStateUpdate(estadoEnvenenado({ title: "Tania" })));
  assert.strictEqual(v.$("ytmpip-title").textContent, "Tania", "el titulo se quedo sin pintar");
  assert.strictEqual(v.$("ytmpip-artist").textContent, "Joe Arroyo");
});

test("el fallo se apunta en la consola, con el error y el nombre de la seccion", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estadoEnvenenado());
  assert.ok(v.errores.length >= 1, "el fallo paso en silencio");
  const [texto, error] = v.errores[0];
  assert.match(String(texto), /^\[YTMPip\] .+/);
  assert.match(String(error && error.message), /hasVideo roto a proposito/);
});

test("UNA vez por seccion: repintar con el mismo fallo no llena la consola", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estadoEnvenenado());
  const primera = v.errores.length;
  v.PipView.onStateUpdate(estadoEnvenenado());
  v.PipView.onStateUpdate(estadoEnvenenado());
  assert.strictEqual(v.errores.length, primera, "cada repintado volvio a escribir el mismo error");
});

test("pasado el fallo, la ventana sigue pintando con normalidad", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estadoEnvenenado({ title: "Tania" }));
  v.PipView.onStateUpdate(estado({ title: "En Barranquilla me quedo" }));
  assert.strictEqual(v.$("ytmpip-title").textContent, "En Barranquilla me quedo");
});

test("un lienzo que revienta no tumba el fotograma", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado());
  const lienzo = v.$("ytmpip-spectrum");
  lienzo.hidden = false;
  lienzo.getBoundingClientRect = () => ({ width: 200, height: 40 });
  lienzo.getContext = () => {
    throw new Error("lienzo roto a proposito");
  };
  assert.doesNotThrow(() => v.banco.unFotograma(6000));
  assert.ok(
    v.errores.some((e) => /lienzo roto a proposito/.test(String(e[1] && e[1].message))),
    "el fallo del lienzo no se apunto"
  );
  const tras = v.errores.length;
  v.banco.unFotograma(6016);
  assert.strictEqual(v.errores.length, tras, "cada fotograma volvio a escribir el mismo error");
});
