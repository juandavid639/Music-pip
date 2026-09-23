/*
 * Pruebas del ADAPTADOR DE SPOTIFY (src/content/spotify-adapter.js),
 * la tanda 3 de "podemos adaptar la extensión a youtube normal y a spotify".
 *
 * Todos los numeros raros de estas pruebas son MEDIDOS, no imaginados:
 * salen de cuatro diagnosticos (tools/diagnostico-spotify.js a -4.js)
 * sobre paginas reales de open.spotify.com mas dos experimentos de clic
 * del usuario (los tres estados de repetir, los dos del aleatorio). El
 * fixture (spotify-sonando.html) los calca y las pruebas ademas los
 * CUENTAN, para que un fixture recortado no las deje en verde vigilando
 * nada.
 *
 * El hallazgo que gobierna la mitad de la bateria: EL AUDIO NO ESTA EN
 * LA PAGINA. Con musica sonando se midieron CERO <video>/<audio> (dos
 * pasadas), y el unico que a veces aparece es el Canvas: un bucle visual
 * mudo de 6,9 s. De ahi que el medio sea null, que el tiempo salga de
 * los textos de la barra y que "esta sonando" se lea del DIBUJO del
 * boton de play/pausa (metodo isPagePlaying, el numero 37 del contrato,
 * que entro con esta tanda).
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido, plano } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

// Prefijos MEDIDOS de los dibujos del boton de play/pausa (el aria-label
// viene traducido; el path no). Pausa a la vista = suena; play = pausado.
const DIBUJO_DE_PAUSA = "M2.7 1a.7.7 0 0 0-.7.7v12.6";
const DIBUJO_DE_PLAY = "M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288";

/** El entorno estandar, pero viviendo en open.spotify.com. */
function entornoSpotify(opciones = {}) {
  return entornoContenido("spotify-sonando.html", Object.assign({ url: URL_DE_SPOTIFY }, opciones));
}

/** El MODO VIDEO medido en vivo (2026-09-16): el fixture con el <video>
 *  real colgado de video-player-npv, ademas del Canvas señuelo. */
function entornoSpotifyVideo(opciones = {}) {
  return entornoContenido("spotify-video.html", Object.assign({ url: URL_DE_SPOTIFY }, opciones));
}

/* ==================================================================
 * 1. La eleccion por hostname y las capacidades honestas
 * ================================================================== */

test("en open.spotify.com el registro elige al adaptador de spotify", () => {
  const { YTMPip } = entornoSpotify();

  const activo = YTMPip.Adaptadores.activo();
  assert.strictEqual(activo.id, "spotify");
  assert.strictEqual(
    YTMPip.Adapter,
    activo.adapter,
    "YTMPip.Adapter debe ser EL MISMO objeto registrado, no una copia"
  );

  // La prueba de fuego de que el elegido lee ESTA pagina.
  assert.strictEqual(
    YTMPip.Adapter.getTitleElement().textContent.trim(),
    "El Precio de Tu Error"
  );

  /*
   * Las capacidades, con su evidencia del diagnostico: letras (33
   * lyrics-line), cola (2 ul con 1+12 filas), repetir (aria-checked de
   * tres posiciones), aleatorio (el boton existe) y me gusta (boton con
   * aria-checked) SI; medio escribible, video y grafo NO, porque el
   * audio no esta en el DOM: no hay sobre que escribir volumen ni
   * velocidad, lo unico prestable seria el Canvas mudo y el grafo
   * silenciaria. Se recorre la lista DEL CONTRATO para que una
   * capacidad nueva sin decidir aqui haga caer la prueba (asi entro
   * medioEscribible: esta prueba cayo).
   */
  const esperadas = {
    letras: true,
    cola: true,
    repetir: true,
    aleatorio: true,
    meGusta: true,
    medioEscribible: false,
    videoPrestable: false,
    audioGrafo: false
  };
  YTMPip.Adaptadores.CAPACIDADES_DEL_CONTRATO.forEach((cap) => {
    assert.strictEqual(YTMPip.Capacidades[cap], esperadas[cap], "capacidad " + cap);
  });
});

/* ==================================================================
 * 2. El medio que no existe: el Canvas no cuela
 * ================================================================== */

