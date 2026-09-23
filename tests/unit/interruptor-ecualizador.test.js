/*
 * EL INTERRUPTOR DEL ECUALIZADOR: el boton de la ventana flotante y la
 * regla que lo sostiene.
 *
 * De donde sale. Hasta aqui el ecualizador solo se podia tocar en la pagina
 * de opciones, o sea abriendo otra pestaña, y eso para algo que se quiere
 * probar con la cancion sonando. En la ventana caben unos mandos mas.
 *
 * POR QUE UN INTERRUPTOR Y NO UNA RUEDA. La otra forma evidente era un boton
 * que fuera pasando por «Plano», «Graves», «Voz»... En una ventana de 340 px
 * eso ocupa lo mismo y ofrece mas, pero tiene un defecto que no se arregla:
 * quien haya dejado sus cinco numeros puestos a mano los pierde en el primer
 * clic, y desde ahi no hay forma de recuperarlos. Encender y apagar no
 * destruye nada. Elegir ajuste se queda en Opciones, que es donde se ven los
 * deslizadores.
 *
 * Y de ahi sale la clave nueva. Un interruptor tiene que saber A QUE VOLVER,
 * y `equalizer` no puede decirlo: cuando esta apagado vale "off" y "off" no
 * es un ajuste. Por eso hay una segunda clave, `equalizerLast`, que es una
 * ANOTACION y no una segunda respuesta —contesta a otra pregunta— igual que
 * `pipLastSize` frente a `pipSize`.
 *
 * LO QUE ESTAS PRUEBAS GARANTIZAN:
 *  - la regla pura: que se guarda al apagar y que al encender (`clavesEcualizador`),
 *  - que el interruptor no pierde los numeros de nadie en el viaje de ida y vuelta,
 *  - que el boton dice la verdad, incluso cuando lo que cambia es la pagina
 *    de opciones con la ventana ya abierta.
 *
 * LO QUE NO:
 *  - que el audio suene distinto. Eso lo monta el grafo y solo se comprueba
 *    en un navegador de verdad (ver tools/diagnostico-ecualizador.js).
 *  - que el boton QUEPA en la fila. Se le ha hecho sitio con `flex-wrap` en
 *    pip.css, y jsdom no maqueta: cualquier assert sobre pixeles aqui seria
 *    inventado. Eso se mira en tools/vista-previa.html.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, plano, i18nFalso, RAIZ } = require("../helpers/entorno.js");
const { DEFAULT_SETTINGS, STORAGE_KEYS, EQUALIZER_PRESETS } = require("../helpers/constantes.js");

const APAGADO = "off";

/*
 * Un chrome.storage de verdad, con memoria y con avisos.
 *
 * El doble de tests/helpers/entorno.js no sirve aqui: su `set` no guarda
 * nada y su `onChanged` no avisa a nadie. Eso basta para leer preferencias,
 * pero este boton ESCRIBE, y ademas la mitad de lo que hay que comprobar es
 * quien se entera de la escritura.
 *
 * `set` avisa a los oyentes EN EL ACTO, aunque el de Chrome tarde un poco:
 * lo que se quiere medir es quien reacciona y a que, no cuando. Los retrasos
 * de verdad los cubre `asentar()`, que deja correr el `get` asincrono.
 */
