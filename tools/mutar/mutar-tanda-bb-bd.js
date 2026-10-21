/*
 * Verificacion por MUTACION de las tandas BB (la letra a la par: el reloj
 * afinado y el adelanto de Better Lyrics), BC (el recorrido de la linea y lo
 * que viene mas apagado) y BD (la persiana de la letra).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   BB: 1/1/2
 *   BC: 2/1/1/1/1/3
 *   BD: 1/1/1/1/2/1/1
 *
 * BB tercera: sin adelanto caen la de encenderse a la par y la del
 * porcentaje (que se calcula en 15,115). BC primera: sin palabras caen la
 * pura y la del porcentaje en la ventana. BC sexta: sin el <span> en la
 * linea caen el texto entero, el porcentaje y «al pasar suelta el
 * recorrido» (no hay <span> que mirar). BD quinta: si 0 y negativos se
 * acotan en vez de olvidarse, caen la de normalizar y la del doble clic
 * (null se anotaria como 0,2).
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/track-timeline.test.js",
  "tests/unit/pip-letra-recorrido.test.js",
  "tests/unit/pip-persiana.test.js",
  "tests/unit/settings-recargas.test.js"
];
const TL = "src/content/track-timeline.js";
const PIP = "src/pip/pip.js";
const CSS = "src/pip/pip.css";
const AJ = "src/shared/settings.js";

const MUTACIONES = [
  // BB
  { etiqueta: "el desplazamiento se queda con la primera lectura", archivo: TL, de: "      } else if (candidato < desplazamiento && !medioSaltando()) {", a: "      } else if (false) {", esperadas: 1 },
  { etiqueta: "una lectura durante un salto tambien afina", archivo: TL, de: "      } else if (candidato < desplazamiento && !medioSaltando()) {", a: "      } else if (candidato < desplazamiento) {", esperadas: 1 },
  { etiqueta: "sin el adelanto de Better Lyrics", archivo: PIP, de: "  const ADELANTO_LETRA = 0.115;", a: "  const ADELANTO_LETRA = 0;", esperadas: 2 },
  // BC
  { etiqueta: "el recorrido no mira las palabras", archivo: PIP, de: "    if (Array.isArray(palabras) && palabras.length) {", a: "    if (false) {", esperadas: 2 },
  { etiqueta: "sin duracion no se mide hasta la siguiente", archivo: PIP, de: "      : Number.isFinite(siguienteTime) && siguienteTime > linea.time", a: "      : false", esperadas: 1 },
  { etiqueta: "la linea anterior se queda con el recorrido", archivo: PIP, de: '      lineaRecorrida.el.classList.remove("ytmpip-lyric-recorrido");\n', a: "", esperadas: 1 },
  { etiqueta: "los coros de fondo cuentan como palabras", archivo: "src/content/lyrics-reader.js", de: '      (w) => !w.closest(".blyrics-background-lyric, .blyrics-background-line")', a: "      (w) => w", esperadas: 1 },
  { etiqueta: "lo que viene no se apaga", archivo: CSS, de: ".ytmpip-lyric-active ~ .ytmpip-lyric-line {\n  opacity: 0.6;", a: ".ytmpip-lyric-active ~ .ytmpip-lyric-line {\n  opacity: 1;", esperadas: 1 },
  { etiqueta: "el texto no va en su <span>", archivo: PIP, de: "      p.appendChild(texto);\n", a: "", esperadas: 3 },
  // BD
  { etiqueta: "la persiana no tiene topes", archivo: PIP, de: "    return Math.min(PIP_LIMITS.LYRICS_SHARE_MAX, Math.max(PIP_LIMITS.LYRICS_SHARE_MIN, fraccion));", a: "    return fraccion;", esperadas: 1 },
  { etiqueta: "soltar no anota la persiana", archivo: PIP, de: "      if (fraccion !== null) YTMPip.Settings.anotarAltoLetra(fraccion);\n", a: "", esperadas: 1 },
  { etiqueta: "el doble clic no devuelve el alto de siempre", archivo: PIP, de: "      YTMPip.Settings.anotarAltoLetra(null);\n      aplicarAltoLetra(null);\n", a: "", esperadas: 1 },
  { etiqueta: "pasar el raton sin pulsar mueve la persiana", archivo: PIP, de: "      if (!arrastrando || !pipWindow) return;", a: "      if (!pipWindow) return;", esperadas: 1 },
  { etiqueta: "cero y negativos se acotan en vez de olvidarse", archivo: AJ, de: "    if (value === null || value === undefined || !Number.isFinite(n) || n <= 0) return null;", a: "    if (!Number.isFinite(n)) return null;", esperadas: 2 },
  { etiqueta: "con la persiana movida sigue la fila de extras", archivo: CSS, de: "#ytmpip-root.ytmpip-letra-a-medida:not(.ytmpip-lyrics-stage) .ytmpip-extras {\n  display: none;", a: "#ytmpip-root.ytmpip-letra-a-medida:not(.ytmpip-lyrics-stage) .ytmpip-extras {\n  opacity: 1;", esperadas: 1 },
  { etiqueta: "mover la persiana despierta a todas las pestañas", archivo: AJ, de: "    STORAGE_KEYS.LYRICS_PANEL_SHARE,\n", a: "", esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
