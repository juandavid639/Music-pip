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
