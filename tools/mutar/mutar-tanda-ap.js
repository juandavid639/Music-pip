/*
 * Verificacion por MUTACION de la tanda AP: el icono abre el menu.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista: 1/2
 * (el segundo: las dos pruebas del service worker que abren por el atajo
 * miran lo que pasa despues de abrir, y sin el return llegan antes).
 *
 * Lo que no se muta: que NO haya un chrome.action.onClicked. Una ausencia
 * no se puede estropear quitandola; la vigila la prueba que lee el archivo.
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/popup-ajustes.test.js", "tests/unit/service-worker.test.js"];

const MUTACIONES = [
  {
    etiqueta: "el icono vuelve a no tener menu (la 1.2.1 que probo el autor)",
    archivo: "manifest.json",
    de: '    "default_popup": "src/popup/popup.html",\n',
    a: "",
    esperadas: 1
  },
  {
    etiqueta: "el atajo de abrir no espera ni devuelve lo que paso",
    archivo: "src/background/service-worker.js",
    de: '    return abrirPipDesdeElNavegador(tab, "El atajo");',
    a: '    abrirPipDesdeElNavegador(tab, "El atajo");\n    return;',
    esperadas: 2
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
