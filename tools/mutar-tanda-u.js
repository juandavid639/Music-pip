/*
 * Verificacion por MUTACION de la tanda U: la ventana flotante (barra de
 * tiempo con teclado, lo que openPip reinicia, una apertura en curso como
 * mucho, la linea en vivo con teclado) y el idioma que declara aplicar().
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1/1/2/1/1
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-apertura.test.js", "tests/unit/localizacion.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "cualquier tecla sobre la barra empieza un arrastre (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "      if (TECLAS_DEL_DESLIZADOR.indexOf(event.key) !== -1) empezar();",
    "a": "      empezar();"
  },
  {
    "etiqueta": "soltar la tecla no termina el arrastre",
    "archivo": "src/pip/pip.js",
    "de": "    els.seek.addEventListener(\"keyup\", terminar);",
    "a": ""
  },
  {
    "etiqueta": "seeking no se reinicia al abrir (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    seeking = false;\n    changingVolume = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";",
    "a": "    changingVolume = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";"
  },
  {
    "etiqueta": "changingVolume no se reinicia al abrir (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    seeking = false;\n    changingVolume = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";",
    "a": "    seeking = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";"
  },
  {
    "etiqueta": "la firma de la cola no se reinicia al abrir (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    seeking = false;\n    changingVolume = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";",
    "a": "    seeking = false;\n    changingVolume = false;\n    lastSongKey = \"\";"
  },
  {
    "etiqueta": "la ultima cancion no se reinicia al abrir (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    seeking = false;\n    changingVolume = false;\n    lastQueueSignature = null;\n    lastSongKey = \"\";",
    "a": "    seeking = false;\n    changingVolume = false;\n    lastQueueSignature = null;"
  },
  {
    "etiqueta": "sin guarda de apertura en curso (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "    if (aperturaEnCurso) return aperturaEnCurso;",
    "a": "    ;"
  },
  {
    "etiqueta": "el tiempo vuelve a decir «de» a mano (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "t(\"tiempo_de_total\", [formatTime(linea.elapsed), formatTime(linea.duration)])",
    "a": "`${formatTime(linea.elapsed)} de ${formatTime(linea.duration)}`"
  },
  {
    "etiqueta": "aplicar() no declara el idioma (la 1.0.1)",
    "archivo": "src/shared/textos.js",
    "de": "      if (idioma !== null) raiz.setAttribute(\"lang\", idioma);",
    "a": "      ;"
  },
  {
    "etiqueta": "la linea en vivo no oye al teclado (la 1.0.1)",
    "archivo": "src/pip/pip.js",
    "de": "        if (event.key !== \"Enter\" && event.key !== \" \") return;\n        event.preventDefault();\n        desplegar();",
    "a": "        return;"
  },
  {
    "etiqueta": "la linea en vivo pierde su rol de boton en el HTML (la 1.0.1)",
    "archivo": "src/pip/pip.html",
    "de": "hidden role=\"button\" tabindex=\"0\" title=\"Abrir la letra completa\"",
    "a": "hidden title=\"Abrir la letra completa\""
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
