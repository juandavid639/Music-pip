/*
 * Pruebas de la tanda F: la letra de la ventana y la de la PAGINA, en fase.
 *
 * EL SINTOMA REPORTADO (palabras del usuario): "solo aparece la letra en
 * nuestra extension si se pulsa el boton en Spotify; si nosotros la
 * presionamos desde nuestra extension no pasa nada". El diagnostico no fue
 * una funcion que faltara —OPEN_LYRICS ya pulsaba el boton de la pagina—
 * sino una CONTRAFASE: la ventana mandaba OPEN_LYRICS tambien AL CERRAR su
 * panel, y el boton de letras de Spotify es un alternador, asi que el
 * comando del cierre cerraba la vista de la pagina. A la siguiente
 * apertura la vista estaba cerrada otra vez: panel y pagina vivian
 * permanentemente al reves y nuestro boton parecia muerto.
 *
 * El arreglo son DOS guardas, y cada mitad tiene aqui su vigilante:
 *  - la ventana solo manda OPEN_LYRICS al ABRIR su panel (cerrar lo
 *    nuestro no le cierra al usuario lo que dejo abierto en su pestaña);
 *  - el controlador solo pulsa si la vista de la pagina esta CERRADA
 *    (isPanelOpen(), la misma regla del alternador que play/pause).
 *
 * La tercera parte de la tanda son las BANDAS MEDIDAS del modo escenario:
 * ver la seccion de abajo.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, entornoContenido, RAIZ } = require("../helpers/entorno.js");

const URL_DE_SPOTIFY = "https://open.spotify.com/album/1uD1kdwTWH1DZQZqGKz6rY";

/** Cuenta clics sin depender de que el boton haga nada. */
function espiarClic(el) {
  const registro = { veces: 0 };
  el.addEventListener("click", () => (registro.veces += 1));
  return registro;
}

/** Deja la vista de letras de Spotify CERRADA (el fixture la trae abierta). */
function cerrarVistaDeSpotify(win) {
  const boton = win.document.querySelector("[data-testid='lyrics-button']");
  boton.setAttribute("aria-pressed", "false");
  boton.removeAttribute("data-active");
  return boton;
}

/* ==================================================================
 * 1. El controlador: el alternador de la pagina no se pulsa a ciegas
 * ================================================================== */

test("OPEN_LYRICS con la vista de Spotify YA abierta se abstiene: pulsarla la cerraria", () => {
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  cargar(win, "src/content/player-controller.js");

  // La premisa que hace real el peligro: la vista esta abierta (el
  // fixture trae aria-pressed="true", la señal medida en vivo).
  assert.strictEqual(YTMPip.LyricsReader.isPanelOpen(), true, "premisa: la vista esta abierta");
  const boton = espiarClic(YTMPip.Adapter.getLyricsTab());

  YTMPip.PlayerController.execute({ type: YTMPip.COMMAND_TYPES.OPEN_LYRICS });

  assert.strictEqual(boton.veces, 0, "pulso el alternador con la vista abierta: la CIERRA");
});

test("OPEN_LYRICS con la vista de Spotify cerrada pulsa el boton una vez", () => {
  // La otra mitad, sin la cual la prueba anterior pasaria con un
  // openLyrics() vacio: abrir tiene que seguir pudiendo.
  const { win, YTMPip } = entornoContenido("spotify-sonando.html", { url: URL_DE_SPOTIFY });
  cargar(win, "src/content/player-controller.js");
  cerrarVistaDeSpotify(win);

  assert.strictEqual(YTMPip.LyricsReader.isPanelOpen(), false, "premisa: la vista esta cerrada");
  const boton = espiarClic(YTMPip.Adapter.getLyricsTab());

  YTMPip.PlayerController.execute({ type: YTMPip.COMMAND_TYPES.OPEN_LYRICS });

  assert.strictEqual(boton.veces, 1, "con la vista cerrada, OPEN_LYRICS tiene que abrirla");
});

