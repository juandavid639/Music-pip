/*
 * Pruebas del PRESTAMO del <video> en modo video.
 *
 * Existen por la cuarta aparicion de "se junta el tiempo entre canciones",
 * la unica que provoque yo con un arreglo anterior. La captura mostraba el
 * recuadro de video en negro y la ventana marcando 7:46 de 9:00 mientras
 * YouTube Music iba por 0:35 de 3:40.
 *
 * Las dos mitades del fallo eran la MISMA regla escrita dos veces: el
 * adaptador leia el tiempo del <video> equivocado y syncVideoMode, por su
 * cuenta y con su propia copia de la regla, TIRABA el que estaba sonando
 * para quedarse con ese mismo equivocado. De ahi el negro: el cadaver que
 * heredabamos no tenia fotogramas que enseñar.
 *
 * Lo que hay aqui es la mitad de pip.js. La del adaptador esta en
 * tests/selectors/adapter.test.js.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

function sonando(video) {
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  return video;
}

function ventana(opciones) {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
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

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    banco,
    Adapter: win.YTMPip.Adapter,
    PipView: win.YTMPip.PipView,
    boton: doc.getElementById("ytmpip-video-toggle")
  };
}

/* Estado con video, que es lo que hace entrar en modo video. */
function conVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: true, lyrics: {} };
}

function sinVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

test("REGRESION: un cadaver a medias en la pagina no hace que se tire el video que suena", () => {
  /*
   * La reproduccion de la captura. El <video> de la cancion actual esta
   * prestado a la ventana; en la pagina queda el de una cancion que el
   * usuario se salto por la mitad (7:46 de 9:00, pausado).
   *
   * La regla antigua decia "hay un <video> en la pagina distinto del
   * prestado, luego el prestado ya no vale" y llamaba a discardVideo(),
   * que no lo devuelve: lo BORRA. Acto seguido borrowVideo() se prestaba
   * el cadaver.
   */
  const v = ventana();
  const vivo = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.banco.syncVideoMode(conVideo());
  assert.strictEqual(v.banco.videoPrestado(), vivo, "premisa: la ventana se presta el video que suena");

  const saltada = conTiempos(v.win.document.createElement("video"), 466, 540);
  v.Adapter.getPlayerContainer().appendChild(saltada);

  v.banco.syncVideoMode(conVideo());

  assert.strictEqual(v.banco.videoPrestado(), vivo,
    "se tiro el video que estaba sonando y la ventana se quedo con el cadaver en negro");
  assert.strictEqual(v.Adapter.getMediaElement(), vivo,
    "y el tiempo se leia del cadaver: el 7:46 de 9:00 de la captura");
});

test("cuando la pagina SI arranca la cancion siguiente, el prestado se suelta", () => {
  // La otra mitad: desconfiar no puede volverse no soltar nunca, o al
  // encadenar la ventana se quedaria con la cancion anterior para siempre.
  const v = ventana();
  const viejo = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.banco.syncVideoMode(conVideo());
  assert.strictEqual(v.banco.videoPrestado(), viejo, "premisa");

  const nuevo = sonando(conTiempos(v.win.document.createElement("video"), 2, 187));
  v.Adapter.getPlayerContainer().appendChild(nuevo);

  v.banco.syncVideoMode(conVideo());

  assert.strictEqual(v.banco.videoPrestado(), nuevo, "la ventana tiene que mudarse al video nuevo");
  assert.strictEqual(viejo.isConnected, false, "el viejo se tira, no se devuelve (ver discardVideo)");
});

test("sin nada nuevo en la pagina, el prestamo aguanta actualizacion tras actualizacion", () => {
  // El caso normal: mientras suena una cancion llegan decenas de estados y
  // ninguno debe mover el prestamo. Si esto se rompe, la imagen parpadea.
  const v = ventana();
  const vivo = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  for (let i = 0; i < 5; i++) v.banco.syncVideoMode(conVideo());

  assert.strictEqual(v.banco.videoPrestado(), vivo);
  assert.strictEqual(v.win.document.querySelector("video"), null,
    "el video vive en la ventana flotante, no en la pagina");
});

/*
 * ------------------------------------------------------------------
 * Alternar entre video y caratula
 *
 * Petición de uso real: poder ver la portada aunque la canción traiga
 * vídeo. Es una decision de ESTA ventana, no un comando para YouTube
 * Music: la musica no se entera y no se guarda en preferencias.
 *
 * El riesgo aqui no es que el boton no funcione, sino que su estado se
 * calcule por su cuenta. La regla de "hay que estar en modo video" vive
 * en syncVideoMode y ya se ha duplicado una vez en este archivo con
 * consecuencias caras (el recuadro en negro de mas arriba). Estas pruebas
 * miran el DOM y el prestamo, nunca el flag.
 * ------------------------------------------------------------------
 */

