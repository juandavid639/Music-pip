/*
 * Pruebas del LATIDO de la barra de tiempo.
 *
 * El fallo mas reincidente del proyecto: "se junta el tiempo entre
 * canciones". Reportado tres veces, arreglado tres veces, y las dos
 * primeras no bastaron. Cada arreglo tapaba un eslabon distinto del mismo
 * camino: acertar con el <video> vivo, tener los listeners puestos en ese
 * elemento, que el mensaje salga, que llegue. La barra se alimentaba SOLO
 * de ese camino, asi que cualquier eslabon roto la dejaba clavada y nada
 * la recuperaba.
 *
 * La letra, en cambio, nunca se congelo, y la diferencia lo explica todo:
 * su resalte lee currentTime del <video> cada 300 ms y no depende de
 * ningun mensaje. Ahora la barra tiene el mismo latido.
 *
 * Lo que fijan estas pruebas es justo eso: AUNQUE el estado que llega por
 * mensaje sea viejo o no llegue nunca, un tick repinta la barra con lo que
 * marca el <video> que suena de verdad. Es la prueba que no existia las
 * tres veces anteriores, y por eso el fallo pudo volver.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  crearEntorno,
  cargar,
  leerFixture,
  conTiempos,
  conTiempoDePagina,
  RAIZ
} = require("../helpers/entorno.js");

/*
 * Monta la pagina de YouTube Music (para que el adaptador encuentre un
 * <video>) y, aparte, los elementos de la ventana flotante sobre un
 * documento propio, que es lo que ocurre de verdad: el PiP vive en otro
 * documento pero lo maneja el mismo contexto.
 */
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

  const PipView = win.YTMPip.PipView;
  PipView.__bancoDePruebas.montar(win, doc);

  return {
    win,
    doc,
    PipView,
    banco: PipView.__bancoDePruebas,
    barra: doc.getElementById("ytmpip-seek"),
    actual: doc.getElementById("ytmpip-current-time"),
    total: doc.getElementById("ytmpip-duration"),
    video: win.YTMPip.Adapter.getPageMediaElement()
  };
}

/* Estado como el que llega por mensaje desde el content script. */
function estado(extra) {
  return Object.assign(
    {
      connected: true,
      playing: true,
      title: "Una cancion",
      artist: "Alguien",
      currentTime: 0,
      duration: 0,
      lyrics: {}
    },
    extra
  );
}

test("el tick pinta la barra con lo que marca el <video>, sin ningun mensaje", () => {
  const v = ventana();
  conTiempos(v.video, 11, 300);

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 11);
  assert.strictEqual(Number(v.barra.max), 300);
  assert.strictEqual(v.actual.textContent, "0:11");
  assert.strictEqual(v.total.textContent, "5:00");
});

test("REGRESION: el estado se queda en la cancion anterior y el latido lo corrige", () => {
  /*
   * La reproduccion EXACTA de la captura del usuario: la pagina va por
   * 0:11 de 5:00 y la ventana flotante marca la barra casi llena, porque
   * el ultimo mensaje que llego traia el final de la pista anterior (y no
   * va a llegar otro, que es lo que hacia el fallo permanente).
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ currentTime: 187, duration: 190 }));

  assert.ok(Number(v.barra.value) / Number(v.barra.max) > 0.9,
    "premisa: con el estado viejo la barra queda casi llena");

  // El <video> que suena de verdad ya va por la cancion nueva.
  conTiempos(v.video, 11, 300);
  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 11);
  assert.strictEqual(Number(v.barra.max), 300);
  assert.strictEqual(v.actual.textContent, "0:11");
  assert.strictEqual(v.total.textContent, "5:00",
    "la duracion tambien tiene que ser la de la cancion nueva");
});

test("REGRESION: con un cadaver delante, el latido lee el <video> vivo", () => {
  /*
   * Las dos mitades del arreglo trabajando juntas: el adaptador elige el
   * <video> vivo de entre los que hay en la pagina, y el latido lo lee sin
   * esperar a ningun mensaje. Es el escenario completo del fallo.
   */
  const v = ventana();
  conTiempos(v.video, 190, 190); // el cadaver, primero en el documento

  const vivo = conTiempos(v.win.document.createElement("video"), 11, 300);
  Object.defineProperty(vivo, "paused", { value: false, configurable: true });
  v.win.YTMPip.Adapter.getPlayerContainer().appendChild(vivo);

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 11);
  assert.strictEqual(v.actual.textContent, "0:11");
});

