/*
 * Pruebas de los ICONOS de la ventana flotante (src/shared/iconos.js).
 *
 * LA PETICION, LITERAL: "podemos cambiar los iconos usados por ejemplo de
 * adelantar 10 segundos etc, que se vea mas profesional y limpio".
 *
 * "Profesional y limpio" no se puede afirmar en una prueba —eso se mira, y
 * se mira en tools/vista-previa.html— pero SI se puede fijar lo que lo
 * sostiene, que es lo que se rompe solo con el tiempo:
 *
 *   - que ningun boton se quede sin dibujo (un `data-ico` mal escrito en el
 *     HTML no lo cazaria nadie: el boton saldria vacio y ya),
 *   - que los dibujos sean todos de la MISMA rejilla, que era el tercer
 *     defecto de los emoji y el que mas se nota de lejos,
 *   - que el dibujo SUSTITUYA al emoji en vez de acompañarlo,
 *   - y que los segundos sigan estando donde se leen.
 *
 * Lo que NO se prueba aqui, a proposito: el tamaño. Los iconos se miden en
 * `em` desde .ytmpip-ico y jsdom no maqueta, asi que cualquier assert sobre
 * pixeles seria inventado. Esa pregunta la responde la vista previa.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, RAIZ } = require("../helpers/entorno.js");

const NS_SVG = "http://www.w3.org/2000/svg";

/** Ventana con solo el modulo de iconos dentro: no necesita nada mas. */
function conIconos() {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/iconos.js");
  return win;
}

/** El HTML de un archivo del proyecto, ya parseado en un documento aparte. */
function documentoDe(win, rutaRelativa) {
  const doc = win.document.implementation.createHTMLDocument("prueba");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, rutaRelativa), "utf8");
  return doc;
}

/* ==================================================================
 * 1. Ningun boton se queda sin dibujo
 * ================================================================== */

/*
 * LA LISTA DE BOTONES VIVE EN EL HTML, no aqui. Por eso esta prueba la lee
 * de los archivos en vez de repetirla: escribir aqui los trece nombres
 * seria tener la lista dos veces, y el dia que alguien añada un boton la
 * prueba seguiria en verde sin haberlo mirado nunca.
 */
for (const archivo of ["src/pip/pip.html", "src/popup/popup.html"]) {
  test(`todo data-ico de ${archivo} tiene dibujo`, () => {
    const win = conIconos();
    const doc = documentoDe(win, archivo);
    const pedidos = [...doc.querySelectorAll("[data-ico]")].map((b) => b.getAttribute("data-ico"));

    assert.ok(pedidos.length > 0, "el archivo deberia pedir algun icono");
    for (const nombre of pedidos) {
      assert.ok(
        win.YTMPip.Iconos.NOMBRES.includes(nombre),
        `${archivo} pide el icono "${nombre}" y no existe en iconos.js`
      );
    }
  });
}

test("los nombres que pinta pip.js cuando cambia el estado tambien existen", () => {
  /*
   * Los dibujos que dependen del estado —pausar, corazon lleno, mudo,
   * repetir-una, video, letra— NO estan en ningun `data-ico`: los pone
   * pip.js al vuelo. Se leen del propio codigo fuente para no volver a
   * copiar la lista; si mañana alguien renombra un icono y se olvida de un
   * sitio, esto se pone rojo.
   */
  const win = conIconos();
  const fuente = fs.readFileSync(path.join(RAIZ, "src/pip/pip.js"), "utf8");
  const lineas = fuente
    .split("\n")
    .filter((l) => l.includes("Iconos.poner") || l.includes("ICONO_REPETIR ="));
  const usados = lineas.flatMap((l) => [...l.matchAll(/"([a-z][a-z-]*)"/g)].map((m) => m[1]));

  assert.ok(usados.length >= 8, `esperaba varios nombres de icono, encontre ${usados.length}`);
  for (const nombre of usados) {
    assert.ok(win.YTMPip.Iconos.NOMBRES.includes(nombre), `pip.js pinta "${nombre}" y no existe`);
  }
});

/* ==================================================================
 * 2. Todos del mismo juego
 * ================================================================== */

test("todos los dibujos comparten rejilla y estan completos", () => {
  const win = conIconos();
  for (const nombre of win.YTMPip.Iconos.NOMBRES) {
    const svg = win.YTMPip.Iconos.crear(win.document, nombre);
    assert.ok(svg, `${nombre} no se pudo crear`);
    /*
     * La misma rejilla para todos es lo que da el mismo peso visual, que
     * es justo lo que los emoji no podian dar: ⏪ y 🔀 los dibujo gente
     * distinta. Un icono con otro viewBox se veria mas grande o mas
     * pequeño que sus vecinos sin que nadie hubiera tocado el CSS.
     */
    assert.strictEqual(svg.getAttribute("viewBox"), "0 0 24 24", `${nombre} usa otra rejilla`);

    const trazos = svg.querySelectorAll("path");
    assert.ok(trazos.length > 0, `${nombre} no tiene ni un trazo`);
    for (const p of trazos) {
      assert.ok((p.getAttribute("d") || "").length > 10, `${nombre} tiene un trazo vacio`);
    }
  }
});

