/*
 * Pruebas de accesibilidad: el anuncio del cambio de canción y el
 * contraste de los dos temas.
 *
 * El anuncio es la mitad invisible de la ventana. Todo lo demás que hace
 * el PiP se ve, y cuando se rompe alguien lo nota mirando; una región
 * aria-live rota no la nota nadie que pueda reportarla, porque su único
 * público no está mirando. Por eso aquí se prueba tanto el
 * comportamiento (qué se anuncia y cuándo) como la carpintería estática
 * (que la región exista de fábrica, que la clase que la oculta no la
 * silencie): cada pieza falla en silencio y solo ante el usuario que
 * menos herramientas tiene para contarlo.
 *
 * El contraste, igual: un color que baja de los umbrales WCAG no rompe
 * ninguna prueba funcional, solo deja de leerse para quien ve poco. La
 * última prueba hace las cuentas de verdad (luminancia relativa,
 * composición alfa) sobre las variables reales del CSS, para que el
 * próximo que toque un color se entere en el acto y no en una queja.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

const PIP_HTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
const PIP_CSS = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

/* ---------- El banco: la ventana real con pip.js entero ---------- */

function ventana(opciones) {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
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
  doc.body.innerHTML = PIP_HTML;

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    PipView: win.YTMPip.PipView,
    anuncio: doc.getElementById("ytmpip-anuncio"),
    info: doc.querySelector(".ytmpip-info")
  };
}

function cancion(title, artist) {
  return { connected: true, playing: true, title, artist, hasVideo: false, lyrics: {} };
}

/* ---------- La carpintería estática ---------- */

test("LA REGION NACE COSIDA Y VACIA EN EL HTML", () => {
  /*
   * Cosida: los lectores de pantalla solo vigilan regiones aria-live que
   * ya existían al montarse el documento; una creada después es hablarle
   * al vacío. Vacía: es el ÚNICO nodo del HTML que no quiere español de
   * reserva, porque un texto de fábrica se anunciaría al montar como si
   * sonara una canción que no existe. Por lo mismo, sin marcas data-t*:
   * aplicar() no tiene nada que hacer aquí.
   */
  const dom = new JSDOM(PIP_HTML);
  const region = dom.window.document.getElementById("ytmpip-anuncio");

  assert.ok(region, "la región aria-live tiene que existir en pip.html");
  assert.strictEqual(region.getAttribute("role"), "status");
  assert.strictEqual(region.getAttribute("aria-live"), "polite");
  assert.strictEqual(region.getAttribute("aria-atomic"), "true");
  assert.ok(
    region.classList.contains("ytmpip-solo-lector"),
    "sin la clase, el anuncio se pintaría en la ventana"
  );
  assert.strictEqual(region.textContent.trim(), "", "tiene que nacer sin texto");
  for (const marca of ["data-t", "data-t-title", "data-t-aria", "data-t-alt"]) {
    assert.strictEqual(region.hasAttribute(marca), false, `no debe llevar ${marca}`);
  }
});

test("LA CLASE QUE OCULTA NO SILENCIA AL LECTOR", () => {
  /*
   * display:none y visibility:hidden sacan el nodo del árbol de
   * accesibilidad: ocultarían la región exactamente para su único
   * público. La receta correcta la saca de la VISTA (1×1, clip) sin
   * sacarla del árbol. Se comprueba también que de verdad oculte, porque
   * un bloque vacío pasaría el «no silencia» sin hacer nada.
   */
  const inicio = PIP_CSS.indexOf(".ytmpip-solo-lector {");
  assert.notStrictEqual(inicio, -1, "la clase tiene que estar definida en pip.css");
  const bloque = PIP_CSS.slice(inicio, PIP_CSS.indexOf("}", inicio));

  assert.ok(!/display\s*:\s*none/.test(bloque), "display:none silencia al lector");
  assert.ok(!/visibility\s*:\s*hidden/.test(bloque), "visibility:hidden también silencia");
  assert.ok(/position\s*:\s*absolute/.test(bloque), "sin absolute no se saca de la vista");
  assert.ok(/width\s*:\s*1px/.test(bloque), "la receta es 1×1, no un tamaño visible");
  assert.ok(/clip-path|clip\s*:/.test(bloque), "sin clip, un 1px con overflow puede asomar");
});

/* ---------- El comportamiento ---------- */

