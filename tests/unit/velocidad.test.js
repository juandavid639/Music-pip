/*
 * Pruebas de la VELOCIDAD DE REPRODUCCION.
 *
 * Lo que se pidio: poder oir la musica a 0,75x, 1x, 1,25x y 1,5x.
 *
 * Aqui hay tres cosas distintas y cada una se rompe de una forma:
 *
 *  1. LA LISTA (constants.js). Es una sola regla usada por tres sitios: el
 *     ciclo del boton, el acotado del controlador y estas pruebas. Lo que
 *     hay que vigilar no es su contenido sino sus INVARIANTES, porque son
 *     las que alguien puede romper sin darse cuenta al añadir un valor.
 *
 *  2. EL CONTROLADOR (player-controller.js). El riesgo es que funcione DE
 *     MAS: una velocidad absurda deja el <video> en un estado del que
 *     YouTube Music no siempre se recupera. Mismo criterio que el volumen.
 *
 *  3. EL BOTON (pip.js). El riesgo es que MIENTA: que enseñe 1,5x cuando la
 *     musica ya va a 1x. La velocidad la manda el <video>, no la ventana.
 *
 * Lo que estas pruebas NO pueden ver, y hay que decirlo: si SUENA mas
 * rapido, y si el tono se corrige. Ninguna prueba de este proyecto oye. Eso
 * se comprueba con tools/diagnostico-velocidad.js en la pagina real.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

/* ==================================================================
 * 1. LA LISTA
 * ================================================================== */

function constantes() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
  cargar(win, "src/shared/constants.js");
  return win.YTMPip.CONSTANTS;
}

test("todo lo que ofrece el boton cabe dentro de lo que acepta el reproductor", () => {
  /*
   * ESTA ES LA PRUEBA QUE UNE LAS DOS LISTAS. `PLAYBACK_RATES` y
   * `PLAYBACK_RATE_LIMITS` responden a preguntas distintas —que ofrece el
   * boton y que acepta el <video>— y por eso estan separadas, pero no son
   * independientes: ofrecer algo que el controlador va a acotar seria un
   * boton que enseña 3x y suena a 2x. Sin esta prueba, las dos listas se
   * separarian en cuanto alguien tocara una.
   */
  const C = constantes();
  for (const r of C.PLAYBACK_RATES) {
    assert.ok(
      r >= C.PLAYBACK_RATE_LIMITS.MIN && r <= C.PLAYBACK_RATE_LIMITS.MAX,
      `${r}x se ofrece pero el controlador lo acotaria`
    );
  }
});

test("el ciclo empieza y aterriza en la velocidad normal", () => {
  /*
   * El primer valor NO es decoracion: es donde cae quien no reconozca la
   * velocidad actual (indexOf da -1 y el ciclo va al indice 0). Si alguien
   * ordena la lista de menor a mayor "por limpieza", ese caso pasa a
   * aterrizar en la mas lenta, que es lo ultimo que quiere quien acaba de
   * pulsar un boton que no sabe donde esta.
   */
  const C = constantes();
  assert.strictEqual(C.PLAYBACK_RATES[0], C.PLAYBACK_RATE_NORMAL);
});

test("no hay velocidades repetidas: una repetida seria un clic que no hace nada", () => {
  const C = constantes();
  assert.strictEqual(new Set(C.PLAYBACK_RATES).size, C.PLAYBACK_RATES.length);
});

test("LA TRAMPA DEL DECIMAL: las velocidades son cuartos exactos", () => {
  /*
   * El ciclo busca la velocidad actual con `indexOf`, o sea con `===` sobre
   * un decimal, y eso solo es de fiar si el numero se representa exacto en
   * binario. Los cuatro de hoy lo son: 3/4, 1, 5/4 y 3/2 son todos multiplos
   * exactos de un cuarto.
   *
   * ESTA PRUEBA EMPEZO SIENDO OTRA Y ERA MENTIRA. Comprobaba que los valores
   * sobrevivieran a `JSON.parse(JSON.stringify(...))`, con un comentario muy
   * convincente sobre el viaje por chrome.runtime.sendMessage. Pero JSON
   * transporta CUALQUIER double sin perder un bit —incluido 0,1+0,2—, asi
   * que aquel test pasaba siempre, con cualquier lista, y no protegia nada.
   * Lo destapo una mutacion que metia un decimal inexacto en la lista y
   * sobrevivio tan tranquila.
   *
   * El peligro real no era la serializacion: es la ARITMETICA. Mientras la
   * velocidad viaje copiada tal cual, `indexOf` acierta aunque el numero sea
   * feo. Se rompe el dia que alguien la CALCULE —un `1 + 0.25 * i`, un
   * `rate * 1.1`— y entonces la exactitud pasa a ser lo unico que sostiene
   * el `===`. Fijarla aqui es barato y deja escrita la condicion.
   */
  const C = constantes();
  for (const r of C.PLAYBACK_RATES) {
    assert.ok(
      Number.isInteger(r * 4),
      `${r}x no es un cuarto exacto: indexOf dejaria de encontrarlo en cuanto alguien lo calculara`
    );
  }
});

