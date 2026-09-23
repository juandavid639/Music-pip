/*
 * LOS MANDOS DEL ECUALIZADOR EN LA PAGINA DE OPCIONES.
 *
 * El nucleo (shared/ecualizador.js) ya esta probado y el cable
 * (content-script.js) tambien. Lo que falta cubrir es la traduccion entre
 * los dos: unos mandos que enseñan lo guardado y guardan lo elegido.
 *
 * Es una traduccion con mas trampas de las que parece, y todas SILENCIOSAS:
 *
 *   1. La pagina y las constantes se desincronizan. El HTML escribe cinco
 *      deslizadores y una lista de presets a mano; constants.js define las
 *      bandas y los presets. El dia que se añada una banda, la pagina
 *      seguira funcionando perfectamente ofreciendo cuatro de cinco.
 *   2. Un mando que no se deja mover. `pintarEcualizador` repinta los cinco
 *      deslizadores con lo que diga el desplegable, asi que si mover uno no
 *      cambia antes el desplegable a "A mi gusto", el mando vuelve solo a su
 *      sitio en cuanto se suelta.
 *   3. Un preset guardado por sus numeros. Un preset se guarda POR SU NOMBRE
 *      (ver el comentario de `normalizar`); guardarlo como "8,3,0,0,1"
 *      funciona igual hoy y deja de seguir al preset para siempre.
 *   4. Los mandos visibles con el ecualizador apagado. Tocarlos cruzaria la
 *      puerta de un solo sentido de createMediaElementSource en la maquina
 *      de alguien que solo estaba mirando.
 *
 * Ninguna de las cuatro da un error en consola. Todas se ven mirando.
 *
 * Se carga options.html DE VERDAD —no un fixture— porque tres de las cuatro
 * trampas viven justo en la costura entre ese archivo y options.js.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { cargar, plano, i18nFalso, RAIZ } = require("../helpers/entorno");

const OPCIONES_HTML = path.join(RAIZ, "src/options/options.html");

/*
 * Abre la pagina de opciones con un storage de mentira ya poblado.
 *
 * El storage falso llama a los callbacks EN EL ACTO, no en otro turno. El
 * chrome de verdad es asincrono, pero aqui la asincronia no aporta nada que
 * probar y si quita: cada `dispatchEvent` tendria que ir seguido de una
 * espera, y una espera mal medida convierte un fallo real en una prueba
 * intermitente.
 */
/*
 * `sabotaje` corre CON LAS CONSTANTES YA CARGADAS Y options.js TODAVIA NO.
 *
 * Es la unica rendija por la que se puede probar que pasa cuando falta el
 * nombre de un preset, y hace falta una rendija porque hoy no falta ninguno:
 * la lista de EQUALIZER_PRESET_LABELS esta completa, y el respaldo que enseña
 * la clave en bruto es precisamente codigo para un dia que aun no ha llegado.
 * Sin esto, ese respaldo se puede borrar entero y no se pone roja ni una
 * prueba —que es exactamente lo que dijo el mutador—.
 */
function abrirOpciones(guardado, sabotaje) {
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"), {
    // Igual que en helpers/entorno.js: la ventana necesita contexto de
    // ejecucion propio, pero los <script> del HTML NO se ejecutan solos
    // (sus rutas son relativas y no hay servidor). Los inyecta cargar().
    runScripts: "outside-only"
  });
  const win = dom.window;
  win.self = win;

  const almacen = Object.assign({}, guardado);
  const avisos = [];
  win.console.warn = function (...partes) {
    avisos.push(partes.join(" "));
  };

  /*
   * `fetch` rechaza a proposito. Sirve para leer el acento del tema desde
   * pip.css, que es otra funcion con sus propios motivos y aqui solo seria
   * ruido; options.js ya se guarda de que falle (`.catch` + aviso). El
   * aviso que suelta es justo por lo que las comprobaciones de mas abajo
   * filtran por la palabra "ecualizador" en vez de exigir cero avisos.
   */
  win.fetch = function () {
    return Promise.reject(new Error("sin red en las pruebas"));
  };

  win.chrome = {
    // El catalogo español de verdad, como en chromeFalso: las pruebas de
    // textos («no hay ninguna banda subida», «Guardado.») afirman lo que
    // el usuario lee, y eso ahora sale de _locales/es/messages.json.
    i18n: i18nFalso({}),
    runtime: { getURL: (p) => "chrome-extension://id-de-prueba/" + p },
    storage: {
      local: {
        get(_claves, cb) {
          cb(Object.assign({}, almacen));
        },
        set(valores, cb) {
          Object.assign(almacen, valores);
          if (cb) cb();
        }
      }
    }
  };

  // jsdom no trae canvas. `pintarVistaPrevia` ya se guarda de un contexto
  // nulo; sin este apaño jsdom escupe un "not implemented" por la consola
  // virtual que no dice nada de esta prueba.
  const lienzo = win.document.getElementById("spectrumPalettePreview");
  if (lienzo) lienzo.getContext = () => null;

  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js"
  );
  if (sabotaje) sabotaje(win);
  cargar(win, "src/options/options.js");

  const doc = win.document;
  const bandas = [...doc.querySelectorAll("#equalizerBands input[type=range]")];

  return {
    win,
    doc,
    almacen,
    avisos,
    presetDe: () => doc.getElementById("equalizerPreset"),
    bandas,
    /** Los numeros que enseñan los cinco deslizadores. */
    dbs: () => bandas.map((b) => Number(b.value)),
    /** Las etiquetas visibles, en orden. */
    etiquetas: () =>
      bandas.map((b) => {
        const l = doc.getElementById(b.id + "Label");
        return l ? l.textContent : "";
      }),
    salidas: () =>
      bandas.map((b) => {
        const o = doc.getElementById(b.id + "Value");
        return o ? o.textContent : "";
      }),
    escondidos: () => doc.getElementById("equalizerBands").hidden,
    preamp: () => doc.getElementById("equalizerPreamp").textContent,
    /** Lo que haria el usuario: elegir del desplegable. */
    elegir(valor) {
      const select = doc.getElementById("equalizerPreset");
      select.value = valor;
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    },
    /** Arrastrar un deslizador (`input`) y soltarlo (`change`). */
    mover(i, db, soltar = true) {
      bandas[i].value = String(db);
      bandas[i].dispatchEvent(new win.Event("input", { bubbles: true }));
      if (soltar) bandas[i].dispatchEvent(new win.Event("change", { bubbles: true }));
    }
  };
}

/* ------------------------------------------------------------------ *
 * 1. LA PAGINA Y LAS CONSTANTES CUENTAN LO MISMO
 * ------------------------------------------------------------------ */

test("hay un deslizador por banda, ni uno mas ni uno menos", () => {
  const pagina = abrirOpciones({});
  const { EQUALIZER_BANDS } = pagina.win.YTMPip.CONSTANTS;
  assert.equal(
    pagina.bandas.length,
    EQUALIZER_BANDS.length,
    "options.html y EQUALIZER_BANDS no cuentan lo mismo: una banda sin " +
      "deslizador no se puede tocar nunca y no da ningun error."
  );
});

test("el desplegable ofrece todos los presets y ninguno inventado", () => {
  const pagina = abrirOpciones({});
  const { EQUALIZER_PRESETS } = pagina.win.YTMPip.CONSTANTS;
  const enLaPagina = [...pagina.presetDe().options]
    .map((o) => o.value)
    .filter((v) => v !== "off" && v !== "__manual");
  assert.deepStrictEqual(
    enLaPagina.slice().sort(),
    Object.keys(EQUALIZER_PRESETS).slice().sort()
  );
});

test("cada preset del desplegable se lee con su nombre, y sale de constants.js", () => {
  const pagina = abrirOpciones({});
  const { EQUALIZER_PRESET_LABELS } = pagina.win.YTMPip.CONSTANTS;

  for (const opcion of pagina.presetDe().options) {
    if (opcion.value === "off" || opcion.value === "__manual") continue;
    assert.equal(
      opcion.textContent,
      EQUALIZER_PRESET_LABELS[opcion.value],
      "la opcion «" + opcion.value + "» no dice lo que dice constants.js"
    );
    /*
     * Y la premisa, sin la cual lo de arriba es una comparacion de dos vacios:
     * options.html tiene los <option> A PROPOSITO sin texto, para que el nombre
     * viva en un solo sitio y el boton de la ventana pueda leerlo. Si el bucle
     * que los rellena desapareciera, `textContent` y la etiqueta serian ambos
     * "" y esta prueba pasaria tan contenta.
     */
    assert.ok(opcion.textContent.trim(), "la opcion «" + opcion.value + "» sale muda");
  }
});

