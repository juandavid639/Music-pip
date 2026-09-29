/*
 * Verificacion por MUTACION de la tanda W: la vista previa de Preferencias
 * (catalogo con respaldo en español, cuerpo inerte, cancion inventada) y
 * la accesibilidad de Preferencias (marco fuera del tabulador, «Guardado.»
 * anunciado).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/2/1/1/1/1/1
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/vista-previa.test.js", "tests/unit/localizacion.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "el marco no pasa por aplicar() (la 1.0.1)",
    "archivo": "src/options/vista-previa.js",
    "de": "    if (self.YTMPip.Textos) self.YTMPip.Textos.aplicar(document);\n",
    "a": ""
  },
  {
    "etiqueta": "«Conectado» vuelve a ir escrito a mano (la 1.0.1)",
    "archivo": "src/options/vista-previa.js",
    "de": "t(\"conectado\", undefined, \"Conectado\")",
    "a": "\"Conectado\""
  },
  {
    "etiqueta": "la fuente de la letra vuelve a ir a mano (la 1.0.1)",
    "archivo": "src/options/vista-previa.js",
    "de": "t(\"fuente\", [\"Better Lyrics\"], \"Fuente: Better Lyrics\")",
    "a": "\"Letra: Better Lyrics\""
  },
  {
    "etiqueta": "sin catalogo sale la clave pelada",
    "archivo": "src/options/vista-previa.js",
    "de": "  return texto === clave ? respaldo : texto;",
    "a": "  return texto;"
  },
  {
    "etiqueta": "el marco deja de ser inerte (la 1.0.1)",
    "archivo": "src/options/vista-previa.js",
    "de": "    document.body.inert = true;",
    "a": "    ;"
  },
  {
    "etiqueta": "vuelve la cancion real (la 1.0.1)",
    "archivo": "src/options/vista-previa.js",
    "de": "textContent = \"Luz de madrugada\";",
    "a": "textContent = 'Ginger Root - \"Weather\" (Official Music Video)';"
  },
  {
    "etiqueta": "el marco vuelve a ser parada de tabulador (la 1.0.1)",
    "archivo": "src/options/options.html",
    "de": "            tabindex=\"-1\"\n",
    "a": ""
  },
  {
    "etiqueta": "el «Guardado.» vuelve a callarse (la 1.0.1)",
    "archivo": "src/options/options.html",
    "de": "<p id=\"status\" role=\"status\"></p>",
    "a": "<p id=\"status\"></p>"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
