/*
 * Pruebas del ENGANCHE entre el espectro y el ecualizador.
 *
 * Son dos modulos que hasta ahora no se conocian y que a partir de aqui se
 * pelean por el mismo <video>. El espectro mide una COPIA (captureStream) y el
 * ecualizador se lleva el original por un grafo; lo que estas pruebas clavan
 * es que las dos cosas NUNCA convivan y que al separarse ninguna se lleve por
 * delante a la otra.
 *
 * Hay un fallo concreto que estas pruebas existen para atrapar, y es el que
 * cualquiera escribiria sin darse cuenta: cuando el espectro esta colgado de
 * la toma del ecualizador, `desconectar()` no puede hacer `fuente.disconnect()`
 * ni `ctx.close()`. Esa fuente es la toma del grafo, que tambien va a
 * destination, y ese contexto es el del grafo. Cualquiera de las dos lineas
 * deja al usuario SIN MUSICA hasta que recargue la pestaña, y el sintoma
 * aparece al apagar el espectro, que es el ultimo sitio donde nadie lo
 * buscaria.
 *
 * Lo que estas pruebas NO dicen: nada sobre como suena, ni sobre si
 * captureStream sigue llevando audio despues de createMediaElementSource. Esa
 * pregunta no se contesta, se evita: por eso las dos cosas no conviven.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar } = require("../helpers/entorno.js");
const { instalarAudioFalso, conCaptura } = require("../helpers/audio-falso.js");

function montaje() {
  const { win } = crearEntorno(undefined);
  const dameCtx = instalarAudioFalso(win);
  const avisos = [];
  win.console.warn = (...args) => avisos.push(args.map(String).join(" "));
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/ecualizador.js",
    "src/content/audio-grafo.js",
    "src/content/audio-spectrum.js"
  );
  return {
    win,
    ctx: dameCtx,
    avisos,
    Grafo: win.YTMPip.GrafoAudio,
    Espectro: win.YTMPip.Espectro,
    Ecualizador: win.YTMPip.Ecualizador,
    video: () => conCaptura(win.document.createElement("video"))
  };
}

function analizadoresDe(ctx) {
  return ctx.creados.filter((n) => n.tipo === "analizador");
}

/*
 * La salida de la toma ya NO es destination: desde que existe el limitador la
 * cola es `toma -> limitador -> destination`.
 *
 * Los analizadores siguen colgando de la toma, o sea DELANTE del limitador, y
 * eso es a proposito: el limitador solo actua cuando hay pico, asi que si el
 * espectro midiera detras, las barras encogerian en los golpes fuertes y
 * pareceria que el dibujo va a su aire. Se mide lo que sale de los filtros.
 */
function limitadorDe(ctx) {
  return ctx.creados.find((n) => n.tipo === "limitador");
}

/* ==================================================================
 * 1. Sin ecualizador: nada cambia
 * ================================================================== */

test("sin ecualizador el espectro sigue midiendo su copia y no cruza nada", () => {
  const { Espectro, ctx, video } = montaje();
  const v = video();

  assert.strictEqual(Espectro.conectar(v), true);
  assert.strictEqual(Espectro.conectado(), true);
  assert.strictEqual(Espectro.usandoElGrafo(), false);
  assert.strictEqual(v.capturas, 1);

  // Y sobre todo: la puerta de un solo sentido sigue cerrada. Medir no puede
  // costarle a nadie el audio de su cancion.
  assert.strictEqual(ctx().cruzados.length, 0);
});

test("sin ecualizador, apagar el espectro cierra su contexto (era suyo)", () => {
  const { Espectro, ctx, video } = montaje();
  const v = video();

  Espectro.conectar(v);
  const suyo = ctx();
  Espectro.desconectar();

  assert.strictEqual(Espectro.conectado(), false);
  assert.strictEqual(suyo.cerrado, true);
});

/* ==================================================================
 * 2. Con ecualizador: se cuelga del grafo
 * ================================================================== */

