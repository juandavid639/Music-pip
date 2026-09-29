/*
 * Verificacion por MUTACION de la tanda AL: los dos guiones de consola.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1
 *
 * «pierde los antepasados»: en YouTube Music no se nota (sus selectores
 * tienen respaldos sin contexto); lo ve la ida y vuelta de Spotify. Si no
 * cae, la prediccion se refija por escrito aqui con el motivo.
 *
 * REFIJADA tras la primera pasada (3 de 5). «se queda con los scripts»
 * vivio porque la prueba metia el <script> FUERA de lo capturado; ahora va
 * dentro de la barra. «pierde los antepasados» vivio tambien con la ida y
 * vuelta ampliada a letra, sin letra, Better Lyrics y cola: ningun
 * selector de hoy los necesita (todos tienen un respaldo sin contexto, y
 * el unico que exige #tab-renderer lo tiene porque ES la raiz capturada).
 * Prediccion ANTES de la segunda pasada: que vuelva a vivir. Si vive, el
 * esqueleto se queda como seguro para selectores futuros y la mutacion
 * pasa a deliberada, dicho aqui y en el README.
 *
 * Arnes comun: tools/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/guiones-consola.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "la fixture pierde los antepasados",
    "archivo": "tools/diagnostico-fixture.js",
    "de": "    const padre = raiz.parentElement === document.body ? cuerpo : cascara(raiz.parentElement);",
    "a": "    const padre = cuerpo;",
    "deliberada": true
  },
  {
    "etiqueta": "la fixture se queda con los scripts",
    "archivo": "tools/diagnostico-fixture.js",
    "de": "  const FUERA = \"script,style,link,iframe,canvas,noscript,template\";",
    "a": "  const FUERA = \"noscript\";",
    "esperadas": 1
  },
  {
    "etiqueta": "la fixture se queda con los manejadores de evento",
    "archivo": "tools/diagnostico-fixture.js",
    "de": "if (/^on/i.test(a.name) || a.name === \"style\"",
    "a": "if (a.name === \"style\"",
    "esperadas": 1
  },
  {
    "etiqueta": "sin el contexto de la extension, revienta en vez de explicarlo",
    "archivo": "tools/diagnostico-fixture.js",
    "de": "  if (typeof YTMPip === \"undefined\" || !YTMPip.Adapter) {",
    "a": "  if (false) {",
    "esperadas": 1
  },
  {
    "etiqueta": "la comprobacion no marca ningun fallo",
    "archivo": "tools/diagnostico-publicacion.js",
    "de": "resultado: ok === null ? \"—\" : ok ? \"OK\" : \"FALLA\"",
    "a": "resultado: ok === null ? \"—\" : \"OK\"",
    "esperadas": 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
