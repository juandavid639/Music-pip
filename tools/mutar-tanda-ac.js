/*
 * Verificacion por MUTACION de la tanda AC: el estado en el icono de la
 * barra (▶, ❚❚ o los minutos del temporizador).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1/1/2/1/1/1
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
  "tests/unit/service-worker.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "las preferencias tiran el «no enseñarlo»",
    "archivo": "src/shared/settings.js",
    "de": "[\"shown\", \"hidden\"], DEFAULT_SETTINGS.badgePreference",
    "a": "[\"shown\"], DEFAULT_SETTINGS.badgePreference"
  },
  {
    "etiqueta": "el temporizador no manda en el icono",
    "archivo": "src/background/service-worker.js",
    "de": "  if (temporizador && temporizador.remainingMs > 0) {",
    "a": "  if (false) {"
  },
  {
    "etiqueta": "los minutos se redondean hacia abajo",
    "archivo": "src/background/service-worker.js",
    "de": "Math.ceil(temporizador.remainingMs / 60000)",
    "a": "Math.floor(temporizador.remainingMs / 60000)"
  },
  {
    "etiqueta": "un estado desconectado pinta el icono",
    "archivo": "src/background/service-worker.js",
    "de": "  if (!estado || !estado.connected) return \"\";",
    "a": "  if (!estado) return \"\";"
  },
  {
    "etiqueta": "el color no distingue la pausa",
    "archivo": "src/background/service-worker.js",
    "de": "estado && estado.playing ? SPECTRUM_LIMITS.COLOR_SUGGESTED : \"#5f6368\"",
    "a": "SPECTRUM_LIMITS.COLOR_SUGGESTED"
  },
  {
    "etiqueta": "la preferencia guardada no se lee",
    "archivo": "src/background/service-worker.js",
    "de": "      iconoPermitido = guardado[STORAGE_KEYS.BADGE_PREFERENCE] !== \"hidden\";",
    "a": "      iconoPermitido = true;"
  },
  {
    "etiqueta": "cambiar la preferencia no repinta",
    "archivo": "src/background/service-worker.js",
    "de": "      .then((guardado) => pintarIcono(guardado[STORAGE_KEYS.LAST_KNOWN_STATE]))",
    "a": "      .then(() => {})"
  },
  {
    "etiqueta": "cambiar la preferencia no la apunta",
    "archivo": "src/background/service-worker.js",
    "de": "    iconoPermitido = cambios[STORAGE_KEYS.BADGE_PREFERENCE].newValue !== \"hidden\";",
    "a": "    ;"
  },
  {
    "etiqueta": "el estado nuevo no pinta el icono (la 1.0.2)",
    "archivo": "src/background/service-worker.js",
    "de": "          pintarIcono(message.state);\n",
    "a": ""
  },
  {
    "etiqueta": "cerrar la pestaña deja el icono pintado",
    "archivo": "src/background/service-worker.js",
    "de": "  pintarIcono(null);\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no guarda el icono",
    "archivo": "src/options/options.js",
    "de": "      [STORAGE_KEYS.BADGE_PREFERENCE]: fields.badgePreference.value,\n",
    "a": ""
  },
  {
    "etiqueta": "Preferencias no carga el icono",
    "archivo": "src/options/options.js",
    "de": "      fields.badgePreference.value = stored[STORAGE_KEYS.BADGE_PREFERENCE] ?? DEFAULT_SETTINGS.badgePreference;\n",
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
