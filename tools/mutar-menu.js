/*
 * Verificacion por MUTACION del menu (el popup de la barra).
 *
 * ---------- POR QUE ESTE ARCHIVO NO EXISTIA ----------
 *
 * Porque tampoco existian las pruebas. El menu ha sido durante todo el
 * proyecto la unica parte que el usuario toca TODOS los dias y la unica sin
 * una sola comprobacion, y eso no es casualidad: es pequeño, se ve entero de
 * un vistazo y da la sensacion de no tener nada que probar.
 *
 * Los dos fallos que salieron al rediseñarlo dicen lo contrario, y los dos
 * llevaban ahi desde el principio:
 *
 *   - `els.artwork.src = state.artworkUrl || ""`. La cadena vacia no
 *     significa "sin imagen": un src vacio se resuelve contra la URL de la
 *     pagina, asi que el navegador se pedia popup.html a si mismo como si
 *     fuera un PNG y pintaba el icono de imagen rota. Sin un error en
 *     consola.
 *   - `disabled` puesto en un solo boton de cuatro, y sin NINGUNA regla en la
 *     hoja para `:disabled`. O sea que tres botones muertos tenian la misma
 *     pinta que tres botones vivos.
 *
 * Ninguno de los dos lanza una excepcion, ninguno de los dos se ve en una
 * captura de pantalla, y los dos son exactamente el tipo de cosa que una
 * mutacion caza y una lectura no.
 *
 * ---------- LA MITAD QUE SE MUTA EN LA HOJA ----------
 *
 * Varias mutaciones de aqui son de popup.css, y las pruebas que las matan
 * leen la hoja como TEXTO —jsdom no resuelve la cascada—. Eso se dice en las
 * pruebas y se repite aqui: lo que demuestran es que la decision este tomada
 * y escrita, no que el navegador la aplique. Es menos de lo que parece, pero
 * no es nada: el estado apagado no existia, y una prueba de texto habria
 * bastado para verlo.
 *
 * Mismo arnes que los demas: de usar y tirar, fuera de `npm test`, y
 * restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = ["tests/unit/popup.test.js"];

const MUTACIONES = [
  /* ---- La portada: el fallo del src vacio ---- */
  {
    etiqueta: "vuelve el src vacio (el navegador se pide popup.html como si fuera un PNG)",
    archivo: "src/popup/popup.js",
    de: '    els.artwork.src = state.artworkUrl || urlDeReserva();',
    a: '    els.artwork.src = state.artworkUrl || "";'
  },
  {
    /*
     * La reserva del primer fotograma es una linea aparte de la de `render`, y
     * por eso lleva mutacion aparte: sin ella el <img> nace sin `src` y se ve
     * el icono de imagen rota hasta que contesta la pestaña. Es corto, pero es
     * lo primero que se ve CADA VEZ que se abre el menu.
     */
    etiqueta: "el <img> nace sin src y enseña el icono de imagen rota hasta que contesta la pestaña",
    archivo: "src/popup/popup.js",
    de: "\n  els.artwork.src = urlDeReserva();",
    a: "\n  ;"
  },

  /* ---- El fondo difuminado ---- */
  {
    etiqueta: "el fondo se queda con la portada de la cancion anterior",
    archivo: "src/popup/popup.js",
    de: '      els.backdrop.style.backgroundImage = state.artworkUrl ? `url("${state.artworkUrl}")` : "";',
    a: '      if (state.artworkUrl) els.backdrop.style.backgroundImage = `url("${state.artworkUrl}")`;'
  },
  {
    etiqueta: "se difumina el dibujo de reserva (un blur a pantalla completa para enseñar gris)",
    archivo: "src/popup/popup.js",
    de: '      els.backdrop.style.backgroundImage = state.artworkUrl ? `url("${state.artworkUrl}")` : "";',
    a: '      els.backdrop.style.backgroundImage = `url("${state.artworkUrl || urlDeReserva()}")`;'
  },
  {
    /*
     * La imagen y la clase son dos lineas y cada una se puede olvidar sola.
     * Con la clase puesta y la imagen vacia queda un rectangulo oscuro a
     * medias en vez del color plano, que es peor que las dos cosas mal.
     */
    etiqueta: "la clase del fondo no se quita nunca (rectangulo oscuro sin portada)",
    archivo: "src/popup/popup.js",
    de: '      els.backdrop.classList.toggle("ytmpip-has-art", Boolean(state.artworkUrl));',
    a: '      if (state.artworkUrl) els.backdrop.classList.add("ytmpip-has-art");'
  },
  {
    etiqueta: "CSS: el fondo con portada se queda sin opacidad (no se ve nunca)",
    archivo: "src/popup/popup.css",
    de: ".ytmpip-popup-backdrop.ytmpip-has-art {\n  opacity: 0.5;\n}",
    a: ".ytmpip-popup-backdrop.ytmpip-conectado {\n  opacity: 0.5;\n}"
  },

  /* ---- Sin pestaña no hay mandos ---- */
  {
    etiqueta: "vuelve a apagarse un solo boton de cuatro",
    archivo: "src/popup/popup.js",
    de:
      "    els.openPip.disabled = sinPestana;\n" +
      "    els.playPause.disabled = sinPestana;\n" +
      "    els.next.disabled = sinPestana;\n" +
      "    els.previous.disabled = sinPestana;",
    a: "    els.openPip.disabled = sinPestana;"
  },
  {
    /*
     * El camino de vuelta es una linea distinta de la de ida, aunque aqui
     * sean la misma escrita una vez. Apagarlos y no volver a encenderlos deja
     * un menu muerto hasta que se cierra y se abre, y como el menu se cierra
     * solo al perder el foco, es un fallo que casi nadie llega a ver.
     */
    etiqueta: "los botones se apagan pero no se vuelven a encender al aparecer la pestaña",
    archivo: "src/popup/popup.js",
    de:
      "    els.openPip.disabled = sinPestana;\n" +
      "    els.playPause.disabled = sinPestana;\n" +
      "    els.next.disabled = sinPestana;\n" +
      "    els.previous.disabled = sinPestana;",
    a:
      "    if (sinPestana) {\n" +
      "      els.openPip.disabled = true;\n" +
      "      els.playPause.disabled = true;\n" +
      "      els.next.disabled = true;\n" +
      "      els.previous.disabled = true;\n" +
      "    }"
  },
  {
    etiqueta: "CSS: el boton apagado vuelve a tener la misma pinta que el encendido",
    archivo: "src/popup/popup.css",
    de: "button:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}",
    a: "button:disabled {\n  cursor: pointer;\n}"
  },
  {
    /*
     * Detalle pequeño con consecuencia grande: un `button:hover` sin
     * `:not(:disabled)` ilumina el boton muerto al pasar por encima, que es
     * la señal contraria a la que se acaba de dar apagandolo.
     */
    etiqueta: "CSS: el hover se enciende tambien en los botones apagados",
    archivo: "src/popup/popup.css",
    de: "button:hover:not(:disabled) {",
    a: "button:hover {"
  },

  /* ---- El punto de estado ---- */
  {
    etiqueta: "el punto se enciende y ya no se apaga (dice conectado sin pestaña)",
    archivo: "src/popup/popup.js",
    de: '    if (els.dot) els.dot.classList.toggle("ytmpip-conectado", Boolean(state.connected));',
    a: '    if (els.dot) els.dot.classList.add("ytmpip-conectado");'
  },
  {
    etiqueta: "CSS: el punto de conectado se pinta con el color de lo pulsable",
    archivo: "src/popup/popup.css",
    de: ".ytmpip-popup-dot.ytmpip-conectado {\n  background: #4ac47a;\n}",
    a: ".ytmpip-popup-dot.ytmpip-conectado {\n  background: var(--accent);\n}"
  },
  {
    /*
     * El punto duplica lo que ya dice la frase de al lado. Quitarle el
     * `aria-hidden` hace que un lector de pantalla anuncie ademas un elemento
     * vacio sin contenido: ruido, no informacion.
     */
    etiqueta: "HTML: el punto deja de esconderse del lector de pantalla y duplica la frase",
    archivo: "src/popup/popup.html",
    de: '<span id="ytmpip-popup-dot" class="ytmpip-popup-dot" aria-hidden="true"></span>',
    a: '<span id="ytmpip-popup-dot" class="ytmpip-popup-dot"></span>'
  },

  /* ---- Lo de siempre, que el rediseño podia haberse llevado por delante ---- */
  /*
   * AQUI SE QUEDO FUERA UNA MUTACION, y se dice para que no la escriba otra
   * vez el de dentro de seis meses: "un boton apagado sigue mandando su
   * comando", volviendo a encenderlo dentro de `sendCommand`. Es inutil,
   * porque `sendCommand` no llega a correr —el clic no se despacha sobre un
   * boton apagado, ni en jsdom ni en el navegador—, asi que la mutacion
   * sobreviviria sin que eso significara nada.
   *
   * La prueba que lo comprueba ya la protegen las dos mutaciones de arriba:
   * si `disabled` deja de ponerse, el clic pasa y el comando sale.
   */
  {
    etiqueta: "el titulo de la cancion deja de llegar a su sitio",
    archivo: "src/popup/popup.js",
    de: '    els.title.textContent = state.title || "Sin reproducción";',
    a: '    els.title.textContent = "Sin reproducción";'
  },
  {
    etiqueta: "el boton grande deja de cambiar de dibujo entre reproducir y pausar",
    archivo: "src/popup/popup.js",
    de: '    self.YTMPip.Iconos.poner(els.playPause, lastPlaying ? "pausar" : "reproducir");',
    a: '    self.YTMPip.Iconos.poner(els.playPause, "reproducir");'
  }
];

