/*
 * LOS CUATRO TEMAS DE LA VENTANA (tanda Y): oscuro, claro, «Automatico»
 * (el del sistema) y «Del video o la caratula» (la ventana teñida con el
 * color de lo que suena).
 *
 * Las cuentas de contraste del tema teñido viven en accesibilidad.test.js,
 * con las demas cuentas de contraste. Aqui se prueba la ventana: que se
 * tiña y se destiña cuando toca, que el baile del video no mueva el fondo,
 * y que «Automatico» pregunte al sistema.
 *
 * Banco: el de pip-apertura.test.js (openPip de verdad sobre una segunda
 * ventana jsdom), con las preferencias SEMBRADAS y cargadas antes de abrir
 * (sembrar sin Settings.load() es no sembrar: ver tanda R). La ventana
 * falsa trae un matchMedia de mentira para poder decir «el sistema esta en
 * claro».
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

const PLANTILLA = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

async function ventana({ theme = "source", sistemaClaro = false, extra = {} } = {}) {
  const { win } = crearEntorno(undefined, { storage: Object.assign({ theme }, extra) });
  let pip = null;
  win.fetch = async () => ({ text: async () => PLANTILLA });
  win.documentPictureInPicture = {
    requestWindow: async () => {
      const { win: v } = crearEntorno(undefined);
      v.resizeTo = () => {};
      v.matchMedia = (consulta) => ({
        matches: consulta.includes("light") ? sistemaClaro : !sistemaClaro,
        addEventListener() {}
      });
      pip = v;
      return v;
    }
  };
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/shared/color-fuente.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );
  await win.YTMPip.Settings.load();
  await win.YTMPip.PipView.open();
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  const html = pip.document.documentElement;
  return {
    win,
    pip,
    banco,
    html,
    /** La ventana flotante de AHORA (cambia al reabrir). */
    actual: () => pip,
    variable: (n) => pip.document.documentElement.style.getPropertyValue(n),
    claro: () => pip.document.documentElement.classList.contains("ytmpip-theme-light"),
    color(hsl) {
      banco.fijarColorFuente(hsl);
      banco.repartirColorFuente();
    },
    tema(theme) {
      banco.aplicarPreferencias(Object.assign({}, win.YTMPip.Settings.get(), { theme }));
    },
    esperado: (hsl) => win.YTMPip.ColorFuente.temaDeLaFuente(hsl)
  };
}

const ROJO = { h: 0, s: 0.8, l: 0.5 };
const AZUL = { h: 220, s: 0.8, l: 0.5 };

/* ---------- La regla de claro u oscuro, pura ---------- */

test("temaClaro: claro es claro, oscuro y la caratula parten del oscuro, automatico pregunta al sistema", async () => {
  const v = await ventana({ theme: "dark" });
  const { temaClaro } = v.banco;
  assert.strictEqual(temaClaro("dark", true), false);
  assert.strictEqual(temaClaro("light", false), true);
  assert.strictEqual(temaClaro("auto", true), true);
  assert.strictEqual(temaClaro("auto", false), false);
  assert.strictEqual(temaClaro("source", true), false, "la caratula parte del oscuro aunque el sistema este en claro");
});

test("Automatico con el sistema en claro abre la ventana en claro", async () => {
  const v = await ventana({ theme: "auto", sistemaClaro: true });
  assert.strictEqual(v.claro(), true);
});

test("...y con el sistema en oscuro, en oscuro", async () => {
  const v = await ventana({ theme: "auto", sistemaClaro: false });
  assert.strictEqual(v.claro(), false);
});

/* ---------- La ventana teñida ---------- */

test("REGRESION TANDA Y: con el tema de la caratula, un color tiñe el fondo y el acento de la ventana", async () => {
  const v = await ventana();
  v.color(ROJO);
  const t = v.esperado(ROJO);
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), t.fondo.join(", "));
  assert.strictEqual(v.variable("--ytmpip-accent"), "rgb(" + t.acento.join(", ") + ")");
  assert.strictEqual(v.claro(), false);
});

test("sin color (portada gris o aun sin leer) la ventana se queda en el oscuro de siempre", async () => {
  const v = await ventana();
  v.color(ROJO);
  v.color(null);
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), "");
  assert.strictEqual(v.variable("--ytmpip-accent"), "");
});

test("el baile del video (unos grados) NO repinta el fondo; un cambio de verdad si", async () => {
  const v = await ventana();
  v.color(ROJO);
  const antes = v.variable("--ytmpip-bg-rgb");
  v.color({ h: 6, s: 0.8, l: 0.5 });
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), antes, "seis grados movieron el fondo");
  v.color(AZUL);
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), v.esperado(AZUL).fondo.join(", "));
});