function ventana(guardado = {}) {
  const { win } = crearEntorno(undefined);

  const almacen = Object.assign({}, guardado);
  const oyentes = [];
  const escrituras = [];
  const enviados = [];
  let lecturas = 0;

  win.chrome = {
    // Este chrome sustituye ENTERO al de crearEntorno (por el storage con
    // memoria), asi que el catalogo hay que traerlo tambien: sin el, las
    // etiquetas del boton serian claves peladas y no lo que lee el usuario.
    i18n: i18nFalso({}),
    runtime: {
      id: "id-de-prueba",
      getURL: (p) => `chrome-extension://id-de-prueba/${p}`,
      sendMessage(mensaje) {
        enviados.push(plano(mensaje));
        return Promise.resolve({ ok: true });
      },
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get() {
          lecturas++;
          return Promise.resolve(Object.assign({}, almacen));
        },
        set(valores) {
          escrituras.push(plano(valores));
          const cambios = {};
          for (const clave of Object.keys(valores)) {
            cambios[clave] = { oldValue: almacen[clave], newValue: valores[clave] };
            almacen[clave] = valores[clave];
          }
          avisar(cambios);
          return Promise.resolve();
        }
      },
      onChanged: {
        addListener(fn) {
          oyentes.push(fn);
        }
      }
    }
  };

  function avisar(cambios) {
    oyentes.forEach((fn) => fn(cambios, "local"));
  }

  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  /*
   * La suscripcion, a mano y a proposito.
   *
   * En la ventana de verdad la hace `openPip`, que no se puede ejercitar
   * aqui porque necesita documentPictureInPicture y jsdom no lo tiene. O
   * sea que ESTA LINEA NO ESTA PROBADA por este archivo; lo que si queda
   * probado es lo de despues: que al avisar, el boton cuenta lo que hay.
   * Se engancha `aplicarPreferencias`, que es la misma funcion que engancha
   * pip.js, no una copia.
   */
  win.YTMPip.Settings.subscribe(banco.aplicarPreferencias);

  const eq = doc.getElementById("ytmpip-eq");

  return {
    win,
    doc,
    banco,
    eq,
    almacen,
    escrituras,
    enviados,
    avisar,
    lecturas: () => lecturas,
    Settings: win.YTMPip.Settings,
    // Deja correr el `get` asincrono de load(). Un turno de macrotask cubre
    // la promesa y su `.then`, que es todo lo que hay en medio.
    asentar: () => new Promise((r) => setTimeout(r, 0)),
    pulsar: () => eq.dispatchEvent(new win.Event("click")),
    marcado: () => eq.getAttribute("aria-pressed"),
    etiqueta: () => eq.getAttribute("aria-label"),

    /* ---------- Las barritas ---------- */
    caja: doc.getElementById("ytmpip-eq-bandas"),
    /**
     * Lo que se ve de cada barra, en el orden de las bandas.
     *
     * Se leen `top` y `height` del estilo en linea porque es AHI donde
     * pip.js escribe los decibelios; lo demas del dibujo —el ancho, el
     * reparto, el minimo de la banda plana— lo pone pip.css, y jsdom no
     * maqueta. Medir aqui pixeles seria inventarlos.
     */
    barras: () =>
      [...doc.querySelectorAll("#ytmpip-eq-bandas .ytmpip-eq-banda > i")].map((b) => ({
        top: b.style.top,
        alto: b.style.height
      }))
  };
}

/** El ultimo objeto escrito en storage, ya en el realm de Node. */
function ultimaEscritura(v) {
  return v.escrituras[v.escrituras.length - 1];
}

/* ==================================================================
 * 1. La regla, en seco
 *
 * `clavesEcualizador` es pura y vive en settings.js —y no en pip.js—
 * porque la necesitan los DOS sitios que escriben el ecualizador: este
 * boton y la lista de la pagina de opciones. Escrita en los dos no seria
 * una regla, serian dos, y la que se olvidara de anotar dejaria el
 * interruptor volviendo a «graves» por su cuenta.
 * ================================================================== */

test("la anotacion NUNCA vale «apagado», que es lo unico que no puede valer", async () => {
  const { Settings } = ventana();

  /*
   * Los cuatro caminos por los que podria colarse un "off": pidiendolo,
   * con basura (que `normalizar` manda al valor por defecto, y el valor por
   * defecto de `equalizer` ES "off"), sin nada, y con nada de nada. El
   * segundo es el traicionero: llega aqui ya disfrazado de apagado.
   */
  for (const valor of [APAGADO, "no-existe", "", undefined, null, 7, {}]) {
    assert.strictEqual(
      Settings.ultimoEcualizador(valor),
      DEFAULT_SETTINGS.equalizerLast,
      `ultimoEcualizador(${JSON.stringify(valor)}) deberia caer al valor de fabrica`
    );
  }
});

test("una anotacion buena se respeta tal cual, sea preset o numeros a mano", async () => {
  const { Settings } = ventana();

  assert.strictEqual(Settings.ultimoEcualizador("voz"), "voz");
  // La lista es el caso exigente: tiene que sobrevivir al partido por
  // comas y al vuelto a juntar sin que se mueva un decibelio.
  assert.strictEqual(Settings.ultimoEcualizador("-4,0,2,0,6"), "-4,0,2,0,6");
});

