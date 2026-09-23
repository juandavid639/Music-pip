/*
 * Pruebas de los ATAJOS DE TECLADO de la ventana flotante.
 *
 * Son dos cosas distintas y las dos se prueban aqui:
 *
 *  - LA REGLA (atajoPara): que tecla significa que, y sobre todo cuando NO
 *    significa nada. La mitad de esta funcion existe para DEVOLVER teclas
 *    que ya tenian dueño —el navegador, un campo de texto, un deslizador—,
 *    y esa mitad es la que se rompe sin que nadie se entere: un atajo que
 *    no funciona se nota en dos segundos, pero una "m" que ya no se puede
 *    escribir en un buscador se nota semanas despues.
 *
 *  - EL CABLE: que pulsar la tecla acabe mandando la MISMA orden que
 *    pulsar el boton. La razon de que las acciones sean funciones con
 *    nombre compartidas es justo esta, y sin prueba seria una intencion.
 *
 * NO se prueba que la ventana flotante reciba el foco al hacerle clic: eso
 * es del navegador y jsdom no lo simula.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

function ventana(opciones) {
  const { win } = crearEntorno(undefined, opciones);
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

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  // montar() cablea botones y teclas exactamente como al abrir la ventana:
  // la prueba que los compara no valdria nada si los cablease ella.
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);

  /*
   * Se intercepta el ejecutor de ordenes, que es la frontera real: todo lo
   * que la ventana quiere que pase acaba pasando por aqui. Espiar mas
   * adentro (el <video>) probaria el reproductor, no los atajos.
   */
  const ordenes = [];
  win.YTMPip.PlayerController.execute = (comando) => ordenes.push(comando);

  return { win, doc, ordenes, PipView: win.YTMPip.PipView };
}

/** Dispara una tecla de verdad sobre el documento de la ventana. */
function pulsar(v, key, extra = {}) {
  const destino = extra.sobre || v.doc.body;
  const evento = new v.win.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: Boolean(extra.ctrl),
    altKey: Boolean(extra.alt),
    metaKey: Boolean(extra.meta),
    repeat: Boolean(extra.repetida)
  });
  destino.dispatchEvent(evento);
  return evento;
}

const SIN_FOCO = { etiqueta: "body", tipo: "", rol: "", editable: false };

/* ------------------------------------------------------------------
 * La regla: que hace cada tecla
 * ------------------------------------------------------------------ */

test("las teclas de siempre hacen lo de siempre", () => {
  /*
   * Son las de YouTube a proposito: k pausa, j y l saltan, m silencia. No
   * es una lista mia, es la que el usuario ya se sabe.
   */
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: " " }, SIN_FOCO), "reproduccion");
  assert.strictEqual(a({ key: "k" }, SIN_FOCO), "reproduccion");
  assert.strictEqual(a({ key: "l" }, SIN_FOCO), "adelantar");
  assert.strictEqual(a({ key: "ArrowRight" }, SIN_FOCO), "adelantar");
  assert.strictEqual(a({ key: "j" }, SIN_FOCO), "retroceder");
  assert.strictEqual(a({ key: "ArrowLeft" }, SIN_FOCO), "retroceder");
  assert.strictEqual(a({ key: "ArrowUp" }, SIN_FOCO), "subirVolumen");
  assert.strictEqual(a({ key: "ArrowDown" }, SIN_FOCO), "bajarVolumen");
  assert.strictEqual(a({ key: "n" }, SIN_FOCO), "siguiente");
  assert.strictEqual(a({ key: "p" }, SIN_FOCO), "anterior");
  assert.strictEqual(a({ key: "m" }, SIN_FOCO), "silenciar");
});

test("con mayusculas hace lo mismo, y con Bloq Mayus tambien", () => {
  // Nadie apunta el Bloq Mayus para pausar una cancion.
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: "K" }, SIN_FOCO), "reproduccion");
  assert.strictEqual(a({ key: "M" }, SIN_FOCO), "silenciar");
});

