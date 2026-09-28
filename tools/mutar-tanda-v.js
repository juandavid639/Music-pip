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
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
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
    "de": ".filter((clave) => self.YTMPip.Settings.seAplica(clave))",
    "a": ".filter(() => true)"
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