test("UN PRESET SIN NOMBRE ENSEÑA SU CLAVE, no un hueco en blanco", () => {
  /*
   * El dia que alguien añada un preset a EQUALIZER_PRESETS y se olvide de
   * ponerle nombre, el desplegable tiene que ofrecer una opcion fea pero
   * elegible —"nocturno"— y no una fila vacia que no se puede ni nombrar al
   * pedir ayuda. Un hueco en blanco es un preset inalcanzable en la practica.
   */
  const pagina = abrirOpciones({}, (win) => {
    delete win.YTMPip.CONSTANTS.EQUALIZER_PRESET_LABELS.nocturno;
    /*
     * Y TAMBIEN se silencia el catalogo para esa clave. Un preset recien
     * añadido no estaria ni en EQUALIZER_PRESET_LABELS ni en
     * _locales/es/messages.json; quitar solo la constante dejaria al
     * catalogo nombrandolo («Nocturno») y esta prueba ya no estaria
     * simulando el olvido que dice simular.
     */
    const real = win.chrome.i18n.getMessage;
    win.chrome.i18n.getMessage = (clave, subs) =>
      clave === "preset_nocturno" ? "" : real(clave, subs);
  });

  const huerfano = [...pagina.presetDe().options].find((o) => o.value === "nocturno");
  assert.ok(huerfano, "premisa: el <option> de «nocturno» sigue en la pagina");
  assert.equal(huerfano.textContent, "nocturno");

  // Y ademas se queja, para que el olvido se arregle en vez de vivir ahi.
  const quejas = pagina.avisos.filter((a) => /nocturno/.test(a));
  assert.equal(quejas.length, 1, "no avisa de que falta el nombre: " + pagina.avisos.join(" | "));
});

test("la pagina no se queja de si misma al abrirse", () => {
  const pagina = abrirOpciones({});
  const delEcualizador = pagina.avisos.filter((a) => /ecualizador/i.test(a));
  assert.deepStrictEqual(delEcualizador, []);
});

test("el rango de los deslizadores sale de las constantes, no copiado en el HTML", () => {
  const pagina = abrirOpciones({});
  const { EQUALIZER_LIMITS } = pagina.win.YTMPip.CONSTANTS;

  for (const banda of pagina.bandas) {
    assert.equal(banda.min, String(EQUALIZER_LIMITS.GAIN_MIN), banda.id);
    assert.equal(banda.max, String(EQUALIZER_LIMITS.GAIN_MAX), banda.id);
    assert.equal(banda.step, String(EQUALIZER_LIMITS.GAIN_STEP), banda.id);
  }

  /*
   * Y la otra mitad, que es la que de verdad se rompe con el tiempo: que
   * esos numeros NO esten ademas escritos en el HTML. Con `min="-12"` en la
   * etiqueta la prueba de arriba pasaria igual el dia que GAIN_MIN bajara a
   * -15, y la pagina ofreceria un rango que el nucleo recorta en silencio.
   */
  const fuente = fs.readFileSync(OPCIONES_HTML, "utf8");
  const etiquetas = fuente.match(/<input id="equalizerBand\d"[^>]*>/g) || [];
  assert.equal(etiquetas.length, pagina.bandas.length);
  for (const etiqueta of etiquetas) {
    assert.ok(
      !/\b(min|max|step)=/.test(etiqueta),
      "el rango esta escrito tambien en options.html: " + etiqueta
    );
  }
});

test("cada deslizador dice a que suena y a que frecuencia manda", () => {
  const pagina = abrirOpciones({});
  const { EQUALIZER_BANDS } = pagina.win.YTMPip.CONSTANTS;
  const textos = pagina.etiquetas();

  EQUALIZER_BANDS.forEach((banda, i) => {
    assert.ok(textos[i].includes(banda.etiqueta), "falta el nombre en " + textos[i]);
    const hz = banda.hz >= 1000 ? banda.hz / 1000 + " kHz" : banda.hz + " Hz";
    assert.ok(textos[i].includes(hz), "falta la frecuencia en " + textos[i]);
  });

  // "Aire · 12000 Hz" seria tecnicamente correcto y se lee fatal.
  assert.equal(textos[textos.length - 1], "Aire · 12 kHz");
});

test("ninguna regla del <style> apunta a una clase que no existe", () => {
  /*
   * LO QUE ESTA PRUEBA NO HACE, primero: no comprueba que los mandos se
   * VEAN bien. jsdom no calcula estilos, asi que un `display: flex` mal
   * puesto pasaria por aqui sin despeinarse; que los cinco deslizadores se
   * lean en fila esta comprobado a ojo y solo a ojo.
   *
   * Lo que si caza es lo unico de la maquetacion que se puede comprobar
   * gratis y falla en silencio: una regla escrita para una clase que la
   * pagina no usa. `.ytmpip-banda` frente a `.ytmpip-bandas` es una `s`, y
   * el resultado de equivocarse no es un error sino unos mandos con el
   * aspecto de fabrica, que es justo lo que ya se veia antes de escribir
   * el CSS. Se comprueba la hoja ENTERA y no solo lo del ecualizador: la
   * regla vale igual para el vecino.
   */
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"));
  const doc = dom.window.document;
  const css = doc.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");

  /*
   * ESTA PRUEBA TUVO TRES FALSOS POSITIVOS y los tres se arreglan aqui, no
   * quitando reglas del CSS ni añadiendo excepciones por nombre.
   *
   * 1. LOS PSEUDOELEMENTOS. `querySelectorAll(".x::before")` devuelve cero
   *    SIEMPRE, exista `.x` o no: un ::before no es un nodo del documento.
   *    Comparar contra cero era, para esos selectores, preguntar otra cosa.
   *    Se le quita el `::loquesea` y se comprueba el elemento que lo lleva,
   *    que es lo unico que esta prueba sabe comprobar y sigue cazando la
   *    errata de la `s` para la que se escribio.
   *
   * 2. LO QUE DEPENDE DEL ESTADO. Aqui ponia que "al abrir la pagina en frio
   *    hay de todos, asi que no hace falta apartar ninguno", y dejo de ser
   *    verdad en cuanto la explicacion larga se metio en un <details>: nace
   *    cerrado, asi que `[open]` no casaba con nada. La respuesta no es
   *    perdonar el selector —entonces un `[opne]` mal escrito pasaria— sino
   *    PONER LA PAGINA EN ESE ESTADO. Se abren todos los <details> y se
   *    comprueba con ellos abiertos, que es como se ven cuando alguien mira
   *    lo que hay dentro.
   *
   * 3. LO QUE DEPENDE DEL RATON. `:hover`, `:focus-visible` y compañia no
   *    casan JAMAS con nada en un documento que nadie esta tocando, igual que
   *    los ::before del punto 1, asi que compararlos contra cero volvia a ser
   *    preguntar otra cosa: `.ytmpip-tarjeta:hover` se habria denunciado como
   *    huerfana teniendo la clase escrita cuatro veces en la pagina. Se le
   *    quita el estado y se comprueba el elemento que lo lleva, que sigue
   *    cazando la errata de la `s`, que es para lo que esta la prueba.
   *
   *    Se quitan SOLO los estados de interaccion, uno a uno y por su nombre.
   *    `:first-of-type`, `:last-child` o `:empty` no se tocan: esos si casan
   *    en un documento quieto, y ahi la pregunta sigue teniendo sentido —de
   *    hecho `.ytmpip-fila:first-of-type` estuvo escrito un rato y decia una
   *    mentira que solo se ve mirando la pagina, no aqui—.
   */
  for (const det of doc.querySelectorAll("details")) det.open = true;

  /*
   * LAS LARGAS PRIMERO, que es lo unico delicado de esta linea y ya se ha
   * pagado una vez: con `focus` antes que `focus-visible`, `:focus-visible`
   * se quedaba en `-visible` —hay frontera de palabra entre la `s` y el
   * guion— y `select:focus-visible` salia buscado como `select-visible`, o
   * sea denunciado como huerfano. La alternancia de una expresion regular
   * coge la PRIMERA que casa, no la mas larga.
   */
  const ESTADOS = /:(focus-visible|focus-within|focus|hover|active|disabled|checked)\b/g;

  const huerfanas = [];
  const patron = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = patron.exec(css)) !== null) {
    for (const sel of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      const buscable = sel.replace(/::[a-z-]+/g, "").replace(ESTADOS, "");
      if (doc.querySelectorAll(buscable).length === 0) huerfanas.push(sel);
    }
  }
  assert.deepStrictEqual(huerfanas, [], "reglas que no pintan nada");
});

test("cada banda trae sus tres piezas: nombre, mando y numero", () => {
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"));
  const doc = dom.window.document;
  const filas = doc.querySelectorAll(".ytmpip-banda");
  assert.ok(filas.length > 0);
  for (const fila of filas) {
    assert.equal(fila.querySelectorAll("label").length, 1);
    assert.equal(fila.querySelectorAll("input[type=range]").length, 1);
    assert.equal(
      fila.querySelectorAll("output").length,
      1,
      "sin el <output> el mando no dice cuantos decibelios lleva"
    );
  }
});

