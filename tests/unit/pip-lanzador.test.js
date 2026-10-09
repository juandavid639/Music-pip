/*
 * Pruebas del boton lanzador y del contrato que el service worker usa
 * para llamarlo.
 *
 * EL FALLO REPORTADO: al pulsar el icono de la extension aparecia
 * "Uncaught (in promise) NotAllowedError: ... requires user activation",
 * con una traza que señalaba pip.js:792 (showSeekPreview), que no tiene
 * absolutamente nada que ver. Un rechazo de promesa sin dueño se cuelga
 * del fotograma que pille, y esa linea era ruido.
 *
 * La causa estaba en el service worker: llamaba a `PipView.open()` sin
 * atender el rechazo y devolvia "opened" sin esperar. De ahi salen las dos
 * cosas que aqui se fijan:
 *
 *  1. `open()` devuelve algo con `.then`. Si dejara de ser async, el
 *     `.then(ok, err)` que ahora hay dentro de la pagina reventaria y el
 *     rechazo volveria a escaparse.
 *  2. `destacarLanzador()` existe y hace su trabajo, porque es lo unico
 *     util que le queda al icono cuando la API le dice que no.
 *
 * Lo que NO se prueba aqui: que Chrome no propague la activacion de
 * usuario del icono. Eso no es codigo nuestro y no hay forma de montarlo
 * en jsdom; lo demostro el error del usuario en chrome://extensions.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, leerFixture } = require("../helpers/entorno.js");

function pagina() {
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
  return { win, doc: win.document, PipView: win.YTMPip.PipView };
}

const ID = "ytmpip-launcher";

test("EL CASO DEL FALLO: destacar el lanzador lo crea si no esta y avisa de que se pudo", () => {
  const p = pagina();
  const previo = p.doc.getElementById(ID);
  if (previo) previo.remove();
  assert.equal(p.doc.getElementById(ID), null, "premisa: la pagina empieza sin boton");

  assert.equal(p.PipView.destacarLanzador(), true);

  const btn = p.doc.getElementById(ID);
  assert.ok(btn, "el boton tiene que existir despues de destacarlo");
  assert.equal(btn.textContent, "PiP");
});

test("destacar dos veces no deja dos botones en la pagina", () => {
  const p = pagina();
  p.PipView.destacarLanzador();
  p.PipView.destacarLanzador();
  assert.equal(p.doc.querySelectorAll(`#${ID}`).length, 1);
});

test("sin Element.animate no revienta: el adorno no puede tumbar el aviso", () => {
  /*
   * jsdom no implementa animate, que es justo el caso que esta guarda
   * cubre. Se comprueba sin tocar nada: si la guarda desapareciera, esta
   * llamada lanzaria TypeError.
   */
  const p = pagina();
  p.PipView.destacarLanzador();
  const btn = p.doc.getElementById(ID);
  assert.equal(typeof btn.animate, "undefined", "premisa: en jsdom el boton no sabe animarse");

  assert.equal(p.PipView.destacarLanzador(), true);
});

test("sin <body> no hay boton que destacar, y se dice que no en vez de reventar", () => {
  /*
   * ensureLauncherButton se planta si no hay body, asi que destacarLanzador
   * se queda sin boton. Es la unica forma de llegar ahi, y la mutacion
   * "dice que si aunque no haya boton" sobrevivio hasta que existio esta
   * prueba: el valor devuelto no lo comprobaba nadie.
   */
  const p = pagina();
  p.doc.body.remove();
  assert.equal(p.doc.body, null, "premisa: la pagina se ha quedado sin body");

  assert.equal(p.PipView.destacarLanzador(), false);
});

test("cuando el navegador si sabe animar, se anima el boton", () => {
  const p = pagina();
  p.PipView.destacarLanzador();
  const btn = p.doc.getElementById(ID);

  const llamadas = [];
  btn.animate = (fotogramas, opciones) => {
    llamadas.push({ fotogramas, opciones });
    return { cancel() {} };
  };

  assert.equal(p.PipView.destacarLanzador(), true);
  assert.equal(llamadas.length, 1, "se anima una vez por aviso");
  assert.ok(llamadas[0].fotogramas.length >= 2, "una animacion necesita al menos dos fotogramas");
  assert.ok(llamadas[0].opciones.iterations > 1, "un solo parpadeo se pierde de vista");
});

test("open() devuelve una promesa: es de lo que cuelga el service worker para atender el rechazo", () => {
  /*
   * En jsdom no hay documentPictureInPicture, asi que open() se va por la
   * rama de respaldo. Da igual: lo que se fija aqui es la FORMA, que es lo
   * que el service worker necesita para poder poner su .then(ok, err).
   */
  const p = pagina();
  const devuelto = p.PipView.open();
  assert.equal(typeof devuelto.then, "function");
  return devuelto;
});

/* ==================================================================
 * La tanda T: dos mundos en la misma pagina.
 *
 * Desde que el service worker reinyecta los content scripts al instalar y
 * al actualizar, una pestaña que no se recargo tiene el mundo HUERFANO de
 * la version anterior y el mundo VIVO de la nueva, con un solo DOM. El
 * huerfano ya dejo su boton, y ese boton no abre nada (sin extension viva
 * `openPip` se niega). Aqui el boton del huerfano se simula con uno
 * cualquiera con el mismo id, que es todo lo que el mundo vivo puede ver
 * de el: los listeners de otro mundo no se ven desde este.
 * ================================================================== */

