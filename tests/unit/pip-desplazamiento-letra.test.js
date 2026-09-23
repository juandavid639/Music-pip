/*
 * Pruebas del AUTODESPLAZAMIENTO de la letra.
 *
 * Existen por un fallo reportado con dos caras que parecian no tener nada
 * que ver: "al cambiar la ventana de tamaño aparece el error visual en la
 * parte inferior" y "se oculta la opcion de poner video". El diagnostico de
 * la ventana real (tools/diagnostico-ventana.js) las junto en un solo dato:
 *
 *     body.scrollTop: 43.63
 *     cabecera  y=-36..-10  → FUERA de la ventana
 *
 * El documento entero estaba desplazado 43 px hacia arriba. La cabecera se
 * salia por arriba (con el boton de video dentro) y por abajo aparecia el
 * hueco que dejaba. Lo hacia scrollIntoView, que no desplaza solo el
 * contenedor con scroll: desplaza TODOS los antepasados, y el
 * `overflow: hidden` de html/body no lo impide porque prohibe el scroll del
 * usuario, no el programatico.
 *
 * Por eso estas pruebas no miran "queda centrada" —eso necesita
 * maquetacion, y jsdom no la tiene— sino QUIEN se desplaza. Es justo lo que
 * fallaba.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

function ventana() {
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

  /*
   * jsdom no implementa ninguno de los dos (no tiene maquetacion), asi que
   * hay que ponerlos. Se aprovecha para apuntar sobre QUE elemento se
   * llaman, que es lo que se quiere comprobar.
   */
  const llamadas = { scrollTo: [], scrollIntoView: [] };
  win.Element.prototype.scrollTo = function (opciones) {
    llamadas.scrollTo.push({ sobre: this, opciones: opciones });
  };
  win.Element.prototype.scrollIntoView = function () {
    llamadas.scrollIntoView.push(this);
  };

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return { win, doc, banco, llamadas, PipView: win.YTMPip.PipView };
}

function conLetra() {
  return {
    connected: true,
    playing: true,
    title: "x",
    artist: "y",
    hasVideo: false,
    lyrics: {
      status: "available",
      source: "Better Lyrics",
      lines: [
        { text: "Outta these walls", time: 10 },
        { text: "He's mad 'cause of your hoes", time: 14 },
        { text: "Watching from the outside", time: 18 },
        { text: "Sometimes I don't let go", time: 22 }
      ]
    }
  };
}

test("EL FALLO REPORTADO: resaltar una linea no desplaza nada fuera del panel", () => {
  /*
   * scrollIntoView era comodo y por eso estaba: una linea y el navegador se
   * encarga. Lo que se lleva por delante es la cabecera de la ventana, que
   * es donde vive el boton de video. Si vuelve, esta prueba lo dice.
   */
  const v = ventana();
  v.PipView.onStateUpdate(conLetra());

  v.banco.fijarLineaActiva(2);

  assert.deepStrictEqual(v.llamadas.scrollIntoView, [],
    "volvio scrollIntoView: arrastra al <body> y la cabecera se sale por arriba");
  assert.strictEqual(v.llamadas.scrollTo.length, 1, "no se desplazo el panel");
  assert.strictEqual(v.llamadas.scrollTo[0].sobre, v.doc.getElementById("ytmpip-lyrics-panel"),
    "se desplazo otra cosa que no es el panel de la letra");
});

/*
 * Lo que NO se prueba aqui: que el autodesplazamiento se aparte cuatro
 * segundos cuando el usuario hace scroll. Ese temporizador lo arman los
 * listeners de `wheel` y `touchmove`, que cablea wireEvents() sobre una
 * ventana flotante de verdad; el banco monta los elementos pero no cablea.
 * Probarlo exigiria una copia del manejador, y una regla en dos sitios no
 * es una regla, son dos.
 */

/*
 * La cuenta del centrado, aparte y pura. Se mide con rectangulos y no con
 * offsetTop porque offsetTop se mide contra el antepasado POSICIONADO, que
 * no tiene por que ser el panel: el dia que alguien le ponga
 * `position: relative` a un contenedor intermedio, la letra se iria a otro
 * sitio sin que nada mas cambiara.
 */
test("centrar deja la linea en mitad del panel", () => {
  const banco = ventana().banco;

  // Panel de 100 de alto, linea de 20 que empieza 200 px mas abajo.
  const top = banco.centrarEnElPanel({ top: 200, height: 20 }, { top: 0, height: 100 }, 0);

  assert.strictEqual(top, 160);
  // Comprobacion del resultado, no de la formula: tras desplazar 160, la
  // linea ocupa de 40 a 60 y su centro cae en 50, la mitad de 100.
  assert.strictEqual(200 - top + 20 / 2, 50);
});

test("centrar cuenta desde donde ya esta el panel, no desde arriba", () => {
  // Sin sumar el scroll actual, cada linea se calcularia como si el panel
  // estuviera al principio y la letra iria dando saltos hacia atras.
  const banco = ventana().banco;

  assert.strictEqual(
    banco.centrarEnElPanel({ top: 200, height: 20 }, { top: 0, height: 100 }, 500),
    660
  );
});

test("una linea que ya esta centrada no mueve el panel", () => {
  const banco = ventana().banco;

  // El panel empieza en y=50 y mide 100: su centro esta en 100. Una linea
  // de 20 que ocupa de 90 a 110 ya esta justo ahi.
  assert.strictEqual(banco.centrarEnElPanel({ top: 90, height: 20 }, { top: 50, height: 100 }, 300), 300);
});