/*
 * Estas dos entran por onStateUpdate y no por syncVideoMode. No es un
 * capricho: syncVideoMode ya no pinta el boton, solo DEVUELVE si hay video
 * que alternar, y quien pinta es render con esa respuesta. Llamando al de
 * dentro, la primera prueba pasaria sin comprobar nada (el boton nace
 * oculto en el HTML) y la segunda fallaria sin que hubiera fallo alguno.
 */
test("sin video en la cancion, el boton de alternar no se enseña", () => {
  // Un boton que no puede hacer nada es peor que no tenerlo: se pulsa, no
  // pasa nada y parece que la ventana esta rota.
  const v = ventana();
  v.boton.hidden = false; // sin esto la prueba pasaria sola
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, true);
});

test("con video en la cancion, el boton aparece y anuncia lo que hace", () => {
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());

  assert.strictEqual(v.boton.hidden, false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.boton.title, "Ver carátula");
});

test("EL CASO PEDIDO: pulsar devuelve el video y deja la caratula a la vista", () => {
  const v = ventana();
  const video = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());
  assert.strictEqual(v.banco.videoPrestado(), video, "premisa: la ventana esta en modo video");

  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.videoPrestado(), null, "el video sigue prestado: no hay caratula que ver");
  assert.strictEqual(v.doc.getElementById("ytmpip-root").classList.contains("ytmpip-video-mode"), false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.boton.title, "Ver vídeo");
});

test("el video se DEVUELVE a YouTube Music, no se tira", () => {
  /*
   * La diferencia entre returnVideo() y discardVideo() no es un matiz:
   * discardVideo() llama a remove(), que segun la especificacion pausa el
   * elemento. Si alternar a caratula tirase el <video>, pediriamos la
   * portada y de paso pararíamos la musica.
   */
  const v = ventana();
  const video = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);
  const contenedor = v.Adapter.getPlayerContainer();

  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(video.isConnected, true, "el <video> se quedo sin documento: la musica pararia");
  assert.strictEqual(contenedor.contains(video), true, "no volvio a su sitio en la pagina");
});

test("volver a pulsar recupera el video", () => {
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarAlternarVideo();
  v.banco.pulsarAlternarVideo();

  assert.ok(v.banco.videoPrestado(), "el video no volvio a la ventana");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("la eleccion aguanta el cambio de cancion", () => {
  /*
   * Si se reiniciara con cada pista, la siguiente cancion con video se lo
   * plantaria otra vez en la cara y habria que volver a pulsar. La
   * decision es del usuario y dura lo que dure la ventana.
   */
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarAlternarVideo();

  // Cancion nueva, tambien con video.
  v.PipView.onStateUpdate(Object.assign(conVideo(), { title: "otra" }));

  assert.strictEqual(v.banco.pideCover(), true);
  assert.strictEqual(v.banco.videoPrestado(), null, "la cancion nueva devolvio el video sin permiso");
});

test("con el video desactivado en preferencias, el boton ni se ofrece", async () => {
  /*
   * El ajuste dice "no quiero video". Enseñar un boton para traerlo seria
   * ofrecer una puerta que contradice lo que el propio usuario configuro,
   * y ademas dejaria dos sitios distintos decidiendo lo mismo.
   */
  const v = ventana({ storage: { videoPreference: "hidden" } });
  await v.win.YTMPip.Settings.load();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.boton.hidden = false; // sin esto la prueba pasaria sola
  v.PipView.onStateUpdate(conVideo());

  assert.strictEqual(v.boton.hidden, true);
  assert.strictEqual(v.banco.videoPrestado(), null);
});

/*
 * ------------------------------------------------------------------
 * El segundo papel del mismo boton: letra a pantalla completa
 *
 * Peticion de uso: "si el usuario solo elije ver la letra sin cover de la
 * cancion utiliza el cover como de fondo de pantalla borroso y la letra
 * sobre el cover". Es la misma pregunta que ya respondia el boton —que
 * ocupa el escenario— aplicada a una cancion sin video, asi que reutiliza
 * el boton en vez de añadir un cuarto a la cabecera.
 *
 * Lo que se prueba es el REPARTO: que una sola pulsacion no toque las dos
 * decisiones a la vez y que el papel lo decida quien ya sabe la respuesta
 * (render), no el manejador del clic por su cuenta. Es exactamente la
 * duplicacion que costo cara mas arriba en este archivo.
 * ------------------------------------------------------------------
 */

/* Sin video pero con letra sincronizada: el caso de la peticion. */
function soloLetra() {
  return {
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    lyrics: {
      status: "available",
      source: "Better Lyrics",
      lines: [{ text: "una linea", time: 1 }]
    }
  };
}

test("sin video pero con letra, el boton se ofrece igualmente", () => {
  // Antes solo aparecia con video. Si no saliera, la peticion no tendria
  // por donde pedirse: en mini ni siquiera existe el boton "Letras".
  const v = ventana();
  v.PipView.onStateUpdate(soloLetra());

  assert.strictEqual(v.boton.hidden, false);
  assert.strictEqual(v.boton.title, "Ver la letra en grande");
});

test("sin video y sin letra no hay nada que alternar", () => {
  const v = ventana();
  v.boton.hidden = false; // sin esto la prueba pasaria sola
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, true);
});

test("EL CASO PEDIDO: la letra ocupa el escenario y la portada pasa a ser el fondo", () => {
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");

  v.PipView.onStateUpdate(soloLetra());
  assert.strictEqual(raiz.classList.contains("ytmpip-lyrics-stage"), false, "premisa");

  v.banco.pulsarAlternarVideo();

  assert.strictEqual(raiz.classList.contains("ytmpip-lyrics-stage"), true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.doc.getElementById("ytmpip-lyrics-panel").hidden, false,
    "pedir la letra en grande es pedir el panel abierto");
});

test("pulsar con video NO toca la eleccion de la letra, y al reves", () => {
  /*
   * Un solo flag para los dos papeles seria mas corto y estaria mal: quien
   * pidio portada en un videoclip no ha dicho nada sobre que quiere ver en
   * la siguiente cancion, que a lo mejor ni trae video.
   */
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.pideCover(), true);
  assert.strictEqual(v.banco.pideLetraEnGrande(), false, "una pulsacion movio las dos decisiones");

  v.PipView.onStateUpdate(soloLetra());
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.pideLetraEnGrande(), true);
  assert.strictEqual(v.banco.pideCover(), true, "se perdio la eleccion de la cancion con video");
});