test("con el ecualizador encendido el espectro NO hace captureStream", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  assert.strictEqual(Espectro.conectar(v), true);

  assert.strictEqual(Espectro.usandoElGrafo(), true);
  /*
   * Cero capturas. Ya se midio una vez que dos consumidores de captureStream
   * sobre el mismo <video> se ahogan entre ellos (1,3% -> 64,6% de fotogramas
   * perdidos), y encima aqui ni siquiera esta claro que la copia siga
   * llevando audio despues de cruzar la puerta.
   */
  assert.strictEqual(v.capturas, 0);
  // Un solo contexto en toda la pagina: el del grafo.
  assert.strictEqual(ctx.todos.length, 1);
});

test("el espectro se cuelga de la toma, o sea DETRAS de los filtros", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);

  const toma = Grafo.nodoDeAnalisis();
  const analizadores = analizadoresDe(ctx());
  assert.strictEqual(analizadores.length, 2, "barras y graves, cada uno el suyo");
  for (const a of analizadores) {
    assert.ok(
      toma.salidas.indexOf(a) !== -1,
      "el analizador deberia colgar de la toma y no de otro sitio"
    );
  }
  /*
   * Que cuelguen de la toma es lo que hace que el espectro enseñe lo que de
   * verdad se oye: subes graves y crecen las barras graves. De la copia no
   * podia, porque la copia sale de ANTES del ecualizador.
   */
});

test("los dos analizadores conservan su configuracion al colgarse del grafo", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);

  const [barras, graves] = analizadoresDe(ctx());
  assert.strictEqual(barras.fftSize, 256);
  assert.strictEqual(barras.smoothingTimeConstant, 0.5);
  // Suavizado CERO en el de graves: suavizar antes de medir un cambio es
  // medir otra cosa, y un golpe de bombo ES un cambio.
  assert.strictEqual(graves.fftSize, 2048);
  assert.strictEqual(graves.smoothingTimeConstant, 0);
});

test("con el ecualizador encendido se puede medir un elemento que no sabe capturar", () => {
  const { Espectro, Grafo, Ecualizador, win } = montaje();
  // A proposito SIN conCaptura: este elemento no tiene captureStream.
  const v = win.document.createElement("video");

  assert.strictEqual(Espectro.puedeMedirse(v), false);

  Grafo.montar(v, Ecualizador.plan("graves"));

  /*
   * Con el audio ya dentro del grafo, saber o no hacer una copia deja de venir
   * a cuento: se mide del propio grafo. Sin esto, en un navegador donde
   * captureStream no este disponible el ecualizador funcionaria y el espectro
   * no, aunque toda la informacion necesaria estuviera delante.
   */
  assert.strictEqual(Espectro.puedeMedirse(v), true);
  assert.strictEqual(Espectro.conectar(v), true);
  assert.strictEqual(Espectro.usandoElGrafo(), true);
});

/* ==================================================================
 * 3. Lo prestado no se cierra ni se suelta entero
 * ================================================================== */

test("apagar el espectro NO deja al ecualizador sin salida ni cierra su contexto", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);

  const c = ctx();
  const toma = Grafo.nodoDeAnalisis();
  Espectro.desconectar();

  /*
   * ESTA ES LA PRUEBA QUE JUSTIFICA EL ARCHIVO. Un `fuente.disconnect()` a
   * secas —que es lo que estaba escrito y lo natural de escribir— habria
   * soltado la toma tambien de destination, y la cancion se corta al apagar el
   * espectro sin que nadie relacione una cosa con la otra.
   */
  assert.deepStrictEqual(toma.salidas, [limitadorDe(c)]);
  // Y la cola entera sigue entera, no solo su primer tramo.
  assert.deepStrictEqual(limitadorDe(c).salidas, [c.destination]);
  assert.strictEqual(c.cerrado, false);
  assert.strictEqual(Espectro.conectado(), false);
  assert.strictEqual(Espectro.usandoElGrafo(), false);
});

test("apagar el espectro le quita al grafo SOLO sus dos analizadores", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);
  const toma = Grafo.nodoDeAnalisis();
  assert.strictEqual(toma.salidas.length, 3, "limitador + dos analizadores");

  Espectro.desconectar();
  assert.strictEqual(toma.salidas.length, 1);
  assert.strictEqual(toma.salidas[0], limitadorDe(ctx()));
});

