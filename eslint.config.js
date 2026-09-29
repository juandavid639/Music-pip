/*
 * ESLINT, EL MINIMO (tanda AG).
 *
 * Dos reglas y ninguna de estilo: variables que no existen (no-undef) y
 * variables que nadie usa (no-unused-vars). Son las dos que atrapan fallos
 * de verdad en un proyecto sin compilador: un nombre mal escrito en una
 * rama que ninguna prueba recorre revienta en el navegador del usuario, y
 * una variable huerfana suele ser la mitad de un cambio que se quedo a
 * medias. El estilo ya es uniforme a mano; un formateador aqui seria un
 * diff de miles de lineas sin un solo arreglo dentro.
 *
 * Los archivos de src/ son scripts clasicos (no modulos): se cargan con
 * <script> o como content scripts y comparten el espacio YTMPip. Por eso
 * sourceType "script" y YTMPip como global de solo lectura.
 *
 * Fuera del zip: empaquetar.ps1 trabaja con lista blanca.
 */
const globals = require("globals");

const REGLAS = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
};

module.exports = [
  { ignores: ["node_modules/**", "dist/**"] },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        chrome: "readonly",
        YTMPip: "readonly",
        // Los compartidos se exportan tambien a Node para las pruebas.
        module: "readonly"
      }
    },
    rules: REGLAS
  },
  {
    files: ["src/background/**/*.js"],
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    files: ["tests/**/*.js", "tools/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    rules: REGLAS
  },
  {
    // Guiones de consola: se pegan en la pestaña del sitio, no corren en Node.
    // `copy` es de la consola de DevTools; `chrome` y `YTMPip` existen en el
    // contexto «Music PiP» de la consola, que es donde se pegan los de la
    // tanda AL y el de rendimiento.
    files: ["tools/diagnostico-*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        documentPictureInPicture: "readonly",
        chrome: "readonly",
        copy: "readonly",
        YTMPip: "readonly"
      }
    }
  }
];
