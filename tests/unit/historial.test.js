/*
 * LO QUE ESCUCHASTE (tanda AT).
 *
 * Tres bloques, de dentro afuera:
 *  1. Las reglas puras (shared/historial.js): que es una escucha, como se
 *     anota y como se resume.
 *  2. El service worker: anota solo si el usuario lo encendio (APAGADO de
 *     serie, decision del autor), y una vez por cancion.
 *  3. La pagina: apagada enseña como encenderlo; encendida enseña el resumen
 *     y pinta los titulos como TEXTO (vienen de las paginas de musica).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const { crearEntorno, cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const plano = (x) => JSON.parse(JSON.stringify(x));
const DIA = 24 * 60 * 60 * 1000;

function modulo() {
  const { win } = crearEntorno();
  cargar(win, "src/shared/constants.js", "src/shared/historial.js");
  return win.YTMPip.Historial;
}

function sonando(extra) {
  return Object.assign(
    { connected: true, playing: true, siteName: "YouTube Music", title: "Tania", artist: "Joe Arroyo", duration: 240 },
    extra
  );
}

/* ------------------------------------------------------------------
 * 1. Las reglas
 * ------------------------------------------------------------------ */

test("una cancion cuenta UNA vez, al pasar los 30 segundos sonando", () => {
  const H = modulo();
  let marca = null;
  const cuentas = [];
  for (const segundo of [1, 10, 29, 30, 31, 90, 200]) {
    const r = H.paso(marca, sonando({ currentTime: segundo }));
    marca = r.marca;
    cuentas.push(r.contar);
  }
  assert.deepStrictEqual(cuentas, [false, false, false, true, false, false, false]);
});

test("en pausa no cuenta, aunque se haya pasado del umbral", () => {
  const H = modulo();
  assert.strictEqual(H.paso(null, sonando({ currentTime: 60, playing: false })).contar, false);
});

test("una cancion corta cuenta a la mitad", () => {
  const H = modulo();
  assert.strictEqual(H.paso(null, sonando({ duration: 40, currentTime: 19 })).contar, false);
  assert.strictEqual(H.paso(null, sonando({ duration: 40, currentTime: 20 })).contar, true);
});

test("otra cancion empieza de cero; la misma desde el principio puede volver a contar", () => {
  const H = modulo();
  let { marca } = H.paso(null, sonando({ currentTime: 40 }));
  // Cambia de cancion: la nueva no hereda la cuenta.
  const otra = H.paso(marca, sonando({ title: "Rebelión", currentTime: 2 }));
  assert.strictEqual(otra.contar, false);
  assert.strictEqual(otra.marca.contada, false);
  // Repetir la misma: vuelve al segundo 1 y puede contar de nuevo.
  marca = H.paso(null, sonando({ currentTime: 40 })).marca;
  marca = H.paso(marca, sonando({ currentTime: 1 })).marca;
  assert.strictEqual(H.paso(marca, sonando({ currentTime: 31 })).contar, true);
});

test("sin titulo o sin conexion no hay nada que contar", () => {
  const H = modulo();
  assert.strictEqual(H.paso(null, sonando({ title: "", currentTime: 60 })).contar, false);
  assert.strictEqual(H.paso(null, sonando({ connected: false, currentTime: 60 })).contar, false);
});

test("anotar: añade la escucha, olvida lo de mas de 90 dias y respeta el tope", () => {
  const H = modulo();
  const ahora = 1000 * DIA;
  const vieja = { titulo: "Vieja", artista: "", sitio: "", cuando: ahora - 91 * DIA };
  const reciente = { titulo: "Reciente", artista: "", sitio: "", cuando: ahora - DIA };
  const lista = plano(H.anotar([vieja, reciente], sonando(), ahora));
  assert.deepStrictEqual(
    lista.map((e) => e.titulo),
    ["Reciente", "Tania"]
  );
  assert.deepStrictEqual(lista[1], { titulo: "Tania", artista: "Joe Arroyo", sitio: "YouTube Music", cuando: ahora });

  const llena = Array.from({ length: H.LIMITES.MAX }, (_, i) => ({ titulo: "C" + i, artista: "", sitio: "", cuando: ahora - 1 }));
  const recortada = H.anotar(llena, sonando(), ahora);
  assert.strictEqual(recortada.length, H.LIMITES.MAX);
  assert.strictEqual(recortada[recortada.length - 1].titulo, "Tania");
});

test("resumen: cuenta canciones y artistas, lo mas escuchado primero y lo ultimo arriba", () => {
  const H = modulo();
  const e = (titulo, artista, cuando) => ({ titulo, artista, sitio: "", cuando });
  const lista = [
    e("Tania", "Joe Arroyo", 1),
    e("Rebelión", "Joe Arroyo", 2),
    e("Tania", "Joe Arroyo", 3),
    e("Colombia Tierra Querida", "Lucho Bermúdez", 4)
  ];
  const r = plano(H.resumen(lista, 0));
  assert.strictEqual(r.total, 4);
  assert.deepStrictEqual(r.canciones[0], { titulo: "Tania", artista: "Joe Arroyo", veces: 2 });
  assert.deepStrictEqual(r.artistas[0], { artista: "Joe Arroyo", veces: 3 });
  assert.strictEqual(r.recientes[0].titulo, "Colombia Tierra Querida", "lo ultimo va arriba");
  assert.strictEqual(plano(H.resumen(lista, 3)).total, 2, "el periodo filtra");
});

