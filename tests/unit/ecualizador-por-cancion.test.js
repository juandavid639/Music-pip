/*
 * Pruebas del ECUALIZADOR POR CANCION.
 *
 * Lo que se pidio: fijar un ajuste del ecualizador a una cancion concreta
 * para que se ponga solo cada vez que esa cancion suene.
 *
 * El diseño que se prueba es el de ESCRITURA DIRECTA: el modulo no tiene
 * camino propio al grafo; escribe la preferencia global con
 * Settings.guardarEcualizador y todo lo demas reacciona como si lo hubiera
 * tocado el usuario. Eso deja UN riesgo por encima de todos: que la maquina
 * escriba y no devuelva, o devuelva pisando al usuario. La seccion 2 es
 * entera para esa maquina de estados.
 *
 * Reparto en cinco:
 *
 *  1. LA CLAVE Y LA MEMORIA (puras): que identifica a una cancion y que
 *     entra del storage. Los riesgos: una clave vacia que agrupe "no hay
 *     cancion" con una cancion real, y basura guardada que se cuele
 *     disfrazada de ajuste.
 *  2. LA MAQUINA DE ESTADOS de alSonar: aplicar al empezar, devolver al
 *     acabar, y NO devolver si el usuario tomo el mando en medio.
 *  3. EL BOTON (modulo y ventana): fijar congela lo que suena, soltar no
 *     toca el sonido, y la chincheta no miente.
 *  4. LA CARGA (cargar()): lo fijado sobrevive a cerrar la pestaña, lo
 *     corrupto se tira, y la cancion que YA sonaba al abrir recibe su
 *     ajuste en cuanto la memoria llega.
 *  5. EL LATIDO (entornoPagina): el cable de verdad, de la metadata del
 *     DOM al valor global, sin llamar al modulo a mano.
 *
 * Lo que estas pruebas NO pueden ver: que la cancion fijada SUENE con su
 * ajuste. jsdom no tiene AudioContext, asi que el cruce de la puerta de
 * createMediaElementSource al empezar una cancion fijada solo se comprueba
 * en el Chrome real (y ya existia el mismo limite con el ecualizador
 * encendido al cargar la pagina).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, entornoPagina, pulso, plano, RAIZ } = require("../helpers/entorno.js");

const ventanas = [];
test.after(() => {
  for (const w of ventanas) w.close();
});

// La cancion del fixture de siempre, tal y como la lee MetadataReader:
// titulo "Take On Me" y "a-ha" como primer trozo del byline.
const CLAVE_FIXTURE = "Take On Me\na-ha";

/* ==================================================================
 * 1. LA CLAVE Y LA MEMORIA
 * ================================================================== */

function entornoPuro(opciones) {
  const { win } = crearEntorno(undefined, opciones);
  ventanas.push(win);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/ecualizador.js",
    "src/content/ecualizador-por-cancion.js"
  );
  return { win, M: win.YTMPip.EcualizadorPorCancion, Eq: win.YTMPip.Ecualizador };
}

// Un Map de jsdom, como pares en el realm de Node, para deepStrictEqual.
function pares(mapa) {
  return plano(Array.from(mapa.entries()));
}

test("sin titulo no hay clave: fijar sin cancion seria fijarle el ajuste a la pagina cargando", () => {
  const { M } = entornoPuro();
  for (const basura of [null, undefined, {}, { title: "" }, { title: 42, artist: "x" }]) {
    assert.strictEqual(M.claveDe(basura), null, JSON.stringify(basura));
  }
  // Sin artista si hay clave: el titulo es quien manda, el artista afina.
  assert.strictEqual(M.claveDe({ title: "Cancion" }), "Cancion\n");
});

test("dos artistas con la misma cancion son dos canciones", () => {
  const { M } = entornoPuro();
  const a = M.claveDe({ title: "Hurt", artist: "Nine Inch Nails" });
  const b = M.claveDe({ title: "Hurt", artist: "Johnny Cash" });
  assert.notStrictEqual(a, b);
});

test("POR QUE NO SE REUTILIZA songKeyOf: su separador choca con titulos reales", () => {
  /*
   * songKeyOf (content-script.js) pega con "||", y con ese separador estas
   * dos canciones DISTINTAS darian la misma clave: "a||b" + "c" y "a" +
   * "|b||c"... para una guarda de carrera de milisegundos da igual; para
   * una memoria que persiste dias, no. El salto de linea no puede venir en
   * un titulo de una pagina web (el DOM lo colapsa), asi que no choca.
   */
  const { M } = entornoPuro();
  const a = M.claveDe({ title: "cancion||rara", artist: "x" });
  const b = M.claveDe({ title: "cancion", artist: "rara||x" });
  assert.notStrictEqual(a, b);
  assert.strictEqual("cancion||rara||x", "cancion||rara" + "||" + "x", "asi chocaria songKeyOf");
});

