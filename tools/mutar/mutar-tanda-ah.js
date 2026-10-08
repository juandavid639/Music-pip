/*
 * Verificacion por MUTACION de la tanda AH: el cortafuegos de la ventana.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   5/2/2/4/1
 *
 * SIN PRUEBA PROPIA, dicho claro: el aislamiento de cada seccion concreta
 * salvo el modo video y el lienzo (las demas usan el mismo `aislado`, y se
 * prueba el mecanismo, no las once llamadas), y el de los dos latidos de
 * 300 ms.
 *
 * Arnes comun: tools/mutar/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/pip-cortafuegos.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "el cortafuegos no apaga nada",
    "archivo": "src/pip/pip.js",
    "de": "    } catch (err) {\n      if (!seccionesQueFallaron.has(seccion)) {",
    "a": "    } catch (err) {\n      throw err;\n      if (!seccionesQueFallaron.has(seccion)) {",
    "esperadas": 5
  },
  {
    "etiqueta": "el mismo fallo se apunta en cada repintado",
    "archivo": "src/pip/pip.js",
    "de": "      if (!seccionesQueFallaron.has(seccion)) {",
    "a": "      if (true) {",
    "esperadas": 2
  },
  {
    "etiqueta": "el fallo pasa en silencio",
    "archivo": "src/pip/pip.js",
    "de": "        console.error(\"[YTMPip] Fallo en «\" + seccion",
    "a": "        void (\"[YTMPip] Fallo en «\" + seccion",
    "esperadas": 2
  },
  {
    "etiqueta": "el modo video vuelve a ir sin aislar",
    "archivo": "src/pip/pip.js",
    "de": "    const hayVideoQueAlternar = aislado(\"modo video\", () => syncVideoMode(state), false);",
    "a": "    const hayVideoQueAlternar = syncVideoMode(state);",
    "esperadas": 4
  },
  {
    "etiqueta": "el lienzo vuelve a tumbar el fotograma",
    "archivo": "src/pip/pip.js",
    "de": "      if (aislado(\"lienzo del espectro\", () => dibujarEspectro(ms), false)) quedaTrabajo = true;",
    "a": "      if (dibujarEspectro(ms)) quedaTrabajo = true;",
    "esperadas": 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
