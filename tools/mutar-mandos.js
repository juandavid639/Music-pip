/*
 * Verificacion por MUTACION del cable y de los mandos del ecualizador.
 *
 * mutar-ecualizador.js cubre el nucleo (la aritmetica) y mutar-grafo.js el
 * grafo (los nodos de audio). Los dos estaban en verde mientras el
 * ecualizador entero era CODIGO MUERTO: nadie llamaba nunca a
 * GrafoAudio.montar y no habia ni un mando para encenderlo. Ese es
 * exactamente el hueco que cubre este archivo, y por eso existe separado:
 * son las dos costuras que unen lo probado con lo que el usuario toca.
 *
 *   - EL CABLE (src/content/content-script.js): quien llama a montar, con
 *     que <video> y con que preferencias.
 *   - LOS MANDOS (src/options/options.js y options.html): que se enseña de
 *     lo guardado y que se guarda de lo elegido.
 *
 * LAS DOS PRIMERAS MUTACIONES DEL CABLE SON LAS QUE IMPORTAN, por lo mismo
 * que en mutar-grafo.js: cruzar la puerta de createMediaElementSource no se
 * deshace, asi que meter en el grafo el audio de quien tiene el ecualizador
 * APAGADO le deja la pestaña tocada hasta que recargue. Es el unico fallo de
 * este proyecto que el usuario no puede arreglar cerrando la ventana.
 *
 * LO QUE ESTE ARCHIVO NO CUBRE, dicho a las claras: la MAQUETACION de los
 * mandos. Las reglas .ytmpip-banda viven en el <style> de options.html y
 * jsdom no calcula estilos, asi que mutar un `display: flex` no tumbaria
 * ninguna prueba. Que los cinco deslizadores se lean en fila esta
 * comprobado a ojo y solo a ojo.
 *
 * Mismo arnes que los otros: de usar y tirar, fuera de `npm test`, y
 * restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/integration/ecualizador-cable.test.js",
  "tests/unit/opciones-ecualizador.test.js",
  /*
   * El boton del PiP entro en esta lista el dia que el NOMBRE de los presets
   * se mudo de options.html a las constantes. Hasta entonces las dos
   * paginas no compartian mas que el valor guardado; ahora comparten tambien
   * el texto que lee una persona, y eso es una costura mas —justo de las que
   * este archivo existe para vigilar—.
   */
  "tests/unit/interruptor-ecualizador.test.js"
];
const CABLE = "src/content/content-script.js";
const MANDOS = "src/options/options.js";
const PAGINA = "src/options/options.html";
const AJUSTES = "src/shared/settings.js";

