/*
 * Verificacion por MUTACION de la tanda AM: el latido del halo arranca al
 * abrir si la PAGINA ya tuvo un gesto (activacion pegajosa), sin tener que
 * pulsar el ✨ dos veces (lo reporto el autor con la 1.2.0).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/2
 *
 * El tercero cae en dos: la prueba nueva del modo fijo y la vieja «el 💓
 * encendido con el halo fijo no hace brillar el borde», que da gesto por
 * el pulso con el halo en fijo.
 *
 * Primera pasada: 3 de 3 muertas, 2 de 3 exactas. El tercero cayo en UNO:
 * la prueba vieja del 💓 no lo ve porque `haloLate` (lo que de verdad hace
 * latir el borde) exige el modo latido en su propia linea; el mutante solo
 * monta un analizador para nadie, y eso lo ve la prueba nueva del modo
 * fijo (contextos.length). Prediccion corregida: 1/1/1.
 *
 * Arnes comun: tools/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/pip-halo.test.js"];

const MUTACIONES = [
  {
    etiqueta: "el gesto de la pagina no cuenta (la 1.2.0)",
    archivo: "src/pip/pip.js",
    de: "    const haloQuiereLatir = haloEncendido && haloModoLatido && (gestoEnSesion || paginaConGesto());",
    a: "    const haloQuiereLatir = haloEncendido && haloModoLatido && gestoEnSesion;",
    esperadas: 1
  },
  {
    etiqueta: "basta con que exista la API, aunque la pagina no tuviera gesto",
    archivo: "src/pip/pip.js",
    de: "      return Boolean(activacion && activacion.hasBeenActive);",
    a: "      return Boolean(activacion);",
    esperadas: 1
  },
  {
    etiqueta: "con gesto late tambien el halo en modo fijo",
    archivo: "src/pip/pip.js",
    de: "    const haloQuiereLatir = haloEncendido && haloModoLatido && (gestoEnSesion || paginaConGesto());",
    a: "    const haloQuiereLatir = haloEncendido && (gestoEnSesion || paginaConGesto());",
    esperadas: 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
