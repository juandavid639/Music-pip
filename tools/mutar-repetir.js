/*
 * Verificacion por MUTACION del estado del boton de repetir.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que
 * alguna prueba se entera. Una mutacion que sobrevive es una prueba que no
 * existe, por mucho que la suite este en verde.
 *
 * Aqui interesan sobre todo las mutaciones que MIENTEN sin romper nada:
 * devolver un booleano donde hay tres posiciones, o inventarse "apagado"
 * cuando el modo no se conoce. Eso es exactamente el fallo que reporto el
 * usuario, y es el que ninguna prueba veia antes.
 *
 * Mismo arnes que tools/mutar-lanzador.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/pip-repetir.test.js",
  "tests/selectors/adapter.test.js",
  "tests/selectors/metadata-reader.test.js"
];

const MUTACIONES = [
  {
    etiqueta: "el adaptador vuelve a leer el estado del boton (que es null)",
    archivo: "src/content/youtube-music-adapter.js",
    de: '      const modo = barra.getAttribute("repeat-mode");',
    a: '      const modo = (this.getRepeatButton() || barra).getAttribute("aria-pressed");'
  },
  {
    etiqueta: "getRepeatMode se traga cualquier valor sin validarlo",
    archivo: "src/content/youtube-music-adapter.js",
    de: '      return modo === "NONE" || modo === "ALL" || modo === "ONE" ? modo : undefined;',
    a: "      return modo === null ? undefined : modo;"
  },
  {
    etiqueta: "sin barra, el adaptador se inventa que no hay repeticion",
    archivo: "src/content/youtube-music-adapter.js",
    de: "      if (!barra) return undefined;\n      const modo = barra",
    a: '      if (!barra) return "NONE";\n      const modo = barra'
  },
  {
    etiqueta: "repeatOn deja de distinguir NONE del resto",
    archivo: "src/content/metadata-reader.js",
    de: 'repeatOn: repeatMode === undefined ? undefined : repeatMode !== "NONE",',
    a: "repeatOn: repeatMode !== undefined,"
  },
  {
    etiqueta: "el modo deja de viajar en el estado (solo llega el resumen)",
    archivo: "src/content/metadata-reader.js",
    de: "        repeatMode,\n",
    a: "        repeatMode: undefined,\n"
  },
  {
    etiqueta: "sin modo conocido, la ventana se inventa 'apagado'",
    archivo: "src/pip/pip.js",
    de: '      els.repeat.removeAttribute("aria-pressed");',
    a: '      els.repeat.setAttribute("aria-pressed", "false");'
  },
  {
    etiqueta: "repetir una cancion se pinta igual que repetir la lista",
    archivo: "src/pip/pip.js",
    de: 'const ICONO_REPETIR = { NONE: "repetir", ALL: "repetir", ONE: "repetir-una" };',
    a: 'const ICONO_REPETIR = { NONE: "repetir", ALL: "repetir", ONE: "repetir" };'
  },
  {
    etiqueta: "las tres posiciones comparten el mismo texto",
    archivo: "src/pip/pip.js",
    de: '    NONE: "Repetir: desactivado",\n    ALL: "Repetir: toda la lista",\n    ONE: "Repetir: esta canción"',
    a: '    NONE: "Repetir",\n    ALL: "Repetir",\n    ONE: "Repetir"'
  },
  {
    etiqueta: "el boton se enciende tambien con NONE",
    archivo: "src/pip/pip.js",
    de: '    els.repeat.setAttribute("aria-pressed", String(modo !== "NONE"));',
    a: '    els.repeat.setAttribute("aria-pressed", "true");'
  },
  {
    etiqueta: "el boton nunca se enciende (el sintoma reportado, tal cual)",
    archivo: "src/pip/pip.js",
    de: '    els.repeat.setAttribute("aria-pressed", String(modo !== "NONE"));',
    a: '    els.repeat.setAttribute("aria-pressed", "false");'
  },
  {
    etiqueta: "el estado se ve pero no se anuncia a quien no ve el dibujo",
    archivo: "src/pip/pip.js",
    de: "    els.repeat.setAttribute(\"aria-label\", ETIQUETA_REPETIR[modo]);",
    a: '    els.repeat.setAttribute("aria-label", "Repetir");'
  },
  {
    etiqueta: "render deja de pintar el modo",
    archivo: "src/pip/pip.js",
    de: "    pintarRepetir(state.repeatMode);",
    a: ";"
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