test("cambiar a otro tema con la ventana abierta la destiñe", async () => {
  const v = await ventana();
  v.color(ROJO);
  v.tema("dark");
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), "");
  assert.strictEqual(v.variable("--ytmpip-accent"), "");
});

test("...y volver al de la caratula la tiñe otra vez con el color que haya", async () => {
  const v = await ventana();
  v.color(ROJO);
  v.tema("dark");
  v.tema("source");
  v.banco.fijarColorFuente(ROJO);
  v.banco.repartirColorFuente();
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), v.esperado(ROJO).fondo.join(", "));
});

test("con otro tema puesto, el color de la fuente (del halo o del espectro) no tiñe la ventana", async () => {
  const v = await ventana({ theme: "dark" });
  v.color(ROJO);
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), "");
});

test("REGRESION TANDA Y: una ventana que murio sin despedirse no deja la siguiente sin teñir", async () => {
  /*
   * La memoria de «con que color la teñi» sobrevive a la ventana; su <html>
   * no. Un cierre normal la limpia de paso (pagehide para el muestreo y el
   * repartidor destiñe), asi que la prueba es la del cierre SIN pagehide
   * —la ventana muere de golpe—, que es el caso para el que openPip olvida
   * esa memoria. La primera version de esta prueba cerraba con pagehide y
   * el mutante que quitaba el olvido sobrevivio: pasaba por el otro camino.
   */
  const v = await ventana();
  v.color(ROJO);
  const vieja = v.actual();
  Object.defineProperty(vieja, "closed", { value: true, configurable: true });
  await v.win.YTMPip.PipView.open();
  assert.notStrictEqual(v.actual(), vieja, "premisa: se abrio otra ventana");
  v.color(ROJO);
  assert.strictEqual(v.variable("--ytmpip-bg-rgb"), v.esperado(ROJO).fondo.join(", "));
});

/* ---------- Las dos reglas puras ---------- */

test("cambiaElTema: aparecer y desaparecer cuentan; el tono se mide por la vuelta corta del circulo", async () => {
  const v = await ventana({ theme: "dark" });
  const { cambiaElTema } = v.win.YTMPip.ColorFuente;
  const c = (h, s = 0.6, l = 0.5) => ({ h, s, l });
  assert.strictEqual(cambiaElTema(null, c(0)), true, "aparecer");
  assert.strictEqual(cambiaElTema(c(0), null), true, "desaparecer");
  assert.strictEqual(cambiaElTema(null, null), false);
  assert.strictEqual(cambiaElTema(c(355), c(5)), false, "diez grados cruzando el cero no son doce");
  assert.strictEqual(cambiaElTema(c(0), c(12)), true, "doce grados si");
  assert.strictEqual(cambiaElTema(c(0), c(11)), false);
  assert.strictEqual(cambiaElTema(c(0, 0.6), c(0, 0.75)), true, "la saturacion tambien cuenta");
  assert.strictEqual(cambiaElTema(c(0, 0.6, 0.45), c(0, 0.6, 0.55)), true, "y la luz");
});

test("las preferencias aceptan los dos temas nuevos y siguen tirando la basura al oscuro", async () => {
  for (const [guardado, esperado] of [["auto", "auto"], ["source", "source"], ["rgb", "dark"], ["", "dark"]]) {
    const { win } = crearEntorno(undefined, { storage: { theme: guardado } });
    cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
    await win.YTMPip.Settings.load();
    assert.strictEqual(win.YTMPip.Settings.get().theme, esperado, `guardado ${JSON.stringify(guardado)}`);
  }
});

test("REGRESION TANDA Y: el tema de la caratula pide el color por si solo, sin halo ni espectro que lo pidan", async () => {
  // El halo viene en «Del video o la caratula» de serie (1.0.1) y ya pedia
  // el muestreo: sin apagarlo aqui, esta prueba pasaria aunque el tema no
  // lo pidiera nunca.
  const v = await ventana({ extra: { haloPreference: "hidden", spectrumColor: "accent" } });
  const pedidas = [];
  v.win.Image = class {
    set src(url) {
      pedidas.push(url);
    }
  };
  v.win.YTMPip.PipView.onStateUpdate({ connected: true, title: "x", artist: "y", artworkUrl: "https://ejemplo/portada.jpg" });
  await new Promise((r) => setTimeout(r, 450)); // un tic del muestreo (400 ms)
  assert.deepStrictEqual(pedidas, ["https://ejemplo/portada.jpg"], "nadie pidio el color de la portada");
});