test("el <svg> se crea en el espacio de nombres del SVG", () => {
  /*
   * No es puntilloso: un createElement("svg") a secas da un elemento HTML
   * inerte, que se añade al DOM sin quejarse y NO PINTA NADA. El sintoma
   * seria "los botones salen en blanco", que es indistinguible de un fallo
   * de CSS y cuesta media tarde. Por eso se fija aqui.
   */
  const win = conIconos();
  const svg = win.YTMPip.Iconos.crear(win.document, "reproducir");
  assert.strictEqual(svg.namespaceURI, NS_SVG);
  assert.strictEqual(svg.querySelector("path").namespaceURI, NS_SVG);
});

test("el dibujo es decoracion y no se anuncia dos veces", () => {
  // Lo que el boton significa ya lo dice su aria-label. Sin esto un lector
  // de pantalla leeria el grafico ademas de la etiqueta.
  const win = conIconos();
  const svg = win.YTMPip.Iconos.crear(win.document, "cerrar");
  assert.strictEqual(svg.getAttribute("aria-hidden"), "true");
  assert.strictEqual(svg.getAttribute("focusable"), "false");
});

/* ==================================================================
 * 3. El dibujo sustituye al emoji
 * ================================================================== */

test("al pintar, el emoji del HTML desaparece", () => {
  /*
   * El fallo que evita: con innerHTML+= o con appendChild, el icono nuevo
   * saldria AL LADO del emoji viejo y cada boton mostraria las dos cosas.
   */
  const win = conIconos();
  const doc = documentoDe(win, "src/pip/pip.html");
  const boton = doc.getElementById("ytmpip-close");
  assert.strictEqual(boton.textContent.trim(), "✕", "de partida el boton lleva su emoji de reserva");

  assert.strictEqual(win.YTMPip.Iconos.poner(boton, "cerrar"), true);

  assert.strictEqual(boton.textContent.trim(), "", "no puede quedar texto del emoji");
  assert.strictEqual(boton.childElementCount, 1, "un solo hijo: el dibujo");
  assert.strictEqual(boton.firstElementChild.namespaceURI, NS_SVG);
});

test("pintarTodos deja pintado el documento entero y dice cuantos", () => {
  const win = conIconos();
  const doc = documentoDe(win, "src/pip/pip.html");
  const cuantos = doc.querySelectorAll("[data-ico]").length;

  assert.strictEqual(win.YTMPip.Iconos.pintarTodos(doc), cuantos);
  assert.strictEqual(doc.querySelectorAll("[data-ico] > svg").length, cuantos);
});

test("el boton 'Aa' se queda como estaba", () => {
  /*
   * "Aa" no es un emoji que se olvidara de convertir: es la etiqueta que
   * se eligio para el boton que apaga el TEXTO, y dos letras lo dicen
   * mejor que un pictograma. Se fija aqui para que un futuro "pasemos
   * todos los botones a iconos" tenga que discutirlo en vez de arrasarlo.
   */
  const win = conIconos();
  const doc = documentoDe(win, "src/pip/pip.html");
  win.YTMPip.Iconos.pintarTodos(doc);

  const boton = doc.getElementById("ytmpip-clean-toggle");
  assert.strictEqual(boton.textContent.trim(), "Aa");
  assert.strictEqual(boton.querySelector("svg"), null);
});

/* ==================================================================
 * 4. Un nombre que no existe
 * ================================================================== */

test("un icono desconocido avisa y deja el boton intacto", () => {
  /*
   * Se devuelve null en vez de un dibujo de reserva a proposito: un nombre
   * mal escrito tiene que dejar el boton como estaba —con su emoji— y
   * avisar, no colar un pictograma cualquiera que pase por bueno y se
   * quede ahi años.
   */
  const win = conIconos();
  const avisos = [];
  win.console.warn = (m) => avisos.push(String(m));

  const doc = documentoDe(win, "src/pip/pip.html");
  const boton = doc.getElementById("ytmpip-close");

  assert.strictEqual(win.YTMPip.Iconos.crear(win.document, "no-existe"), null);
  assert.strictEqual(win.YTMPip.Iconos.poner(boton, "no-existe"), false);

  assert.strictEqual(boton.textContent.trim(), "✕", "el boton no se toca");
  assert.strictEqual(avisos.length, 2);
  assert.match(avisos[0], /no-existe/);
});

