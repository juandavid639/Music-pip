/*
 * Pruebas del INTERRUPTOR DE CAPACIDADES: la ventana esconde los mandos
 * que el sitio no puede atender.
 *
 * EL SUELTO CONFESADO en el README de la tanda 3: "la ventana ofrece
 * volumen, silencio, velocidad y saltos aunque en Spotify escriban sobre
 * un medio que no existe" (medido: CERO <video>/<audio> con musica
 * sonando; el unico video ocasional es el Canvas, un bucle mudo de
 * 6,9 s). Los mandos no fallaban con estrepito: cada escritura moria en
 * el `if (!media) return` del controlador. Un mando a la vista que no
 * hace nada es la mentira que esta bateria prohibe.
 *
 * DESDE LA TANDA E los cinco mandos ya no caen juntos: la escritura
 * sintetica sobre los ranges de la pagina (medida en vivo 2026-09-16)
 * dio ruta propia a saltos y volumen. Ahora cada mando cae por SU
 * pregunta: silencio y velocidad por el medio (unica via que tienen),
 * adelantar/retroceder por la sonda seekPageTo(), volumen por la sonda
 * setPageVolume(). Estas pruebas se actualizaron con ese cambio: donde
 * antes se esperaba "los cinco escondidos", hoy se espera el reparto.
 *
 * Las tres piezas del interruptor, cada una en su dueño:
 *
 *   - aplicarCapacidades (al montar y en cada latido): esconde cada
 *     mando cuya pregunta (medio o sonda de pagina) conteste que no.
 *   - paintTimeline (cada pintado): deshabilita el ARRASTRE de la barra
 *     sin esconderla si ni el medio ni la pagina aceptan saltos; el
 *     progreso se pinta igual (sale de los textos de la pagina).
 *   - pintarEcualizador (cada cambio de preferencias): esconde el trio
 *     del ecualizador si audioGrafo es false. Vive ahi y no en el
 *     montado porque la preferencia es GLOBAL: encendida en YouTube
 *     Music, un escondido de una sola vez se desharia en el siguiente
 *     repintado y Spotify luciria un boton activo sobre una musica a la
 *     que el grafo no toca (con DRM ni siquiera puede: silenciaria).
 *
 * Cada prueba de esconder tiene su gemela de MOSTRAR sobre YouTube
 * Music: un interruptor que esconde de mas es tan mentiroso como uno
 * que esconde de menos, y sin la gemela un `hidden = true` incondicional
 * pasaria toda la bateria.
 *
 * Los atajos de teclado NO se prueban desactivados a proposito: la regla
 * "sin medio no se escribe" ya vive en PlayerController y duplicarla en
 * la ventana seria la misma regla en dos archivos esperando a discrepar.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

/*
 * La ventana flotante montada sobre una pagina concreta. Se cargan LOS
 * TRES adaptadores en los dos entornos, como hace el manifest en
 * produccion: es el registro quien elige por hostname, y estas pruebas
 * ejercitan justo esa eleccion (mismo codigo de ventana, dos sitios,
 * dos resultados).
 */
function ventana(fixture, url) {
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
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  const el = (id) => doc.getElementById("ytmpip-" + id);
  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    banco: win.YTMPip.PipView.__bancoDePruebas,
    YTMPip: win.YTMPip,
    // Los cinco mandos que escriben sobre el medio, por su nombre.
    mandos: () => ({
      volumen: el("volume"),
      silencio: el("mute"),
      velocidad: el("speed"),
      adelantar: el("seek-forward"),
      retroceder: el("seek-backward")
    }),
    barra: () => el("seek"),
    eq: () => el("eq"),
    eqPin: () => el("eq-pin"),
    eqBandas: () => el("eq-bandas")
  };
}

function ventanaSpotify() {
  return ventana("spotify-sonando.html", URL_DE_SPOTIFY);
}

/** El MODO VIDEO medido en vivo (2026-09-16): mismo sitio, mismo
 *  adaptador, pero con el <video> real de video-player-npv presente. */
function ventanaSpotifyVideo() {
  return ventana("spotify-video.html", URL_DE_SPOTIFY);
}