test("LO QUE SE ESCONDE ES LA FILA ENTERA, no el mando dentro de su fila", () => {
  /*
   * DOS CAMPOS DE ESTA PAGINA APARECEN Y DESAPARECEN —«cuantas barras» y «tu
   * color»— y options.js los esconde por su id, que es lo unico que conoce:
   * pone `hidden` en la etiqueta y en el campo. Mientras la pagina fue una
   * columna de etiquetas y mandos sueltos eso bastaba.
   *
   * Con las filas ya no. Si la etiqueta y el campo viven DENTRO de un
   * contenedor de fila, esconderlos deja la fila puesta: su raya de arriba,
   * su relleno y su hueco separando nada. No es un error de nadie, no sale
   * por consola y solo se ve mirando la pagina con la paleta elegida.
   *
   * La solucion fue que la fila SEA la etiqueta —un <label> puede contener su
   * propio campo— y lo que se comprueba aqui es justo eso, porque es lo que
   * un futuro «voy a dejar todas las filas igual» desharia sin enterarse.
   */
  const dom = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8"));
  const doc = dom.window.document;

  for (const [etiqueta, campo] of [
    ["spectrumBarsCountLabel", "spectrumBarsCount"],
    ["spectrumColorLabel", "spectrumColor"]
  ]) {
    const el = doc.getElementById(etiqueta);
    assert.ok(el, "falta " + etiqueta);
    assert.ok(
      el.classList.contains("ytmpip-fila"),
      etiqueta + " no es la fila: al esconderlo quedara la fila vacia con su raya"
    );
    assert.ok(
      el.querySelector("#" + campo),
      "el campo " + campo + " esta fuera de su etiqueta: se escondera solo la mitad"
    );
  }
});