const MUTACIONES = [
  /* ---------- EL CABLE: las que dejan a alguien sin poder deshacerlo ---------- */
  {
    etiqueta: "CABLE/PUERTA: se monta el grafo sin mirar las preferencias (apagado tambien cruza)",
    archivo: CABLE,
    de: "YTMPip.Ecualizador.plan(YTMPip.Settings.get().equalizer)",
    a: 'YTMPip.Ecualizador.plan("plano")'
  },
  /*
   * Aqui hubo una mutacion mas: quitar el `if (!media) return false` de
   * `sincronizarEcualizador`. SOBREVIVIO, y tenia razon en sobrevivir:
   * `montar` empieza por `if (!video) return false`, o sea que la guarda
   * del cable no protegia de nada que no estuviera ya protegido. Era una
   * regla escrita en dos archivos. La respuesta correcta no era inventar
   * una prueba que la cubriera —habria sido fijar la duplicacion— sino
   * borrar la linea, que es lo que se hizo. Queda escrito para que a nadie
   * le parezca prudente volver a ponerla.
   */

  /* ---------- EL CABLE: las que lo dejan sonando plano en silencio ---------- */
  {
    etiqueta: "CABLE: el ecualizador no se muda al <video> de la cancion siguiente",
    archivo: CABLE,
    de: "    sincronizarEcualizador();\n\n    /*\n     * Aqui NO se llama a scheduleUpdate()",
    a: "    ;\n\n    /*\n     * Aqui NO se llama a scheduleUpdate()"
  },
  {
    etiqueta: "CABLE: cambiar el ajuste en opciones no se oye hasta la cancion siguiente",
    archivo: CABLE,
    de: "    YTMPip.Settings.subscribe(sincronizarEcualizador);",
    a: "    ;"
  },
  {
    etiqueta: "CABLE: darle a reproducir no despierta el contexto suspendido (silencio)",
    archivo: CABLE,
    de: 'if (evt && evt.type === "play" && YTMPip.GrafoAudio) YTMPip.GrafoAudio.reanudar();',
    a: ";"
  },
  {
    etiqueta: "CABLE: se zarandea el contexto en cada evento (timeupdate va a 4/s)",
    archivo: CABLE,
    de: 'if (evt && evt.type === "play" && YTMPip.GrafoAudio) YTMPip.GrafoAudio.reanudar();',
    a: "if (YTMPip.GrafoAudio) YTMPip.GrafoAudio.reanudar();"
  },

  /* ---------- LOS MANDOS: el que no se deja mover ---------- */
  {
    etiqueta: "MANDOS: mover un deslizador no abandona el preset (el mando vuelve solo a su sitio)",
    archivo: MANDOS,
    de: "      fields.equalizerPreset.value = MANUAL;",
    a: "      ;"
  },
  {
    etiqueta: "MANDOS: el numero no sigue al mando mientras se arrastra",
    archivo: MANDOS,
    de: "      // mando. NO se guarda aqui: arrastrar un deslizador de -12 a +12\n      // serian veinticuatro escrituras en storage, y cada una despierta al\n      // ecualizador de la pestaña.\n      pintarEcualizador();",
    a: "      ;"
  },
  {
    etiqueta: "MANDOS: soltar el deslizador no guarda nada",
    archivo: MANDOS,
    de: '    banda.input.addEventListener("change", save);',
    a: "    ;"
  },

  /* ---------- LOS MANDOS: lo que se guarda no es lo que se eligio ---------- */
  {
    etiqueta: "MANDOS: un preset se guarda por sus cinco numeros y deja de seguir al preset",
    archivo: MANDOS,
    de: "    if (elegido === MANUAL) return gananciasElegidas().join(\",\");\n    return elegido;",
    a: "    if (elegido === MANUAL) return gananciasElegidas().join(\",\");\n    return Ecualizador.ganancias(elegido).join(\",\");"
  },
  {
    etiqueta: "MANDOS: «A mi gusto» se guarda tal cual y normalizar lo tira al valor de fabrica",
    archivo: MANDOS,
    de: '    if (elegido === MANUAL) return gananciasElegidas().join(",");',
    a: "    if (elegido === MANUAL) return elegido;"
  },
  {
    etiqueta: "MANDOS: se guarda en crudo, sin acotar (lo guardado y lo que suena difieren)",
    archivo: AJUSTES,
    de: "    const limpio = YTMPip.Ecualizador.normalizar(valor);\n    const previo = anteriores || {};",
    a: "    const limpio = valor;\n    const previo = anteriores || {};"
    /*
     * ESTUVO MARCADA `equivalente: true`, Y HA DEJADO DE SERLO. Merece
     * quedar escrito, porque el motivo por el que dejo de serlo es el unico
     * que puede tener una mutacion equivalente: alguien amplio el programa.
     *
     * El razonamiento de entonces era este, y era cierto entonces: los dos
     * unicos caminos que llegaban a `save` traian el valor ya canonico —por
     * el desplegable se lee "off" o un nombre de preset; por un deslizador,
     * el `input` que precede al `change` ya paso por `pintarEcualizador`,
     * que escribe de vuelta lo que devuelve `ganancias()`, o sea redondeado
     * y acotado—. Sin estado alcanzable en el que las dos versiones
     * difirieran, ninguna prueba podia separarlas.
     *
     * Lo que abrio el tercer camino fue el INTERRUPTOR DEL PIP. Ese boton se
     * puede pulsar con lo que sea que hubiera en storage, incluida basura de
     * una version vieja o editada a mano, y entonces `valor` llega SIN
     * normalizar. La prueba que lo mata —«un ecualizador ilegible se apaga,
     * PERO NO SE LLEVA POR DELANTE la anotacion»— es exactamente ese caso.
     *
     * O sea que la linea nunca fue decorativa: era una garantia sin camino
     * que la ejercitara, y en cuanto aparecio el camino se convirtio en la
     * unica cosa que impide guardar algo distinto de lo que va a sonar.
     * Una mutacion equivalente es un aviso de "aqui no hay uso todavia", no
     * de "aqui sobra codigo".
     */
  },
  {
    etiqueta: "MANDOS: apagarlo no se guarda como apagado",
    archivo: MANDOS,
    de: "    if (elegido === Ecualizador.APAGADO) return Ecualizador.APAGADO;",
    a: "    if (elegido === Ecualizador.APAGADO) return \"plano\";"
  },

  /* ---------- LOS MANDOS: lo guardado no llega a la pantalla ---------- */
  {
    etiqueta: "MANDOS/PUERTA: los deslizadores se ven con el ecualizador apagado",
    archivo: MANDOS,
    de: "    equalizerBox.hidden = valor === Ecualizador.APAGADO;",
    a: "    equalizerBox.hidden = false;"
  },
  {
    etiqueta: "MANDOS: unos numeros a mano se enseñan como si fueran «plano»",
    archivo: MANDOS,
    de: "          : Ecualizador.presetDe(ecualizador) || MANUAL;",
    a: '          : Ecualizador.presetDe(ecualizador) || "plano";'
  },
  {
    etiqueta: "MANDOS: lo guardado se lee sin normalizar (un guardado corrupto se enseña entero)",
    archivo: MANDOS,
    de: "    const ecualizador = Ecualizador.normalizar(stored[STORAGE_KEYS.EQUALIZER]);",
    a: "    const ecualizador = stored[STORAGE_KEYS.EQUALIZER];"
  },
  {
    etiqueta: "MANDOS: elegir un preset no mueve los deslizadores",
    archivo: MANDOS,
    de: "        // forma de ver que hace \"Voz\" antes de ponerse a escuchar.\n        pintarEcualizador();",
    a: "        ;"
  },
  {
    etiqueta: "MANDOS: al abrir la pagina no se pinta nada",
    archivo: MANDOS,
    de: "      pintarMuestraAcento();\n      pintarEcualizador();",
    a: "      pintarMuestraAcento();"
  },

  /* ---------- LOS MANDOS: el rango y las etiquetas, copiados o perdidos ---------- */
  {
    etiqueta: "MANDOS: los deslizadores nacen sin rango (el navegador pone 0-100)",
    archivo: MANDOS,
    de: "    banda.input.min = String(EQUALIZER_LIMITS.GAIN_MIN);",
    a: "    ;"
  },
  {
    etiqueta: "MANDOS: el paso no sale de las constantes",
    archivo: MANDOS,
    de: "    banda.input.step = String(EQUALIZER_LIMITS.GAIN_STEP);",
    a: "    ;"
  },
  {
    etiqueta: "MANDOS: las etiquetas se quedan en blanco",
    archivo: MANDOS,
    de: "    if (banda.label) banda.label.textContent = texto;",
    a: "    ;"
  },
  {
    etiqueta: "MANDOS: la etiqueta enseña el id interno en vez del nombre",
    archivo: MANDOS,
    de: "    const texto = definicion.etiqueta + \" · \" + hz;",
    a: "    const texto = definicion.id + \" · \" + hz;"
  },
  {
    etiqueta: "MANDOS: los kilohercios no se abrevian («Aire · 12000 Hz»)",
    archivo: MANDOS,
    de: "    const hz = definicion.hz >= 1000 ?",
    a: "    const hz = definicion.hz >= 100000 ?"
  },

  /* ----------------------------------------------------------------
   * LOS MANDOS: el aviso de la entrada
   *
   * Este aviso ya mintio una vez, y de la peor manera: en vez de delatar el
   * fallo lo JUSTIFICABA. Decia «es normal que el volumen general quede mas
   * bajo» mientras el ecualizador era incapaz de subir nada. El usuario lo
   * leyo, se lo creyo, y aun asi le sono raro.
   *
   * Por eso las tres ramas se mutan por separado: un aviso que dice algo
   * distinto de lo que hace el audio es peor que no tener aviso.
   * ---------------------------------------------------------------- */
  {
    etiqueta: "MANDOS: se anuncia una bajada de entrada que no existe",
    archivo: MANDOS,
    de: "    if (preamp !== 0) {",
    a: "    if (true) {"
  },
  {
    etiqueta: "MANDOS: nunca se anuncia la bajada, ni cuando la hay",
    archivo: MANDOS,
    de: "    if (preamp !== 0) {",
    a: "    if (false) {"
  },
  {
    etiqueta: "MANDOS: con bandas subidas se dice que no hay ninguna subida",
    archivo: MANDOS,
    de: "    const haySubida = Ecualizador.subidaDelPico(Ecualizador.ganancias(valor)) > 0;",
    a: "    const haySubida = false;"
  },
  {
    etiqueta: "MANDOS: sin nada subido tambien se habla del limitador",
    archivo: MANDOS,
    de: "    const haySubida = Ecualizador.subidaDelPico(Ecualizador.ganancias(valor)) > 0;",
    a: "    const haySubida = true;"
  },
  {
    etiqueta: "MANDOS: el aviso enseña el numero con signo («baja -11 dB»)",
    archivo: MANDOS,
    de: "        Math.abs(preamp) +",
    a: "        preamp +"
  },

  /* ---------- LA PAGINA: lo escrito a mano que se queda atras ---------- */
  {
    etiqueta: "PAGINA: falta el deslizador de una banda (la banda no se puede tocar nunca)",
    archivo: PAGINA,
    de: '<input id="equalizerBand4" type="range" />',
    a: '<input id="equalizerBandX" type="range" />'
  },
  {
    /*
     * OJO CON LOS ESPACIOS DE DELANTE: este `de` es la unica mutacion del
     * arnes que depende de la SANGRIA del HTML, porque se lleva la linea
     * entera con su salto para no dejar un hueco en blanco.
     *
     * Se ha reescrito ya una vez. El dia que la pagina de opciones se
     * repartio en tarjetas, el <select> bajo dos niveles y sus <option>
     * pasaron de seis espacios a doce; el texto viejo dejo de existir y esta
     * mutacion habria sobrevivido sin significar nada. Es exactamente lo que
     * le paso a mutar-interruptor.js con un renombrado, alli sin que nadie lo
     * viera venir. Aqui se vio venir porque se fue a buscar antes de tocar el
     * archivo, y se deja escrito para que la proxima tambien se busque: si
     * alguien vuelve a mover esta parte del HTML, hay que volver a contar los
     * espacios.
     */
    etiqueta: "PAGINA: falta un preset en el desplegable (no se puede elegir nunca)",
    archivo: PAGINA,
    de: '            <option value="nocturno"></option>\n',
    a: ""
  },
  /* ----------------------------------------------------------------
   * EL NOMBRE DE LOS PRESETS, que ya no vive en el HTML.
   *
   * Estaba escrito dentro del <select>, y esa era la razon por la que el
   * boton del PiP no podia decir CUAL estaba puesto. Al mudarlo a
   * EQUALIZER_PRESET_LABELS aparecio una forma de fallar que antes no
   * existia: una opcion en BLANCO. Es elegible, es guardable, suena, y el
   * desplegable se abre con un hueco. Sin estas dos mutaciones, quitar la
   * linea que escribe el texto no tumbaria nada.
   * ---------------------------------------------------------------- */
  {
    etiqueta: "MANDOS: los presets se quedan sin nombre y el desplegable sale en blanco",
    archivo: MANDOS,
    de: "      opcion.textContent = etiqueta || opcion.value;",
    a: "      ;"
  },
  {
    etiqueta: "MANDOS: un preset sin etiqueta deja su opcion muda en vez de enseñar la clave",
    archivo: MANDOS,
    de: "      opcion.textContent = etiqueta || opcion.value;",
    a: "      opcion.textContent = etiqueta || \"\";"
  },
  /* ----------------------------------------------------------------
   * LA OTRA PUNTA DEL MISMO CABLE: el boton del PiP.
   *
   * Mudar el nombre a las constantes solo sirve de algo si alguien lo lee al
   * otro lado. Estas dos mutaciones son las que hacen que ese "sirve de
   * algo" este comprobado; por ellas entra tests/unit/interruptor-
   * ecualizador.test.js en la lista de arriba.
   *
   * NO SE MUTA renombrar un preset en las constantes, y es a proposito:
   * renombrarlo es exactamente lo que se ha hecho posible. Una mutacion que
   * finge que eso es un fallo estaria fijando el nombre en su sitio otra
   * vez, que es lo contrario de lo que se venia a arreglar.
   * ---------------------------------------------------------------- */
  {
    etiqueta: "PIP: el boton vuelve a decir solo «encendido» y no cual esta puesto",
    archivo: "src/pip/pip.js",
    de: '        : "ajuste propio";',
    a: '        : "ajuste propio";\n      que = "encendido";'
  },
  {
    etiqueta: "PIP: unos numeros a mano se anuncian como si fueran un preset",
    archivo: "src/pip/pip.js",
    de: "      const preset = Eq.presetDe(valor);",
    a: '      const preset = Eq.presetDe(valor) || "plano";'
  },
  /* ---------- LAS BARRITAS: el dibujo miente sobre lo que suena ----------
   *
   * Todo lo de aqui abajo falla EN SILENCIO por definicion: es un dibujo.
   * No hay excepcion que lanzar ni consola que se queje; solo un indicador
   * que enseña una forma distinta de la que se esta oyendo, que es peor que
   * no enseñar ninguna. La hoja de estilo entra en la lista por lo mismo:
   * dos de las reglas no son decoracion, son la diferencia entre esconderse
   * y no esconderse.
   */
  {
    etiqueta: "BARRAS: se quedan puestas con el ecualizador apagado",
    archivo: "src/pip/pip.js",
    de: "    caja.hidden = !encendido;",
    a: "    caja.hidden = false;"
  },
  {
    etiqueta: "BARRAS: las bajadas se dibujan hacia arriba (un -6 se ve como un +6)",
    archivo: "src/pip/pip.js",
    de: '      barra.style.top = (db >= 0 ? 50 - alto : 50) + "%";',
    a: '      barra.style.top = 50 - alto + "%";'
  },
  {
    etiqueta: "BARRAS: todas iguales, el dibujo deja de depender de los decibelios",
    archivo: "src/pip/pip.js",
    de: "      const alto = tope ? Math.min(Math.abs(db) / tope, 1) * 50 : 0;",
    a: "      const alto = 25;"
  },
  {
    etiqueta: "BARRAS: el dibujo se monta una vez y no vuelve a contar las bandas",
    archivo: "src/pip/pip.js",
    de: "    if (caja.childElementCount !== EQUALIZER_BANDS.length) {",
    a: "    if (caja.childElementCount === 0) {"
  },
  {
    etiqueta: "BARRAS/CSS: se le quita el min-height y la banda plana desaparece",
    archivo: "src/pip/pip.css",
    de: "  min-height: 2px;\n  background: currentColor;\n  border-radius: 1px;",
    a: "  background: currentColor;\n  border-radius: 1px;"
  },
  {
    /*
     * UNA MUTACION QUE MORIA SIN PROTEGER NADA.
     *
     * Ponia `.ytmpip-eq-bandas[hidden]` -> `[oculto]`, y moria en cada
     * pasada. Parecia una mutacion sana. No lo era: la regla que rompia no
     * hacia nada, porque pip.css trae `[hidden] { display: none !important }`
     * para todo el archivo desde mucho antes. Rompiendola no se rompia el
     * comportamiento; moria porque la prueba leia el TEXTO de la hoja
     * buscando esa regla concreta.
     *
     * La leccion: una mutacion que muere contra una prueba que lee TEXTO
     * solo demuestra que el texto sigue ahi. Si ademas el texto no hace
     * nada, no demuestra absolutamente nada.
     *
     * ---------- LA DE AHORA TAMBIEN MUERE CONTRA UNA PRUEBA DE TEXTO ----------
     *
     * Y hay que decirlo, porque si no esto seria cambiar un autoengaño por
     * otro. Lo que cambia es la otra mitad: la regla SI hace algo. Sin el
     * `!important`, `[hidden]` pierde contra cualquier regla de mas peso que
     * ponga un display —y hay varias, del tipo
     * `#ytmpip-root.ytmpip-overlay .ytmpip-controls { display: flex }`, que
     * llevan id y ganan de calle—. O sea: quitarlo rompe la ventana de
     * verdad, no solo el texto del archivo.
     *
     * Que la prueba sea de texto es una limitacion de jsdom, que no resuelve
     * la cascada, y no una eleccion: para verlo pasar hay que mirar la
     * ventana. Es la misma clase de prueba que la del `min-height` de las
     * barras, con la misma limitacion escrita al lado.
     */
    etiqueta: "CSS: `hidden` pierde el !important y vuelve a ganarle la ultima regla de autor",
    archivo: "src/pip/pip.css",
    de: "[hidden] {\n  display: none !important;\n}",
    a: "[hidden] {\n  display: none;\n}"
  },
  {
    etiqueta: "PAGINA: el rango se copia en el HTML y deja de seguir a las constantes",
    archivo: PAGINA,
    de: '<input id="equalizerBand0" type="range" />',
    a: '<input id="equalizerBand0" type="range" min="-15" max="15" step="1" />'
  },
  {
    /*
     * Esta empezo anidando un <fieldset> dentro de otro y SOBREVIVIA, con
     * razon: el de dentro seguia teniendo el id y seguia conteniendo los
     * cinco mandos, asi que esconderlo los escondia igual. La mutacion no
     * estropeaba nada. Lo que de verdad se rompe con el tiempo es el id:
     * options.js busca "equalizerBands" y el dia que el HTML lo renombre,
     * `equalizerBox` sera null y los deslizadores se quedaran visibles con
     * el ecualizador apagado.
     */
    etiqueta: "PAGINA: el grupo que se esconde cambia de id y el JS busca el de antes",
    archivo: PAGINA,
    de: '<fieldset id="equalizerBands" class="ytmpip-bandas">',
    a: '<fieldset id="equalizerBandas" class="ytmpip-bandas">'
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
/*
 * Las marcadas `equivalente` se cuentan aparte y NO tumban el proceso.
 *
 * Una mutacion equivalente es la que produce un programa que se comporta
 * igual en todo estado alcanzable: no hay prueba que pueda distinguirla,
 * asi que contarla como "prueba que falta" es mentir sobre la cobertura, y
 * borrar el codigo para que muera es dejar el programa peor por complacer a
 * una herramienta. Lo unico honesto es senalarla y escribir POR QUE lo es,
 * que es lo que hace el comentario de cada una.
 *
 * Se sigue ejecutando, y si alguna vez MUERE hay que venir aqui: significa
 * que el codigo cambio y el razonamiento de su comentario ya no vale.
 */
let equivalentes = 0;

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
  if (m.equivalente) {
    equivalentes++;
    if (caidas.length) {
      sobreviven++;
      console.error(
        `  OJO   ${m.etiqueta}\n` +
          "        estaba marcada como EQUIVALENTE y ahora muere: el codigo " +
          "cambio y el motivo escrito en tools/mutar-mandos.js ya no vale. " +
          "Quitale la marca."
      );
    } else {
      console.log(`  (equivalente, a proposito) ${m.etiqueta}`);
    }
    continue;
  }
  if (!caidas.length) {
    sobreviven++;
    console.error(`  VIVE  ${m.etiqueta}`);
  } else {
    muertas++;
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.slice(0, 3).join(" | ")}`);
  }
}

console.log(
  `\n${muertas} de ${MUTACIONES.length - equivalentes} mutaciones detectadas; ` +
    `${sobreviven} sobreviven` +
    (equivalentes ? `; ${equivalentes} equivalente(s) aparte.` : ".")
);
process.exit(sobreviven ? 1 : 0);
