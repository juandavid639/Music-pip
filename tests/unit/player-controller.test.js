/*
 * Pruebas del ejecutor de comandos.
 *
 * Aqui el riesgo no es que algo no funcione, sino que funcione DE MAS: un
 * salto fuera de [0, duracion] o un volumen fuera de [0, 1] dejan al
 * <video> en un estado del que YouTube Music no siempre se recupera, y el
 * sintoma no aparece en el momento sino unos segundos despues. Por eso
 * casi todos los tests son de acotado y de valores basura.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, leerFixture, documentoFlotante } = require("../helpers/entorno.js");

function entornoControlador(fixture = "controles-completos.html") {
  const { win } = crearEntorno(leerFixture(fixture));
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js"
  );
  return { win, YTMPip: win.YTMPip, TIPOS: win.YTMPip.COMMAND_TYPES };
}

/*
 * jsdom no trae motor multimedia: duration es un getter de solo lectura
 * fijado a NaN. Se sobrescribe. currentTime, volume y muted SI son
 * escribibles en jsdom, asi que esos se usan tal cual y las asserts
 * comprueban el valor real que quedo en el elemento.
 */
function prepararVideo(win, { duration = 300, currentTime = 0 } = {}) {
  const video = win.document.querySelector("video");
  Object.defineProperty(video, "duration", { value: duration, configurable: true });
  video.currentTime = currentTime;
  return video;
}

/** Cuenta clics sin depender de que el boton haga algo. */
function espiarClic(el) {
  const registro = { veces: 0 };
  el.addEventListener("click", () => (registro.veces += 1));
  return registro;
}

test("SEEK_TO coloca el tiempo exacto pedido", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 300, currentTime: 10 });

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: 123 });
  assert.strictEqual(video.currentTime, 123);
});

test("SEEK_TO por encima de la duracion se acota al final", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 300 });

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: 99999 });
  assert.strictEqual(video.currentTime, 300);
});

test("SEEK_TO negativo se acota a cero", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 300, currentTime: 50 });

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: -40 });
  assert.strictEqual(video.currentTime, 0);
});

test("REGRESION: SEEK_TO con un valor basura no toca el tiempo", () => {
  /*
   * null, "", false y [] son el caso peligroso: Number() los convierte en 0,
   * que es finito, asi que un comando al que se le hubiera perdido el campo
   * por el camino pasaba el filtro y saltaba al PRINCIPIO de la cancion.
   * Es peor que no hacer nada, porque parece que el usuario lo pidio.
   */
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 300, currentTime: 77 });

  for (const basura of [NaN, undefined, null, "", "   ", false, [], "abc", {}]) {
    YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: basura });
    assert.strictEqual(video.currentTime, 77, `el valor ${JSON.stringify(basura)} movio la reproduccion`);
  }
});

test("SEEK_TO acepta cadenas numericas (el <input type=range> da texto)", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 300, currentTime: 0 });

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: "45" });
  assert.strictEqual(video.currentTime, 45);
});

test("SEEK_TO en una emision en directo (duracion no finita) se ignora", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: Infinity, currentTime: 12 });

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: 60 });
  assert.strictEqual(video.currentTime, 12);
});

test("SEEK_TO sin reproductor no lanza", () => {
  const { YTMPip, TIPOS } = entornoControlador("vacio.html");
  assert.doesNotThrow(() => YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: 5 }));
});

test("SET_VOLUME aplica el nivel al elemento multimedia", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);

  YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: 0.42 });
  assert.strictEqual(video.volume, 0.42);
});

test("SET_VOLUME acota fuera de [0, 1]", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);

  YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: 7 });
  assert.strictEqual(video.volume, 1, "un volumen > 1 lanza una excepcion en el navegador real");

  YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: -3 });
  assert.strictEqual(video.volume, 0);
});