test("EL ROJO DE ESTA PAGINA ES EL MISMO QUE EL DE LA VENTANA FLOTANTE", () => {
  /*
   * PRUEBA DE TEXTO: lee las dos hojas como cadenas. No comprueba que nada se
   * pinte, comprueba que los dos numeros son el mismo numero.
   *
   * Y hace falta porque no lo eran: esta pagina usaba #ff0033 y la ventana
   * (y el menu) #f15a5a. Dos rojos distintos a un clic de distancia, cada uno
   * escrito en su archivo, sin ningun error en ningun sitio. Es la regla
   * duplicada de siempre, solo que en forma de color.
   *
   * NO SE ARREGLA JUNTANDO LOS ARCHIVOS, y por eso la prueba es de texto:
   * pip.css se carga dentro de la ventana flotante y esta pagina es otro
   * documento que no puede leerlo mientras se pinta. options.js si lo lee
   * —con fetch, para la muestra de «El del tema»—, pero eso llega tarde y
   * solo para un cuadradito. La copia se queda; lo que no se queda es que
   * pueda separarse en silencio.
   */
  const html = fs.readFileSync(OPCIONES_HTML, "utf8");
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const deLaPagina = html.match(/--accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(deLaPagina, "la pagina ya no declara --accent; si se renombro, renombralo aqui");

  // El acento del tema oscuro, que es el que gasta esta pagina: el primero
  // que declara pip.css, en su :root. El del tema claro es otro a proposito.
  const deLaVentana = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(deLaVentana, "pip.css ya no declara --ytmpip-accent");

  assert.equal(
    deLaPagina[1].toLowerCase(),
    deLaVentana[1].toLowerCase(),
    "las preferencias y la ventana flotante se han quedado con dos rojos distintos"
  );
});

/*
 * LA FAMILIA ENTERA DEL ROJO (la tanda N).
 *
 * La prueba de arriba ata la pagina de opciones a la ventana; estas cuatro
 * atan el resto de la familia. Son pruebas de texto por el mismo motivo de
 * siempre: cada copia vive en un documento que no puede leer a los demas
 * mientras se pinta (el menu es su propia pagina, el cuentagotas nace de
 * constants.js), asi que las copias se quedan y lo que se vigila es que no
 * se separen en silencio.
 */

test("el menu (popup.css) gasta el mismo rojo que la ventana", () => {
  const popup = fs.readFileSync(path.join(RAIZ, "src/popup/popup.css"), "utf8");
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const delMenu = popup.match(/--accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(delMenu, "popup.css ya no declara --accent; si se renombro, renombralo aqui");
  const deLaVentana = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(deLaVentana, "pip.css ya no declara --ytmpip-accent");

  assert.equal(
    delMenu[1].toLowerCase(),
    deLaVentana[1].toLowerCase(),
    "el menu y la ventana flotante se han quedado con dos rojos distintos"
  );
});

test("el boton flotante de la pagina gasta el mismo rojo que la ventana", () => {
  /*
   * El boton de abrir la ventana que pip.js pinta SOBRE LA PAGINA del sitio
   * lleva su color en un cssText, no en una hoja: es la copia mas facil de
   * olvidar de toda la familia, porque no hay ningun archivo .css que abrir.
   * Se busca el "background:#..." de ese cssText (hoy es el unico del
   * archivo; si algun dia hay mas, el mensaje de abajo dira cual toca).
   */
  const js = fs.readFileSync(path.join(RAIZ, "src/pip/pip.js"), "utf8");
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const delBoton = js.match(/"background:(#[0-9a-f]{3,8})"/i);
  assert.ok(delBoton, "pip.js ya no pinta ningun boton con background:#... en cssText");
  const deLaVentana = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(deLaVentana, "pip.css ya no declara --ytmpip-accent");

  assert.equal(
    delBoton[1].toLowerCase(),
    deLaVentana[1].toLowerCase(),
    "el boton flotante de rescate (el de abrir la ventana desde la pagina) se ha quedado con otro rojo"
  );
});

test("el cuentagotas de 'uno mio' nace en el rojo de la ventana", () => {
  /*
   * COLOR_SUGGESTED dice en su comentario que NO es fuente de verdad de
   * nada: es solo por donde empieza el cuentagotas. Pero empezar en un rojo
   * que ya no existe en la interfaz seria un fantasma: el usuario abriria
   * "uno mio" y le ofreceriamos un color que no se parece a nada de lo que
   * ve. Se ata aqui, contra el CSS leido de verdad, no contra un literal.
   */
  const { COLOR_SUGGESTED } = require("../helpers/constantes.js").SPECTRUM_LIMITS;
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const deLaVentana = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(deLaVentana, "pip.css ya no declara --ytmpip-accent");

  assert.equal(
    COLOR_SUGGESTED.toLowerCase(),
    deLaVentana[1].toLowerCase(),
    "el cuentagotas nace en un rojo que la interfaz ya no gasta"
  );
});

test("la decision fijada: rojo 255 en oscuro y el rojo oscuro en claro", () => {
  /*
   * Esto NO es coherencia entre copias: es LA DECISION del usuario, con sus
   * palabras («un rojo 255» y «tema claro rojo oscuro», 2026-09-22), fijada
   * para que un futuro retoque estetico no la deshaga sin darse cuenta. Las
   * demas pruebas de esta seccion pasarian igual con cualquier color, con
   * tal de que las copias coincidan; esta es la unica que sabe CUALES son.
   */
  const css = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const oscuro = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(oscuro, "pip.css ya no declara --ytmpip-accent");
  assert.equal(oscuro[1].toLowerCase(), "#ff0000", "el tema oscuro ya no es el rojo 255 pedido");

  // El acento del tema claro vive dentro del bloque html.ytmpip-theme-light;
  // se busca DENTRO del bloque y no "el segundo del archivo" para que
  // reordenar temas no convierta la prueba en una que mira otra cosa.
  const claro = css.match(/html\.ytmpip-theme-light\s*\{[^}]*--ytmpip-accent:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(claro, "el tema claro ya no declara su propio --ytmpip-accent");
  assert.equal(
    claro[1].toLowerCase(),
    "#d32f2f",
    "el tema claro tenia que conservar su rojo oscuro: el 255 puro sobre blanco pierde contraste"
  );
});

test("la paleta sugerida: hermanos del primero, girando canales", () => {
  /*
   * El invariante que promete el comentario de PALETTE_SUGGESTED: los
   * hermanos son EL MISMO color girando el tono (misma luz, misma
   * saturacion). Con canales puros eso se comprueba sin trigonometria:
   * girar el tono 120 grados es rotar los canales, asi que los tres hex
   * tienen que tener el MISMO multiconjunto de valores {r,g,b}. Y el
   * primero es el propio COLOR_SUGGESTED: la paleta arranca donde arranca
   * el cuentagotas.
   */
  const { COLOR_SUGGESTED, PALETTE_SUGGESTED } = require("../helpers/constantes.js").SPECTRUM_LIMITS;

  assert.equal(
    PALETTE_SUGGESTED[0].toLowerCase(),
    COLOR_SUGGESTED.toLowerCase(),
    "la paleta ya no arranca en el color del cuentagotas"
  );

  const canales = (hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    assert.ok(m, "la paleta tiene un color que no es #rrggbb: " + hex);
    return [m[1], m[2], m[3]].map((c) => parseInt(c, 16)).sort((a, b) => a - b);
  };
  const patron = canales(PALETTE_SUGGESTED[0]);
  for (const hermano of PALETTE_SUGGESTED.slice(1)) {
    assert.deepEqual(
      canales(hermano),
      patron,
      hermano + " ya no es un giro de canales del primero: rompe la misma-luz-misma-saturacion"
    );
  }
});

/* ------------------------------------------------------------------ *
 * 2. LO GUARDADO LLEGA A LOS MANDOS
 * ------------------------------------------------------------------ */

test("APAGADO: los mandos no se ven siquiera", () => {
  const pagina = abrirOpciones({ equalizer: "off" });
  assert.equal(pagina.presetDe().value, "off");
  assert.equal(
    pagina.escondidos(),
    true,
    "con el ecualizador apagado los deslizadores tienen que estar " +
      "escondidos: moverlos sin querer cruza la puerta de un solo sentido."
  );
});

test("sin nada guardado se abre apagado, que es el valor de fabrica", () => {
  const pagina = abrirOpciones({});
  assert.equal(pagina.presetDe().value, "off");
  assert.equal(pagina.escondidos(), true);
});

test("un preset guardado pone SUS numeros en los deslizadores", () => {
  const pagina = abrirOpciones({ equalizer: "voz" });
  const { EQUALIZER_PRESETS } = pagina.win.YTMPip.CONSTANTS;
  assert.equal(pagina.presetDe().value, "voz");
  // `plano` y no `.slice()`: el preset sale del realm de la ventana jsdom y
  // deepStrictEqual compara prototipos. Ver el comentario en helpers/entorno.js.
  assert.deepStrictEqual(pagina.dbs(), plano(EQUALIZER_PRESETS.voz));
  assert.equal(pagina.escondidos(), false);
});

test("cinco numeros sueltos se enseñan como «A mi gusto»", () => {
  const pagina = abrirOpciones({ equalizer: "3,-2,0,5,-1" });
  assert.equal(
    pagina.presetDe().value,
    "__manual",
    "unos numeros a mano no son ningun preset; `presetDe` devuelve null y " +
      "ese null es lo que significa «A mi gusto»."
  );
  assert.deepStrictEqual(pagina.dbs(), [3, -2, 0, 5, -1]);
  assert.equal(pagina.escondidos(), false);
});

test("el numero de al lado lleva su signo y su unidad", () => {
  const pagina = abrirOpciones({ equalizer: "3,-2,0,5,-1" });
  assert.deepStrictEqual(pagina.salidas(), ["+3 dB", "-2 dB", "0 dB", "+5 dB", "-1 dB"]);
});

test("un guardado corrupto no deja los mandos en un estado imposible", () => {
  // "8,3" es un guardado de una version con dos bandas, o texto pisado.
  // `normalizar` lo tira al valor de fabrica, y la pagina tiene que
  // enseñar ESO y no dos deslizadores puestos y tres a cero.
  const pagina = abrirOpciones({ equalizer: "8,3" });
  assert.equal(pagina.presetDe().value, "off");
  assert.equal(pagina.escondidos(), true);
});

/* ------------------------------------------------------------------ *
 * 3. LO QUE SE ELIGE ES LO QUE SE GUARDA
 * ------------------------------------------------------------------ */

test("elegir un preset guarda su NOMBRE, no sus cinco numeros", () => {
  const pagina = abrirOpciones({ equalizer: "off" });
  pagina.elegir("graves");
  assert.equal(
    pagina.almacen.equalizer,
    "graves",
    "guardado como sus cinco numeros sonaria igual hoy y dejaria de seguir al " +
      "preset para siempre: afinar «graves» no llegaria a quien lo eligio. Y se " +
      "ha afinado tres veces —[8,3,0,0,1], [7,0,0,0,1], [0,4,-6,-2,1]—, asi que " +
      "no es una precaucion teorica."
  );
});

test("elegir un preset MUEVE los deslizadores y destapa los mandos", () => {
  /*
   * Se compara contra EQUALIZER_PRESETS y NO contra los cinco numeros
   * escritos aqui, y el cambio lo pidio la realidad: "graves" era
   * [8, 3, 0, 0, 1], el usuario lo oyo demasiado flojo, se afino a
   * [7, 0, 0, 0, 1] —y luego, a oido, a [0, 4, -6, -2, 1]— y esta prueba se
   * puso roja las dos veces sin que nada estuviera roto.
   *
   * Lo que comprueba es que los deslizadores enseñen EL PRESET, no unos
   * numeros concretos; que esos numeros sean sensatos lo comprueba otra
   * prueba, en el archivo del nucleo. Escritos en los dos sitios no serian
   * una regla, serian dos, y la segunda solo sirve para romperse.
   */
  const pagina = abrirOpciones({ equalizer: "off" });
  assert.equal(pagina.escondidos(), true);
  pagina.elegir("graves");
  /*
   * El `Array.from` no sobra. El preset vive DENTRO de la ventana de jsdom,
   * asi que es un Array con el prototipo de ESA ventana, y `pagina.dbs()`
   * devuelve un Array de aqui. `deepStrictEqual` compara prototipos, asi que
   * fallaba con un mensaje memorable: «same structure but are not
   * reference-equal», enseñando dos listas identicas una encima de otra.
   */
  const esperado = Array.from(pagina.win.YTMPip.CONSTANTS.EQUALIZER_PRESETS.graves);
  assert.deepStrictEqual(pagina.dbs(), esperado);
  assert.equal(pagina.escondidos(), false);
});

test("mover un deslizador pasa a «A mi gusto» sin esperar a soltarlo", () => {
  const pagina = abrirOpciones({ equalizer: "voz" });
  pagina.mover(0, 6, false); // arrastrando todavia
  assert.equal(pagina.presetDe().value, "__manual");
  assert.equal(
    pagina.almacen.equalizer,
    "voz",
    "arrastrar no guarda: de -12 a +12 serian veinticuatro escrituras."
  );
  // Y el numero de al lado sigue al mando MIENTRAS se arrastra, que es
  // justo cuando se le esta mirando. Repintar solo al guardar dejaria el
  // numero contando la cancion anterior durante todo el gesto.
  assert.equal(pagina.salidas()[0], "+6 dB");
});

test("EL MANDO QUE NO SE DEJA MOVER: el deslizador se queda donde se le suelta", () => {
  /*
   * Esta es la numero 2 de la lista de la cabecera y la unica que se ve
   * sin entender nada: se arrastra el mando de graves, se suelta, y vuelve
   * solo a su sitio. Pasa si `input` no cambia antes el desplegable, porque
   * entonces `save` guarda el preset —que es lo que sigue diciendo el
   * desplegable— y `pintarEcualizador` repinta los cinco con los numeros
   * del preset, pisando justo el que se acaba de mover.
   */
  const pagina = abrirOpciones({ equalizer: "voz" });
  pagina.mover(0, 6);
  assert.equal(pagina.dbs()[0], 6, "el deslizador volvio solo a su sitio");
  assert.equal(pagina.presetDe().value, "__manual");
});

test("soltar el deslizador guarda los cinco numeros, no solo el movido", () => {
  const pagina = abrirOpciones({ equalizer: "voz" });
  pagina.mover(0, 6);
  assert.equal(pagina.almacen.equalizer, "6,-2,4,3,0");
});

test("lo que se guarda ya viene acotado y redondeado", () => {
  const pagina = abrirOpciones({ equalizer: "plano" });
  const { EQUALIZER_LIMITS } = pagina.win.YTMPip.CONSTANTS;

  /*
   * EL TECHO NO LO PONE NUESTRO CODIGO, lo pone el <input type=range>: pedir
   * 99 con max=12 devuelve "12" sin que nadie intervenga. Se comprueba
   * igualmente —es la promesa que le hacemos a quien lea storage— pero sin
   * enganarse sobre quien la cumple. Esta linea sola estaba pasando por una
   * prueba de `normalizar` y no probaba `normalizar` en absoluto; lo dijo
   * una mutacion que quitaba la llamada y sobrevivia tan tranquila.
   */
  pagina.mover(0, 99);
  assert.equal(pagina.almacen.equalizer.split(",")[0], String(EQUALIZER_LIMITS.GAIN_MAX));

  /*
   * LO QUE SI PONE NUESTRO CODIGO es que sean enteros. Un `value` con
   * decimales atraviesa el <input> intacto (el paso solo manda cuando el
   * navegador mueve el mando, no cuando alguien le escribe el valor), y sin
   * el `normalizar` de `save` llegaria a storage un "3.7,0,0,0,0" que
   * `unaGanancia` redondea despues al leerlo: lo guardado y lo que suena
   * serian dos cosas distintas, que es justo lo que ese `normalizar` esta
   * ahi para impedir.
   */
  pagina.mover(2, 3.7);
  assert.equal(
    pagina.almacen.equalizer.split(",")[2],
    "4",
    "lo guardado tiene que ser exactamente lo que va a sonar"
  );
});

test("apagarlo desde el desplegable guarda «off» y vuelve a esconder los mandos", () => {
  const pagina = abrirOpciones({ equalizer: "graves" });
  assert.equal(pagina.escondidos(), false);
  pagina.elegir("off");
  assert.equal(pagina.almacen.equalizer, "off");
  assert.equal(pagina.escondidos(), true);
});

test("«A mi gusto» se puede elegir a mano para volver a los numeros propios", () => {
  /*
   * El <option> estuvo un rato `disabled`, que era lo comodo —nadie lo
   * elige, se llega solo al mover un mando—. Pero entonces probar un preset
   * era un viaje de ida: los numeros de antes seguian en los deslizadores y
   * no habia forma de decir "esos".
   */
  const pagina = abrirOpciones({ equalizer: "3,-2,0,5,-1" });
  pagina.elegir("nocturno");
  assert.equal(pagina.almacen.equalizer, "nocturno");
  pagina.elegir("__manual");
  assert.equal(
    pagina.almacen.equalizer,
    "-6,0,3,0,-4",
    "«A mi gusto» guarda lo que enseñan los deslizadores AHORA, que es lo " +
      "unico que la pagina sabe: los numeros de antes ya no estan en ningun sitio."
  );
});

/* ------------------------------------------------------------------ *
 * 3 bis. LA ANOTACION PARA EL INTERRUPTOR DE LA VENTANA FLOTANTE
 *
 * Esta pagina no tiene interruptor: tiene una lista con «Apagado» dentro.
 * Pero elegir «Apagado» AQUI es apagar, y el boton de la ventana necesita
 * saber a que volver, asi que esta pagina tambien tiene que dejarlo
 * anotado. La regla es la misma funcion en los dos sitios
 * (`Settings.clavesEcualizador`) por lo de siempre: escrita dos veces
 * serian dos reglas, y la que se olvidara dejaria el interruptor volviendo
 * a «graves» por su cuenta.
 * ------------------------------------------------------------------ */

test("apagar aqui deja anotado lo que sonaba, para el boton de la ventana", () => {
  const pagina = abrirOpciones({ equalizer: "3,-2,0,5,-1" });

  pagina.elegir("off");

  assert.equal(pagina.almacen.equalizer, "off");
  assert.equal(
    pagina.almacen.equalizerLast,
    "3,-2,0,5,-1",
    "sin esto, quien apaga desde aqui y enciende desde la ventana pierde sus numeros"
  );
});

test("elegir un preset lo deja anotado de paso", () => {
  const pagina = abrirOpciones({ equalizer: "off" });

  pagina.elegir("voz");

  assert.equal(pagina.almacen.equalizer, "voz");
  assert.equal(pagina.almacen.equalizerLast, "voz");
});

test("DOS CAMBIOS SEGUIDOS sin recargar: la anotacion no se queda en el primero", () => {
  /*
   * El caso que obliga a que la pagina lleve la cuenta por su cuenta en vez
   * de preguntarle a `Settings.get()`. Esa cache se repone por
   * storage.onChanged, o sea con retraso; entre estos dos `elegir` no da
   * tiempo a nada, asi que el segundo guardado leeria el estado de antes
   * del primero y anotaria «voz» en vez de «nocturno».
   */
  const pagina = abrirOpciones({ equalizer: "off" });

  pagina.elegir("voz");
  pagina.elegir("nocturno");
  pagina.elegir("off");

  assert.equal(pagina.almacen.equalizerLast, "nocturno");
});

test("la anotacion no se enseña en ningun mando de esta pagina", () => {
  /*
   * A proposito: aqui se elige el ajuste de una lista, y «lo ultimo que
   * hubo» no es una eleccion que nadie haga. Un mando para eso seria una
   * segunda forma de contestar a la misma pregunta.
   */
  const pagina = abrirOpciones({ equalizer: "off", equalizerLast: "voz" });

  assert.equal(pagina.presetDe().value, "off");
  assert.equal(
    pagina.doc.querySelectorAll("[id*='qualizerLast']").length,
    0,
    "ha aparecido un mando para la anotacion"
  );
});

test("abrir la pagina y no tocar nada no reescribe la anotacion", () => {
  /*
   * `load` siembra el valor pero NO guarda. Si al abrir se guardara, entrar
   * en Opciones a mirar el atenuado borraria la anotacion de alguien que
   * tenia el ecualizador apagado.
   */
  const pagina = abrirOpciones({ equalizer: "off", equalizerLast: "voz" });

  assert.equal(pagina.almacen.equalizerLast, "voz");
});

test("guardar OTRA preferencia con el ecualizador apagado tampoco borra la anotacion", () => {
  /*
   * ESTA PRUEBA LA PIDIO UNA MUTACION QUE SOBREVIVIA: sembrar al cargar solo
   * `equalizer` y olvidarse de `equalizerLast` no tumbaba nada.
   *
   * La de arriba no lo cubre porque alli no se guarda; aqui si. `save`
   * escribe TODAS las claves de golpe, asi que cambiar el tema con el
   * ecualizador apagado vuelve a pasar por la regla, y la regla mira lo que
   * habia. Si al abrir la pagina no se hubiera sembrado la anotacion, en ese
   * momento valdria «nada» y saldria el valor de fabrica: entrar en Opciones
   * a cambiar el tema le borraria sus cinco numeros a quien tenia el
   * ecualizador apagado desde el boton de la ventana.
   */
  const pagina = abrirOpciones({ equalizer: "off", equalizerLast: "-4,0,2,0,6" });
  const tema = pagina.doc.getElementById("theme");
  tema.value = "light";
  tema.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));

  assert.equal(pagina.almacen.equalizer, "off", "el tema no deberia encender nada");
  assert.equal(pagina.almacen.equalizerLast, "-4,0,2,0,6");
});

/* ------------------------------------------------------------------ *
 * 4. EL AVISO DE LA ENTRADA DICE LA VERDAD
 *
 * Aqui habia tres pruebas que comprobaban el numero de decibelios que
 * bajaba la entrada con cada preset («subir los graves baja la entrada, con
 * el numero puesto»). Estaban en verde y fijaban el fallo: el aviso
 * describia con precision un peaje que no debia existir, y por eso el fallo
 * aguanto tanto. Se cambian por lo que el aviso tiene que contestar, que es
 * «¿esto me va a distorsionar?» y no «¿cuanto pierdo?».
 * ------------------------------------------------------------------ */

test("sin nada subido se dice que no hay nada que compensar", () => {
  const pagina = abrirOpciones({ equalizer: "plano" });
  assert.match(pagina.preamp(), /no hay ninguna banda subida/);
});

test("solo bajando bandas tampoco se toca la entrada", () => {
  // Un ecualizador que solo baja no puede recortar nada. Bajarle ademas la
  // entrada seria dejar la musica mas floja sin ninguna razon.
  const pagina = abrirOpciones({ equalizer: "-6,-3,0,-2,0" });
  assert.match(pagina.preamp(), /no hay ninguna banda subida/);
});

test("CON BANDAS SUBIDAS EL AVISO DICE EL PRECIO Y NO PROMETE VOLUMEN", () => {
  /*
   * ESTE AVISO HA MENTIDO DOS VECES Y LAS DOS LAS PILLO EL USUARIO OYENDO, no
   * una prueba. Por eso lo que se comprueba aqui no es solo que diga lo que
   * hoy toca, sino que NO vuelva a decir ninguna de las dos frases viejas.
   *
   *   - «Es normal que el volumen general quede más bajo: lo que se oye es la
   *     diferencia entre bandas». Era verdad y era el problema: justificaba
   *     un peaje fijo que dejaba la banda mas alta siempre en −3 dB.
   *
   *   - «De los picos se encarga un limitador, que sólo actúa cuando hace
   *     falta, así que subir una banda se oye como una subida de verdad».
   *     Medido: actuaba el 100 % del tiempo y la subida era de 0,7 dB.
   *
   * Lo que si puede decir es cuanto cuesta, con su numero, y donde esta el
   * volumen de verdad, que es el control del sistema.
   *
   * LAS FRASES EXACTAS CAMBIARON UNA TERCERA VEZ y por eso estas expresiones
   * ya no las citan enteras. No fue otra mentira: el aviso hablaba de «la
   * entrada», que es como se llama por dentro y no algo que exista para quien
   * lee la pagina. Se comprueba lo que el aviso tiene que CONTESTAR —cuanto
   * cuesta, sin signo, y donde esta el volumen— y no las palabras con las que
   * hoy lo contesta; lo que si se sigue citando entero es lo que NO puede
   * volver a decir, porque ahi la palabra exacta era el fallo.
   */
  for (const valor of ["graves", "nocturno", "12,0,0,0,0"]) {
    const pagina = abrirOpciones({ equalizer: valor });
    const texto = pagina.preamp();

    assert.match(texto, /baja \d+ dB/, `con ${valor} no se dice cuanto cuesta`);
    // Sin signo: «baja -11 dB» se lee como que sube.
    assert.ok(!/-\d/.test(texto), `con ${valor} el numero sale con signo: ${texto}`);
    assert.match(texto, /control del sistema/, `con ${valor} no se dice donde esta el volumen`);

    assert.ok(!/volumen general/.test(texto), `con ${valor} vuelve la frase vieja del peaje`);
    assert.ok(
      !/cuando hace falta|subida de verdad/.test(texto),
      `con ${valor} vuelve la promesa del limitador, que esta medida y es falsa`
    );
  }
});

test("SI SE LE VUELVE A FIAR TRABAJO AL LIMITADOR, EL AVISO LO DICE", () => {
  /*
   * ESTA PRUEBA MIRA AL REVES QUE ANTES, igual que su gemela del nucleo, y
   * por el mismo motivo.
   *
   * Antes la preamplificacion valia cero siempre, asi que lo inalcanzable era
   * la rama del «La entrada baja N dB» y habia que estropear el limitador
   * para llegar a ella. Con el umbral en cero pasa lo contrario: esa rama es
   * la normal y la que ya no alcanza ningun ajuste es la otra, la que dice
   * que la entrada no se toca.
   *
   * Sigue habiendo que cubrirla, y por lo de siempre: esta escrita. Una rama
   * que nadie prueba se rompe el dia que se necesita, que es el dia en que ya
   * no hay nadie mirando este archivo.
   *
   * Se le devuelve el umbral a −1 sobre la ventana ya cargada, que le da 19 dB
   * de margen y hace que la subida quepa. Cada `abrirOpciones` monta su propio
   * jsdom, asi que esto no se le cuela a nadie mas.
   */
  const pagina = abrirOpciones({ equalizer: "plano" });
  pagina.win.YTMPip.CONSTANTS.EQUALIZER_LIMITS.LIMITADOR.UMBRAL_DB = -1;

  pagina.elegir("graves");
  const texto = pagina.preamp();

  assert.match(texto, /No hay que bajar nada/, `no se anuncia que la subida cabe: ${texto}`);
  assert.ok(!/baja \d+ dB/.test(texto), `sigue cobrando una bajada que no existe: ${texto}`);
});

/* ------------------------------------------------------------------ *
 * 5. IDA Y VUELTA
 * ------------------------------------------------------------------ */

test("lo guardado vuelve a los mismos mandos al reabrir la pagina", () => {
  /*
   * La prueba que caza las asimetrias entre `load` y `save`, que es donde
   * viven los fallos de "se me desconfigura solo": basta con que una de las
   * dos mitades entienda "off" o "A mi gusto" de otra forma.
   */
  for (const valor of ["off", "plano", "graves", "voz", "nocturno", "3,-2,0,5,-1"]) {
    const primera = abrirOpciones({ equalizer: valor });
    // Guardar sin tocar nada: reelegir lo que ya esta elegido.
    primera.elegir(primera.presetDe().value);
    assert.equal(primera.almacen.equalizer, valor, "al guardar sin tocar nada: " + valor);

    const segunda = abrirOpciones({ equalizer: primera.almacen.equalizer });
    assert.equal(segunda.presetDe().value, primera.presetDe().value, "el desplegable: " + valor);
    assert.deepStrictEqual(segunda.dbs(), primera.dbs(), "los deslizadores: " + valor);
    assert.equal(segunda.escondidos(), primera.escondidos(), "escondidos: " + valor);
  }
});

test("guardar el ecualizador no se lleva por delante el resto de preferencias", () => {
  /*
   * `save` escribe TODAS las claves de golpe, asi que un campo que se lea
   * mal al cargar se reescribe mal al guardar cualquier otra cosa. Se mira
   * con el espectro porque es el vecino de al lado en la pagina.
   */
  /*
   * La paleta se guarda como los colores separados por comas y NADA MAS: el
   * modo se deduce de la FORMA (ver `normalizarColor`), no hay prefijo. Este
   * literal empezo siendo "palette:#ff0000,#00ff00" y la prueba fallo
   * enseñando "accent", que es exactamente lo que debe pasar con algo que no
   * es un color valido. La prueba estaba mal; el codigo, bien.
   */
  const paleta = "#ff0000,#00ff00";
  const pagina = abrirOpciones({ equalizer: "off", spectrumColor: paleta, theme: "light" });
  pagina.elegir("voz");
  assert.equal(pagina.almacen.theme, "light");
  assert.equal(pagina.almacen.spectrumColor, paleta);
});

test("y al reves: tocar otra preferencia no apaga el ecualizador", () => {
  const pagina = abrirOpciones({ equalizer: "graves" });
  const tema = pagina.doc.getElementById("theme");
  tema.value = "light";
  tema.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.equalizer, "graves");
});

