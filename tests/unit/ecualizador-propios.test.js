/*
 * LOS AJUSTES PROPIOS DEL ECUALIZADOR (tanda AS).
 *
 * Pedido por el autor de la lista de mejoras: «presets de ecualizador
 * propios». La decision de diseño que se fija aqui: un ajuste propio NO es
 * un formato nuevo de ecualizador. Es un nombre y cinco numeros; usarlo
 * escribe esos numeros en la clave de siempre (como «A mi gusto»), y el
 * nombre solo sirve para NOMBRAR lo que suena cuando coincide. Asi el grafo
 * de audio, la memoria por cancion y el interruptor no cambian ni una linea.
 *
 * Tres bloques: las funciones puras (que entra y que no), el boton de la
 * ventana (que dice el nombre) y Preferencias (guardar, usar, borrar).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { crearEntorno, cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const CATALOGO = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/es/messages.json"), "utf8"));

/* ------------------------------------------------------------------
 * 1. Las funciones puras
 * ------------------------------------------------------------------ */

function modulo() {
  const { win } = crearEntorno();
  cargar(win, "src/shared/constants.js", "src/shared/ecualizador.js");
  return win.YTMPip;
}

const plano = (x) => JSON.parse(JSON.stringify(x));

test("normalizarPropios: se queda con lo valido, acota lo exagerado y tira el resto", () => {
  const { Ecualizador: E } = modulo();
  const lista = plano(
    E.normalizarPropios([
      { nombre: "Coche", valor: "6,3,0,-2,0" },
      { nombre: "", valor: "1,1,1,1,1" },
      { nombre: "Sin numeros", valor: "graves" },
      { nombre: "Cuatro", valor: "1,2,3,4" },
      { nombre: "Fuera de rango", valor: "99,0,0,0,0" },
      null,
      "texto suelto",
      { nombre: 5, valor: "1,1,1,1,1" }
    ])
  );
  // Fuera de rango se ACOTA, no se tira: la misma regla que el ecualizador
  // de siempre (unaGanancia). Dos reglas para la misma ganancia serian dos
  // verdades sobre que suena.
  assert.deepStrictEqual(lista, [
    { nombre: "Coche", valor: "6,3,0,-2,0" },
    { nombre: "Fuera de rango", valor: "12,0,0,0,0" }
  ]);
});

test("normalizarPropios: lo que no es una lista es una lista vacia", () => {
  const { Ecualizador: E } = modulo();
  for (const raro of [undefined, null, "Coche", 5, {}]) {
    assert.deepStrictEqual(plano(E.normalizarPropios(raro)), []);
  }
});

test("normalizarPropios: el nombre se recorta y se corta a 24 letras", () => {
  const { Ecualizador: E, CONSTANTS } = modulo();
  const largo = "Un nombre larguisimo que no cabe en el boton";
  const [uno] = plano(E.normalizarPropios([{ nombre: "  " + largo + "  ", valor: "0,0,0,0,1" }]));
  assert.strictEqual(uno.nombre.length <= CONSTANTS.EQUALIZER_CUSTOM_LIMITS.NOMBRE_MAX, true);
  assert.strictEqual(uno.nombre, largo.slice(0, CONSTANTS.EQUALIZER_CUSTOM_LIMITS.NOMBRE_MAX).trim());
});

test("normalizarPropios: el mismo nombre otra vez SOBRESCRIBE y pasa al final", () => {
  const { Ecualizador: E } = modulo();
  const lista = plano(
    E.normalizarPropios([
      { nombre: "Coche", valor: "6,3,0,-2,0" },
      { nombre: "Podcast", valor: "-3,0,4,2,0" },
      { nombre: "Coche", valor: "4,2,0,0,0" }
    ])
  );
  assert.deepStrictEqual(lista, [
    { nombre: "Podcast", valor: "-3,0,4,2,0" },
    { nombre: "Coche", valor: "4,2,0,0,0" }
  ]);
});

test("normalizarPropios: como mucho MAX, y se quedan los mas recientes", () => {
  const { Ecualizador: E, CONSTANTS } = modulo();
  const MAX = CONSTANTS.EQUALIZER_CUSTOM_LIMITS.MAX;
  const muchos = Array.from({ length: MAX + 3 }, (_, i) => ({ nombre: "A" + i, valor: "0,0,0,0," + (i % 12) }));
  const lista = plano(E.normalizarPropios(muchos));
  assert.strictEqual(lista.length, MAX);
  assert.strictEqual(lista[0].nombre, "A3");
  assert.strictEqual(lista[MAX - 1].nombre, "A" + (MAX + 2));
});

test("propioDe: nombra los numeros que coinciden, y nada mas", () => {
  const { Ecualizador: E } = modulo();
  const lista = [{ nombre: "Coche", valor: "6,3,0,-2,0" }];
  assert.strictEqual(E.propioDe("6,3,0,-2,0", lista), "Coche");
  assert.strictEqual(E.propioDe(" 6, 3,0,-2 ,0", lista), "Coche", "los numeros se comparan normalizados");
  assert.strictEqual(E.propioDe("6,3,0,-2,1", lista), null);
  assert.strictEqual(E.propioDe("off", lista), null);
  assert.strictEqual(E.propioDe("graves", [{ nombre: "Graves mios", valor: "graves" }]), null, "un preset no es un ajuste propio");
});

/* ------------------------------------------------------------------
 * 2. El boton del ecualizador de la ventana
 * ------------------------------------------------------------------ */

