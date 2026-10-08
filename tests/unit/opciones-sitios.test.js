/*
 * MAS SITIOS EN PREFERENCIAS (tanda AV).
 *
 * Una fila por sitio opcional, pintada con lo que Chrome dice del permiso
 * ahora mismo, y un boton que lo pide o lo retira. La decision del autor que
 * hay detras: los sitios nuevos van con permiso OPCIONAL para que ninguna
 * actualizacion desactive la extension a quien ya la usa.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { cargar, i18nFalso, RAIZ } = require("../helpers/entorno.js");

const SC = "https://soundcloud.com/*";
const espera = () => new Promise((r) => setTimeout(r, 10));

async function abrir({ concedidos = [], concede = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8"), {
    runScripts: "outside-only"
  });
  const win = dom.window;
  win.self = win;
  win.console.warn = () => {};
  win.fetch = () => Promise.reject(new Error("sin red en las pruebas"));
  const permisos = concedidos.slice();
  const pedidos = [];
  const oyentes = { anadido: [], quitado: [] };
  win.chrome = {
    i18n: i18nFalso({}),
    runtime: { getURL: (p) => "chrome-extension://id-de-prueba/" + p },
    storage: {
      local: { get: (_k, cb) => cb({}), set: (_v, cb) => cb && cb() },
      onChanged: { addListener() {} }
    },
    permissions: {
      contains: async ({ origins }) => origins.every((o) => permisos.includes(o)),
      request: async ({ origins }) => {
        pedidos.push(["pedir", ...origins]);
        if (concede) permisos.push(...origins);
        return concede;
      },
      remove: async ({ origins }) => {
        pedidos.push(["retirar", ...origins]);
        for (const o of origins) permisos.splice(permisos.indexOf(o), 1);
        return true;
      },
      onAdded: { addListener: (fn) => oyentes.anadido.push(fn) },
      onRemoved: { addListener: (fn) => oyentes.quitado.push(fn) }
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
  await espera();
  const fila = () => win.document.querySelector('#sitiosOpcionales [data-sitio="soundcloud"]');
  return { win, pedidos, fila, boton: () => fila().querySelector("button"), status: () => win.document.getElementById("status").textContent };
}

test("cada sitio opcional tiene su fila, y sin permiso dice que no esta activado", async () => {
  const p = await abrir();
  assert.ok(p.fila(), "no hay fila de SoundCloud");
  assert.match(p.fila().textContent, /SoundCloud/);
  assert.match(p.fila().textContent, /Sin activar/);
  assert.strictEqual(p.boton().textContent, "Activar");
  assert.strictEqual(p.boton().getAttribute("aria-label"), "Activar SoundCloud", "el boton tiene que decir QUE activa");
});

test("Activar pide el permiso de ESE sitio, y la fila pasa a activado", async () => {
  const p = await abrir();
  p.boton().click();
  await espera();
  assert.deepStrictEqual(p.pedidos, [["pedir", SC]]);
  assert.match(p.fila().textContent, /Activado/);
  assert.strictEqual(p.boton().textContent, "Desactivar");
});

test("si Chrome no lo concede, se dice y no cambia nada", async () => {
  const p = await abrir({ concede: false });
  p.boton().click();
  await espera();
  assert.match(p.fila().textContent, /Sin activar/);
  assert.match(p.status(), /permiso/i);
});

test("con el permiso ya concedido, Desactivar lo retira", async () => {
  const p = await abrir({ concedidos: [SC] });
  assert.strictEqual(p.boton().textContent, "Desactivar");
  p.boton().click();
  await espera();
  assert.deepStrictEqual(p.pedidos, [["retirar", SC]]);
  assert.match(p.fila().textContent, /Sin activar/);
});

test("cada sitio opcional declara su nota y existe en los dos catalogos", () => {
  const constantes = fs.readFileSync(path.join(RAIZ, "src/shared/constants.js"), "utf8");
  const ES = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/es/messages.json"), "utf8"));
  const EN = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/en/messages.json"), "utf8"));
  const notas = [...constantes.matchAll(/nota: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(notas.length >= 1);
  for (const clave of notas) {
    assert.ok(ES[clave] && EN[clave], "falta «" + clave + "» en algun catalogo");
  }
});
