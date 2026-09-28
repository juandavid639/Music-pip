/*
 * Verificacion por MUTACION de la tanda Z: la forma del espectro (barras,
 * onda o anillo alrededor de la caratula).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   7/2/2/1/2/1/1/1/1/1/1/1
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
  "tests/unit/pip-espectro.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js",
  "tests/unit/opciones-en-vivo.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran las formas nuevas",
    "archivo": "src/shared/settings.js",
    "de": "[\"bars\", \"wave\", \"ring\"]",
    "a": "[\"bars\"]"
  },
  {
    "etiqueta": "la onda se pinta como barras",
    "archivo": "src/pip/pip.js",
    "de": "      if (forma === \"wave\") {",
    "a": "      if (false) {"
  },
  {
    "etiqueta": "el anillo no busca la caratula",
    "archivo": "src/pip/pip.js",
    "de": "      const caratula = forma === \"ring\" ? cajaDeLaCaratula(caja, escala) : null;",
    "a": "      const caratula = null;"
  },
  {
    "etiqueta": "el plan B del anillo usa la ventana entera",
    "archivo": "src/pip/pip.js",
    "de": "        const banda = forma === \"ring\" ? Math.round((alto * preferencias.spectrumHeight) / 100) : alto;",
    "a": "        const banda = alto;"
  },
  {
    "etiqueta": "el anillo pierde el espejo",
    "archivo": "src/pip/pip.js",
    "de": "[-Math.PI / 2 + t * Math.PI, -Math.PI / 2 - t * Math.PI]",
    "a": "[-Math.PI / 2 + t * Math.PI]"
  },
  {
    "etiqueta": "los rayos pintan sobre la caratula",
    "archivo": "src/pip/pip.js",
    "de": "    contexto.clip(\"evenodd\");",
    "a": "    ;"
  },
  {
    "etiqueta": "el recorte se queda puesto",
    "archivo": "src/pip/pip.js",
    "de": "    contexto.restore();\n",
    "a": ""
  },
  {
    "etiqueta": "el lienzo del anillo se queda en la banda",
    "archivo": "src/pip/pip.js",
    "de": "settings.spectrumStyle === \"ring\");",
    "a": "false);"
  },
  {
    "etiqueta": "la hoja pierde el lienzo a pantalla completa",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-spectrum.ytmpip-espectro-anillo {\n  top: 0;\n  height: 100%;\n}",
    "a": ".ytmpip-spectrum.ytmpip-espectro-anillo {\n}"
  },
  {
    "etiqueta": "el silencio de la onda desaparece",
    "archivo": "src/pip/pip.js",
    "de": "      y: alto - Math.max(1, (valor / 255) * alto)",
    "a": "      y: alto - (valor / 255) * alto"
  },
  {
    "etiqueta": "Preferencias no guarda la forma",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.SPECTRUM_STYLE]: fields.spectrumStyle.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga la forma",
    "archivo": "src/options/options.js",
    "de": "      fields.spectrumStyle.value = stored[STORAGE_KEYS.SPECTRUM_STYLE] ?? DEFAULT_SETTINGS.spectrumStyle;\n",
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
