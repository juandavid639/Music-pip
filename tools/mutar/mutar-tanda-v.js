/*
 * Verificacion por MUTACION de la tanda V: el ecualizador consulta la
 * capacidad del sitio, Preferencias se repinta con lo que escriben otros
 * contextos, y la memoria por cancion se entera de las otras pestañas.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/4/1/1/1/2/1/1/1
 *
 * Fuera a sabiendas: «sin capacidades publicadas se veta» (tumbaria casi
 * todo audio-grafo.test.js, que monta sin adaptador; no se sabe predecir
 * exacto) y «audioGrafo === true» en vez de «!== false» (equivalente con
 * capacidades booleanas, que el registro ya exige).
 *
 * Mismo arnes que tools/mutar/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/audio-grafo.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/ecualizador-por-cancion.test.js",
  "tests/unit/settings-recargas.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "el ecualizador no consulta la capacidad del sitio (la 1.0.1)",
    "archivo": "src/content/audio-grafo.js",
    "de": "!video.mediaKeys && hayWebAudio() && sitioLoAdmite();",
    "a": "!video.mediaKeys && hayWebAudio();"
  },
  {
    "etiqueta": "Preferencias no se repinta con lo que escribe otro (la 1.0.1)",
    "archivo": "src/options/options.js",
    "de": "        if (esEco(soloVisibles)) return;\n        load();",
    "a": "        if (esEco(soloVisibles)) return;"
  },
  {
    "etiqueta": "Preferencias se repinta con claves que no se aplican",
    "archivo": "src/options/options.js",
    "de": "Object.keys(cambios).filter((clave) => self.YTMPip.Settings.seAplica(clave))",
    "a": "Object.keys(cambios).filter(() => true)"
  },
  {
    "etiqueta": "Preferencias se repinta con su propio eco",
    "archivo": "src/options/options.js",
    "de": "        if (esEco(soloVisibles)) return;",
    "a": "        ;"
  },
  {
    "etiqueta": "Preferencias escucha cualquier zona de storage",
    "archivo": "src/options/options.js",
    "de": "        if (zona !== \"local\") return;\n        const visibles",
    "a": "        const visibles"
  },
  {
    "etiqueta": "la memoria por cancion no vigila a las otras pestañas (la 1.0.1)",
    "archivo": "src/content/ecualizador-por-cancion.js",
    "de": "  vigilar();\n  cargar();",
    "a": "  cargar();"
  },
  {
    "etiqueta": "lo que llega de otra pestaña entra sin sanear",
    "archivo": "src/content/ecualizador-por-cancion.js",
    "de": "memoria = normalizarMemoria(cambios[KEY].newValue);",
    "a": "memoria = new Map(cambios[KEY].newValue);"
  },
  {
    "etiqueta": "la memoria por cancion escucha cualquier zona",
    "archivo": "src/content/ecualizador-por-cancion.js",
    "de": "if (zona !== \"local\" || !cambios[KEY]) return;",
    "a": "if (!cambios[KEY]) return;"
  },
  {
    "etiqueta": "seAplica dice que si a todo",
    "archivo": "src/shared/settings.js",
    "de": "seAplica: (clave) => CLAVES_QUE_SE_APLICAN.indexOf(clave) !== -1",
    "a": "seAplica: () => true"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