/* ==================================================================
 * 4. Encender y apagar el ecualizador con el espectro en marcha
 * ================================================================== */

test("encender el ecualizador con el espectro ya en marcha lo cambia de fuente", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Espectro.conectar(v);
  assert.strictEqual(Espectro.usandoElGrafo(), false);
  const suyo = ctx.primero();

  Grafo.montar(v, Ecualizador.plan("graves"));
  // El espectro se repregunta en cada refresco; esta es esa repregunta.
  assert.strictEqual(Espectro.conectar(v), true);

  /*
   * Ni el elemento ni la pista ni la fuente han cambiado: si `conectar` solo
   * vigilara esas tres cosas, se quedaria pegado a la copia y tendriamos las
   * dos formas de medir conviviendo, que es justo lo que no puede pasar. Por
   * eso hay una cuarta pregunta.
   */
  assert.strictEqual(Espectro.usandoElGrafo(), true);
  // Y su contexto de antes, que si era suyo, se cierra.
  assert.strictEqual(suyo.cerrado, true);
  assert.notStrictEqual(suyo, Grafo.contextoActual());
  assert.strictEqual(Grafo.contextoActual().cerrado, false);
});

test("apagar el ecualizador devuelve el espectro a su copia", () => {
  const { Espectro, Grafo, Ecualizador, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);
  assert.strictEqual(Espectro.usandoElGrafo(), true);
  const toma = Grafo.nodoDeAnalisis();

  Grafo.montar(v, null);
  assert.strictEqual(Espectro.conectar(v), true);

  assert.strictEqual(Espectro.usandoElGrafo(), false);
  assert.strictEqual(v.capturas, 1);
  // Y al soltarla, la toma se queda como estaba: solo con el limitador.
  assert.strictEqual(toma.salidas.length, 1);
});

test("volver a preguntar sin que nada cambie no remonta nada", () => {
  const { Espectro, Grafo, Ecualizador, ctx, video } = montaje();
  const v = video();

  Grafo.montar(v, Ecualizador.plan("graves"));
  Espectro.conectar(v);
  const cuantos = analizadoresDe(ctx()).length;

  Espectro.conectar(v);
  Espectro.conectar(v);

  /*
   * `conectar` se llama en cada refresco. Si remontara cada vez, el grafo
   * acumularia analizadores hasta que la pestaña se arrastrase, y el sintoma
   * seria "va lento despues de un rato", que no se parece en nada a su causa.
   */
  assert.strictEqual(analizadoresDe(ctx()).length, cuantos);
});

test("el ecualizador sobre OTRO video no le sirve al espectro de este", () => {
  const { Espectro, Grafo, Ecualizador, video } = montaje();
  const v1 = video();
  const v2 = video();

  Grafo.montar(v1, Ecualizador.plan("graves"));
  assert.strictEqual(Espectro.conectar(v2), true);

  /*
   * La toma del grafo lleva el audio de v1. Colgarse de ella para dibujar lo
   * que suena en v2 seria un espectro que se mueve con otra cancion: no
   * fallaria, no lanzaria nada, simplemente estaria mintiendo.
   */
  assert.strictEqual(Espectro.usandoElGrafo(), false);
  assert.strictEqual(v2.capturas, 1);
});

/* ==================================================================
 * 5. Sin ecualizador cargado
 * ================================================================== */

test("el espectro funciona igual si el grafo no esta cargado", () => {
  const { win } = crearEntorno(undefined);
  instalarAudioFalso(win);
  // A proposito SIN audio-grafo.js: el espectro es anterior al ecualizador y
  // no puede depender de el para arrancar.
  cargar(win, "src/shared/constants.js", "src/content/audio-spectrum.js");
  const v = conCaptura(win.document.createElement("video"));

  assert.strictEqual(win.YTMPip.Espectro.conectar(v), true);
  assert.strictEqual(win.YTMPip.Espectro.usandoElGrafo(), false);
});