test("APAGAR anota LO QUE SONABA, no la anotacion que hubiera", async () => {
  /*
   * ESTA PRUEBA CORRIGIO EL CODIGO, y por eso va con nombre grande. La
   * primera version decia "apagar no toca la anotacion", que suena
   * razonable y es falso justo en el caso que importa: quien tenia sus
   * cinco numeros puestos desde antes de que la clave existiera no tiene
   * anotacion ninguna, asi que conservarla era conservar el valor de
   * fabrica y tirar los numeros.
   */
  const { Settings } = ventana();
  const claves = plano(
    Settings.clavesEcualizador(APAGADO, { equalizer: "-4,0,2,0,6", equalizerLast: "graves" })
  );

  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER], APAGADO);
  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER_LAST], "-4,0,2,0,6");
});

test("apagar lo que YA estaba apagado si respeta la anotacion vieja", async () => {
  /*
   * La otra mitad de la regla, y la que explica por que sigue haciendo
   * falta la anotacion: cuando no suena nada, no hay nada que anotar, y lo
   * unico que queda es lo que se guardo la ultima vez.
   */
  const { Settings } = ventana();
  const claves = plano(
    Settings.clavesEcualizador(APAGADO, { equalizer: APAGADO, equalizerLast: "voz" })
  );

  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER_LAST], "voz");
});

test("ENCENDER anota: la anotacion pasa a ser lo que se acaba de poner", async () => {
  const { Settings } = ventana();
  const claves = plano(
    Settings.clavesEcualizador("voz", { equalizer: "graves", equalizerLast: "graves" })
  );

  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER], "voz");
  assert.strictEqual(
    claves[STORAGE_KEYS.EQUALIZER_LAST],
    "voz",
    "la anotacion se quedo con el ajuste anterior en vez de con el nuevo"
  );
});

test("apagar sin nada de donde tirar no deja el interruptor sin sitio al que ir", async () => {
  const { Settings } = ventana();

  const rotos = [
    undefined,
    {},
    { equalizer: APAGADO, equalizerLast: APAGADO },
    { equalizer: "basura", equalizerLast: "basura" }
  ];
  for (const previo of rotos) {
    const claves = plano(Settings.clavesEcualizador(APAGADO, previo));
    assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER], APAGADO);
    assert.strictEqual(
      claves[STORAGE_KEYS.EQUALIZER_LAST],
      DEFAULT_SETTINGS.equalizerLast,
      `con ${JSON.stringify(previo)} la anotacion no cayo al valor de fabrica`
    );
  }
});

test("un ecualizador ilegible se apaga, PERO NO SE LLEVA POR DELANTE la anotacion", async () => {
  /*
   * El caso fino. `normalizar("basura")` da "off", asi que la primera clave
   * sale apagada; si la segunda se calculara a partir de la ENTRADA en vez
   * de a partir del resultado, escribiria la basura como anotacion y el
   * interruptor se encenderia a «graves» tirando lo que hubiera.
   */
  const { Settings } = ventana();
  const claves = plano(
    Settings.clavesEcualizador("basura", { equalizer: APAGADO, equalizerLast: "voz" })
  );

  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER], APAGADO);
  assert.strictEqual(claves[STORAGE_KEYS.EQUALIZER_LAST], "voz");
});

test("salen SIEMPRE las dos claves, tambien al encender", async () => {
  /*
   * Devolver a veces una clave y a veces dos obligaria a quien guarda a
   * acordarse de cual es cual. Asi lo que sale de aqui es el estado
   * completo del ecualizador y se puede volcar entero.
   */
  const { Settings } = ventana();

  for (const valor of [APAGADO, "voz", "0,0,0,0,0"]) {
    const claves = plano(Settings.clavesEcualizador(valor, { equalizer: "graves" }));
    assert.deepStrictEqual(
      Object.keys(claves).sort(),
      [STORAGE_KEYS.EQUALIZER, STORAGE_KEYS.EQUALIZER_LAST].sort()
    );
  }
});

/* ==================================================================
 * 2. A donde va el interruptor la primera vez
 * ================================================================== */