test("no hay medio que entregar aunque el Canvas este en la pagina", () => {
  const { win, YTMPip } = entornoSpotify();

  // El guardia del fixture: el Canvas medido tiene que estar. Sin el,
  // esta prueba estaria en verde sin vigilar la trampa real (un
  // adaptador que devolviera "el primer video de la pagina").
  const videos = win.document.querySelectorAll("video");
  assert.strictEqual(videos.length, 1, "el fixture debe conservar el <video> del Canvas");
  assert.ok(videos[0].hasAttribute("muted"), "el Canvas medido esta silenciado");

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), null);
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), null);
  assert.strictEqual(YTMPip.Adapter.getReplacementFor(videos[0]), null);
});

/* ==================================================================
 * 2b. El medio que SI existe: el modo video, medido el 2026-09-16
 * ================================================================== */

test("en modo video getMediaElement devuelve el video anclado, no el Canvas", () => {
  const { win, YTMPip } = entornoSpotifyVideo();

  /*
   * Los guardias del fixture: DOS <video>, con el Canvas señuelo
   * PRIMERO en orden de documento. Sin el señuelo delante, un selector
   * de 'video' a secas acertaria de chiripa y esta prueba no vigilaria
   * el ancla a video-player-npv, que es su unica razon de ser.
   */
  const videos = win.document.querySelectorAll("video");
  assert.strictEqual(videos.length, 2, "el fixture debe traer Canvas + video del modo video");
  assert.ok(videos[0].hasAttribute("muted"), "el primero debe ser el Canvas silenciado");
  assert.ok(!videos[1].hasAttribute("muted"), "el segundo es la cancion, sin silenciar");

  const medio = YTMPip.Adapter.getMediaElement();
  assert.strictEqual(medio, videos[1], "el medio de control es el de video-player-npv");
  assert.ok(medio.closest("[data-testid='video-player-npv']"), "y cuelga del ancla medida");

  /*
   * Lo que NO cambia con el modo: el prestamo sigue vetado. Adoptar un
   * video con DRM en otro documento rompe la sesion de claves (pantalla
   * negra); el DRM protege los bytes, no las propiedades. Controlar si;
   * prestar no.
   */
  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), null);
  assert.strictEqual(YTMPip.Adapter.getReplacementFor(videos[1]), null);
});

/* ==================================================================
 * 3. Titulo y artistas anclados a la ficha, entre señuelos
 * ================================================================== */

test("titulo, artistas y caratula salen de la ficha y no de los señuelos", () => {
  const { win, YTMPip } = entornoSpotify();
  const doc = win.document;

  // Los guardias del fixture: los recuentos MEDIDOS de cada testid
  // suelto. Sin señuelos, el ancla al widget no vigilaria nada.
  assert.strictEqual(doc.querySelectorAll("[data-testid='context-item-info-title']").length, 2);
  assert.strictEqual(doc.querySelectorAll("[data-testid='context-item-info-subtitles']").length, 2);
  assert.strictEqual(doc.querySelectorAll("[data-testid='cover-art-image']").length, 3);

  const estado = YTMPip.MetadataReader.read();
  assert.strictEqual(estado.title, "El Precio de Tu Error");
  /*
   * El byline de Spotify no lleva "•": el split del lector es inocuo y
   * el artista publicado es el texto entero del envoltorio, con TODOS
   * los artistas y sus comas. Es lo honesto: partir por coma inventaria
   * que "Nico Hernández, Banda Los Recoditos" es un solo artista menos.
   */
  assert.strictEqual(estado.artist, "Yeison Jiménez, Pasabordo");
  assert.strictEqual(estado.album, undefined);

  // La caratula de la FICHA (la URL de scdn no lleva el sufijo =wNNN-hNNN
  // de YouTube: el reemplazo del lector no la toca).
  assert.strictEqual(
    estado.artworkUrl,
    "https://i.scdn.co/image/ab67616d00004851caratulabuena"
  );

  /*
   * EL ROBO DEL CANVAS, medido y confesado: cuando la cancion trae
   * Canvas, el video mudo ocupa el hueco de la caratula en la barra
   * (una pasada entera del diagnostico sin cover-art-image en la
   * ficha). Sin imagen en la ficha no se inventa: undefined, y la
   * ventana cae a su caratula de reserva.
   */
  doc.querySelector("[data-testid='now-playing-widget'] [data-testid='cover-art-image']").remove();
  assert.strictEqual(YTMPip.MetadataReader.read().artworkUrl, undefined);
});

