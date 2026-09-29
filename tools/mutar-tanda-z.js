/*
 * Verificacion por MUTACION de la tanda Z: la forma del espectro (barras,
 * onda o anillo alrededor de la caratula).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   7/2/2/1/2/1/1/1/1/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/pip-espectro.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js",
  "tests/unit/opciones-en-vivo.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran las formas nuevas",
    "archivo": "src/shared/settings.js",
    "de": "[\"bars\", \"wave\", \"ring\"]",
    "a": "[\"bars\"]"
  },
  {
    "etiqueta": "la onda se pinta como barras",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    if (d.forma === \"wave\") {",
    "a": "    if (false) {"
  },
  {
    "etiqueta": "el anillo no busca la caratula",
    "archivo": "src/pip/pip.js",
    "de": "        caratula: forma === \"ring\" ? cajaDeLaCaratula(caja, escala) : null,",
    "a": "        caratula: null,"
  },
  {
    "etiqueta": "el plan B del anillo usa la ventana entera",
    "archivo": "src/pip/pip.js",
    "de": "        banda: forma === \"ring\" ? Math.round((alto * preferencias.spectrumHeight) / 100) : alto,",
    "a": "        banda: alto,"
  },
  {
    "etiqueta": "el anillo pierde el espejo",
    "archivo": "src/shared/formas-espectro.js",
    "de": "[-Math.PI / 2 + t * Math.PI, -Math.PI / 2 - t * Math.PI]",
    "a": "[-Math.PI / 2 + t * Math.PI]"
  },
  {
    "etiqueta": "los rayos pintan sobre la caratula",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    contexto.clip(\"evenodd\");",
    "a": "    ;"
  },
  {
    "etiqueta": "el recorte se queda puesto",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    contexto.restore();\n",
    "a": ""
  },
  {
    "etiqueta": "el lienzo del anillo se queda en la banda",
    "archivo": "src/pip/pip.js",
    "de": "settings.spectrumStyle === \"ring\");",
    "a": "false);"
  },
  {
    "etiqueta": "la hoja pierde el lienzo a pantalla completa",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-spectrum.ytmpip-espectro-anillo {\n  top: 0;\n  height: 100%;\n}",
    "a": ".ytmpip-spectrum.ytmpip-espectro-anillo {\n}"
  },
  {
    "etiqueta": "el silencio de la onda desaparece",
    "archivo": "src/shared/formas-espectro.js",
    "de": "      y: alto - Math.max(1, (valor / 255) * alto)",
    "a": "      y: alto - (valor / 255) * alto"
  },
  {
    "etiqueta": "Preferencias no guarda la forma",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.SPECTRUM_STYLE]: fields.spectrumStyle.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga la forma",
    "archivo": "src/options/options.js",
    "de": "      fields.spectrumStyle.value = stored[STORAGE_KEYS.SPECTRUM_STYLE] ?? DEFAULT_SETTINGS.spectrumStyle;\n",
    "a": ""
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