/* ==================================================================
 * 2. EL CONTROLADOR
 * ================================================================== */

function entornoControlador() {
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
    "src/content/player-controller.js"
  );
  const video = win.document.querySelector("video");
  /*
   * jsdom no trae motor multimedia y `playbackRate` no siempre es
   * escribible. Se define a mano para que el elemento se comporte como el
   * de verdad: se puede escribir y se vuelve a leer igual.
   */
  let rate = 1;
  Object.defineProperty(video, "playbackRate", {
    get: () => rate,
    set: (v) => {
      rate = v;
    },
    configurable: true
  });
  return { win, YTMPip: win.YTMPip, TIPOS: win.YTMPip.COMMAND_TYPES, video };
}

test("SET_PLAYBACK_RATE escribe la velocidad pedida", () => {
  const { YTMPip, TIPOS, video } = entornoControlador();
  YTMPip.PlayerController.execute({ type: TIPOS.SET_PLAYBACK_RATE, rate: 1.5 });
  assert.strictEqual(video.playbackRate, 1.5);
});

test("una velocidad absurda se acota en vez de llegar al <video>", () => {
  const { win, YTMPip, TIPOS, video } = entornoControlador();
  const MAX = win.YTMPip.CONSTANTS.PLAYBACK_RATE_LIMITS.MAX;

  YTMPip.PlayerController.execute({ type: TIPOS.SET_PLAYBACK_RATE, rate: 40 });
  assert.strictEqual(video.playbackRate, MAX);
});

test("el cero se acota al minimo: playbackRate 0 no es 'parado', es un elemento que no avanza", () => {
  const { win, YTMPip, TIPOS, video } = entornoControlador();
  const MIN = win.YTMPip.CONSTANTS.PLAYBACK_RATE_LIMITS.MIN;

  YTMPip.PlayerController.execute({ type: TIPOS.SET_PLAYBACK_RATE, rate: 0 });
  assert.strictEqual(video.playbackRate, MIN);
});

test("REGRESION: un comando sin velocidad dentro no toca nada", () => {
  /*
   * La misma trampa que ya mordio en SEEK_TO: `Number(null)` es 0, que es
   * finito. Un campo que se perdio por el camino no puede acabar poniendo
   * la musica a camara lenta.
   */
  const { YTMPip, TIPOS, video } = entornoControlador();
  video.playbackRate = 1.25;

  for (const basura of [null, undefined, "", "rapido", NaN, {}, []]) {
    YTMPip.PlayerController.execute({ type: TIPOS.SET_PLAYBACK_RATE, rate: basura });
    assert.strictEqual(video.playbackRate, 1.25, `${String(basura)} no deberia cambiar la velocidad`);
  }
});

test("se pide la correccion de tono a proposito, aunque hoy sea el valor por defecto", () => {
  /*
   * Sin esto, 1,25x no suena "un poco mas rapido": suena medio tono mas
   * arriba, como otra cancion. Es un fallo que solo se detecta escuchando,
   * asi que la unica forma de defenderlo es fijar aqui que se escribe.
   */
  const { YTMPip, TIPOS, video } = entornoControlador();
  video.preservesPitch = false;

  YTMPip.PlayerController.execute({ type: TIPOS.SET_PLAYBACK_RATE, rate: 1.5 });
  assert.strictEqual(video.preservesPitch, true);
});

/* ==================================================================
 * 3. EL BOTON
 * ================================================================== */

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

  const video = win.document.querySelector("video");
  let rate = 1;
  Object.defineProperty(video, "playbackRate", {
    get: () => rate,
    set: (v) => {
      rate = v;
    },
    configurable: true
  });

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  return {
    win,
    doc,
    video,
    PipView: win.YTMPip.PipView,
    boton: doc.getElementById("ytmpip-speed"),
    pulsar() {
      doc.getElementById("ytmpip-speed").dispatchEvent(new win.Event("click", { bubbles: true }));
    }
  };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

test("a velocidad normal el boton dice 1x y se queda neutro", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1 }));

  assert.strictEqual(v.boton.textContent, "1×");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("con la velocidad cambiada el boton se enciende y dice cual", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1.25 }));

  assert.strictEqual(v.boton.textContent, "1,25×");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
});

