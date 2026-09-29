/*
 * Verificacion por MUTACION de la tanda AA: la caratula en disco de vinilo.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   3/2/1/1/1/1/1/1/1/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/pip-vinilo.test.js",
  "tests/unit/pip-espectro.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran el vinilo",
    "archivo": "src/shared/settings.js",
    "de": "[\"square\", \"vinyl\"]",
    "a": "[\"square\"]"
  },
  {
    "etiqueta": "la raiz no se entera del vinilo",
    "archivo": "src/pip/pip.js",
    "de": "settings.coverStyle === \"vinyl\");",
    "a": "false);"
  },
  {
    "etiqueta": "la raiz no dice si suena",
    "archivo": "src/pip/pip.js",
    "de": "    els.root.classList.toggle(\"ytmpip-sonando\", Boolean(state.playing));",
    "a": "    ;"
  },
  {
    "etiqueta": "el giro pisa el latido (transform)",
    "archivo": "src/pip/pip.css",
    "de": "    rotate: 360deg;",
    "a": "    transform: rotate(360deg);"
  },
  {
    "etiqueta": "el disco gira aunque no suene",
    "archivo": "src/pip/pip.css",
    "de": "  animation-play-state: paused;\n",
    "a": ""
  },
  {
    "etiqueta": "el disco no arranca al sonar",
    "archivo": "src/pip/pip.css",
    "de": "  animation-play-state: running;",
    "a": "  animation-play-state: paused;"
  },
  {
    "etiqueta": "la regla del disco pierde contra la ampliada",
    "archivo": "src/pip/pip.css",
    "de": "#ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n  aspect-ratio: 1;",
    "a": "#ytmpip-root.ytmpip-vinilo .ytmpip-artwork {\n  aspect-ratio: 1;"
  },
  {
    "etiqueta": "con menos movimiento el disco sigue girando",
    "archivo": "src/pip/pip.css",
    "de": "  #ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n    animation: none;",
    "a": "  #ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n    animation: ytmpip-girar 8s linear infinite;"
  },
  {
    "etiqueta": "el disco pierde el agujero",
    "archivo": "src/pip/pip.css",
    "de": "  -webkit-mask-image: radial-gradient(circle, transparent 0 6%, #000 6.5%);\n  mask-image: radial-gradient(circle, transparent 0 6%, #000 6.5%);\n",
    "a": ""
  },
  {
    "etiqueta": "el anillo recorta el cuadrado aunque la caratula sea un disco",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    if (caratula.redonda) {",
    "a": "    if (false) {"
  },
  {
    "etiqueta": "Preferencias no guarda la caratula",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.COVER_STYLE]: fields.coverStyle.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga la caratula",
    "archivo": "src/options/options.js",
    "de": "      fields.coverStyle.value = stored[STORAGE_KEYS.COVER_STYLE] ?? DEFAULT_SETTINGS.coverStyle;\n",
    "a": ""
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
