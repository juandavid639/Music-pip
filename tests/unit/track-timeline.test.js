/*
 * Pruebas del tiempo POR PISTA.
 *
 * La causa real de "se junta el tiempo entre canciones", despues de cinco
 * arreglos que no la tocaron. Los numeros de todo este archivo son los de
 * la captura que por fin lo demostro:
 *
 *   la ventana marcaba      5:12 / 6:54
 *   YouTube Music iba por   1:35 / 3:18
 *   la cancion anterior duraba      3:36
 *
 *   3:36 + 3:18 = 6:54    la duracion era la SUMA de las dos
 *   5:12 - 1:35 = 3:37    el tiempo llevaba dentro la pista anterior
 *
 * Es decir: YouTube Music REUTILIZA el mismo <video> y le va añadiendo las
 * pistas a la misma linea de tiempo. `currentTime` y `duration` son de la
 * cola entera, no de la cancion.
 *
 * Los cinco intentos anteriores discutieron A CUAL de los <video>
 * preguntar. Ninguno comprobo si la pregunta tenia sentido. Y el usuario lo
 * habia dicho literalmente en el primer mensaje —"se junta el tiempo entre
 * canciones"— mientras yo lo leia como "se congela".
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido, conTiempos, conTiempoDePagina } = require("../helpers/entorno.js");

const PISTA_ANTERIOR = 216; // 3:36
const PISTA_ACTUAL = 198; // 3:18
const COLA = PISTA_ANTERIOR + PISTA_ACTUAL; // 414 = 6:54

/* La segunda cancion de la cola, sonando por su segundo `enLaPista`. */
function segundaCancion(enLaPista) {
  const entorno = entornoContenido("controles-completos.html");
  conTiempos(entorno.win.document.querySelector("video"), PISTA_ANTERIOR + enLaPista, COLA);
  conTiempoDePagina(entorno.win, Math.floor(enLaPista), PISTA_ACTUAL);
  return entorno;
}

test("EL CASO REPORTADO: la duracion es la de la cancion, no la suma de la cola", () => {
  const entorno = segundaCancion(95); // 1:35
  const video = entorno.win.document.querySelector("video");

  assert.strictEqual(video.currentTime, 311, "premisa: el <video> dice 5:11");
  assert.strictEqual(video.duration, 414, "premisa: el <video> dice 6:54, la suma de las dos");

  const { elapsed, duration } = entorno.YTMPip.TrackTimeline.read();

  assert.strictEqual(duration, 198, "la duracion seguia siendo la suma (6:54)");
  assert.strictEqual(elapsed, 95, "el tiempo seguia arrastrando la cancion anterior (5:12)");
});

test("el estado que se publica tambien va por pista", () => {
  // La comprobacion de punta a punta: no basta con que TrackTimeline
  // acierte si MetadataReader sigue leyendo el <video> a pelo.
  const entorno = segundaCancion(95);
  const estado = entorno.YTMPip.MetadataReader.read();

  assert.strictEqual(estado.currentTime, 95);
  assert.strictEqual(estado.duration, 198);
});

test("el contador avanza suave aunque la pagina vaya a saltos de un segundo", () => {
  /*
   * La pagina publica segundos enteros. Leerla a pelo daria una barra que
   * salta de segundo en segundo, y por eso el tiempo se calcula como
   * `currentTime - desplazamiento`, que es continuo.
   *
   * Lo que esta prueba vigila es el otro extremo: que ese desplazamiento se
   * GUARDE. Si se recalculara en cada lectura, el redondeo de la pagina lo
   * haria bailar y el contador temblaria hacia atras.
   */
  const entorno = segundaCancion(95.4);
  const video = entorno.win.document.querySelector("video");
  const TrackTimeline = entorno.YTMPip.TrackTimeline;

  const lecturas = [];
  for (const enLaPista of [95.4, 95.7, 96.1, 96.4, 96.8]) {
    video.currentTime = PISTA_ANTERIOR + enLaPista;
    conTiempoDePagina(entorno.win, Math.floor(enLaPista), PISTA_ACTUAL);
    lecturas.push(TrackTimeline.read().elapsed);
  }

  for (let i = 1; i < lecturas.length; i++) {
    assert.ok(lecturas[i] > lecturas[i - 1],
      `el contador retrocedio: ${lecturas[i - 1]} -> ${lecturas[i]}`);
  }
  assert.ok(Math.abs(lecturas[lecturas.length - 1] - 96.8) < 1.01,
    `se fue lejos de la verdad: ${lecturas[lecturas.length - 1]}`);
});