test("el valor de fabrica de la anotacion es un ajuste que existe y que se OYE", async () => {
  const ultimo = DEFAULT_SETTINGS.equalizerLast;

  assert.notStrictEqual(ultimo, APAGADO, "un interruptor que enciende a «apagado» no enciende");
  assert.ok(
    Object.prototype.hasOwnProperty.call(EQUALIZER_PRESETS, ultimo),
    `«${ultimo}» no es ningun preset de EQUALIZER_PRESETS`
  );
  /*
   * Y no «plano», que es la trampa. «Plano» enciende de verdad —cruza la
   * puerta, monta los cinco filtros— y suena exactamente igual que antes,
   * asi que la primera vez que alguien pulsa el boton no pasa nada
   * audible y el boton parece roto. La diferencia entre plano y apagado es
   * real, pero no se oye, y aqui lo que hace falta es que se oiga.
   */
  assert.notStrictEqual(ultimo, "plano", "el primer clic tiene que notarse");
});

/* ==================================================================
 * 3. El interruptor: encender, apagar, y no perder nada por el camino
 * ================================================================== */

test("apagado, el clic enciende con lo ultimo que hubo", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: APAGADO, [STORAGE_KEYS.EQUALIZER_LAST]: "voz" });
  await v.asentar();

  v.pulsar();

  assert.strictEqual(ultimaEscritura(v)[STORAGE_KEYS.EQUALIZER], "voz");
});

test("sin nada guardado, el primer clic enciende con el ajuste de fabrica", async () => {
  const v = ventana();
  await v.asentar();

  v.pulsar();

  assert.strictEqual(ultimaEscritura(v)[STORAGE_KEYS.EQUALIZER], DEFAULT_SETTINGS.equalizerLast);
});

test("encendido, el clic apaga Y DEJA ANOTADO lo que sonaba", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "-4,0,2,0,6" });
  await v.asentar();

  v.pulsar();

  const escrito = ultimaEscritura(v);
  assert.strictEqual(escrito[STORAGE_KEYS.EQUALIZER], APAGADO);
  assert.strictEqual(escrito[STORAGE_KEYS.EQUALIZER_LAST], "-4,0,2,0,6");
});

test("LA PRUEBA DE LA IDA Y VUELTA: cinco numeros a mano vuelven exactamente iguales", async () => {
  /*
   * Es el caso que decidio el diseño. Con una rueda de ajustes, este viaje
   * termina en «Plano» o donde toque, y los numeros de quien se los puso a
   * mano no vuelven nunca.
   */
  const aMano = "7,-3,0,2,-5";
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: aMano });
  await v.asentar();

  v.pulsar(); // apagar
  await v.asentar();
  assert.strictEqual(v.Settings.get().equalizer, APAGADO, "no se apago");

  v.pulsar(); // encender
  await v.asentar();

  assert.strictEqual(v.Settings.get().equalizer, aMano);
});

test("dos clics seguidos SIN esperar a storage no hacen lo mismo dos veces", async () => {
  /*
   * Por esto `guardarEcualizador` toca la cache antes de escribir. El
   * camino bueno es storage -> onChanged -> load -> notify, pero es
   * asincrono: sin la cache al dia, el segundo clic leeria el estado de
   * antes del primero y volveria a apagar lo que ya estaba apagado.
   *
   * Aqui se pulsa dos veces en el mismo turno, sin `asentar` en medio.
   */
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "voz" });
  await v.asentar();

  v.pulsar();
  v.pulsar();

  assert.strictEqual(v.escrituras.length, 2, "el segundo clic no llego a escribir");
  assert.strictEqual(v.escrituras[0][STORAGE_KEYS.EQUALIZER], APAGADO);
  assert.strictEqual(v.escrituras[1][STORAGE_KEYS.EQUALIZER], "voz");
});

test("el interruptor no le pide NADA al reproductor de YouTube Music", async () => {
  /*
   * Los demas botones de la fila mandan un comando: quien manda sobre el
   * <video> es YouTube Music. Este cambia una preferencia nuestra, y quien
   * manda sobre eso es storage; el cable que monta el grafo ya escucha ese
   * cambio. Un comando ademas seria pedir dos veces lo mismo por dos
   * caminos, y el dia que discreparan ganaria el que llegara ultimo.
   */
  const v = ventana();
  await v.asentar();
  const antes = v.enviados.length;

  v.pulsar();

  assert.strictEqual(v.enviados.length, antes, "el clic mando un mensaje al content script");
  assert.strictEqual(v.escrituras.length, 1, "el clic tenia que escribir en storage");
});