async function ventana(guardado) {
  const { win } = crearEntorno(undefined, { storage: guardado });
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
  await win.YTMPip.Settings.load();
  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);
  banco.aplicarPreferencias(win.YTMPip.Settings.get());
  return doc.getElementById("ytmpip-eq").getAttribute("aria-label");
}

test("la ventana dice el NOMBRE del ajuste propio que suena", async () => {
  const etiqueta = await ventana({
    equalizer: "6,3,0,-2,0",
    equalizerCustom: [{ nombre: "Coche", valor: "6,3,0,-2,0" }]
  });
  assert.match(etiqueta, /Coche/);
});

test("si los numeros no coinciden con ninguno, sigue diciendo «ajuste propio»", async () => {
  const etiqueta = await ventana({
    equalizer: "6,3,0,-2,1",
    equalizerCustom: [{ nombre: "Coche", valor: "6,3,0,-2,0" }]
  });
  assert.doesNotMatch(etiqueta, /Coche/);
  assert.ok(etiqueta.includes(CATALOGO.eq_ajuste_propio.message), etiqueta);
});

/* ------------------------------------------------------------------
 * 3. Preferencias
 * ------------------------------------------------------------------ */

function preferencias(guardado = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8"), {
    runScripts: "outside-only"
  });
  const win = dom.window;
  win.self = win;
  win.console.warn = () => {};
  win.fetch = () => Promise.reject(new Error("sin red en las pruebas"));
  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  win.chrome = {
    i18n: i18nFalso({}),
    runtime: { getURL: (p) => "chrome-extension://id-de-prueba/" + p },
    storage: {
      local: {
        get(_claves, cb) {
          cb(JSON.parse(JSON.stringify(almacen)));
        },
        set(valores, cb) {
          const cambios = {};
          for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
          Object.assign(almacen, JSON.parse(JSON.stringify(valores)));
          oyentes.forEach((fn) => fn(cambios, "local"));
          if (cb) cb();
        }
      },
      onChanged: { addListener: (fn) => oyentes.push(fn) }
    }
  };
  const lienzo = win.document.getElementById("spectrumPalettePreview");
  if (lienzo) lienzo.getContext = () => null;
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/shared/color-fuente.js",
    "src/options/options.js"
  );
  const $ = (id) => win.document.getElementById(id);
  return {
    win,
    $,
    almacen,
    filas: () => [...$("listaPropios").querySelectorAll("li")],
    escribirNombre(texto) {
      $("nombrePropio").value = texto;
      $("nombrePropio").dispatchEvent(new win.Event("input"));
    }
  };
}

test("con el ecualizador apagado no se puede guardar nada", () => {
  const p = preferencias({ equalizer: "off" });
  p.escribirNombre("Coche");
  assert.strictEqual(p.$("guardarPropio").disabled, true);
});

test("sin nombre tampoco", () => {
  const p = preferencias({ equalizer: "graves" });
  p.escribirNombre("   ");
  assert.strictEqual(p.$("guardarPropio").disabled, true);
});

test("guardar escribe el nombre con los NUMEROS que suenan (tambien los de un preset)", () => {
  const p = preferencias({ equalizer: "graves" });
  const numeros = p.win.YTMPip.Ecualizador.ganancias("graves").join(",");
  p.escribirNombre("Coche");
  p.$("guardarPropio").click();
  assert.deepStrictEqual(p.almacen.equalizerCustom, [{ nombre: "Coche", valor: numeros }]);
  assert.strictEqual(p.$("nombrePropio").value, "", "el campo se vacia al guardar");
  assert.strictEqual(p.filas().length, 1);
  assert.strictEqual(p.$("propiosVacio").hidden, true);
});

test("usar uno escribe sus numeros en el ecualizador y queda marcado", () => {
  const p = preferencias({
    equalizer: "off",
    equalizerCustom: [{ nombre: "Coche", valor: "6,3,0,-2,0" }]
  });
  const [fila] = p.filas();
  const usar = fila.querySelector("button");
  assert.strictEqual(usar.getAttribute("aria-pressed"), "false");
  usar.click();
  assert.strictEqual(p.almacen.equalizer, "6,3,0,-2,0");
  assert.strictEqual(p.filas()[0].querySelector("button").getAttribute("aria-pressed"), "true", "la pagina no se repinto");
});

test("borrar lo quita de la lista y de storage", () => {
  const p = preferencias({
    equalizerCustom: [
      { nombre: "Coche", valor: "6,3,0,-2,0" },
      { nombre: "Podcast", valor: "-3,0,4,2,0" }
    ]
  });
  const borrar = p.filas()[0].querySelector(".ytmpip-borrar");
  assert.match(borrar.getAttribute("aria-label"), /Coche/, "el boton dice QUE borra");
  borrar.click();
  assert.deepStrictEqual(p.almacen.equalizerCustom, [{ nombre: "Podcast", valor: "-3,0,4,2,0" }]);
  assert.strictEqual(p.filas().length, 1);
});

test("con la lista llena solo se puede sobrescribir uno que ya existe", () => {
  const MAX = 8;
  const llena = Array.from({ length: MAX }, (_, i) => ({ nombre: "A" + i, valor: "0,0,0,0," + i }));
  const p = preferencias({ equalizer: "graves", equalizerCustom: llena });
  assert.strictEqual(p.$("propiosLleno").hidden, false, "no avisa de que esta llena");
  p.escribirNombre("Nuevo");
  assert.strictEqual(p.$("guardarPropio").disabled, true);
  p.escribirNombre("A3");
  assert.strictEqual(p.$("guardarPropio").disabled, false, "sobrescribir uno existente si se puede");
});
