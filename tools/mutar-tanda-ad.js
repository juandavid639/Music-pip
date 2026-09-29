/*
 * Verificacion por MUTACION de la tanda AD: la vista previa viva (pinta las
 * preferencias guardadas y se repinta al cambiarlas) y pegada al scroll, y
 * el modulo compartido del espectro.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   6/4/2/2/1/1/1/1/1/1/1/1/1
 *
 * Refijada tras la primera pasada, por escrito y antes de repetirla:
 *  - «el marco no se entera de los cambios»: predije 6 y cayeron 4. Supuse
 *    que sin suscripcion el marco pintaria los valores de serie, y no: la
 *    carga que settings.js lanza al arrancar ya termino cuando el marco
 *    pinta por primera vez, asi que pinta lo guardado. Solo caen las cuatro
 *    pruebas que cambian algo DESPUES de abrir. Prediccion nueva: 4.
 *  - «el marco no lee lo guardado al abrir» SOBREVIVIO con razon: la linea
 *    era un segundo Settings.load() que no hacia nada (settings.js ya lo
 *    llama al cargarse). Se quito la linea y el mutante sale de la lista.
 *
 * Prediccion refijada: 4/2/2/1/1/1/1/1/1/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/vista-previa.test.js", "tests/unit/formas-espectro.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "el marco no se entera de los cambios (la 1.1.0)",
    "archivo": "src/options/vista-previa.js",
    "de": "    Settings.subscribe(aplicarPreferencias);\n",
    "a": ""
  },
  {
    "etiqueta": "el marco ignora el disco",
    "archivo": "src/options/vista-previa.js",
    "de": "  root.classList.toggle(\"ytmpip-vinilo\", p.coverStyle === \"vinyl\");",
    "a": "  root.classList.toggle(\"ytmpip-vinilo\", false);"
  },
  {
    "etiqueta": "el marco ignora el tema claro",
    "archivo": "src/options/vista-previa.js",
    "de": "p.theme === \"light\" || ",
    "a": ""
  },
  {
    "etiqueta": "el tinte se queda al cambiar de tema",
    "archivo": "src/options/vista-previa.js",
    "de": "    html.style.removeProperty(\"--ytmpip-bg-rgb\");\n",
    "a": ""
  },
  {
    "etiqueta": "el marco ignora el halo apagado",
    "archivo": "src/options/vista-previa.js",
    "de": "    halo.hidden = p.haloPreference === \"hidden\";",
    "a": "    halo.hidden = false;"
  },
  {
    "etiqueta": "el marco ignora el color propio del halo",
    "archivo": "src/options/vista-previa.js",
    "de": "    if (String(p.haloColor).charAt(0) === \"#\") halo.style.setProperty(\"--ytmpip-halo-color\", p.haloColor);\n    else if",
    "a": "    if"
  },
  {
    "etiqueta": "el marco dibuja siempre barras",
    "archivo": "src/options/vista-previa.js",
    "de": "    forma: p.spectrumStyle,",
    "a": "    forma: \"bars\","
  },
  {
    "etiqueta": "el halo del marco nunca late",
    "archivo": "src/options/vista-previa.js",
    "de": "  const late = p.haloPreference !== \"hidden\" && p.haloMode === \"pulse\";",
    "a": "  const late = false;"
  },
  {
    "etiqueta": "el marco se anima con menos movimiento",
    "archivo": "src/options/vista-previa.js",
    "de": "  if (!menosMovimiento()) requestAnimationFrame(animar);",
    "a": "  requestAnimationFrame(animar);"
  },
  {
    "etiqueta": "la vista previa deja de acompañar al scroll (la 1.1.0)",
    "archivo": "src/options/options.html",
    "de": "        position: sticky;\n        top: calc(var(--alto-cabecera, 64px) + 8px);",
    "a": "        position: static;\n        top: calc(var(--alto-cabecera, 64px) + 8px);"
  },
  {
    "etiqueta": "la grande se pega arriba en pantalla estrecha",
    "archivo": "src/options/options.html",
    "de": "        .ytmpip-lateral[data-tamano=\"grande\"] {\n          position: static;",
    "a": "        .ytmpip-lateral[data-tamano=\"grande\"] {\n          position: sticky;"
  },
  {
    "etiqueta": "la paleta pierde su color por barra",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    if (paleta) return (i) =>",
    "a": "    if (false) return (i) =>"
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