/* ==================================================================
 * 4. El boton dice la verdad
 * ================================================================== */

test("nace apagado y lo dice de las dos formas: color y voz", async () => {
  const v = ventana();
  await v.asentar();

  assert.strictEqual(v.marcado(), "false");
  assert.match(v.etiqueta(), /apagado/i);
});

test("encendido se marca, y la etiqueta dice CUAL esta puesto", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();

  assert.strictEqual(v.marcado(), "true");

  /*
   * El nombre NO se escribe aqui: se lee de donde lo lee el boton. Escrito a
   * mano, renombrar el preset dejaria esta prueba roja sin que nada
   * estuviera roto, que es el error que ya ha costado tres arreglos en las
   * pruebas del preset.
   */
  const nombre = v.win.YTMPip.CONSTANTS.EQUALIZER_PRESET_LABELS.graves;
  assert.ok(nombre, "premisa: 'graves' tiene que tener nombre en las constantes");
  assert.ok(
    v.etiqueta().includes(nombre),
    `la etiqueta «${v.etiqueta()}» no nombra el ajuste puesto`
  );
});

test("el clic mueve el boton sin esperar a que vuelva storage", async () => {
  const v = ventana();
  await v.asentar();
  assert.strictEqual(v.marcado(), "false");

  v.pulsar();

  assert.strictEqual(v.marcado(), "true", "el boton se quedo quieto hasta el viaje de vuelta");
});

test("apagarlo desde la PAGINA DE OPCIONES tambien mueve el boton", async () => {
  /*
   * Las dos ventanas estan abiertas a la vez y la de opciones es otra
   * pestaña. Por eso el boton se pinta desde `applySettings` y no desde el
   * manejador del clic: lo que manda es lo guardado, y lo guardado lo
   * cambian dos sitios.
   */
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();
  assert.strictEqual(v.marcado(), "true");

  // Lo que hace la otra pestaña: escribir y que Chrome avise.
  v.almacen[STORAGE_KEYS.EQUALIZER] = APAGADO;
  v.avisar({ [STORAGE_KEYS.EQUALIZER]: { newValue: APAGADO } });
  await v.asentar();

  assert.strictEqual(v.marcado(), "false");
});

test("DOS AJUSTES DISTINTOS NO DEJAN EL BOTON IGUAL", async () => {
  /*
   * ESTA PRUEBA EXIGIA LO CONTRARIO y se llamaba "el boton no dice CUAL, y
   * eso es a proposito". El proposito era real: los nombres que lee una
   * persona vivian en el desplegable de options.html, copiarlos aqui seria
   * tenerlos en dos sitios, y antes que duplicarlos se prefirio que el boton
   * dijera solo "encendido".
   *
   * Lo que estaba mal no era el boton: era que el nombre de un preset
   * viviera dentro del HTML de una pagina. Movido a EQUALIZER_PRESET_LABELS
   * no hay nada que copiar, y la renuncia se queda sin motivo.
   *
   * Se comprueban los tres estados que sabe contar, y que sean TRES
   * distintos: si dos se pisaran, el boton estaria mintiendo sobre uno.
   */
  const a = ventana({ [STORAGE_KEYS.EQUALIZER]: "voz" });
  const b = ventana({ [STORAGE_KEYS.EQUALIZER]: "1,2,3,4,5" });
  const c = ventana({ [STORAGE_KEYS.EQUALIZER]: APAGADO });
  await a.asentar();
  await b.asentar();
  await c.asentar();

  const etiquetas = [a.etiqueta(), b.etiqueta(), c.etiqueta()];
  assert.strictEqual(
    new Set(etiquetas).size,
    3,
    "un preset, unos numeros a mano y apagado tienen que contarse distinto: " +
      etiquetas.join(" | ")
  );

  assert.ok(a.etiqueta().includes(a.win.YTMPip.CONSTANTS.EQUALIZER_PRESET_LABELS.voz));
  // Los cinco numeros no tienen nombre que dar y el boton no se lo inventa:
  // dice que hay algo puesto y que no es ninguno de la lista.
  assert.match(b.etiqueta(), /propio/i);
  assert.match(c.etiqueta(), /apagado/i);

  assert.strictEqual(a.eq.title, a.etiqueta(), "el titulo y la etiqueta tienen que contar lo mismo");
});

