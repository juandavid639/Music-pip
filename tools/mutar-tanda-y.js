/*
 * Verificacion por MUTACION de la tanda Y: los temas «Automatico» y «Del
 * video o la caratula» (la ventana teñida), con sus cuentas de contraste.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   6/2/1/1/1/2/1/1/1/1/1/1
 *
 * Refijada tras la primera pasada (que se interrumpio por un bloqueo de
 * OneDrive): «reabrir no olvida» SOBREVIVIO porque la prueba cerraba con
 * pagehide, que limpia por otro camino — la prueba pasa a ser la de la
 * ventana que muere sin despedirse (prediccion 1, igual). Y «cambiar de
 * tema no repasa el tinte» mutaba la llamada EQUIVOCADA (el texto aparecia
 * dos veces, avisado con OJO y pasado por alto): cayeron 3; con el ancla
 * buena la prediccion sigue en 1.
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-tema.test.js", "tests/unit/accesibilidad.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran los temas nuevos (la 1.0.2)",
    "archivo": "src/shared/settings.js",
    "de": "[\"dark\", \"light\", \"auto\", \"source\"]",
    "a": "[\"dark\", \"light\"]"
  },
  {
    "etiqueta": "Automatico no pregunta al sistema",
    "archivo": "src/pip/pip.js",
    "de": "    if (tema === \"auto\") return Boolean(sistemaClaro);\n",
    "a": ""
  },
  {
    "etiqueta": "el tema no pide el muestreo por si solo",
    "archivo": "src/pip/pip.js",
    "de": "||\n      settings.theme === MODO_FUENTE;",
    "a": ";"
  },
  {
    "etiqueta": "el baile del video repinta el fondo",
    "archivo": "src/pip/pip.js",
    "de": "    if (!YTMPip.ColorFuente.cambiaElTema(temaPintado, objetivo)) return;",
    "a": "    ;"
  },
  {
    "etiqueta": "reabrir no olvida con que color se tiño",
    "archivo": "src/pip/pip.js",
    "de": "    temaPintado = null;\n",
    "a": ""
  },
  {
    "etiqueta": "sin color no se quita el fondo teñido",
    "archivo": "src/pip/pip.js",
    "de": "    else raiz.style.removeProperty(\"--ytmpip-bg-rgb\");\n",
    "a": ""
  },
  {
    "etiqueta": "cambiar de tema no repasa el tinte",
    "archivo": "src/pip/pip.js",
    "de": "    // tiñe con el, o destiñe si el tema dejo de ser «De la caratula».\n    pintarColorFuenteEnTema();\n",
    "a": "    // tiñe con el, o destiñe si el tema dejo de ser «De la caratula».\n"
  },
  {
    "etiqueta": "el acento queda demasiado oscuro para «Sin conexion»",
    "archivo": "src/shared/constants.js",
    "de": "THEME_ACCENT_LUMINANCE: 0.28",
    "a": "THEME_ACCENT_LUMINANCE: 0.2"
  },
  {
    "etiqueta": "el acento queda demasiado claro para la tinta blanca",
    "archivo": "src/shared/constants.js",
    "de": "THEME_ACCENT_LUMINANCE: 0.28",
    "a": "THEME_ACCENT_LUMINANCE: 0.4"
  },
  {
    "etiqueta": "el fondo teñido demasiado claro",
    "archivo": "src/shared/constants.js",
    "de": "THEME_BG_LIGHT: 0.07",
    "a": "THEME_BG_LIGHT: 0.35"
  },
  {
    "etiqueta": "el fondo pierde el tono de la fuente",
    "archivo": "src/shared/color-fuente.js",
    "de": "      h: hsl.h,\n      s: Math.min(AJUSTES.THEME_BG_SAT_MAX",
    "a": "      h: hsl.h + 180,\n      s: Math.min(AJUSTES.THEME_BG_SAT_MAX"
  },
  {
    "etiqueta": "el velo general vuelve a llevar sus canales a mano",
    "archivo": "src/pip/pip.css",
    "de": "rgba(var(--ytmpip-bg-rgb), 0.55) 0%, rgba(var(--ytmpip-bg-rgb), 0.88) 100%",
    "a": "rgba(15, 15, 15, 0.55) 0%, rgba(15, 15, 15, 0.88) 100%"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