test("MODO VIDEO: el latido lee el <video> prestado, que ya no esta en la pagina", () => {
  /*
   * Este hueco lo encontro la verificacion por mutacion, no yo: cambiar
   * getMediaElement() por getPageMediaElement() en el latido no rompia
   * ninguna prueba. Y no es un matiz academico — es justo el caso que el
   * usuario reporto ultimo ("tambien esta ocurriendo con video").
   *
   * En modo video el <video> se MUEVE al documento de la ventana
   * flotante, asi que desde la pagina ya no se ve. Un latido que
   * preguntara solo por la pagina no encontraria nada (o encontraria el
   * cadaver que YouTube Music dejo atras) y la barra volveria a quedarse
   * congelada, con el agravante de que ahora nadie mas la repinta.
   */
  const v = ventana();
  const prestado = conTiempos(v.video, 71, 187);
  v.doc.body.appendChild(prestado); // exactamente lo que hace borrowVideo()
  v.win.YTMPip.Adapter.setBorrowedMedia(prestado);

  assert.strictEqual(v.win.document.querySelector("video"), null,
    "premisa: desde la pagina ya no se ve ningun <video>");

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 71);
  assert.strictEqual(v.actual.textContent, "1:11");
  assert.strictEqual(v.total.textContent, "3:07");
});

test("el contador y la barra nunca se contradicen, tampoco en el latido", () => {
  // La invariante de timelineFor, comprobada en el otro camino de pintado.
  // Un <video> que ya paso de su duracion (ocurre al encadenar, antes de
  // que publique la duracion nueva) no puede dejar los digitos subiendo
  // con la barra clavada en el tope.
  const v = ventana();
  conTiempos(v.video, 400, 190);

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 190);
  assert.strictEqual(v.actual.textContent, "3:10");
  assert.strictEqual(v.total.textContent, "3:10");
});

test("mientras el usuario arrastra, el latido no le pisa la barra", () => {
  const v = ventana();
  conTiempos(v.video, 11, 300);
  v.banco.tickTimeline();

  // El usuario agarra el pulgar y lo lleva al minuto 2.
  v.barra.dispatchEvent(new v.win.Event("pointerdown"));
  v.barra.value = 120;

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 120, "el latido le arranco la barra de las manos");
});

test("REGRESION: soltar sin mover no deja el arrastre colgado para siempre", () => {
  /*
   * Trampa con el mismo sintoma que el fallo grande, y por eso esta aqui:
   * `change` solo se dispara si el valor CAMBIA. Un clic sobre el pulgar
   * donde ya estaba dejaba `seeking` en true, y con ese flag colgado la
   * barra y el contador dejan de pintarse... para el resto de la cancion.
   */
  const v = ventana();
  conTiempos(v.video, 11, 300);
  v.banco.tickTimeline();

  v.barra.dispatchEvent(new v.win.Event("pointerdown"));
  assert.strictEqual(v.banco.estaArrastrando(), true, "premisa: pulsar empieza el arrastre");

  // Se suelta sin haber movido nada: no hay "change" que valga.
  v.barra.dispatchEvent(new v.win.Event("pointerup"));
  assert.strictEqual(v.banco.estaArrastrando(), false, "el arrastre se quedo colgado");

  conTiempos(v.video, 47, 300);
  v.banco.tickTimeline();
  assert.strictEqual(Number(v.barra.value), 47, "la barra deberia haber vuelto a la vida");
});

test("EL CASO REPORTADO: el latido pinta la pista, no la cola entera", () => {
  /*
   * Los numeros de la captura que por fin explico el fallo: la ventana
   * marcaba 5:12 / 6:54 mientras YouTube Music iba por 1:35 / 3:18, porque
   * el <video> lleva la cola entera en una sola linea de tiempo
   * (3:36 + 3:18 = 6:54).
   *
   * Esta prueba esta en el latido a proposito. Las de track-timeline.test.js
   * comprueban la aritmetica; esta comprueba que el latido la USA, que es
   * donde se rompio: el camino de pintado tenia su propia lectura del
   * <video> a pelo.
   */
  const v = ventana();
  conTiempos(v.video, 216 + 95, 216 + 198); // 5:11 de 6:54
  conTiempoDePagina(v.win, 95, 198); // la pagina: 1:35 de 3:18

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.max), 198, "la barra media la cola entera");
  assert.strictEqual(Number(v.barra.value), 95);
  assert.strictEqual(v.actual.textContent, "1:35", "el contador arrastraba la cancion anterior");
  assert.strictEqual(v.total.textContent, "3:18");
});

test("sin <video> en la pagina el latido no lanza ni borra lo que ya habia", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ currentTime: 30, duration: 100 }));
  v.video.remove();

  v.banco.tickTimeline();

  assert.strictEqual(Number(v.barra.value), 30, "sin nada que leer, se deja lo ultimo conocido");
});