/* ==================================================================
 * LAS BARRITAS: el dibujo del ajuste, al lado del nombre
 *
 * El boton dice COMO SE LLAMA lo que hay puesto y estas dicen QUE FORMA
 * TIENE, que no es lo mismo y a veces ni se parece: el preset «Mas graves»
 * tiene los 60 Hz a cero. El nombre, leido solo, cuenta lo contrario de lo
 * que hace.
 *
 * Lo que NO se comprueba aqui, y no por olvido: como se ve. El ancho de cada
 * columna, la raya del cero y el minimo que hace visible una banda plana son
 * pip.css, y jsdom no maqueta. Eso se mira en tools/vista-previa.html.
 * ================================================================== */

test("hay una barrita por banda, y quien las cuenta es EQUALIZER_BANDS", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();

  const cuantas = v.win.YTMPip.CONSTANTS.EQUALIZER_BANDS.length;
  assert.strictEqual(
    v.barras().length,
    cuantas,
    "el dibujo y las bandas no cuentan lo mismo: una banda sin barra no " +
      "da ningun error, solo deja de verse para siempre"
  );
});

test("APAGADO: no se dibuja plano, se esconde", async () => {
  /*
   * Y la diferencia no es estetica. Cinco barras a cero y ninguna barra se
   * verian casi igual y significan cosas opuestas: "plano" cruza la puerta
   * de createMediaElementSource —monta los filtros, todos a cero— y "off"
   * no la cruza. Un indicador que las pintara igual estaria borrando el
   * unico estado que importa de verdad.
   */
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: APAGADO });
  await v.asentar();

  assert.strictEqual(v.caja.hidden, true, "las barritas siguen puestas con el ecualizador apagado");

  // Y al encender aparecen, sin recargar nada.
  v.pulsar();
  await v.asentar();
  assert.strictEqual(v.caja.hidden, false, "encender no destapa el dibujo");
});

test("LAS BARRAS DIBUJAN LOS DECIBELIOS QUE SUENAN, no unos parecidos", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();

  const { EQUALIZER_LIMITS } = v.win.YTMPip.CONSTANTS;
  /*
   * Lo esperado se calcula desde `ganancias()`, que es la MISMA funcion de
   * la que tira pip.js para dibujar, la pagina de opciones para colocar los
   * deslizadores y el grafo para montar los filtros. Copiar aqui los cinco
   * numeros de «graves» seria escribir el preset por segunda vez, y este
   * proyecto ya ha pagado esa factura dos veces esta semana.
   */
  const dbs = Array.from(v.win.YTMPip.Ecualizador.ganancias("graves"));
  const esperado = dbs.map((db) => {
    const tope = db >= 0 ? EQUALIZER_LIMITS.GAIN_MAX : Math.abs(EQUALIZER_LIMITS.GAIN_MIN);
    const alto = Math.min(Math.abs(db) / tope, 1) * 50;
    return { top: (db >= 0 ? 50 - alto : 50) + "%", alto: alto + "%" };
  });

  assert.deepStrictEqual(v.barras(), esperado);

  /*
   * Las dos premisas, sin las cuales lo de arriba compara dos listas de
   * ceros y pasa igual con el dibujo roto. «Graves» es justo el preset que
   * las necesita: su primera banda vale 0, asi que mirar solo esa —que es
   * lo que se hacia— no distinguiria nada.
   */
  assert.ok(
    dbs.some((db) => db > 0),
    "premisa: 'graves' tiene que subir alguna banda o el dibujo no prueba nada"
  );
  assert.ok(
    dbs.some((db) => db < 0),
    "premisa: 'graves' tiene que bajar alguna banda; si no, no se comprueba " +
      "que las bajadas cuelguen del cero en vez de subir"
  );
});