test("basura entera del storage deja la memoria VACIA, no rota", () => {
  const { M } = entornoPuro();
  for (const basura of [null, undefined, 42, "texto", {}, [null, "x", 7]]) {
    assert.deepStrictEqual(pares(M.normalizarMemoria(basura)), [], JSON.stringify(basura));
  }
});

test("una entrada corrupta se TIRA sin arrastrar a las sanas, y no se normaliza a 'off'", () => {
  /*
   * Normalizar aqui convertiria basura en "off", y "off" fijado es una
   * orden real ("esta cancion sin ecualizar"): un dato roto no puede
   * fabricar ordenes. Los valores validos son los PUNTOS FIJOS de
   * Ecualizador.normalizar, y "  graves  " o "cualquier-cosa" no lo son.
   */
  const { M, Eq } = entornoPuro();
  const propio = Eq.normalizar("1,2,-3,0,5");
  assert.strictEqual(Eq.normalizar(propio), propio, "la forma canonica tiene que ser punto fijo");

  const memoria = M.normalizarMemoria([
    ["a\nx", "graves"],
    ["", "voz"],
    ["b\nx", "cualquier-cosa"],
    ["c\nx", "  graves  "],
    ["d\nx", propio],
    ["e\nx", "off"],
    "no-un-par",
    ["solo-clave"]
  ]);
  assert.deepStrictEqual(pares(memoria), [
    ["a\nx", "graves"],
    ["d\nx", propio],
    ["e\nx", "off"]
  ]);
});

test("una clave repetida se queda con la ULTIMA aparicion, que es la mas reciente", () => {
  const { M } = entornoPuro();
  const memoria = M.normalizarMemoria([
    ["a\nx", "graves"],
    ["b\nx", "voz"],
    ["a\nx", "nocturno"]
  ]);
  // Y ademas recolocada al final: si hubiera que echar a alguien, que sea b.
  assert.deepStrictEqual(pares(memoria), [
    ["b\nx", "voz"],
    ["a\nx", "nocturno"]
  ]);
});

test("cuando no caben, se echa a las mas ANTIGUAS: el final de la lista es lo reciente", () => {
  const { win, M } = entornoPuro();
  const TOPE = win.YTMPip.CONSTANTS.EQUALIZER_BY_SONG_LIMITS.MAX_SONGS;
  const entradas = [];
  for (let i = 0; i < TOPE + 5; i++) entradas.push([`cancion ${i}\nx`, "graves"]);
  const memoria = M.normalizarMemoria(entradas);
  assert.strictEqual(memoria.size, TOPE);
  assert.strictEqual(memoria.has("cancion 0\nx"), false, "la mas vieja tiene que salir");
  assert.strictEqual(memoria.has(`cancion ${TOPE + 4}\nx`), true, "la mas nueva tiene que quedarse");
});

/* ==================================================================
 * 2. LA MAQUINA DE ESTADOS
 * ================================================================== */

function entornoModulo(opciones) {
  const { win } = crearEntorno(undefined, opciones);
  ventanas.push(win);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/ecualizador-por-cancion.js"
  );
  const YTMPip = win.YTMPip;
  return {
    win,
    M: YTMPip.EcualizadorPorCancion,
    S: YTMPip.Settings,
    global: () => YTMPip.Settings.get().equalizer,
    // Cancion numero n, como la veria el latido.
    cancion: (n) => ({ title: `cancion ${n}`, artist: "artista" })
  };
}

test("LA PETICION: la cancion fijada trae su ajuste y la siguiente devuelve el de antes", () => {
  const e = entornoModulo();

  // Suena la 1 sin nada fijado; el usuario pone nocturno y la fija.
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();

  // La 2 no esta fijada: se devuelve lo que habia antes de tocar nada.
  e.M.alSonar(e.cancion(2));
  assert.strictEqual(e.global(), "off", "al acabar la fijada hay que devolver lo de antes");

  // Vuelve la 1: su ajuste se pone solo.
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno", "la cancion fijada tiene que traer su ajuste");
  assert.strictEqual(e.M.guardada(), "nocturno");

  // Y la 3 devuelve otra vez.
  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "off");
});

