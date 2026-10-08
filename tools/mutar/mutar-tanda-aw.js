/*
 * Verificacion por MUTACION de la tanda AW: el adaptador de Deezer.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/1/1
 *
 * La sexta lee repetir del aria-label en vez del testid: deberia caer en
 * la prueba que pone el aria-label de la accion SIGUIENTE (lo medido).
 *
 * REFIJADA tras la primera pasada (6 de 7 exactas): la sexta cayo en DOS, y
 * con razon. Con repetir APAGADO el aria-label medido dice «Repetir todas
 * las canciones de la lista» (la accion siguiente), asi que leido de ahi el
 * modo sale «todas» estando apagado: cae tambien la prueba del estado
 * entero, que es exactamente el fallo que se queria evitar. Prediccion:
 * 1/1/1/1/1/2/1.
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/adaptador-deezer.test.js"];
const AD = "src/content/deezer-adapter.js";

const MUTACIONES = [
  { etiqueta: "Deezer suena siempre", archivo: AD, de: '      if (id === "play_button_play") return false;', a: '      if (id === "play_button_play") return true;', esperadas: 1 },
  { etiqueta: "los artistas salen pegados por comas", archivo: AD, de: '    const texto = enlaces.length ? enlaces.join(", ") : (original.textContent || "").trim();', a: '    const texto = (original.textContent || "").trim();', esperadas: 1 },
  { etiqueta: "el tiempo se lee del valor de serie del HTML", archivo: AD, de: "      const elapsed = barra ? Number(barra.value) : NaN;", a: "      const elapsed = barra ? Number(barra.getAttribute(\"value\")) * 0 : NaN;", esperadas: 1 },
  { etiqueta: "repetir una no se reconoce", archivo: AD, de: '      if (id === "repeat_button_single") return "ONE";\n', a: "", esperadas: 1 },
  { etiqueta: "saltar no suelta (Deezer confirma el salto al soltar)", archivo: AD, de: '      barra.dispatchEvent(new Puntero("pointerup", Object.assign({ pointerId: 1, isPrimary: true }, raton)));\n', a: "", esperadas: 1 },
  { etiqueta: "repetir se lee del aria-label, que dice la accion siguiente", archivo: AD, de: "      const id = testid(this.getRepeatButton());", a: "      const boton = this.getRepeatButton();\n      const etq = (boton && boton.getAttribute(\"aria-label\")) || \"\";\n      const id = /esta canci/i.test(etq) ? \"repeat_button_single\" : /todas/i.test(etq) ? \"repeat_button_all\" : \"repeat_button_off\";", esperadas: 2 },
  { etiqueta: "favoritos no se lee", archivo: AD, de: '      if (id.endsWith("_off")) return LIKE_STATUS.INDIFFERENT;\n', a: "", esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
