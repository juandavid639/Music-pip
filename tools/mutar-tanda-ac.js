/*
 * Verificacion por MUTACION de la tanda AC: el estado en el icono de la
 * barra (▶, ❚❚ o los minutos del temporizador).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1/1/2/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/service-worker.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran el «no enseñarlo»",
    "archivo": "src/shared/settings.js",
    "de": "[\"shown\", \"hidden\"], DEFAULT_SETTINGS.badgePreference",
    "a": "[\"shown\"], DEFAULT_SETTINGS.badgePreference"
  },
  {
    "etiqueta": "el temporizador no manda en el icono",
    "archivo": "src/background/service-worker.js",
    "de": "  if (temporizador && temporizador.remainingMs > 0) {",
    "a": "  if (false) {"
  },
  {
    "etiqueta": "los minutos se redondean hacia abajo",
    "archivo": "src/background/service-worker.js",
    "de": "Math.ceil(temporizador.remainingMs / 60000)",
    "a": "Math.floor(temporizador.remainingMs / 60000)"
  },
  {
    "etiqueta": "un estado desconectado pinta el icono",
    "archivo": "src/background/service-worker.js",
    "de": "  if (!estado || !estado.connected) return \"\";",
    "a": "  if (!estado) return \"\";"
  },
  {
    "etiqueta": "el color no distingue la pausa",
    "archivo": "src/background/service-worker.js",
    "de": "estado && estado.playing ? acentoDelIcono || SPECTRUM_LIMITS.COLOR_SUGGESTED : \"#5f6368\"",
    "a": "acentoDelIcono || SPECTRUM_LIMITS.COLOR_SUGGESTED"
  },
  {
    "etiqueta": "la preferencia guardada no se lee",
    "archivo": "src/background/service-worker.js",
    "de": "      iconoPermitido = guardado[STORAGE_KEYS.BADGE_PREFERENCE] !== \"hidden\";",
    "a": "      iconoPermitido = true;"
  },
  {
    "etiqueta": "cambiar la preferencia no repinta",
    "archivo": "src/background/service-worker.js",
    "de": "      .then((guardado) => pintarIcono(guardado[STORAGE_KEYS.LAST_KNOWN_STATE]))",
    "a": "      .then(() => {})"
  },
  {
    "etiqueta": "cambiar la preferencia no la apunta",
    "archivo": "src/background/service-worker.js",
    "de": "    if (etiqueta) iconoPermitido = etiqueta.newValue !== \"hidden\";",
    "a": "    ;"
  },
  {
    "etiqueta": "el estado nuevo no pinta el icono (la 1.0.2)",
    "archivo": "src/background/service-worker.js",
    "de": "          pintarIcono(message.state);\n",
    "a": ""
  },
  {
    "etiqueta": "cerrar la pestaña deja el icono pintado",
    "archivo": "src/background/service-worker.js",
    "de": "  pintarIcono(null);\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no guarda el icono",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.BADGE_PREFERENCE]: fields.badgePreference.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga el icono",
    "archivo": "src/options/options.js",
    "de": "      fields.badgePreference.value = stored[STORAGE_KEYS.BADGE_PREFERENCE] ?? DEFAULT_SETTINGS.badgePreference;\n",
    "a": ""
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
