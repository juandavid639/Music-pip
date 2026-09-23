/*
 * Pruebas de la tanda H: el microfono de EMERGENCIA de la cabecera.
 *
 * EL SINTOMA REPORTADO (palabras del usuario): "no aparece la opcion de
 * activar la letra y la cancion si tenia la letra", con un pantallazo de
 * Spotify en una ventana bajita. El diagnostico: el boton «Letras» vive
 * en la fila de extras y la densidad mini (alto < 310 px) la esconde
 * entera con display:none; en Spotify con la vista de letras de la
 * pagina cerrada el lector se queda en LOADING (cero lineas) y tampoco
 * hay karaoke bajo el titulo. Una ventana baja quedaba SIN NINGUNA
 * entrada a la letra.
 *
 * El arreglo es un boton 🎤 en la cabecera (que sobrevive a todas las
 * densidades) con el MISMO manejador que «Letras», visible solo cuando
 * no hay otra entrada a la vista:
 *  - en mini (con la ventana alta la fila «Letras» ya se ve);
 *  - sin el boton de escenario ofreciendo ya el microfono (con letra
 *    disponible y sin video, aquel pinta el MISMO dibujo para la letra
 *    en grande: dos dibujos iguales con significados distintos es el
 *    fallo contra el que avisa iconos.js);
 *  - con las letras permitidas en preferencias (la misma llave que
 *    esconde el boton «Letras», leida del hidden que esa llave ya
 *    escribio).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

/** Cuenta clics sin depender de que el boton haga nada. */
function espiarClic(el) {
  const registro = { veces: 0 };
  el.addEventListener("click", () => (registro.veces += 1));
  return registro;
}

/** Deja la vista de letras de Spotify CERRADA (el fixture la trae abierta). */
function cerrarVistaDeSpotify(win) {
  const boton = win.document.querySelector("[data-testid='lyrics-button']");
  boton.setAttribute("aria-pressed", "false");
  boton.removeAttribute("data-active");
  return boton;
}

/*
 * jsdom da innerWidth/innerHeight en el prototipo, no en el objeto, asi
 * que asignarlas no hace nada: hay que redefinirlas (mismo apaño que
 * pip-tamano-recordado.test.js). Sin esto measure() daria siempre los
 * 1024x768 de fabrica y mini no existiria en estas pruebas.
 */
function conTamano(win, width, height) {
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: height, configurable: true });
}

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
    "src/content/lyrics-reader.js",
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
    banco: win.YTMPip.PipView.__bancoDePruebas,
    Settings: win.YTMPip.Settings,
    mic: doc.getElementById("ytmpip-mic-toggle"),
    panel: doc.getElementById("ytmpip-lyrics-panel"),
    root: doc.getElementById("ytmpip-root")
  };
}

/** Deja la ventana en densidad mini de verdad: por el camino de applyDensity. */
function enMini(v) {
  conTamano(v.win, 320, 280); // alto < HEIGHT_MINI (310)
  v.banco.vigilarTamano(); // corre applyDensity, que pone la clase y repasa el mic
}

test("EL SINTOMA: en mini el 🎤 aparece, porque es la unica entrada a la letra que queda", () => {
  const v = ventana();
  assert.strictEqual(v.mic.hidden, true, "premisa: el boton nace oculto en el HTML");

  enMini(v);

  assert.strictEqual(v.root.classList.contains("ytmpip-mini"), true, "premisa: la densidad es mini");
  assert.strictEqual(v.mic.hidden, false, "en mini sin otra entrada, el 🎤 tiene que verse");
});

test("con la ventana alta el 🎤 sobra: la fila «Letras» ya esta a la vista", () => {
  const v = ventana();
  enMini(v);
  assert.strictEqual(v.mic.hidden, false, "premisa: en mini se ve");

  conTamano(v.win, 360, 500);
  v.win.dispatchEvent(new v.win.Event("resize")); // el mismo camino real

  assert.strictEqual(v.mic.hidden, true, "con la fila «Letras» visible seria el mismo boton dos veces");
});

test("si el boton de escenario ya ofrece el microfono (rol letra), el de cabecera se esconde", () => {
  /*
   * Con letra disponible y sin video, el boton de escenario pinta el
   * MISMO dibujo para otra cosa (la letra en grande). Dos microfonos con
   * significados distintos es el fallo documentado en iconos.js, asi que
   * el de cabecera cede: ya hay una entrada al microfono a la vista.
   */
  const v = ventana();
  enMini(v);
  assert.strictEqual(v.mic.hidden, false, "premisa: en mini sin rol se ve");

  v.banco.pintarEscenario(false, true); // sin video, con letra -> rol "letra"
  assert.strictEqual(v.mic.hidden, true, "dos microfonos a la vez en la cabecera");

  v.banco.pintarEscenario(true, true); // con video el rol es "video": no hay microfono ajeno
  assert.strictEqual(v.mic.hidden, false, "con rol video el 🎤 vuelve a ser la unica entrada");
});

test("letras apagadas en preferencias apagan tambien el 🎤, al momento", () => {
  const v = ventana();
  enMini(v);
  assert.strictEqual(v.mic.hidden, false, "premisa: en mini se ve");

  v.banco.aplicarPreferencias(
    Object.assign({}, v.Settings.get(), { lyricsPreference: "hidden" })
  );

  assert.strictEqual(v.mic.hidden, true, "la llave que esconde «Letras» no llego al 🎤");
});

test("el clic del 🎤 es el manejador de «Letras» de verdad: abre el panel y respeta la fase", () => {
  /*
   * La regla de la tanda F entera, pulsada desde el boton nuevo: al
   * ABRIR se pulsa el boton de la pagina (la vista estaba cerrada); al
   * CERRAR no se toca. Si el 🎤 llevara una copia del manejador en vez
   * del original, esta prueba vigilaria que la copia no divergiera.
   */
  const v = ventana();
  const botonPagina = cerrarVistaDeSpotify(v.win);
  const clics = espiarClic(botonPagina);
  enMini(v);

  v.mic.click(); // abrir
  assert.strictEqual(v.panel.hidden, false, "el 🎤 no abrio el panel");
  assert.strictEqual(clics.veces, 1, "abrir desde el 🎤 no abrio la vista de la pagina");
  assert.strictEqual(v.mic.getAttribute("aria-expanded"), "true", "el 🎤 no anuncia el panel abierto");

  v.mic.click(); // cerrar
  assert.strictEqual(v.panel.hidden, true, "el 🎤 no cerro el panel");
  assert.strictEqual(clics.veces, 1, "el cierre volvio a pulsar el boton de la pagina (contrafase)");
  assert.strictEqual(v.mic.getAttribute("aria-expanded"), "false", "el 🎤 sigue anunciando abierto");
});

test("abrir con «Letras» tambien enciende el aria del 🎤: dos mandos del mismo panel dicen lo mismo", () => {
  const v = ventana();

  v.banco.pulsarLetras();

  assert.strictEqual(v.panel.hidden, false, "premisa: el panel se abrio");
  assert.strictEqual(v.mic.getAttribute("aria-expanded"), "true", "el 🎤 se quedo diciendo cerrado");
});
