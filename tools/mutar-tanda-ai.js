/*
 * Verificacion por MUTACION de la tanda AI: el relevo del content script
 * huerfano y la puerta ytmpip:open-pip cerrada.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/2/1/2
 *
 * «retirarse deja el observador puesto»: la prueba que lo ve es la que
 * cambia una clase del <body> tras retirarse. «deja las escuchas»: la del
 * MetadataReader y la del temporizador de apagado.
 * La puerta cerrada no se puede mutar como ausencia; la vigila
 * pip-sin-puerta.test.js (y su premisa, que el boton si abre).
 *
 * REFIJADA tras la primera pasada (6 de 8 exactos): «deja el observador
 * puesto» VIVIO: la prueba cambiaba el DOM pero el latido siguiente ya se
 * retiraba por la guarda del temporizador. El observador importa por otra
 * cosa: en cada cambio re-engancha las escuchas del <video>, y con ellas el
 * temporizador de apagado del huerfano. La prueba del temporizador cambia
 * ahora el DOM antes del latido. «deja las escuchas» cayo en 1, no en 2: la
 * del MetadataReader no la ve por la misma guarda.
 * Prediccion: 1/1/1/1/1/1/1/2
 *
 * Arnes comun: tools/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/content-relevo.test.js",
  "tests/unit/pip-sin-puerta.test.js",
  "tests/unit/pip-apertura.test.js",
  "tests/unit/service-worker.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "no se anuncia el relevo",
    "archivo": "src/content/content-script.js",
    "de": "  document.dispatchEvent(new Event(EVENTO_RELEVO));\n",
    "a": "",
    "esperadas": 1
  },
  {
    "etiqueta": "una copia viva tambien se retira",
    "archivo": "src/content/content-script.js",
    "de": "    if (YTMPip.isContextValid()) return;\n    relevado = true;",
    "a": "    relevado = true;",
    "esperadas": 1
  },
  {
    "etiqueta": "el huerfano abandona su ventana abierta",
    "archivo": "src/content/content-script.js",
    "de": "    if (!ventanaAbierta()) retirarse();\n  }",
    "a": "    retirarse();\n  }",
    "esperadas": 1
  },
  {
    "etiqueta": "cerrada la ventana, el huerfano no se retira",
    "archivo": "src/content/content-script.js",
    "de": "        if (relevado && !ventanaAbierta()) {",
    "a": "        if (false) {",
    "esperadas": 1
  },
  {
    "etiqueta": "retirarse deja el observador puesto",
    "archivo": "src/content/content-script.js",
    "de": "    if (observer) observer.disconnect();\n",
    "a": "",
    "esperadas": 1
  },
  {
    "etiqueta": "retirarse deja las escuchas del <video>",
    "archivo": "src/content/content-script.js",
    "de": "    if (mediaElement) MEDIA_EVENTS.forEach((evt) => mediaElement.removeEventListener(evt, onMediaEvent));\n",
    "a": "",
    "esperadas": 1
  },
  {
    "etiqueta": "estaAbierta miente",
    "archivo": "src/pip/pip.js",
    "de": "    estaAbierta: () => Boolean(pipWindow && !pipWindow.closed),",
    "a": "    estaAbierta: () => false,",
    "esperadas": 1
  },
  {
    "etiqueta": "sin script, el service worker ya no da script",
    "archivo": "src/background/service-worker.js",
    "de": "  if (result === \"sin-script\" && (await inyectarSiFalta(target)) === \"inyectada\") {",
    "a": "  if (result === \"otra-cosa\" && (await inyectarSiFalta(target)) === \"inyectada\") {",
    "esperadas": 2
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
