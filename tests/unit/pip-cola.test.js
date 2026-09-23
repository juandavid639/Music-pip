/*
 * Pruebas del panel "Siguientes" en la ventana flotante.
 *
 * Dos cosas se fijan aqui. La primera es boba: que la lista pinte lo que
 * trae el estado y que el vacio tenga un mensaje en vez de un panel mudo.
 * La segunda es la que puede romperse sin que nadie mire: los dos paneles
 * —letra y cola— comparten el UNICO hueco elastico de la ventana, y todas
 * las reglas de convivencia (abrir uno cierra el otro, el karaoke no
 * reabre la letra encima de la cola) viven repartidas entre tres
 * funciones. Cada regla tiene aqui su vigilante.
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

  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    boton: doc.getElementById("ytmpip-queue-toggle"),
    panel: doc.getElementById("ytmpip-queue-panel"),
    lista: doc.getElementById("ytmpip-queue-list"),
    vacio: doc.getElementById("ytmpip-queue-empty"),
    botonLetras: doc.getElementById("ytmpip-lyrics-toggle"),
    panelLetras: doc.getElementById("ytmpip-lyrics-panel")
  };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

const DOS_CANCIONES = [
  { title: "Primera Siguiente", artist: "Ana Torroja" },
  { title: "Segunda Siguiente", artist: "Radio Futura" }
];

test("la lista pinta titulo y artista de lo que viene, en orden", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ upNext: DOS_CANCIONES }));

  assert.strictEqual(v.lista.hidden, false);
  assert.strictEqual(v.vacio.hidden, true, "con cola no hay nada que disculpar");

  const filas = Array.from(v.lista.children);
  assert.strictEqual(filas.length, 2);
  assert.strictEqual(filas[0].querySelector(".ytmpip-queue-title").textContent, "Primera Siguiente");
  assert.strictEqual(filas[0].querySelector(".ytmpip-queue-artist").textContent, "Ana Torroja");
  assert.strictEqual(filas[1].querySelector(".ytmpip-queue-title").textContent, "Segunda Siguiente");
});

test("sin cola: mensaje honesto en vez de una lista muda", () => {
  const v = ventana();
  // Primero CON cola, para que el vacio tenga que ganarse su sitio y no
  // este pasando solo porque el HTML nace asi.
  v.PipView.onStateUpdate(estado({ upNext: DOS_CANCIONES }));
  v.PipView.onStateUpdate(estado({ upNext: [] }));

  assert.strictEqual(v.lista.hidden, true);
  assert.strictEqual(v.vacio.hidden, false, "un panel vacio sin explicacion parece un boton roto");
});

test("el boton abre y cierra el panel, y lo cuenta en aria-expanded", () => {
  const v = ventana();
  assert.strictEqual(v.panel.hidden, true, "premisa: el panel nace cerrado");

  v.boton.click();
  assert.strictEqual(v.panel.hidden, false);
  assert.strictEqual(v.boton.getAttribute("aria-expanded"), "true");

  v.boton.click();
  assert.strictEqual(v.panel.hidden, true);
  assert.strictEqual(v.boton.getAttribute("aria-expanded"), "false");
});

test("abrir la cola cierra la letra: el hueco elastico es uno solo", () => {
  const v = ventana();
  v.botonLetras.click();
  assert.strictEqual(v.panelLetras.hidden, false, "premisa: la letra se abrio");

  v.boton.click();
  assert.strictEqual(v.panel.hidden, false);
  assert.strictEqual(v.panelLetras.hidden, true, "los dos paneles abiertos no caben: ninguno diria nada");
  assert.strictEqual(v.botonLetras.getAttribute("aria-expanded"), "false", "el boton de letras debe contarlo");
});

test("abrir la letra cierra la cola, por lo mismo", () => {
  const v = ventana();
  v.boton.click();
  assert.strictEqual(v.panel.hidden, false, "premisa: la cola se abrio");

  v.botonLetras.click();
  assert.strictEqual(v.panelLetras.hidden, false);
  assert.strictEqual(v.panel.hidden, true);
  assert.strictEqual(v.boton.getAttribute("aria-expanded"), "false");
});

test("el modo karaoke no reabre la letra encima de la cola", () => {
  /*
   * La mitad delicada. El karaoke abre el panel de letra por su cuenta en
   * cada render con letra disponible; si no mirase la cola, el clic del
   * usuario en "Siguientes" duraria exactamente un estado.
   */
  const conLetra = estado({
    upNext: DOS_CANCIONES,
    lyrics: { status: "available", text: "linea uno\nlinea dos", source: "youtube-music" }
  });

  const v = ventana();
  v.boton.click();
  v.PipView.onStateUpdate(conLetra);
  assert.strictEqual(v.panelLetras.hidden, true, "el karaoke le quito el hueco a la cola que el usuario pidio");
  assert.strictEqual(v.panel.hidden, false, "la cola debe seguir donde el usuario la dejo");

  // El control de la prueba: SIN la cola abierta ese mismo estado si abre
  // la letra. Sin esto, un karaoke roto del todo tambien pasaria la
  // asercion de arriba.
  const v2 = ventana();
  v2.PipView.onStateUpdate(conLetra);
  assert.strictEqual(v2.panelLetras.hidden, false, "premisa: el karaoke abre la letra cuando nada lo impide");
});