/* ------------------------------------------------------------------
 * 2. El service worker
 * ------------------------------------------------------------------ */

const SW = path.join(RAIZ, "src/background/service-worker.js");

function trabajador(local) {
  const oyentes = {};
  const ev = (n) => ({ addListener: (fn) => (oyentes[n] = oyentes[n] || []).push(fn) });
  const sesion = {};
  const pick = (alm, k) => {
    if (k == null) return Object.assign({}, alm);
    const r = {};
    for (const c of [].concat(k)) if (c in alm) r[c] = alm[c];
    return r;
  };
  const chrome = {
    runtime: {
      id: "x",
      getURL: (p) => "chrome-extension://x/" + p,
      getManifest: () => ({ content_scripts: [] }),
      onInstalled: ev("i"),
      onStartup: ev("s"),
      onMessage: ev("mensaje")
    },
    storage: {
      local: { get: async (k) => pick(local, k), set: async (o) => void Object.assign(local, plano(o)) },
      session: { get: async (k) => pick(sesion, k), set: async (o) => void Object.assign(sesion, plano(o)), remove: async () => {} },
      onChanged: ev("cambio")
    },
    tabs: { query: async () => [], get: async () => ({}), onRemoved: ev("r"), onUpdated: ev("u"), create: async () => {} },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    commands: { onCommand: ev("c") },
    scripting: { executeScript: async () => [] },
    windows: { create: async () => ({}), update: async () => ({}) }
  };
  const contexto = { chrome, console: { log() {}, info() {}, warn() {}, error() {} }, Promise, setTimeout, clearTimeout };
  contexto.self = contexto;
  contexto.importScripts = (...rutas) => {
    for (const r of rutas) vm.runInContext(fs.readFileSync(path.resolve(path.dirname(SW), r), "utf8"), contexto);
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(SW, "utf8"), contexto, { filename: SW });
  return {
    local,
    estado(state) {
      return new Promise((resolve) => {
        const fn = oyentes.mensaje[0];
        const r = fn({ type: "STATE_UPDATE", state }, { tab: { id: 7 } }, resolve);
        if (r !== true) resolve();
      });
    }
  };
}

test("APAGADO DE SERIE: por mucho que suene, no se anota nada", async () => {
  const w = trabajador({});
  for (const s of [1, 31, 60]) await w.estado(sonando({ currentTime: s }));
  assert.strictEqual(w.local.listeningHistory, undefined);
});

test("encendido, anota la cancion una sola vez al pasar el umbral", async () => {
  const w = trabajador({ historyPreference: "on" });
  for (const s of [1, 29, 31, 32, 60]) await w.estado(sonando({ currentTime: s }));
  assert.strictEqual(w.local.listeningHistory.length, 1);
  assert.strictEqual(w.local.listeningHistory[0].titulo, "Tania");
});

/* ------------------------------------------------------------------
 * 3. La pagina
 * ------------------------------------------------------------------ */

function pagina(guardado) {
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, "src/historial/historial.html"), "utf8"), {
    runScripts: "outside-only"
  });
  const win = dom.window;
  win.self = win;
  win.confirm = () => true;
  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  win.chrome = {
    i18n: i18nFalso({}),
    storage: {
      local: {
        get: (_k, cb) => cb(JSON.parse(JSON.stringify(almacen))),
        set(v) {
          const cambios = {};
          for (const k of Object.keys(v)) cambios[k] = { newValue: v[k] };
          Object.assign(almacen, JSON.parse(JSON.stringify(v)));
          oyentes.forEach((fn) => fn(cambios, "local"));
        }
      },
      onChanged: { addListener: (fn) => oyentes.push(fn) }
    }
  };
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/historial.js", "src/historial/historial.js");
  const $ = (id) => win.document.getElementById(id);
  return { win, $, almacen };
}

test("apagado: la pagina lo dice y lo enciende con un clic", () => {
  const p = pagina({});
  assert.strictEqual(p.$("apagado").hidden, false);
  assert.strictEqual(p.$("encendido").hidden, true);
  p.$("encender").click();
  assert.strictEqual(p.almacen.historyPreference, "on");
  assert.strictEqual(p.$("encendido").hidden, false, "la pagina no se repinto");
});

test("encendido: enseña el resumen y pinta los titulos como TEXTO, no como HTML", () => {
  const ahora = Date.now();
  const p = pagina({
    historyPreference: "on",
    listeningHistory: [
      { titulo: "<img src=x onerror=alert(1)>", artista: "Nadie", sitio: "", cuando: ahora - 1000 },
      { titulo: "Tania", artista: "Joe Arroyo", sitio: "", cuando: ahora - 500 }
    ]
  });
  assert.strictEqual(p.$("canciones").children.length, 2);
  assert.strictEqual(p.$("canciones").querySelector("img"), null, "un titulo se pinto como HTML");
  assert.match(p.$("canciones").textContent, /<img src=x/);
  assert.match(p.$("total").textContent, /2/);
});

test("borrar vacia el historial (con confirmacion)", () => {
  const p = pagina({
    historyPreference: "on",
    listeningHistory: [{ titulo: "Tania", artista: "Joe Arroyo", sitio: "", cuando: Date.now() }]
  });
  p.$("borrar").click();
  assert.deepStrictEqual(p.almacen.listeningHistory, []);
  assert.strictEqual(p.$("vacio").hidden, false);
});
