/*
 * Verificacion por MUTACION de la tanda AS: los ajustes propios del
 * ecualizador.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1/1/1
 *
 * Duda escrita antes de correr: la quinta (settings no sanea la lista)
 * puede vivir si ninguna prueba mira equalizerCustom con storage vacio o
 * con basura; si vive, falta esa prueba.
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/ecualizador-propios.test.js",
  "tests/unit/settings.test.js",
  "tests/unit/settings-recargas.test.js"
];
const EQ = "src/shared/ecualizador.js";
const OPC = "src/options/options.js";

const MUTACIONES = [
  { etiqueta: "la ventana ya no nombra el ajuste propio", archivo: "src/pip/pip.js", de: '    return Eq.propioDe(valor, YTMPip.Settings.get().equalizerCustom) || t("eq_ajuste_propio");', a: '    return t("eq_ajuste_propio");', esperadas: 1 },
  { etiqueta: "guardar con un nombre que existe no lo pasa al final", archivo: EQ, de: "      porNombre.delete(nombre);\n", a: "", esperadas: 1 },
  { etiqueta: "la lista no tiene tope", archivo: EQ, de: "    return Array.from(porNombre.values()).slice(-EQUALIZER_CUSTOM_LIMITS.MAX);", a: "    return Array.from(porNombre.values());", esperadas: 1 },
  { etiqueta: "el nombre no se corta", archivo: EQ, de: "      const nombre = entrada.nombre.trim().slice(0, EQUALIZER_CUSTOM_LIMITS.NOMBRE_MAX).trim();", a: "      const nombre = entrada.nombre.trim();", esperadas: 1 },
  { etiqueta: "settings no sanea la lista", archivo: "src/shared/settings.js", de: "      equalizerCustom: YTMPip.Ecualizador.normalizarPropios(stored[STORAGE_KEYS.EQUALIZER_CUSTOM]),", a: "      equalizerCustom: stored[STORAGE_KEYS.EQUALIZER_CUSTOM],", esperadas: 1 },
  { etiqueta: "se puede guardar con el ecualizador apagado", archivo: OPC, de: "    guardarPropio.disabled = enUso === Ecualizador.APAGADO || !nombre || (lleno && !sobrescribe);", a: "    guardarPropio.disabled = !nombre || (lleno && !sobrescribe);", esperadas: 1 },
  { etiqueta: "con la lista llena no se puede ni sobrescribir", archivo: OPC, de: "    guardarPropio.disabled = enUso === Ecualizador.APAGADO || !nombre || (lleno && !sobrescribe);", a: "    guardarPropio.disabled = enUso === Ecualizador.APAGADO || !nombre || lleno;", esperadas: 1 },
  { etiqueta: "usar no escribe nada", archivo: OPC, de: "    chrome.storage.local.set(claves);\n  }\n\n  function borrarPropio", a: "    ;\n  }\n\n  function borrarPropio", esperadas: 1 },
  { etiqueta: "el que suena no se marca", archivo: OPC, de: '      usar.setAttribute("aria-pressed", String(propio.valor === enUso));', a: '      usar.setAttribute("aria-pressed", "false");', esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
