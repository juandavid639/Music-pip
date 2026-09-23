/*
 * Pruebas de la capa de tolerancia al "contexto invalidado".
 *
 * Cuando se recarga la extension desde chrome://extensions, los content
 * scripts ya inyectados quedan huerfanos: chrome.runtime sigue existiendo
 * pero chrome.runtime.id es undefined y sendMessage lanza de forma
 * SINCRONA. Un .catch() no atrapa un throw sincrono, asi que el error
 * escapaba y rompia el handler entero: se caia la sincronizacion de estado
 * y, por el mismo motivo, el boton "volver a YouTube Music".
 *
 * Ese fallo aparecio tres veces en manos del usuario. Aqui queda clavado.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, plano } = require("../helpers/entorno.js");

/** Ventana con solo constants.js + messages.js cargados. */
function entornoMensajes(opciones) {
  const { win } = crearEntorno(undefined, opciones);
  cargar(win, "src/shared/constants.js", "src/shared/messages.js");
  return win;
}

test("isContextValid: true con un runtime.id presente", () => {
  const win = entornoMensajes();
  assert.strictEqual(win.YTMPip.isContextValid(), true);
});

test("isContextValid: false cuando runtime.id es undefined", () => {
  const win = entornoMensajes({ contextoValido: false });
  assert.strictEqual(win.YTMPip.isContextValid(), false);
});

test("sendMessageSafe devuelve la respuesta cuando el contexto es valido", async () => {
  const win = entornoMensajes({ sendMessage: () => Promise.resolve({ ok: true, eco: 42 }) });
  const respuesta = await win.YTMPip.sendMessageSafe(win.YTMPip.createMessage("PRUEBA"));
  assert.deepStrictEqual(respuesta, { ok: true, eco: 42 });
});

test("sendMessageSafe no lanza con el contexto invalidado y avisa una vez", async () => {
  const win = entornoMensajes({ contextoValido: false });
  let avisos = 0;
  win.YTMPip.onContextInvalidated = () => {
    avisos += 1;
  };

  const respuesta = await win.YTMPip.sendMessageSafe(win.YTMPip.createMessage("PRUEBA"));

  assert.strictEqual(respuesta, null);
  assert.strictEqual(avisos, 1, "debia notificarse el contexto invalidado");
});

test("REGRESION: sendMessageSafe sobrevive a un throw SINCRONO de sendMessage", async () => {
  // El caso exacto del bug. runtime.id existe (el guardia previo no salta)
  // pero la llamada revienta al invocarse, antes de devolver promesa alguna.
  const win = entornoMensajes({
    sendMessage: () => {
      throw new Error("Extension context invalidated.");
    }
  });
  let aviso = false;
  win.YTMPip.onContextInvalidated = () => {
    aviso = true;
  };

  const respuesta = await win.YTMPip.sendMessageSafe(win.YTMPip.createMessage("PRUEBA"));

  assert.strictEqual(respuesta, null);
  assert.strictEqual(aviso, true, "un throw sincrono tambien debe marcar el contexto como muerto");
});

test("sendMessageSafe absorbe una promesa rechazada (sin receptor al otro lado)", async () => {
  const win = entornoMensajes({
    sendMessage: () => Promise.reject(new Error("Could not establish connection."))
  });
  const respuesta = await win.YTMPip.sendMessageSafe(win.YTMPip.createMessage("PRUEBA"));
  assert.strictEqual(respuesta, null);
});

test("sendMessageSafe funciona aunque nadie haya definido onContextInvalidated", async () => {
  const win = entornoMensajes({ contextoValido: false });
  // pip.js se carga antes que content-script.js: hay una ventana real en la
  // que el hook todavia no existe.
  assert.strictEqual(win.YTMPip.onContextInvalidated, undefined);
  assert.strictEqual(await win.YTMPip.sendMessageSafe({ type: "PRUEBA" }), null);
});

test("getURLSafe devuelve cadena vacia si chrome.runtime.getURL lanza", () => {
  const win = entornoMensajes();
  // getURL tambien lanza con el contexto invalidado, y render() lo llamaba
  // para la portada de reemplazo: habria roto el modo degradado que
  // precisamente intentaba rescatar la situacion.
  win.chrome.runtime.getURL = () => {
    throw new Error("Extension context invalidated.");
  };
  assert.strictEqual(win.YTMPip.getURLSafe("assets/icon.png"), "");
});

test("getURLSafe resuelve la ruta normalmente cuando todo esta bien", () => {
  const win = entornoMensajes();
  assert.strictEqual(
    win.YTMPip.getURLSafe("src/pip/pip.css"),
    "chrome-extension://id-de-prueba/src/pip/pip.css"
  );
});

test("createMessage y createCommand adjuntan el tipo sin perder la carga", () => {
  const win = entornoMensajes();
  assert.deepStrictEqual(plano(win.YTMPip.createMessage("STATE_UPDATE", { state: { title: "x" } })), {
    type: "STATE_UPDATE",
    state: { title: "x" }
  });
  assert.deepStrictEqual(plano(win.YTMPip.createCommand("SEEK_FORWARD", { seconds: 15 })), {
    type: "SEEK_FORWARD",
    seconds: 15
  });
  assert.deepStrictEqual(plano(win.YTMPip.createCommand("PLAY")), { type: "PLAY" });
});
