/*
 * Verificacion por MUTACION de la tanda AN: la onda como forma de serie.
 *
 * Prediccion fijada ANTES de correr: 2 (la decision fijada en
 * settings.test.js y lo que pinta de serie el menu).
 *
 * Arnes comun: tools/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/settings.test.js", "tests/unit/popup-ajustes.test.js"];

const MUTACIONES = [
  {
    etiqueta: "la forma de serie vuelve a ser las barras",
    archivo: "src/shared/constants.js",
    de: '      spectrumStyle: "wave",',
    a: '      spectrumStyle: "bars",',
    esperadas: 2
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
