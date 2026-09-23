/*
 * Pruebas del autoajuste de la ventana flotante.
 *
 * Casi nada de pip.js se puede probar sin una ventana Document PiP real,
 * pero la decision de "cuanto detalle cabe" si: es una funcion pura de dos
 * numeros. Se aisla a proposito para que exista al menos una red bajo la
 * parte que el usuario nota mas.
 *
 * El fallo que originó esto: la maquetacion se decidia con la PREFERENCIA
 * de tamaño, no con el tamaño real, asi que encoger la ventana a mano no
 * cambiaba nada y los controles se salian por abajo.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar } = require("../helpers/entorno.js");
const { PIP_BREAKPOINTS, PIP_DIMENSIONS } = require("../helpers/constantes.js");

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

test("una ventana holgada lo muestra todo", () => {
  const d = vista().densityFor(420, 480);
  assert.deepStrictEqual({ mini: d.mini, tight: d.tight, narrow: d.narrow }, {
    mini: false,
    tight: false,
    narrow: false
  });
});

test("el tamaño de vídeo por defecto cabe entero", () => {
  // Si esto falla es que las dimensiones y los umbrales se han desalineado:
  // la ventana se abriria ya recortada.
  const { width, height } = PIP_DIMENSIONS.VIDEO;
  const d = vista().densityFor(width, height);

  assert.strictEqual(d.mini, false);
  assert.strictEqual(d.tight, false);
});

test("el tamaño ampliado por defecto cabe entero", () => {
  const { width, height } = PIP_DIMENSIONS.EXPANDED;
  const d = vista().densityFor(width, height);

  assert.strictEqual(d.mini, false);
  assert.strictEqual(d.tight, false);
});

test("el tamaño compacto por defecto es nivel mini", () => {
  const { width, height } = PIP_DIMENSIONS.COMPACT;
  assert.strictEqual(vista().densityFor(width, height).mini, true);
});

test("altura intermedia: nivel tight, no mini", () => {
  const alto = (PIP_BREAKPOINTS.HEIGHT_MINI + PIP_BREAKPOINTS.HEIGHT_TIGHT) / 2;
  const d = vista().densityFor(400, alto);

  assert.strictEqual(d.tight, true);
  assert.strictEqual(d.mini, false);
});

test("mini y tight son excluyentes", () => {
  // Si ambos fueran true, las reglas CSS se solaparian y el orden en que se
  // ocultan las cosas dejaria de estar claro.
  const PipView = vista();
  for (let alto = 120; alto <= 700; alto += 10) {
    const d = PipView.densityFor(360, alto);
    assert.ok(!(d.mini && d.tight), `alto ${alto}: mini y tight a la vez`);
  }
});

test("los umbrales son estrictos en su limite exacto", () => {
  const PipView = vista();
  const { HEIGHT_MINI, HEIGHT_TIGHT, WIDTH_NARROW } = PIP_BREAKPOINTS;

  assert.strictEqual(PipView.densityFor(360, HEIGHT_MINI).mini, false, "justo en el umbral aun cabe");
  assert.strictEqual(PipView.densityFor(360, HEIGHT_MINI - 1).mini, true);
  assert.strictEqual(PipView.densityFor(360, HEIGHT_TIGHT).tight, false);
  assert.strictEqual(PipView.densityFor(360, HEIGHT_TIGHT - 1).tight, true);
  assert.strictEqual(PipView.densityFor(WIDTH_NARROW, 480).narrow, false);
  assert.strictEqual(PipView.densityFor(WIDTH_NARROW - 1, 480).narrow, true);
});

test("el ancho y el alto se deciden por separado", () => {
  // Una ventana estrecha pero alta no debe perder los extras, y una ancha
  // pero baja no debe perder las etiquetas de tiempo.
  const PipView = vista();

  const estrechaAlta = PipView.densityFor(240, 600);
  assert.strictEqual(estrechaAlta.narrow, true);
  assert.strictEqual(estrechaAlta.mini, false);
  assert.strictEqual(estrechaAlta.tight, false);

  const anchaBaja = PipView.densityFor(600, 240);
  assert.strictEqual(anchaBaja.narrow, false);
  assert.strictEqual(anchaBaja.mini, true);
});

test("una ventana diminuta cae en el nivel minimo, no en un estado raro", () => {
  const d = vista().densityFor(120, 90);

  assert.strictEqual(d.mini, true);
  assert.strictEqual(d.narrow, true);
  assert.strictEqual(d.tight, false);
});

/*
 * La forma de colocar las piezas depende ADEMAS de si hay video, asi que no
 * cabe en densityFor. Son tres maquetaciones con reglas CSS propias y lo que
 * hay que garantizar es que nunca se activan dos a la vez: si coincidieran,
 * las reglas se solaparian y el resultado dependeria del orden del fichero.
 */

