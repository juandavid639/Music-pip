/*
 * Verificacion por MUTACION de la tanda AY: el adaptador de Apple Music, la
 * puerta del espectro por capacidad y la exencion de salud en los avances.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   4/1/1/1/1/1/2/1
 *
 * Primera: tomando el <video> de la caratula como medio caen «el medio es
 * el <audio>», el estado entero (la duracion es del <audio>) y las dos de
 * salud (el <video> esta en pausa: nada que comprobar). Septima: si
 * cualquier boton vale como «siguiente», cae la de buscarlos por etiqueta y
 * la de «fuera de un avance la salud avisa» (el de pausa pasaria por
 * siguiente).
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/adaptador-apple-music.test.js", "tests/unit/espectro-y-grafo.test.js"];
const AD = "src/content/apple-music-adapter.js";

const MUTACIONES = [
  { etiqueta: "el medio es el <video> de la caratula animada", archivo: AD, de: '    media: ["audio"]', a: '    media: ["video"]', esperadas: 4 },
  { etiqueta: "la caratula se queda en 80x80", archivo: AD, de: '    return { src: img.src.replace(/\\/\\d+x\\d+bb(-\\d+)?\\.(jpg|webp|png)$/, "/600x600bb.$2") };', a: "    return { src: img.src };", esperadas: 1 },
  { etiqueta: "el album se pierde", archivo: AD, de: '    const album = raya !== -1 ? trozos[raya + 1] : "";', a: '    const album = "";', esperadas: 1 },
  { etiqueta: "el adaptador no dice que en avances no hay siguiente", archivo: AD, de: '      return queryFirst(SELECTORS.previewBadge) ? ["getNextButton"] : [];', a: "      return [];", esperadas: 1 },
  { etiqueta: "la salud no hace caso de las piezas exentas", archivo: "src/content/adapter-registry.js", de: "        if (exentas.indexOf(getter) !== -1) return false;\n", a: "", esperadas: 1 },
  { etiqueta: "el espectro mide aunque el sitio diga que no se puede", archivo: "src/content/audio-spectrum.js", de: "    if (YTMPip.Capacidades && YTMPip.Capacidades.audioGrafo === false) return false;\n", a: "", esperadas: 1 },
  { etiqueta: "cualquier boton vale como siguiente o anterior", archivo: AD, de: '        patron.test((b.getAttribute("aria-label") || "") + " " + (b.textContent || ""))', a: "        true", esperadas: 2 },
  { etiqueta: "Apple Music declara Web Audio", archivo: AD, de: "      audioGrafo: false\n    },\n    adapter", a: "      audioGrafo: true\n    },\n    adapter", esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
