/*
 * Verificacion por MUTACION de la tanda AT: lo que escuchaste.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1
 *
 * La sexta (el historial deja de estar fuera de «lo que se aplica») debe
 * caer en la prueba de comportamiento del censo, no en la de la tabla.
 *
 * REFIJADA tras la primera pasada (6 de 7 exactas): la sexta cayo en 4
 * porque estaba MAL HECHA. Quitaba solo la coma, el arreglo quedaba con dos
 * expresiones seguidas (error de sintaxis), settings.js no cargaba y caia
 * todo lo que lo usa. Ahora quita la clave entera, que es el olvido que se
 * queria probar. Prediccion: 1/1/1/1/1/1/1.
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/historial.test.js", "tests/unit/settings-recargas.test.js"];
const H = "src/shared/historial.js";

const MUTACIONES = [
  { etiqueta: "se anota aunque el usuario no lo encendiera", archivo: "src/background/service-worker.js", de: "  if (!(await historialEncendido())) return;", a: "  ;", esperadas: 1 },
  { etiqueta: "cuenta tambien en pausa", archivo: H, de: "    if (!actual.contada && estado.playing && segundo >= umbralDe(estado)) {", a: "    if (!actual.contada && segundo >= umbralDe(estado)) {", esperadas: 1 },
  { etiqueta: "una cancion corta nunca llega al umbral", archivo: H, de: "Math.min(LIMITES.UMBRAL_S, duracion / 2)", a: "LIMITES.UMBRAL_S", esperadas: 1 },
  { etiqueta: "repetir la misma cancion no vuelve a contar", archivo: H, de: "    if (actual.contada && segundo < LIMITES.REINICIO_S) actual = { clave, contada: false };\n", a: "", esperadas: 1 },
  { etiqueta: "lo de hace mas de 90 dias no se olvida", archivo: H, de: "    const vigentes = normalizar(lista).filter((e) => e.cuando >= limite);", a: "    const vigentes = normalizar(lista);", esperadas: 1 },
  { etiqueta: "cada escucha anotada despierta a todas las pestañas", archivo: "src/shared/settings.js", de: "    STORAGE_KEYS.LAST_KNOWN_STATE,\n    // El historial crece con cada cancion (tanda AT): si «se aplicara», cada\n    // escucha anotada haria releer las preferencias a todas las pestañas.\n    STORAGE_KEYS.LISTENING_HISTORY\n  ];", a: "    STORAGE_KEYS.LAST_KNOWN_STATE\n  ];", esperadas: 1 },
  { etiqueta: "la pagina pinta los titulos como HTML", archivo: "src/historial/historial.js", de: "    titulo.textContent = principal;", a: "    titulo.innerHTML = principal;", esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