test("EL CAMBIO DE CANCION SE ANUNCIA; LA PRIMERA, NO", () => {
  const v = ventana();

  v.PipView.onStateUpdate(cancion("Vals", "Banda"));
  assert.strictEqual(
    v.anuncio.textContent,
    "",
    "la primera canción no es un cambio: quien abre la ventana ya tiene el título delante"
  );

  v.PipView.onStateUpdate(cancion("Luna", "Trío"));
  // El texto es el del catálogo español DE VERDAD (vía i18nFalso): esto
  // afirma lo que el usuario oye, no una frase copiada aquí.
  assert.strictEqual(v.anuncio.textContent, "Ahora suena Luna, de Trío");
});

test("LA MISMA CANCION NO SE RE-ANUNCIA EN CADA REPINTADO", () => {
  /*
   * render() corre con cada latido del estado, muchas veces por canción.
   * Si cada repintado reescribiera la región, el lector repetiría la
   * noticia sin parar: el anuncio se volvería la razón para silenciar al
   * lector. Se vacía la región a mano para poder distinguir «no se
   * escribió» de «se escribió lo mismo».
   */
  const v = ventana();
  v.PipView.onStateUpdate(cancion("Vals", "Banda"));
  v.PipView.onStateUpdate(cancion("Luna", "Trío"));
  assert.strictEqual(v.anuncio.textContent, "Ahora suena Luna, de Trío", "premisa");

  v.anuncio.textContent = "";
  v.PipView.onStateUpdate(cancion("Luna", "Trío"));

  assert.strictEqual(v.anuncio.textContent, "", "el repintado no es una noticia");
});

test("SIN ARTISTA NO HAY COMA HUERFANA; SIN TITULO NO HAY ANUNCIO", () => {
  const v = ventana();
  v.PipView.onStateUpdate(cancion("Vals", "Banda"));

  // Canción sin artista: la clave corta, no la larga con el hueco vacío
  // («Ahora suena Sola, de» sería leer la costura en voz alta).
  v.PipView.onStateUpdate(cancion("Sola", ""));
  assert.strictEqual(v.anuncio.textContent, "Ahora suena Sola");

  // Se acaba la cola: cambia la firma pero no hay nada que anunciar.
  // «Ahora suena» sin canción es ruido para quien no puede ignorarlo.
  v.PipView.onStateUpdate(cancion("", ""));
  assert.strictEqual(v.anuncio.textContent, "Ahora suena Sola", "la nada no se anuncia");
});

test("LA ANIMACION SOBREVIVIO A LA MUDANZA", () => {
  /*
   * La función que anima el cambio de canción se renombró y ahora hace
   * dos cosas (animar para quien mira, anunciar para quien no). Esta
   * prueba vigila que la vieja no se cayera del camión: comparten la
   * detección del cambio y romper una sin la otra es fácil.
   */
  const v = ventana();
  v.PipView.onStateUpdate(cancion("Vals", "Banda"));
  assert.strictEqual(v.info.classList.contains("ytmpip-changing"), false, "premisa: la primera no anima");

  v.PipView.onStateUpdate(cancion("Luna", "Trío"));
  assert.strictEqual(v.info.classList.contains("ytmpip-changing"), true);
});

/* ---------- El contraste, calculado y no prometido ---------- */

/*
 * Las cuentas oficiales de WCAG 2.x. `lineal` deshace la curva sRGB,
 * `luminancia` pondera los canales como los ve el ojo, y el contraste es
 * el cociente de luminancias con el +0.05 que modela la luz ambiente.
 * Umbrales: 4.5 para texto normal (AA), 3 para tinta de componentes.
 */
