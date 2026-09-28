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
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
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

function pruebasQueFallan() {
  let salida;
  try {
    execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...PRUEBAS], {
      cwd: RAIZ,
      stdio: "pipe",
      encoding: "utf8"
    });
    return [];
  } catch (err) {
    salida = String(err.stdout || "");
  }
  const nombres = [];
  for (const linea of salida.split(/\r?\n/)) {
    const m = /^\s*not ok \d+ - (.+?)\s*$/.exec(linea);
    if (m && !m[1].endsWith(".test.js")) nombres.push(m[1]);
  }
  return nombres;
}

let sobreviven = 0;
let muertas = 0;

if (pruebasQueFallan().length) {
  console.error("La suite no esta en verde SIN mutar. Arregla eso antes de mutar nada.");
  process.exit(1);
}

for (const m of MUTACIONES) {
  const ruta = path.join(RAIZ, m.archivo);
  const original = fs.readFileSync(ruta, "utf8");
  if (!original.includes(m.de)) {
    console.error(`  ??  ${m.etiqueta}\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);
    sobreviven++;
    continue;
  }
  fs.writeFileSync(ruta, original.replace(m.de, m.a));
  let caidas;
  try {
    caidas = pruebasQueFallan();
  } finally {
    fs.writeFileSync(ruta, original);
  }
  if (!caidas.length) {
    sobreviven++;
    console.error(`  VIVE  ${m.etiqueta}`);
  } else {
    muertas++;
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.join(" | ")}`);
  }
}

console.log(`\n${muertas} de ${MUTACIONES.length} mutaciones detectadas; ${sobreviven} sobreviven.`);
process.exit(sobreviven ? 1 : 0);