test("SET_VOLUME con un valor basura deja el volumen intacto", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);
  video.volume = 0.5;

  // Mismo caso que en SEEK_TO: null y "" habrian silenciado la musica del
  // todo, que es un fallo mucho mas visible que no hacer nada.
  for (const basura of [NaN, undefined, null, "", false, [], "alto", {}]) {
    YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: basura });
    assert.strictEqual(video.volume, 0.5, `el valor ${JSON.stringify(basura)} altero el volumen`);
  }
});

test("subir el volumen quita el silencio", () => {
  // Sin esto, mover el deslizador con el sonido silenciado no produce
  // ningun efecto audible y parece que el control esta roto.
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);
  video.muted = true;

  YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: 0.8 });

  assert.strictEqual(video.muted, false);
  assert.strictEqual(video.volume, 0.8);
});

test("bajar el volumen a cero NO desactiva el silencio", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);
  video.muted = true;

  YTMPip.PlayerController.execute({ type: TIPOS.SET_VOLUME, level: 0 });
  assert.strictEqual(video.muted, true);
});

test("TOGGLE_MUTE alterna en ambos sentidos", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_MUTE });
  assert.strictEqual(video.muted, true);

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_MUTE });
  assert.strictEqual(video.muted, false);
});

test("TOGGLE_LIKE pulsa el boton de me gusta, no el de no me gusta", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const like = espiarClic(YTMPip.Adapter.getLikeButton());
  const dislike = espiarClic(YTMPip.Adapter.getDislikeButton());

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_LIKE });

  assert.strictEqual(like.veces, 1);
  assert.strictEqual(dislike.veces, 0);
});

test("TOGGLE_REPEAT y TOGGLE_SHUFFLE pulsan su propio boton", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const repetir = espiarClic(win.document.querySelector(".repeat"));
  const aleatorio = espiarClic(win.document.querySelector(".shuffle"));

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_REPEAT });
  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_SHUFFLE });

  assert.strictEqual(repetir.veces, 1);
  assert.strictEqual(aleatorio.veces, 1);
});

test("los comandos nuevos sobre una pagina sin controles no lanzan", () => {
  const { YTMPip, TIPOS } = entornoControlador("vacio.html");
  const comandos = [
    { type: TIPOS.TOGGLE_LIKE },
    { type: TIPOS.TOGGLE_REPEAT },
    { type: TIPOS.TOGGLE_SHUFFLE },
    { type: TIPOS.TOGGLE_MUTE },
    { type: TIPOS.SET_VOLUME, level: 0.5 }
  ];

  for (const comando of comandos) {
    assert.doesNotThrow(() => YTMPip.PlayerController.execute(comando), `${comando.type} lanzo`);
  }
});

test("un comando desconocido se ignora en silencio", () => {
  const { YTMPip } = entornoControlador();
  assert.doesNotThrow(() => YTMPip.PlayerController.execute({ type: "NO_EXISTE" }));
  assert.doesNotThrow(() => YTMPip.PlayerController.execute(null));
});

/* ------------------------------------------------------------------
 * TOGGLE_PLAY: el comando de quien no sabe si suena
 *
 * Existe para el atajo de teclado del navegador, que llega al service
 * worker sin mas informacion que una cache que puede mentir. La decision
 * se toma aqui, delante del <video>, que es el unico que lo sabe seguro.
 *
 * jsdom no trae motor multimedia: play() y pause() existen pero no hacen
 * nada util, asi que se ESPIAN. Lo que se prueba no es que la musica
 * suene —eso no puede oirlo ninguna prueba— sino que la decision caiga
 * del lado correcto.
 * ------------------------------------------------------------------ */

test("TOGGLE_PLAY con la musica sonando PAUSA, no reproduce", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  let pausas = 0;
  let reproducciones = 0;
  video.pause = () => (pausas += 1);
  video.play = () => ((reproducciones += 1), Promise.resolve());

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_PLAY });

  assert.strictEqual(pausas, 1);
  assert.strictEqual(reproducciones, 0, "alterno hacia el lado equivocado");
});