/* ==================================================================
 * 4. La estrella: el tiempo sale de los textos, no del value cuantizado
 * ================================================================== */

test("el tiempo sale del texto y del max, nunca del value a saltos de 5000", () => {
  const { win, YTMPip } = entornoSpotify();

  /*
   * La mentira medida, reproducida tal cual: el texto dice 0:19
   * mientras el value del input dice 20000 (cuantizado a saltos de
   * step=5000 ms). El max si es exacto: 161983 ms para la cancion de
   * 2:41. Esta prueba impide que alguien "arregle" getPageTrackTime
   * haciendolo leer el value.
   */
  const input = win.document.querySelector("[data-testid='playback-progressbar'] input");
  assert.strictEqual(input.value, "20000", "el fixture debe conservar el value cuantizado medido");

  assert.deepStrictEqual(plano(YTMPip.Adapter.getPageTrackTime()), {
    elapsed: 19,
    duration: 161.983
  });

  // Sin el input, la duracion cae al texto "2:41" (segundos enteros).
  input.remove();
  assert.deepStrictEqual(plano(YTMPip.Adapter.getPageTrackTime()), {
    elapsed: 19,
    duration: 161
  });

  // Sin texto de posicion legible no se adivina nada: null, y
  // TrackTimeline hara lo suyo (que aqui, sin medio, es {0, 0}).
  win.document.querySelector("[data-testid='playback-position']").textContent = "";
  assert.strictEqual(YTMPip.Adapter.getPageTrackTime(), null);
});

/* ==================================================================
 * 5. El metodo 37: "esta sonando" leido del dibujo del boton
 * ================================================================== */

test("isPagePlaying lee el icono: pausa=suena, play=pausado, otro=no se", () => {
  const { win, YTMPip } = entornoSpotify();
  const path = win.document.querySelector("[data-testid='control-button-playpause'] svg path");

  // El fixture reproduce el estado SONANDO: se ve el icono de pausa.
  assert.strictEqual(YTMPip.Adapter.isPagePlaying(), true);

  // El usuario pausa: Spotify redibuja el triangulo de play (medido).
  path.setAttribute("d", DIBUJO_DE_PLAY + "a.7.7 0 0 1 0 1.212z");
  assert.strictEqual(YTMPip.Adapter.isPagePlaying(), false);

  // Un dibujo desconocido (Spotify rediseña el icono): undefined, que
  // es "no se puede saber", nunca una mentira en ninguna direccion.
  path.setAttribute("d", "M9 3h6v18H9z");
  assert.strictEqual(YTMPip.Adapter.isPagePlaying(), undefined);

  // Sin boton (la barra a medio pintar), lo mismo.
  win.document.querySelector("[data-testid='control-button-playpause']").remove();
  assert.strictEqual(YTMPip.Adapter.isPagePlaying(), undefined);
});

/* ==================================================================
 * 6. Me gusta sin "no me gusta": LIKE, INDIFFERENT o no se sabe
 * ================================================================== */

test("me gusta es el unico boton con aria-checked de la ficha", () => {
  const { win, YTMPip } = entornoSpotify();
  const { LIKE_STATUS } = YTMPip.CONSTANTS;
  const widget = win.document.querySelector("[data-testid='now-playing-widget']");

  /*
   * El guardia del fixture: EXACTAMENTE un boton con aria-checked
   * dentro de la ficha, con otro boton al lado sin el. Es la razon de
   * ser del selector: el testid 'add-button' resulto NO ser de fiar
   * (en una pasada casaba con el boton de la pagina de album y en otra
   * con ninguno) y el atributo si.
   */
  assert.strictEqual(widget.querySelectorAll("button").length, 2);
  const boton = widget.querySelector("button[aria-checked]");
  assert.strictEqual(widget.querySelectorAll("button[aria-checked]").length, 1);
  /*
   * El guardia de la trampa: en la PAGINA hay CUATRO botones con
   * aria-checked (guardar el album —el 'add-button' traicionero, que va
   * antes que la ficha—, me gusta, repetir y el de la cola). Sin este
   * recuento, quitarle el ancla al selector seguiria acertando de
   * chiripa y la prueba no vigilaria nada.
   */
  assert.strictEqual(win.document.querySelectorAll("button[aria-checked]").length, 4);
  assert.strictEqual(YTMPip.Adapter.getLikeButton(), boton);

  // aria-checked="false" en el fixture: la cancion no esta guardada.
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), LIKE_STATUS.INDIFFERENT);

  boton.setAttribute("aria-checked", "true");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), LIKE_STATUS.LIKE);

  // Spotify no tiene "no me gusta" en el reproductor (medido): null.
  assert.strictEqual(YTMPip.Adapter.getDislikeButton(), null);

  // Sin boton a la vista no se inventa estado.
  boton.remove();
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), undefined);
});

