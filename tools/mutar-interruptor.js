/*
 * Verificacion por MUTACION del interruptor del ecualizador de la ventana
 * flotante, y de la clave que lo hace posible.
 *
 * mutar-mandos.js cubre la pagina de opciones: que se enseña de lo guardado y
 * que se guarda de lo elegido. Aquel archivo se escribio cuando el
 * ecualizador solo se podia tocar desde opciones, o sea cuando "cambiar el
 * ecualizador" y "elegir en una lista" eran lo mismo. Ya no lo son: ahora hay
 * un segundo sitio que escribe —el boton del PiP— y con el ha aparecido una
 * pregunta que antes no existia, "a que vuelvo al encender". Ese es el hueco
 * que cubre este archivo.
 *
 *   - LA REGLA (src/shared/settings.js): que se guarda en cada clave al
 *     encender y al apagar. Vive en un solo sitio a proposito, porque la
 *     necesitan los dos escritores.
 *   - EL INTERRUPTOR (src/pip/pip.js y pip.html): que lee al pulsarlo, que
 *     escribe y que enseña.
 *   - LA ANOTACION EN OPCIONES (src/options/options.js): que la lista
 *     mantenga al dia lo que el boton va a necesitar despues.
 *
 * LA MUTACION QUE MAS IMPORTA ES «anota la anotacion en vez de lo que
 * sonaba», y no por elegante: es un fallo que existio de verdad en este
 * archivo hasta que lo tumbo una prueba. Con esa version, quien tenia sus
 * cinco numeros puestos a mano y sin anotacion previa los perdia al primer
 * clic, que es exactamente la perdida que este interruptor existe para
 * evitar. Esta puesta dos veces, con las dos maneras de escribirla, para que
 * no vuelva por la puerta de atras.
 *
 * LO QUE ESTE ARCHIVO NO CUBRE, dicho a las claras: LA MAQUETACION de la fila
 * de botones. El `flex-wrap: wrap` de `.ytmpip-extras` y el `min-width` del
 * volumen en pip.css estan ahi porque el sexto boton no cabe a 240px de
 * ancho, y jsdom no calcula estilos: mutar esas dos reglas no tumbaria ni una
 * prueba. Eso se mira en tools/vista-previa.html y solo ahi.
 *
 * Mismo arnes que los otros: de usar y tirar, fuera de `npm test`, y restaura
 * los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/interruptor-ecualizador.test.js",
  "tests/unit/opciones-ecualizador.test.js",
  "tests/unit/settings.test.js"
];
const AJUSTES = "src/shared/settings.js";
const VENTANA = "src/pip/pip.js";
const PAGINA = "src/pip/pip.html";
const MANDOS = "src/options/options.js";

const MUTACIONES = [
  /* ---------- LA REGLA: la anotacion deja de contestar su pregunta ---------- */
  {
    etiqueta: "REGLA: la anotacion puede acabar valiendo «off» (el boton no tendria a donde volver)",
    archivo: AJUSTES,
    de: "    if (limpio === YTMPip.Ecualizador.APAGADO) return DEFAULT_SETTINGS.equalizerLast;",
    a: "    ;"
  },
  {
    etiqueta: "REGLA: lo que no se entiende se anota tal cual en vez de ir al valor de fabrica",
    archivo: AJUSTES,
    de: "    const limpio = YTMPip.Ecualizador.normalizar(valor);\n    if (limpio === YTMPip.Ecualizador.APAGADO) return DEFAULT_SETTINGS.equalizerLast;\n    return limpio;",
    a: "    const limpio = valor;\n    if (limpio === YTMPip.Ecualizador.APAGADO) return DEFAULT_SETTINGS.equalizerLast;\n    return limpio;"
  },

  /* ---------- LA REGLA: el fallo que existio de verdad ---------- */
  {
    /*
     * EL FALLO ORIGINAL, en su forma exacta. `clavesEcualizador` recibia el
     * estado entero pero solo miraba la anotacion, asi que apagar conservaba
     * lo anotado —que para quien nunca habia encendido nada era el valor de
     * fabrica— y tiraba los cinco numeros que sonaban.
     */
    etiqueta: "REGLA: apagar conserva la ANOTACION en vez de anotar lo que sonaba (perdida de los ajustes a mano)",
    archivo: AJUSTES,
    de: "          : ultimoEcualizador(sonaba !== APAGADO ? sonaba : previo.equalizerLast)",
    a: "          : ultimoEcualizador(previo.equalizerLast)"
  },
  {
    etiqueta: "REGLA: el mismo fallo por la otra puerta (nunca se lee lo que sonaba)",
    archivo: AJUSTES,
    de: "    const sonaba = YTMPip.Ecualizador.normalizar(previo.equalizer);",
    a: "    const sonaba = YTMPip.Ecualizador.APAGADO;"
  },
  {
    etiqueta: "REGLA: se anota lo que sonaba TAMBIEN cuando ya estaba apagado (se pierde la anotacion buena)",
    archivo: AJUSTES,
    de: "          : ultimoEcualizador(sonaba !== APAGADO ? sonaba : previo.equalizerLast)",
    a: "          : ultimoEcualizador(sonaba)"
  },
  {
    etiqueta: "REGLA: al encender no se anota nada (el boton siempre vuelve a «graves»)",
    archivo: AJUSTES,
    de: "        limpio !== APAGADO\n          ? limpio",
    a: "        limpio === APAGADO\n          ? limpio"
  },
  {
    etiqueta: "REGLA: lo que suena se guarda sin normalizar",
    archivo: AJUSTES,
    de: "      [STORAGE_KEYS.EQUALIZER]: limpio,",
    a: "      [STORAGE_KEYS.EQUALIZER]: valor,"
  },
  {
    etiqueta: "REGLA: no se lee la anotacion de storage al cargar (se pierde entre sesiones)",
    archivo: AJUSTES,
    de: "      equalizerLast: ultimoEcualizador(stored[STORAGE_KEYS.EQUALIZER_LAST]),",
    a: "      equalizerLast: DEFAULT_SETTINGS.equalizerLast,"
  },

  /* ---------- EL ESCRITOR: la cache, el aviso y el estado anterior ---------- */
  {
    etiqueta: "ESCRITOR: el estado anterior no sale de la cache (cada clic empieza de cero)",
    archivo: AJUSTES,
    de: "    const claves = clavesEcualizador(valor, cache);",
    a: "    const claves = clavesEcualizador(valor, {});"
  },
  {
    etiqueta: "ESCRITOR: no se avisa a nadie (el boton se queda pintado como estaba)",
    archivo: AJUSTES,
    de: "    });\n    notify();\n    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;\n    try {\n      chrome.storage.local.set(claves);",
    a: "    });\n    ;\n    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return limpio;\n    try {\n      chrome.storage.local.set(claves);"
  },
  {
    etiqueta: "ESCRITOR: no se toca la cache (dos clics seguidos leen el mismo estado viejo)",
    archivo: AJUSTES,
    de: "    cache = Object.assign({}, cache, {\n      equalizer: limpio,\n      equalizerLast: claves[STORAGE_KEYS.EQUALIZER_LAST]\n    });",
    a: "    ;"
  },
  {
    etiqueta: "ESCRITOR: se guarda solo lo que suena y la anotacion no llega a storage",
    archivo: AJUSTES,
    de: "      chrome.storage.local.set(claves);",
    a: "      chrome.storage.local.set({ [STORAGE_KEYS.EQUALIZER]: limpio });"
  },
  {
    etiqueta: "ESCRITOR: la anotacion vuelve a la lista que recarga (apagar releeria storage dos veces)",
    archivo: AJUSTES,
    de: "    (key) => key !== STORAGE_KEYS.PIP_LAST_SIZE && key !== STORAGE_KEYS.EQUALIZER_LAST",
    a: "    (key) => key !== STORAGE_KEYS.PIP_LAST_SIZE"
  },

  /* ---------- EL INTERRUPTOR: lo que hace al pulsarlo ---------- */
  {
    etiqueta: "INTERRUPTOR: al encender vuelve siempre a «graves» y no a lo anotado",
    archivo: VENTANA,
    de: "      encendido ? YTMPip.Ecualizador.APAGADO : ajustes.equalizerLast",
    a: '      encendido ? YTMPip.Ecualizador.APAGADO : "graves"'
  },
  {
    etiqueta: "INTERRUPTOR: no apaga nunca (pulsarlo estando encendido lo deja igual)",
    archivo: VENTANA,
    de: "      encendido ? YTMPip.Ecualizador.APAGADO : ajustes.equalizerLast",
    a: "      ajustes.equalizerLast"
  },
  {
    etiqueta: "INTERRUPTOR: mira la anotacion para decidir si esta encendido",
    archivo: VENTANA,
    de: "    const encendido = !YTMPip.Ecualizador.estaApagado(ajustes.equalizer);\n    YTMPip.Settings.guardarEcualizador(",
    a: "    const encendido = !YTMPip.Ecualizador.estaApagado(ajustes.equalizerLast);\n    YTMPip.Settings.guardarEcualizador("
  },
  {
    etiqueta: "INTERRUPTOR: el boton no esta conectado a nada",
    archivo: VENTANA,
    de: '    if (els.eq) els.eq.addEventListener("click", alternarEcualizador);',
    a: "    ;"
  },

  /* ---------- EL INTERRUPTOR: lo que enseña ---------- */
  {
    etiqueta: "INTERRUPTOR: no se repinta con lo guardado (cambiarlo en opciones no mueve el boton)",
    archivo: VENTANA,
    de: "    pintarEcualizador(settings.equalizer);",
    a: "    ;"
  },
  {
    etiqueta: "INTERRUPTOR: el boton se ve siempre apagado",
    archivo: VENTANA,
    de: '    els.eq.setAttribute("aria-pressed", String(encendido));',
    a: '    els.eq.setAttribute("aria-pressed", "false");'
  },
  {
    etiqueta: "INTERRUPTOR: el boton se ve siempre encendido",
    archivo: VENTANA,
    de: '    els.eq.setAttribute("aria-pressed", String(encendido));',
    a: '    els.eq.setAttribute("aria-pressed", "true");'
  },
  {
    /*
     * ESTA MUTACION ESTUVO APUNTANDO AL VACIO, y conviene que quede escrito
     * porque es la forma en que se estropea un arnes de mutacion sin que
     * salte nada: el `de` decia `!YTMPip.Ecualizador.estaApagado(valor)`, y el
     * dia que `pintarEcualizador` se guardo el modulo en un `const Eq` de una
     * linea —un renombrado de los que no cambian nada— el texto dejo de
     * existir. Desde entonces la mutacion no protegia ninguna prueba.
     *
     * Se caza porque el arnes cuenta como SUPERVIVIENTE lo que no encuentra,
     * en vez de saltarselo en silencio. Si se limitara a no aplicarla, el
     * informe seguiria diciendo "0 sobreviven" con una comprobacion menos,
     * que es justo la clase de verde que este proyecto no quiere.
     */
    etiqueta: "INTERRUPTOR: el estado se pinta al reves",
    archivo: VENTANA,
    de: "    const encendido = !Eq.estaApagado(valor);",
    a: "    const encendido = Eq.estaApagado(valor);"
  },
  {
    etiqueta: "INTERRUPTOR: quien no ve no puede leer el estado (la etiqueta se queda fija)",
    archivo: VENTANA,
    de: '    els.eq.setAttribute("aria-label", etiqueta);',
    a: "    ;"
  },

  /* ---------- LA PAGINA DEL PIP: lo escrito a mano ---------- */
  {
    etiqueta: "PAGINA: el boton cambia de id y el JS busca el de antes (no hay interruptor)",
    archivo: PAGINA,
    de: '<button id="ytmpip-eq"',
    a: '<button id="ytmpip-ecualizador"'
  },
  {
    /*
     * `data-ico` es lo que hace que iconos.js sustituya el emoji por el
     * dibujo. Sin el, el boton sigue funcionando y sigue diciendo la verdad:
     * lo unico que se pierde es que se vea como los demas.
     */
    etiqueta: "PAGINA: el boton se queda con el emoji en vez del icono dibujado",
    archivo: PAGINA,
    de: ' data-ico="ecualizador">🎛</button>',
    a: ">🎛</button>"
  },

  /* ---------- LA ANOTACION EN OPCIONES ---------- */
  {
    etiqueta: "OPCIONES: se guarda sin mirar lo que habia (apagar aqui tira los numeros a mano)",
    archivo: MANDOS,
    de: "    const ecualizador = clavesEcualizador(valorDelEcualizador(), ecualizadorGuardado);",
    a: "    const ecualizador = clavesEcualizador(valorDelEcualizador(), null);"
  },
  {
    etiqueta: "OPCIONES: no se pone al dia tras guardar (dos cambios seguidos usan estado viejo)",
    archivo: MANDOS,
    de: "    ecualizadorGuardado = {\n      equalizer: ecualizador[STORAGE_KEYS.EQUALIZER],\n      equalizerLast: ecualizador[STORAGE_KEYS.EQUALIZER_LAST]\n    };",
    a: "    ;"
  },
  {
    etiqueta: "OPCIONES: al abrir la pagina no se siembra el estado (el primer guardado va a ciegas)",
    archivo: MANDOS,
    de: "      ecualizadorGuardado = {\n        equalizer: stored[STORAGE_KEYS.EQUALIZER],\n        equalizerLast: stored[STORAGE_KEYS.EQUALIZER_LAST]\n      };",
    a: "      ;"
  },
  {
    etiqueta: "OPCIONES: se siembra solo lo que suena y se olvida la anotacion",
    archivo: MANDOS,
    de: "        equalizer: stored[STORAGE_KEYS.EQUALIZER],\n        equalizerLast: stored[STORAGE_KEYS.EQUALIZER_LAST]",
    a: "        equalizer: stored[STORAGE_KEYS.EQUALIZER]"
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
 * Las marcadas `equivalente` se cuentan aparte y NO tumban el proceso. El
 * motivo, entero, esta en tools/mutar-mandos.js; en resumen: no hay prueba
 * que pueda distinguirlas, asi que contarlas como cobertura que falta seria
 * mentir. Si alguna vez MUERE una, hay que venir aqui: el codigo cambio y el
 * razonamiento de su comentario ya no vale.
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
          "cambio y el motivo escrito en tools/mutar-interruptor.js ya no vale. " +
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
