/*
 * Pruebas del GRAFO (src/content/audio-grafo.js): el cableado de Web Audio.
 *
 * LO QUE ESTAS PRUEBAS NO DICEN. No dicen que suene bien. No pueden: aqui el
 * AudioContext es un doble de cartulina (tests/helpers/audio-falso.js) que
 * apunta quien se conecta con quien y que numero se le pide a cada mando, y
 * ningun doble sabe como suena un lowshelf. Eso se mide en el navegador con
 * tools/diagnostico-ecualizador.js.
 *
 * LO QUE SI DICEN, y es justo lo que no se puede dejar al oido de nadie,
 * porque el fallo no se oye hasta que es tarde: que la puerta de un solo
 * sentido no se cruza sin permiso, que no se cruza dos veces, que la fuente
 * tiene salida a destination ANTES de que se monte un solo filtro, y que
 * apagar puentea en vez de intentar deshacer lo indeshacible.
 *
 * Un error en cualquiera de esas cuatro cosas deja a alguien sin musica hasta
 * que recargue la pestaña, y ninguna de las cuatro se nota probando a mano con
 * la cancion ya sonando.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar } = require("../helpers/entorno.js");
const { instalarAudioFalso } = require("../helpers/audio-falso.js");

function montaje(opciones = {}) {
  const { win } = crearEntorno(undefined);
  // ANTES de cargar: el modulo lee root.AudioContext cuando le hace falta,
  // pero dejarlo instalado desde el principio quita toda duda de orden.
  const dameCtx = instalarAudioFalso(win, opciones);
  /*
   * Los avisos se RECOGEN en vez de dejarlos salir por la consola. Dos pruebas
   * de aqui hacen fallar la puerta a proposito, y sin esto la salida de
   * `node --test` sale sembrada de rastros de excepcion que parecen averias.
   * De paso deja de ser ruido y pasa a ser algo que se puede comprobar: que
   * un fallo del que depende la musica no se traga en silencio.
   */
  const avisos = [];
  win.console.warn = (...args) => avisos.push(args.map(String).join(" "));
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/ecualizador.js",
    "src/content/audio-grafo.js"
  );
  return {
    win,
    ctx: dameCtx,
    avisos,
    Grafo: win.YTMPip.GrafoAudio,
    Ecualizador: win.YTMPip.Ecualizador,
    video: () => win.document.createElement("video")
  };
}

/** El nodo fuente que el doble creo para ese elemento, o undefined. */
function fuenteDe(ctx, video) {
  return ctx.creados.find((n) => n.tipo === "fuente" && n.mediaElement === video);
}

function filtrosDe(ctx) {
  return ctx.creados.filter((n) => n.tipo === "biquad");
}

/* ==================================================================
 * 0. La puerta de un solo sentido
 * ================================================================== */

test("apagado NO cruza la puerta: sin plan no se crea ni el contexto", () => {
  const { Grafo, ctx, video } = montaje();
  const v = video();

  assert.strictEqual(Grafo.montar(v, null), true);

  /*
   * Se comprueba que no hay contexto, no que no haya fuentes. Un contexto de
   * audio creado "por si acaso" seria ya un cambio de estado que nadie pidio,
   * y ademas nace suspendido cuando no hay un clic detras.
   */
  assert.strictEqual(ctx(), null);
  assert.strictEqual(Grafo.cruzado(v), false);
  assert.strictEqual(Grafo.activo(), false);
});

test("encender cruza la puerta UNA vez, y volver a encender no la vuelve a cruzar", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("graves")), true);
  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("voz")), true);
  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("0,0,0,0,0")), true);

  /*
   * createMediaElementSource LANZA la segunda vez para el mismo elemento. El
   * doble lo imita, asi que si el modulo dejara de recordar la fuente esta
   * prueba no fallaria por un numero: fallaria por una excepcion, que es como
   * fallaria en la pagina.
   */
  assert.strictEqual(ctx().cruzados.length, 1);
});

test("apagar y volver a encender no cruza la puerta otra vez", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Grafo.montar(v, null);
  assert.strictEqual(Grafo.activo(), false);
  Grafo.montar(v, Ecualizador.plan("graves"));

  assert.strictEqual(ctx().cruzados.length, 1);
  assert.strictEqual(Grafo.activo(), true);
});

test("nadie cierra el contexto: cerrarlo con la puerta cruzada es dejar sin audio", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Grafo.apagar();
  Grafo.montar(v, null);

  assert.strictEqual(ctx().cerrado, false);
  assert.notStrictEqual(ctx().state, "closed");
});