test("TOGGLE_PLAY con la musica pausada REPRODUCE", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win);
  // En jsdom un video recien creado ya esta paused; se deja explicito para
  // que la premisa no dependa de un valor por defecto ajeno.
  Object.defineProperty(video, "paused", { value: true, configurable: true });
  let pausas = 0;
  let reproducciones = 0;
  video.pause = () => (pausas += 1);
  video.play = () => ((reproducciones += 1), Promise.resolve());

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_PLAY });

  assert.strictEqual(reproducciones, 1);
  assert.strictEqual(pausas, 0, "alterno hacia el lado equivocado");
});

test("TOGGLE_PLAY sin <video> pulsa el boton de la pagina, que ya es un alternador", () => {
  const { win, YTMPip, TIPOS } = entornoControlador();
  win.document.querySelector("video").remove();
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), null, "premisa: no hay video que consultar");

  // El fixture no trae boton de play/pause (ninguna otra prueba lo
  // necesitaba). Se crea con el selector PRIMARIO del adaptador, el mismo
  // id que usa la pagina real; si el adaptador deja de buscarlo, la
  // premisa de abajo lo dice antes de que el clic falle en silencio.
  const alternador = win.document.createElement("button");
  alternador.id = "play-pause-button";
  win.document.body.appendChild(alternador);
  assert.strictEqual(YTMPip.Adapter.getPlayPauseButton(), alternador, "premisa: el adaptador no ve el boton");
  const boton = espiarClic(alternador);

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_PLAY });

  assert.strictEqual(boton.veces, 1);
});

test("TOGGLE_PLAY en una pagina vacia no lanza", () => {
  const { YTMPip, TIPOS } = entornoControlador("vacio.html");
  assert.doesNotThrow(() => YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_PLAY }));
});

/* ------------------------------------------------------------------
 * PLAY y PAUSE sin medio: el alternador ya no se pulsa a ciegas
 *
 * EL PELIGRO que trajo esta tanda: sin medio, play() y pause() caian
 * al boton de la pagina con un clic CIEGO, y ese boton es un
 * alternador. En Spotify el medio es null SIEMPRE (medido: cero
 * <video>/<audio> con musica sonando), asi que "pausar lo ya pausado"
 * ARRANCABA la musica — y el temporizador de apagado manda PAUSE al
 * expirar: musica sonando de madrugada por haber pedido silencio.
 *
 * La regla nueva: un alternador solo se pulsa sabiendo que el estado
 * actual es EL CONTRARIO del pedido, y lo dice isPagePlaying() (el
 * metodo 37 del contrato, que existe exactamente para esto). El estado
 * se cambia en las pruebas escribiendo el DIBUJO del boton, que es la
 * unica señal real: el aria-label llega traducido, el path no.
 * ------------------------------------------------------------------ */

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";
const DIBUJO_DE_PAUSA = "M2.7 1a.7.7 0 0 0-.7.7v12.6";
const DIBUJO_DE_PLAY = "M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288";

/*
 * El controlador viviendo en open.spotify.com: los TRES adaptadores
 * cargados, como en el manifest, y el registro eligiendo por hostname.
 * El fixture es parametro porque el MODO VIDEO (spotify-video.html)
 * comparte todo el arnes y solo cambia el DOM.
 */
function entornoSpotify(fixture = "spotify-sonando.html") {
  const { win } = crearEntorno(leerFixture(fixture), { url: URL_DE_SPOTIFY });
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js"
  );
  return { win, YTMPip: win.YTMPip, TIPOS: win.YTMPip.COMMAND_TYPES };
}

/** Escribe el dibujo del boton de play/pausa: la señal que lee el adaptador. */
function ponerDibujo(e, dibujo) {
  e.YTMPip.Adapter.getPlayPauseButton().querySelector("svg path").setAttribute("d", dibujo);
}

