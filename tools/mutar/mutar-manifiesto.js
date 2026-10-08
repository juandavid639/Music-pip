/*
 * Verificacion por MUTACION del manifiesto frente a la tienda.
 *
 * ---------- QUE HACE ESTE ARNES DISTINTO DE LOS DEMAS ----------
 *
 * Los otros mutadores estropean COMPORTAMIENTO: un boton que no manda su
 * comando, una barra que no baja, un color que no cambia. Este estropea
 * PAPELEO, y el papeleo tiene una propiedad desagradable: cuando esta mal,
 * la extension funciona perfectamente. Se instala, suena, se ve bien. Lo
 * unico que pasa es que no se puede publicar, y eso se descubre a los dias,
 * en una pantalla de Google, sin decir cual de las quince cosas es.
 *
 * Los dos defectos reales que habia el dia que se escribio esto son justo
 * de esa clase:
 *
 *   - la descripcion tenia 137 caracteres y la ficha admite 132. Cinco de
 *     mas. La extension andaba,
 *   - se pedia `activeTab` y no se usa en ninguna linea de codigo. La
 *     extension andaba.
 *
 * Ninguno de los dos se ve mirando. Ninguno de los dos rompe nada. Los dos
 * paran una publicacion.
 *
 * ---------- LO QUE ESTAS MUTACIONES NO DEMUESTRAN ----------
 *
 * Que el paquete se acepte. La mitad de las reglas de la tienda las aplica
 * una persona leyendo, y contra eso no hay arnes. Lo que se comprueba aqui
 * es lo unico comprobable sin cuenta y sin red: que las reglas que SI se
 * pueden contar esten contadas, y que la prueba que dice contarlas se
 * entere cuando dejan de cumplirse.
 *
 * Mismo arnes que los demas: de usar y tirar, fuera de `npm test`, y
 * restaura los archivos pase lo que pase.
 */
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const PRUEBAS = ["tests/unit/manifiesto-tienda.test.js"];

/*
 * LO QUE CAMBIA CON CADA VERSION SE LEE, NO SE COPIA (tanda AG). Aqui
 * estaban escritos a mano la descripcion, la version y los sitios, y con
 * las versiones se quedaron viejos: cinco de las diez mutaciones buscaban
 * un texto que ya no existia y no probaban nada (el arnes lo decia con
 * «??» y nadie lo miraba). Ahora se leen de los archivos al arrancar.
 */
const CATALOGO = "_locales/es/messages.json";
const TEXTO_DESCRIPCION = JSON.parse(fs.readFileSync(path.join(RAIZ, CATALOGO), "utf8")).extension_descripcion.message;
const DESCRIPCION = '    "message": ' + JSON.stringify(TEXTO_DESCRIPCION);
const VERSION = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8")).version;
const SITIOS = '      "matches": ["https://music.youtube.com/*", "https://www.youtube.com/*", "https://open.spotify.com/*"],';

/* Los dos permisos, juntos, tal cual estan en el manifiesto. */
const PERMISOS = '    "storage",\n    "scripting"';

const MUTACIONES = [
  /* ---- El limite de la ficha ---- */
  {
    /*
     * Esta es la descripcion vieja, la de verdad, la que tenia el proyecto
     * el dia antes de intentar publicarlo: 137 caracteres. Se deja literal
     * en vez de inventar un relleno porque la mutacion asi no es hipotetica,
     * es el estado del que se venia.
     */
    etiqueta: "vuelve la descripcion de 137 caracteres (la ficha admite 132)",
    archivo: CATALOGO,
    de: DESCRIPCION,
    a:
      '    "message": "Ventana flotante (Picture-in-Picture) independiente para YouTube Music, ' +
      'YouTube y Spotify. No oficial, no afiliada a Google ni a Spotify."'
  },
  {
    /*
     * Al recortar para que quepa, lo primero que sobra siempre es el
     * descargo: no describe ninguna funcion, y son veintitantos caracteres
     * que vienen muy bien. Es exactamente por eso que hay que sujetarlo.
     */
    etiqueta: "el recorte se lleva por delante el «no oficial»",
    archivo: CATALOGO,
    de: DESCRIPCION,
    a: '    "message": "Ventana flotante para YouTube Music, YouTube y Spotify: portada, letra, ecualizador y atajos."'
  },

  /* ---- Permisos ---- */
  {
    etiqueta: "vuelve `activeTab`, que no se usa en ninguna linea",
    archivo: "manifest.json",
    de: PERMISOS,
    a: '    "storage",\n    "activeTab",\n    "scripting"'
  },
  {
    /*
     * El otro sentido del mismo error. Si un permiso se quita del manifiesto
     * y su justificacion se queda en la tabla, la tabla empieza a describir
     * una extension que ya no existe, y la siguiente persona que la lea
     * creera que ahi esta escrito lo que se pide.
     */
    etiqueta: "se quita `storage` del manifiesto y su justificacion se queda escrita",
    archivo: "manifest.json",
    de: PERMISOS,
    a: '    "scripting"'
  },
  {
    etiqueta: "el content script entra en todo YouTube, no solo en los sitios declarados",
    archivo: "manifest.json",
    // Con la linea de "js" detras (tanda AU): desde use_dynamic_url la de
    // web_accessible_resources tambien acaba en coma y SITIOS sola aparecia
    // dos veces. La que se vigila es la de los content scripts.
    de: SITIOS + '\n      "js": [',
    a: '      "matches": ["https://*.youtube.com/*", "https://open.spotify.com/*"],\n      "js": ['
  },

  /* ---- El nombre, repartido en seis sitios ---- */
  {
    etiqueta: "la tienda anuncia un nombre y el producto enseña otro por dentro",
    archivo: "manifest.json",
    de: '  "name": "Music PiP",',
    a: '  "name": "Music PiP Pro",'
  },

  /* ---- Archivos que se nombran y no viajan ---- */
  {
    etiqueta: "el manifiesto nombra un icono que no existe",
    archivo: "manifest.json",
    de: '      "48": "assets/icons/icon48.png",',
    a: '      "48": "assets/icons/icon-48.png",'
  },
  {
    /*
     * ESTA ES LA CARA. No se toca el manifiesto: se toca la lista blanca del
     * empaquetador, que es donde nadie mira. El ZIP sale, pesa lo de
     * siempre, se sube bien, y la extension esta rota al instalarla porque
     * dentro no van los iconos. El manifiesto sigue siendo correcto; lo
     * incorrecto es el sobre.
     */
    etiqueta: "el empaquetador deja de meter assets/ y el ZIP viaja sin iconos",
    archivo: "tools/empaquetar.ps1",
    de: '  "src",\n  "assets"',
    a: '  "src"'
  },

  /* ---- La version, contada dos veces ---- */
  {
    etiqueta: "package.json y el manifiesto se van a versiones distintas",
    archivo: "package.json",
    de: '  "version": "' + VERSION + '",',
    a: '  "version": "' + VERSION + '9",'
  },
  {
    etiqueta: "la version deja de ser la que Chrome sabe leer",
    archivo: "manifest.json",
    de: '  "version": "' + VERSION + '",',
    a: '  "version": "' + VERSION + '-beta",'
  }
];

// El bucle, los reintentos y la restauracion viven en tools/mutar/mutar-comun.js
// desde la tanda AG (antes cada script llevaba su copia).
require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