test("si la cadena de filtros no se puede montar, la musica sigue saliendo", () => {
  // fallaAlCrearGain revienta el primer nodo de la cadena, DESPUES de cruzar.
  const { Grafo, Ecualizador, ctx, avisos, video } = montaje({ fallaAlCrearGain: true });
  const v = video();

  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("graves")), false);
  assert.strictEqual(Grafo.activo(), false);
  assert.ok(
    avisos.some((a) => a.indexOf("cadena de filtros") !== -1),
    "un fallo del que depende la musica no se traga en silencio"
  );

  /*
   * Este es el caso que justifica conectar a destination NADA MAS cruzar en
   * vez de al final del montaje. La puerta ya esta cruzada —eso no se puede
   * deshacer— asi que lo unico que queda por decidir es si se oye la cancion
   * sin ecualizar o si no se oye nada.
   */
  const f = fuenteDe(ctx(), v);
  assert.ok(f, "la fuente deberia existir: la puerta se cruzo");
  assert.deepStrictEqual(f.salidas, [ctx().destination]);
});

test("si no se puede cruzar, no se toca nada y se dice que no", () => {
  const { Grafo, Ecualizador, ctx, avisos, video } = montaje({ fallaAlCruzar: true });
  const v = video();

  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("graves")), false);
  assert.strictEqual(Grafo.activo(), false);
  assert.strictEqual(Grafo.cruzado(v), false);
  assert.ok(avisos.some((a) => a.indexOf("enrutar el audio") !== -1));
  assert.strictEqual(ctx().creados.filter((n) => n.tipo === "biquad").length, 0);
});

test("una pista cifrada no cruza la puerta ni crea contexto", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();
  v.mediaKeys = {};

  assert.strictEqual(Grafo.puedeEcualizarse(v), false);
  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("graves")), false);
  assert.strictEqual(ctx(), null);
});

/* ==================================================================
 * 1. El cableado
 * ================================================================== */

test("la cadena va fuente -> entrada -> filtros en orden -> toma -> destination", () => {
  const { Grafo, Ecualizador, ctx, win, video } = montaje();
  const v = video();
  const bandas = win.YTMPip.CONSTANTS.EQUALIZER_BANDS;

  Grafo.montar(v, Ecualizador.plan("graves"));

  const c = ctx();
  const f = fuenteDe(c, v);
  const filtros = filtrosDe(c);
  assert.strictEqual(filtros.length, bandas.length);

  // La fuente sale a un solo sitio, y ese sitio es el principio de la cadena.
  assert.strictEqual(f.salidas.length, 1);
  const entrada = f.salidas[0];
  assert.strictEqual(entrada.tipo, "gain");

  // Y de ahi se recorre la cadena entera a pie, nodo a nodo, comprobando que
  // el orden de los filtros es el orden de las bandas.
  let actual = entrada;
  for (let i = 0; i < filtros.length; i++) {
    assert.strictEqual(actual.salidas.length, 1, `el nodo ${i} deberia salir a un solo sitio`);
    actual = actual.salidas[0];
    assert.strictEqual(actual, filtros[i], `el filtro ${i} no esta en su sitio`);
    assert.strictEqual(actual.frequency.value, bandas[i].hz);
  }

  assert.strictEqual(actual.salidas.length, 1);
  const toma = actual.salidas[0];
  assert.strictEqual(toma.tipo, "gain");
  assert.strictEqual(toma.gain.value, 1, "la toma no debe cambiar el sonido");
  assert.strictEqual(Grafo.nodoDeAnalisis(), toma);

  /*
   * Y de la toma al destino pasando por el limitador. El espectro cuelga de
   * la TOMA, o sea ANTES del limitador, y es deliberado: las barras enseñan
   * lo que hacen los filtros, no lo que el limitador quita en los picos.
   */
  assert.strictEqual(toma.salidas.length, 1);
  const limitador = toma.salidas[0];
  assert.strictEqual(limitador.tipo, "limitador");
  assert.deepStrictEqual(limitador.salidas, [c.destination]);
});

test("apagar puentea: fuente -> destination y los filtros fuera del camino", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  const c = ctx();
  const f = fuenteDe(c, v);
  const entrada = f.salidas[0];

  Grafo.apagar();

  assert.deepStrictEqual(f.salidas, [c.destination]);
  assert.strictEqual(f.salidas.indexOf(entrada), -1);
  assert.strictEqual(Grafo.activo(), false);
  assert.strictEqual(Grafo.nodoDeAnalisis(), null);
});

