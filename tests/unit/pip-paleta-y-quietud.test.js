/*
 * Pruebas de las DOS cosas nuevas de esta tanda:
 *
 *   1. LA PALETTA PROPIA (src/shared/paleta.js): que color le toca a cada
 *      barra cuando el usuario elige sus colores.
 *   2. LA QUIETUD (src/pip/pip.js): los mandos se desvanecen a los tres
 *      segundos sin tocar nada y vuelven a la minima señal de vida.
 *
 * Van juntas en un archivo porque son una sola tanda de trabajo y el trato
 * es correr solo lo nuevo, no las 337 pruebas de siempre.
 *
 * LO QUE ESTAS PRUEBAS NO DICEN, antes de que nadie las lea como una
 * garantia: no dicen que el degradado se VEA bien ni que los botones se
 * desvanezcan con gracia. jsdom devuelve null en getContext("2d") y no
 * calcula transiciones CSS. Lo que se puede clavar aqui es la REGLA —que
 * color sale de que numero— y el CABLE —que el temporizador se arranque,
 * se reinicie y ponga la clase—. Que se vea bien es cosa de mirar la
 * ventana, y el usuario ya la mira.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

/* ==================================================================
 * 1. La paleta
 * ================================================================== */

function paleta() {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/paleta.js");
  return win.YTMPip;
}

/**
 * Deshace "hsl(h, s%, l%)" en numeros.
 *
 * Se compara en HSL y no en hexadecimal a proposito: la funcion devuelve
 * HSL, y convertir la respuesta a otro espacio para compararla obligaria a
 * escribir aqui una segunda conversion —o sea, la misma regla en dos
 * archivos, que es justo lo que este proyecto lleva evitando—.
 */