test("una tecla que no es de nadie no hace nada", () => {
  const a = ventana().PipView.atajoPara;

  for (const tecla of ["a", "z", "F5", "Escape", "Tab", "Enter", "Home", "PageUp", "1"]) {
    assert.strictEqual(a({ key: tecla }, SIN_FOCO), null, `la tecla ${tecla} hizo algo`);
  }
});

test("sin tecla no hay atajo", () => {
  // Un evento sintetico raro no deberia poder colar `undefined` en el mapa.
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: "" }, SIN_FOCO), null);
  assert.strictEqual(a({}, SIN_FOCO), null);
  assert.strictEqual(a(null, SIN_FOCO), null);
});

test("sin saber que hay enfocado, la tecla sigue valiendo", () => {
  // focoDe() nunca devuelve null, pero la funcion no puede depender de eso:
  // es publica y es pura, y quedarse sin atajos por un dato que falta seria
  // el peor de los dos fallos posibles.
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: "k" }, null), "reproduccion");
  assert.strictEqual(a({ key: "k" }, undefined), "reproduccion");
});

/* ------------------------------------------------------------------
 * La otra mitad: teclas que ya tenian dueño
 * ------------------------------------------------------------------ */

test("con Ctrl, Alt o Cmd la combinacion es del navegador", () => {
  /*
   * Ctrl+P imprime. Si el atajo se quedara con la "p" pasaria la cancion
   * ADEMAS de abrir el dialogo de impresion, que es la peor de las dos
   * respuestas posibles.
   */
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: "p", ctrl: true }, SIN_FOCO), null);
  assert.strictEqual(a({ key: "ArrowLeft", alt: true }, SIN_FOCO), null);
  assert.strictEqual(a({ key: "k", meta: true }, SIN_FOCO), null);
});

test("en un campo de texto no hay atajos: se escribe", () => {
  const a = ventana().PipView.atajoPara;
  const campos = [
    { etiqueta: "input", tipo: "text" },
    { etiqueta: "input", tipo: "search" },
    { etiqueta: "input", tipo: "email" },
    { etiqueta: "input", tipo: "password" },
    { etiqueta: "input", tipo: "number" },
    // Sin `type` el navegador entiende "text": es el caso mas comun de
    // todos y el que mas facil seria dejarse fuera.
    { etiqueta: "input", tipo: "" },
    { etiqueta: "textarea", tipo: "" },
    { etiqueta: "div", tipo: "", editable: true }
  ];

  for (const foco of campos) {
    assert.strictEqual(a({ key: "m" }, foco), null, `${foco.etiqueta}/${foco.tipo} se comio la eme`);
    assert.strictEqual(a({ key: " " }, foco), null, `${foco.etiqueta}/${foco.tipo} se comio el espacio`);
  }
});

test("una casilla o un boton no son un campo de texto", () => {
  // El otro lado de la prueba anterior: la lista de tipos esta escrita por
  // lo que NO escribe letras, y si se vaciara, los atajos moririan en
  // silencio sin que ninguna otra prueba lo notara.
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: "m" }, { etiqueta: "input", tipo: "checkbox" }), "silenciar");
  assert.strictEqual(a({ key: "m" }, { etiqueta: "input", tipo: "radio" }), "silenciar");
  assert.strictEqual(a({ key: "m" }, { etiqueta: "input", tipo: "range" }), "silenciar");
});

test("un deslizador enfocado se queda con las flechas", () => {
  /*
   * EL CASO QUE IMPORTA: la barra de tiempo y la de volumen se mueven con
   * las flechas y son la unica forma de usarlas con teclado. Robarselas
   * para el volumen dejaria la barra de tiempo inservible.
   */
  const a = ventana().PipView.atajoPara;
  const deslizador = { etiqueta: "input", tipo: "range" };

  assert.strictEqual(a({ key: "ArrowLeft" }, deslizador), null);
  assert.strictEqual(a({ key: "ArrowRight" }, deslizador), null);
  assert.strictEqual(a({ key: "ArrowUp" }, deslizador), null);
  assert.strictEqual(a({ key: "ArrowDown" }, deslizador), null);
  // Pero solo las flechas: la "l" no la reclama nadie mas.
  assert.strictEqual(a({ key: "l" }, deslizador), "adelantar");
});

