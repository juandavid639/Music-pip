/*
 * Verificacion por MUTACION del arreglo del lanzador.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que
 * alguna prueba se entera. Una mutacion que sobrevive es una prueba que no
 * existe, por mucho que la suite este en verde.
 *
 * Mismo arnes que tools/mutar-espectro.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-lanzador.test.js"];

const MUTACIONES = [
  {
    etiqueta: "destacarLanzador no crea el boton si no esta",
    archivo: "src/pip/pip.js",
    de: "  function destacarLanzador() {\n    ensureLauncherButton();",
    a: "  function destacarLanzador() {"
  },
  {
    etiqueta: "destacarLanzador miente: dice que si aunque no haya boton",
    archivo: "src/pip/pip.js",
    de: "    if (!btn) return false;",
    a: "    if (!btn) return true;"
  },
  {
    etiqueta: "se cae la guarda de animate (revienta donde no hay Web Animations)",
    archivo: "src/pip/pip.js",
    de: '    if (typeof btn.animate !== "function") return true;',
    a: ";"
  },
  {
    etiqueta: "el parpadeo ocurre una sola vez y se pierde de vista",
    archivo: "src/pip/pip.js",
    de: "{ duration: 600, iterations: 3 }",
    a: "{ duration: 600, iterations: 1 }"
  },
  {
    etiqueta: "la animacion se queda con un solo fotograma",
    archivo: "src/pip/pip.js",
    de: '        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" },\n        { transform: "scale(1.18)", boxShadow: "0 0 0 12px rgba(241,90,90,.35)" },\n        { transform: "scale(1)", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }',
    a: '        { transform: "scale(1)" }'
  },
  {
    etiqueta: "el lanzador se duplica en cada aviso",
    archivo: "src/pip/pip.js",
    de: "    if (!document.body || document.getElementById(LAUNCHER_ID)) return;",
    a: "    if (!document.body) return;"
  },
  {
    etiqueta: "PipView deja de exponer destacarLanzador al service worker",
    archivo: "src/pip/pip.js",
    de: "    destacarLanzador: destacarLanzador,",
    a: ""
  },
  {
    etiqueta: "open() deja de ser async (el .then del service worker revienta)",
    archivo: "src/pip/pip.js",
    de: "  async function openPip() {",
    a: "  function openPip() {"
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
