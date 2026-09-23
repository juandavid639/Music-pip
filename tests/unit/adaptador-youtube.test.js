/*
 * Pruebas del ADAPTADOR DE YOUTUBE NORMAL (src/content/youtube-adapter.js),
 * la tanda 2 de "podemos adaptar la extensión a youtube normal y a spotify".
 *
 * Todos los numeros raros de estas pruebas (8 "#title", 3 botones de like,
 * la barra que dice 16 con el video en 40.3, la duracion 1318.6) son
 * MEDIDOS: salen de dos pasadas de tools/diagnostico-youtube.js sobre
 * paginas reales de www.youtube.com, no de la imaginacion. El fixture
 * (youtube-watch.html) los calca, y las pruebas ademas los CUENTAN, para
 * que un fixture recortado no las deje en verde vigilando nada.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido, conTiempos, plano } = require("../helpers/entorno.js");

const URL_DE_WATCH = "https://www.youtube.com/watch?v=lw1FAHzBci4&list=RDlw1FAHzBci4";

/** El entorno estandar, pero viviendo en www.youtube.com. */
function entornoYouTube(opciones = {}) {
  return entornoContenido("youtube-watch.html", Object.assign({ url: URL_DE_WATCH }, opciones));
}

/* ==================================================================
 * 1. La eleccion por hostname y las capacidades honestas
 * ================================================================== */

test("en www.youtube.com el registro elige al adaptador de youtube", () => {
  const { YTMPip } = entornoYouTube();

  const activo = YTMPip.Adaptadores.activo();
  assert.strictEqual(activo.id, "youtube");
  assert.strictEqual(
    YTMPip.Adapter,
    activo.adapter,
    "YTMPip.Adapter debe ser EL MISMO objeto registrado, no una copia"
  );

  // La prueba de fuego de que el elegido lee ESTA pagina y no la de YTM.
  assert.strictEqual(
    YTMPip.Adapter.getTitleElement().textContent.trim(),
    "Trippie Redd - Love Sick (Visualizer)"
  );

  /*
   * Las capacidades, con su evidencia del diagnostico: letras, repetir y
   * aleatorio no existen en youtube.com (0 elementos medidos); cola,
   * me gusta, medio escribible, video y grafo si. Se recorre la lista
   * DEL CONTRATO para que una capacidad nueva sin decidir aqui haga
   * caer la prueba (asi entro medioEscribible: esta prueba cayo).
   */
  const esperadas = {
    letras: false,
    cola: true,
    repetir: false,
    aleatorio: false,
    meGusta: true,
    medioEscribible: true,
    videoPrestable: true,
    audioGrafo: true
  };
  YTMPip.Adaptadores.CAPACIDADES_DEL_CONTRATO.forEach((cap) => {
    assert.strictEqual(YTMPip.Capacidades[cap], esperadas[cap], "capacidad " + cap);
  });
});

/* ==================================================================
 * 2. El titulo unico entre ocho señuelos
 * ================================================================== */

test("el titulo sale unico aunque la pagina tenga ocho #title", () => {
  const { win, YTMPip } = entornoYouTube();

  // El guardia del fixture: sin los 8 señuelos medidos, esta prueba
  // estaria en verde sin vigilar la trampa real.
  assert.strictEqual(
    win.document.querySelectorAll("#title").length,
    8,
    "el fixture debe conservar los 8 '#title' medidos en la pagina real"
  );

  assert.strictEqual(
    YTMPip.Adapter.getTitleElement().textContent.trim(),
    "Trippie Redd - Love Sick (Visualizer)"
  );

  const estado = YTMPip.MetadataReader.read();
  assert.strictEqual(estado.title, "Trippie Redd - Love Sick (Visualizer)");
  assert.strictEqual(estado.artist, "Trippie Redd", "el 'artista' de un video es su canal");
});

/* ==================================================================
 * 3. La caratula derivada del video-id
 * ================================================================== */

test("la caratula se deriva del video-id, y sin el no se inventa", () => {
  const { win, YTMPip } = entornoYouTube();

  assert.strictEqual(
    YTMPip.MetadataReader.read().artworkUrl,
    "https://i.ytimg.com/vi/lw1FAHzBci4/hqdefault.jpg"
  );

  // Sin video-id (una pagina que no es de visionado) no se fabrica URL:
  // mejor la caratula de reserva de la ventana que una imagen rota.
  win.document.querySelector("ytd-watch-flexy").removeAttribute("video-id");
  assert.strictEqual(YTMPip.MetadataReader.read().artworkUrl, undefined);
});