/* ------------------------------------------------------------------ *
 * 8. LOS VECINOS DE LA TANDA DE SITIOS
 *
 * Viven aqui porque este archivo es el unico que abre options.html DE
 * VERDAD con su options.js, y las dos trampas que siguen estan en esa
 * misma costura: un <select> escrito en el HTML que options.js no lee
 * ni guarda no da error ninguno, simplemente la pagina enseña siempre
 * el valor de fabrica y el guardado tira la eleccion.
 * ------------------------------------------------------------------ */

test("LA PREFERENCIA DEL FONDO CANVAS SE CARGA Y SE GUARDA desde la pagina", () => {
  // "hidden" al abrir, que NO es el valor de serie: solo el que no es el
  // de fabrica demuestra que la carga lee el storage de verdad.
  const pagina = abrirOpciones({ canvasPreference: "hidden" });
  const select = pagina.doc.getElementById("canvasPreference");
  assert.equal(select.value, "hidden", "lo guardado no se enseña al abrir");

  select.value = "shown";
  select.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.canvasPreference, "shown", "lo elegido no llego al storage");
});

test("sin nada guardado, el fondo Canvas arranca en el valor de serie", () => {
  const pagina = abrirOpciones({});
  assert.equal(
    pagina.doc.getElementById("canvasPreference").value,
    pagina.win.YTMPip.CONSTANTS.DEFAULT_SETTINGS.canvasPreference
  );
});