function paginaConBotonAjeno(opciones = {}) {
  const { win } = crearEntorno(
    `<!doctype html><html><body><button id="${ID}">huerfano</button></body></html>`,
    opciones
  );
  const ajeno = win.document.getElementById(ID);
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
  // La reinyeccion solo toca paginas ya cargadas (readyState "complete"),
  // donde pip.js pone el boton en el acto. En jsdom el documento recien
  // hecho sigue en "loading" y lo dejaria para DOMContentLoaded: se hace
  // aqui la llamada que en la pagina real ya habria ocurrido.
  win.YTMPip.PipView.ensureLauncher();
  return { win, doc: win.document, PipView: win.YTMPip.PipView, ajeno };
}

test("REGRESION TANDA T: el mundo vivo adopta el boton que dejo el huerfano", () => {
  const p = paginaConBotonAjeno();
  const botones = p.doc.querySelectorAll(`#${ID}`);
  assert.equal(botones.length, 1, "dos botones PiP en la pagina");
  assert.notStrictEqual(botones[0], p.ajeno, "sigue el boton del huerfano, que no abre nada");
  assert.equal(p.ajeno.isConnected, false, "el boton del huerfano sigue colgado del DOM");
  assert.equal(botones[0].textContent, "PiP");
});

test("adoptado el boton, las siguientes mutaciones no lo vuelven a cambiar", () => {
  // El observer llama a ensureLauncher con cada lote de mutaciones: si el
  // boton propio no se reconociera, se reharia en cada una.
  const p = paginaConBotonAjeno();
  const propio = p.doc.getElementById(ID);
  p.PipView.ensureLauncher();
  p.PipView.ensureLauncher();
  assert.strictEqual(p.doc.getElementById(ID), propio);
});

test("un mundo HUERFANO no pone boton ni roba el ajeno (si no, los dos se lo quitarian para siempre)", () => {
  const p = paginaConBotonAjeno({ contextoValido: false });
  p.PipView.ensureLauncher();
  assert.strictEqual(p.doc.getElementById(ID), p.ajeno, "el huerfano le quito el boton al mundo vivo");
  assert.equal(p.doc.querySelectorAll(`#${ID}`).length, 1);
});

/* ---------- Que dice open() (tanda AF) ---------- */

test("REGRESION TANDA AF: sin Document PiP, open() dice «respaldo» y pide la ventana de respaldo", async () => {
  const enviados = [];
  const { win } = crearEntorno(leerFixture("controles-completos.html"), {
    sendMessage: (m) => {
      enviados.push(m.type);
      return Promise.resolve({ ok: true });
    }
  });
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
  assert.strictEqual("documentPictureInPicture" in win, false, "premisa: jsdom no trae Document PiP");
  assert.strictEqual(await win.YTMPip.PipView.open(), "respaldo");
  assert.ok(enviados.includes("OPEN_FALLBACK_WINDOW"));
});

test("...y con la extension recargada, open() dice «sin-extension» en vez de fingir que abrio", async () => {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), { contextoValido: false });
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
  assert.strictEqual(await win.YTMPip.PipView.open(), "sin-extension");
});

/* ==================================================================
 * TANDA AZ: la pagina entera como boton, unos segundos
 *
 * El menu del icono no puede abrir la ventana (su clic no es de la
 * pagina). El service worker trae la pestaña al frente y pide esto: el
 * siguiente clic en cualquier sitio abre la ventana.
 * ================================================================== */

const CAPA = "ytmpip-clic-para-abrir";

// Un requestWindow que solo cuenta: la apertura de verdad se prueba en
// pip-apertura; aqui importa QUIEN la pide y CUANDO.
function conVentanaFalsa(p) {
  const pedidas = [];
  p.win.documentPictureInPicture = {
    requestWindow: (o) => {
      pedidas.push(o);
      return Promise.reject(Object.assign(new Error("de prueba"), { name: "AbortError" }));
    }
  };
  return pedidas;
}

function paginaConVentana() {
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
  win.console.error = () => {};
  return { win, doc: win.document, PipView: win.YTMPip.PipView };
}

test("TANDA AZ: el siguiente clic en la pagina abre la ventana, y la capa se va", async () => {
  const p = paginaConVentana();
  const pedidas = conVentanaFalsa(p);
  assert.equal(p.PipView.esperarClicParaAbrir(), true);
  const capa = p.doc.getElementById(CAPA);
  assert.ok(capa, "la capa tapa la pagina");
  assert.equal(capa.style.position, "fixed");

  let llegoALaPagina = false;
  p.doc.body.addEventListener("click", () => (llegoALaPagina = true));
  capa.click();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(pedidas.length, 1, "el clic pidio la ventana");
  assert.equal(p.doc.getElementById(CAPA), null, "la capa se quita al usarla");
  assert.equal(llegoALaPagina, false, "el clic no le llega a la pagina: nada de pausar sin querer");
});

test("Esc quita la capa sin abrir nada", async () => {
  const p = paginaConVentana();
  const pedidas = conVentanaFalsa(p);
  p.PipView.esperarClicParaAbrir();
  p.doc.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(p.doc.getElementById(CAPA), null);
  assert.equal(pedidas.length, 0);
});

test("con el teclado: Intro sobre la capa abre la ventana", async () => {
  const p = paginaConVentana();
  const pedidas = conVentanaFalsa(p);
  p.PipView.esperarClicParaAbrir();
  const capa = p.doc.getElementById(CAPA);
  assert.equal(p.doc.activeElement, capa, "la capa recibe el foco");
  capa.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pedidas.length, 1);
});

test("pedirla dos veces deja UNA capa", () => {
  const p = paginaConVentana();
  p.PipView.esperarClicParaAbrir();
  p.PipView.esperarClicParaAbrir();
  assert.equal(p.doc.querySelectorAll(`#${CAPA}`).length, 1);
});

test("la capa se va sola: no se queda tapando la pagina", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = paginaConVentana();
  p.PipView.esperarClicParaAbrir();
  t.mock.timers.tick(15000);
  assert.equal(p.doc.getElementById(CAPA), null);
});