test("una banda a CERO sigue teniendo su barra, no un hueco", async () => {
  /*
   * Es el caso del preset por defecto, no una rareza: «Mas graves» tiene los
   * 60 Hz exactamente en 0. Si esa banda no dibujara nada, el ajuste que
   * viene de fabrica se veria con cuatro barras y un agujero a la izquierda,
   * y un agujero se lee como «aqui no hay banda», que es otra cosa que
   * «esta banda esta plana».
   */
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();

  const dbs = Array.from(v.win.YTMPip.Ecualizador.ganancias("graves"));
  const plana = dbs.indexOf(0);
  assert.notStrictEqual(plana, -1, "premisa: 'graves' tiene que tener alguna banda a cero");

  const barra = v.barras()[plana];
  assert.strictEqual(barra.alto, "0%");
  assert.strictEqual(barra.top, "50%", "la banda plana tiene que quedarse en la raya del cero");

  /*
   * Que ADEMAS se vea es cosa del `min-height` de pip.css, que jsdom no
   * calcula. Se comprueba que la regla existe, que es lo unico comprobable
   * desde aqui y lo unico que se puede borrar por descuido.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  assert.match(
    hoja,
    /\.ytmpip-eq-banda > i \{[^}]*min-height:/,
    "sin min-height la banda plana mide cero pixeles y desaparece"
  );
});

test("EL DIBUJO SE ESCONDE DE VERDAD: `hidden` solo no basta contra `display: flex`", async () => {
  /*
   * La trampa: `hidden` esconde porque la hoja del NAVEGADOR trae
   * `[hidden] { display: none }`, y cualquier regla de autor con el mismo
   * peso le gana. `.ytmpip-eq-bandas { display: flex }` lo tiene. Sin una
   * regla que lo desactive a mano, la prueba de mas arriba seguiria verde
   * —el atributo se pone— y las barras se quedarian a la vista con el
   * ecualizador apagado.
   *
   * Es exactamente el tipo de fallo que no da ningun error: se ve, y solo
   * si alguien mira.
   *
   * ---------- ESTA PRUEBA MIRABA EL SITIO EQUIVOCADO ----------
   *
   * Pedia `.ytmpip-eq-bandas[hidden] { display: none }`, una regla escrita a
   * mano al lado de las barras. Existia, la prueba pasaba, la mutacion que la
   * borraba moria... y la regla NO HACIA NADA: pip.css ya trae
   * `[hidden] { display: none !important }` para todo el archivo, y el
   * `!important` la pisa venga donde venga. O sea que la prueba custodiaba
   * codigo muerto y daba por comprobado un mecanismo que vive en otro sitio.
   *
   * Se aprendio buscando esa misma trampa para el hueco del video, que
   * tambien es `display: flex` y tambien se oculta con el atributo.
   *
   * Lo que se comprueba ahora es la regla DE VERDAD, y de ella lo que
   * importa: el `!important`. Sin el vuelve a depender del orden, y el orden
   * lo cambia cualquiera moviendo un bloque de sitio.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const global = hoja.match(/(?:^|\n)\[hidden\]\s*\{([^}]*)\}/);
  assert.ok(global, "no queda ninguna regla que haga funcionar el atributo hidden");
  assert.match(global[1], /display:\s*none/);
  assert.match(global[1], /!important/, "sin !important vuelve a ganar la ultima regla de autor");

  // Y que las barras siguen siendo de las que la necesitan. El dia que dejen
  // de ser `display: flex` esto sobra, y mas vale enterarse que arrastrar una
  // prueba que ya no protege nada, que es justo lo que acaba de pasar.
  assert.match(hoja, /\.ytmpip-eq-bandas\s*\{[^}]*display:\s*flex/);
});

test("UNA SEXTA BANDA SALE DIBUJADA, no se queda el dibujo de cinco", async () => {
  /*
   * Esto prueba un COMENTARIO. pip.js dice que mira el NUMERO de barras y no
   * si hay alguna, "asi una sexta banda reconstruye el dibujo en vez de
   * dejarlo enseñando cinco para siempre". Escrito y nada mas, ese `!==` se
   * puede cambiar por un `=== 0` sin que se entere nadie: hoy se comportan
   * igual, porque hoy nadie añade bandas.
   *
   * Una promesa en un comentario que ninguna prueba sostiene es una promesa
   * que se rompe el dia que hace falta, que es justo el dia en que nadie
   * esta mirando este archivo.
   */
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "graves" });
  await v.asentar();

  const BANDAS = v.win.YTMPip.CONSTANTS.EQUALIZER_BANDS;
  assert.strictEqual(v.barras().length, BANDAS.length, "premisa: se dibujan las de ahora");

  // La sexta banda, en la ventana de mentira y sin tocar el archivo real.
  BANDAS.push({ id: "subgraves", hz: 30, tipo: "lowshelf", etiqueta: "Subgraves" });

  // Cualquier repintado sirve: lo que hace la pagina de opciones al lado.
  v.almacen[STORAGE_KEYS.EQUALIZER] = "voz";
  v.avisar({ [STORAGE_KEYS.EQUALIZER]: { newValue: "voz" } });
  await v.asentar();

  assert.strictEqual(
    v.barras().length,
    BANDAS.length,
    "el dibujo se quedo con las bandas que habia la primera vez"
  );
});