function ventanaYTM() {
  return ventana("controles-completos.html");
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

/** Preferencias reales con el ecualizador encendido en un preset real. */
function preferenciasConEq(v) {
  return Object.assign({}, v.YTMPip.Settings.get(), { equalizer: "graves" });
}

/* ==================================================================
 * 1. En Spotify solo caen los mandos que NADIE puede atender...
 * ================================================================== */

test("en spotify se esconden silencio y velocidad; saltos y volumen viven por la pagina", () => {
  /*
   * Antes de la tanda E aqui se esperaban los CINCO escondidos. Hoy el
   * fixture trae los ranges medidos (progreso y volumen) y las sondas
   * de escritura contestan que si: adelantar, retroceder y volumen se
   * quedan a la vista. Silencio y velocidad siguen cayendo: su unica
   * via es el medio (el boton de silencio de Spotify no esta medido y
   * la velocidad no existe en su pagina).
   */
  const v = ventanaSpotify();

  // El guardia de la premisa: si el registro no eligio a Spotify, lo de
  // abajo estaria probando el interruptor sobre el sitio equivocado.
  assert.strictEqual(v.YTMPip.Adaptadores.activo().id, "spotify");
  assert.strictEqual(v.YTMPip.Capacidades.medioEscribible, false);

  const mandos = v.mandos();
  Object.entries(mandos).forEach(([nombre, mando]) => {
    assert.ok(mando, "el fixture de la ventana perdio el mando de " + nombre);
  });
  assert.strictEqual(mandos.silencio.hidden, true, "silencio quedo a la vista sin medio ni ruta de pagina");
  assert.strictEqual(mandos.velocidad.hidden, true, "velocidad quedo a la vista sin medio");
  assert.strictEqual(mandos.adelantar.hidden, false, "adelantar se escondio con la barra de la pagina viva");
  assert.strictEqual(mandos.retroceder.hidden, false, "retroceder se escondio con la barra de la pagina viva");
  assert.strictEqual(mandos.volumen.hidden, false, "volumen se escondio con el deslizador de la pagina vivo");
});

/* ==================================================================
 * 2. ...y en YouTube Music los cinco siguen a la vista
 * ================================================================== */

test("en youtube music los mismos cinco mandos siguen a la vista", () => {
  /*
   * La gemela obligatoria: sin ella, un `hidden = true` incondicional
   * (o un interruptor leyendo la capacidad al reves) dejaria la prueba
   * anterior en verde mientras YouTube Music pierde el volumen.
   */
  const v = ventanaYTM();

  assert.strictEqual(v.YTMPip.Adaptadores.activo().id, "youtube-music");

  Object.entries(v.mandos()).forEach(([nombre, mando]) => {
    assert.strictEqual(mando.hidden, false, "el mando de " + nombre + " se escondio de mas");
  });
});

/* ==================================================================
 * 3. La barra de tiempo: visible siempre, arrastrable si ALGUIEN salta
 * ================================================================== */

test("en spotify la barra se ve y desde la tanda E se deja arrastrar", () => {
  /*
   * HISTORIA DE ESTA PRUEBA: hasta la tanda E aqui se esperaba
   * disabled=true — el arrastre moria en el `if (!media)` del
   * controlador. La escritura sintetica medida en vivo (2026-09-16: el
   * salto se OYO) le dio al SEEK_TO una ruta por el range de la
   * pagina, asi que hoy lo honesto es lo contrario: barra visible Y
   * arrastrable. La gemela de "no arrastrable" vive ahora en la
   * bateria de escritura (sin playback-progressbar, disabled=true).
   */
  const v = ventanaSpotify();
  v.PipView.onStateUpdate(estado({ currentTime: 30, duration: 100 }));

  assert.strictEqual(v.barra().hidden, false, "la barra entera desaparecio: el progreso si vive");
  assert.strictEqual(v.barra().disabled, false, "la barra quedo deshabilitada con la pagina aceptando saltos");
});

test("en youtube music la misma barra con duracion conocida se arrastra", () => {
  const v = ventanaYTM();
  v.PipView.onStateUpdate(estado({ currentTime: 30, duration: 100 }));

  assert.strictEqual(v.barra().disabled, false, "la barra quedo deshabilitada con medio y duracion");
});

/* ==================================================================
 * 4. El ecualizador global no luce encendido donde no puede sonar
 * ================================================================== */

test("con el ecualizador global encendido, spotify esconde el trio entero", () => {
  /*
   * La doble mentira que vigila esta prueba: la preferencia del
   * ecualizador es GLOBAL, asi que encenderla en YouTube Music tambien
   * la enciende aqui. Sin interruptor, la ventana de Spotify pintaria
   * el boton activo y las barritas sobre una musica a la que el grafo
   * no toca ni una banda (audioGrafo: false, DRM que silenciaria).
   * Se ejercita por aplicarPreferencias, que es el UNICO pintor del
   * ecualizador y ademas quien podria deshacer un escondido hecho en
   * otro sitio: si el escondido no sobrevive a un repintado, no vale.
   */
  const v = ventanaSpotify();
  v.banco.aplicarPreferencias(preferenciasConEq(v));

  assert.strictEqual(v.eq().hidden, true, "el boton del ecualizador quedo a la vista sin grafo");
  assert.strictEqual(v.eqPin().hidden, true, "la chincheta quedo a la vista sin grafo");
  assert.strictEqual(v.eqBandas().hidden, true, "las barritas quedaron a la vista sin grafo");
});

test("con la misma preferencia, youtube music pinta el ecualizador encendido", () => {
  const v = ventanaYTM();
  v.banco.aplicarPreferencias(preferenciasConEq(v));

  assert.strictEqual(v.eq().hidden, false);
  assert.strictEqual(v.eq().getAttribute("aria-pressed"), "true", "el boton no cuenta que esta puesto");
  assert.strictEqual(v.eqBandas().hidden, false, "las barritas del ajuste no se dibujaron");
});

/* ==================================================================
 * 4b. El modo video: medioEscribible false se lee como "sin garantia"
 * ================================================================== */

test("en modo video los cinco mandos vuelven y la barra se arrastra", () => {
  /*
   * La tanda del medio por modos: medioEscribible sigue DECLARADO false
   * (Spotify no lo garantiza: en modo audio no hay medio), pero desde
   * esta tanda ese false significa "sin garantia, compruebalo", no
   * "veto". Con el <video> del modo video en la pagina (medido en vivo
   * 2026-09-16), esconder el volumen castigaria mandos que funcionan.
   */
  const v = ventanaSpotifyVideo();

  assert.strictEqual(v.YTMPip.Adaptadores.activo().id, "spotify");
  assert.strictEqual(v.YTMPip.Capacidades.medioEscribible, false, "premisa: la capacidad sigue declarada false");
  assert.ok(v.YTMPip.Adapter.getMediaElement(), "premisa: el fixture trae el video del modo video");

  Object.entries(v.mandos()).forEach(([nombre, mando]) => {
    assert.strictEqual(mando.hidden, false, "el mando de " + nombre + " quedo escondido con medio vivo");
  });

  v.PipView.onStateUpdate(estado({ currentTime: 30, duration: 100 }));
  assert.strictEqual(v.barra().disabled, false, "la barra quedo deshabilitada con medio que salta");
});

test("si el video del modo video desaparece, el latido re-esconde lo que se queda sin via", () => {
  /*
   * En Spotify el medio va y viene POR PISTA: a la cancion de video le
   * puede seguir una de audio, y los mandos que quedaron a la vista
   * escribirian sobre la nada. El latido de la linea de tiempo (300 ms)
   * re-pregunta en cada tick; esta prueba simula el cambio de pista
   * quitando el bloque npv entero, que es como lo deja Spotify.
   *
   * DESDE LA TANDA E la caida ya no es de los cinco: el fixture de
   * video trae la barra de progreso de la pagina (sin volume-bar), asi
   * que adelantar/retroceder conservan su ruta y se QUEDAN; caen
   * volumen (sin deslizador en este fixture), silencio y velocidad
   * (sin medio, su unica via). El reparto exacto es la prueba de que
   * el latido pregunta mando a mando y no apaga en bloque.
   */
  const v = ventanaSpotifyVideo();
  assert.strictEqual(v.mandos().volumen.hidden, false, "premisa: en modo video los mandos estan a la vista");

  v.win.document.querySelector("[data-testid='video-player-npv']").remove();
  v.banco.tickTimeline();

  const mandos = v.mandos();
  assert.strictEqual(mandos.volumen.hidden, true, "volumen quedo a la vista sin medio ni deslizador de pagina");
  assert.strictEqual(mandos.silencio.hidden, true, "silencio quedo a la vista sin medio");
  assert.strictEqual(mandos.velocidad.hidden, true, "velocidad quedo a la vista sin medio");
  assert.strictEqual(mandos.adelantar.hidden, false, "adelantar cayo con la barra de la pagina aun viva");
  assert.strictEqual(mandos.retroceder.hidden, false, "retroceder cayo con la barra de la pagina aun viva");
});

test("en youtube music el latido no esconde aunque el video falte un instante", () => {
  /*
   * EL ANTI-PARPADEO, la gemela que mantiene honesta a la anterior: en
   * YouTube Music el <video> puede faltar UN INSTANTE (cambio de pista,
   * SPA a medio pintar) y la capacidad declarada true es la promesa de
   * que volvera. Si medioEscribibleAhora mirara el DOM tambien ahi, los
   * cinco mandos parpadearian en cada cambio de cancion.
   */
  const v = ventanaYTM();
  v.win.document.querySelector("video").remove();
  assert.strictEqual(v.YTMPip.Adapter.getMediaElement(), null, "premisa: el video no esta");

  v.banco.tickTimeline();

  Object.entries(v.mandos()).forEach(([nombre, mando]) => {
    assert.strictEqual(mando.hidden, false, "el mando de " + nombre + " parpadeo por un hueco transitorio");
  });
});

/* ==================================================================
 * 4c. El conmutador de escenario: hasVideo no basta, hay que poder prestar
 * ================================================================== */

test("en spotify modo video el conmutador no ofrece un video imposible", () => {
  /*
   * LA REGRESION QUE TRAJO LA TANDA DEL MEDIO POR MODOS, vista en vivo
   * por el usuario (captura con el boton 🖼 rodeado en rojo): al devolver
   * getMediaElement() el video del modo video, hasVideo paso a true y la
   * ventana ofrecio el conmutador carátula/video... de un video con DRM
   * que el prestamo jamas podra adoptar (getPageMediaElement es null:
   * romperia la sesion de claves). Un boton que ofrece lo que no puede
   * hacer es la mentira exacta que este interruptor prohibe. hasVideo
   * dice la verdad de la pagina; videoPrestable, la de la ventana.
   */
  const v = ventanaSpotifyVideo();

  assert.strictEqual(v.YTMPip.Capacidades.videoPrestable, false, "premisa: el prestamo esta vetado por DRM");
  assert.ok(v.YTMPip.Adapter.getMediaElement(), "premisa: y aun asi hay medio (por eso hasVideo llega true)");

  assert.strictEqual(
    v.banco.syncVideoMode(estado({ hasVideo: true })),
    false,
    "la ventana ofrecio alternar a un video que no puede prestar"
  );
});

test("en youtube music el mismo hasVideo si ofrece el conmutador", () => {
  // La gemela obligatoria: una puerta que escondiera de mas le quitaria
  // el video real a quien si puede prestarlo (videoPrestable: true).
  const v = ventanaYTM();

  assert.strictEqual(
    v.banco.syncVideoMode(estado({ hasVideo: true })),
    true,
    "la puerta del video escondio de mas"
  );
});

/* ==================================================================
 * 5. La red de seguridad: sin capacidades publicadas no se esconde nada
 * ================================================================== */

test("sin YTMPip.Capacidades publicado todo queda como antes", () => {
  /*
   * El camino que protege a los demas bancos de prueba (y a cualquier
   * contexto raro donde el registro no haya publicado): solo el false
   * DECLARADO esconde. Se borra la publicacion ANTES de montar, que es
   * como se veria un pip.js corriendo sin registro, y se comprueba que
   * ni el montado ni los dos pintores esconden nada.
   */
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
  delete win.YTMPip.Capacidades;

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  ["volume", "mute", "speed", "seek-forward", "seek-backward"].forEach((id) => {
    assert.strictEqual(
      doc.getElementById("ytmpip-" + id).hidden,
      false,
      "sin capacidades publicadas se escondio ytmpip-" + id
    );
  });

  win.YTMPip.PipView.onStateUpdate(estado({ currentTime: 30, duration: 100 }));
  assert.strictEqual(doc.getElementById("ytmpip-seek").disabled, false);

  win.YTMPip.PipView.__bancoDePruebas.aplicarPreferencias(
    Object.assign({}, win.YTMPip.Settings.get(), { equalizer: "graves" })
  );
  assert.strictEqual(doc.getElementById("ytmpip-eq").hidden, false);

  // La puerta del conmutador de escenario tampoco cierra sin el false
  // DECLARADO: solo la capacidad publicada puede vetar el video.
  assert.strictEqual(
    win.YTMPip.PipView.__bancoDePruebas.syncVideoMode(estado({ hasVideo: true })),
    true,
    "sin capacidades publicadas la puerta del video se cerro"
  );
});