test("EL USUARIO TOMA EL MANDO: si toco el ecualizador durante la fijada, no se le devuelve nada", () => {
  /*
   * `aplicado` es la prueba del delito: la maquina solo deshace lo que
   * consta que puso ella. Si el global ya es otro, lo ultimo lo escribio
   * el usuario, y devolverle "lo de antes" seria pelearle el volante.
   */
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();
  e.M.alSonar(e.cancion(1)); // mismo estado repetido: no toca nada

  // Vuelve la fijada, y en mitad el usuario cambia a voz.
  e.M.alSonar(e.cancion(2));
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno");
  e.S.guardarEcualizador("voz");

  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "voz", "la eleccion del usuario tiene que sobrevivir al cambio");
});

test("LATIDO REPETIDO SOBRE LA FIJADA: la maquina no le vuelve a quitar el mando al usuario", () => {
  /*
   * Esta prueba existe porque un mutante SOBREVIVIO. Al quitar el retorno
   * temprano `clave === actual` de alSonar, las 22 pruebas seguian verdes:
   * "el usuario toma el mando" cambiaba de cancion justo despues de tocar
   * el ecualizador, y "cero escrituras" repetia el latido con una cancion
   * SIN fijar, donde repetir el trabajo no escribe nada porque ponerGlobal
   * pregunta antes. El agujero estaba en el cruce: cancion FIJADA sonando,
   * el usuario cambia el ajuste, y el siguiente latido trae LA MISMA
   * cancion. Sin el retorno temprano, alSonar la trata como recien llegada
   * y le vuelve a plantar el ajuste fijado encima de la eleccion del
   * usuario, cada pocos segundos, hasta que la cancion acabe.
   */
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();

  // En mitad de la cancion fijada el usuario cambia a voz...
  e.S.guardarEcualizador("voz");
  // ...y el latido vuelve a pasar con la MISMA cancion sonando.
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "voz", "el latido repetido no puede reponer el ajuste fijado");

  // Y al salir tampoco se devuelve nada: lo ultimo lo escribio el usuario.
  e.M.alSonar(e.cancion(2));
  assert.strictEqual(e.global(), "voz");
});

test("CADENA de fijadas: al salir se vuelve a lo de ANTES de la cadena, no al eslabon anterior", () => {
  const e = entornoModulo();
  // Se fijan la 1 (graves) y la 2 (voz), cada una con su devolucion limpia.
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("graves");
  e.M.recordar();
  e.M.alSonar(e.cancion(2));
  assert.strictEqual(e.global(), "off");
  e.S.guardarEcualizador("voz");
  e.M.recordar();
  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "off");

  // La cadena: 1 -> 2 -> 3. En medio suena cada ajuste; al final, "off".
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "graves");
  e.M.alSonar(e.cancion(2));
  assert.strictEqual(e.global(), "voz");
  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "off", "el anterior de la cadena es el ORIGINAL");
});

test("REGRESION ENCONTRADA DERIVANDO A MANO: fijar justo despues de una devolucion no fija el pasado", () => {
  /*
   * El fallo que esta prueba vigila existio en la primera version del
   * modulo: `alEmpezar` se apuntaba ANTES de la devolucion, asi que la
   * cancion que llegaba tras una fijada anotaba como "lo que sonaba" el
   * ajuste que la maquina estaba retirando en ese mismo latido. Fijarla
   * entonces hacia reaparecer el ajuste de la cancion ANTERIOR dos
   * canciones mas tarde.
   */
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("graves");
  e.M.recordar();

  // La 2 llega, la maquina devuelve "off"... y el usuario fija la 2 con voz.
  e.M.alSonar(e.cancion(2));
  assert.strictEqual(e.global(), "off");
  e.S.guardarEcualizador("voz");
  e.M.recordar();

  // Al salir de la 2 hay que volver a "off", no a los graves de la 1.
  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "off", "el ajuste retirado no puede colarse de 'anterior'");
});

test("un estado sin titulo es un PARPADEO, no otra cancion: ni devuelve ni olvida donde estaba", () => {
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();
  e.M.alSonar(e.cancion(2));
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno");

  // La pagina parpadea (anuncio, DOM a medio pintar) y vuelve.
  e.M.alSonar({ title: "", artist: "" });
  e.M.alSonar(null);
  assert.strictEqual(e.global(), "nocturno", "el parpadeo no puede disparar la devolucion");
  assert.strictEqual(e.M.cancionActual(), e.M.claveDe(e.cancion(1)), "la cancion sigue siendo la 1");

  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno", "volver del parpadeo no re-aplica nada");
});

