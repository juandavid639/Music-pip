/*
 * TUS PREFERENCIAS, DE VUELTA Y DE VIAJE (tanda AJ).
 *
 * Tres botones al pie de Preferencias: volver a los valores de fabrica,
 * exportar las preferencias a un archivo e importarlas de uno. Lo que se
 * fija aqui:
 *
 *  - QUE VIAJA. Solo las preferencias: las claves que settings.js clasifica
 *    como «se aplican» (la lista que vigila el censo de
 *    settings-recargas.test.js). Ni el ultimo estado de reproduccion, ni el
 *    tamaño anotado, ni las canciones fijadas: son anotaciones de este
 *    equipo, y la politica de privacidad promete que el archivo no las
 *    lleva.
 *  - QUE ENTRA. Un archivo de fuera es entrada no confiable: se exige que
 *    sea nuestro (`app: "music-pip"`), se descartan las claves que no son
 *    preferencias y cada valor pasa por los MISMOS saneadores que usa la
 *    ventana (Settings.normalize). Lo que el archivo no trae no se toca.
 *  - QUE SE BORRA al restaurar: las preferencias y nada mas, y solo si el
 *    usuario lo confirma.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const OPCIONES_HTML = path.join(RAIZ, "src/options/options.html");

function abrir(guardado = {}, { confirmar = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"), { runScripts: "outside-only" });
  const win = dom.window;
  win.self = win;
  win.console.warn = () => {};
  win.fetch = () => Promise.reject(new Error("sin red en las pruebas"));
  win.confirm = () => confirmar;

  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  const avisar = (cambios) => oyentes.forEach((fn) => fn(cambios, "local"));

  win.chrome = {
    i18n: i18nFalso({}),
    runtime: {
      getURL: (p) => "chrome-extension://id-de-prueba/" + p,
      getManifest: () => ({ version: "9.9.9" })
    },
    storage: {
      local: {
        get(_claves, cb) {
          cb(JSON.parse(JSON.stringify(almacen)));
        },
        set(valores, cb) {
          const cambios = {};
          for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
          Object.assign(almacen, JSON.parse(JSON.stringify(valores)));
          avisar(cambios);
          if (cb) cb();
        },
        remove(claves, cb) {
          const cambios = {};
          for (const k of [].concat(claves)) {
            if (k in almacen) cambios[k] = { oldValue: almacen[k] };
            delete almacen[k];
          }
          if (Object.keys(cambios).length) avisar(cambios);
          if (cb) cb();
        }
      },
      onChanged: { addListener: (fn) => oyentes.push(fn) }
    }
  };

  // La descarga: se atrapa el Blob y el clic del enlace (jsdom no navega).
  const descargas = [];
  win.URL.createObjectURL = (blob) => {
    descargas.push({ blob });
    return "blob:prueba";
  };
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {
    descargas[descargas.length - 1].nombre = this.download;
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
    descargas,
    async exportar() {
      $("exportarPreferencias").click();
      const d = descargas[descargas.length - 1];
      // jsdom no trae Blob.text(): se lee con su FileReader, como la pagina.
      const texto = await new Promise((resolve) => {
        const lector = new win.FileReader();
        lector.onload = () => resolve(String(lector.result));
        lector.readAsText(d.blob);
      });
      return { nombre: d.nombre, datos: JSON.parse(texto) };
    },
    /** Importa un texto como si el usuario eligiera un archivo con el. */
    importar(texto) {
      const input = $("archivoPreferencias");
      const archivo = new win.File([texto], "preferencias.json", { type: "application/json" });
      Object.defineProperty(input, "files", { value: [archivo], configurable: true });
      input.dispatchEvent(new win.Event("change"));
      // FileReader es asincrono: se espera a que la pagina diga algo.
      return new Promise((resolve) => {
        const hasta = Date.now() + 2000;
        (function mirar() {
          const texto = $("status").textContent;
          if (texto || Date.now() > hasta) resolve(texto);
          else setTimeout(mirar, 5);
        })();
      });
    }
  };
}

const MIS_PREFERENCIAS = {
  theme: "light",
  seekSeconds: 15,
  accentColor: "#1e90ff",
  spectrumStyle: "wave",
  haloPreference: "hidden",
  equalizer: "graves"
};

const ANOTACIONES = {
  lastKnownState: { connected: true, title: "Tania" },
  pipLastSize: { width: 400, height: 300 },
  equalizerBySong: { "Tania||Joe Arroyo": "voz" }
};

test("exportar: un archivo nuestro, fechado, con las preferencias y SIN las anotaciones", async () => {
  const p = abrir(Object.assign({}, MIS_PREFERENCIAS, ANOTACIONES));
  const { nombre, datos } = await p.exportar();
  assert.match(nombre, /^music-pip-preferencias-\d{4}-\d{2}-\d{2}\.json$/);
  assert.strictEqual(datos.app, "music-pip");
  assert.strictEqual(datos.formato, 1);
  assert.strictEqual(datos.version, "9.9.9");
  for (const [clave, valor] of Object.entries(MIS_PREFERENCIAS)) {
    assert.deepStrictEqual(datos.preferencias[clave], valor, "falta o cambia «" + clave + "»");
  }
  for (const clave of Object.keys(ANOTACIONES)) {
    assert.ok(!(clave in datos.preferencias), "el archivo lleva «" + clave + "», que no es una preferencia");
  }
});

