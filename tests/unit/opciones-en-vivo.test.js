/*
 * PREFERENCIAS ABIERTA MIENTRAS OTRO CONTEXTO ESCRIBE (tanda V).
 *
 * La pagina leia storage una sola vez, al abrir, y su `save` escribe TODOS
 * los campos en cada cambio. Asi que con Preferencias abierta, lo que se
 * cambiaba desde la ventana flotante (el ✨, el 🌌, el interruptor del
 * ecualizador) o lo que ponia sola la memoria por cancion se deshacia en
 * silencio al tocar cualquier otra cosa de la pagina: se reescribia el
 * valor viejo que seguia pintado.
 *
 * EL BANCO. A diferencia del de opciones-ecualizador.test.js, este storage
 * AVISA de cada escritura, propia o ajena, como hace Chrome: la mitad de lo
 * que hay que comprobar es precisamente quien reacciona a que. `ajeno()`
 * escribe como lo haria otro contexto (la ventana, el service worker).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const OPCIONES_HTML = path.join(RAIZ, "src/options/options.html");

/*
 * `conHoja`: servir pip.css de verdad, para que la pagina lea de el el
 * acento y el fondo de cada tema (el aviso del acento, tanda AE). jsdom no
 * trae hojas construibles (CSSStyleSheet.replaceSync), asi que se pone un
 * doble minimo: parte la hoja en bloques «selector { declaraciones }» y
 * contesta getPropertyValue. Solo sirve para reglas planas como las de los
 * temas, que son las que la pagina lee.
 */
class HojaDeMentira {
  replaceSync(texto) {
    const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, "");
    this.cssRules = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => {
      const declaraciones = {};
      for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) declaraciones[d[1]] = d[2].trim();
      return { selectorText: m[1].trim(), style: { getPropertyValue: (n) => declaraciones[n] || "" } };
    });
  }
}

