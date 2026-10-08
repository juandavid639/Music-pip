/*
 * Verificacion por MUTACION de quien despierta a las preferencias
 * (CLAVES_QUE_SE_APLICAN en src/shared/settings.js, tanda S).
 *
 * El fallo de la 1.0.1 era una AUSENCIA: una clave que faltaba en una
 * lista. Por eso casi todas las mutaciones quitan o añaden una clave; la
 * pregunta es si el censo de tests/unit/settings-recargas.test.js se
 * entera de cada olvido, no solo del que ya paso.
 *
 * Prediccion fijada ANTES de correr (solo cuenta el archivo nuevo):
 *   estado fuera de la lista ........ 2 (regresion + cada clave)
 *   version de esquema fuera ........ 1 (cada clave)
 *   sin mirar la zona de storage .... 1 (otra zona)
 *   el tema excluido por error ...... 2 (cada clave + junto al estado)
 *
 * Mismo arnes que tools/mutar/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/settings-recargas.test.js"];

const MUTACIONES = [
  {
    etiqueta: "el estado del service worker vuelve a despertar a todos (la 1.0.1)",
    archivo: "src/shared/settings.js",
    // Reapuntadas en la tanda AU: desde la AT la lista acaba en el historial.
    de: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION,\n    STORAGE_KEYS.LAST_KNOWN_STATE,\n",
    a: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION,\n"
  },
  {
    etiqueta: "la version de esquema despierta a todos",
    archivo: "src/shared/settings.js",
    de: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION,\n    STORAGE_KEYS.LAST_KNOWN_STATE,",
    a: "    STORAGE_KEYS.LAST_KNOWN_STATE,"
  },
  {
    etiqueta: "se escuchan cambios de cualquier zona de storage",
    archivo: "src/shared/settings.js",
    de: '        if (areaName !== "local") return;',
    a: "        ;"
  },
  {
    etiqueta: "una preferencia (el tema) excluida por error: deja de aplicarse en vivo",
    archivo: "src/shared/settings.js",
    de: "    STORAGE_KEYS.LISTENING_HISTORY\n  ];",
    a: "    STORAGE_KEYS.LISTENING_HISTORY,\n    STORAGE_KEYS.THEME\n  ];"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