/* ==================================================================
 * 7. Repetir: las tres posiciones de aria-checked, medidas a clics
 * ================================================================== */

test("repetir traduce aria-checked al vocabulario NONE/ALL/ONE", () => {
  const { win, YTMPip } = entornoSpotify();
  const boton = win.document.querySelector("[data-testid='control-button-repeat']");

  /*
   * MEDIDO CON TRES CLICS DEL USUARIO: false=apagado, true=repetir
   * todo, mixed=repetir una. (El aria-label del boton describe el
   * SIGUIENTE clic, no el estado, y ademas viene traducido: por eso el
   * adaptador solo mira el atributo.)
   */
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), "NONE");

  boton.setAttribute("aria-checked", "true");
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), "ALL");

  boton.setAttribute("aria-checked", "mixed");
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), "ONE");

  // "mixed" (repetir una) cuenta como puesto para la luz del boton.
  assert.strictEqual(YTMPip.Adapter.isToggleActive(boton), true);

  boton.setAttribute("aria-checked", "banana");
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), undefined);

  boton.remove();
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), undefined);
});

/* ==================================================================
 * 8. El aleatorio fantasma: clicable, con el estado ilegible
 * ================================================================== */

test("el aleatorio se caza por no tener data-testid y su estado es undefined", () => {
  const { win, YTMPip } = entornoSpotify();
  const controles = win.document.querySelector("[data-testid='player-controls']");

  // Los guardias del fixture: 5 botones medidos, 4 con nombre. El
  // aleatorio es EL que no tiene, y esa ausencia es su unico selector.
  assert.strictEqual(controles.querySelectorAll("button").length, 5);
  assert.strictEqual(controles.querySelectorAll("button[data-testid]").length, 4);

  const boton = YTMPip.Adapter.getShuffleButton();
  assert.ok(boton, "el aleatorio debe encontrarse");
  assert.strictEqual(boton.getAttribute("data-testid"), null);

  /*
   * MEDIDO EN LOS DOS ESTADOS (dos clics del usuario): sin aria-checked
   * y sin aria-pressed, encendido y apagado; solo cambia el aria-label
   * traducido. El boton se puede clicar; su estado, honestamente, no
   * se puede leer.
   */
  assert.strictEqual(YTMPip.Adapter.isToggleActive(boton), undefined);
  assert.strictEqual(YTMPip.MetadataReader.read().shuffleOn, undefined);
});

/* ==================================================================
 * 9. La cola: separacion estructural y artistas enteros
 * ================================================================== */

