/*
 * Pruebas del TEMPORIZADOR DE APAGADO.
 *
 * Lo que se pidio: que la musica se pause sola pasado un rato elegido.
 *
 * El mismo reparto en tres que la velocidad, porque las piezas se rompen
 * igual:
 *
 *  1. LA LISTA (constants.js). Sus invariantes: que lo que ofrece el boton
 *     quepa en lo que acepta el temporizador, y que el tope quede lejos del
 *     desborde de setTimeout, que es la trampa de verdad de este numero.
 *
 *  2. EL MODULO (temporizador-apagado.js). Los riesgos son tres: que pause
 *     ANTES de la hora, que no pause NUNCA, y el peor —que un plazo vencido
 *     se quede armado y pause la musica del dia siguiente nada mas darle a
 *     play—. El reloj se inyecta porque ninguna prueba puede esperar quince
 *     minutos de pared.
 *
 *  3. EL BOTON (pip.js). El riesgo es que MIENTA: que diga "0′" con el
 *     plazo vivo, o que se quede con la luna puesta mientras el plazo
 *     corre. Y su rareza propia: es el unico boton hibrido (dibujo apagado,
 *     numero encendido), o sea que cada estado tiene que BORRAR el del
 *     otro.
 *
 * Lo que estas pruebas NO pueden ver: si el setTimeout de respaldo dispara
 * de verdad tras quince minutos en una pestaña al fondo. Eso solo se
 * comprueba con un reloj de pared y la pagina real.
 *
 * OJO CON LOS TEMPORIZADORES DE VERDAD: `fijar` arma un setTimeout real de
 * minutos en la ventana jsdom. Esta suite ya pago una vez el precio de
 * dejar ventanas vivas —procesos zombis de tres dias y la suite entera
 * colgada—, asi que aqui CADA ventana se apunta y se cierra al final:
 * cerrar la ventana jsdom mata sus temporizadores.
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

/* ==================================================================
 * 1. LA LISTA
 * ================================================================== */

function constantes() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  ventanas.push(win);
  cargar(win, "src/shared/constants.js");
  return win.YTMPip.CONSTANTS;
}

test("todo lo que ofrece el boton cabe dentro de lo que acepta el temporizador", () => {
  const C = constantes();
  for (const m of C.SLEEP_TIMER_MINUTES) {
    assert.ok(
      m > 0 && m <= C.SLEEP_TIMER_LIMITS.MAX_MINUTES,
      `${m} minutos se ofrecen pero el temporizador los acotaria`
    );
  }
});

test("no hay duraciones repetidas: una repetida seria un clic que no hace nada", () => {
  const C = constantes();
  assert.strictEqual(new Set(C.SLEEP_TIMER_MINUTES).size, C.SLEEP_TIMER_MINUTES.length);
});

test("EL TOPE QUEDA LEJOS DEL DESBORDE: un setTimeout de mas de 2^31 ms dispara AL MOMENTO", () => {
  /*
   * Esta es la razon de ser del tope, asi que se vigila el numero de
   * verdad: milisegundos del respaldo (con su margen de 250) contra 2^31.
   * Sin esto, subir el tope "porque 12 horas se queda corto" podria
   * convertir un comando absurdo en una pausa INSTANTANEA, que es
   * exactamente lo contrario de un temporizador.
   */
  const C = constantes();
  assert.ok(C.SLEEP_TIMER_LIMITS.MAX_MINUTES * 60000 + 250 < 2 ** 31);
});

/* ==================================================================
 * 2. EL MODULO
 * ================================================================== */

function entornoModulo() {
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
    "src/content/temporizador-apagado.js"
  );
  const video = win.document.querySelector("video");
  /*
   * jsdom no trae motor multimedia: `paused` y `pause()` se definen a mano
   * para poder CONTAR las pausas, que es lo que estas pruebas miran.
   */
  let pausado = false;
  let pausas = 0;
  Object.defineProperty(video, "paused", { get: () => pausado, configurable: true });
  video.pause = () => {
    pausado = true;
    pausas += 1;
  };
  return {
    win,
    T: win.YTMPip.TemporizadorApagado,
    TIPOS: win.YTMPip.COMMAND_TYPES,
    Controlador: win.YTMPip.PlayerController,
    video,
    pausas: () => pausas,
    pausar: () => {
      pausado = true;
    }
  };
}

