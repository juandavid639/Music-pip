/*
 * Verificacion por MUTACION de la tanda AV: SoundCloud con permiso opcional
 * (el adaptador medido en vivo, el registro en marcha del service worker y
 * la tarjeta «Mas sitios» de Preferencias).
 *
 * Prediccion fijada ANTES de correr, en el orden de la lista:
 *   1/1/1/1/1/3/1/1/1/3/1
 *
 * Sexta: sin registro caen la de instalar con permiso, la de concederlo y
 * la premisa de la de retirarlo. Decima: con el boton al reves caen activar,
 * desactivar y «Chrome no lo concede» (que pasa a retirar en silencio).
 *
 * Arnes comun: tools/mutar/mutar-comun.js.
 */
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = [
  "tests/unit/adaptador-soundcloud.test.js",
  "tests/unit/service-worker.test.js",
  "tests/unit/opciones-sitios.test.js",
  "tests/unit/manifiesto-tienda.test.js"
];
const AD = "src/content/soundcloud-adapter.js";
const SW = "src/background/service-worker.js";

const MUTACIONES = [
  { etiqueta: "SoundCloud suena siempre", archivo: AD, de: '      return boton.classList.contains("playing");', a: "      return true;", esperadas: 1 },
  { etiqueta: "el titulo se lee con la frase para lectores de pantalla", archivo: AD, de: "    title: [\".playbackSoundBadge__titleLink span[aria-hidden='true']\", \".playbackSoundBadge__titleLink span[aria-hidden]\"],", a: '    title: [".playbackSoundBadge__titleLink"],', esperadas: 1 },
  { etiqueta: "la caratula se queda en 50x50", archivo: AD, de: '    return { src: m[1].replace(/-t\\d+x\\d+(\\.\\w+)$/, "-t500x500$1") };', a: "    return { src: m[1] };", esperadas: 1 },
  { etiqueta: "saltar cae siempre en la mitad", archivo: AD, de: "      const fraccion = Math.min(1, Math.max(0, segundos / duracion));", a: "      const fraccion = 0.5;", esperadas: 1 },
  { etiqueta: "repetir una no se reconoce", archivo: AD, de: '      if (boton.classList.contains("m-one")) return "ONE";\n', a: "", esperadas: 1 },
  { etiqueta: "con el permiso no se registra el script", archivo: SW, de: "      if (concedido && registrados.length === 0 && ARCHIVOS_DE_CONTENIDO.length) {", a: "      if (false) {", esperadas: 3 },
  { etiqueta: "sin el permiso el registro se queda", archivo: SW, de: "      } else if (!concedido && registrados.length > 0) {", a: "      } else if (false) {", esperadas: 1 },
  { etiqueta: "conceder no lleva el script a las pestañas abiertas", archivo: SW, de: "      sincronizarSitiosOpcionales().then(() => inyectarEnPestanasAbiertas())", a: "      sincronizarSitiosOpcionales()", esperadas: 1 },
  { etiqueta: "los sitios concedidos no cuentan al buscar pestañas", archivo: SW, de: "  return PATRONES_DE_SITIO.concat((await sitiosOpcionalesConcedidos()).map((s) => s.patron));", a: "  return PATRONES_DE_SITIO;", esperadas: 1 },
  { etiqueta: "el boton de Preferencias hace lo contrario", archivo: "src/options/options.js", de: "      if (activo) {\n        await chrome.permissions.remove", a: "      if (!activo) {\n        await chrome.permissions.remove", esperadas: 3 },
  // Reapuntada en la tanda AW: desde que Deezer va detras, SoundCloud ya no
  // es el ultimo de la lista.
  { etiqueta: "la ventana no tiene sus recursos en SoundCloud", archivo: "manifest.json", de: '        "https://soundcloud.com/*",\n        "https://www.deezer.com/*"\n      ],\n      "use_dynamic_url"', a: '        "https://www.deezer.com/*"\n      ],\n      "use_dynamic_url"', esperadas: 1 }
];

require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