test("poner() sobre nada no revienta", () => {
  const win = conIconos();
  assert.strictEqual(win.YTMPip.Iconos.poner(null, "cerrar"), false);
  assert.strictEqual(win.YTMPip.Iconos.pintarTodos(null), 0);
});

/* ==================================================================
 * 5. No se repinta lo que ya esta puesto
 * ================================================================== */

test("repetir el mismo icono no reconstruye el dibujo", () => {
  /*
   * Importa porque render() pasa por estas llamadas varias veces por
   * segundo con el mismo estado. Sin la salida rapida se tiraban unos
   * cuantos <svg> a la basura cada segundo para poner otros identicos.
   *
   * Se comprueba por IDENTIDAD del nodo, que es la unica forma de
   * distinguir "no lo toco" de "lo rehizo igual".
   */
  const win = conIconos();
  const doc = documentoDe(win, "src/pip/pip.html");
  const boton = doc.getElementById("ytmpip-play-pause");

  win.YTMPip.Iconos.poner(boton, "reproducir");
  const primero = boton.firstElementChild;
  win.YTMPip.Iconos.poner(boton, "reproducir");

  assert.strictEqual(boton.firstElementChild, primero, "era el mismo dibujo: no habia que rehacerlo");

  win.YTMPip.Iconos.poner(boton, "pausar");
  assert.notStrictEqual(boton.firstElementChild, primero, "otro dibujo si tiene que sustituirlo");
  assert.strictEqual(boton.dataset.ico, "pausar");
});

test("el primer pintado sustituye el emoji aunque el data-ico ya coincida", () => {
  /*
   * EL CASO QUE SE ESCAPA. En pip.html el `data-ico` viene escrito de
   * antemano y el emoji todavia esta de contenido. Si la salida rapida
   * mirase solo el atributo, ese primer pintado —justo el que quita el
   * emoji— seria el unico que no se haria, y los botones se quedarian con
   * el emoji para siempre.
   */
  const win = conIconos();
  const doc = documentoDe(win, "src/pip/pip.html");
  const boton = doc.getElementById("ytmpip-play-pause");
  assert.strictEqual(boton.dataset.ico, "reproducir", "el HTML ya trae el nombre escrito");

  win.YTMPip.Iconos.poner(boton, "reproducir");

  assert.ok(boton.querySelector("svg"), "tiene que haber pintado igualmente");
  assert.strictEqual(boton.textContent.trim(), "");
});

/* ==================================================================
 * 6. En la ventana de verdad
 * ================================================================== */

function ventanaMontada() {
  const { win } = crearEntorno(leerFixture("controles-completos.html"));
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
  win.YTMPip.PipView.__bancoDePruebas.montar(win, doc);
  return { win, doc, PipView: win.YTMPip.PipView };
}

function estado(extra) {
  return Object.assign(
    { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} },
    extra
  );
}

test("montar la ventana deja los botones con dibujo y sin emoji", () => {
  const v = ventanaMontada();
  const conDibujo = v.doc.querySelectorAll("[data-ico] > svg").length;
  assert.strictEqual(conDibujo, v.doc.querySelectorAll("[data-ico]").length);
});

test("reproducir y pausar se distinguen por el dibujo", () => {
  const v = ventanaMontada();
  const boton = v.doc.getElementById("ytmpip-play-pause");

  v.PipView.onStateUpdate(estado({ playing: true }));
  assert.strictEqual(boton.dataset.ico, "pausar", "sonando, el boton ofrece pausar");

  v.PipView.onStateUpdate(estado({ playing: false }));
  assert.strictEqual(boton.dataset.ico, "reproducir");
  assert.ok(boton.querySelector("svg"), "y sigue siendo un dibujo, no un emoji");
});

test("LA PETICION: los segundos de adelantar siguen donde se leen", () => {
  /*
   * El icono clasico de saltar lleva el numero dentro del arco. Aqui no,
   * y no es un olvido: estos botones bajan a 24 px en mini y la cifra
   * saldria a unos cinco pixeles.
   *
   * Que se compruebe: que el dibujo NO intenta escribir el numero (no hay
   * <text> dentro) y que los segundos siguen anunciados en la etiqueta,
   * que ademas es la que sabe cuantos son de verdad.
   */
  const v = ventanaMontada();
  for (const id of ["ytmpip-seek-forward", "ytmpip-seek-backward"]) {
    const boton = v.doc.getElementById(id);
    assert.ok(boton.querySelector("svg"), `${id} tiene que llevar dibujo`);
    assert.strictEqual(boton.querySelector("text"), null, `${id} no debe llevar el numero dentro`);
    assert.match(boton.getAttribute("aria-label"), /\d+ segundos/, `${id} tiene que decir cuantos`);
  }
});
