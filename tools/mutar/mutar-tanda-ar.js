/*
 * Verificacion por MUTACION de la tanda AR: la pagina de bienvenida.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista: 1/1
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/service-worker.test.js", "tests/unit/localizacion.test.js"];

const MUTACIONES = [
  {
    etiqueta: "instalar ya no abre la bienvenida",
    archivo: "src/background/service-worker.js",
    de: '      await chrome.tabs.create({ url: chrome.runtime.getURL("src/bienvenida/bienvenida.html") });',
    a: "      ;",
    esperadas: 1
  },
  {
    etiqueta: "el español de la bienvenida se separa del catalogo",
    archivo: "src/bienvenida/bienvenida.html",
    de: '<h2 data-t="bienvenida_paso2_titulo">Pon una canción</h2>',
    a: '<h2 data-t="bienvenida_paso2_titulo">Reproduce algo</h2>',
    esperadas: 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