test("la misma cancion repetida en el latido no escribe NADA: el caso normal tiene que ser gratis", () => {
  /*
   * El latido llega cuatro veces por segundo con la musica sonando.
   * Escribir Settings en cada uno seria repintar la ventana y escribir
   * storage cuatro veces por segundo para no cambiar nada.
   */
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();

  const original = e.S.guardarEcualizador;
  let escrituras = 0;
  e.win.YTMPip.Settings.guardarEcualizador = function (valor) {
    escrituras += 1;
    return original.call(this, valor);
  };

  for (let i = 0; i < 10; i++) e.M.alSonar(e.cancion(1));
  assert.strictEqual(escrituras, 0);

  // Y el cambio de verdad escribe UNA vez, no una por latido.
  e.M.alSonar(e.cancion(2));
  for (let i = 0; i < 10; i++) e.M.alSonar(e.cancion(2));
  assert.strictEqual(escrituras, 1);
});

/* ==================================================================
 * 3. EL BOTON
 * ================================================================== */

test("recordar sin cancion no fija nada: no hay a quien", () => {
  const e = entornoModulo();
  assert.strictEqual(e.M.recordar(), null);
  assert.strictEqual(e.M.guardada(), null);
});

test("olvidar no toca el sonido AHORA, pero la devolucion del final sigue en pie", () => {
  /*
   * Quitar la chincheta significa "no lo pongas la proxima vez", no
   * "quitalo ya". Y lo que la maquina puso, la maquina lo devuelve al
   * acabar la cancion, con fijado o sin el: sin eso, olvidar dejaria el
   * ajuste de una cancion ya olvidada pegado al resto de la sesion.
   */
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("nocturno");
  e.M.recordar();
  e.M.alSonar(e.cancion(2));
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno");

  assert.strictEqual(e.M.olvidar(), true);
  assert.strictEqual(e.global(), "nocturno", "olvidar no puede cambiar lo que suena");
  assert.strictEqual(e.M.guardada(), null);

  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "off", "lo que puso la maquina lo devuelve la maquina");
});

test("fijar 'off' es una orden real: esta cancion, sin ecualizar", () => {
  const e = entornoModulo();
  e.M.alSonar(e.cancion(1));
  e.M.recordar(); // suena "off" y se fija "off"
  assert.strictEqual(e.M.guardada(), "off");

  // El usuario enciende graves para el resto de la sesion...
  e.M.alSonar(e.cancion(2));
  e.S.guardarEcualizador("graves");

  // ...y la cancion fijada en silencio APAGA al volver, y devuelve al salir.
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "off");
  e.M.alSonar(e.cancion(3));
  assert.strictEqual(e.global(), "graves");
});

function ventana() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  ventanas.push(win);
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
    "src/content/temporizador-apagado.js",
    "src/content/ecualizador-por-cancion.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  return {
    win,
    doc,
    M: win.YTMPip.EcualizadorPorCancion,
    S: win.YTMPip.Settings,
    PipView: win.YTMPip.PipView,
    boton: doc.getElementById("ytmpip-eq-pin"),
    pulsar() {
      doc.getElementById("ytmpip-eq-pin").dispatchEvent(new win.Event("click", { bubbles: true }));
    }
  };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

test("sin cancion que fijar, la chincheta esta APAGADA del todo, no solo suelta", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({}));
  assert.strictEqual(v.boton.disabled, true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("LA CHINCHETA AL CLIC: se clava, dice QUE quedo fijado, y el segundo clic la suelta", () => {
  /*
   * Como el temporizador: sin alimentar estados entre clics, porque el
   * manejador repinta por su cuenta y le pregunta al modulo, que vive en
   * el mismo realm. Con la musica pausada el latido puede no llegar.
   */
  const v = ventana();
  // El latido de verdad correria alSonar antes de pintar; aqui se corre a
  // mano, que es el mismo orden.
  v.M.alSonar({ title: "cancion", artist: "artista" });
  v.S.guardarEcualizador("nocturno");
  v.PipView.onStateUpdate(estado({}));
  assert.strictEqual(v.boton.disabled, false, "con cancion sonando se tiene que poder fijar");

  v.pulsar();
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.match(v.boton.title, /Nocturno/, "la chincheta tiene que decir QUE fijo");
  assert.strictEqual(v.boton.title, v.boton.getAttribute("aria-label"));
  assert.strictEqual(v.M.guardada(), "nocturno");

  v.pulsar();
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.M.guardada(), null);
  assert.match(v.boton.title, /Fijar/, "suelta vuelve a ofrecer, no a describir");
});