test("al encadenar, el tiempo vuelve a empezar aunque el <video> siga subiendo", () => {
  // El instante exacto que el usuario ve mal. El <video> no se reinicia
  // NUNCA: pasa de 414 a 415. Quien dice que hay cancion nueva es la
  // pagina, y con ella se recalcula el desplazamiento.
  const entorno = segundaCancion(197);
  const video = entorno.win.document.querySelector("video");
  const TrackTimeline = entorno.YTMPip.TrackTimeline;

  assert.strictEqual(TrackTimeline.read().elapsed, 197, "premisa: acabando la segunda");

  const TERCERA = 187;
  Object.defineProperty(video, "duration", { value: COLA + TERCERA, configurable: true });
  video.currentTime = COLA + 2;
  conTiempoDePagina(entorno.win, 2, TERCERA);

  const { elapsed, duration } = TrackTimeline.read();
  assert.strictEqual(elapsed, 2, "el tiempo se sumaba al de la cancion anterior");
  assert.strictEqual(duration, TERCERA);
});

test("el texto '1:35 / 3:18' basta cuando el deslizador no se puede leer", () => {
  // Las dos fuentes son de mecanismos distintos de la misma interfaz. Que
  // Google cambie una no deberia dejarnos a ciegas, y esto lo fija.
  const entorno = segundaCancion(95);
  entorno.win.document.querySelector("#progress-bar").remove();

  const { elapsed, duration } = entorno.YTMPip.TrackTimeline.read();
  assert.strictEqual(elapsed, 95);
  assert.strictEqual(duration, 198);
});

test("el texto tal y como lo escribe YouTube Music de verdad, con saltos de linea", () => {
  /*
   * Esta cadena no me la he inventado: es la que devolvio
   * tools/diagnostico-tiempo.js sobre music.youtube.com. El resto de
   * pruebas usan "1:35 / 3:18" limpio, que es como YO supuse que venia; la
   * pagina lo envuelve en saltos de linea y sangria.
   *
   * Tambien confirmo lo importante: `#progress-bar` y `.time-info` existen
   * (aria-valuenow=133, aria-valuemax=520) y coinciden con el texto. Los
   * selectores eran conjeturas hasta esa lectura.
   */
  const entorno = entornoContenido("controles-completos.html");
  conTiempos(entorno.win.document.querySelector("video"), 133, 1200);
  entorno.win.document.querySelector("#progress-bar").remove();
  entorno.win.document.querySelector(".time-info").textContent = "\n    2:13 / 8:40\n  ";

  const { elapsed, duration } = entorno.YTMPip.TrackTimeline.read();
  assert.strictEqual(elapsed, 133);
  assert.strictEqual(duration, 520);
});

test("un texto de tiempo con basura no se cuela como numero", () => {
  // "Cargando..." o un guion mientras la pista arranca. Preferimos caer al
  // <video> antes que pintar un cero o un NaN.
  const entorno = segundaCancion(95);
  entorno.win.document.querySelector("#progress-bar").remove();
  entorno.win.document.querySelector(".time-info").textContent = "-- / --";

  const { duration } = entorno.YTMPip.TrackTimeline.read();
  assert.strictEqual(duration, COLA, "sin fuente fiable se cae al <video>, no a cero");
});

test("sin barra que leer se cae al <video>, que es lo unico que queda", () => {
  /*
   * El camino degradado, escrito a proposito. Si Google se lleva por
   * delante las dos fuentes, la ventana muestra los numeros de la cola:
   * incorrectos a partir de la segunda cancion, pero se mueven y en una
   * cola de una sola cancion son exactos. Es peor que lo de arriba y mejor
   * que un 0:00 congelado.
   */
  const entorno = segundaCancion(95);
  conTiempoDePagina(entorno.win, null, null);

  const { elapsed, duration } = entorno.YTMPip.TrackTimeline.read();
  assert.strictEqual(elapsed, 311);
  assert.strictEqual(duration, COLA);
});

test("toMediaTime traduce el segundo de la pista al de la cola", () => {
  // Arrastrar la barra al minuto 2 tiene que escribir 216+120 en el
  // <video>, no 120: 120 es el minuto 2 de la cancion ANTERIOR.
  const entorno = segundaCancion(95);

  assert.strictEqual(entorno.YTMPip.TrackTimeline.toMediaTime(120), PISTA_ANTERIOR + 120);
  assert.strictEqual(entorno.YTMPip.TrackTimeline.toMediaTime(0), PISTA_ANTERIOR,
    "el principio de la cancion no es el principio de la cola");
});

test("toMediaTime no deja salirse de la cancion actual", () => {
  // Acotar con la duracion del <video> acotaba al final de LA COLA, asi que
  // un salto adelante cerca del final se metia en la cancion siguiente.
  const entorno = segundaCancion(190);

  assert.strictEqual(entorno.YTMPip.TrackTimeline.toMediaTime(9999), PISTA_ANTERIOR + PISTA_ACTUAL);
  assert.strictEqual(entorno.YTMPip.TrackTimeline.toMediaTime(-30), PISTA_ANTERIOR);
});
