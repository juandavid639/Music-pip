/*
 * Verificacion por MUTACION de la tanda AG: el arnes comun y la prueba que
 * vigila los anclajes de los veinticuatro scripts.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1
 *
 * El ultimo mutante no toca el arnes: cambia UN espacio en una linea de
 * src/ que vigila tools/mutar/mutar-espectro.js. Es exactamente el caso que la
 * prueba existe para ver (un cambio que deja un anclaje viejo): debe caer
 * la fila de ese script y ninguna mas.
 * NO se muta la restauracion: tras deshacer() el arnes relee y reescribe el
 * original si hace falta, asi que quitar cualquiera de las dos deja la otra
 * haciendo el trabajo. Son dos redes a proposito (OneDrive, tanda Y).
 *
 * REFIJADA tras la primera pasada (0 de 6 exactos, todas muertas): cada
 * mutante cae en DOS. Se olvido la autorreferencia: el mutante quita justo
 * el texto que ancla este mismo script, asi que tambien cae la fila
 * «mutar-tanda-ag.js: todos sus textos...» de la prueba de anclajes.
 * Prediccion: 2/2/2/2/2/2
 *
 * Arnes comun: tools/mutar/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/mutar-comun.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "la prediccion da siempre por exacta",
    "archivo": "tools/mutar/mutar-comun.js",
    "de": "      if (caidas.length === m.esperadas) {",
    "a": "      if (true) {",
    "esperadas": 2
  },
  {
    "etiqueta": "el texto desaparecido no cuenta como superviviente",
    "archivo": "tools/mutar/mutar-comun.js",
    "de": "      console.error(`  ??  ${m.etiqueta}\\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);\n      sobreviven++;",
    "a": "      console.error(`  ??  ${m.etiqueta}\\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);",
    "esperadas": 2
  },
  {
    "etiqueta": "«solo comprobar» sale siempre bien",
    "archivo": "tools/mutar/mutar-comun.js",
    "de": "  process.exit(problemas.length ? 1 : 0);",
    "a": "  process.exit(0);",
    "esperadas": 2
  },
  {
    "etiqueta": "el filtro por etiqueta no filtra",
    "archivo": "tools/mutar/mutar-comun.js",
    "de": "  const elegidas = mutaciones.filter((m) => re.test(m.etiqueta));",
    "a": "  const elegidas = mutaciones.filter(() => re !== null);",
    "esperadas": 2
  },
  {
    "etiqueta": "una equivalente que muere no avisa",
    "archivo": "tools/mutar/mutar-comun.js",
    "de": "      if (caidas.length) {\n        sobreviven++;",
    "a": "      if (false) {\n        sobreviven++;",
    "esperadas": 2
  },
  {
    "etiqueta": "un cambio de src/ deja un anclaje viejo y la prueba no lo ve",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    if (modo === \"rgb\") {",
    "a": "    if (modo === \"rgb\" ) {",
    "esperadas": 2
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