/* ==================================================================
 * 4. LA CARGA
 * ================================================================== */

test("cargar() rellena la memoria y la cancion que YA sonaba recibe su ajuste al siguiente latido", async () => {
  /*
   * La carga es asincrona y el primer latido puede ganarle la carrera:
   * la cancion que ya sonaba al abrir la pagina se veria SIN su fijado.
   * Por eso cargar() olvida la cancion actual al terminar: el siguiente
   * latido re-decide con la memoria puesta. Aqui se reproduce esa
   * carrera a proposito, llamando a alSonar ANTES de dejar correr los
   * microtasks que completan la carga.
   */
  const e = entornoModulo({ storage: { equalizerBySong: [["cancion 1\nartista", "nocturno"]] } });

  // El latido madrugador: la memoria aun no ha llegado.
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "off", "sin memoria cargada no hay nada que aplicar");

  await pulso(20);

  // El siguiente latido, con la misma cancion sonando.
  e.M.alSonar(e.cancion(1));
  assert.strictEqual(e.global(), "nocturno", "cargada la memoria, el fijado tiene que ponerse");
  assert.strictEqual(e.M.guardada(), "nocturno");
});

test("cargar() pasa lo guardado por la misma criba que todo: lo corrupto se tira", async () => {
  const e = entornoModulo({
    storage: {
      equalizerBySong: [
        ["cancion 1\nartista", "cualquier-cosa"],
        ["", "graves"],
        ["cancion 2\nartista", "voz"]
      ]
    }
  });
  const memoria = await e.M.cargar();
  assert.deepStrictEqual(pares(memoria), [["cancion 2\nartista", "voz"]]);
});

test("recordar PERSISTE como lista de pares, que es la forma que cargar() espera", async () => {
  /*
   * La costura de ida y vuelta: si recordar escribiera otra forma (un
   * objeto, por ejemplo), cargar() la tiraria entera como corrupta y la
   * memoria durarian exactamente una sesion, sin que ninguna otra prueba
   * lo notara.
   */
  const e = entornoModulo();
  const KEY = e.win.YTMPip.CONSTANTS.STORAGE_KEYS.EQUALIZER_BY_SONG;
  let escrito = null;
  e.win.chrome.storage.local.set = (obj) => {
    if (obj && KEY in obj) escrito = obj[KEY];
    return Promise.resolve();
  };

  e.M.alSonar(e.cancion(1));
  e.S.guardarEcualizador("graves");
  e.M.recordar();

  assert.ok(escrito, "recordar tiene que escribir en storage");
  assert.deepStrictEqual(plano(escrito), [["cancion 1\nartista", "graves"]]);

  // Y el viaje completo: lo escrito entra por la criba sin perder nada.
  assert.deepStrictEqual(pares(e.M.normalizarMemoria(plano(escrito))), [
    ["cancion 1\nartista", "graves"]
  ]);
});

/* ==================================================================
 * 5. EL LATIDO (content-script.js, con el orquestador de verdad)
 * ================================================================== */

test("EL CABLE ENTERO: la cancion fijada del DOM enciende el ecualizador y la siguiente lo devuelve", async () => {
  /*
   * Sin llamar al modulo a mano: la metadata sale del DOM del fixture,
   * el latido la lleva a alSonar y alSonar escribe Settings. Si alguien
   * borra la llamada del latido —que va tras un `if`— el modulo y el
   * boton seguirian perfectos por separado y esto seria lo unico que se
   * enteraria.
   */
  const e = entornoPagina("controles-completos.html", {
    storage: { equalizerBySong: [[CLAVE_FIXTURE, "nocturno"]] }
  });
  ventanas.push(e.win);
  await pulso();

  const video = e.win.document.querySelector("video");
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();
  assert.strictEqual(
    e.YTMPip.Settings.get().equalizer,
    "nocturno",
    "la cancion fijada que ya sonaba al abrir tiene que traer su ajuste"
  );

  // Cambia la cancion en la pagina: la nueva no esta fijada.
  e.win.document.querySelector(".title").textContent = "The Sun Always Shines on T.V.";
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();
  assert.strictEqual(
    e.YTMPip.Settings.get().equalizer,
    "off",
    "al cambiar a una cancion sin fijar hay que devolver lo de antes"
  );
});
