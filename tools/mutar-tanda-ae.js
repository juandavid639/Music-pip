/*
 * Verificacion por MUTACION de la tanda AE: el color de acento propio (la
 * preferencia, el pintor unico del acento en la ventana, el aviso de
 * contraste de Preferencias, la vista previa y la etiqueta del icono).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/3/1/1/1/1/3/1/1/1/1/2/1
 *
 * Refijada tras la primera pasada: «se avisa tambien con el tema de la
 * caratula» SOBREVIVIO con razon. La guarda !conCaratula era redundante:
 * con ese tema acentoIlegible busca fondos.source, que la hoja no tiene, y
 * ya no avisa. Se quito la guarda (comentario en acentoIlegible) y el
 * mutante sale de la lista. Prediccion: 1/1/3/1/1/1/1/3/1/1/1/2/1
 *
 * FUERA A SABIENDAS: el olvido de `acentoDeLaFuente` en openPip. Solo
 * importa si la ventana muere sin pagehide, y en ese caso el muestreo de la
 * anterior tambien se queda colgado (problema previo, no de esta tanda): no
 * se supo escribir una prueba que aislara solo el olvido. Es una linea
 * defensiva sin prueba, dicho aqui y en el README.
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
  "tests/unit/pip-tema.test.js",
  "tests/unit/opciones-en-vivo.test.js",
  "tests/unit/vista-previa.test.js",
  "tests/unit/service-worker.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "el acento acepta cualquier texto",
    "archivo": "src/shared/settings.js",
    "de": "typeof valor === \"string\" && /^#[0-9a-f]{6}$/i.test(valor) ? valor.toLowerCase()",
    "a": "typeof valor === \"string\" ? valor.toLowerCase()"
  },
  {
    "etiqueta": "el acento no se pasa a minusculas",
    "archivo": "src/shared/settings.js",
    "de": "/^#[0-9a-f]{6}$/i.test(valor) ? valor.toLowerCase() : \"default\"",
    "a": "/^#[0-9a-f]{6}$/i.test(valor) ? valor : \"default\""
  },
  {
    "etiqueta": "la ventana ignora el acento propio (la 1.1.0)",
    "archivo": "src/pip/pip.js",
    "de": "    acentoPropio = settings.accentColor && settings.accentColor !== \"default\" ? settings.accentColor : null;",
    "a": "    acentoPropio = null;"
  },
  {
    "etiqueta": "el propio le gana a la cancion",
    "archivo": "src/pip/pip.js",
    "de": "    const acento = acentoDeLaFuente || acentoPropio;",
    "a": "    const acento = acentoPropio || acentoDeLaFuente;"
  },
  {
    "etiqueta": "el tinte se lleva el acento propio al irse",
    "archivo": "src/pip/pip.js",
    "de": "    acentoDeLaFuente = tema ? \"rgb(\" + tema.acento.join(\", \") + \")\" : null;\n    pintarAcento();",
    "a": "    acentoDeLaFuente = tema ? \"rgb(\" + tema.acento.join(\", \") + \")\" : null;\n    if (tema) pintarAcento();\n    else raiz.style.removeProperty(\"--ytmpip-accent\");"
  },
  {
    "etiqueta": "cambiar el acento no lo repinta",
    "archivo": "src/pip/pip.js",
    "de": "settings.accentColor : null;\n    pintarAcento();",
    "a": "settings.accentColor : null;"
  },
  {
    "etiqueta": "Preferencias no guarda el color propio",
    "archivo": "src/options/options.js",
    "de": "[STORAGE_KEYS.ACCENT_COLOR]: fields.accentColorMode.value === \"custom\" ? fields.accentColor.value : \"default\",",
    "a": "[STORAGE_KEYS.ACCENT_COLOR]: \"default\","
  },
  {
    "etiqueta": "Preferencias no carga el acento",
    "archivo": "src/options/options.js",
    "de": "      fields.accentColorMode.value = acento === \"default\" ? \"default\" : \"custom\";",
    "a": "      fields.accentColorMode.value = \"default\";"
  },
  {
    "etiqueta": "nunca se avisa del contraste",
    "archivo": "src/options/options.js",
    "de": "    accentContrastWarning.hidden = !(acentoPropio && acentoIlegible(fields.accentColor.value));",
    "a": "    accentContrastWarning.hidden = true;"
  },

  {
    "etiqueta": "la regla olvida la tinta blanca del boton",
    "archivo": "src/shared/color-fuente.js",
    "de": "contraste(acento, fondo) < 4.5 || contraste([255, 255, 255], acento) < 3",
    "a": "contraste(acento, fondo) < 4.5"
  },
  {
    "etiqueta": "la vista previa ignora el acento propio",
    "archivo": "src/options/vista-previa.js",
    "de": "  const acento = tinte ? \"rgb(\" + tinte.acento.join(\", \") + \")\" : acentoPropio;",
    "a": "  const acento = tinte ? \"rgb(\" + tinte.acento.join(\", \") + \")\" : null;"
  },
  {
    "etiqueta": "la etiqueta del icono ignora el acento",
    "archivo": "src/background/service-worker.js",
    "de": "acentoDelIcono || SPECTRUM_LIMITS.COLOR_SUGGESTED",
    "a": "SPECTRUM_LIMITS.COLOR_SUGGESTED"
  },
  {
    "etiqueta": "cambiar el acento no llega al icono",
    "archivo": "src/background/service-worker.js",
    "de": "    if (acento) acentoDelIcono = acentoDe(acento.newValue);",
    "a": "    ;"
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