test("exportar lleva TODAS las preferencias, tambien las que siguen de serie", async () => {
  const p = abrir({});
  const { datos } = await p.exportar();
  const seAplican = Object.values(p.win.YTMPip.CONSTANTS.STORAGE_KEYS).filter((k) => p.win.YTMPip.Settings.seAplica(k));
  assert.deepStrictEqual(Object.keys(datos.preferencias).sort(), seAplican.sort());
});

test("IDA Y VUELTA: lo exportado en un equipo se importa en otro y la pagina lo enseña", async () => {
  const origen = abrir(Object.assign({}, MIS_PREFERENCIAS));
  const { datos } = await origen.exportar();

  const destino = abrir({});
  const aviso = await destino.importar(JSON.stringify(datos));
  assert.match(aviso, /importad/i);
  for (const [clave, valor] of Object.entries(MIS_PREFERENCIAS)) {
    assert.deepStrictEqual(destino.almacen[clave], valor, "no llego «" + clave + "»");
  }
  assert.strictEqual(destino.$("theme").value, "light", "la pagina no se repinto con lo importado");
});

test("importar: un JSON que no es nuestro no toca nada", async () => {
  const p = abrir({ theme: "dark" });
  const aviso = await p.importar(JSON.stringify({ preferencias: { theme: "light" } }));
  assert.match(aviso, /no/i);
  assert.strictEqual(p.almacen.theme, "dark");
});

test("importar: un archivo que ni es JSON tampoco", async () => {
  const p = abrir({ theme: "dark" });
  await p.importar("esto no es json");
  assert.strictEqual(p.almacen.theme, "dark");
});

test("importar: las anotaciones del archivo se ignoran y los valores raros se sanean", async () => {
  const p = abrir(Object.assign({}, ANOTACIONES));
  await p.importar(
    JSON.stringify({
      app: "music-pip",
      formato: 1,
      preferencias: {
        theme: "morado",
        seekSeconds: 999,
        accentColor: "rojo",
        lastKnownState: { connected: false, title: "inventado" },
        equalizerBySong: {},
        cualquierCosa: 1
      }
    })
  );
  assert.strictEqual(p.almacen.theme, "dark", "un tema que no existe no se guarda tal cual");
  assert.strictEqual(p.almacen.seekSeconds, 10, "un salto fuera de rango no se guarda tal cual");
  assert.strictEqual(p.almacen.accentColor, "default");
  assert.deepStrictEqual(p.almacen.lastKnownState, ANOTACIONES.lastKnownState, "el archivo piso una anotacion");
  assert.deepStrictEqual(p.almacen.equalizerBySong, ANOTACIONES.equalizerBySong, "el archivo borro las canciones fijadas");
  assert.ok(!("cualquierCosa" in p.almacen));
});

test("importar: lo que el archivo no trae se queda como estaba", async () => {
  const p = abrir({ theme: "light", seekSeconds: 20 });
  await p.importar(JSON.stringify({ app: "music-pip", formato: 1, preferencias: { spectrumStyle: "ring" } }));
  assert.strictEqual(p.almacen.spectrumStyle, "ring");
  assert.strictEqual(p.almacen.theme, "light");
  assert.strictEqual(p.almacen.seekSeconds, 20);
});

test("restaurar sin confirmar no borra nada", () => {
  const p = abrir(Object.assign({}, MIS_PREFERENCIAS), { confirmar: false });
  p.$("restaurarPreferencias").click();
  assert.strictEqual(p.almacen.theme, "light");
});

test("restaurar: borra las preferencias, respeta las anotaciones y la pagina vuelve a lo de serie", () => {
  const p = abrir(Object.assign({}, MIS_PREFERENCIAS, ANOTACIONES));
  p.$("restaurarPreferencias").click();
  for (const clave of Object.keys(MIS_PREFERENCIAS)) {
    assert.ok(!(clave in p.almacen), "«" + clave + "» sigue guardada");
  }
  assert.deepStrictEqual(p.almacen.equalizerBySong, ANOTACIONES.equalizerBySong, "restaurar borro las canciones fijadas");
  assert.deepStrictEqual(p.almacen.lastKnownState, ANOTACIONES.lastKnownState);
  const DE_SERIE = p.win.YTMPip.CONSTANTS.DEFAULT_SETTINGS;
  assert.strictEqual(p.$("theme").value, DE_SERIE.theme);
  assert.strictEqual(String(p.$("seekSeconds").value), String(DE_SERIE.seekSeconds));
});