test("volver a encender reengancha la fuente a la cadena que ya estaba montada", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  const c = ctx();
  const filtrosAntes = filtrosDe(c);
  const f = fuenteDe(c, v);
  const entrada = f.salidas[0];

  Grafo.montar(v, null);
  Grafo.montar(v, Ecualizador.plan("voz"));

  assert.deepStrictEqual(f.salidas, [entrada]);
  // Y no se han fabricado filtros nuevos: cambiar de preset cambia numeros,
  // no cables.
  assert.strictEqual(filtrosDe(c).length, filtrosAntes.length);
  assert.strictEqual(filtrosDe(c)[0], filtrosAntes[0]);
});

/* ==================================================================
 * 2. Los numeros que llegan a los nodos
 * ================================================================== */

test("el plan llega intacto a los filtros: tipo, frecuencia y decibelios", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();
  const plan = Ecualizador.plan("graves");

  Grafo.montar(v, plan);

  const filtros = filtrosDe(ctx());
  for (let i = 0; i < plan.filtros.length; i++) {
    assert.strictEqual(filtros[i].type, plan.filtros[i].tipo);
    assert.strictEqual(filtros[i].frequency.value, plan.filtros[i].hz);
    assert.strictEqual(filtros[i].gain.value, plan.filtros[i].db);
  }
});

test("a los shelf NO se les toca la Q y a las campanas si", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();
  const plan = Ecualizador.plan("graves");

  Grafo.montar(v, plan);

  const filtros = filtrosDe(ctx());
  for (let i = 0; i < plan.filtros.length; i++) {
    const esperaQ = typeof plan.filtros[i].q === "number";
    /*
     * Se cuentan ESCRITURAS, no se mira el valor. El valor de fabrica de un
     * BiquadFilterNode es Q = 1, que da la casualidad de ser el mismo que
     * usan las campanas: mirando el valor, un codigo que le escribiera la Q a
     * un shelf pasaria esta prueba sin despeinarse.
     *
     * Y en un shelf la Q no es el ancho de la campana, es la resonancia del
     * escalon: cualquier cosa que no sea el 0,707 de fabrica mete un pico en
     * la esquina, o sea un silbido justo donde el usuario pidio graves.
     */
    assert.strictEqual(
      filtros[i].Q.escrituras > 0,
      esperaQ,
      `${plan.filtros[i].id} (${plan.filtros[i].tipo}): la Q ${esperaQ ? "deberia" : "no deberia"} escribirse`
    );
  }
});

test("la ganancia se pide con rampa y la frecuencia a pelo", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));

  const filtros = filtrosDe(ctx());
  for (const f of filtros) {
    // Un salto de ganancia entre dos muestras es un chasquido y se oye cada
    // vez que se mueve un mando.
    assert.ok(f.gain.rampas > 0, "la ganancia deberia moverse con rampa");
    assert.strictEqual(f.gain.escrituras, 0);
    // La frecuencia no es la señal, es la forma del filtro: no hace escalon.
    assert.ok(f.frequency.escrituras > 0);
    assert.strictEqual(f.frequency.rampas, 0);
  }
});

test("la entrada es exactamente lo que dice el plan, y nunca sube", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  /*
   * Aqui habia una prueba llamada «subir graves baja la entrada» que exigia
   * `entrada.gain.value < 1` con el preset de graves. Fijaba el fallo de
   * «apagado suena mas fuerte»: la entrada bajaba +8 dB para que los graves
   * subieran +8, o sea que no subia nada. Ahora de los picos se encarga el
   * limitador y la entrada se queda a 1.
   *
   * Lo que se comprueba es que el grafo OBEDECE al plan, que es su unico
   * trabajo, y que no se inventa una subida.
   */
  for (const valor of ["graves", "plano", "voz", "12,12,12,12,12"]) {
    Grafo.montar(v, Ecualizador.plan(valor));
    const entrada = fuenteDe(ctx(), v).salidas[0];
    assert.strictEqual(
      entrada.gain.value,
      Ecualizador.factorDe(Ecualizador.preamplificacion(valor)),
      `con ${valor}`
    );
    assert.ok(entrada.gain.value <= 1, `la entrada subio con ${valor}`);
  }
});

