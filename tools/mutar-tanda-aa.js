/*
 * Verificacion por MUTACION de la tanda AA: la caratula en disco de vinilo.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   3/2/1/1/1/1/1/1/1/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/pip-vinilo.test.js",
  "tests/unit/pip-espectro.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran el vinilo",
    "archivo": "src/shared/settings.js",
    "de": "[\"square\", \"vinyl\"]",
    "a": "[\"square\"]"
  },
  {
    "etiqueta": "la raiz no se entera del vinilo",
    "archivo": "src/pip/pip.js",
    "de": "settings.coverStyle === \"vinyl\");",
    "a": "false);"
  },
  {
    "etiqueta": "la raiz no dice si suena",
    "archivo": "src/pip/pip.js",
    "de": "    els.root.classList.toggle(\"ytmpip-sonando\", Boolean(state.playing));",
    "a": "    ;"
  },
  {
    "etiqueta": "el giro pisa el latido (transform)",
    "archivo": "src/pip/pip.css",
    "de": "    rotate: 360deg;",
    "a": "    transform: rotate(360deg);"
  },
  {
    "etiqueta": "el disco gira aunque no suene",
    "archivo": "src/pip/pip.css",
    "de": "  animation-play-state: paused;\n",
    "a": ""
  },
  {
    "etiqueta": "el disco no arranca al sonar",
    "archivo": "src/pip/pip.css",
    "de": "  animation-play-state: running;",
    "a": "  animation-play-state: paused;"
  },
  {
    "etiqueta": "la regla del disco pierde contra la ampliada",
    "archivo": "src/pip/pip.css",
    "de": "#ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n  aspect-ratio: 1;",
    "a": "#ytmpip-root.ytmpip-vinilo .ytmpip-artwork {\n  aspect-ratio: 1;"
  },
  {
    "etiqueta": "con menos movimiento el disco sigue girando",
    "archivo": "src/pip/pip.css",
    "de": "  #ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n    animation: none;",
    "a": "  #ytmpip-root.ytmpip-vinilo .ytmpip-stage .ytmpip-artwork {\n    animation: ytmpip-girar 8s linear infinite;"
  },
  {
    "etiqueta": "el disco pierde el agujero",
    "archivo": "src/pip/pip.css",
    "de": "  -webkit-mask-image: radial-gradient(circle, transparent 0 6%, #000 6.5%);\n  mask-image: radial-gradient(circle, transparent 0 6%, #000 6.5%);\n",
    "a": ""
  },
  {
    "etiqueta": "el anillo recorta el cuadrado aunque la caratula sea un disco",
    "archivo": "src/pip/pip.js",
    "de": "    if (caratula.redonda) {",
    "a": "    if (false) {"
  },
  {
    "etiqueta": "Preferencias no guarda la caratula",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.COVER_STYLE]: fields.coverStyle.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga la caratula",
    "archivo": "src/options/options.js",
    "de": "      fields.coverStyle.value = stored[STORAGE_KEYS.COVER_STYLE] ?? DEFAULT_SETTINGS.coverStyle;\n",
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