test("EL PELIGRO REPORTADO: PAUSE con spotify ya pausado no arranca la musica", () => {
  const e = entornoSpotify();
  ponerDibujo(e, DIBUJO_DE_PLAY);

  // Las premisas que hacen real el peligro: no hay medio que pausar y
  // la pagina dice que YA esta pausado. El clic ciego pulsaba igual.
  assert.strictEqual(e.YTMPip.Adapter.getMediaElement(), null, "premisa: sin medio");
  assert.strictEqual(e.YTMPip.Adapter.isPagePlaying(), false, "premisa: la pagina dice pausado");
  const boton = espiarClic(e.YTMPip.Adapter.getPlayPauseButton());

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.PAUSE });

  assert.strictEqual(boton.veces, 0, "pausar lo pausado pulso el alternador: la musica arranca");
});

test("PAUSE con spotify sonando pulsa el alternador una vez", () => {
  // El otro lado, sin el cual la prueba anterior se pasaria con un
  // pause() vacio: el temporizador de apagado tiene que seguir pudiendo.
  const e = entornoSpotify();

  assert.strictEqual(e.YTMPip.Adapter.isPagePlaying(), true, "premisa: el fixture trae musica sonando");
  const boton = espiarClic(e.YTMPip.Adapter.getPlayPauseButton());

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.PAUSE });

  assert.strictEqual(boton.veces, 1, "con la musica sonando, PAUSE tiene que poder pausarla");
});

test("PLAY con spotify sonando no corta la musica por accidente", () => {
  // El espejo del peligro: pedir musica no puede quitarla.
  const e = entornoSpotify();

  assert.strictEqual(e.YTMPip.Adapter.isPagePlaying(), true, "premisa: el fixture trae musica sonando");
  const boton = espiarClic(e.YTMPip.Adapter.getPlayPauseButton());

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.PLAY });

  assert.strictEqual(boton.veces, 0, "pedir PLAY sonando pulso el alternador: la musica se corta");
});

test("PLAY con spotify pausado pulsa el alternador", () => {
  const e = entornoSpotify();
  ponerDibujo(e, DIBUJO_DE_PLAY);

  assert.strictEqual(e.YTMPip.Adapter.isPagePlaying(), false, "premisa: la pagina dice pausado");
  const boton = espiarClic(e.YTMPip.Adapter.getPlayPauseButton());

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.PLAY });

  assert.strictEqual(boton.veces, 1);
});

test("sin medio y sin poder saber, PLAY y PAUSE se abstienen; TOGGLE_PLAY no", () => {
  /*
   * La abstencion, que es la mitad nueva de la regla. En YouTube Music
   * isPagePlaying() contesta undefined a proposito (el <video> es la
   * verdad y aqui no esta), y con "no se puede saber" los fallos son
   * asimetricos: no obedecer deja las cosas como estaban; pulsar a
   * ciegas puede hacer LO CONTRARIO de lo pedido. TOGGLE_PLAY es el
   * contraste que mantiene honesta la abstencion: alternar es lo unico
   * que un alternador hace bien a ciegas, y ese clic sigue saliendo.
   */
  const { win, YTMPip, TIPOS } = entornoControlador();
  win.document.querySelector("video").remove();
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), null, "premisa: no hay video");
  assert.strictEqual(YTMPip.Adapter.isPagePlaying(), undefined, "premisa: YTM no sabe sin video");

  // El mismo andamio que la prueba del TOGGLE_PLAY sin <video>: el
  // fixture no trae alternador y se crea con el selector primario real.
  const alternador = win.document.createElement("button");
  alternador.id = "play-pause-button";
  win.document.body.appendChild(alternador);
  assert.strictEqual(YTMPip.Adapter.getPlayPauseButton(), alternador, "premisa: el adaptador no ve el boton");
  const boton = espiarClic(alternador);

  YTMPip.PlayerController.execute({ type: TIPOS.PLAY });
  YTMPip.PlayerController.execute({ type: TIPOS.PAUSE });
  assert.strictEqual(boton.veces, 0, "a ciegas se pulso el alternador");

  YTMPip.PlayerController.execute({ type: TIPOS.TOGGLE_PLAY });
  assert.strictEqual(boton.veces, 1, "la abstencion se comio tambien el alternar legitimo");
});