// Un origen cualquiera, en epoch ms. El valor no importa; que TODAS las
// horas de la prueba salgan de sumarle algo, si.
const T0 = 1_700_000_000_000;
const MIN = 60000;

/*
 * Los `plano(...)` de abajo no son decoracion: lo que devuelve `estado()`
 * nace dentro de jsdom, o sea en otro realm con su propio Object.prototype,
 * y `deepStrictEqual` compara tambien el prototipo. Es la misma trampa que
 * ya mordio en cola.test.js —"same structure but not reference-equal"— y
 * por eso la reconstruccion vive en el helper, no aqui: la primera version
 * de este archivo se escribio su propio `plano` sin mirar, que es
 * exactamente como una regla acaba viviendo en dos sitios.
 */

test("el restante baja con el reloj y `minutes` se queda quieto, que para eso hay dos campos", () => {
  const { T } = entornoModulo();
  T.fijar(15, T0);

  assert.deepStrictEqual(plano(T.estado(T0)), { minutes: 15, remainingMs: 15 * MIN });
  assert.deepStrictEqual(plano(T.estado(T0 + 6 * MIN)), { minutes: 15, remainingMs: 9 * MIN });
});

test("antes de la hora no se pausa nada, ni un milisegundo antes", () => {
  const { T, pausas } = entornoModulo();
  T.fijar(15, T0);

  assert.strictEqual(T.comprobar(T0 + 15 * MIN - 1), false);
  assert.strictEqual(pausas(), 0);
  assert.ok(T.estado(T0) !== null, "el plazo tiene que seguir puesto");
});

test("LA PETICION: a la hora se pausa, y el plazo se CONSUME", () => {
  /*
   * Consumirlo es tan importante como pausar: la segunda llamada de abajo
   * es el latido siguiente, que llega un cuarto de segundo despues, y si
   * volviera a pausar seria un boton de reproducir que no funciona.
   */
  const { T, pausas } = entornoModulo();
  T.fijar(15, T0);

  assert.strictEqual(T.comprobar(T0 + 15 * MIN), true);
  assert.strictEqual(pausas(), 1);
  assert.strictEqual(T.estado(T0 + 15 * MIN), null);

  assert.strictEqual(T.comprobar(T0 + 15 * MIN + 250), false);
  assert.strictEqual(pausas(), 1);
});

test("vencer con la musica YA pausada no pausa dos veces ni deja el plazo armado", () => {
  /*
   * El punto ciego del latido: pausado no hay eventos, y esto es lo que el
   * setTimeout de respaldo se va a encontrar al despertar. Lo unico que
   * tiene que hacer es consumir el plazo en silencio; sin ese consumo, el
   * "play" de mañana se pausaria solo nada mas sonar.
   */
  const { T, pausas, pausar } = entornoModulo();
  T.fijar(15, T0);
  pausar();

  assert.strictEqual(T.comprobar(T0 + 20 * MIN), true);
  assert.strictEqual(pausas(), 0, "pausar lo pausado no deberia tocar el <video>");
  assert.strictEqual(T.estado(T0 + 20 * MIN), null);
});

test("cero apaga el temporizador, que es lo que manda el boton al cerrar el ciclo", () => {
  const { T } = entornoModulo();
  T.fijar(30, T0);
  T.fijar(0, T0 + MIN);

  assert.strictEqual(T.estado(T0 + MIN), null);
  assert.strictEqual(T.comprobar(T0 + 40 * MIN), false, "apagado no hay nada que vencer");
});

