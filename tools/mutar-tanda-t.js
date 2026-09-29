/*
 * Verificacion por MUTACION de la tanda T: el service worker (pestaña
 * recordada, estado filtrado, reinyeccion, respuestas honestas), la
 * adopcion del lanzador en pip.js y el aviso del menu.
 *
 * Las marcadas «(la 1.0.1)» devuelven una regla a como estaba: son las
 * que demuestran que cada prueba de regresion sabe ponerse en rojo.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   4/4/1/1/1/1/2/1/1/2/1/2/1/1/1/1/1/2
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/service-worker.test.js",
  "tests/unit/pip-lanzador.test.js",
  "tests/unit/popup.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "la pestaña recordada no se lee de storage.session al despertar (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "      const guardado = await chrome.storage.session.get(CLAVE_PESTANA);",
    "a": "      const guardado = {};"
  },
  {
    "etiqueta": "la pestaña recordada no se escribe en storage.session",
    "archivo": "src/background/service-worker.js",
    "de": ": chrome.storage.session.set({ [CLAVE_PESTANA]: musicTabId });",
    "a": ": null;"
  },
  {
    "etiqueta": "cargar vuelve a quedarse el puesto sin preguntar (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "if (typeof id === \"number\" && recordada === null) recordarPestana(id);",
    "a": "if (typeof id === \"number\") recordarPestana(id);"
  },
  {
    "etiqueta": "cualquier pestaña vuelve a escribir el estado (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "            if (!suena && recordada !== null) return;",
    "a": "            ;"
  },
  {
    "etiqueta": "sonar deja de ganar el puesto",
    "archivo": "src/background/service-worker.js",
    "de": "            if (!suena && recordada !== null) return;",
    "a": "            if (recordada !== null) return;"
  },
  {
    "etiqueta": "cerrar compara con la variable, no con la recordada (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "  if (tabId !== (await pestanaRecordada())) return;\n  recordarPestana(null);\n  chrome.storage.local.set",
    "a": "  if (tabId !== musicTabId) return;\n  recordarPestana(null);\n  chrome.storage.local.set"
  },
  {
    "etiqueta": "no se reinyecta al actualizar (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "if (details.reason === \"install\" || details.reason === \"update\") {",
    "a": "if (details.reason === \"install\") {"
  },
  {
    "etiqueta": "se inyecta tambien en la pestaña que esta cargando",
    "archivo": "src/background/service-worker.js",
    "de": "  if (tab.discarded || tab.status !== \"complete\") return \"omitida\";",
    "a": "  if (tab.discarded) return \"omitida\";"
  },
  {
    "etiqueta": "se inyecta sin mirar si ya hay script vivo (dos copias en un mundo)",
    "archivo": "src/background/service-worker.js",
    "de": "    if (await tieneScriptVivo(tab.id)) return \"viva\";",
    "a": "    ;"
  },
  {
    "etiqueta": "los mensajes no reintentan tras dar script",
    "archivo": "src/background/service-worker.js",
    "de": "    if ((await inyectarSiFalta(tab)) !== \"inyectada\") throw err;\n    return chrome.tabs.sendMessage(tab.id, mensaje);",
    "a": "    throw err;"
  },
  {
    "etiqueta": "el icono da script pero no vuelve a intentar abrir",
    "archivo": "src/background/service-worker.js",
    "de": "    result = await openPipOnTab(target);\n  }",
    "a": "  }"
  },
  {
    "etiqueta": "el menu vuelve a recibir ok:true siempre (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "sendResponse({ ok: result === \"opened\", result, tabId: tab.id })",
    "a": "sendResponse({ ok: true, result, tabId: tab.id })"
  },
  {
    "etiqueta": "la ventana de respaldo pierde su catch (la 1.0.1)",
    "archivo": "src/background/service-worker.js",
    "de": "        .then(() => sendResponse({ ok: true }))\n        .catch((err) => sendResponse({ ok: false, reason: String(err) }));",
    "a": "        .then(() => sendResponse({ ok: true }));"
  },
  {
    "etiqueta": "pip.js: el huerfano tambien pone y roba boton",
    "archivo": "src/pip/pip.js",
    "de": "    if (!document.body || !YTMPip.isContextValid()) return;",
    "a": "    if (!document.body) return;"
  },
  {
    "etiqueta": "pip.js: la comprobacion de siempre, sin adoptar (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    if (existente && existente === lanzadorPropio) return;",
    "a": "    if (existente) return;"
  },
  {
    "etiqueta": "pip.js: adopta añadiendo en vez de sustituir (dos botones)",
    "archivo": "src/pip/pip.js",
    "de": "    if (existente) existente.replaceWith(btn);\n    else document.body.appendChild(btn);",
    "a": "    document.body.appendChild(btn);"
  },
  {
    "etiqueta": "pip.js: no recuerda cual es el suyo (lo rehace en cada mutacion)",
    "archivo": "src/pip/pip.js",
    "de": "    lanzadorPropio = btn;\n",
    "a": ""
  },
  {
    "etiqueta": "el menu ignora la respuesta de abrir (la 1.0.1)",
    "archivo": "src/popup/popup.js",
    "de": "        const que = respuesta && respuesta.ok === false ? respuesta.result : null;",
    "a": "        const que = null;"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
