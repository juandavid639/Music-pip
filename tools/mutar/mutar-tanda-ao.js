/*
 * Verificacion por MUTACION de la tanda AO: el menu con pestañas y los
 * ajustes rapidos.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   2/1/1/1/2/2/2/2/1/3
 *
 * El ultimo estropea el HTML (una errata en un valor) y debe caer en el
 * censo, en el clic que escribe y en el pintado de lo guardado.
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/popup-ajustes.test.js", "tests/unit/popup.test.js"];
const JS = "src/popup/popup.js";

const MUTACIONES = [
  { etiqueta: "las pestañas no esconden su panel", archivo: JS, de: "      if (panel) panel.hidden = !elegida;", a: "      ;", esperadas: 2 },
  { etiqueta: "todas las pestañas siguen en el orden del tabulador", archivo: JS, de: "      p.tabIndex = elegida ? 0 : -1;", a: "      ;", esperadas: 1 },
  { etiqueta: "las flechas no mueven", archivo: JS, de: '      const paso = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;', a: "      const paso = 0;", esperadas: 1 },
  { etiqueta: "no se recuerda la pestaña", archivo: JS, de: "      localStorage.setItem(RECUERDO_PESTANA, pestana.id);", a: "      ;", esperadas: 1 },
  { etiqueta: "el interruptor escribe el valor al reves", archivo: JS, de: "      guardar(el.dataset.clave, encendido ? el.dataset.no : el.dataset.si);", a: "      guardar(el.dataset.clave, encendido ? el.dataset.si : el.dataset.no);", esperadas: 2 },
  { etiqueta: "los interruptores no pintan lo guardado", archivo: JS, de: '      el.setAttribute("aria-checked", String(ajustes[el.dataset.clave] === el.dataset.si));', a: "      ;", esperadas: 2 },
  { etiqueta: "los segmentos no pintan lo guardado", archivo: JS, de: '        b.setAttribute("aria-pressed", String(ajustes[grupo.dataset.clave] === b.dataset.valor));', a: "        ;", esperadas: 2 },
  { etiqueta: "el menu no escucha las preferencias", archivo: JS, de: "  if (self.YTMPip.Settings) self.YTMPip.Settings.subscribe(pintarAjustes);", a: "  ;", esperadas: 2 },
  { etiqueta: "la hoja deja ver los dos paneles", archivo: "src/popup/popup.css", de: ".ytmpip-popup-panel[hidden] {\n  display: none;\n}", a: "", esperadas: 1 },
  { etiqueta: "una errata en el HTML: «vinilo» en vez de «vinyl»", archivo: "src/popup/popup.html", de: 'data-clave="coverStyle" data-si="vinyl"', a: 'data-clave="coverStyle" data-si="vinilo"', esperadas: 3 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
