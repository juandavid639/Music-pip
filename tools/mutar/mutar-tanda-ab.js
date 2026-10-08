/*
 * Verificacion por MUTACION de la tanda AB: el fundido entre caratulas.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/2/1/1/1/1/1/1/1/1/1/2
 *
 * Arnes de tools/mutar/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/pip-fundido.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "la misma portada crea copia cada vez",
    "archivo": "src/pip/pip.js",
    "de": "    if (vieja === nueva) return;",
    "a": "    ;"
  },
  {
    "etiqueta": "la primera portada tambien funde",
    "archivo": "src/pip/pip.js",
    "de": "    if (!vieja || !pipWindow || menosMovimiento()) return;",
    "a": "    if (!pipWindow || menosMovimiento()) return;"
  },
  {
    "etiqueta": "se funde aunque se pida menos movimiento",
    "archivo": "src/pip/pip.js",
    "de": "    if (!vieja || !pipWindow || menosMovimiento()) return;",
    "a": "    if (!vieja || !pipWindow) return;"
  },
  {
    "etiqueta": "las copias se amontonan",
    "archivo": "src/pip/pip.js",
    "de": "    escenario.querySelectorAll(\".ytmpip-saliente\").forEach((c) => c.remove());\n",
    "a": ""
  },
  {
    "etiqueta": "el lector lee las dos portadas",
    "archivo": "src/pip/pip.js",
    "de": "    copia.setAttribute(\"aria-hidden\", \"true\");\n",
    "a": ""
  },
  {
    "etiqueta": "dos elementos con el mismo id",
    "archivo": "src/pip/pip.js",
    "de": "    copia.removeAttribute(\"id\");\n",
    "a": ""
  },
  {
    "etiqueta": "la copia gira desde cero con el vinilo",
    "archivo": "src/pip/pip.js",
    "de": "    copia.style.animation = \"none\";\n",
    "a": ""
  },
  {
    "etiqueta": "la copia nunca se desvanece",
    "archivo": "src/pip/pip.js",
    "de": "      copia.classList.add(\"ytmpip-desvaneciendo\");\n",
    "a": ""
  },
  {
    "etiqueta": "la copia se queda para siempre",
    "archivo": "src/pip/pip.js",
    "de": "      pipWindow.setTimeout(() => copia.remove(), FUNDIDO_MS + 100);",
    "a": "      ;"
  },
  {
    "etiqueta": "la copia no se pone encima en el mismo sitio",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente {\n  position: absolute;\n",
    "a": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente {\n"
  },
  {
    "etiqueta": "desvanecerse no la desvanece",
    "archivo": "src/pip/pip.css",
    "de": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente.ytmpip-desvaneciendo {\n  opacity: 0;",
    "a": ".ytmpip-stage > .ytmpip-artwork.ytmpip-saliente.ytmpip-desvaneciendo {\n  opacity: 1;"
  },
  {
    "etiqueta": "la copia lleva la portada nueva y no la vieja",
    "archivo": "src/pip/pip.js",
    "de": "    copia.src = vieja;\n",
    "a": ""
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
