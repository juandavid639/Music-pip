/*
 * Verificacion por MUTACION de la tanda AD: la vista previa viva (pinta las
 * preferencias guardadas y se repinta al cambiarlas) y pegada al scroll, y
 * el modulo compartido del espectro.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   6/4/2/2/1/1/1/1/1/1/1/1/1
 *
 * Refijada tras la primera pasada, por escrito y antes de repetirla:
 *  - «el marco no se entera de los cambios»: predije 6 y cayeron 4. Supuse
 *    que sin suscripcion el marco pintaria los valores de serie, y no: la
 *    carga que settings.js lanza al arrancar ya termino cuando el marco
 *    pinta por primera vez, asi que pinta lo guardado. Solo caen las cuatro
 *    pruebas que cambian algo DESPUES de abrir. Prediccion nueva: 4.
 *  - «el marco no lee lo guardado al abrir» SOBREVIVIO con razon: la linea
 *    era un segundo Settings.load() que no hacia nada (settings.js ya lo
 *    llama al cargarse). Se quito la linea y el mutante sale de la lista.
 *
 * Prediccion refijada: 4/2/2/1/1/1/1/1/1/1/1/1
 *
 * Arnes de tools/mutar-tanda-y.js (escribe con reintentos por los bloqueos
 * de OneDrive): de usar y tirar, fuera de `npm test`, y restaura los
 * archivos pase lo que pase.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/vista-previa.test.js", "tests/unit/formas-espectro.test.js"];

const MUTACIONES = [
  {
    "etiqueta": "el marco no se entera de los cambios (la 1.1.0)",
    "archivo": "src/options/vista-previa.js",
    "de": "    Settings.subscribe(aplicarPreferencias);\n",
    "a": ""
  },
  {
    "etiqueta": "el marco ignora el disco",
    "archivo": "src/options/vista-previa.js",
    "de": "  root.classList.toggle(\"ytmpip-vinilo\", p.coverStyle === \"vinyl\");",
    "a": "  root.classList.toggle(\"ytmpip-vinilo\", false);"
  },
  {
    "etiqueta": "el marco ignora el tema claro",
    "archivo": "src/options/vista-previa.js",
    "de": "p.theme === \"light\" || ",
    "a": ""
  },
  {
    "etiqueta": "el tinte se queda al cambiar de tema",
    "archivo": "src/options/vista-previa.js",
    "de": "  else html.style.removeProperty(\"--ytmpip-bg-rgb\");\n",
    "a": ""
  },
  {
    "etiqueta": "el marco ignora el halo apagado",
    "archivo": "src/options/vista-previa.js",
    "de": "    halo.hidden = p.haloPreference === \"hidden\";",
    "a": "    halo.hidden = false;"
  },
  {
    "etiqueta": "el marco ignora el color propio del halo",
    "archivo": "src/options/vista-previa.js",
    "de": "    if (String(p.haloColor).charAt(0) === \"#\") halo.style.setProperty(\"--ytmpip-halo-color\", p.haloColor);\n    else if",
    "a": "    if"
  },
  {
    "etiqueta": "el marco dibuja siempre barras",
    "archivo": "src/options/vista-previa.js",
    "de": "    forma: p.spectrumStyle,",
    "a": "    forma: \"bars\","
  },
  {
    "etiqueta": "el halo del marco nunca late",
    "archivo": "src/options/vista-previa.js",
    "de": "  const late = p.haloPreference !== \"hidden\" && p.haloMode === \"pulse\";",
    "a": "  const late = false;"
  },
  {
    "etiqueta": "el marco se anima con menos movimiento",
    "archivo": "src/options/vista-previa.js",
    "de": "  if (!menosMovimiento()) requestAnimationFrame(animar);",
    "a": "  requestAnimationFrame(animar);"
  },
  {
    "etiqueta": "la vista previa deja de acompañar al scroll (la 1.1.0)",
    "archivo": "src/options/options.html",
    "de": "        position: sticky;\n        top: calc(var(--alto-cabecera, 64px) + 8px);",
    "a": "        position: static;\n        top: calc(var(--alto-cabecera, 64px) + 8px);"
  },
  {
    "etiqueta": "la grande se pega arriba en pantalla estrecha",
    "archivo": "src/options/options.html",
    "de": "        .ytmpip-lateral[data-tamano=\"grande\"] {\n          position: static;",
    "a": "        .ytmpip-lateral[data-tamano=\"grande\"] {\n          position: sticky;"
  },
  {
    "etiqueta": "la paleta pierde su color por barra",
    "archivo": "src/shared/formas-espectro.js",
    "de": "    if (paleta) return (i) =>",
    "a": "    if (false) return (i) =>"
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