test("regresion YTM: la pestaña seleccionada no se re-pulsa; la cerrada si", () => {
  /*
   * En YouTube Music re-pulsar la pestaña ya seleccionada era inofensivo
   * (no es un alternador), asi que la guarda alli no arregla nada... pero
   * tampoco puede ROMPER nada: eso es lo que se clava aqui.
   */
  const abierto = entornoContenido("letras-disponibles.html");
  cargar(abierto.win, "src/content/player-controller.js");
  assert.strictEqual(abierto.YTMPip.LyricsReader.isPanelOpen(), true, "premisa: panel abierto");
  const pestanaAbierta = espiarClic(abierto.YTMPip.Adapter.getLyricsTab());
  abierto.YTMPip.PlayerController.execute({ type: abierto.YTMPip.COMMAND_TYPES.OPEN_LYRICS });
  assert.strictEqual(pestanaAbierta.veces, 0);

  const cerrado = entornoContenido("letras-panel-cerrado.html");
  cargar(cerrado.win, "src/content/player-controller.js");
  assert.strictEqual(cerrado.YTMPip.LyricsReader.isPanelOpen(), false, "premisa: panel cerrado");
  const pestanaCerrada = espiarClic(cerrado.YTMPip.Adapter.getLyricsTab());
  cerrado.YTMPip.PlayerController.execute({ type: cerrado.YTMPip.COMMAND_TYPES.OPEN_LYRICS });
  assert.strictEqual(pestanaCerrada.veces, 1, "la guarda se comio la apertura legitima");
});

test("sin LyricsReader cargado, el clic sale igual: la guarda tolera su ausencia", () => {
  /*
   * El controlador se carga en contextos donde el lector de letras no
   * esta (las pruebas viejas del controlador son el ejemplo vivo). La
   * guarda es un `&&`, no una dependencia nueva.
   */
  const { win } = crearEntorno(leerFixture("spotify-sonando.html"), { url: URL_DE_SPOTIFY });
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
  const YTMPip = win.YTMPip;
  assert.strictEqual(YTMPip.LyricsReader, undefined, "premisa: el lector no esta cargado");
  const boton = espiarClic(YTMPip.Adapter.getLyricsTab());

  YTMPip.PlayerController.execute({ type: YTMPip.COMMAND_TYPES.OPEN_LYRICS });

  assert.strictEqual(boton.veces, 1, "sin lector que consultar, el clic de abrir se perdio");
});

/* ==================================================================
 * 2. La ventana: OPEN_LYRICS solo al abrir el panel
 * ================================================================== */

function ventana(fixture = "spotify-sonando.html", url = URL_DE_SPOTIFY) {
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
    "src/content/lyrics-reader.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  win.Element.prototype.scrollTo = function () {};
  win.Element.prototype.scrollIntoView = function () {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    banco: win.YTMPip.PipView.__bancoDePruebas,
    panel: doc.getElementById("ytmpip-lyrics-panel"),
    root: doc.getElementById("ytmpip-root")
  };
}

test("EL SINTOMA, entero: abrir y cerrar nuestro panel deja en paz la vista abierta del usuario", () => {
  /*
   * El escenario exacto de la contrafase: el usuario tiene la vista de
   * letras abierta en SU pestaña de Spotify (el fixture nace asi). Antes,
   * abrir nuestro panel mandaba OPEN_LYRICS (inofensivo aqui gracias a la
   * guarda del controlador)... y CERRARLO mandaba otro, que apagaba la
   * vista del usuario y armaba la contrafase para siempre.
   */
  const v = ventana();
  const botonPagina = v.win.document.querySelector("[data-testid='lyrics-button']");
  assert.strictEqual(botonPagina.getAttribute("aria-pressed"), "true", "premisa: la vista del usuario esta abierta");
  const clics = espiarClic(botonPagina);

  v.banco.pulsarLetras(); // abrir nuestro panel
  assert.strictEqual(v.panel.hidden, false, "premisa: nuestro panel se abrio");
  assert.strictEqual(clics.veces, 0, "abrio pulsando una vista que YA estaba abierta: la cierra");

  v.banco.pulsarLetras(); // cerrar nuestro panel
  assert.strictEqual(v.panel.hidden, true, "premisa: nuestro panel se cerro");
  assert.strictEqual(clics.veces, 0, "el cierre NUESTRO pulso el boton del usuario");
  assert.strictEqual(botonPagina.getAttribute("aria-pressed"), "true", "la vista del usuario amanecio cerrada");
});

