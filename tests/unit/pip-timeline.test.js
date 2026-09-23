/*
 * Pruebas de lo que se enseña en la barra de progreso y en el contador.
 *
 * El fallo que originó esto, reportado desde el uso real: al encadenar la
 * siguiente canción automaticamente, "el contador sigue ejecutandose y se
 * suma el tiempo a la barra, eso rompe el reproductor".
 *
 * La causa en nuestro lado era que las dos mitades de la MISMA informacion
 * se calculaban por separado: la barra acotaba con Math.min(tiempo,
 * duracion) y el contador de texto pintaba el tiempo crudo. Mientras el
 * reproductor diera un tiempo mayor que la duracion, los digitos subian y
 * la barra estaba clavada en el tope, contandose la una a la otra cosas
 * distintas.
 *
 * De ahi la invariante que vigilan estas pruebas: el contador y la barra
 * NUNCA se contradicen, porque salen del mismo numero.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar } = require("../helpers/entorno.js");

function vista() {
  const { win } = crearEntorno();
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
  return win.YTMPip.PipView;
}

test("reproduccion normal: pasa el tiempo tal cual", () => {
  const t = vista().timelineFor(63, 223);

  assert.strictEqual(t.elapsed, 63);
  assert.strictEqual(t.duration, 223);
  assert.strictEqual(t.seekable, true);
});

test("EL CASO REPORTADO: un tiempo mayor que la duracion no desborda la barra", () => {
  // Es lo que llegaba al encadenar la pista siguiente: el tiempo de la
  // anterior contra una duracion que aun no se habia actualizado.
  const t = vista().timelineFor(310, 223);
  assert.strictEqual(t.elapsed, 223, "el tiempo debia quedar acotado a la duracion");
});

test("el contador y la barra nunca se contradicen", () => {
  /*
   * LA prueba de este fichero. Da igual la combinacion: lo que se pinta en
   * los digitos y lo que se pinta en la barra tienen que ser el MISMO
   * numero, y ese numero tiene que caber dentro de la barra. Antes esto no
   * se cumplia para ninguna pareja con tiempo > duracion.
   */
  const PipView = vista();
  const tiempos = [-5, 0, 1, 63, 222.9, 223, 300, 1e9, NaN, Infinity];
  const duraciones = [0, 1, 223, NaN, Infinity, -1];

  for (const tiempo of tiempos) {
    for (const duracion of duraciones) {
      const t = PipView.timelineFor(tiempo, duracion);

      assert.ok(Number.isFinite(t.elapsed), `${tiempo}/${duracion}: elapsed no es un numero`);
      assert.ok(Number.isFinite(t.duration), `${tiempo}/${duracion}: duration no es un numero`);
      assert.ok(t.elapsed >= 0, `${tiempo}/${duracion}: elapsed negativo`);
      assert.ok(
        t.elapsed <= t.duration,
        `${tiempo}/${duracion}: el contador (${t.elapsed}) se sale de la barra (${t.duration})`
      );
    }
  }
});

test("duracion desconocida: no se arrastra el tiempo de la pista anterior", () => {
  /*
   * Un MediaSource al que aun no le han fijado la duracion devuelve NaN o
   * Infinity. Antes eso dejaba la barra deshabilitada Y el contador
   * subiendo: un reproductor que dice ir por el minuto 4 de una cancion
   * cuya duracion es 0:00. Mas vale decir "todavia no lo se".
   */
  const PipView = vista();

  for (const duracion of [0, NaN, Infinity, undefined, -1]) {
    const t = PipView.timelineFor(184, duracion);
    assert.strictEqual(t.elapsed, 0, `duracion ${duracion}: se colo el tiempo viejo`);
    assert.strictEqual(t.duration, 0, `duracion ${duracion}`);
    assert.strictEqual(t.seekable, false, `duracion ${duracion}: barra arrastrable sin duracion`);
  }
});

test("sin duracion no se puede arrastrar; con duracion si", () => {
  // seekable es lo que deshabilita el <input range>. Dejarlo habilitado sin
  // duracion permite soltar el pulgar y pedir un salto a ninguna parte.
  const PipView = vista();

  assert.strictEqual(PipView.timelineFor(0, 0).seekable, false);
  assert.strictEqual(PipView.timelineFor(0, 223).seekable, true);
});

test("tiempos absurdos caen a 0, que es como se dice 'no lo se'", () => {
  /*
   * Escribi este test esperando que Infinity se acotara a la duracion, y
   * fallo. Repasandolo, el codigo tiene razon y el test no: un tiempo
   * infinito es una lectura basura, y acotarla al maximo dejaria la barra
   * en el tope, que es como decir "la cancion ha terminado". Eso no lo
   * sabemos. 0 es el mismo valor de "todavia no lo se" que usa el resto de
   * la funcion cuando la duracion es desconocida, y no afirma nada falso.
   */
  const PipView = vista();

  assert.strictEqual(PipView.timelineFor(-30, 223).elapsed, 0, "tiempo negativo");
  assert.strictEqual(PipView.timelineFor(NaN, 223).elapsed, 0, "NaN");
  assert.strictEqual(PipView.timelineFor(Infinity, 223).elapsed, 0, "Infinity");
  assert.strictEqual(PipView.timelineFor(undefined, 223).elapsed, 0, "undefined");
});

test("el instante exacto del final es valido, no un desbordamiento", () => {
  const t = vista().timelineFor(223, 223);
  assert.strictEqual(t.elapsed, 223);
  assert.strictEqual(t.seekable, true);
});