test("con video, el boton no cambia la letra aunque la cancion tambien la traiga", () => {
  /*
   * Una cancion puede tener videoclip Y letra. Ahi el escenario ya esta
   * ocupado por el video, asi que el boton solo puede significar una cosa.
   * Si el papel se recalculara en el manejador del clic en vez de leerse
   * del que ya lo decidio, este es el caso que se rompe.
   */
  const v = ventana();
  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);

  const conAmbos = Object.assign(conVideo(), { lyrics: soloLetra().lyrics });
  v.PipView.onStateUpdate(conAmbos);
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.pideCover(), true, "el boton dejo de alternar el video");
  assert.strictEqual(v.banco.pideLetraEnGrande(), false);
});

test("si el usuario habia cerrado la letra, pedirla en grande la reabre", () => {
  /*
   * Cerrar el panel a mano es una orden que el modo karaoke respeta para
   * el resto de la ventana. Sin reabrirlo aqui, pulsar el boton quitaria la
   * portada y no pondria nada en su sitio: una ventana vacia.
   */
  const v = ventana();
  const panel = v.doc.getElementById("ytmpip-lyrics-panel");

  v.PipView.onStateUpdate(soloLetra());
  assert.strictEqual(panel.hidden, false, "premisa: el karaoke abre el panel solo");

  // El manejador de verdad del boton "Letras", no un panel.hidden a mano:
  // lo que hay que reproducir es la ORDEN del usuario, que es lo que el
  // modo karaoke respeta despues.
  v.banco.pulsarLetras();
  assert.strictEqual(panel.hidden, true, "premisa: el usuario lo cerro a mano");

  v.banco.pulsarAlternarVideo();

  assert.strictEqual(panel.hidden, false, "el boton no hizo nada visible");
});

test("en un videoclip, pedir la portada da la portada aunque haya letra", () => {
  /*
   * El caso que separa "no hay video" de "no se esta viendo el video".
   * Cuando el usuario aparta el videoclip para ver la portada, la ventana
   * entra igualmente en modo karaoke; si la condicion mirase solo eso, la
   * letra en grande elegida en una cancion anterior se comeria la portada
   * que acaba de pedir. El boton sigue siendo el del video, y lo que pide
   * es lo que tiene que salir.
   */
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");

  v.PipView.onStateUpdate(soloLetra());
  v.banco.pulsarAlternarVideo();
  assert.strictEqual(v.banco.pideLetraEnGrande(), true, "premisa: venia con la letra en grande");

  conTiempos(v.Adapter.getPageMediaElement(), 35, 220);
  const conAmbos = Object.assign(conVideo(), { title: "otra", lyrics: soloLetra().lyrics });
  v.PipView.onStateUpdate(conAmbos);
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.banco.pideCover(), true, "premisa: se aparto el videoclip");
  assert.strictEqual(raiz.classList.contains("ytmpip-lyrics-stage"), false,
    "pidio la portada y le taparon la portada con la letra");
});

test("volver a pulsar devuelve la portada al escenario", () => {
  const v = ventana();

  v.PipView.onStateUpdate(soloLetra());
  v.banco.pulsarAlternarVideo();
  v.banco.pulsarAlternarVideo();

  assert.strictEqual(v.doc.getElementById("ytmpip-root").classList.contains("ytmpip-lyrics-stage"), false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});