/* ------------------------------------------------------------------
 * El MODO VIDEO de Spotify (medido en vivo 2026-09-16): cuando la
 * pista es un video musical SI hay un <video> real en la pagina,
 * colgado de video-player-npv. El DRM impide prestarlo, no escribirle
 * propiedades: estos tres comandos tienen que actuar sobre el medio
 * directamente, como en YouTube Music, y dejar en paz al alternador
 * y al Canvas señuelo.
 * ------------------------------------------------------------------ */

test("SET_VOLUME en modo video escribe sobre el medio real, no sobre el Canvas", () => {
  const e = entornoSpotify("spotify-video.html");
  const videos = e.win.document.querySelectorAll("video");
  assert.strictEqual(videos.length, 2, "premisa: Canvas señuelo + video del modo video");
  const canvas = videos[0];
  const medio = videos[1];

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.SET_VOLUME, level: 0.42 });

  assert.strictEqual(medio.volume, 0.42);
  assert.strictEqual(canvas.volume, 1, "el volumen fue a parar al Canvas señuelo");
});

test("PAUSE en modo video pausa el medio directamente, sin tocar el alternador", () => {
  /*
   * La otra mitad de la regla del clic ciego: con medio a mano, la rama
   * del alternador ni se pisa. Pausar es pause() sobre el <video>, que
   * no es un alternador y no puede hacer lo contrario de lo pedido.
   */
  const e = entornoSpotify("spotify-video.html");
  const medio = e.YTMPip.Adapter.getMediaElement();
  assert.ok(medio, "premisa: en modo video hay medio");
  Object.defineProperty(medio, "paused", { value: false, configurable: true });
  let pausas = 0;
  medio.pause = () => (pausas += 1);
  const boton = espiarClic(e.YTMPip.Adapter.getPlayPauseButton());

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.PAUSE });

  assert.strictEqual(pausas, 1);
  assert.strictEqual(boton.veces, 0, "con medio a mano, el alternador no se toca");
});

test("SEEK_TO en modo video escribe currentTime en el medio", () => {
  /*
   * En modo video el <video> lleva LA PISTA ENTERA (medido: 164,361 s =
   * el 2:44 exacto de la barra), no la linea continua de YouTube Music:
   * el desplazamiento de TrackTimeline sale ≈ 0 y el salto es directo.
   * Se alinea el currentTime con el 0:19 de la barra para que el
   * desplazamiento calculado sea exactamente cero.
   */
  const e = entornoSpotify("spotify-video.html");
  const medio = e.YTMPip.Adapter.getMediaElement();
  assert.ok(medio, "premisa: en modo video hay medio");
  medio.currentTime = 19;

  e.YTMPip.PlayerController.execute({ type: e.TIPOS.SEEK_TO, seconds: 90 });

  assert.strictEqual(medio.currentTime, 90);
});

test("SEEK_TO actua sobre el video PRESTADO a la ventana flotante", () => {
  /*
   * Con el video movido al documento del PiP, un querySelector sobre la
   * pagina ya no lo encuentra. Si el controlador no respetara el prestamo,
   * los comandos irian a parar a la nada (o a otro elemento) y la barra de
   * progreso dejaria de responder justo cuando el video esta visible.
   */
  const { win, YTMPip, TIPOS } = entornoControlador();
  const video = prepararVideo(win, { duration: 200, currentTime: 0 });

  documentoFlotante(win).body.appendChild(video);
  YTMPip.Adapter.setBorrowedMedia(video);

  assert.strictEqual(win.document.querySelector("video"), null, "premisa: el video ya no esta en la pagina");

  YTMPip.PlayerController.execute({ type: TIPOS.SEEK_TO, seconds: 90 });
  assert.strictEqual(video.currentTime, 90);
});
