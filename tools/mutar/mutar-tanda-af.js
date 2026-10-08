/*
 * Verificacion por MUTACION de la tanda AF: open() dice que paso
 * («opened», «respaldo», «sin-extension»), una ventana de respaldo como
 * mucho (getContexts) y el muestreo del color que se olvida al reabrir.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/(delib.)/1/1/1
 *
 * DELIBERADA: el `return "respaldo"` temprano de intentarAbrir. Sin el, el
 * resultado es el mismo (cae al `return result`); lo unico que evita es un
 * console.warn de «no se pudo abrir» que seria mentira. Las pruebas no
 * miran la consola del service worker.
 * FUERA A SABIENDAS: el filtro documentUrls de getContexts. El chrome falso
 * del banco no filtra por URL (devuelve lo que se le da), asi que mutarlo
 * no probaria nada.
 *
 * REFIJADA la PRUEBA, no la prediccion, tras la primera pasada: el olvido
 * del muestreo VIVIO porque en jsdom los temporizadores de la ventana
 * «muerta» seguian vivos y su muestreo hacia la lectura por la nueva. La
 * prueba ahora los mata (en Chrome mueren con la ventana).
 *
 * Arnes comun: tools/mutar/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/pip-tema.test.js",
  "tests/unit/pip-lanzador.test.js",
  "tests/unit/pip-apertura.test.js",
  "tests/unit/service-worker.test.js",
  "tests/unit/popup.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "reabrir no olvida el muestreo de una ventana muerta sin pagehide",
    "archivo": "src/pip/pip.js",
    "de": "     */\n    muestreoFuenteTimer = null;\n    colorFuenteObjetivo = null;\n    colorFuenteActual = null;\n    colorFuenteMs = 0;\n    portadaSondeada = \"\";\n",
    "a": "     */\n",
    "esperadas": 1
  },
  {
    "etiqueta": "sin Document PiP, open() dice «opened»",
    "archivo": "src/pip/pip.js",
    "de": "      requestFallbackWindow();\n      return \"respaldo\";",
    "a": "      requestFallbackWindow();\n      return \"opened\";",
    "esperadas": 1
  },
  {
    "etiqueta": "con la extension recargada, open() dice «opened»",
    "archivo": "src/pip/pip.js",
    "de": "      return \"sin-extension\";",
    "a": "      return \"opened\";",
    "esperadas": 1
  },
  {
    "etiqueta": "con la ventana ya abierta, open() no dice nada",
    "archivo": "src/pip/pip.js",
    "de": "      pipWindow.focus();\n      return \"opened\";",
    "a": "      pipWindow.focus();\n      return;",
    "esperadas": 1
  },
  {
    "etiqueta": "al abrir, open() no dice nada",
    "archivo": "src/pip/pip.js",
    "de": "    if (lastState) render(lastState);\n    return \"opened\";\n  }",
    "a": "    if (lastState) render(lastState);\n    return;\n  }",
    "esperadas": 1
  },
  {
    "etiqueta": "el service worker vuelve a tirar lo que dice open()",
    "archivo": "src/background/service-worker.js",
    "de": "        (que) => que || \"opened\",",
    "a": "        () => \"opened\",",
    "esperadas": 1
  },
  {
    "etiqueta": "«respaldo» cae al aviso de fallo (solo cambia la consola)",
    "archivo": "src/background/service-worker.js",
    "de": "  if (result === \"respaldo\") return \"respaldo\";",
    "a": "",
    "deliberada": true
  },
  {
    "etiqueta": "con una ventana de respaldo abierta, se abre otra",
    "archivo": "src/background/service-worker.js",
    "de": "  if (abierta !== null) {",
    "a": "  if (false) {",
    "esperadas": 1
  },
  {
    "etiqueta": "getContexts no se mira",
    "archivo": "src/background/service-worker.js",
    "de": "    return contextos.length && typeof contextos[0].windowId === \"number\" ? contextos[0].windowId : null;",
    "a": "    return null;",
    "esperadas": 1
  },
  {
    "etiqueta": "el menu no dice que el es la ventana de respaldo",
    "archivo": "src/popup/popup.js",
    "de": "        else if (que === \"respaldo\") els.status.textContent = t(\"sin_ventana_flotante\");\n",
    "a": "",
    "esperadas": 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