test("REGRESION ANTICIPADA: basura no APAGA un plazo en marcha", () => {
  /*
   * La trampa de siempre: Number(null), Number("") y Number([]) valen 0, y
   * aqui cero significa APAGAR. Un campo `minutes` que se pierda por el
   * camino no puede desarmar el temporizador que alguien dejo puesto antes
   * de dormirse. Es la misma criba que toFiniteNumber le puso a SEEK_TO.
   */
  const { T } = entornoModulo();
  T.fijar(30, T0);

  for (const basura of [null, undefined, "", "pronto", NaN, {}, []]) {
    T.fijar(basura, T0 + MIN);
    assert.deepStrictEqual(
      plano(T.estado(T0)),
      { minutes: 30, remainingMs: 30 * MIN },
      `${String(basura)} no deberia tocar el plazo`
    );
  }
});

test("un pedido absurdo se acota a las 12 horas en vez de desbordar el setTimeout", () => {
  const { win, T } = entornoModulo();
  const MAX = win.YTMPip.CONSTANTS.SLEEP_TIMER_LIMITS.MAX_MINUTES;
  T.fijar(40000, T0);

  assert.deepStrictEqual(plano(T.estado(T0)), { minutes: MAX, remainingMs: MAX * MIN });
});

test("el comando entra por PlayerController, como todos los demas", () => {
  /*
   * Es la costura entre el despacho de comandos y el modulo: si alguien
   * borra el case del switch, el boton de la ventana pediria plazos a un
   * telefono descolgado y ninguna otra prueba lo notaria.
   */
  const { T, TIPOS, Controlador } = entornoModulo();
  Controlador.execute({ type: TIPOS.SET_SLEEP_TIMER, minutes: 15 });

  const puesto = T.estado();
  assert.ok(puesto !== null, "el comando no llego al temporizador");
  assert.strictEqual(puesto.minutes, 15);
});

/* ==================================================================
 * 3. EL BOTON
 * ================================================================== */

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
    T: win.YTMPip.TemporizadorApagado,
    PipView: win.YTMPip.PipView,
    boton: doc.getElementById("ytmpip-sleep"),
    pulsar() {
      doc.getElementById("ytmpip-sleep").dispatchEvent(new win.Event("click", { bubbles: true }));
    }
  };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

test("apagado, el boton enseña la luna y se queda neutro", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ sleepTimer: null }));

  assert.ok(v.boton.querySelector("svg"), "sin plazo toca el dibujo, no un texto");
  assert.strictEqual(v.boton.dataset.ico, "luna");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.match(v.boton.getAttribute("aria-label"), /apagado/i);
});

test("con plazo puesto el boton se enciende y dice los minutos, sin rastro de la luna", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ sleepTimer: { minutes: 15, remainingMs: 15 * MIN } }));

  assert.strictEqual(v.boton.textContent, "15′");
  assert.strictEqual(v.boton.querySelector("svg"), null, "el numero tiene que BORRAR el dibujo");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
});

test("EL BOTON NO DICE NUNCA 0′: con el plazo vivo, el ultimo minuto es 1′", () => {
  /*
   * `Math.ceil` con suelo en 1: cero minutos con la musica sonando seria
   * un cartel mintiendo. El caso de remainingMs 0 existe de verdad: el
   * estado se construye ANTES de que el latido consuma el plazo.
   */
  const v = ventana();

  v.PipView.onStateUpdate(estado({ sleepTimer: { minutes: 15, remainingMs: 30 * 1000 } }));
  assert.strictEqual(v.boton.textContent, "1′");

  v.PipView.onStateUpdate(estado({ sleepTimer: { minutes: 15, remainingMs: 0 } }));
  assert.strictEqual(v.boton.textContent, "1′");
});