test("cambiar de ajuste con la ventana abierta REDIBUJA, no deja el de antes", async () => {
  const v = ventana({ [STORAGE_KEYS.EQUALIZER]: "voz" });
  await v.asentar();
  const antes = v.barras();

  // Lo que hace la pagina de opciones en la otra pestaña.
  v.almacen[STORAGE_KEYS.EQUALIZER] = "nocturno";
  v.avisar({ [STORAGE_KEYS.EQUALIZER]: { newValue: "nocturno" } });
  await v.asentar();

  const despues = v.barras();
  assert.notDeepStrictEqual(
    despues,
    antes,
    "el dibujo se quedo en el ajuste anterior; el boton diria una cosa y las " +
      "barras otra"
  );
});

test("el boton se ve como sus vecinos: dibujo, no emoji", async () => {
  /*
   * ESTA PRUEBA LA PIDIO UNA MUTACION QUE SOBREVIVIA. Quitarle el
   * `data-ico="ecualizador"` al boton en pip.html no tumbaba nada: seguia
   * encendiendo, apagando y diciendo la verdad, solo que enseñando el emoji
   * 🎛 en una fila de cinco dibujos. iconos.test.js comprueba lo de al
   * revés —que todo `data-ico` escrito tenga dibujo— y por eso el hueco se
   * colaba: un boton sin atributo no pide nada, asi que no puede pedir mal.
   *
   * El emoji del HTML es el respaldo para cuando iconos.js no llega a
   * correr, no lo que se quiere ver; por eso lo que se mira es que quede un
   * <svg> dentro y que el emoji haya desaparecido.
   */
  const v = ventana({});
  await v.asentar();

  assert.strictEqual(
    v.eq.querySelectorAll("svg").length,
    1,
    "el interruptor se quedo con el emoji mientras los demas botones llevan dibujo"
  );
  assert.ok(!v.eq.textContent.includes("🎛"), "el emoji de respaldo sigue a la vista");
});

/* ==================================================================
 * 5. La anotacion no despierta a nadie
 * ================================================================== */

test("cambiar SOLO la anotacion no recarga las preferencias", async () => {
  /*
   * `equalizerLast` esta fuera de CLAVES_QUE_SE_APLICAN por el mismo
   * motivo que el tamaño anotado: no hay nada que aplicar. El que se oye
   * es `equalizer`, que se escribe en la misma llamada siempre que esta
   * cambia, asi que dejarla dentro solo serviria para recargar dos veces.
   */
  const v = ventana();
  await v.asentar();
  const antes = v.lecturas();

  v.avisar({ [STORAGE_KEYS.EQUALIZER_LAST]: { newValue: "voz" } });
  await v.asentar();

  assert.strictEqual(v.lecturas(), antes, "una anotacion recargo las preferencias enteras");
});

test("...pero el ecualizador si, aunque venga acompañado de la anotacion", async () => {
  const v = ventana();
  await v.asentar();
  const antes = v.lecturas();

  v.avisar({
    [STORAGE_KEYS.EQUALIZER]: { newValue: "voz" },
    [STORAGE_KEYS.EQUALIZER_LAST]: { newValue: "voz" }
  });
  await v.asentar();

  assert.strictEqual(v.lecturas(), antes + 1);
});
