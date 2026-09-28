/*
 * Verificacion por MUTACION de la tanda AB: el fundido entre caratulas.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/2/1/1/1/1/1/1/1/1/1/2
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-fundido.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "la misma portada crea copia cada vez",
    "archivo": "src/pip/pip.js",
    "de": "    if (vieja === nueva) return;",
    "a": "    ;"
  },
  {
    "etiqueta": "la primera portada tambien funde",
    "archivo": "src/pip/pip.js",
    "de": "    if (!vieja || !pipWindow || menosMovimiento()) return;",
    "a": "    if (!pipWindow || menosMovimiento()) return;"
  },
  {
    "etiqueta": "se funde aunque se pida menos movimiento",
    "archivo": "src/pip/pip.js",
    "de": "    if (!vieja || !pipWindow || menosMovimiento()) return;",
    "a": "    if (!vieja || !pipWindow) return;"
  },
  {
    "etiqueta": "las copias se amontonan",
    "archivo": "src/pip/pip.js",
    "de": "    escenario.querySelectorAll(\".ytmpip-saliente\").forEach((c) => c.remove());\n",
    "a": ""
  },
  {
    "etiqueta": "el lector lee las dos portadas",
    "archivo": "src/pip/pip.js",
    "de": "    copia.setAttribute(\"aria-hidden\", \"true\");\n",
    "a": ""
  },
  {
    "etiqueta": "dos elementos con el mismo id",
    "archivo": "src/pip/pip.js",
    "de": "    copia.removeAttribute(\"id\");\n",
    "a": ""
  },
  {
    "etiqueta": "la copia gira desde cero con el vinilo",
    "archivo": "src/pip/pip.js",
    "de": "    copia.style.animation = \"none\";\n",
    "a": ""
  },
  {
    "etiqueta": "la copia nunca se desvanece",
    "archivo": "src/pip/pip.js",
    "de": "      copia.classList.add(\"ytmpip-desvaneciendo\");\n",
    "a": ""
  },
  {
    "etiqueta": "la copia se queda para siempre",
    "archivo": "src/pip/pip.js",
    "de": "      pipWindow.setTimeout(() => copia.remove(), FUNDIDO_MS + 100);",
    "a": "      ;"
  },
  {
    "etiqueta": "la copia no se pone encima en el mismo sitio",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente {\n  position: absolute;\n",
    "a": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente {\n"
  },
  {
    "etiqueta": "desvanecerse no la desvanece",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente.ytmpip-desvaneciendo {\n  opacity: 0;",
    "a": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente.ytmpip-desvaneciendo {\n  opacity: 1;"
  },
  {
    "etiqueta": "la copia lleva la portada nueva y no la vieja",
    "archivo": "src/pip/pip.js",
    "de": "    copia.src = vieja;\n",
    "a": ""
  }
];

/*
 * Escribir con reintentos. OneDrive bloquea un archivo unos instantes
 * mientras lo sincroniza, y en la primera pasada de esta tanda un bloqueo
 * cayo JUSTO en la restauracion: constants.js se quedo mutado y hubo que
 * devolverlo a mano. Un error de escritura aqui no es «la mutacion fallo»,
 * es «vuelve a intentarlo en un momento».
 */
function escribir(ruta, texto) {
  for (let intento = 1; ; intento++) {
    try {
      fs.writeFileSync(ruta, texto);
      return;
    } catch (err) {
      if (intento >= 40) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

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
  escribir(ruta, original.replace(m.de, m.a));
  let caidas;
  try {
    caidas = pruebasQueFallan();
  } finally {
    escribir(ruta, original);
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