test("un boton enfocado se queda con la barra espaciadora", () => {
  /*
   * Tabular hasta "siguiente cancion" y pulsar espacio tiene que cambiar
   * de cancion. Si el atajo se lo quedara, el foco estaria prometiendo una
   * cosa y la tecla haria otra.
   */
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: " " }, { etiqueta: "button", tipo: "button" }), null);
  // Y la barra sigue siendo suya aunque el atajo si atienda otras teclas.
  assert.strictEqual(a({ key: "k" }, { etiqueta: "button", tipo: "button" }), "reproduccion");
});

test("las lineas de la letra son botones aunque no sean <button>", () => {
  /*
   * Se pintan como <div role="button" tabindex="0"> y responden a la barra
   * espaciadora saltando a su segundo. Mirar solo la etiqueta habria hecho
   * que pulsar espacio sobre una linea saltara A ELLA y ademas pausara.
   */
  const a = ventana().PipView.atajoPara;

  assert.strictEqual(a({ key: " " }, { etiqueta: "div", rol: "button" }), null);
});

test("mantener pulsada la tecla solo repite lo que se puede deshacer", () => {
  /*
   * Dejar el dedo en la flecha para subir el volumen es lo normal. Dejarlo
   * en la "n" salta treinta canciones y la cola ya no vuelve a estar donde
   * estaba.
   */
  const a = ventana().PipView.atajoPara;
  const mantenida = (key) => a({ key, repetida: true }, SIN_FOCO);

  assert.strictEqual(mantenida("ArrowUp"), "subirVolumen");
  assert.strictEqual(mantenida("ArrowDown"), "bajarVolumen");
  assert.strictEqual(mantenida("l"), "adelantar");
  assert.strictEqual(mantenida("j"), "retroceder");

  assert.strictEqual(mantenida("n"), null, "mantener la n salto canciones en cadena");
  assert.strictEqual(mantenida("p"), null);
  assert.strictEqual(mantenida(" "), null, "mantener el espacio dio treinta pausas");
  assert.strictEqual(mantenida("m"), null);
});

/* ------------------------------------------------------------------
 * EL CABLE: la tecla y el boton mandan lo mismo
 * ------------------------------------------------------------------ */

test("EL CASO PEDIDO: el espacio pausa y vuelve a poner", () => {
  /*
   * TOGGLE_PLAY, y ya no un PLAY/PAUSE calculado en la ventana. El
   * calculo era una SEGUNDA COPIA de la decision que el controlador
   * toma delante del <video> ("el comando de quien no sabe si suena",
   * dicen sus pruebas), y en Spotify la copia mentia: sin medio en el
   * DOM elegia PLAY siempre, sonara o no. El boton de la ventana ES un
   * alternador: pide alternar y quien sabe decide.
   */
  const v = ventana();

  pulsar(v, " ");

  assert.strictEqual(v.ordenes.length, 1, "el espacio no mando ninguna orden");
  assert.strictEqual(v.ordenes[0].type, "TOGGLE_PLAY");

  // El mismo cable que este archivo ya vigila para n/p/l/j/m: la tecla
  // y el boton mandan exactamente lo mismo.
  v.ordenes.length = 0;
  v.doc
    .getElementById("ytmpip-play-pause")
    .dispatchEvent(new v.win.MouseEvent("click", { bubbles: true }));
  assert.deepStrictEqual(
    v.ordenes.map((o) => o.type),
    ["TOGGLE_PLAY"],
    "el boton de play/pause no manda lo mismo que el espacio"
  );
});