test("con la vista de la pagina cerrada, abrir nuestro panel la abre; cerrarlo no la toca", () => {
  const v = ventana();
  const botonPagina = cerrarVistaDeSpotify(v.win);
  const clics = espiarClic(botonPagina);

  v.banco.pulsarLetras(); // abrir: aqui SI hay que pulsar
  assert.strictEqual(v.panel.hidden, false);
  assert.strictEqual(clics.veces, 1, "abrir nuestro panel no abrio la vista de la pagina");

  v.banco.pulsarLetras(); // cerrar: la pagina se queda como este
  assert.strictEqual(v.panel.hidden, true);
  assert.strictEqual(clics.veces, 1, "el cierre volvio a pulsar el boton de la pagina");
});

/* ==================================================================
 * 3. Las bandas del escenario, MEDIDAS en vez de fijas
 *
 * El otro sintoma del reporte ("se ve un poco desordenada"): los 86/148
 * px fijos del CSS eran la pila medida a 380 px de ancho, pero la fila
 * de extras hace flex-wrap y al partirse en dos lineas (medido en la
 * vista previa: a 300 px de ancho la pila pasa de 131 a 165 px) la
 * letra asomaba entre la barra y el transporte y la atribucion quedaba
 * EN MEDIO del transporte. Ahora pip.js mide la pila y escribe las
 * variables; el CSS conserva sus numeros como reserva.
 *
 * jsdom no maqueta (todo mide 0), asi que la parte de "medir de verdad"
 * se fija con getBoundingClientRect suplantados con LOS NUMEROS MEDIDOS
 * en la vista previa; lo que estas pruebas vigilan es la aritmetica y
 * las abstenciones, no el motor de layout, que aqui no existe.
 * ================================================================== */

/** Suplanta la caja de un elemento con top/height fijos. */
function conCaja(el, top, height) {
  el.getBoundingClientRect = () => ({ top, bottom: top + height, height });
}

/**
 * Prepara el escenario con las cajas del CASO ROTO medido en la vista
 * previa (300x560, extras partida en dos lineas): pila de abajo desde
 * y=395, cabecera+titulo hasta y=88.
 */
function escenarioMedido(v) {
  v.root.classList.add("ytmpip-lyrics-stage");
  conCaja(v.root, 0, 560);
  conCaja(v.doc.querySelector(".ytmpip-header"), 0, 34);
  conCaja(v.doc.querySelector(".ytmpip-body"), 34, 54);
  conCaja(v.doc.querySelector(".ytmpip-progress-row"), 395, 15);
  conCaja(v.doc.querySelector(".ytmpip-controls"), 410, 46);
  conCaja(v.doc.querySelector(".ytmpip-extras"), 456, 66);
  // La fila secundaria esta en display:none en el escenario (tanda L) y
  // una caja escondida mide 0: el filtro de visibilidad la suelta. La
  // lista de pip.js la conserva como candidata a proposito (ver alli).
  conCaja(v.doc.querySelector(".ytmpip-secondary-actions"), 0, 0);
}

test("en el escenario las bandas se escriben con la pila medida (el caso del pantallazo)", () => {
  const v = ventana();
  escenarioMedido(v);
  // En la ventana real la franja la declara pip.css; jsdom no carga la
  // hoja, asi que se escribe en linea EL MISMO valor que declara el CSS.
  v.root.style.setProperty("--ytmpip-atribucion", "16px");

  v.banco.vigilarTamano(); // corre applyDensity, que es quien mide

  // arriba = el borde de abajo del titulo (88); abajo = 560-395 + 16.
  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-arriba"), "88px");
  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-abajo"), "181px",
    "la banda no cubre la pila partida en dos lineas: la letra asoma entre los mandos");
});

test("sin maquetacion (todo mide cero) NO se inventa ningun numero: manda la reserva del CSS", () => {
  const v = ventana();
  v.root.classList.add("ytmpip-lyrics-stage");
  v.root.style.setProperty("--ytmpip-atribucion", "16px");
  // Sin conCaja: los getBoundingClientRect de jsdom dan 0, que es
  // exactamente lo que se ve un instante antes de la primera maquetacion.

  v.banco.vigilarTamano();

  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-arriba"), "", "escribio una banda con medidas de cero");
  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-abajo"), "", "escribio una banda con medidas de cero");
});