/* ==================================================================
 * 4. La estrella: el tiempo sale del <video>, no de la barra helada
 * ================================================================== */

test("el tiempo sale del <video> y no de la barra helada", () => {
  const { win, YTMPip } = entornoYouTube();

  /*
   * La mentira medida, reproducida tal cual: la barra dice 16 (solo se
   * refresca con los controles a la vista) mientras el video va por 40.3
   * de sus 1318.6 s. En YouTube normal el <video> es la verdad — no hay
   * cola acumulada como en YTM — y esta prueba impide que alguien
   * "arregle" getPageTrackTime haciendolo leer la barra.
   */
  const barra = win.document.querySelector(".ytp-progress-bar");
  assert.strictEqual(barra.getAttribute("aria-valuenow"), "16", "el fixture calca la barra helada");

  conTiempos(win.document.querySelector("#movie_player video"), 40.3, 1318.6);

  const { elapsed, duration } = YTMPip.TrackTimeline.read();
  assert.strictEqual(elapsed, 40.3, "el tiempo es el del <video>, no el 16 de la barra");
  assert.strictEqual(duration, 1318.6);
});

/* ==================================================================
 * 5. Me gusta compuesto de aria-pressed
 * ================================================================== */

test("me gusta se compone de los aria-pressed reales", () => {
  const { win, YTMPip } = entornoYouTube();
  const doc = win.document;

  // El guardia de los señuelos: 3 botones de like medidos en la pagina.
  assert.strictEqual(
    doc.querySelectorAll("like-button-view-model button").length,
    3,
    "el fixture debe conservar los 3 'like-button-view-model' medidos"
  );

  const bueno = YTMPip.Adapter.getLikeButton();
  assert.ok(
    bueno.closest("ytd-watch-metadata"),
    "el boton elegido es el de la ficha del video, no un señuelo"
  );

  const { LIKE_STATUS } = YTMPip.CONSTANTS;

  // El fixture arranca con los dos aria-pressed en false, como se midio.
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), LIKE_STATUS.INDIFFERENT);

  bueno.setAttribute("aria-pressed", "true");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), LIKE_STATUS.LIKE);

  bueno.setAttribute("aria-pressed", "false");
  YTMPip.Adapter.getDislikeButton().setAttribute("aria-pressed", "true");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), LIKE_STATUS.DISLIKE);

  // Sin ningun boton (una pagina que no es de visionado) no se inventa
  // estado: undefined es "no se puede saber", no "indiferente".
  doc.querySelectorAll("like-button-view-model, dislike-button-view-model").forEach((el) => el.remove());
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), undefined);
});

/* ==================================================================
 * 6. La cola del Mix
 * ================================================================== */

test("la cola del Mix: las siguientes al selected, y sin items nada", () => {
  const { win, YTMPip } = entornoYouTube();

  // plano() cruza el reino jsdom->Node; sin el, deepStrictEqual cae por
  // prototipos aunque el contenido sea identico.
  assert.deepStrictEqual(plano(YTMPip.MetadataReader.read().upNext), [
    { title: "$UICIDEBOY$ - The Number You Have Dialed Is Not In Service", artist: "$uicideboy$" },
    { title: "Trippie Redd - Real Feel (Visualizer)", artist: "Trippie Redd" }
  ]);

  // El video suelto medido: el panel EXISTE pero sin items. Sin
  // `selected` a la vista no se adivina que es "lo siguiente".
  win.document.querySelectorAll("ytd-playlist-panel-video-renderer").forEach((el) => el.remove());
  assert.deepStrictEqual(plano(YTMPip.MetadataReader.read().upNext), []);
});

/* ==================================================================
 * 7. El video del reproductor gana a la precarga
 * ================================================================== */

test("el video del reproductor gana a la precarga suelta", () => {
  const { win, YTMPip } = entornoYouTube();

  // Los DOS <video> medidos: el del reproductor y la precarga del body.
  assert.strictEqual(
    win.document.querySelectorAll("video").length,
    2,
    "el fixture debe conservar los DOS <video> medidos"
  );

  /*
   * Los dos estan pausados (jsdom no reproduce), asi que si la prioridad
   * de selectores fallara y entraran ambos candidatos, elegirVideoVivo
   * devolveria el ULTIMO en orden de documento: la precarga. Que salga
   * el del reproductor demuestra que "#movie_player video" filtra antes
   * de elegir.
   */
  const delReproductor = win.document.querySelector("#movie_player video");
  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), delReproductor);
});