test("EL HALO SE CARGA Y SE GUARDA: tres respuestas en la pagina, dos claves en el storage", () => {
  /*
   * El select ofrece off/fixed/pulse pero el storage guarda DOS claves
   * (haloPreference + haloMode), asi que la traduccion tiene dos trampas
   * propias ademas de las del Canvas: cargar tiene que deducir la
   * respuesta de las dos claves, y guardar "off" tiene que escribir SOLO
   * el interruptor — si escribiera tambien el modo, apagar desde aqui
   * borraria el «latiendo» elegido y volver a encender daria otra cosa.
   */
  // "pulse" al abrir, que NO es el valor de serie: solo lo distinto
  // demuestra que la carga lee el storage de verdad.
  const pagina = abrirOpciones({ haloMode: "pulse" });
  const select = pagina.doc.getElementById("halo");
  assert.equal(select.value, "pulse", "lo guardado no se enseña al abrir");

  select.value = "off";
  select.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloPreference, "hidden", "el apagado no llego al storage");
  assert.equal(pagina.almacen.haloMode, "pulse", "apagar el halo borro el modo elegido");

  select.value = "fixed";
  select.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloPreference, "shown", "encender no volvio a enseñar la capa");
  assert.equal(pagina.almacen.haloMode, "fixed", "elegir «fijo» no escribio el modo");
});

test("el halo apagado en el storage gana al modo al abrir, y sin nada guardado sale el de serie", () => {
  // Con el interruptor en "hidden" da igual que modo haya debajo: la
  // pagina tiene que decir «Apagado», no el modo que dormita.
  const apagado = abrirOpciones({ haloPreference: "hidden", haloMode: "pulse" });
  assert.equal(apagado.doc.getElementById("halo").value, "off");

  const virgen = abrirOpciones({});
  assert.equal(
    virgen.doc.getElementById("halo").value,
    virgen.win.YTMPip.CONSTANTS.DEFAULT_SETTINGS.haloMode
  );
});

test("EL COLOR DEL HALO: un hex guardado abre el cuentagotas, y elegir «el del tema» guarda la palabra, no el hex", () => {
  /*
   * Una clave con dos formas (como spectrumColor): la pagina tiene que
   * DEDUCIR el desplegable de la forma de lo guardado, y al guardar «el
   * del tema» escribir "accent" y no el color resuelto — guardarlo
   * resuelto dejaria de seguir al tema al cambiarlo.
   */
  const pagina = abrirOpciones({ haloColor: "#00a1ff" });
  const modo = pagina.doc.getElementById("haloColorMode");
  const gotas = pagina.doc.getElementById("haloColor");
  assert.equal(modo.value, "custom", "un hex guardado no se leyo como color propio");
  assert.equal(gotas.value, "#00a1ff", "el cuentagotas no nacio con el color guardado");
  assert.equal(gotas.hidden, false, "el cuentagotas quedo escondido con un color propio elegido");
  assert.equal(pagina.doc.getElementById("haloColorLabel").hidden, false);

  modo.value = "accent";
  modo.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloColor, "accent", "se guardo otra cosa que la palabra accent");
  assert.equal(gotas.hidden, true, "volver al tema no escondio el cuentagotas");

  modo.value = "custom";
  modo.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloColor, "#00a1ff", "el color del cuentagotas no llego al storage");
});

test("sin color de halo guardado sale «el del tema» y el cuentagotas escondido nace con el rojo sugerido", () => {
  /*
   * El rojo sugerido y no negro: el mismo estreno que el cuentagotas del
   * espectro (COLOR_SUGGESTED), para que abrir «Un color mio» no enseñe
   * un #000000 que nadie eligio.
   */
  const pagina = abrirOpciones({});
  assert.equal(pagina.doc.getElementById("haloColorMode").value, "accent");
  const gotas = pagina.doc.getElementById("haloColor");
  assert.equal(gotas.hidden, true, "el cuentagotas se enseña sin haber elegido color propio");
  assert.equal(gotas.value, pagina.win.YTMPip.CONSTANTS.SPECTRUM_LIMITS.COLOR_SUGGESTED);
});