/* ---------- El color de acento propio (tanda AE) ---------- */

test("REGRESION TANDA AE: un color de acento propio se usa tal cual en la ventana", async () => {
  const v = await ventana({ theme: "dark", extra: { accentColor: "#12ab34" } });
  assert.strictEqual(v.variable("--ytmpip-accent"), "#12ab34");
});

test("con «el de siempre» no se escribe nada: manda la hoja", async () => {
  const v = await ventana({ theme: "dark" });
  assert.strictEqual(v.variable("--ytmpip-accent"), "");
});

test("con el tema de la caratula manda el color de la cancion, no el propio", async () => {
  const v = await ventana({ theme: "source", extra: { accentColor: "#12ab34" } });
  v.color(ROJO);
  const t = v.esperado(ROJO);
  assert.strictEqual(v.variable("--ytmpip-accent"), "rgb(" + t.acento.join(", ") + ")");
});

test("REGRESION TANDA AE: al dejar el tema de la caratula vuelve el acento PROPIO, no el de la hoja", async () => {
  // El acento tiene dos dueños posibles; si el tinte lo quitara por su
  // cuenta al irse, se llevaria por delante el color que eligio el usuario.
  const v = await ventana({ theme: "source", extra: { accentColor: "#12ab34" } });
  v.color(ROJO);
  v.tema("dark");
  assert.strictEqual(v.variable("--ytmpip-accent"), "#12ab34");
});

test("...y sin color de la cancion (portada gris), tambien el propio", async () => {
  const v = await ventana({ theme: "source", extra: { accentColor: "#12ab34" } });
  v.color(ROJO);
  v.color(null);
  assert.strictEqual(v.variable("--ytmpip-accent"), "#12ab34");
});

test("las preferencias solo aceptan un #rrggbb como acento (y lo pasan a minusculas)", async () => {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/messages.js", "src/shared/ecualizador.js", "src/shared/settings.js");
  const n = win.YTMPip.Settings.normalizarAcento;
  assert.strictEqual(n("#12AB34"), "#12ab34");
  for (const basura of ["rgb", "#fff", "12ab34", "", null, "default", 16711680]) {
    assert.strictEqual(n(basura), "default", String(basura));
  }
});

test("acentoSeLeeMal: el rojo de siempre se lee sobre el oscuro; un casi negro o un amarillo sobre blanco no", async () => {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/paleta.js", "src/shared/color-fuente.js");
  const mal = win.YTMPip.ColorFuente.acentoSeLeeMal;
  assert.strictEqual(mal([255, 0, 0], [15, 15, 15]), false, "el rojo 255 sobre el oscuro");
  assert.strictEqual(mal([16, 16, 16], [15, 15, 15]), true, "casi negro sobre negro");
  assert.strictEqual(mal([255, 255, 0], [255, 255, 255]), true, "amarillo sobre blanco");
  assert.strictEqual(mal([255, 238, 238], [15, 15, 15]), true, "tan claro que la tinta blanca del boton no se ve");
});

/* ---------- El muestreo tras una ventana que murio sin despedirse (tanda AF) ---------- */

test("REGRESION TANDA AF: una ventana que murio sin pagehide no deja el color de la caratula bloqueado", async () => {
  // Sin halo ni espectro que pidan color: el unico que lo pide es el tema.
  const v = await ventana({ extra: { haloPreference: "hidden", spectrumColor: "accent" } });
  const vieja = v.actual();
  // Muere de golpe: ni pagehide ni pararMuestreoFuente. Y con ella sus
  // temporizadores, como en Chrome: en jsdom seguirian vivos, y el muestreo
  // de la ventana muerta —que lee el estado ACTUAL— haria la lectura por la
  // nueva y taparia el fallo (asi sobrevivio la primera mutacion de la AF).
  for (let id = 1; id < 2000; id++) vieja.clearInterval(id);
  Object.defineProperty(vieja, "closed", { value: true, configurable: true });
  await v.win.YTMPip.PipView.open();
  assert.notStrictEqual(v.actual(), vieja, "premisa: se abrio otra ventana");

  const pedidas = [];
  v.win.Image = class {
    set src(url) {
      pedidas.push(url);
    }
  };
  v.win.YTMPip.PipView.onStateUpdate({ connected: true, title: "x", artist: "y", artworkUrl: "https://ejemplo/otra.jpg" });
  await new Promise((r) => setTimeout(r, 450));
  assert.deepStrictEqual(pedidas, ["https://ejemplo/otra.jpg"], "la ventana nueva no volvio a leer el color");
});