test("LA PETICION: pulsar recorre 15, 30 y 60 y el cuarto clic APAGA", () => {
  /*
   * Se comprueba sobre el modulo, no sobre el texto del boton: lo que
   * importa es el plazo que de verdad queda puesto. Y de paso el ciclo
   * completo prueba lo que hace distinto a este boton de la velocidad: no
   * hace falta alimentar estados entre clics, porque el manejador le
   * pregunta al modulo —que vive en el mismo realm— y no a `lastState`.
   */
  const v = ventana();
  const C = v.win.YTMPip.CONSTANTS;

  const recorrido = [];
  for (let i = 0; i < C.SLEEP_TIMER_MINUTES.length + 1; i++) {
    v.pulsar();
    const puesto = v.T.estado();
    recorrido.push(puesto ? puesto.minutes : 0);
  }

  assert.deepStrictEqual(recorrido, Array.from(C.SLEEP_TIMER_MINUTES).concat([0]));
});

test("el boton reacciona AL CLIC, sin esperar un latido que pausado no llega", () => {
  /*
   * El repintado inmediato del manejador. Aqui no se llama a onStateUpdate
   * ni una vez: si el boton cambia igualmente, es que el clic repinta por
   * su cuenta, que es lo que salva el caso de la musica pausada.
   */
  const v = ventana();

  v.pulsar();
  assert.strictEqual(v.boton.textContent, "15′");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");

  v.pulsar();
  v.pulsar();
  v.pulsar();
  assert.ok(v.boton.querySelector("svg"), "el cuarto clic apaga y la luna tiene que volver");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("el estado se anuncia tambien para quien no ve el boton", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ sleepTimer: { minutes: 30, remainingMs: 29 * MIN } }));

  const etiqueta = v.boton.getAttribute("aria-label");
  assert.strictEqual(etiqueta, v.boton.title);
  assert.match(etiqueta, /29 minutos/);
  // El numero suelto no dice nada a quien lo oye sin contexto.
  assert.notStrictEqual(etiqueta, v.boton.textContent);
});

test("un estado sin el campo no rompe nada: viene de un ultimo estado guardado antes de este cambio", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({}));

  assert.ok(v.boton.querySelector("svg"), "sin campo, el boton queda apagado con su luna");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

/* ==================================================================
 * 4. EL LATIDO (content-script.js, con el orquestador de verdad)
 * ================================================================== */

test("el plazo viaja con el estado que sale hacia el service worker", async () => {
  /*
   * La costura que las secciones de arriba no tocan: buildState. Si
   * alguien quita el campo del estado, el modulo y el boton seguirian
   * perfectos por separado... y la ventana no se enteraria nunca de que
   * hay un plazo puesto.
   */
  const e = entornoPagina("controles-completos.html");
  ventanas.push(e.win);
  await pulso();

  e.YTMPip.TemporizadorApagado.fijar(30);
  const video = e.win.document.querySelector("video");
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();

  const viajado = e.ultimoEstado().sleepTimer;
  assert.ok(viajado, "el estado enviado no lleva el temporizador");
  assert.strictEqual(viajado.minutes, 30);
  assert.ok(viajado.remainingMs > 29 * MIN, "el restante deberia estar recien puesto");
});

test("EL LATIDO CONSUME EL PLAZO VENCIDO: un timeupdate pausa la musica sin esperar a nadie", async () => {
  /*
   * El mecanismo principal del apagado: mientras suena la musica, el
   * vencimiento no lo atrapa el setTimeout de respaldo, lo atrapa el
   * siguiente `timeupdate`. Aqui el plazo se fija YA VENCIDO (con el reloj
   * inyectado, quince minutos en el pasado) y se comprueba que un solo
   * latido basta: pausa, y el estado siguiente ya viaja sin plazo.
   */
  const e = entornoPagina("controles-completos.html");
  ventanas.push(e.win);
  await pulso();

  const video = e.win.document.querySelector("video");
  let pausado = false;
  Object.defineProperty(video, "paused", { get: () => pausado, configurable: true });
  video.pause = () => {
    pausado = true;
  };

  e.YTMPip.TemporizadorApagado.fijar(15, Date.now() - 16 * MIN);
  video.dispatchEvent(new e.win.Event("timeupdate"));
  await pulso();

  assert.strictEqual(pausado, true, "el latido no pauso la musica");
  assert.strictEqual(e.ultimoEstado().sleepTimer, null, "el plazo vencido tiene que viajar consumido");
});