function pruebasQueFallan() {
  let salida;
  try {
    execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...PRUEBAS], {
      cwd: RAIZ,
      stdio: "pipe",
      encoding: "utf8"
    });
    return [];
  } catch (err) {
    salida = String(err.stdout || "");
  }
  const nombres = [];
  for (const linea of salida.split(/\r?\n/)) {
    const m = /^\s*not ok \d+ - (.+?)\s*$/.exec(linea);
    if (m && !m[1].endsWith(".test.js")) nombres.push(m[1]);
  }
  return nombres;
}

let sobreviven = 0;
let muertas = 0;
let deliberadas = 0;

if (pruebasQueFallan().length) {
  console.error("La suite no esta en verde SIN mutar. Arregla eso antes de mutar nada.");
  process.exit(1);
}

for (const m of MUTACIONES) {
  const ruta = path.join(RAIZ, m.archivo);
  const original = fs.readFileSync(ruta, "utf8");
  if (!original.includes(m.de)) {
    console.error(`  ??  ${m.etiqueta}\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);
    sobreviven++;
    continue;
  }
  fs.writeFileSync(ruta, original.replace(m.de, m.a));
  let caidas;
  try {
    caidas = pruebasQueFallan();
  } finally {
    fs.writeFileSync(ruta, original);
  }
  if (!caidas.length) {
    if (m.deliberada) {
      deliberadas++;
      console.log(`  (vive) ${m.etiqueta}\n         superviviente documentada: no puede cambiar el comportamiento`);
    } else {
      sobreviven++;
      console.error(`  VIVE  ${m.etiqueta}`);
    }
  } else {
    muertas++;
    if (m.deliberada) {
      console.error(`  ??  ${m.etiqueta}\n      (se declaro inmatable y una prueba la mato: revisa el comentario)`);
    }
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.join(" | ")}`);
  }
}

const enJuego = MUTACIONES.length - deliberadas;
console.log(
  `\n${muertas} de ${enJuego} mutaciones detectadas; ${sobreviven} sobreviven.` +
    (deliberadas ? ` (${deliberadas} mas viven a proposito y estan documentadas.)` : "")
);
process.exit(sobreviven ? 1 : 0);
