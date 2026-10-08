/*
 * Verificacion por MUTACION de la tanda AK: la salud del adaptador.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   2/2/2/1/1/1
 *
 * «no echa en falta nada» y «el titulo deja de ser vital» caen en la del
 * titulo que falta y en la de la consola; la de diagnostico-publicacion
 * sigue viendo el fallo por la fila del estado, y por eso no suma.
 *
 * Arnes comun: tools/mutar/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/salud-adaptador.test.js",
  "tests/unit/guiones-consola.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "la salud acusa tambien sin musica",
    "archivo": "src/content/adapter-registry.js",
    "de": "      if (!suena) return { comprobable: false, faltan: [] };\n",
    "a": "",
    "esperadas": 2
  },
  {
    "etiqueta": "la salud no echa en falta nada",
    "archivo": "src/content/adapter-registry.js",
    "de": "          return !A[getter]();",
    "a": "          return false;",
    "esperadas": 2
  },
  {
    "etiqueta": "el titulo deja de ser vital",
    "archivo": "src/content/adapter-registry.js",
    "de": "    [\"getTitleElement\", \"titulo\"]\n",
    "a": "",
    "esperadas": 2
  },
  {
    "etiqueta": "el estado no lleva la lista",
    "archivo": "src/content/metadata-reader.js",
    "de": "        piezasQueFaltan: YTMPip.Adaptadores && YTMPip.Adaptadores.salud ? YTMPip.Adaptadores.salud().faltan : []",
    "a": "        piezasQueFaltan: []",
    "esperadas": 1
  },
  {
    "etiqueta": "la consola lo repite en cada latido",
    "archivo": "src/content/content-script.js",
    "de": "    if (faltan === faltasAvisadas) return;\n",
    "a": "",
    "esperadas": 1
  },
  {
    "etiqueta": "la ventana no lo dice",
    "archivo": "src/pip/pip.js",
    "de": "    } else if (state.connected && state.piezasQueFaltan && state.piezasQueFaltan.length) {",
    "a": "    } else if (false) {",
    "esperadas": 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