test("sin la franja de atribucion legible tampoco se escribe: la hoja no cargo", () => {
  const v = ventana();
  escenarioMedido(v);
  // Sin --ytmpip-atribucion por ningun lado: getComputedStyle da "".

  v.banco.vigilarTamano();

  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-abajo"), "", "invento la franja de la atribucion");
});

test("al salir del escenario las bandas escritas se limpian y vuelve el CSS", () => {
  const v = ventana();
  escenarioMedido(v);
  v.root.style.setProperty("--ytmpip-atribucion", "16px");
  v.banco.vigilarTamano();
  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-abajo"), "181px", "premisa: la banda se escribio");

  v.root.classList.remove("ytmpip-lyrics-stage");
  v.win.dispatchEvent(new v.win.Event("resize")); // el mismo camino real

  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-arriba"), "", "la banda vieja se quedo pegada");
  assert.strictEqual(v.root.style.getPropertyValue("--ytmpip-mandos-abajo"), "", "la banda vieja se quedo pegada");
});

/* ==================================================================
 * 4. La tanda L: el escenario limpio ("o lees, o mandas")
 *
 * EL SINTOMA (palabras del usuario, con pantallazo): "se ve muy feo, hay
 * muchas cosas en pantalla... parece como un error de diseño". Al acercar
 * el cursor volvian las cinco filas flotantes ENCIMA de la letra entera,
 * con el texto pasando por detras del deslizador. Tres decisiones, las
 * tres en pip.css: la letra se aparta cuando los mandos entran (salvo
 * bajo el propio cursor), la fila secundaria sale del escenario a todos
 * los tamaños, y la linea activa crece mientras las vecinas se apagan.
 *
 * jsdom no maqueta ni resuelve :hover, asi que aqui se vigila que las
 * decisiones esten TOMADAS en la hoja, leyendola como texto (las mismas
 * armas que pip-halo). Cada regex exige selector Y propiedad juntos: uno
 * laxo que pasara con la regla borrada seria un mutante inmortal.
 * ================================================================== */

const HOJA = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

test("la fila secundaria no existe en el escenario, a ningun tamaño", () => {
  const regla = HOJA.match(
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage \.ytmpip-secondary-actions\s*\{([^}]*)\}/
  );
  assert.ok(regla, "falta la regla de la fila secundaria en el escenario");
  assert.match(regla[1], /display:\s*none/, "la fila sigue pintandose en el escenario");
  // El selector no distingue tamaños a proposito: sin .compact ni
  // .ytmpip-mini ni media query, vale para todos de una vez.
  assert.doesNotMatch(regla[1], /z-index/, "quedo el posicionado de cuando la fila flotaba: la regla vieja no se reemplazo");
});

