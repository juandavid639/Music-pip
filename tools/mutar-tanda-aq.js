/*
 * Verificacion por MUTACION de la tanda AQ: el ingles como idioma por
 * defecto y primero en lo bilingue publicado.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista: 1/1
 * (las dos caen en la misma prueba de la decision fijada).
 *
 * Arnes comun: tools/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/localizacion.test.js"];

const MUTACIONES = [
  {
    etiqueta: "el español vuelve a ser el idioma por defecto",
    archivo: "manifest.json",
    de: '"default_locale": "en",',
    a: '"default_locale": "es",',
    esperadas: 1
  },
  {
    etiqueta: "la politica vuelve a abrir en español",
    archivo: "tienda/politica-de-privacidad.html",
    de: '<html lang="en">',
    a: '<html lang="es">',
    esperadas: 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