test("«DEL VIDEO O LA CARATULA» EN EL HALO: se carga, se guarda como palabra y trae su propia pista", () => {
  /*
   * La tercera respuesta del desplegable (tanda del halo segun la
   * caratula). Tres cosas propias: "source" guardado se lee como SU modo
   * (no como hex ni como tema — la deduccion ya no es un charAt de dos
   * caminos); elegirlo guarda la palabra tal cual, que es lo que el
   * saneador del halo acepta desde esta tanda; y al elegirlo aparece la
   * pista que avisa de que una portada sin color cae al tema — el
   * cuentagotas, que no pinta nada en este modo, se queda escondido.
   */
  const pagina = abrirOpciones({ haloColor: "source" });
  const modo = pagina.doc.getElementById("haloColorMode");
  const gotas = pagina.doc.getElementById("haloColor");
  const pista = pagina.doc.getElementById("haloSourceHint");

  assert.equal(modo.value, "source", "lo guardado no se leyo como el modo de la fuente");
  assert.equal(gotas.hidden, true, "el cuentagotas se enseña en un modo que no lo usa");
  assert.equal(pista.hidden, false, "la pista de la portada sin color no se enseña");
  // La respuesta reusa la clave del espectro (misma pregunta, mismo
  // sonido): el <option> lleva data-t="opcion_color_fuente".
  const opcion = modo.querySelector('option[value="source"]');
  assert.ok(opcion, "el desplegable no ofrece la fuente");
  assert.equal(opcion.dataset.t, "opcion_color_fuente");

  modo.value = "accent";
  modo.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloColor, "accent");
  assert.equal(pista.hidden, true, "la pista de la fuente se quedo a la vista en el modo del tema");

  modo.value = "source";
  modo.dispatchEvent(new pagina.win.Event("change", { bubbles: true }));
  assert.equal(pagina.almacen.haloColor, "source", "elegir la fuente no guardo la palabra");
  assert.equal(pista.hidden, false, "volver a la fuente no volvio a enseñar su pista");
});

test("los chips de sitio dicen los nombres que declaran los adaptadores", () => {
  /*
   * Los chips son nombres propios escritos a mano en options.html (por
   * eso no llevan data-t). El riesgo de escribirlos a mano es la errata
   * silenciosa —"Youtube Music"— asi que se cotejan contra los `nombre`
   * declarados en los adaptadores, que el registro ya obliga a tener y
   * que son los que el resto de la extension enseña.
   */
  const declarados = ["youtube-music-adapter.js", "youtube-adapter.js", "spotify-adapter.js"].map(
    (archivo) => {
      const fuente = fs.readFileSync(path.join(RAIZ, "src/content", archivo), "utf8");
      const casa = fuente.match(/nombre: "([^"]+)"/);
      assert.ok(casa, archivo + " ya no declara nombre; esta prueba necesita otra fuente");
      return casa[1];
    }
  );

  const pagina = abrirOpciones({});
  const chips = [...pagina.doc.querySelectorAll(".ytmpip-sitio")].map((chip) => chip.textContent.trim());

  assert.ok(chips.length > 0, "premisa: la pagina tiene chips de sitio");
  for (const chip of chips) {
    assert.ok(declarados.includes(chip), "el chip «" + chip + "» no es el nombre declarado por ningun adaptador");
  }
});

/* ------------------------------------------------------------------ *
 * 9. LA PIEL DEL SEGUNDO REDISEÑO
 *
 * Pildoras sobre los selects, deslizadores con marcas, la matriz de
 * sitios y la vista previa incrustada. Todo es piel: los selects y los
 * ranges de siempre siguen siendo la fuente de verdad, y las trampas
 * nuevas son las de cualquier piel — que se despegue de lo que cubre
 * sin dar un solo error. Cada prueba de aqui vigila una costura:
 * pildora que no cuadra con su opcion, pildora que no empuja el
 * change, marca que miente sobre el valor de fabrica, matriz que
 * promete lo que un sitio no da.
 * ------------------------------------------------------------------ */

test("cada grupo de pildoras cuadra con su select: mismos valores, mismo orden, sin quejas", () => {
  const pagina = abrirOpciones({});
  const grupos = [...pagina.doc.querySelectorAll(".ytmpip-pildoras[data-para]")];

  // La premisa primero: si un dia las pildoras se van del HTML, esta
  // prueba debe caer por aqui y no pasar de vacio en vacio.
  assert.ok(grupos.length >= 12, "premisa: la pagina tiene sus grupos de pildoras (hay " + grupos.length + ")");

  for (const grupo of grupos) {
    const select = pagina.doc.getElementById(grupo.dataset.para);
    assert.ok(select, "el grupo data-para=\"" + grupo.dataset.para + "\" no tiene select");
    assert.deepStrictEqual(
      [...grupo.querySelectorAll("button[data-valor]")].map((b) => b.dataset.valor),
      [...select.options].map((o) => o.value),
      "las pildoras de #" + select.id + " no dicen lo mismo que sus opciones"
    );
  }

  // Y el censo de options.js, con la pagina sana, no protesta.
  assert.ok(
    !pagina.avisos.some((a) => a.includes("pildoras")),
    "el censo protesta con la pagina sana: " + pagina.avisos.join(" | ")
  );
});

test("UN DESAJUSTE ENTRE PILDORAS Y OPCIONES SE DENUNCIA EN CONSOLA, no se queda callado", () => {
  /*
   * La unica rendija para probar el censo es sabotear la pagina antes de
   * que options.js la lea, porque hoy no hay ningun desajuste real: el
   * aviso es codigo para el dia en que alguien añada una opcion y olvide
   * su pildora — y ese dia todo funcionaria en silencio, con una
   * respuesta que existe pero no se puede tocar.
   */
  const pagina = abrirOpciones({}, (win) => {
    win.document.querySelector('#theme option[value="light"]').remove();
    win.document.querySelector('.ytmpip-pildoras[data-para="halo"]').dataset.para = "noExiste";
  });
  assert.ok(
    pagina.avisos.some((a) => a.includes("#theme") && a.includes("no cuadran")),
    "quitar una opcion no levanta el aviso del censo"
  );
  assert.ok(
    pagina.avisos.some((a) => a.includes("noExiste")),
    "un grupo sin select no levanta su aviso"
  );
});

test("en cada grupo hay UNA pildora encendida y es la del select; el HTML estatico ya la traia", () => {
  const pagina = abrirOpciones({});
  // El mismo HTML sin ejecutar nada: lo que se ve el instante antes de
  // que options.js arranque. Si el valor de fabrica cambiara en
  // constants.js, la pildora dibujada a mano se quedaria mintiendo ese
  // instante — y esta comparacion es la unica que lo ve.
  const estatico = new JSDOM(fs.readFileSync(OPCIONES_HTML, "utf8")).window.document;

  for (const grupo of pagina.doc.querySelectorAll(".ytmpip-pildoras[data-para]")) {
    const select = pagina.doc.getElementById(grupo.dataset.para);
    const vivas = [...grupo.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.dataset.valor);
    assert.deepStrictEqual(vivas, [select.value], "encendidas en #" + select.id);

    const dibujadas = [
      ...estatico.querySelectorAll('.ytmpip-pildoras[data-para="' + grupo.dataset.para + '"] button[aria-pressed="true"]')
    ].map((b) => b.dataset.valor);
    assert.deepStrictEqual(dibujadas, vivas, "el HTML estatico de #" + select.id + " no trae encendida la de serie");
  }
});

test("PULSAR UNA PILDORA GUARDA COMO EL SELECT; repetir sobre la encendida no escribe otra vez", () => {
  const pagina = abrirOpciones({});
  let escrituras = 0;
  const setDeVerdad = pagina.win.chrome.storage.local.set;
  pagina.win.chrome.storage.local.set = function (valores, cb) {
    escrituras += 1;
    return setDeVerdad(valores, cb);
  };

  const grupo = pagina.doc.querySelector('.ytmpip-pildoras[data-para="theme"]');
  const clara = grupo.querySelector('button[data-valor="light"]');
  const oscura = grupo.querySelector('button[data-valor="dark"]');

  // Repetir el clic sobre la ya elegida: ni guardado ni "Guardado.".
  oscura.click();
  assert.equal(escrituras, 0, "el clic sobre la pildora ya encendida escribio en storage");

  clara.click();
  assert.equal(pagina.doc.getElementById("theme").value, "light", "la pildora no empujo el select");
  assert.equal(pagina.almacen.theme, "light", "lo elegido no llego al storage");
  assert.equal(clara.getAttribute("aria-pressed"), "true");
  assert.equal(oscura.getAttribute("aria-pressed"), "false");
  assert.equal(escrituras, 1, "el clic no guardo exactamente una vez");
});

test("lo guardado enciende su pildora al abrir la pagina", () => {
  // "light", que NO es el de serie: solo lo distinto demuestra que la
  // piel se repinta tras load() y no se queda con el dibujo del HTML.
  const pagina = abrirOpciones({ theme: "light" });
  const grupo = pagina.doc.querySelector('.ytmpip-pildoras[data-para="theme"]');
  assert.equal(grupo.querySelector('button[data-valor="light"]').getAttribute("aria-pressed"), "true");
  assert.equal(grupo.querySelector('button[data-valor="dark"]').getAttribute("aria-pressed"), "false");
});

test("las pildoras de presets nacen vacias y copian su nombre de la opcion, no de otra lista", () => {
  const pagina = abrirOpciones({});
  for (const boton of pagina.doc.querySelectorAll('.ytmpip-pildoras[data-para="equalizerPreset"] button[data-valor]')) {
    if (boton.dataset.valor === "off" || boton.dataset.valor === "__manual") continue;
    const opcion = pagina.presetDe().querySelector('option[value="' + boton.dataset.valor + '"]');
    assert.ok(boton.textContent.trim(), "la pildora «" + boton.dataset.valor + "» sale muda");
    assert.equal(boton.textContent, opcion.textContent, "la pildora «" + boton.dataset.valor + "» no dice lo de su opcion");
  }
});