test("con los mandos en pantalla la letra se aparta, y bajo el propio cursor vuelve entera", () => {
  // La mitad "se aparta": cursor o foco en la ventana -> panel al 25 %.
  assert.match(
    HOJA,
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage:is\(:hover, :focus-within\)\s+\.ytmpip-lyrics-panel:not\(\[hidden\]\)\s*\{\s*opacity:\s*0\.25;/,
    "falta el atenuado de la letra con los mandos en pantalla"
  );
  // La mitad "vuelve": el cursor (o el foco) sobre el propio panel gana.
  assert.match(
    HOJA,
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage\s+\.ytmpip-lyrics-panel:not\(\[hidden\]\):is\(:hover, :focus-within\)\s*\{\s*opacity:\s*1;/,
    "falta la vuelta de la letra bajo el propio cursor"
  );
});

test("las dos reglas del atenuado empatan en peso: la que devuelve tiene que ir DESPUES", () => {
  // Ambos selectores pesan (1,5,0): id + cuatro clases/pseudoclases. El
  // desempate es el orden en la hoja, asi que el orden ES comportamiento:
  // con las reglas al reves, apuntar a una linea la dejaria al 25 %.
  const atenuar = HOJA.search(/\.ytmpip-lyrics-stage:is\(:hover, :focus-within\)\s+\.ytmpip-lyrics-panel/);
  const devolver = HOJA.search(/\.ytmpip-lyrics-panel:not\(\[hidden\]\):is\(:hover, :focus-within\)/);
  assert.notStrictEqual(atenuar, -1, "premisa: la regla de atenuar existe");
  assert.notStrictEqual(devolver, -1, "premisa: la regla de devolver existe");
  assert.ok(devolver > atenuar, "la regla de devolver esta ANTES que la de atenuar: el empate lo gana atenuar");
});

test("el atenuado vive dentro de @media (hover: hover): en tactil la letra queda siempre entera", () => {
  // En una pantalla tactil no hay cursor que acercar: si el atenuado
  // viviera fuera del media, :focus-within tras cualquier toque dejaria
  // la letra al 25 % sin forma de recuperarla.
  // Con la llave de apertura: el texto "@media (hover: hover)" a secas
  // tambien vive en dos COMENTARIOS de la hoja y anclaria en el primero.
  const media = HOJA.indexOf("@media (hover: hover) {");
  assert.notStrictEqual(media, -1, "premisa: el bloque de hover existe");
  const cierre = HOJA.indexOf("\n}", media); // el cierre del media, a columna 0
  const atenuar = HOJA.search(/\.ytmpip-lyrics-stage:is\(:hover, :focus-within\)\s+\.ytmpip-lyrics-panel/);
  assert.ok(media < atenuar && atenuar < cierre, "el atenuado quedo fuera del @media (hover: hover)");
});

test("la jerarquia del escenario: la activa mas grande y entera, las vecinas apagadas", () => {
  const linea = HOJA.match(
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage \.ytmpip-lyric-line\s*\{([^}]*)\}/
  );
  const activa = HOJA.match(
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage \.ytmpip-lyric-line\.ytmpip-lyric-active\s*\{([^}]*)\}/
  );
  assert.ok(linea, "falta la regla de las lineas del escenario");
  assert.ok(activa, "falta la regla de la linea activa del escenario");

  // "Mas grande" se comprueba COMPARANDO, no clavando pixeles: los
  // numeros exactos son un juicio estetico que puede ajustarse; la
  // relacion entre ellos es la decision.
  const tamano = (cuerpo) => {
    const m = cuerpo.match(/font-size:\s*([\d.]+)px/);
    return m ? parseFloat(m[1]) : NaN;
  };
  assert.ok(tamano(linea[1]) > 13, "las lineas del escenario no crecen sobre los 13px heredados");
  assert.ok(tamano(activa[1]) > tamano(linea[1]), "la activa no es mas grande que sus vecinas");

  const apagado = linea[1].match(/opacity:\s*([\d.]+)/);
  assert.ok(apagado && parseFloat(apagado[1]) < 1, "las vecinas no se apagan");
  assert.match(activa[1], /opacity:\s*1\b/, "la activa tambien quedo apagada");
});

test("movimiento reducido: el escenario conserva apagado y tamaño pero pierde el fundido", () => {
  // Las reglas nuevas llevan el id y pesan mas que las clases sueltas del
  // bloque de movimiento reducido: sin entradas con su MISMO peso alli,
  // el fundido seguiria vivo justo para quien pidio que no lo hubiera.
  const bloque = HOJA.slice(HOJA.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  const regla = bloque.match(/([^{}]*\.ytmpip-lyrics-stage \.ytmpip-lyrics-panel[^{}]*)\{([^}]*)\}/);
  assert.ok(regla, "el panel del escenario no aparece en el bloque de movimiento reducido");
  assert.match(
    regla[1],
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage \.ytmpip-lyrics-panel:not\(\[hidden\]\)/,
    "la entrada del panel no lleva el peso completo: no ganaria el empate"
  );
  assert.match(
    regla[1],
    /#ytmpip-root\.ytmpip-overlay\.ytmpip-lyrics-stage \.ytmpip-lyric-line/,
    "la entrada de las lineas no lleva el peso completo: no ganaria el empate"
  );
  assert.match(regla[2], /transition:\s*none/, "la regla que las agrupa no quita la transicion");
});