function lineal(canal) {
  const c = canal / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminancia([r, g, b]) {
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Compone `frente` con opacidad `alfa` sobre `fondo` (ambos opacos). */
function sobre(frente, alfa, fondo) {
  return frente.map((c, i) => alfa * c + (1 - alfa) * fondo[i]);
}

/** #rrggbb o rgba(r, g, b, a) → { rgb, alfa }. Revienta con lo demás. */
function colorDe(texto) {
  const hex = texto.match(/#([0-9a-f]{6})\b/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [n >> 16, (n >> 8) & 255, n & 255], alfa: 1 };
  }
  const rgba = texto.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/);
  assert.ok(rgba, `color irreconocible: ${texto}`);
  return {
    rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
    alfa: rgba[4] === undefined ? 1 : Number(rgba[4])
  };
}

/** Las variables --ytmpip-* de un bloque del CSS, por nombre. */
function variablesDe(selector) {
  const inicio = PIP_CSS.indexOf(selector + " {");
  assert.notStrictEqual(inicio, -1, `falta el bloque ${selector} en pip.css`);
  const bloque = PIP_CSS.slice(inicio, PIP_CSS.indexOf("\n}", inicio));
  const variables = {};
  for (const m of bloque.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    variables[m[1]] = m[2].trim();
  }
  return variables;
}

test("EL CONTRASTE DE LOS DOS TEMAS PASA WCAG AA, CON LAS CUENTAS HECHAS", () => {
  const raiz = variablesDe(":root");
  const claro = variablesDe("html.ytmpip-theme-light");

  // Premisa: el tema claro redefine todo lo que estas cuentas usan. Si a
  // alguien se le olvida una variable al tocar el tema, esto lo dice con
  // nombre y apellido en vez de heredar en silencio el color del oscuro.
  for (const nombre of ["ytmpip-bg", "ytmpip-text", "ytmpip-text-dim", "ytmpip-accent", "ytmpip-scrim"]) {
    assert.ok(raiz[nombre], `:root sin --${nombre}`);
    assert.ok(claro[nombre], `el tema claro no redefine --${nombre}`);
  }

  /*
   * La tinta fija del botón de reproducir: está escrita a mano en el CSS
   * (blanco sobre el acento en los dos temas) y se lee de ahí y no de una
   * copia, para que cambiarla allí cambie esta cuenta.
   */
  const bloqueBoton = PIP_CSS.slice(PIP_CSS.indexOf("#ytmpip-play-pause {"));
  const tintaBoton = colorDe(bloqueBoton.slice(0, bloqueBoton.indexOf("}")).match(/color:\s*([^;]+);/)[1]);

  for (const [nombre, tema, portadaExtrema] of [
    // El peor disco posible para cada tema: portada blanca pura contra el
    // tema oscuro, negra pura contra el claro.
    ["oscuro", Object.assign({}, raiz), [255, 255, 255]],
    ["claro", Object.assign({}, raiz, claro), [0, 0, 0]]
  ]) {
    const bg = colorDe(tema["ytmpip-bg"]).rgb;
    const texto = colorDe(tema["ytmpip-text"]).rgb;
    const tenue = colorDe(tema["ytmpip-text-dim"]).rgb;
    const acento = colorDe(tema["ytmpip-accent"]).rgb;

    // Texto corrido sobre el fondo del tema: AA pide 4.5.
    assert.ok(
      contraste(texto, bg) >= 4.5,
      `tema ${nombre}: texto/fondo = ${contraste(texto, bg).toFixed(2)} < 4.5`
    );
    assert.ok(
      contraste(tenue, bg) >= 4.5,
      `tema ${nombre}: texto tenue/fondo = ${contraste(tenue, bg).toFixed(2)} < 4.5`
    );

    // El acento es tinta de componentes (iconos activos, el botón grande),
    // no texto corrido: el umbral de WCAG 1.4.11 es 3.
    assert.ok(
      contraste(acento, bg) >= 3,
      `tema ${nombre}: acento/fondo = ${contraste(acento, bg).toFixed(2)} < 3`
    );
    assert.ok(
      contraste(tintaBoton.rgb, acento) >= 3,
      `tema ${nombre}: tinta del botón/acento = ${contraste(tintaBoton.rgb, acento).toFixed(2)} < 3`
    );

    /*
     * La promesa del velo («garantiza contraste del texto sea cual sea la
     * imagen», pip.html) puesta a prueba en su extremo inferior, que es
     * donde el degradado protege al texto del cuerpo: portada extrema
     * compuesta sobre el fondo con la opacidad de reposo (--ytmpip-fondo)
     * y el último tramo del velo encima.
     */
    const fondoPortada = Number(raiz["ytmpip-fondo"]);
    assert.ok(fondoPortada > 0 && fondoPortada < 1, "premisa: --ytmpip-fondo es una opacidad");
    const tramos = tema["ytmpip-scrim"].match(/rgba?\([^)]*\)/g);
    assert.ok(tramos && tramos.length >= 2, `el velo del tema ${nombre} perdió sus tramos`);
    const veloAbajo = colorDe(tramos[tramos.length - 1]);

    const conPortada = sobre(portadaExtrema, fondoPortada, bg);
    const bajoElVelo = sobre(veloAbajo.rgb, veloAbajo.alfa, conPortada);
    assert.ok(
      contraste(texto, bajoElVelo) >= 4.5,
      `tema ${nombre}: texto sobre el peor velo = ${contraste(texto, bajoElVelo).toFixed(2)} < 4.5`
    );
  }
});