test("mover una banda enciende la pildora «A mi gusto»: el select cambio sin evento y la piel se entera", () => {
  /*
   * El tercer sitio del que habla el comentario de mostrarCamposDependientes:
   * mover una banda escribe __manual en el select A MANO, sin change, y su
   * listener tiene que repintar la piel el mismo. Sin esa llamada las
   * pildoras seguirian diciendo "Apagado" con el ecualizador sonando a mi
   * gusto — y ningun error en consola.
   *
   * SIN SOLTAR (tercer argumento): al soltar corre save(), que repinta la
   * piel entera por su propio camino y enmascararia justo la llamada que
   * esta prueba vigila — lo enseño un mutante que la quito y sobrevivio a
   * la primera version de esta prueba. La promesa es que la pildora siga
   * AL DEDO, no al guardado.
   */
  const pagina = abrirOpciones({ equalizer: "plano" });
  pagina.mover(0, 5, false);
  const grupo = pagina.doc.querySelector('.ytmpip-pildoras[data-para="equalizerPreset"]');
  assert.equal(grupo.querySelector('button[data-valor="__manual"]').getAttribute("aria-pressed"), "true");
  assert.equal(grupo.querySelector('button[data-valor="plano"]').getAttribute("aria-pressed"), "false");
});

test("el deslizador enseña su valor vivo y llena el carril: 0% en el minimo, 100% en el maximo", () => {
  const pagina = abrirOpciones({ seekSeconds: 30 });
  const mando = pagina.doc.getElementById("seekSeconds");
  const vivo = pagina.doc.getElementById("seekSecondsVivo");

  // Tras load(), sin tocar nada: el vivo dice lo guardado y el carril
  // esta estrictamente entre los extremos.
  assert.equal(vivo.textContent, "30", "el valor vivo no enseña lo guardado al abrir");
  const parte = parseFloat(mando.style.getPropertyValue("--lleno"));
  assert.ok(parte > 0 && parte < 100, "el carril con 30 s no queda entre los extremos: " + parte);

  const arrastrar = (valor) => {
    mando.value = String(valor);
    mando.dispatchEvent(new pagina.win.Event("input", { bubbles: true }));
  };
  arrastrar(mando.min);
  assert.equal(vivo.textContent, mando.min, "el vivo no sigue al dedo");
  assert.equal(mando.style.getPropertyValue("--lleno"), "0%");
  arrastrar(mando.max);
  assert.equal(vivo.textContent, mando.max);
  assert.equal(mando.style.getPropertyValue("--lleno"), "100%");
});

test("LAS MARCAS DICEN LOS LIMITES DEL INPUT Y EL VALOR DE FABRICA DE CONSTANTS, no una copia", () => {
  const pagina = abrirOpciones({});
  const { DEFAULT_SETTINGS } = pagina.win.YTMPip.CONSTANTS;
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales/es/messages.json"), "utf8"));

  const marcasDe = (id) => {
    const mando = pagina.doc.getElementById(id);
    const marcas = mando.parentElement.querySelector(".ytmpip-marcas");
    assert.ok(marcas && marcas.children.length === 3, id + " no tiene sus tres marcas");
    return { mando, textos: [...marcas.children].map((m) => m.textContent) };
  };

  // Con valor de fabrica propio entre los extremos: las tres marcas.
  for (const id of ["seekSeconds", "spectrumFall", "spectrumHeight"]) {
    const { mando, textos } = marcasDe(id);
    assert.equal(textos[0], mando.min, "la marca izquierda de " + id);
    assert.equal(
      textos[1],
      DEFAULT_SETTINGS[id] + " · " + catalogo.marca_recomendado.message,
      "la marca de enmedio de " + id + " no dice el valor de fabrica de constants.js"
    );
    assert.equal(textos[2], mando.max, "la marca derecha de " + id);
  }

  /*
   * Sin marca de enmedio, cada uno por su motivo: el atenuado nace en 0,
   * que YA es el extremo izquierdo (decirlo dos veces seria un eco), y el
   * numero de barras no tiene valor de fabrica propio — la clave de serie
   * es la conjunta spectrumBars, que vale "auto".
   */
  for (const id of ["pipTransparency", "spectrumBarsCount"]) {
    assert.equal(marcasDe(id).textos[1], "", "la marca de enmedio de " + id + " deberia quedar vacia");
  }
});

test("LA MATRIZ DE SITIOS DICE LO MEDIDO: cada limite en su celda, columnas en el orden de los chips", () => {
  const pagina = abrirOpciones({});

  // Las columnas, con su orden: las celdas de abajo dependen de el.
  assert.deepStrictEqual(
    [...pagina.doc.querySelectorAll(".ytmpip-matriz thead .ytmpip-sitio")].map((s) => s.textContent),
    ["YouTube", "YouTube Music", "Spotify"]
  );

  const porClave = {};
  for (const fila of pagina.doc.querySelectorAll(".ytmpip-matriz tbody tr")) {
    const celdas = [...fila.querySelectorAll("td")];
    assert.equal(celdas.length, 3, "una fila de la matriz no tiene sus tres celdas");
    for (const celda of celdas) {
      // La clase y el simbolo cuentan lo mismo: un ✓ gris o un — verde
      // seria una promesa ilegible.
      if (celda.classList.contains("ytmpip-si")) assert.equal(celda.textContent.trim(), "✓");
      else {
        assert.ok(celda.classList.contains("ytmpip-no"), "una celda sin clase de si ni de no");
        assert.equal(celda.textContent.trim(), "—");
      }
    }
    porClave[fila.querySelector("th").dataset.t] = celdas.map((c) =>
      c.classList.contains("ytmpip-si") ? "si" : "no"
    );
  }

  /*
   * Las decisiones fijadas, fila a fila. No son gustos: el video de
   * Spotify va cifrado, su sonido no pasa por la pagina (ni ecualizador
   * ni barras), YouTube no tiene panel de letra y el Canvas es solo suyo.
   * Si un dia una de estas cambia DE VERDAD, cambiar aqui el literal es
   * el registro de esa medicion.
   */
  assert.deepStrictEqual(porClave.tarjeta_ventana, ["si", "si", "si"]);
  assert.deepStrictEqual(porClave.fila_video, ["si", "si", "no"]);
  assert.deepStrictEqual(porClave.fila_letra, ["no", "si", "si"]);
  assert.deepStrictEqual(porClave.ecualizador, ["si", "si", "no"]);
  assert.deepStrictEqual(porClave.tarjeta_barras, ["si", "si", "no"]);
  assert.deepStrictEqual(porClave.fondo_visual, ["no", "no", "si"]);
  assert.deepStrictEqual(porClave.matriz_pip_nativo, ["si", "si", "si"]);
});

test("cada enlace de la cabecera lleva a una tarjeta que existe", () => {
  const pagina = abrirOpciones({});
  const enlaces = [...pagina.doc.querySelectorAll(".ytmpip-cabecera-nav a")];
  assert.ok(enlaces.length >= 5, "premisa: la cabecera tiene su indice");
  for (const enlace of enlaces) {
    const href = enlace.getAttribute("href");
    assert.match(href, /^#/, "un enlace de la cabecera sale de la pagina: " + href);
    const destino = pagina.doc.getElementById(href.slice(1));
    assert.ok(destino, "el enlace " + href + " no lleva a ninguna parte");
    assert.ok(
      destino.classList.contains("ytmpip-tarjeta"),
      "el destino de " + href + " no es una tarjeta (sin scroll-margin, el titulo queda bajo la cabecera pegajosa)"
    );
  }
});

test("LA VISTA PREVIA ES EL MARCO QUE VIAJA EN EL PAQUETE y nace al tamaño pequeño de verdad", () => {
  const pagina = abrirOpciones({});
  const marco = pagina.doc.getElementById("vistaPrevia");
  assert.ok(marco, "la pagina ya no incrusta la vista previa");

  // El src apunta a un archivo que existe DENTRO de src/ (lo que viaja
  // en el zip): un marco en tools/ se veria en desarrollo y llegaria
  // roto al usuario.
  const archivo = marco.getAttribute("src").split("?")[0];
  assert.ok(
    fs.existsSync(path.join(RAIZ, "src/options", archivo)),
    "el marco " + archivo + " no existe junto a options.html"
  );

  // Nace al tamaño pequeño LEIDO de PIP_DIMENSIONS: las mismas medidas
  // con las que openPip abre la ventana real.
  const { PIP_DIMENSIONS } = pagina.win.YTMPip.CONSTANTS;
  assert.equal(marco.style.width, PIP_DIMENSIONS.COMPACT.width + "px");
  assert.equal(marco.style.height, PIP_DIMENSIONS.COMPACT.height + "px");

  const pequena = pagina.doc.getElementById("vistaPreviaPequena");
  const grande = pagina.doc.getElementById("vistaPreviaGrande");
  assert.equal(pequena.getAttribute("aria-pressed"), "true");
  assert.equal(grande.getAttribute("aria-pressed"), "false");

  grande.click();
  assert.equal(marco.style.width, PIP_DIMENSIONS.EXPANDED.width + "px");
  assert.equal(marco.style.height, PIP_DIMENSIONS.EXPANDED.height + "px");
  assert.equal(grande.getAttribute("aria-pressed"), "true");
  assert.equal(pequena.getAttribute("aria-pressed"), "false");
});
