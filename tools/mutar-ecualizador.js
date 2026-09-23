/*
 * Verificacion por MUTACION del nucleo del ecualizador.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que alguna
 * prueba se entera. Una mutacion que sobrevive es una prueba que no existe,
 * por mucho que la suite este en verde.
 *
 * AQUI HAY UNA CATEGORIA DE MUTACION QUE NO HABIA EN LAS OTRAS RONDAS: las
 * que CRUZAN LA PUERTA. Ecualizar mete el audio del <video> en un
 * AudioContext con createMediaElementSource(), y eso no se deshace sin
 * recargar la pestaña. Una mutacion que convierte "no lo entiendo" en
 * "montalo plano" no cambia lo que se oye —plano suena igual que apagado—
 * pero deja el audio de alguien dentro de un grafo que no pidio. Son las
 * primeras de la lista a proposito: si alguna de esas sobrevive, no importa
 * lo verde que este todo lo demas.
 *
 * La otra categoria util son las que MIENTEN CON UN NUMERO: un signo dado la
 * vuelta en la preamplificacion sube el volumen justo cuando habia que
 * bajarlo, y eso no lanza ninguna excepcion: solo distorsiona.
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 *
 * ------------------------------------------------------------------
 * UN RUIDO QUE NO SE HA EXPLICADO
 * ------------------------------------------------------------------
 *
 * En dos vueltas distintas aparecio en la lista de "pruebas que cayeron" el
 * nombre `videoPreference desconocida cae a mostrar el vídeo`, que no tiene
 * NADA que ver con el ecualizador, y cada vez colgando de una mutacion
 * distinta. No se ha conseguido reproducir: settings.test.js pasa 39/39 en
 * seis vueltas seguidas sin mutar, pasa 39/39 CON la mutacion aplicada a
 * mano, y no fallo ni una vez en quince ciclos de reescribir el archivo y
 * relanzar imitando lo que hace este arnes.
 *
 * La sospecha —sin pruebas, por eso se escribe como sospecha— es una
 * colision al leer del disco: este arnes reescribe archivos fuente
 * diecinueve veces seguidas, el proyecto vive en una carpeta de OneDrive, y
 * esa prueba concreta es la que mas lee (monta cinco entornos jsdom, cuatro
 * archivos cada uno). Pero no esta demostrado y no conviene creerselo.
 *
 * LO QUE IMPORTA PARA LEER LA SALIDA: este arnes da por muerta una mutacion
 * si cae CUALQUIER prueba, asi que un fallo espurio podria tapar una
 * mutacion que en realidad sobrevive. En las vueltas hechas hasta ahora cada
 * mutacion cayo ademas por una prueba cuyo nombre habla de lo mutado, y el
 * ruido siempre venia SUMADO a esa. Si algun dia una mutacion aparece muerta
 * SOLO por una prueba que no tiene que ver, no esta muerta: vuelve a correrla.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/ecualizador.test.js", "tests/unit/settings.test.js"];

const MUTACIONES = [
  /* ---------- las que cruzan la puerta ---------- */
  {
    etiqueta: "PUERTA: lo que no se entiende se monta plano en vez de dejarse apagado",
    archivo: "src/shared/ecualizador.js",
    de: "    return DEFAULT_SETTINGS.equalizer;",
    a: '    return "plano";'
  },
  {
    etiqueta: "PUERTA: el valor por defecto deja de ser apagado",
    archivo: "src/shared/constants.js",
    de: '      equalizer: "off",',
    a: '      equalizer: "plano",'
  },
  {
    etiqueta: "PUERTA: estaApagado deja de reconocer el apagado",
    archivo: "src/shared/ecualizador.js",
    de: "    return normalizar(valor) === APAGADO;",
    a: "    return false;"
  },
  {
    etiqueta: "PUERTA: plan monta filtros aunque este apagado",
    archivo: "src/shared/ecualizador.js",
    de: "    if (estaApagado(valor)) return null;",
    a: ";"
  },

  /* ----------------------------------------------------------------
   * EL FALLO QUE SE PAGO. Estas mutaciones no son hipoteticas: la primera
   * es LITERALMENTE el codigo que estuvo en produccion, y su comentario
   * decia por que estaba bien. Ninguna prueba se enteraba, porque una de
   * ellas —`entrada.gain.objetivo < 1`— estaba escrita para exigirlo.
   *
   * Lo encontro el usuario oyendolo. Estas mutaciones existen para que no
   * haga falta oirlo dos veces.
   * ---------------------------------------------------------------- */
  {
    etiqueta: "EL FALLO VIEJO: se cobra el peaje entero y la banda alta acaba siempre en -3 dB",
    archivo: "src/shared/ecualizador.js",
    de: "    const sobra = subidaDelPico(ganancias(valor)) - margenDelLimitador();",
    a: "    const sobra = subidaDelPico(ganancias(valor)) + EQUALIZER_LIMITS.HEADROOM_DB;"
  },
  {
    etiqueta: "SIGNO: la preamplificacion sube el volumen en vez de bajarlo",
    archivo: "src/shared/ecualizador.js",
    de: "    return sobra > 0 ? -sobra : 0;",
    a: "    return sobra > 0 ? sobra : 0;"
  },
  {
    etiqueta: "SIGNO: factorDe invierte la conversion de decibelios",
    archivo: "src/shared/ecualizador.js",
    de: "    return Math.pow(10, db / 20);",
    a: "    return Math.pow(10, -db / 20);"
  },
  {
    etiqueta: "el pico es la SUMA de todas las bandas (la musica se queda inaudible)",
    archivo: "src/shared/ecualizador.js",
    de: "    const alta = Math.max(0, ...db);",
    a: "    const alta = db.reduce((a, b) => a + Math.max(0, b), 0);"
  },
  {
    etiqueta: "el pico tambien lo pone quien solo BAJA bandas",
    archivo: "src/shared/ecualizador.js",
    de: "    const alta = Math.max(0, ...db);",
    a: "    const alta = Math.max(...db.map(Math.abs));"
  },
  {
    etiqueta: "SOLAPE: se cobra el margen aunque no haya vecina subida",
    archivo: "src/shared/ecualizador.js",
    de: "    const aporta = Math.min(Math.max(0, ...vecinas), EQUALIZER_LIMITS.HEADROOM_DB);",
    a: "    const aporta = EQUALIZER_LIMITS.HEADROOM_DB;"
  },
  {
    etiqueta: "SOLAPE: no se cobra nunca, ni con la vecina a tope",
    archivo: "src/shared/ecualizador.js",
    de: "    return alta + aporta;",
    a: "    return alta;"
  },
  {
    etiqueta: "SOLAPE: la vecina aporta lo suyo entero, sin tope",
    archivo: "src/shared/ecualizador.js",
    de: "    const aporta = Math.min(Math.max(0, ...vecinas), EQUALIZER_LIMITS.HEADROOM_DB);",
    a: "    const aporta = Math.max(0, ...vecinas);"
  },
  {
    etiqueta: "SOLAPE: aporta CUALQUIER banda subida, no solo la de al lado",
    archivo: "src/shared/ecualizador.js",
    de: "    if (i > 0) vecinas.push(db[i - 1]);\n    if (i < db.length - 1) vecinas.push(db[i + 1]);",
    a: "    for (let j = 0; j < db.length; j++) if (j !== i) vecinas.push(db[j]);"
  },
  {
    etiqueta: "MARGEN: el limitador se cree infinito y nunca hay preamplificacion",
    archivo: "src/shared/ecualizador.js",
    de: "    return UMBRAL_DB * (1 - RATIO) + 0;",
    a: "    return Infinity;"
  },
  {
    etiqueta: "MARGEN: se olvida el ratio y el margen se queda en el umbral",
    archivo: "src/shared/ecualizador.js",
    de: "    return UMBRAL_DB * (1 - RATIO) + 0;",
    a: "    return -UMBRAL_DB + 0;"
  },
  {
    /*
     * El `+ 0` parece un adorno y no lo es: con el umbral a cero la cuenta da
     * CERO NEGATIVO, y `-0` no es `0` para `Object.is`, que es lo que usa
     * `assert.strictEqual`. Sin esta mutacion, el primero que lo vea lo borra
     * por limpieza y se encuentra pruebas rojas sin ninguna pista de por que.
     */
    etiqueta: "MARGEN: se quita el +0 y el margen sale como cero NEGATIVO",
    archivo: "src/shared/ecualizador.js",
    de: "    return UMBRAL_DB * (1 - RATIO) + 0;",
    a: "    return UMBRAL_DB * (1 - RATIO);"
  },
  {
    etiqueta: "el plan se monta con la entrada a tope (recorta)",
    archivo: "src/shared/ecualizador.js",
    de: "      entrada: factorDe(preamplificacion(valor)),",
    a: "      entrada: 1,"
  },

  /* ---------- el limitador que viaja dentro del plan ---------- */
  {
    etiqueta: "LIMITADOR: el plan no lo lleva y el grafo se queda sin red",
    archivo: "src/shared/ecualizador.js",
    de: "      limitador: {",
    a: "      limitadorNo: {"
  },
  {
    /*
     * ESTA MUTACION ESTABA AL REVES y por eso hay que contar la historia. Era
     * «el umbral se va a cero y no llega a actuar nunca», con el umbral de
     * produccion en −1. Resulto que cero es el valor CORRECTO y −1 el fallo:
     * medido sobre musica real, con −1 el limitador trabajaba el 100 % del
     * tiempo —incluso con las cinco bandas a cero— porque en esta plataforma
     * la musica llega sin holgura y el umbral quedaba por debajo del
     * material. Ver tools/diagnostico-limitador.js y el comentario de
     * UMBRAL_DB en constants.js.
     *
     * Asi que la mutacion es ahora la de volver atras. Es la mas importante
     * de este archivo: es el fallo que se acaba de arreglar, y el unico que
     * ha hecho falta medir para verlo.
     */
    etiqueta: "LIMITADOR: vuelve el umbral a -1 y se le fia el trabajo que no puede hacer",
    archivo: "src/shared/constants.js",
    de: "        UMBRAL_DB: 0,",
    a: "        UMBRAL_DB: -1,"
  },
  {
    etiqueta: "LIMITADOR: el ratio baja a 2 y deja escapar los picos",
    archivo: "src/shared/constants.js",
    de: "        RATIO: 20,",
    a: "      RATIO: 2,"
  },

  /* ---------- las que aceptan lo que no deberian ---------- */
  {
    etiqueta: "una lista de otro tamaño se rellena en vez de rechazarse",
    archivo: "src/shared/ecualizador.js",
    de: "    if (trozos.length !== NUM_BANDAS) return null;",
    a: "    if (trozos.length > NUM_BANDAS) return null;"
  },
  {
    etiqueta: "una ganancia mala se salta en vez de tumbar la lista",
    archivo: "src/shared/ecualizador.js",
    de: "      if (g === null) return null;\n      ganancias.push(g);",
    a: "      if (g !== null) ganancias.push(g);"
  },
  {
    etiqueta: "las ganancias dejan de acotarse (un +99 llega al filtro)",
    archivo: "src/shared/ecualizador.js",
    de: "    return Math.min(EQUALIZER_LIMITS.GAIN_MAX, Math.max(EQUALIZER_LIMITS.GAIN_MIN, Math.round(n)));",
    a: "    return Math.round(n);"
  },
  {
    etiqueta: "la casilla vacia pasa por cero decibelios",
    archivo: "src/shared/ecualizador.js",
    de: '    if (texto === "" || texto === null || texto === undefined) return null;',
    a: "    if (texto === null || texto === undefined) return null;"
  },

  /* ---------- las que estropean lo compartido ---------- */
  {
    etiqueta: "ganancias devuelve el preset compartido y quien lo toque lo estropea para todos",
    archivo: "src/shared/ecualizador.js",
    de: "    if (preset) return preset.slice();",
    a: "    if (preset) return preset;"
  },
  {
    etiqueta: "presetDe llama preset a unas ganancias a mano",
    archivo: "src/shared/ecualizador.js",
    de: "    return EQUALIZER_PRESETS[limpio] ? limpio : null;",
    a: "    return limpio;"
  },
  {
    etiqueta: "las bandas se ordenan al reves (los graves acaban al final de la fila)",
    archivo: "src/shared/constants.js",
    de: '      { id: "graves", hz: 60, tipo: "lowshelf", etiqueta: "Graves" },',
    a: '      { id: "graves", hz: 60000, tipo: "lowshelf", etiqueta: "Graves" },'
  },
  {
    etiqueta: "un shelf se lleva la Q de una campana (mete un pico en la esquina)",
    archivo: "src/shared/ecualizador.js",
    de: "        q: typeof banda.q === \"number\" ? banda.q : null,",
    a: "        q: typeof banda.q === \"number\" ? banda.q : 1,"
  },
  {
    etiqueta: "settings deja de normalizar el ecualizador y guarda lo que le echen",
    archivo: "src/shared/settings.js",
    de: "      equalizer: YTMPip.Ecualizador.normalizar(stored[STORAGE_KEYS.EQUALIZER]),",
    a: "      equalizer: stored[STORAGE_KEYS.EQUALIZER],"
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
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.slice(0, 3).join(" | ")}`);
  }
}

console.log(`\n${muertas} de ${MUTACIONES.length} mutaciones detectadas; ${sobreviven} sobreviven.`);
process.exit(sobreviven ? 1 : 0);