test("LA PETICION: pulsar recorre las cuatro velocidades y vuelve al principio", () => {
  /*
   * Se comprueba sobre el <video>, no sobre el texto del boton: lo que
   * importa es que la musica cambie de velocidad, no que el cartel lo diga.
   * El clic entra por el manejador de verdad y sale por PlayerController.
   */
  const v = ventana();
  const C = v.win.YTMPip.CONSTANTS;
  /*
   * `Array.from` NO es decoracion. La lista vive dentro de jsdom, o sea en
   * otro realm, con su propio `Array.prototype`. `deepStrictEqual` compara
   * tambien el prototipo, asi que sin esto la prueba falla con dos listas de
   * numeros identicos y el mensaje "same structure but not reference-equal",
   * que no ayuda a nadie a las once de la noche. Se copia al realm de aqui
   * para comparar valores, que es lo unico que se quiere comparar.
   */
  const esperado = Array.from(C.PLAYBACK_RATES).slice(1).concat([C.PLAYBACK_RATES[0]]);

  v.PipView.onStateUpdate(estado({ playbackRate: 1 }));

  const recorrido = [];
  for (let i = 0; i < esperado.length; i++) {
    v.pulsar();
    recorrido.push(v.video.playbackRate);
    // El estado vuelve del <video>, como en la extension de verdad.
    v.PipView.onStateUpdate(estado({ playbackRate: v.video.playbackRate }));
  }

  assert.deepStrictEqual(recorrido, esperado);
});

test("con una velocidad que no es del ciclo, pulsar vuelve a la normal", () => {
  /*
   * Un boton que no reacciona al clic parece roto. Si la velocidad la puso
   * otro —una extension, la consola— el ciclo no la reconoce, y entonces lo
   * util es devolver la musica a 1x, no quedarse quieto.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 2.75 }));

  v.pulsar();

  assert.strictEqual(v.video.playbackRate, v.win.YTMPip.CONSTANTS.PLAYBACK_RATE_NORMAL);
});

test("EL BOTON NO MIENTE: si la velocidad vuelve sola a 1x, el cartel lo dice", () => {
  /*
   * El caso que justifica leer `state.playbackRate` en vez de recordar lo
   * ultimo que se mando. `playbackRate` vuelve a su valor por defecto cada
   * vez que el elemento hace load(), y YouTube Music recarga la pista por su
   * cuenta. Un boton que siguiera enseñando 1,5x mientras la musica ya va
   * normal seria peor que no tener boton.
   *
   * Si esto se resetea DE VERDAD en la pagina real es otra pregunta, y no se
   * contesta aqui: tools/diagnostico-velocidad.js.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1.5 }));
  assert.strictEqual(v.boton.textContent, "1,5×");

  v.PipView.onStateUpdate(estado({ playbackRate: 1 }));

  assert.strictEqual(v.boton.textContent, "1×");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
});

test("y desde ahi el ciclo sigue desde donde esta la musica, no desde donde estaba el boton", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1.5 }));
  // La pista se recarga y la velocidad se cae sola.
  v.video.playbackRate = 1;
  v.PipView.onStateUpdate(estado({ playbackRate: 1 }));

  v.pulsar();

  // Si el ciclo llevara un indice propio, aqui saldria 0,75x.
  assert.strictEqual(v.video.playbackRate, 1.25);
});

test("el estado se anuncia tambien para quien no ve el boton", () => {
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1.5 }));

  const etiqueta = v.boton.getAttribute("aria-label");
  assert.strictEqual(etiqueta, v.boton.title);
  assert.match(etiqueta, /velocidad/i);
  // El numero suelto no dice nada a quien lo oye sin contexto.
  assert.notStrictEqual(etiqueta, v.boton.textContent);
});

test("un estado sin velocidad no deja el boton en blanco", () => {
  /*
   * Puede llegar de una version anterior del content script, o del ultimo
   * estado conocido guardado antes de este cambio.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({}));

  assert.strictEqual(v.boton.textContent, "1×");
});

test("LA DECISION DE DISEÑO: este boton lleva un numero, no un dibujo", () => {
  /*
   * Es el unico de la fila que se queda fuera del sistema de iconos, y a
   * proposito: no hay dibujo que diga "1,25x". Si alguien le pusiera un
   * `data-ico`, iconos.js le metería un <svg> dentro y borraría el número
   * en el primer pintado —replaceChildren— sin que ninguna otra prueba se
   * enterara.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ playbackRate: 1.25 }));

  assert.strictEqual(v.boton.dataset.ico, undefined, "no debe entrar en el sistema de iconos");
  assert.strictEqual(v.boton.querySelector("svg"), null);
  assert.ok(v.boton.textContent.trim().length > 0, "y tiene que quedar texto visible");
});