/* ---------- El velo local de la cabecera ----------
 *
 * La prueba anterior vigila el extremo FUERTE del velo general (abajo,
 * donde vive el texto del cuerpo). La cabecera vive bajo el extremo débil,
 * y ahí las cuentas daban 4.20:1 en reposo y 2.76:1 con la letra en el
 * escenario (peor caso: portada blanca pura en tema oscuro). El arreglo
 * elegido —con la comparación de tools/comparacion-cabecera.html delante—
 * fue un velo local: estas tres pruebas vigilan que exista, que alcance
 * los números y que cumpla su pacto con la letra en grande.
 */

test("EL VELO LOCAL EXISTE, LLEGA A LOS BORDES Y NO ROBA CLICS", () => {
  const raiz = variablesDe(":root");
  const claro = variablesDe("html.ytmpip-theme-light");

  assert.ok(raiz["ytmpip-velo-cabecera"], ":root sin --ytmpip-velo-cabecera");
  assert.ok(claro["ytmpip-velo-cabecera"], "el tema claro no redefine el velo de la cabecera");
  assert.ok(raiz["ytmpip-relleno-arriba"] && raiz["ytmpip-relleno-lado"],
    "el relleno tiene que ser variable: el velo lo resta para llegar a los bordes");

  const inicio = PIP_CSS.indexOf(".ytmpip-header::before {");
  assert.notStrictEqual(inicio, -1, "falta el ::before del velo local en pip.css");
  const bloque = PIP_CSS.slice(inicio, PIP_CSS.indexOf("}", inicio));

  assert.ok(/background:\s*var\(--ytmpip-velo-cabecera\)/.test(bloque),
    "el velo tiene que pintarse con la variable del tema, no con un color fijo");
  assert.ok(/z-index:\s*-1/.test(bloque),
    "sin z-index -1 el velo taparía el texto que protege");
  assert.ok(/pointer-events:\s*none/.test(bloque),
    "sin pointer-events none el velo robaría los clics de la cabecera");
  assert.ok(/top:\s*calc\(-1 \* var\(--ytmpip-relleno-arriba\)\)/.test(bloque),
    "el desborde de arriba tiene que restar la variable del relleno");
  assert.ok(/left:\s*calc\(-1 \* var\(--ytmpip-relleno-lado\)\)/.test(bloque) &&
    /right:\s*calc\(-1 \* var\(--ytmpip-relleno-lado\)\)/.test(bloque),
    "el desborde lateral tiene que restar la variable del relleno");

  // La otra mitad del acople: el relleno del contenido usa LAS MISMAS
  // variables. Si alguien vuelve a escribirlo como número suelto, cambiar
  // el relleno dejaría una tira sin velo en el borde.
  const contenido = PIP_CSS.slice(
    PIP_CSS.indexOf(".ytmpip-content {"),
    PIP_CSS.indexOf("}", PIP_CSS.indexOf(".ytmpip-content {"))
  );
  assert.ok(
    /padding:\s*var\(--ytmpip-relleno-arriba\)\s+var\(--ytmpip-relleno-lado\)/.test(contenido),
    "el padding del contenido tiene que usar las variables que el velo resta"
  );
  const mini = variablesDe("#ytmpip-root.ytmpip-mini .ytmpip-content");
  assert.ok(mini["ytmpip-relleno-arriba"] && mini["ytmpip-relleno-lado"],
    "mini encoge el relleno: tiene que hacerlo vía variables o su velo quedará descuadrado");

  // El superpuesto ya tenía su propio velo (la banda de 42px del
  // ::before de .ytmpip-content): el local se apaga para no sumar dos.
  const enOverlay = PIP_CSS.indexOf("#ytmpip-root.ytmpip-overlay .ytmpip-header::before {");
  assert.notStrictEqual(enOverlay, -1, "falta la excepción del superpuesto");
  assert.ok(
    /display:\s*none/.test(PIP_CSS.slice(enOverlay, PIP_CSS.indexOf("}", enOverlay))),
    "sobre el video ya hay banda propia: el velo local tiene que apagarse"
  );
});

