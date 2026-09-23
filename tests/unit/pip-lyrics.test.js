/*
 * Pruebas de la decision "¿que linea de la letra esta sonando AHORA?".
 *
 * Es la unica pieza de la letra sincronizada que se puede probar sin una
 * ventana flotante real, y por eso es una funcion pura expuesta en
 * PipView, igual que timelineFor. El resalte, el autodesplazamiento y el
 * salto con clic parten todos del indice que devuelve esto: si se
 * equivoca, la letra entera va a destiempo.
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

// La letra del fixture de Better Lyrics, con sus tiempos reales.
const LINEAS = [
  { text: "Walking down the street tonight", time: 12.4 },
  { text: "I've come to share bad intentions", time: 15.6 },
  { text: "♪", time: 18.4 },
  { text: "I don't know what's wrong or right", time: 27.4 }
];

test("antes de la primera linea no suena ninguna", () => {
  const PipView = vista();
  assert.strictEqual(PipView.activeLyricAt(LINEAS, 0), -1);
  assert.strictEqual(PipView.activeLyricAt(LINEAS, 12.39), -1, "un pelo antes de empezar sigue sin sonar");
});

test("el instante exacto de inicio ya cuenta como sonando", () => {
  // Si esto fuese `<` en vez de `<=`, cada linea se resaltaria un tick
  // tarde: justo cuando el cantante ya va por la siguiente palabra.
  assert.strictEqual(vista().activeLyricAt(LINEAS, 12.4), 0);
});

test("entre dos lineas suena la que ya empezo, no la que viene", () => {
  const PipView = vista();
  assert.strictEqual(PipView.activeLyricAt(LINEAS, 14.0), 0);
  assert.strictEqual(PipView.activeLyricAt(LINEAS, 20.0), 2, "el interludio tambien es una linea activa");
});

test("despues de la ultima linea se queda la ultima", () => {
  // La cancion sigue sonando tras el ultimo verso; apagar el resalte
  // diria "aqui no se canta nada", que es falso hasta que acabe.
  assert.strictEqual(vista().activeLyricAt(LINEAS, 500), 3);
});

test("una letra sin tiempos nunca tiene linea activa", () => {
  /*
   * LA trampa de JavaScript que motiva el Number.isFinite de dentro:
   * null <= 30 es true (null se convierte en 0). Sin el filtro, una letra
   * nativa entera "empezaria" en el segundo 0 y el resalte bailaria por
   * lineas que no tienen ningun momento asignado.
   */
  const PipView = vista();
  const sinTiempos = [
    { text: "Is this the real life?", time: null },
    { text: "Is this just fantasy?", time: null }
  ];
  for (const t of [0, 1, 60, 1e6]) {
    assert.strictEqual(PipView.activeLyricAt(sinTiempos, t), -1, `t=${t}: se activo una linea sin tiempo`);
  }
});

test("las lineas sin tiempo se saltan, no rompen a las demas", () => {
  const PipView = vista();
  const mixtas = [
    { text: "separador", time: null },
    { text: "primera", time: 5 },
    { text: "segunda", time: 10 }
  ];
  assert.strictEqual(PipView.activeLyricAt(mixtas, 7), 1);
  assert.strictEqual(PipView.activeLyricAt(mixtas, 11), 2);
});

test("no se asume orden: gana la de MAYOR tiempo ya empezado", () => {
  // El DOM de Better Lyrics viene ordenado, pero la funcion no debe
  // depender de ello: con lineas desordenadas, "la ultima del recorrido
  // que ya empezo" y "la que suena" dejan de ser la misma.
  const desordenadas = [
    { text: "tercera", time: 30 },
    { text: "primera", time: 10 },
    { text: "segunda", time: 20 }
  ];
  assert.strictEqual(vista().activeLyricAt(desordenadas, 25), 2);
  assert.strictEqual(vista().activeLyricAt(desordenadas, 35), 0);
});

test("entradas basura: -1, nunca una excepcion", () => {
  const PipView = vista();
  assert.strictEqual(PipView.activeLyricAt(undefined, 10), -1);
  assert.strictEqual(PipView.activeLyricAt(null, 10), -1);
  assert.strictEqual(PipView.activeLyricAt([], 10), -1);
  assert.strictEqual(PipView.activeLyricAt(LINEAS, NaN), -1, "un tiempo NaN no puede activar nada");
  assert.strictEqual(PipView.activeLyricAt([null, undefined, {}], 10), -1, "lineas basura se ignoran");
});
