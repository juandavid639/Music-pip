/*
 * Verificacion por MUTACION de la tanda Y: los temas «Automatico» y «Del
 * video o la caratula» (la ventana teñida), con sus cuentas de contraste.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   6/2/1/1/1/2/1/1/1/1/1/1
 *
 * Refijada tras la primera pasada (que se interrumpio por un bloqueo de
 * OneDrive): «reabrir no olvida» SOBREVIVIO porque la prueba cerraba con
 * pagehide, que limpia por otro camino — la prueba pasa a ser la de la
 * ventana que muere sin despedirse (prediccion 1, igual). Y «cambiar de
 * tema no repasa el tinte» mutaba la llamada EQUIVOCADA (el texto aparecia
 * dos veces, avisado con OJO y pasado por alto): cayeron 3; con el ancla
 * buena la prediccion sigue en 1.
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-tema.test.js", "tests/unit/accesibilidad.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran los temas nuevos (la 1.0.2)",
    "archivo": "src/shared/settings.js",
    "de": "[\"dark\", \"light\", \"auto\", \"source\"]",
    "a": "[\"dark\", \"light\"]"
  },
  {
    "etiqueta": "Automatico no pregunta al sistema",
    "archivo": "src/pip/pip.js",
    "de": "    if (tema === \"auto\") return Boolean(sistemaClaro);\n",
    "a": ""
  },
  {
    "etiqueta": "el tema no pide el muestreo por si solo",
    "archivo": "src/pip/pip.js",
    "de": "||\n      settings.theme === MODO_FUENTE;",
    "a": ";"
  },
  {
    "etiqueta": "el baile del video repinta el fondo",
    "archivo": "src/pip/pip.js",
    "de": "    if (!YTMPip.ColorFuente.cambiaElTema(temaPintado, objetivo)) return;",
    "a": "    ;"
  },
  {
    "etiqueta": "reabrir no olvida con que color se tiño",
    "archivo": "src/pip/pip.js",
    "de": "    temaPintado = null;\n",
    "a": ""
  },
  {
    "etiqueta": "sin color no se quita el fondo teñido",
    "archivo": "src/pip/pip.js",
    "de": "      raiz.style.removeProperty(\"--ytmpip-bg-rgb\");\n",
    "a": ""
  },
  {
    "etiqueta": "cambiar de tema no repasa el tinte",
    "archivo": "src/pip/pip.js",
    "de": "    // tiñe con el, o destiñe si el tema dejo de ser «De la caratula».\n    pintarColorFuenteEnTema();\n",
    "a": "    // tiñe con el, o destiñe si el tema dejo de ser «De la caratula».\n"
  },
  {
    "etiqueta": "el acento queda demasiado oscuro para «Sin conexion»",
    "archivo": "src/shared/constants.js",
    "de": "THEME_ACCENT_LUMINANCE: 0.28",
    "a": "THEME_ACCENT_LUMINANCE: 0.2"
  },
  {
    "etiqueta": "el acento queda demasiado claro para la tinta blanca",
    "archivo": "src/shared/constants.js",
    "de": "THEME_ACCENT_LUMINANCE: 0.28",
    "a": "THEME_ACCENT_LUMINANCE: 0.4"
  },
  {
    "etiqueta": "el fondo teñido demasiado claro",
    "archivo": "src/shared/constants.js",
    "de": "THEME_BG_LIGHT: 0.07",
    "a": "THEME_BG_LIGHT: 0.35"
  },
  {
    "etiqueta": "el fondo pierde el tono de la fuente",
    "archivo": "src/shared/color-fuente.js",
    "de": "      h: hsl.h,\n      s: Math.min(AJUSTES.THEME_BG_SAT_MAX",
    "a": "      h: hsl.h + 180,\n      s: Math.min(AJUSTES.THEME_BG_SAT_MAX"
  },
  {
    "etiqueta": "el velo general vuelve a llevar sus canales a mano",
    "archivo": "src/pip/pip.css",
    "de": "rgba(var(--ytmpip-bg-rgb), 0.55) 0%, rgba(var(--ytmpip-bg-rgb), 0.88) 100%",
    "a": "rgba(15, 15, 15, 0.55) 0%, rgba(15, 15, 15, 0.88) 100%"
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
