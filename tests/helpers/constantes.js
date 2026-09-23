/*
 * Expone las constantes reales de src/shared/constants.js a las pruebas,
 * evaluandolas en un objeto vacio que hace de `self`.
 *
 * Se evita copiar los valores a mano: si un test escribiera "unavailable"
 * como literal y alguien renombrara el estado, el test seguiria pasando
 * contra un valor que ya no existe.
 */
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");

const contenedor = {};
const codigo = fs.readFileSync(path.join(RAIZ, "src", "shared", "constants.js"), "utf8");
// El modulo es (function (root) { ... })(self ?? globalThis): basta con
// invocarlo pasandole nuestro contenedor como `root`.
new Function("self", codigo)(contenedor);

module.exports = contenedor.YTMPip.CONSTANTS;
