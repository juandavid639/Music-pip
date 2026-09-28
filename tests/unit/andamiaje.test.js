/*
 * EL ANDAMIAJE: lo que hace falta para que las pruebas corran donde deben
 * (tanda X).
 *
 * `npm test` usa un patron ("tests/**\/*.test.js") que expande el propio
 * `node --test`, y eso solo existe desde Node 21: en la 20 no encuentra
 * ningun archivo. Asi que la version minima no es un detalle de la
 * documentacion, es una condicion para que la suite exista, y se fija en
 * `engines`. La integracion continua tiene que cumplirla tambien.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { RAIZ } = require("../helpers/entorno.js");

const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const flujo = fs.readFileSync(path.join(RAIZ, ".github/workflows/pruebas.yml"), "utf8");

function minimo(rango) {
  const m = /^>=\s*(\d+)/.exec(String(rango || ""));
  return m ? Number(m[1]) : null;
}

test("package.json exige Node 21 o mas: el patron de npm test no existe antes", () => {
  assert.match(paquete.scripts.test, /node --test "tests\/\*\*\/\*\.test\.js"/, "premisa: npm test usa el patron");
  const min = minimo(paquete.engines && paquete.engines.node);
  assert.ok(min !== null && min >= 21, "engines.node no exige >=21");
});

test("la integracion continua corre npm test con un Node que cumple engines", () => {
  const version = /node-version:\s*(\d+)/.exec(flujo);
  assert.ok(version, "el flujo no fija node-version");
  assert.ok(Number(version[1]) >= minimo(paquete.engines.node), "el flujo usa un Node mas viejo que el que exige engines");
  assert.match(flujo, /run: npm ci/);
  assert.match(flujo, /run: npm test/);
});