test("la cola separa el primer ul (sonando) de lo que viene, sin idioma", () => {
  const { win, YTMPip } = entornoSpotify();
  const Adapter = YTMPip.Adapter;

  // Los guardias del fixture: DOS ul medidos (1 fila + el resto).
  const aside = win.document.querySelector("aside[aria-label='Fila de reproducción']");
  const uls = aside.querySelectorAll("ul");
  assert.strictEqual(uls.length, 2);
  assert.strictEqual(uls[0].querySelectorAll("li").length, 1);
  assert.strictEqual(uls[1].querySelectorAll("li").length, 3);

  const items = Adapter.getQueueItems();
  assert.strictEqual(items.length, 4);

  /*
   * "Seleccionada" es pertenecer al PRIMER ul: las filas no llevan
   * selected ni aria-current (medido: null en todas) y los aria-label
   * de los ul vienen traducidos, asi que la unica señal sin idioma es
   * la estructura.
   */
  assert.strictEqual(Adapter.isQueueItemSelected(items[0]), true);
  items.slice(1).forEach((item, i) => {
    assert.strictEqual(Adapter.isQueueItemSelected(item), false, "fila siguiente " + i);
  });

  // El titulo por su clase medida (encore)...
  assert.strictEqual(Adapter.getQueueItemTitleElement(items[1]).textContent, "Vas a Llorar");

  // ...y el byline es el envoltorio ENTERO, con todos los artistas.
  assert.strictEqual(
    Adapter.getQueueItemBylineElement(items[2]).textContent,
    "Nico Hernández, Banda Los Recoditos"
  );

  // Lo que publica el lector: las 3 que vienen DESPUES de la sonando.
  assert.deepStrictEqual(plano(YTMPip.MetadataReader.read().upNext), [
    { title: "Vas a Llorar", artist: "Yeison Jiménez" },
    { title: "El Amor de Mi Vida", artist: "Nico Hernández, Banda Los Recoditos" },
    { title: "Aventurero", artist: "Pasabordo" }
  ]);

  /*
   * EL DIA QUE LA CLASE ROTE: e-10860-line-clamp es de la libreria
   * encore y cambiara de numero con cualquier actualizacion. La
   * busqueda estructural (primer span con texto propio que no este en
   * un enlace ni un boton) tiene que responder lo mismo sin la clase.
   */
  win.document.querySelectorAll("span.e-10860-line-clamp").forEach((s) => s.removeAttribute("class"));
  assert.strictEqual(Adapter.getQueueItemTitleElement(items[1]).textContent, "Vas a Llorar");
});

/* ==================================================================
 * 10. Letras: 33 divs convertidos en UNA letra, y la confesion
 * ================================================================== */

test("las letras se sirven en un portador sintetico linea a linea", () => {
  const { win, YTMPip } = entornoSpotify();
  const { LYRICS_STATUS } = YTMPip.CONSTANTS;

  // El guardia del fixture: las lineas medidas (68 reales en la segunda
  // pasada; aqui 7, con las vacias de los bordes y la interior).
  assert.strictEqual(win.document.querySelectorAll("[data-testid='lyrics-line']").length, 7);

  /*
   * El lector nativo espera UN elemento con la letra separada por \n;
   * Spotify la pinta en divs sueltos. El adaptador fabrica un portador
   * desconectado que las junta, y lo REUTILIZA entre lecturas (los
   * lectores preguntan varias veces por segundo).
   */
  /*
   * El trim() final del portador recorta las vacias del frente y la del
   * final, pero CONSERVA la interior: es el separador de estrofa y
   * ademas mantiene la invariante de que unir con \n reconstruye el
   * texto emitido exacto.
   */
  const portador = YTMPip.Adapter.getLyricsTextElement();
  assert.strictEqual(portador.textContent, "Linea uno de relleno\nLinea dos de relleno\n\nLinea tres de relleno");
  assert.strictEqual(YTMPip.Adapter.getLyricsTextElement(), portador, "el portador se reutiliza");
  assert.strictEqual(portador.parentNode, null, "el portador nunca se inserta en la pagina");

  // El boton medido lleva aria-pressed="true" con la vista abierta: la
  // señal sin idioma que isPanelOpen aprendio en esta tanda.
  assert.strictEqual(YTMPip.LyricsReader.isPanelOpen(), true);

  const lectura = plano(YTMPip.LyricsReader.read());
  assert.strictEqual(lectura.status, LYRICS_STATUS.AVAILABLE);
  assert.strictEqual(lectura.source, "Spotify");
  assert.deepStrictEqual(lectura.lines, [
    { text: "Linea uno de relleno", time: null },
    { text: "Linea dos de relleno", time: null },
    { text: "", time: null },
    { text: "Linea tres de relleno", time: null }
  ]);

  /*
   * LA CONFESION DE LA TANDA: cuando la cancion no trae letra, Spotify
   * solo lo dice en un aria-label TRADUCIDO, y ninguna señal sin
   * idioma se midio. Antes que leer español, el adaptador no lo sabe:
   * sin lineas a la vista el estado se queda en LOADING ("aun no se
   * sabe"), no en UNAVAILABLE. Esta prueba fija la confesion para que
   * un cambio la convierta en decision consciente.
   */
  win.document.querySelectorAll("[data-testid='lyrics-line']").forEach((l) => l.remove());
  assert.strictEqual(YTMPip.LyricsReader.read().status, LYRICS_STATUS.LOADING);
});

