/*
 * ABRIR LA VENTANA DE VERDAD: openPip entero, y lo que una ventana le
 * deja (o no) a la siguiente.
 *
 * Hasta la tanda U, openPip no lo ejecutaba ninguna prueba: necesita
 * documentPictureInPicture y jsdom no lo tiene, asi que el banco de
 * pip.js monta los elementos sobre un documento cualquiera y se salta la
 * apertura. Y en la apertura vivian los fallos que la auditoria del
 * 2026-09-28 encontro: variables que recuerdan algo de la ventana ANTERIOR
 * (la barra congelada, la cola vacia, el «Ahora suena» al abrir) y dos
 * aperturas que se pisan.
 *
 * EL DOBLE. `documentPictureInPicture.requestWindow` devuelve una segunda
 * ventana jsdom, y `fetch` sirve pip.html del disco. Cerrar es lo que hace
 * Chrome: `closed` a true y un `pagehide`. Todo lo demas —cablear, aplicar
 * preferencias, el latido de 300 ms— corre tal cual.
 *
 * LO QUE NO: la activacion de usuario (el doble no la pide) ni que Chrome
 * cierre la primera ventana al pedir otra.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

const PLANTILLA = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

function pagina() {
  const { win } = crearEntorno(undefined);
  const pedidas = [];

  win.fetch = async () => ({ text: async () => PLANTILLA });
  win.documentPictureInPicture = {
    requestWindow: async (opciones) => {
      const { win: ventana } = crearEntorno(undefined);
      ventana.resizeTo = () => {};
      ventana.focus = () => {};
      /*
       * Cerrar como Chrome: `pagehide` y `closed`. Y DESPUES el cierre real
       * de jsdom, que no es opcional: la red de tests/helpers/entorno.js
       * cierra las ventanas llamando a este mismo `close`, y si no llegara
       * al de jsdom el latido de 300 ms de openPip seguiria vivo y colgaria
       * el archivo entero (paso en la primera version de este banco).
       */
      const cerrarDeVerdad = ventana.close.bind(ventana);
      ventana.close = () => {
        if (ventana.cerrada) return;
        ventana.cerrada = true;
        ventana.dispatchEvent(new ventana.Event("pagehide"));
        Object.defineProperty(ventana, "closed", { value: true, configurable: true });
        cerrarDeVerdad();
      };
      pedidas.push({ ventana, opciones });
      return ventana;
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

  const PipView = win.YTMPip.PipView;
  return {
    win,
    PipView,
    pedidas,
    async abrir() {
      await PipView.open();
      const ventana = pedidas[pedidas.length - 1].ventana;
      return { ventana, doc: ventana.document, $: (id) => ventana.document.getElementById(id) };
    }
  };
}

function estado(extra) {
  return Object.assign(
    {
      connected: true,
      playing: true,
      title: "Rebelión",
      artist: "Joe Arroyo",
      hasVideo: false,
      lyrics: {},
      currentTime: 30,
      duration: 200
    },
    extra
  );
}

test("el doble abre de verdad: openPip monta la plantilla en la ventana que devuelve", async () => {
  const p = pagina();
  const v = await p.abrir();
  assert.ok(v.$("ytmpip-root"), "la ventana nueva no tiene la plantilla");
});

test("REGRESION TANDA U: dos aperturas seguidas piden UNA ventana y comparten la promesa", async () => {
  const p = pagina();
  const a = p.PipView.open();
  const b = p.PipView.open();
  assert.strictEqual(a, b, "la segunda peticion no espero a la primera");
  await a;
  assert.strictEqual(p.pedidas.length, 1, "se pidieron dos ventanas");
});

test("terminada la apertura, se puede volver a abrir tras cerrar", async () => {
  const p = pagina();
  const v = await p.abrir();
  v.ventana.close();
  await p.abrir();
  assert.strictEqual(p.pedidas.length, 2);
});

test("REGRESION TANDA U: la cola se pinta en la ventana nueva aunque no haya cambiado", async () => {
  const cola = [{ title: "Tania", artist: "Joe Arroyo" }];
  const p = pagina();
  const v1 = await p.abrir();
  p.PipView.onStateUpdate(estado({ upNext: cola }));
  assert.strictEqual(v1.$("ytmpip-queue-list").children.length, 1, "premisa: la primera ventana pinta la cola");
  v1.ventana.close();

  const v2 = await p.abrir();
  p.PipView.onStateUpdate(estado({ upNext: cola }));
  assert.strictEqual(v2.$("ytmpip-queue-list").children.length, 1, "la ventana nueva se quedo sin cola");
  assert.strictEqual(v2.$("ytmpip-queue-empty").hidden, true, "la ventana nueva dice que no hay cola");
});

test("REGRESION TANDA U: cerrar a mitad de un arrastre no congela la barra de la ventana siguiente", async () => {
  const p = pagina();
  const v1 = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 30 }));
  // Dedo abajo en la barra... y la ventana se cierra sin soltar.
  v1.$("ytmpip-seek").dispatchEvent(new v1.ventana.Event("pointerdown"));
  v1.ventana.close();

  const v2 = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 120 }));
  assert.strictEqual(Number(v2.$("ytmpip-seek").value), 120, "la barra nacio congelada");
});

