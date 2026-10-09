/*
 * Verificacion por MUTACION de las tandas AZ (abrir desde el menu con un
 * clic en la pagina) y BA (modo cine).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   AZ: 1/1/1/1/1/1/1/1
 *   BA: 2/2/1/2/1
 *
 * BA primera: sin el cine en layoutFor caen la decision pura y el boton en
 * la ventana montada. Segunda: con el cine valiendo sin video caen «sin
 * video no cambia nada» y «si deja de traer video se apaga». Cuarta: el
 * boton siempre visible cae en «solo con video» y en «deja de traer video».
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/service-worker.test.js",
  "tests/unit/pip-lanzador.test.js",
  "tests/unit/popup.test.js",
  "tests/unit/pip-density.test.js",
  "tests/unit/pip-cine.test.js"
];
const SW = "src/background/service-worker.js";
const PIP = "src/pip/pip.js";

const MUTACIONES = [
  // AZ
  { etiqueta: "el menu vuelve a solo hacer parpadear el boton", archivo: SW, de: '    if (await esperarClicEnPestana(target)) return "esperando-clic";\n', a: "", esperadas: 1 },
  { etiqueta: "la ventana de la pestaña no pasa al frente", archivo: SW, de: '    if (typeof tab.windowId === "number") await chrome.windows.update(tab.windowId, { focused: true });\n', a: "", esperadas: 1 },
  { etiqueta: "el clic en la capa no abre nada", archivo: PIP, de: '    capa.addEventListener("click", abrir);\n', a: "", esperadas: 1 },
  { etiqueta: "el clic que abre le llega tambien a la pagina", archivo: PIP, de: "      event.stopPropagation();\n      quitar();\n      openPip()", a: "      quitar();\n      openPip()", esperadas: 1 },
  { etiqueta: "la capa no se va sola", archivo: PIP, de: "    plazo = setTimeout(quitar, PLAZO_CAPA_MS);", a: "    plazo = null;", esperadas: 1 },
  { etiqueta: "Esc no quita la capa", archivo: PIP, de: '      if (event.key === "Escape") {', a: "      if (false) {", esperadas: 1 },
  { etiqueta: "pedirla dos veces deja dos capas", archivo: PIP, de: "    if (previa) previa.remove();\n", a: "", esperadas: 1 },
  { etiqueta: "el menu se queda delante de la pagina", archivo: "src/popup/popup.js", de: "          setTimeout(() => window.close(), 700);\n", a: "", esperadas: 1 },
  // BA
  { etiqueta: "layoutFor no atiende al modo cine", archivo: PIP, de: "(hasVideo && (mini || Boolean(cine)))", a: "(hasVideo && mini)", esperadas: 2 },
  { etiqueta: "el cine vale sin video", archivo: PIP, de: "(hasVideo && (mini || Boolean(cine)))", a: "((hasVideo && mini) || Boolean(cine))", esperadas: 2 },
  { etiqueta: "cualquier superpuesto cuenta como cine", archivo: PIP, de: '    els.root.classList.toggle("ytmpip-cine", l.overlay && modoCine && videoMode);', a: '    els.root.classList.toggle("ytmpip-cine", l.overlay);', esperadas: 1 },
  { etiqueta: "el boton de cine se ve siempre", archivo: PIP, de: "    els.cinemaToggle.hidden = !videoMode;", a: "    els.cinemaToggle.hidden = false;", esperadas: 2 },
  { etiqueta: "en cine siguen las filas de abajo", archivo: "src/pip/pip.css", de: "#ytmpip-root.ytmpip-cine .ytmpip-extras,\n#ytmpip-root.ytmpip-cine .ytmpip-secondary-actions {\n  display: none;", a: "#ytmpip-root.ytmpip-cine .ytmpip-extras,\n#ytmpip-root.ytmpip-cine .ytmpip-secondary-actions {\n  opacity: 1;", esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
