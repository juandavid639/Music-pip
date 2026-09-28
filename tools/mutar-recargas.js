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
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/settings-recargas.test.js"];

const MUTACIONES = [
  {
    etiqueta: "el estado del service worker vuelve a despertar a todos (la 1.0.1)",
    archivo: "src/shared/settings.js",
    de: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION,\n    STORAGE_KEYS.LAST_KNOWN_STATE\n  ];",
    a: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION\n  ];"
  },
  {
    etiqueta: "la version de esquema despierta a todos",
    archivo: "src/shared/settings.js",
    de: "    STORAGE_KEYS.SELECTOR_SCHEMA_VERSION,\n    STORAGE_KEYS.LAST_KNOWN_STATE\n  ];",
    a: "    STORAGE_KEYS.LAST_KNOWN_STATE\n  ];"
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
    de: "    STORAGE_KEYS.LAST_KNOWN_STATE\n  ];",
    a: "    STORAGE_KEYS.LAST_KNOWN_STATE,\n    STORAGE_KEYS.THEME\n  ];"
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
