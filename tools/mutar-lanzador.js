/*
 * Verificacion por MUTACION del arreglo del lanzador.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que
 * alguna prueba se entera. Una mutacion que sobrevive es una prueba que no
 * existe, por mucho que la suite este en verde.
 *
 * Mismo arnes que tools/mutar-espectro.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-lanzador.test.js"];

const MUTACIONES = [
  {
    etiqueta: "destacarLanzador no crea el boton si no esta",
    archivo: "src/pip/pip.js",
    de: "  function destacarLanzador() {\n    ensureLauncherButton();",
    a: "  function destacarLanzador() {"
  },
  {
    etiqueta: "destacarLanzador miente: dice que si aunque no haya boton",
    archivo: "src/pip/pip.js",
    de: "    if (!btn) return false;",
    a: "    if (!btn) return true;"
  },
  {
    etiqueta: "se cae la guarda de animate (revienta donde no hay Web Animations)",
    archivo: "src/pip/pip.js",
    de: '    if (typeof btn.animate !== "function") return true;',
    a: ";"
  },
  {
    etiqueta: "el parpadeo ocurre una sola vez y se pierde de vista",
    archivo: "src/pip/pip.js",
    de: "{ duration: 600, iterations: 3 }",
    a: "{ duration: 600, iterations: 1 }"
  },
  {
    etiqueta: "la animacion se queda con un solo fotograma",
    archivo: "src/pip/pip.js",
    de: '        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" },\n        { transform: "scale(1.18)", boxShadow: "0 0 0 12px rgba(241,90,90,.35)" },\n        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }',
    a: '        { transform: "scale(1)" }'
  },
  /*
   * RETIRADA en la tanda AG: «el lanzador se duplica en cada aviso» buscaba
   * la comprobacion vieja del id, que la tanda T sustituyo por la adopcion
   * del boton (lanzadorPropio). Los mutantes de tools/mutar-tanda-t.js sobre
   * la adopcion vigilan lo mismo y mas; repetirlo aqui seria un segundo
   * vigilante de la misma regla.
   */
  {
    etiqueta: "PipView deja de exponer destacarLanzador al service worker",
    archivo: "src/pip/pip.js",
    de: "    destacarLanzador: destacarLanzador,",
    a: ""
  },
  {
    etiqueta: "open() deja de ser async (el .then del service worker revienta)",
    archivo: "src/pip/pip.js",
    de: "    aperturaEnCurso = abrirVentana().finally(() => {\n      aperturaEnCurso = null;\n    });\n    return aperturaEnCurso;",
    a: "    abrirVentana();\n    return undefined;"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