test("EL ESTADO BAJO EL VELO LOCAL PASA AA EN LOS OCHO PEORES CASOS", () => {
  /*
   * Las cuentas de la maqueta, ya sin manos: fondo del tema <- portada
   * extrema a la opacidad del modo <- parada DÉBIL (la de arriba) del velo
   * general <- velo local. Sobre esa superficie tienen que leerse el gris
   * del estado Y el acento de «Sin conexión» —que es justamente el estado
   * que más necesita leerse—, en reposo y con la letra en el escenario.
   */
  const raiz = variablesDe(":root");
  const claro = variablesDe("html.ytmpip-theme-light");
  const fondoReposo = Number(raiz["ytmpip-fondo"]);
  const fondoEscenario = Number(
    variablesDe("#ytmpip-root.ytmpip-lyrics-stage")["ytmpip-fondo"]
  );
  assert.ok(fondoEscenario > fondoReposo,
    "premisa: el escenario enseña MÁS portada; si esto cambia, el peor caso es otro");

  for (const [nombre, tema, portadaExtrema] of [
    ["oscuro", Object.assign({}, raiz), [255, 255, 255]],
    ["claro", Object.assign({}, raiz, claro), [0, 0, 0]]
  ]) {
    const bg = colorDe(tema["ytmpip-bg"]).rgb;
    const tenue = colorDe(tema["ytmpip-text-dim"]).rgb;
    const acento = colorDe(tema["ytmpip-accent"]).rgb;
    const veloArriba = colorDe(tema["ytmpip-scrim"].match(/rgba?\([^)]*\)/g)[0]);
    const veloLocal = colorDe(tema["ytmpip-velo-cabecera"].match(/rgba?\([^)]*\)/g)[0]);

    for (const [modo, fondoPortada] of [["reposo", fondoReposo], ["escenario", fondoEscenario]]) {
      const conPortada = sobre(portadaExtrema, fondoPortada, bg);
      const bajoElGeneral = sobre(veloArriba.rgb, veloArriba.alfa, conPortada);
      const cabecera = sobre(veloLocal.rgb, veloLocal.alfa, bajoElGeneral);

      assert.ok(
        contraste(tenue, cabecera) >= 4.5,
        `tema ${nombre}, ${modo}: estado = ${contraste(tenue, cabecera).toFixed(2)} < 4.5`
      );
      assert.ok(
        contraste(acento, cabecera) >= 4.5,
        `tema ${nombre}, ${modo}: «sin conexión» = ${contraste(acento, cabecera).toFixed(2)} < 4.5`
      );
    }
  }
});

test("EL VELO MUERE ANTES DEL TITULO", () => {
  /*
   * El pacto con la letra en grande: el velo es sólido mientras hay texto
   * de cabecera y se desvanece SOLO en la cola que asoma por debajo, para
   * que la portada se siga viendo del título hacia abajo. Si el degradado
   * acabara opaco, la banda taparía media ventana; si la cola y el
   * desborde de abajo no midieran lo mismo, el desvanecido caería sobre el
   * texto y las cuentas de la prueba anterior mentirían.
   */
  const raiz = variablesDe(":root");
  const claro = variablesDe("html.ytmpip-theme-light");

  const colas = [];
  for (const [nombre, velo] of [
    ["oscuro", raiz["ytmpip-velo-cabecera"]],
    ["claro", claro["ytmpip-velo-cabecera"]]
  ]) {
    const tramos = velo.match(/rgba?\([^)]*\)/g);
    assert.ok(tramos && tramos.length >= 2, `el velo del tema ${nombre} perdió sus tramos`);
    assert.ok(colorDe(tramos[0]).alfa > 0, `tema ${nombre}: un velo transparente no vela nada`);
    assert.strictEqual(
      colorDe(tramos[tramos.length - 1]).alfa, 0,
      `tema ${nombre}: la última parada tiene que ser transparente o la banda no muere nunca`
    );
    const cola = velo.match(/calc\(100% - (\d+)px\)/);
    assert.ok(cola, `tema ${nombre}: el tramo sólido tiene que medirse desde abajo, en píxeles`);
    colas.push([nombre, Number(cola[1])]);
  }

  const inicio = PIP_CSS.indexOf(".ytmpip-header::before {");
  const desborde = PIP_CSS.slice(inicio, PIP_CSS.indexOf("}", inicio)).match(/bottom:\s*-(\d+)px/);
  assert.ok(desborde, "el ::before tiene que asomar por debajo con un desborde en píxeles");
  for (const [nombre, cola] of colas) {
    assert.strictEqual(
      cola, Number(desborde[1]),
      `tema ${nombre}: la cola del degradado (${cola}px) y el desborde (${desborde[1]}px) tienen que medir lo mismo: el desvanecido vive entero en lo que asoma`
    );
  }
});