function hsl(texto) {
  const m = /^hsl\((-?\d+), (\d+)%, (\d+)%\)$/.exec(texto);
  assert.ok(m, "no parece un color HSL: " + texto);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

test("los extremos de la paleta salen EXACTOS en la primera y la ultima barra", () => {
  const { Paleta } = paleta();
  const colores = ["#ff0000", "#0000ff"];

  /*
   * Esta es la peticion literal: "empezar con un rojo y terminar con un
   * azul". Si los extremos se desvian, el degradado sera bonito y NO sera
   * el que se pidio, que es un fallo mas dificil de ver que uno feo.
   */
  const primera = hsl(Paleta.colorDePaleta(colores, 0, 10));
  assert.strictEqual(primera.h, 0);
  assert.strictEqual(primera.s, 100);
  assert.strictEqual(primera.l, 50);

  const ultima = hsl(Paleta.colorDePaleta(colores, 9, 10));
  assert.strictEqual(ultima.h, 240);
  assert.strictEqual(ultima.s, 100);
  assert.strictEqual(ultima.l, 50);
});

test("la ultima barra NO se sale de la lista de colores", () => {
  /*
   * El fallo que esto vigila es de indice y es silencioso. En la ultima
   * barra la posicion vale justo `colores.length - 1`, y sin el tope de
   * `colores.length - 2` el color de partida seria el ultimo y el de
   * llegada `colores[undefined]`: hexARgb recibiria undefined, parseInt
   * daria NaN y la barra saldria sin pintar. No revienta, no avisa: solo
   * falta una barra en el borde de la ventana.
   */
  const { Paleta } = paleta();
  const colores = ["#ff0000", "#00ff00", "#0000ff"];
  for (let total = 1; total <= 40; total++) {
    for (let i = 0; i < total; i++) {
      const salida = Paleta.colorDePaleta(colores, i, total);
      assert.ok(
        /^(hsl\(|#)/.test(salida) && !/NaN/.test(salida),
        `barra ${i} de ${total} salio "${salida}"`
      );
    }
  }
});

test("en el medio de rojo y verde hay un amarillo limpio, no un barrizal", () => {
  /*
   * Esta prueba es la que defiende la eleccion de HSL frente a RGB. En RGB
   * el punto medio de #ff0000 y #00ff00 es (128,128,0): un verde oliva
   * sucio que no esta en ninguno de los dos extremos. El dia que alguien
   * "simplifique" la interpolacion a RGB, esto cae.
   */
  const { Paleta } = paleta();
  const medio = hsl(Paleta.colorDePaleta(["#ff0000", "#00ff00"], 1, 3));
  assert.strictEqual(medio.h, 60, "el tono del medio deberia ser amarillo");
  assert.strictEqual(medio.s, 100, "el amarillo del medio no puede perder viveza");
  assert.strictEqual(medio.l, 50);
});

test("negro a azul no pasa por morados que nadie eligio", () => {
  /*
   * El caso que se escapa si no se mira. El negro no tiene tono, y su `h`
   * vale 0 por convenio... que resulta ser el rojo. Interpolando a pelo,
   * ese cero de mentira arrastraria el tono desde el rojo y el degradado
   * cruzaria por morados. Con el guardia puesto, el tono es azul de punta
   * a punta y lo unico que se mueve es la luz.
   */
  const { Paleta } = paleta();
  const colores = ["#000000", "#0000ff"];
  const luces = [];
  for (let i = 0; i < 5; i++) {
    const c = hsl(Paleta.colorDePaleta(colores, i, 5));
    assert.strictEqual(c.h, 240, `la barra ${i} se fue de tono`);
    luces.push(c.l);
  }
  // Y la luz sube, que es lo que de verdad separa el negro del azul.
  for (let i = 1; i < luces.length; i++) {
    assert.ok(luces[i] > luces[i - 1], "la luz deberia subir del negro al azul");
  }
});

test("un solo color se devuelve TAL CUAL, sin pasar por HSL", () => {
  /*
   * Ida y vuelta por HSL redondea, y "#abc123" podria volver como
   * "#abc022". Nadie lo notaria en un degradado, pero aqui no hay
   * degradado: hay un color que el usuario eligio y espera ver.
   */
  const { Paleta } = paleta();
  assert.strictEqual(Paleta.colorDePaleta(["#abc123"], 3, 10), "#abc123");
});

test("con una sola barra se pinta el PRIMER color, no el del medio", () => {
  /*
   * Dos cosas a la vez. La primera es la regla: la paleta se lee "empieza
   * en... y acaba en...", asi que con una barra lo que se ve es el
   * principio. La segunda es que `total - 1` vale 0 y dividir por ahi
   * dejaria la posicion en NaN y la barra sin pintar, en silencio.
   */
  const { Paleta } = paleta();
  const solo = hsl(Paleta.colorDePaleta(["#ff0000", "#00ff00", "#0000ff"], 0, 1));
  assert.strictEqual(solo.h, 0);
  assert.strictEqual(solo.s, 100);
  assert.strictEqual(solo.l, 50);
});

test("sin paleta se cae al color sugerido en vez de dejar la barra en blanco", () => {
  const { Paleta, CONSTANTS } = paleta();
  const sugerido = CONSTANTS.SPECTRUM_LIMITS.COLOR_SUGGESTED;
  assert.strictEqual(Paleta.colorDePaleta([], 0, 10), sugerido);
  assert.strictEqual(Paleta.colorDePaleta(null, 0, 10), sugerido);
});

test("los colores intermedios caen donde les toca, repartidos a lo ancho", () => {
  /*
   * Con tres colores y cinco barras, la del centro es EXACTAMENTE el color
   * de en medio: es lo que significa "repartidos por igual". Sin esto, un
   * reparto torcido pasaria por bueno mientras los extremos acertaran.
   */
  const { Paleta } = paleta();
  const centro = hsl(Paleta.colorDePaleta(["#ff0000", "#00ff00", "#0000ff"], 2, 5));
  assert.strictEqual(centro.h, 120, "la barra central deberia ser el verde exacto");
  assert.strictEqual(centro.s, 100);
  assert.strictEqual(centro.l, 50);
});

test("la paleta guardada y la paleta pintada son la misma lista", () => {
  /*
   * El puente entre los dos modulos. settings.js guarda la paleta como
   * texto con comas dentro de la MISMA clave que el color suelto, y
   * pip.js la vuelve a partir en cada fotograma con normalizarPaleta. Si
   * una de las dos mitades cambia de formato, el espectro se quedaria con
   * el color del tema sin que nada avisara.
   */
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
  const { unirColor, partirColor, normalizarPaleta } = win.YTMPip.Settings;

  const elegidos = ["#ff0000", "#00ff00", "#0000ff"];
  const guardado = unirColor("palette", "#123456", elegidos);

  /*
   * El `[...]` no es adorno. Las listas vienen de DENTRO de la ventana de
   * jsdom, o sea de otro realm, y su prototipo es el Array de alla:
   * deepStrictEqual compara tambien el prototipo y las rechaza aunque
   * tengan exactamente el mismo contenido. Copiarlas aqui las trae a este
   * lado y deja que la comparacion hable de los colores, que es de lo que
   * va la prueba.
   */
  assert.deepStrictEqual([...normalizarPaleta(guardado)], elegidos);
  const partido = partirColor(guardado);
  assert.strictEqual(partido.modo, "palette");
  assert.deepStrictEqual([...partido.paleta], elegidos);
});

/* ==================================================================
 * 2. La quietud: los mandos que se esconden solos
 * ================================================================== */

/*
 * Los tres segundos que pidio el usuario. Se escriben aqui como numero y
 * no se leen del codigo A PROPOSITO: si se importaran de pip.js, cambiar
 * la espera a treinta segundos cambiaria tambien la prueba y esta seguiria
 * pasando tan contenta. Este numero es la peticion, no el codigo.
 */
const ESPERA_PEDIDA_MS = 3000;

/**
 * Monta la ventana con el reloj intervenido.
 *
 * setTimeout se sustituye ANTES de montar porque `cablearQuietud` arranca
 * el temporizador durante el propio montaje: con el reloj de verdad habria
 * que dormir tres segundos por prueba, y una prueba que duerme acaba
 * borrandose.
 */
function ventana() {
  const { win } = crearEntorno(undefined);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const citas = new Map();
  const cancelados = [];
  let siguiente = 1;
  win.setTimeout = (fn, ms) => {
    const id = siguiente++;
    citas.set(id, { fn, ms });
    return id;
  };
  win.clearTimeout = (id) => {
    cancelados.push(id);
    citas.delete(id);
  };

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  const root = doc.getElementById("ytmpip-root");
  const CLASE = win.YTMPip.PipView.__bancoDePruebas.claseQuieto;

  return {
    win,
    doc,
    root,
    cancelados,
    quieto: () => root.classList.contains(CLASE),
    /** Las citas pendientes que son de la quietud, por su espera. */
    pendientes: () => [...citas.values()].filter((c) => c.ms === ESPERA_PEDIDA_MS),
    /** Deja que pasen los tres segundos sin que pase el tiempo de verdad. */
    correrElReloj() {
      for (const [id, cita] of [...citas]) {
        if (cita.ms !== ESPERA_PEDIDA_MS) continue;
        citas.delete(id);
        cita.fn();
      }
    },
    senal(tipo, opciones = {}) {
      doc.dispatchEvent(new win.Event(tipo, Object.assign({ bubbles: true }, opciones)));
    }
  };
}

test("la ventana nace DESPIERTA, no escondida", () => {
  /*
   * Abrir la ventana flotante es usarla. Si naciera con la clase puesta,
   * lo primero que veria el usuario seria una ventana con los botones
   * medio borrados y tendria que moverla para descubrir que estan.
   */
  const v = ventana();
  assert.strictEqual(v.quieto(), false);
});

test("a los tres segundos sin tocar nada, los mandos se apagan", () => {
  const v = ventana();
  assert.strictEqual(v.pendientes().length, 1, "el temporizador tiene que arrancar solo");
  v.correrElReloj();
  assert.strictEqual(v.quieto(), true);
});

test("mover el raton los devuelve, y vuelve a contar desde cero", () => {
  const v = ventana();
  v.correrElReloj();
  assert.strictEqual(v.quieto(), true);

  v.senal("pointermove");
  assert.strictEqual(v.quieto(), false, "moverse tiene que devolver los mandos");
  assert.strictEqual(v.pendientes().length, 1, "y volver a poner el reloj en marcha");
});

test("el TECLADO tambien cuenta como señal de vida", () => {
  /*
   * Dicho por el usuario con estas palabras: "seria absurdo que subieras
   * el volumen y no vieras moverse el control". Los atajos de teclado
   * mueven controles que estan en pantalla, asi que una tecla tiene que
   * despertar la ventana igual que el raton.
   */
  const v = ventana();
  v.correrElReloj();
  assert.strictEqual(v.quieto(), true);

  v.senal("keydown");
  assert.strictEqual(v.quieto(), false);
});

test("la señal de vida se escucha en CAPTURA, para que los atajos cuenten", () => {
  /*
   * Esta es la sutileza que costaria encontrar a mano. Los atajos de
   * teclado de la ventana llaman a preventDefault y a stopPropagation: un
   * oyente registrado en la fase de burbuja NO llegaria a enterarse, y
   * entonces usar la ventana solo con el teclado la iria apagando
   * mientras se usa.
   *
   * Se reproduce cortando el evento en el primer elemento que lo toca.
   */
  const v = ventana();
  v.correrElReloj();
  assert.strictEqual(v.quieto(), true);

  v.doc.body.addEventListener("keydown", (e) => e.stopPropagation(), true);
  const evento = new v.win.KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true });
  v.doc.body.dispatchEvent(evento);

  assert.strictEqual(v.quieto(), false, "un atajo que corta el evento sigue siendo actividad");
});

test("moverse sin parar no acumula temporizadores", () => {
  /*
   * El fallo que esto vigila no se ve, se nota: sin cancelar el anterior,
   * cada pixel de raton dejaria una cita viva y al rato habria cientos
   * compitiendo por apagar la ventana. La primera en vencer la apagaria
   * aunque el raton siguiera moviendose.
   */
  const v = ventana();
  for (let i = 0; i < 20; i++) v.senal("pointermove");
  assert.strictEqual(v.pendientes().length, 1, "solo puede haber una cita pendiente");
  assert.ok(v.cancelados.length >= 20, "cada movimiento tiene que cancelar la cita anterior");
});
