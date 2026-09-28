/*
 * Verificacion por MUTACION de la tanda X: el revisor del zip (lee el
 * directorio central), la version minima de Node y la integracion
 * continua.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/2/1/1
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/revisar-zip.test.js", "tests/unit/andamiaje.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "no se saltan los campos extra",
    "archivo": "tools/revisar-zip.js",
    "de": "    pos += 46 + largoNombre + largoExtra + largoComentario;",
    "a": "    pos += 46 + largoNombre + largoComentario;"
  },
  {
    "etiqueta": "no se salta el comentario de la entrada",
    "archivo": "tools/revisar-zip.js",
    "de": "    pos += 46 + largoNombre + largoExtra + largoComentario;",
    "a": "    pos += 46 + largoNombre + largoExtra;"
  },
  {
    "etiqueta": "el fin de directorio solo se busca pegado al final",
    "archivo": "tools/revisar-zip.js",
    "de": "for (let i = zip.length - 22; i >= desde; i--)",
    "a": "for (let i = zip.length - 22; i >= zip.length - 22; i--)"
  },
  {
    "etiqueta": "no se comprueba la firma de cada entrada central",
    "archivo": "tools/revisar-zip.js",
    "de": "if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== ENTRADA_CENTRAL) {",
    "a": "if (pos + 46 > zip.length) {"
  },
  {
    "etiqueta": "lo que no es zip pasa como zip vacio",
    "archivo": "tools/revisar-zip.js",
    "de": "  if (eocd === -1) throw new Error(\"no hay registro de fin de directorio central: no es un zip\");",
    "a": "  if (eocd === -1) return [];"
  },
  {
    "etiqueta": "tests/ deja de estar prohibido",
    "archivo": "tools/revisar-zip.js",
    "de": "/^(tools|tests|node_modules",
    "a": "/^(tools|node_modules"
  },
  {
    "etiqueta": "package.json deja de exigir Node 21 (la 1.0.1)",
    "archivo": "package.json",
    "de": "  \"engines\": {\n    \"node\": \">=21\"\n  },\n",
    "a": ""
  },
  {
    "etiqueta": "la integracion continua usa Node 20",
    "archivo": ".github/workflows/pruebas.yml",
    "de": "node-version: 22",
    "a": "node-version: 20"
  },
  {
    "etiqueta": "la integracion continua no corre las pruebas",
    "archivo": ".github/workflows/pruebas.yml",
    "de": "      - run: npm test",
    "a": "      - run: echo nada"
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