/* ==================================================================
 * 10b. La linea que se CANTA: la clase que nadie repite
 *
 * Medido 2026-09-16 (diez fotos en veinte segundos): las lineas no
 * traen tiempos ni ningun atributo estructural (solo dir, class y
 * data-testid); la unica señal de sincronia es que la linea que suena
 * lleva una clase que ninguna otra repite, y esa marca se muda de
 * linea al avanzar la cancion. Las clases vienen minificadas y ROTAN
 * entre despliegues, asi que el adaptador CALCULA cual es la de
 * recuento uno en vez de buscar un nombre.
 * ================================================================== */

test("la linea que se canta es la que lleva la clase que nadie repite", () => {
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  /*
   * Los guardias del fixture: 7 lineas (2 vacias al frente, una
   * interior, una al final) y TODAS con la clase base comun. Sin la
   * base en todas, "tener clase" ya distinguiria a la marcada y la
   * prueba estaria en verde vigilando un calculo mas tonto que el
   * real (el primer classList no vacio).
   */
  assert.strictEqual(lineas.length, 7);
  lineas.forEach((linea) =>
    assert.ok(linea.classList.contains("clase-base-minificada"), "premisa: la clase base es de todas")
  );
  assert.strictEqual(
    win.document.querySelectorAll("[data-testid='lyrics-line'].marca-de-la-que-canta").length,
    1,
    "premisa: la marca esta en UNA linea"
  );

  /*
   * LA REGRESION DEL DESFASE (avistada en vivo 2026-09-16): la marca
   * vive en el DOM 3, pero el portador recorta las 2 vacias del frente,
   * asi que el indice tiene que llegar en el espacio EMITIDO: 1. El
   * indice del DOM a secas resaltaba dos versos mas abajo.
   */
  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), 1);
  const lectura = YTMPip.LyricsReader.read();
  assert.strictEqual(
    lectura.lines[lectura.activeLine].text,
    "Linea dos de relleno",
    "el indice tiene que señalar el MISMO verso que la pagina marca"
  );
});

test("las clases rotan con cada despliegue: el calculo sobrevive al renombre", () => {
  /*
   * La trampa que mata a cualquier implementacion que se aprenda un
   * nombre: se renombran TODAS las clases (como hara el proximo build
   * minificado de Spotify) y ademas la marca amanece en otra linea.
   * La estructura es la misma —una base comun, una clase de recuento
   * uno— asi que el indice tiene que salir igual de bien.
   */
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  lineas.forEach((linea) => { linea.className = "Xq9RzT_nuevoBase"; });
  lineas[2].className = "Xq9RzT_nuevoBase Zz1_marcaNueva"; // la primera NO vacia

  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), 0);

  // Y el 0 viaja como 0 hasta el estado: cualquier truthy por el camino
  // se comeria justo la primera linea de cada cancion.
  assert.strictEqual(YTMPip.LyricsReader.read().activeLine, 0);
});

test("sin marca, abstencion: undefined y no un verso al azar", () => {
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  // Ninguna linea con clase unica (un DOM entre mutaciones): no se sabe.
  lineas[3].classList.remove("marca-de-la-que-canta");
  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), undefined);

  // Y sin lineas a la vista (vista de letras cerrada), tampoco.
  lineas.forEach((linea) => linea.remove());
  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), undefined);
});

test("con DOS lineas marcadas, abstencion: la señal es ambigua", () => {
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  // Otra linea gana su propia clase unica: ya no se sabe cual canta.
  lineas[5].classList.add("otra-clase-de-recuento-uno");
  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), undefined);
});

test("dos clases unicas en la MISMA linea cuentan como una sola marca", () => {
  /*
   * La forma real medida: el class de la linea activa traia DOS clases
   * ("rzOQ… dPaa…") y no se midio cual de ellas comparten las vecinas.
   * Si ambas fueran unicas, una cuenta por clases en vez de por lineas
   * diria "dos marcas" y se abstendria de la linea correcta.
   */
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  lineas[3].classList.add("segunda-clase-unica-de-la-misma-linea");
  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), 1);
});