function abrir(guardado = {}, { conHoja = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"), { runScripts: "outside-only" });
  const win = dom.window;
  win.self = win;
  win.console.warn = () => {};
  if (conHoja) {
    const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
    win.fetch = () => Promise.resolve({ text: () => Promise.resolve(hoja) });
    win.CSSStyleSheet = HojaDeMentira;
  } else {
    win.fetch = () => Promise.reject(new Error("sin red en las pruebas"));
  }

  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  let lecturas = 0;

  function avisar(valores, zona = "local") {
    const cambios = {};
    for (const k of Object.keys(valores)) cambios[k] = { newValue: valores[k] };
    oyentes.forEach((fn) => fn(cambios, zona));
  }

  win.chrome = {
    i18n: i18nFalso({}),
    runtime: { getURL: (p) => "chrome-extension://id-de-prueba/" + p },
    storage: {
      local: {
        get(_claves, cb) {
          lecturas++;
          cb(JSON.parse(JSON.stringify(almacen)));
        },
        set(valores, cb) {
          Object.assign(almacen, JSON.parse(JSON.stringify(valores)));
          avisar(valores);
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

  const doc = win.document;
  const $ = (id) => doc.getElementById(id);
  return {
    win,
    doc,
    $,
    almacen,
    lecturas: () => lecturas,
    /** Escribe como otro contexto: storage cambia y avisa, la pagina no toco nada. */
    ajeno(valores, zona) {
      if (zona === undefined || zona === "local") Object.assign(almacen, valores);
      avisar(valores, zona);
    },
    /** Cambiar un campo de la pagina como lo hace el usuario. */
    elegir(id, valor) {
      const el = $(id);
      el.value = valor;
      el.dispatchEvent(new win.Event("change"));
    }
  };
}

test("REGRESION TANDA V: el halo apagado desde la ventana sobrevive a tocar otra cosa en Preferencias", () => {
  const p = abrir({ haloPreference: "shown", haloMode: "pulse" });
  assert.strictEqual(p.$("halo").value, "pulse", "premisa: la pagina abre con el halo encendido");

  // El ✨ de la ventana lo apaga.
  p.ajeno({ haloPreference: "hidden" });
  assert.strictEqual(p.$("halo").value, "off", "la pagina no se entero del cambio de la ventana");

  // Y el usuario cambia el tema en la pagina.
  p.elegir("theme", "light");
  assert.strictEqual(p.almacen.haloPreference, "hidden", "guardar el tema volvio a encender el halo");
});

test("REGRESION TANDA V: el ajuste que pone la memoria por cancion no se deshace al guardar otra cosa", () => {
  const p = abrir({ equalizer: "graves" });
  p.ajeno({ equalizer: "voz" });
  assert.strictEqual(p.$("equalizerPreset").value, "voz");

  p.elegir("seekSeconds", "15");
  assert.strictEqual(p.almacen.equalizer, "voz", "guardar los segundos devolvio el ajuste viejo");
});

test("el fondo Canvas cambiado desde la ventana tambien se ve", () => {
  const p = abrir({ canvasPreference: "hidden" });
  p.ajeno({ canvasPreference: "shown" });
  assert.strictEqual(p.$("canvasPreference").value, "shown");
});

test("el estado que el service worker escribe cada segundo NO repinta la pagina", () => {
  // Sin este filtro, con musica sonando, la pagina se repintaria debajo del
  // raton una vez por segundo.
  const p = abrir();
  const antes = p.lecturas();
  for (let s = 0; s < 5; s++) p.ajeno({ lastKnownState: { connected: true, currentTime: s } });
  p.ajeno({ pipLastSize: { width: 400, height: 300 } });
  assert.strictEqual(p.lecturas(), antes);
});

test("el eco de lo que la propia pagina guarda no la repinta", () => {
  const p = abrir();
  const antes = p.lecturas();
  p.elegir("theme", "light");
  assert.strictEqual(p.lecturas(), antes, "la pagina se repinto con su propia escritura");
});

test("...pero si lo que llega no es exactamente lo que escribio, si", () => {
  // Misma clave, otro valor: es otro contexto escribiendo encima.
  const p = abrir();
  p.elegir("theme", "light");
  const antes = p.lecturas();
  p.ajeno({ theme: "dark" });
  assert.strictEqual(p.lecturas(), antes + 1);
  assert.strictEqual(p.$("theme").value, "dark");
});

test("los cambios de otra zona de storage no repintan", () => {
  const p = abrir();
  const antes = p.lecturas();
  p.ajeno({ theme: "light" }, "sync");
  assert.strictEqual(p.lecturas(), antes);
});

test("la forma del espectro (tanda Z) se carga de lo guardado y se guarda al elegirla", () => {
  const p = abrir({ spectrumStyle: "ring" });
  assert.strictEqual(p.$("spectrumStyle").value, "ring", "la pagina no enseña la forma guardada");
  p.elegir("spectrumStyle", "wave");
  assert.strictEqual(p.almacen.spectrumStyle, "wave", "elegir la forma no la guardo");
});

test("la caratula (tanda AA) se carga de lo guardado y se guarda al elegirla", () => {
  const p = abrir({ coverStyle: "vinyl" });
  assert.strictEqual(p.$("coverStyle").value, "vinyl");
  p.elegir("coverStyle", "square");
  assert.strictEqual(p.almacen.coverStyle, "square");
});

test("el estado en el icono (tanda AC) se carga de lo guardado y se guarda al elegirlo", () => {
  const p = abrir({ badgePreference: "hidden" });
  assert.strictEqual(p.$("badgePreference").value, "hidden");
  p.elegir("badgePreference", "shown");
  assert.strictEqual(p.almacen.badgePreference, "shown");
});

/* ---------- El color de acento (tanda AE) ---------- */

const esperarHoja = () => new Promise((r) => setTimeout(r, 20));

test("el acento se carga de lo guardado y se guarda al elegirlo", () => {
  const p = abrir({ accentColor: "#12ab34" });
  assert.strictEqual(p.$("accentColorMode").value, "custom");
  assert.strictEqual(p.$("accentColor").value, "#12ab34");
  p.elegir("accentColorMode", "default");
  assert.strictEqual(p.almacen.accentColor, "default", "«el de siempre» guarda la palabra, no un color");
  p.elegir("accentColorMode", "custom");
  assert.strictEqual(p.almacen.accentColor, "#12ab34", "«un color mio» guarda el del cuentagotas");
});

test("el cuentagotas del acento solo se ve con «un color mio»", () => {
  const p = abrir({});
  assert.strictEqual(p.$("accentColorLabel").hidden, true);
  p.elegir("accentColorMode", "custom");
  assert.strictEqual(p.$("accentColorLabel").hidden, false);
});

test("REGRESION TANDA AE: un acento que se lee mal sobre el tema lo avisa; el de siempre no", async () => {
  const p = abrir({ theme: "dark", accentColor: "#101010" }, { conHoja: true });
  await esperarHoja();
  assert.strictEqual(p.$("accentContrastWarning").hidden, false, "casi negro sobre el oscuro sin aviso");
  p.$("accentColor").value = "#ff0000";
  p.elegir("accentColorMode", "custom");
  assert.strictEqual(p.$("accentContrastWarning").hidden, true, "el rojo de siempre no merece aviso");
});

test("con el tema de la caratula no se avisa del contraste: se dice que manda la cancion", async () => {
  const p = abrir({ theme: "source", accentColor: "#101010" }, { conHoja: true });
  await esperarHoja();
  assert.strictEqual(p.$("accentContrastWarning").hidden, true);
  assert.strictEqual(p.$("accentSourceHint").hidden, false);
});