test("la entrada se ESCRIBE, aunque hoy el plan siempre pida uno", () => {
  /*
   * ESTA PRUEBA LA PIDIO UNA MUTACION QUE SOBREVIVIA: borrar entera la linea
   * `ajustarSuave(entrada.gain, plan.entrada)` no rompia nada. Y con razon,
   * porque con las constantes de hoy `plan.entrada` vale 1 en todos los
   * ajustes que se pueden pedir, y un GainNode recien creado ya vale 1. La
   * prueba de arriba estaba comparando dos unos.
   *
   * Asi que aqui se monta con un plan A MANO que pide otra cosa. El grafo no
   * sabe de presets ni de limitadores: recibe un plan y lo obedece, y eso es
   * lo unico que hay que comprobar. El dia que el limitador se quede corto,
   * `plan.entrada` bajara de 1 y esta linea es la que lo lleva al audio.
   */
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  const plan = Ecualizador.plan("graves");
  plan.entrada = 0.5;
  Grafo.montar(v, plan);

  const entrada = fuenteDe(ctx(), v).salidas[0];
  assert.strictEqual(entrada.gain.objetivo, 0.5);
  // Y con rampa: la entrada SI es la señal, y un escalon aqui se oye.
  assert.ok(entrada.gain.rampas > 0, "la entrada tiene que llegar con rampa, no de golpe");
});

test("el limitador se monta con los numeros del plan, no con los de fabrica", () => {
  const { Grafo, Ecualizador, ctx, win, video } = montaje();
  const v = video();
  const lim = win.YTMPip.CONSTANTS.EQUALIZER_LIMITS.LIMITADOR;

  Grafo.montar(v, Ecualizador.plan("graves"));
  const limitador = ctx().creados.find((n) => n.tipo === "limitador");
  assert.ok(limitador, "no se monto ningun limitador");

  assert.strictEqual(limitador.threshold.value, lim.UMBRAL_DB);
  assert.strictEqual(limitador.knee.value, lim.RODILLA_DB);
  assert.strictEqual(limitador.ratio.value, lim.RATIO);
  assert.strictEqual(limitador.attack.value, lim.ATAQUE_S);
  assert.strictEqual(limitador.release.value, lim.RELAJACION_S);

  /*
   * ESTAS DOS LINEAS LAS PIDIO UNA MUTACION QUE SOBREVIVIA. El doble arranca
   * los parametros con los valores de fabrica de la especificacion justamente
   * para que un olvido se vea; el problema es que el ataque y la relajacion
   * que este proyecto quiere COINCIDEN con los de fabrica (0,003 y 0,25), asi
   * que comparar el valor no distingue "se escribio lo correcto" de "no se
   * escribio nada". Para eso lleva la cuenta `escrituras`.
   *
   * No es un detalle: el ataque es lo que decide si el limitador atrapa el
   * golpe o llega tarde, y llegar tarde suena a chasquido.
   */
  assert.ok(limitador.attack.escrituras > 0, "al ataque no se le escribio nada");
  assert.ok(limitador.release.escrituras > 0, "a la relajacion no se le escribio nada");

  /*
   * SIN RAMPA, al reves que las ganancias. Estos parametros no son la señal
   * sino la forma de la red: cambiarlos no hace ningun escalon en el audio, y
   * ademas solo cambian si cambian las constantes.
   */
  assert.strictEqual(limitador.threshold.rampas, 0);
  assert.strictEqual(limitador.ratio.rampas, 0);
});

test("el limitador se monta UNA vez aunque se cambie de ajuste diez veces", () => {
  /*
   * La cadena no se reconstruye al cambiar de preset: solo cambian valores.
   * Un limitador nuevo por cada cambio los iria encadenando en serie, y cada
   * uno aplasta lo que le llega del anterior: el sonido se iria apagando
   * segun se juega con los mandos. Es el mismo fallo que el usuario creyo ver
   * («el volumen se esta bajando automaticamente») y que entonces no existia.
   */
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  for (const valor of ["graves", "voz", "nocturno", "plano", "graves", "1,2,3,4,5"]) {
    Grafo.montar(v, Ecualizador.plan(valor));
  }

  assert.strictEqual(ctx().creados.filter((n) => n.tipo === "limitador").length, 1);
});

test("apagar deja la musica FUERA del limitador, no solo fuera de los filtros", () => {
  /*
   * Apagado significa el audio intacto. Si al puentear se quedara pasando por
   * el limitador, "apagado" seguiria tocando el sonido en los picos y no seria
   * apagado: seria otro ajuste mas.
   */
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Grafo.montar(v, null);

  const c = ctx();
  assert.deepStrictEqual(fuenteDe(c, v).salidas, [c.destination]);
});

