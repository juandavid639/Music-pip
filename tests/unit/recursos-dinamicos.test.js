/*
 * LOS RECURSOS QUE VEN LAS PAGINAS, CON DIRECCION DINAMICA (tanda AU).
 *
 * La ventana flotante usa tres recursos de la extension desde la pagina de
 * musica (pip.html, pip.css y la portada de reserva), y por eso estan en
 * web_accessible_resources. Sin mas, cualquier web podia preguntar por
 * chrome-extension://<id>/src/pip/pip.html y saber que tienes Music PiP
 * instalado: una huella para seguirte de sitio en sitio. Con
 * use_dynamic_url (respetado desde Chrome 130) el id de esa direccion es
 * aleatorio por sesion y la pregunta deja de funcionar.
 *
 * EL PRECIO: desde Chrome 130, una direccion escrita a mano o relativa
 * dentro de la ventana dejaria de cargar. Solo chrome.runtime.getURL da la
 * buena. Estas pruebas vigilan las dos mitades: que la opcion este puesta y
 * que nadie acceda a esos recursos por otro camino.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { RAIZ } = require("../helpers/entorno.js");

const MANIFIESTO = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));

function archivos(dir, extensiones) {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? archivos(dir + "/" + e.name, extensiones)
      : extensiones.some((x) => e.name.endsWith(x))
        ? [dir + "/" + e.name]
        : []
  );
}

test("cada entrada de web_accessible_resources lleva use_dynamic_url", () => {
  assert.ok(MANIFIESTO.web_accessible_resources.length > 0);
  for (const entrada of MANIFIESTO.web_accessible_resources) {
    assert.strictEqual(entrada.use_dynamic_url, true, JSON.stringify(entrada.resources));
  }
});

test("nadie escribe a mano una direccion chrome-extension:// en src/", () => {
  const culpables = archivos("src", [".js", ".html", ".css"]).filter((f) =>
    fs.readFileSync(path.join(RAIZ, f), "utf8").includes("chrome-extension://")
  );
  assert.deepStrictEqual(culpables, []);
});

test("pip.html y pip.css no cargan nada por ruta relativa (en la ventana no resolveria)", () => {
  const html = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(html, /\s(src|href)="(?!#|data:|https?:)/, "pip.html carga algo por ruta");
  assert.doesNotMatch(css, /url\((?!["']?data:)/, "pip.css carga algo por url()");
});

test("los recursos expuestos se piden con getURL, que da la direccion dinamica", () => {
  const pip = fs.readFileSync(path.join(RAIZ, "src/pip/pip.js"), "utf8");
  assert.match(pip, /getURL\("src\/pip\/pip\.html"\)/);
  assert.match(pip, /getURL\("src\/pip\/pip\.css"\)/);
  assert.match(pip, /getURLSafe\("assets\/placeholders\/artwork\.svg"\)/);
});
