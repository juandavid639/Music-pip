/*
 * Verificacion por MUTACION del pulso de la caratula.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que alguna
 * prueba se entera. Una mutacion que sobrevive es una prueba que no existe,
 * por mucho que la suite este en verde.
 *
 * Este efecto es especialmente facil de tener roto y en verde, y por eso
 * merece el arnes. Casi ninguna de estas mutaciones lanza una excepcion:
 * todas dejan la portada moviendose. La diferencia entre latir con la musica
 * y temblar sin relacion con ella son unos pocos numeros, y a ojo, en una
 * ventana pequeña y con la cancion sonando, esa diferencia no se ve.
 *
 * Mismo arnes que tools/mutar-velocidad.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-pulso.test.js", "tests/unit/pip-espectro.test.js"];

const MUTACIONES = [
  /* ---- La medicion: de donde sale el numero ---- */
  {
    etiqueta: "la media se come la banda continua (los graves se leen del ruido de 0 Hz)",
    archivo: "src/content/audio-spectrum.js",
    de: "    const desde = Math.max(1, Math.floor(desdeHz / hzPorBanda));",
    a: "    const desde = Math.floor(desdeHz / hzPorBanda);"
  },
  {
    etiqueta: "la media se sale del array por arriba",
    archivo: "src/content/audio-spectrum.js",
    de: "    const hasta = Math.min(valores.length - 1, Math.ceil(hastaHz / hzPorBanda));",
    a: "    const hasta = Math.ceil(hastaHz / hzPorBanda);",
    /*
     * SOBREVIVE A PROPOSITO, y no se puede matar: leer mas alla del final de
     * un Float32Array da `undefined`, que no es finito, y el filtro de dos
     * lineas mas abajo ya lo descarta. La media sale idéntica.
     *
     * El acotado se queda porque acota EL BUCLE, no el resultado: con un
     * `hastaHz` grande la diferencia es recorrer seis posiciones o mil. Pero
     * una prueba que dijera protegerlo estaria mintiendo, asi que en vez de
     * inventarla se anota aqui. Mismo criterio que las dos lineas marcadas en
     * `desconectar`.
     */
    deliberada: true
  },
  {
    etiqueta: "una banda muda contamina la media (deja de filtrar lo no finito)",
    archivo: "src/content/audio-spectrum.js",
    de: "      if (Number.isFinite(valores[i])) {\n        suma += valores[i];",
    a: "      {\n        suma += valores[i];"
  },
  {
    etiqueta: "no poder medir se confunde con silencio absoluto (0 dB en vez de -Infinity)",
    archivo: "src/content/audio-spectrum.js",
    de: "    return cuenta ? suma / cuenta : -Infinity;",
    a: "    return cuenta ? suma / cuenta : 0;"
  },
  {
    etiqueta: "el analizador de graves se queda a la resolucion de las barras",
    archivo: "src/content/audio-spectrum.js",
    de: "  const TAMANO_FFT_GRAVES = 2048;",
    a: "  const TAMANO_FFT_GRAVES = 256;"
  },
  {
    etiqueta: "los graves se suavizan ANTES de medirlos (se borra el bombo)",
    archivo: "src/content/audio-spectrum.js",
    de: "      analizadorGraves.smoothingTimeConstant = 0;",
    a: "      analizadorGraves.smoothingTimeConstant = 0.9;"
  },
  {
    etiqueta: "la banda de graves se estira hasta la voz",
    archivo: "src/content/audio-spectrum.js",
    de: "  const GRAVES_HASTA_HZ = 120;",
    a: "  const GRAVES_HASTA_HZ = 2000;"
  },

  /* ---- La referencia movil: que cuenta como golpe ---- */
  {
    etiqueta: "la adaptacion no mira el reloj (cada pantalla late distinto)",
    archivo: "src/content/audio-spectrum.js",
    de: "    return Math.min(1, msTranscurridos / msAdaptacion);",
    a: "    return 0.02;"
  },
  {
    etiqueta: "un paron largo se pasa de largo (alfa mayor que 1)",
    archivo: "src/content/audio-spectrum.js",
    de: "    return Math.min(1, msTranscurridos / msAdaptacion);",
    a: "    return msTranscurridos / msAdaptacion;"
  },
  {
    etiqueta: "el golpe se desborda: la caratula pega un salto fuera de escala",
    archivo: "src/content/audio-spectrum.js",
    de: "    return Math.min(1, exceso);",
    a: "    return exceso;"
  },
  {
    etiqueta: "estar por DEBAJO de la referencia cuenta como golpe negativo",
    archivo: "src/content/audio-spectrum.js",
    de: "    if (!(exceso > 0)) return 0;",
    a: ";"
  },
  {
    etiqueta: "el umbral del golpe se vuelve absoluto (una cancion bajita no late nunca)",
    archivo: "src/content/audio-spectrum.js",
    de: "    const exceso = (nivelDb - baseDb) / spanDb;",
    a: "    const exceso = (nivelDb + 40) / spanDb;"
  },
  {
    etiqueta: "la referencia se adapta ANTES de comparar (el golpe se mide contra si mismo)",
    archivo: "src/content/audio-spectrum.js",
    de:
      "    const crudo = fuerzaDeGolpe(nivel, baseDb, GOLPE_DB);\n" +
      "    baseDb += (nivel - baseDb) * alfaPara(dt, MS_ADAPTACION);",
    a:
      "    baseDb += (nivel - baseDb) * alfaPara(dt, MS_ADAPTACION);\n" +
      "    const crudo = fuerzaDeGolpe(nivel, baseDb, GOLPE_DB);"
  },
  {
    etiqueta: "el silencio arrastra la referencia (la primera nota tras la pausa explota)",
    archivo: "src/content/audio-spectrum.js",
    de: "      pulso = Math.max(0, pulso - (dt > 0 ? dt / MS_CAIDA : 1));\n      return pulso;",
    a: "      baseDb = -100;\n      pulso = Math.max(0, pulso - (dt > 0 ? dt / MS_CAIDA : 1));\n      return pulso;"
  },
  {
    etiqueta: "la primera lectura de la cancion se inventa un golpe",
    archivo: "src/content/audio-spectrum.js",
    de: "      baseDb = nivel;\n      pulso = 0;",
    a: "      baseDb = -100;\n      pulso = 0;"
  },
  {
    etiqueta: "el golpe llega tarde: subir se frena igual que bajar",
    archivo: "src/content/audio-spectrum.js",
    de: "    pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1));",
    a: "    pulso = Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1)) * 0.5 + crudo * 0.5;"
  },
  {
    etiqueta: "el pulso cae de golpe: parpadeo en vez de latido",
    archivo: "src/content/audio-spectrum.js",
    de: "    pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1));",
    a: "    pulso = crudo;"
  },
  {
    etiqueta: "la caida deja de preguntar si hubo tiempo (un reloj hacia atras SUMA pulso)",
    archivo: "src/content/audio-spectrum.js",
    de: "    pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1));",
    a: "    pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - dt / MS_CAIDA);"
  },
  {
    etiqueta: "la caida del silencio deja de preguntar si hubo tiempo",
    archivo: "src/content/audio-spectrum.js",
    de: "      pulso = Math.max(0, pulso - (dt > 0 ? dt / MS_CAIDA : 1));",
    a: "      pulso = Math.max(0, pulso - dt / MS_CAIDA);"
  },
  {
    etiqueta: "la cancion siguiente hereda la referencia de la anterior",
    archivo: "src/content/audio-spectrum.js",
    de: "    baseDb = null;\n    pulso = 0;\n    msUltimo = 0;",
    a: "    pulso = 0;\n    msUltimo = 0;"
  },
  {
    etiqueta: "sin analizador se responde cero (la portada da un tiron hacia dentro)",
    archivo: "src/content/audio-spectrum.js",
    de: "    if (!analizadorGraves || !bandasGraves || !ctx) return null;",
    a: "    if (!analizadorGraves || !bandasGraves || !ctx) return 0;"
  },

  /* ---- El cable: de la medicion a la ventana ---- */
  {
    etiqueta: "el fotograma trata el 'no se sabe' como un cero",
    archivo: "src/pip/pip.js",
    de: "      if (golpe !== null) ponerPulso(golpe);",
    a: "      ponerPulso(golpe);"
  },
  {
    etiqueta: "el pulso deja de publicarse (la medicion no llega al CSS)",
    archivo: "src/pip/pip.js",
    de: '    els.root.style.setProperty("--ytmpip-pulse", valor.toFixed(3));',
    a: ";"
  },
  {
    etiqueta: "el valor publicado se sale de 0..1",
    archivo: "src/pip/pip.js",
    de: "    const valor = Number.isFinite(golpe) ? Math.min(1, Math.max(0, golpe)) : 0;",
    a: "    const valor = Number.isFinite(golpe) ? golpe : 0;"
  },
  {
    etiqueta: "la caratula se queda crecida al apagar el pulso con el espectro puesto",
    archivo: "src/pip/pip.js",
    de: "    if (!pulsoActivo) ponerPulso(0);",
    a: ";"
  },
  /* ---- El pulso tambien vale para el video ----
   *
   * AQUI HABIA DOS MUTACIONES QUE YA NO SE PUEDEN HACER, y conviene contarlo
   * porque las dos morian y las dos protegian lo contrario de lo que hoy se
   * quiere: una comprobaba que el pulso se APAGABA en modo video y la otra
   * que no se olvidaba al volver. La primera describia el fallo —el video no
   * latia— y la prueba que la mataba lo daba por bueno.
   *
   * No se han "actualizado" cambiando el texto: se han tirado y escrito otras
   * cuatro, porque lo que se protege ahora es otra cosa. Una mutacion heredada
   * a la que se le cambia el `de` para que vuelva a encajar es una mutacion
   * que ya no sabe que buscaba.
   */
  {
    etiqueta: "el video vuelve a no latir (el pulso se apaga solo por haber video)",
    archivo: "src/pip/pip.js",
    de: "    pulsoActivo = conectado && pulsoPedido;",
    a: "    pulsoActivo = conectado && pulsoPedido && !videoMode;"
  },
  {
    /*
     * La otra mitad del reparto: quitar `!videoMode` de `pulsoActivo` NO
     * significa que el pulso ya no se apague nunca. Con la letra ocupando el
     * escenario no hay ni portada ni video que mirar, y ahi la FFT por
     * fotograma si seria para nadie. Esa condicion vive arriba, en
     * `alguienQuiere`, y sin una mutacion propia se podria borrar de paso.
     */
    etiqueta: "la letra en grande deja de parar el pulso (se mide para nadie)",
    archivo: "src/pip/pip.js",
    de: "    const alguienQuiere = (espectroPedido || pulsoPedido) && !letraEnGrande;",
    a: "    const alguienQuiere = espectroPedido || pulsoPedido;"
  },
  {
    /*
     * Y estas tres son de la HOJA, no del JavaScript, porque ahi es donde
     * vive la mitad que decide QUE crece. pip.js quita la condicion y no se
     * entera de nada mas: si la hoja dejara de escalar el hueco del video, el
     * pulso seguiria midiendose, publicandose y encendiendose —todo en
     * verde— y en pantalla no se moveria nada. Fallo mudo de manual.
     */
    etiqueta: "CSS: la regla del pulso vuelve a ser solo de la portada",
    archivo: "src/pip/pip.css",
    de: ".ytmpip-artwork,\n.ytmpip-video-slot {\n  --ytmpip-pulse-strength: 0.1;",
    a: ".ytmpip-artwork {\n  --ytmpip-pulse-strength: 0.1;"
  },
  {
    etiqueta: "CSS: el video se queda sin su propia fuerza y crece como la portada",
    archivo: "src/pip/pip.css",
    de: ".ytmpip-video-slot {\n  --ytmpip-pulse-strength: 0.06;\n}\n",
    a: ""
  },
  {
    etiqueta: "CSS: quien pide menos movimiento se lo pierde salvo en los videoclips",
    archivo: "src/pip/pip.css",
    de: "@media (prefers-reduced-motion: reduce) {\n  .ytmpip-artwork,\n  .ytmpip-video-slot {\n    --ytmpip-pulse-strength: 0;",
    a: "@media (prefers-reduced-motion: reduce) {\n  .ytmpip-artwork {\n    --ytmpip-pulse-strength: 0;"
  },
  {
    /*
     * La etiqueta del boton no es decoracion: es lo unico que lee quien va con
     * lector de pantalla. Mientras hacia latir un videoclip decia "carátula",
     * o sea que contaba lo contrario de lo que hacia.
     */
    etiqueta: "el boton vuelve a prometer una caratula mientras hace latir un video",
    archivo: "src/pip/pip.js",
    de: '        : "Hacer que la imagen lata con los graves";',
    a: '        : "Hacer que la carátula lata con los graves";'
  },
  {
    etiqueta: "el analizador no se monta si el espectro no lo pide tambien",
    archivo: "src/pip/pip.js",
    de: "    const alguienQuiere = (espectroPedido || pulsoPedido) && !letraEnGrande;",
    a: "    const alguienQuiere = espectroPedido && !letraEnGrande;"
  },
  {
    etiqueta: "apagar el espectro suelta el analizador con el pulso todavia pedido",
    archivo: "src/pip/pip.js",
    de: "    if (!espectroPedido && !pulsoPedido) YTMPip.Espectro.desconectar();",
    a: "    YTMPip.Espectro.desconectar();"
  },
  {
    etiqueta: "la animacion se corta con el pulso encendido (late un solo fotograma)",
    archivo: "src/pip/pip.js",
    de: "    if (!els.spectrum.hidden || pulsoActivo) {",
    a: "    if (!els.spectrum.hidden) {"
  },
  {
    etiqueta: "el boton del pulso se ofrece aunque el audio no se pueda medir",
    archivo: "src/pip/pip.js",
    de: "      els.pulsoToggle.hidden = !espectroDisponible;",
    a: "      els.pulsoToggle.hidden = false;"
  },
  {
    etiqueta: "el boton no cuenta si esta pulsado a quien no lo ve",
    archivo: "src/pip/pip.js",
    de: '      els.pulsoToggle.setAttribute("aria-pressed", String(pulsoPedido));',
    a: '      els.pulsoToggle.setAttribute("aria-pressed", "false");'
  },
  {
    etiqueta: "el pulso enciende tambien el espectro",
    archivo: "src/pip/pip.js",
    de: "    els.spectrum.hidden = !(conectado && espectroPedido);",
    a: "    els.spectrum.hidden = !conectado;"
  },
  {
    etiqueta: "el icono del pulso desaparece y queda el emoji de respaldo",
    archivo: "src/shared/iconos.js",
    de: "    pulso: [",
    a: "    pulsoQueNadiePide: ["
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