test("sin DynamicsCompressor la cadena NO se queda sin salida", () => {
  /*
   * El limitador es una red, no un eslabon imprescindible. En un navegador que
   * no lo tuviera, la eleccion es entre oir la cancion sin red y no oirla: se
   * conecta la toma directamente al destino.
   */
  const { Grafo, Ecualizador, ctx, video } = montaje({ sinLimitador: true });
  const v = video();

  assert.strictEqual(Grafo.montar(v, Ecualizador.plan("graves")), true);
  const c = ctx();
  const toma = Grafo.nodoDeAnalisis();
  assert.ok(toma, "deberia haber toma igualmente");
  assert.deepStrictEqual(toma.salidas, [c.destination]);
});

/* ==================================================================
 * 3. Cambiar de elemento
 * ================================================================== */

test("al cambiar de <video> el anterior se queda saliendo por destination", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v1 = video();
  const v2 = video();

  Grafo.montar(v1, Ecualizador.plan("graves"));
  const c = ctx();
  const f1 = fuenteDe(c, v1);
  Grafo.montar(v2, Ecualizador.plan("graves"));

  /*
   * v1 ya cruzo la puerta: su audio solo sale por el grafo. Dejarlo colgando
   * sin conexiones al cambiar de elemento seria condenarlo al silencio, y no
   * es un caso teorico —YouTube Music reaprovecha y descarta elementos al
   * encadenar canciones—.
   */
  assert.deepStrictEqual(f1.salidas, [c.destination]);
  assert.strictEqual(Grafo.elementoActual(), v2);

  const f2 = fuenteDe(c, v2);
  assert.strictEqual(f2.salidas.length, 1);
  assert.strictEqual(f2.salidas[0].tipo, "gain");
});

test("cada elemento cruza su propia puerta y solo una vez", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v1 = video();
  const v2 = video();

  Grafo.montar(v1, Ecualizador.plan("graves"));
  Grafo.montar(v2, Ecualizador.plan("graves"));
  Grafo.montar(v1, Ecualizador.plan("voz"));
  Grafo.montar(v2, Ecualizador.plan("voz"));

  assert.strictEqual(ctx().cruzados.length, 2);
});

test("una sola cadena de filtros para todos los elementos", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v1 = video();
  const v2 = video();

  Grafo.montar(v1, Ecualizador.plan("graves"));
  const cuantos = filtrosDe(ctx()).length;
  Grafo.montar(v2, Ecualizador.plan("graves"));

  // Cambiar de cancion no fabrica cinco filtros mas cada vez. Un grafo que
  // crece con cada cancion es una fuga que solo se nota tras un rato largo.
  assert.strictEqual(filtrosDe(ctx()).length, cuantos);
});

/* ==================================================================
 * 4. El contexto suspendido
 * ================================================================== */

test("montar levanta un contexto suspendido", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje({ state: "suspended" });
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));

  /*
   * Con la puerta cruzada, un contexto suspendido no da un espectro plano: da
   * SILENCIO. Y se suspende solo, sin que nadie haga nada, al mandar la
   * pestaña al fondo.
   */
  assert.ok(ctx().resumes > 0);
  assert.strictEqual(ctx().state, "running");
});

test("reanudar no molesta a un contexto que ya esta en marcha", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  const antes = ctx().resumes;
  Grafo.reanudar();
  Grafo.reanudar();

  assert.strictEqual(ctx().resumes, antes);
});

test("reanudar sin contexto no revienta", () => {
  const { Grafo, ctx } = montaje();
  Grafo.reanudar();
  assert.strictEqual(ctx(), null);
});

/* ==================================================================
 * 5. El nodo de analisis
 * ================================================================== */

test("el espectro se cuelga DESPUES de los filtros, para enseñar lo que se oye", () => {
  const { Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));

  const toma = Grafo.nodoDeAnalisis();
  const ultimoFiltro = filtrosDe(ctx()).pop();
  assert.ok(toma);
  assert.strictEqual(ultimoFiltro.salidas[0], toma);
});

test("sin ecualizador no hay nodo de analisis: el espectro se queda con su copia", () => {
  const { Grafo, Ecualizador, video } = montaje();
  const v = video();

  assert.strictEqual(Grafo.nodoDeAnalisis(), null);
  Grafo.montar(v, null);
  assert.strictEqual(Grafo.nodoDeAnalisis(), null);
  Grafo.montar(v, Ecualizador.plan("graves"));
  assert.ok(Grafo.nodoDeAnalisis());
  Grafo.apagar();
  assert.strictEqual(Grafo.nodoDeAnalisis(), null);
});
