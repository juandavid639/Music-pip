/*
 * Verificacion por MUTACION del manifiesto frente a la tienda.
 *
 * ---------- QUE HACE ESTE ARNES DISTINTO DE LOS DEMAS ----------
 *
 * Los otros mutadores estropean COMPORTAMIENTO: un boton que no manda su
 * comando, una barra que no baja, un color que no cambia. Este estropea
 * PAPELEO, y el papeleo tiene una propiedad desagradable: cuando esta mal,
 * la extension funciona perfectamente. Se instala, suena, se ve bien. Lo
 * unico que pasa es que no se puede publicar, y eso se descubre a los dias,
 * en una pantalla de Google, sin decir cual de las quince cosas es.
 *
 * Los dos defectos reales que habia el dia que se escribio esto son justo
 * de esa clase:
 *
 *   - la descripcion tenia 137 caracteres y la ficha admite 132. Cinco de
 *     mas. La extension andaba,
 *   - se pedia `activeTab` y no se usa en ninguna linea de codigo. La
 *     extension andaba.
 *
 * Ninguno de los dos se ve mirando. Ninguno de los dos rompe nada. Los dos
 * paran una publicacion.
 *
 * ---------- LO QUE ESTAS MUTACIONES NO DEMUESTRAN ----------
 *
 * Que el paquete se acepte. La mitad de las reglas de la tienda las aplica
 * una persona leyendo, y contra eso no hay arnes. Lo que se comprueba aqui
 * es lo unico comprobable sin cuenta y sin red: que las reglas que SI se
 * pueden contar esten contadas, y que la prueba que dice contarlas se
 * entere cuando dejan de cumplirse.
 *
 * Mismo arnes que los demas: de usar y tirar, fuera de `npm test`, y
 * restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/manifiesto-tienda.test.js"];

/* La descripcion tal cual esta, para no repetirla en cada mutacion. */
const DESCRIPCION =
  '  "description": "Ventana flotante para controlar YouTube Music: portada, letra, ecualizador y atajos. No oficial, no afiliado a Google.",';

/* Los dos permisos, juntos, tal cual estan en el manifiesto. */
const PERMISOS = '    "storage",\n    "scripting"';

const MUTACIONES = [
  /* ---- El limite de la ficha ---- */
  {
    /*
     * Esta es la descripcion vieja, la de verdad, la que tenia el proyecto
     * el dia antes de intentar publicarlo: 137 caracteres. Se deja literal
     * en vez de inventar un relleno porque la mutacion asi no es hipotetica,
     * es el estado del que se venia.
     */
    etiqueta: "vuelve la descripcion de 137 caracteres (la ficha admite 132)",
    archivo: "manifest.json",
    de: DESCRIPCION,
    a:
      '  "description": "Ventana flotante (Picture-in-Picture) independiente para controlar ' +
      'YouTube Music. Producto no oficial, no afiliado a Google ni a YouTube.",'
  },
  {
    /*
     * Al recortar para que quepa, lo primero que sobra siempre es el
     * descargo: no describe ninguna funcion, y son veintitantos caracteres
     * que vienen muy bien. Es exactamente por eso que hay que sujetarlo.
     */
    etiqueta: "el recorte se lleva por delante el «no oficial»",
    archivo: "manifest.json",
    de: DESCRIPCION,
    a: '  "description": "Ventana flotante para controlar YouTube Music: portada, letra, ecualizador y atajos.",'
  },

  /* ---- Permisos ---- */
  {
    etiqueta: "vuelve `activeTab`, que no se usa en ninguna linea",
    archivo: "manifest.json",
    de: PERMISOS,
    a: '    "storage",\n    "activeTab",\n    "scripting"'
  },
  {
    /*
     * El otro sentido del mismo error. Si un permiso se quita del manifiesto
     * y su justificacion se queda en la tabla, la tabla empieza a describir
     * una extension que ya no existe, y la siguiente persona que la lea
     * creera que ahi esta escrito lo que se pide.
     */
    etiqueta: "se quita `storage` del manifiesto y su justificacion se queda escrita",
    archivo: "manifest.json",
    de: PERMISOS,
    a: '    "scripting"'
  },
  {
    etiqueta: "el content script entra en todo YouTube, no solo en Music",
    archivo: "manifest.json",
    de: '      "matches": ["https://music.youtube.com/*"],',
    a: '      "matches": ["https://*.youtube.com/*"],'
  },

  /* ---- El nombre, repartido en seis sitios ---- */
  {
    etiqueta: "la tienda anuncia un nombre y el producto enseña otro por dentro",
    archivo: "manifest.json",
    de: '  "name": "Music PiP",',
    a: '  "name": "Music PiP Pro",'
  },

  /* ---- Archivos que se nombran y no viajan ---- */
  {
    etiqueta: "el manifiesto nombra un icono que no existe",
    archivo: "manifest.json",
    de: '      "48": "assets/icons/icon48.png",',
    a: '      "48": "assets/icons/icon-48.png",'
  },
  {
    /*
     * ESTA ES LA CARA. No se toca el manifiesto: se toca la lista blanca del
     * empaquetador, que es donde nadie mira. El ZIP sale, pesa lo de
     * siempre, se sube bien, y la extension esta rota al instalarla porque
     * dentro no van los iconos. El manifiesto sigue siendo correcto; lo
     * incorrecto es el sobre.
     */
    etiqueta: "el empaquetador deja de meter assets/ y el ZIP viaja sin iconos",
    archivo: "tools/empaquetar.ps1",
    de: '  "src",\n  "assets"',
    a: '  "src"'
  },

  /* ---- La version, contada dos veces ---- */
  {
    etiqueta: "package.json y el manifiesto se van a versiones distintas",
    archivo: "package.json",
    de: '  "version": "1.0.0",',
    a: '  "version": "1.0.1",'
  },
  {
    etiqueta: "la version deja de ser la que Chrome sabe leer",
    archivo: "manifest.json",
    de: '  "version": "1.0.0",',
    a: '  "version": "1.0.0-beta",'
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
let deliberadas = 0;

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
    if (m.deliberada) {
      deliberadas++;
      console.log(`  (vive) ${m.etiqueta}\n         superviviente documentada: no puede cambiar el comportamiento`);
    } else {
      sobreviven++;
      console.error(`  VIVE  ${m.etiqueta}`);
    }
  } else {
    muertas++;
    if (m.deliberada) {
      console.error(`  ??  ${m.etiqueta}\n      (se declaro inmatable y una prueba la mato: revisa el comentario)`);
    }
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.join(" | ")}`);
  }
}

const enJuego = MUTACIONES.length - deliberadas;
console.log(
  `\n${muertas} de ${enJuego} mutaciones detectadas; ${sobreviven} sobreviven.` +
    (deliberadas ? ` (${deliberadas} mas viven a proposito y estan documentadas.)` : "")
);
process.exit(sobreviven ? 1 : 0);
