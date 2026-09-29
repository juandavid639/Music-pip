/*
 * Verificacion por MUTACION de la tanda AJ: exportar, importar y volver a
 * los valores de fabrica en Preferencias.
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   3/1/1/1/1/1
 *
 * El primero cae en tres: el archivo lleva pipLastSize (normalize lo
 * rellena), la lista de claves exportadas deja de ser la de preferencias,
 * y restaurar borra las anotaciones.
 * SIN PRUEBA: vaciar el <input type=file> tras elegir (para que el mismo
 * archivo se pueda importar dos veces). En jsdom el change se dispara a
 * mano y no hay forma de ver la diferencia.
 *
 * Arnes comun: tools/mutar-comun.js (reintentos, restauracion verificada,
 * recuento contra `esperadas`).
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/opciones-copia.test.js"
];

const MUTACIONES = [
  {
    "etiqueta": "viajan tambien las anotaciones",
    "archivo": "src/options/options.js",
    "de": "    return Object.values(STORAGE_KEYS).filter((clave) => self.YTMPip.Settings.seAplica(clave));",
    "a": "    return Object.values(STORAGE_KEYS);",
    "esperadas": 3
  },
  {
    "etiqueta": "se exporta lo guardado a pelo, sin rellenar lo de serie",
    "archivo": "src/options/options.js",
    "de": "      const limpio = self.YTMPip.Settings.normalize(guardado || {});",
    "a": "      const limpio = guardado || {};",
    "esperadas": 1
  },
  {
    "etiqueta": "se importa cualquier JSON con «preferencias»",
    "archivo": "src/options/options.js",
    "de": "datos.app !== ARCHIVO_APP || ",
    "a": "",
    "esperadas": 1
  },
  {
    "etiqueta": "lo importado no se sanea",
    "archivo": "src/options/options.js",
    "de": "    const limpio = self.YTMPip.Settings.normalize(entrada);",
    "a": "    const limpio = entrada;",
    "esperadas": 1
  },
  {
    "etiqueta": "importar escribe tambien lo que el archivo no trae",
    "archivo": "src/options/options.js",
    "de": "      if (Object.prototype.hasOwnProperty.call(entrada, clave) && limpio[clave] !== undefined) {",
    "a": "      if (limpio[clave] !== undefined) {",
    "esperadas": 1
  },
  {
    "etiqueta": "restaurar no pide confirmacion",
    "archivo": "src/options/options.js",
    "de": "    if (!window.confirm(t(\"confirmar_restaurar\"))) return;\n",
    "a": "",
    "esperadas": 1
  }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
