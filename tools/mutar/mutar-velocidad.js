/*
 * Verificacion por MUTACION de la velocidad de reproduccion.
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que
 * alguna prueba se entera. Una mutacion que sobrevive es una prueba que no
 * existe, por mucho que la suite este en verde.
 *
 * Aqui interesan sobre todo las mutaciones que MIENTEN sin romper nada: un
 * boton que enseña una velocidad que ya no suena, un ciclo que se salta una
 * posicion, un acotado que deja pasar un 40. Ninguna de esas lanza una
 * excepcion; todas dejan la ventana funcionando y equivocada.
 *
 * Mismo arnes que tools/mutar/mutar-repetir.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/velocidad.test.js",
  "tests/unit/player-controller.test.js",
  "tests/selectors/metadata-reader.test.js"
];

const MUTACIONES = [
  {
    etiqueta: "el controlador deja de acotar (un 40 llega al <video>)",
    archivo: "src/content/player-controller.js",
    de: "    media.playbackRate = Math.min(limites.MAX, Math.max(limites.MIN, value));",
    a: "    media.playbackRate = value;"
  },
  {
    etiqueta: "el controlador se traga la basura (Number en vez de toFiniteNumber)",
    archivo: "src/content/player-controller.js",
    de: "    const value = toFiniteNumber(rate);\n    if (value === null) return;",
    a: "    const value = Number(rate);"
  },
  {
    etiqueta: "deja de corregir el tono (la voz sale desafinada y nadie lo ve)",
    archivo: "src/content/player-controller.js",
    de: '    if ("preservesPitch" in media) media.preservesPitch = true;',
    a: ";"
  },
  {
    etiqueta: "el estado se inventa que siempre va a velocidad normal",
    archivo: "src/content/metadata-reader.js",
    de: "      playbackRate: Number.isFinite(rate) && rate > 0 ? rate : NORMAL",
    a: "      playbackRate: NORMAL"
  },
  {
    etiqueta: "el estado publica el cero como velocidad buena",
    archivo: "src/content/metadata-reader.js",
    de: "      playbackRate: Number.isFinite(rate) && rate > 0 ? rate : NORMAL",
    a: "      playbackRate: Number.isFinite(rate) ? rate : NORMAL"
  },
  {
    etiqueta: "el ciclo ignora donde esta la musica y siempre arranca de 1x",
    archivo: "src/pip/pip.js",
    de: "    const i = PLAYBACK_RATES.indexOf(actual);",
    a: "    const i = PLAYBACK_RATES.indexOf(PLAYBACK_RATE_NORMAL);"
  },
  {
    etiqueta: "el ciclo no da la vuelta (la ultima velocidad deja el boton muerto)",
    archivo: "src/pip/pip.js",
    de: "    return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];",
    a: "    return PLAYBACK_RATES[i + 1];"
  },
  {
    etiqueta: "el ciclo se salta una posicion",
    archivo: "src/pip/pip.js",
    de: "    return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];",
    a: "    return PLAYBACK_RATES[(i + 2) % PLAYBACK_RATES.length];"
  },
  {
    etiqueta: "el numero se escribe como un programador y no como se lee",
    archivo: "src/pip/pip.js",
    de: '    return String(rate).replace(".", t("separador_decimal")) + "×";',
    a: '    return String(rate) + "x";'
  },
  {
    etiqueta: "el boton se enciende tambien a velocidad normal",
    archivo: "src/pip/pip.js",
    de: '    els.speed.setAttribute("aria-pressed", String(!normal));',
    a: '    els.speed.setAttribute("aria-pressed", "true");'
  },
  {
    etiqueta: "el estado se ve pero no se anuncia a quien no lo ve",
    archivo: "src/pip/pip.js",
    de: '    els.speed.setAttribute("aria-label", etiqueta);',
    a: '    els.speed.setAttribute("aria-label", els.speed.textContent);'
  },
  {
    etiqueta: "render deja de pintar la velocidad (el cartel se queda congelado)",
    archivo: "src/pip/pip.js",
    de: "    pintarVelocidad(state.playbackRate);",
    a: ";"
  },
  {
    etiqueta: "la lista se ordena 'por limpieza' y el ciclo cambia de sentido",
    archivo: "src/shared/constants.js",
    de: "    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75],",
    a: "    PLAYBACK_RATES: [0.75, 1, 1.25, 1.5],"
  },
  {
    etiqueta: "se ofrece una velocidad que el controlador va a acotar",
    archivo: "src/shared/constants.js",
    de: "    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75],",
    a: "    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75, 8],"
  },
  {
    etiqueta: "se cuela un decimal que no es exacto en binario (indexOf fallaria)",
    archivo: "src/shared/constants.js",
    de: "    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75],",
    a: "    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75, 0.1 + 0.2],"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