test("las vacias interiores NO se restan: solo las del frente desaparecen", () => {
  /*
   * El separador de estrofa (la vacia interior) SI viaja en la letra
   * emitida; el trim() del portador solo recorta los bordes. Restar
   * todas las vacias anteriores en vez de solo las del frente volveria
   * a desfasarse justo despues de cada estrofa.
   */
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  lineas[3].classList.remove("marca-de-la-que-canta");
  lineas[5].classList.add("marca-de-la-que-canta"); // "Linea tres", con la vacia interior en medio

  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), 3, "DOM 5 - 2 del frente = 3, la interior no cuenta");
  const lectura = YTMPip.LyricsReader.read();
  assert.strictEqual(lectura.lines[lectura.activeLine].text, "Linea tres de relleno");
});

test("marca en una vacia del frente: el adaptador se abstiene", () => {
  /*
   * Si la pagina marca una linea que el portador recorto, el indice
   * mapeado seria negativo: no existe en la letra que el PiP conoce.
   * Mejor "no se sabe" que un resalte imposible.
   */
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  lineas[3].classList.remove("marca-de-la-que-canta");
  lineas[0].classList.add("marca-de-la-que-canta");

  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), undefined);
});

test("marca en la vacia del final: la cota del lector la deja fuera", () => {
  /*
   * El borde de cola es la otra mitad del reparto: el adaptador mapea
   * honesto (DOM 6 - 2 = 4) sin saber cuantas lineas emitio el texto,
   * y es la cota del lector (activa < lineas.length) la que convierte
   * ese fuera-de-rango en abstencion. Esta prueba fija el reparto.
   */
  const { win, YTMPip } = entornoSpotify();
  const lineas = win.document.querySelectorAll("[data-testid='lyrics-line']");

  lineas[3].classList.remove("marca-de-la-que-canta");
  lineas[6].classList.add("marca-de-la-que-canta");

  assert.strictEqual(YTMPip.Adapter.getActiveLyricsLineIndex(), 4, "el adaptador mapea sin juzgar la cola");
  assert.strictEqual(YTMPip.LyricsReader.read().activeLine, undefined, "la cota del lector la convierte en abstencion");
});

test("el lector publica activeLine: el indice viaja con el estado", () => {
  const { win, YTMPip } = entornoSpotify();
  const { LYRICS_STATUS } = YTMPip.CONSTANTS;

  const lectura = YTMPip.LyricsReader.read();
  assert.strictEqual(lectura.status, LYRICS_STATUS.AVAILABLE);
  assert.strictEqual(lectura.activeLine, 1, "el indice de la pagina tiene que viajar con la letra");

  // La abstencion tambien viaja honesta: undefined, nunca un 0 falso.
  win.document.querySelector(".marca-de-la-que-canta").classList.remove("marca-de-la-que-canta");
  assert.strictEqual(YTMPip.LyricsReader.read().activeLine, undefined);
});

/* ==================================================================
 * 11. La integracion: el estado entero sin ningun <video>
 * ================================================================== */

test("el lector de metadatos publica un estado completo sin medio", () => {
  const { win, YTMPip } = entornoSpotify();

  const estado = YTMPip.MetadataReader.read();

  // El camino nuevo del contrato: sin medio, "suena" lo dice el icono.
  assert.strictEqual(estado.playing, true);

  // El tiempo entero desde la pagina (TrackTimeline sin <video>).
  assert.strictEqual(estado.currentTime, 19);
  assert.strictEqual(estado.duration, 161.983);

  // Sin medio, el volumen YA NO es un invento: sale del deslizador de
  // la pagina (getPageVolume, valor medido 0.4 en el fixture). Los
  // otros dos siguen en sus valores neutros: no hay de donde leerlos.
  assert.strictEqual(estado.hasVideo, false);
  assert.strictEqual(estado.volume, 0.4);
  assert.strictEqual(estado.muted, false);

  assert.strictEqual(estado.repeatMode, "NONE");
  assert.strictEqual(estado.repeatOn, false);
  assert.strictEqual(estado.shuffleOn, undefined);
  assert.strictEqual(estado.likeStatus, YTMPip.CONSTANTS.LIKE_STATUS.INDIFFERENT);

  // Y al pausar (el icono cambia de dibujo), playing cae a false.
  win.document
    .querySelector("[data-testid='control-button-playpause'] svg path")
    .setAttribute("d", DIBUJO_DE_PLAY + "a.7.7 0 0 1 0 1.212z");
  assert.strictEqual(YTMPip.MetadataReader.read().playing, false);
});