test("nunca se activan dos maquetaciones a la vez", () => {
  /*
   * "Como mucho una", no "exactamente una": con video y ventana holgada las
   * tres son false a proposito, porque la columna en ese caso la da la clase
   * .ytmpip-video-mode y no hace falta ninguna mas. Lo que romperia el CSS
   * es que coincidieran dos, no que no haya ninguna.
   */
  const PipView = vista();
  for (const hayVideo of [true, false]) {
    for (let alto = 120; alto <= 700; alto += 10) {
      for (const ancho of [200, 340, 560]) {
        const l = PipView.layoutFor(ancho, alto, hayVideo);
        const activas = [l.compact, l.expanded, l.overlay].filter(Boolean).length;
        assert.ok(activas <= 1,
          `${ancho}x${alto} video=${hayVideo}: ${activas} maquetaciones a la vez`);
      }
    }
  }
});

test("sin video siempre hay exactamente una maquetacion", () => {
  // Aqui si es obligatorio: sin video, o fila o columna, nunca ninguna.
  const PipView = vista();
  for (let alto = 120; alto <= 700; alto += 10) {
    const l = PipView.layoutFor(340, alto, false);
    assert.strictEqual([l.compact, l.expanded, l.overlay].filter(Boolean).length, 1,
      `alto ${alto}`);
  }
});

test("con video pequeño se superponen los controles; sin video, fila compacta", () => {
  const PipView = vista();
  const { HEIGHT_MINI } = PIP_BREAKPOINTS;
  const bajo = HEIGHT_MINI - 1;

  const conVideo = PipView.layoutFor(420, bajo, true);
  assert.strictEqual(conVideo.overlay, true);
  assert.strictEqual(conVideo.compact, false, "con video nunca se pasa a miniatura de 56 px");

  const sinVideo = PipView.layoutFor(420, bajo, false);
  assert.strictEqual(sinVideo.compact, true);
  assert.strictEqual(sinVideo.overlay, false);
});

test("con la ventana holgada el video no se superpone: hay sitio para todo", () => {
  const l = vista().layoutFor(420, 480, true);

  assert.strictEqual(l.overlay, false);
  assert.strictEqual(l.compact, false);
  assert.strictEqual(l.expanded, false, "en modo video la columna la pone .ytmpip-video-mode");
});

/* --------------------------------------------------------------------
 * La letra en grande tambien superpone los mandos
 *
 * EL SINTOMA: "la barra cubre la letra". Mientras el transporte fue una
 * fila mas de la columna, le quitaba alto al panel SIEMPRE, y en una
 * ventana baja lo dejaba en una rendija. Ahora flota encima, como ya
 * flotaba sobre el videoclip.
 *
 * Lo que se prueba aqui es la decision, no como se ve: que la ventana
 * quede bonita se mira en tools/vista-previa.html (?letra=1&escenario=1).
 * -------------------------------------------------------------------- */

test("con la letra en el escenario los mandos flotan, sea cual sea el tamaño", () => {
  const PipView = vista();
  // Justo el punto que distingue este arreglo de un apaño por tamaño: en
  // una ventana holgada el videoclip NO se superpone, y la letra SI.
  for (const [ancho, alto] of [[420, 480], [571, 318], [425, 268], [385, 130]]) {
    const l = PipView.layoutFor(ancho, alto, false, true);
    assert.strictEqual(l.overlay, true, `${ancho}x${alto} tenia que superponer`);
  }
});

test("superponer la letra apaga las otras dos maquetaciones", () => {
  // Sin esto convivirian `.compact` (o `.expanded`) y `.ytmpip-overlay`, y
  // las dos familias de reglas CSS se pisarian: quien ganara dependeria del
  // orden del fichero, que es la peor forma de decidir una maquetacion.
  const PipView = vista();
  for (let alto = 120; alto <= 700; alto += 10) {
    for (const ancho of [200, 340, 560]) {
      const l = PipView.layoutFor(ancho, alto, false, true);
      assert.deepStrictEqual(
        { compact: l.compact, expanded: l.expanded },
        { compact: false, expanded: false },
        `${ancho}x${alto} con la letra en grande`
      );
    }
  }
});

test("sin letra en grande todo queda exactamente como estaba", () => {
  // La red de que el argumento nuevo no cambia ningun caso viejo: los tres
  // valores que significan "no" tienen que dar lo mismo que no pasar nada.
  const PipView = vista();
  for (const hayVideo of [true, false]) {
    for (let alto = 120; alto <= 700; alto += 10) {
      const sinArgumento = PipView.layoutFor(340, alto, hayVideo);
      for (const no of [false, undefined, null]) {
        assert.deepStrictEqual(
          PipView.layoutFor(340, alto, hayVideo, no),
          sinArgumento,
          `alto ${alto}, video=${hayVideo}, letra=${String(no)}`
        );
      }
    }
  }
});

test("el nivel de detalle no cambia por llevar video", () => {
  // Solo la COLOCACION depende del video; que quepa el album o no, no.
  const PipView = vista();
  for (const alto of [200, 305, 350, 420, 600]) {
    const con = PipView.layoutFor(360, alto, true);
    const sin = PipView.layoutFor(360, alto, false);
    assert.deepStrictEqual(
      { mini: con.mini, tight: con.tight, narrow: con.narrow },
      { mini: sin.mini, tight: sin.tight, narrow: sin.narrow },
      `alto ${alto}`
    );
  }
});