test("REGRESION TANDA U: cerrar a mitad de mover el volumen no congela el volumen de la ventana siguiente", async () => {
  const p = pagina();
  const v1 = await p.abrir();
  p.PipView.onStateUpdate(estado({ volume: 0.5 }));
  const vol = v1.$("ytmpip-volume");
  vol.value = 80;
  vol.dispatchEvent(new v1.ventana.Event("input"));
  v1.ventana.close();

  const v2 = await p.abrir();
  p.PipView.onStateUpdate(estado({ volume: 0.3 }));
  assert.strictEqual(Number(v2.$("ytmpip-volume").value), 30, "el volumen nacio congelado");
});

test("REGRESION TANDA U: la primera cancion de una ventana reabierta no se anuncia como cambio", async () => {
  const p = pagina();
  const v1 = await p.abrir();
  p.PipView.onStateUpdate(estado({ title: "Rebelión" }));
  v1.ventana.close();
  // La musica sigue con la ventana cerrada.
  p.PipView.onStateUpdate(estado({ title: "Tania" }));

  const v2 = await p.abrir();
  p.PipView.onStateUpdate(estado({ title: "Tania" }));
  assert.strictEqual(v2.$("ytmpip-anuncio").textContent, "", "se anuncio como cambio la cancion con que nace la ventana");
});

test("...pero un cambio de verdad dentro de la ventana si se anuncia", async () => {
  const p = pagina();
  const v = await p.abrir();
  p.PipView.onStateUpdate(estado({ title: "Rebelión" }));
  p.PipView.onStateUpdate(estado({ title: "Tania" }));
  assert.match(v.$("ytmpip-anuncio").textContent, /Tania/);
});

test("la ventana declara el idioma de sus textos", async () => {
  const p = pagina();
  const v = await p.abrir();
  assert.strictEqual(v.doc.documentElement.getAttribute("lang"), "es");
});

/* ==================================================================
 * La barra de tiempo con teclado
 * ================================================================== */

function tecla(v, el, tipo, key) {
  el.dispatchEvent(new v.ventana.KeyboardEvent(tipo, { key, bubbles: true }));
}

test("REGRESION TANDA U: un atajo pulsado con el foco en la barra no la congela", async () => {
  // Tras un clic el foco se queda en la barra; N es «siguiente cancion» y
  // no mueve el deslizador, asi que `change` no llega nunca.
  const p = pagina();
  const v = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 30 }));
  tecla(v, v.$("ytmpip-seek"), "keydown", "n");
  p.PipView.onStateUpdate(estado({ title: "Tania", currentTime: 5 }));
  assert.strictEqual(Number(v.$("ytmpip-seek").value), 5, "la barra se quedo en la cancion anterior");
});

test("REGRESION TANDA U: Inicio en el segundo cero no deja la barra congelada al soltar", async () => {
  // Inicio SI es del deslizador, pero en el cero no cambia nada: sin
  // `change`, solo el keyup puede terminar.
  const p = pagina();
  const v = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 0 }));
  tecla(v, v.$("ytmpip-seek"), "keydown", "Home");
  tecla(v, v.$("ytmpip-seek"), "keyup", "Home");
  p.PipView.onStateUpdate(estado({ currentTime: 42 }));
  assert.strictEqual(Number(v.$("ytmpip-seek").value), 42);
});

test("...y mientras la flecha esta pulsada, la barra no se mueve por debajo del dedo", async () => {
  const p = pagina();
  const v = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 30 }));
  tecla(v, v.$("ytmpip-seek"), "keydown", "ArrowRight");
  p.PipView.onStateUpdate(estado({ currentTime: 90 }));
  assert.strictEqual(Number(v.$("ytmpip-seek").value), 30, "la barra se movio mientras se arrastraba con el teclado");
});

test("el tiempo se lee en el idioma del catalogo, no con un «de» escrito a mano", async () => {
  // Con el catalogo español, «de» escrito a mano y «de» del catalogo son
  // indistinguibles: se le da a la clave una respuesta en ingles.
  const p = pagina();
  const original = p.win.chrome.i18n.getMessage;
  p.win.chrome.i18n.getMessage = (clave, subs) =>
    clave === "tiempo_de_total" ? subs[0] + " of " + subs[1] : original(clave, subs);
  const v = await p.abrir();
  p.PipView.onStateUpdate(estado({ currentTime: 62, duration: 220 }));
  assert.strictEqual(v.$("ytmpip-seek").getAttribute("aria-valuetext"), "1:02 of 3:40");
});

/* ==================================================================
 * La linea en vivo, con teclado
 * ================================================================== */

test("REGRESION TANDA U: la linea en vivo es un boton para el teclado tambien", async () => {
  const p = pagina();
  const v = await p.abrir();
  const linea = v.$("ytmpip-now-line");
  assert.strictEqual(linea.getAttribute("role"), "button");
  assert.strictEqual(linea.getAttribute("tabindex"), "0");

  const panel = v.$("ytmpip-lyrics-panel");
  assert.strictEqual(panel.hidden, true, "premisa: la letra completa empieza cerrada");
  tecla(v, linea, "keydown", "Enter");
  assert.strictEqual(panel.hidden, false, "Enter sobre la linea en vivo no abrio la letra");
});