test("la tecla manda exactamente la misma orden que el boton", () => {
  /*
   * Esta es la prueba que justifica que las acciones sean funciones con
   * nombre. Si algun dia el atajo se reescribiera por su cuenta, las dos
   * listas dejarian de coincidir aqui.
   */
  const v = ventana();
  const parejas = [
    ["n", "ytmpip-next"],
    ["p", "ytmpip-previous"],
    ["l", "ytmpip-seek-forward"],
    ["j", "ytmpip-seek-backward"],
    ["m", "ytmpip-mute"]
  ];

  for (const [tecla, id] of parejas) {
    v.ordenes.length = 0;
    pulsar(v, tecla);
    const porTecla = v.ordenes.map((o) => o.type);

    v.ordenes.length = 0;
    v.doc.getElementById(id).dispatchEvent(new v.win.MouseEvent("click", { bubbles: true }));
    const porBoton = v.ordenes.map((o) => o.type);

    assert.deepStrictEqual(porTecla, porBoton, `la tecla ${tecla} y el boton ${id} no coinciden`);
    assert.strictEqual(porTecla.length, 1, `la tecla ${tecla} no mando nada`);
  }
});

test("adelantar con el teclado usa los segundos de las preferencias", async () => {
  // Y los lee en el momento, no al abrir la ventana: cambiar el numero en
  // opciones tiene que notarse sin reabrir nada.
  const v = ventana({ storage: { seekSeconds: 45 } });
  await v.win.YTMPip.Settings.load();

  pulsar(v, "l");

  assert.strictEqual(v.ordenes[0].type, "SEEK_FORWARD");
  assert.strictEqual(v.ordenes[0].seconds, 45);
});

test("las flechas mueven el volumen de cinco en cinco y mueven el control", () => {
  const v = ventana();
  const control = v.doc.getElementById("ytmpip-volume");
  control.value = 50;

  pulsar(v, "ArrowUp");

  assert.strictEqual(v.ordenes[0].type, "SET_VOLUME");
  assert.strictEqual(v.ordenes[0].level, 0.55);
  assert.strictEqual(
    Number(control.value),
    55,
    "la musica subio pero el deslizador se quedo donde estaba"
  );

  pulsar(v, "ArrowDown");
  assert.strictEqual(Number(control.value), 50);
});

test("el volumen no se sale del cero ni del cien", () => {
  const v = ventana();
  const control = v.doc.getElementById("ytmpip-volume");

  control.value = 98;
  pulsar(v, "ArrowUp");
  assert.strictEqual(Number(control.value), 100);
  assert.strictEqual(v.ordenes.pop().level, 1);

  control.value = 2;
  pulsar(v, "ArrowDown");
  assert.strictEqual(Number(control.value), 0);
  assert.strictEqual(v.ordenes.pop().level, 0);
});

test("arrastrar el deslizador manda lo mismo que las flechas", () => {
  // La regla del volumen esta escrita una sola vez (mandarVolumen); esto
  // lo clava, porque son dos caminos que llegan al mismo sitio.
  const v = ventana();
  const control = v.doc.getElementById("ytmpip-volume");

  control.value = 55;
  control.dispatchEvent(new v.win.Event("input", { bubbles: true }));

  assert.strictEqual(v.ordenes.length, 1);
  assert.strictEqual(v.ordenes[0].type, "SET_VOLUME");
  assert.strictEqual(v.ordenes[0].level, 0.55);
});

test("escribir en un campo de texto de la ventana no manda ninguna orden", () => {
  /*
   * Hoy la ventana flotante no tiene ningun campo de texto, asi que esta
   * prueba protege el futuro: el dia que se añada un buscador de letras,
   * teclear "musica" no puede pausar, silenciar y saltar de cancion.
   */
  const v = ventana();
  const campo = v.doc.createElement("input");
  campo.type = "text";
  v.doc.body.appendChild(campo);

  for (const tecla of ["m", "k", "n", "p", " "]) {
    pulsar(v, tecla, { sobre: campo });
  }

  assert.deepStrictEqual(v.ordenes, [], "la ventana obedecio a lo que se estaba escribiendo");
});

test("el atajo corta el evento; una tecla ajena lo deja pasar", () => {
  /*
   * preventDefault importa de verdad: sin el, el espacio pausa Y ademas
   * hace scroll de la ventana. Y aplicado de mas romperia el tabulador.
   */
  const v = ventana();

  assert.strictEqual(pulsar(v, "k").defaultPrevented, true);
  assert.strictEqual(pulsar(v, "Tab").defaultPrevented, false);
  assert.strictEqual(pulsar(v, "p", { ctrl: true }).defaultPrevented, false);
});
