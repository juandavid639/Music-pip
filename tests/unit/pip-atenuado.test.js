/*
 * Pruebas del ATENUADO de la ventana mientras suena la musica.
 *
 * Lo pedido fue "una opcion para colocar transparente el pip mientras se
 * reproduce la musica". Conviene decir aqui, donde se va a leer, que es lo
 * que estas pruebas garantizan y que no:
 *
 *  - SE PRUEBA la regla (que opacidad toca) y EL CABLE (que ese numero
 *    llegue a la variable CSS que lee la hoja de estilos, y que se repase
 *    en cada cambio de estado y en cada cambio de preferencias).
 *  - NO SE PRUEBA que la ventana se vea traslucida. Bajar la opacidad del
 *    contenido enseña el fondo de la propia ventana, no el escritorio. Si
 *    una ventana Document PiP puede llegar a ser traslucida de verdad esta
 *    SIN COMPROBAR, y se comprueba con tools/diagnostico-transparencia.js,
 *    no aqui: jsdom no pinta nada.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");
const { PIP_LIMITS, DEFAULT_SETTINGS } = require("../helpers/constantes.js");

/*
 * La hoja de estilos, partida en reglas.
 *
 * No es un motor de CSS ni pretende serlo: quita los comentarios y saca
 * pares (selector, declaraciones) con una expresion regular. Los bloques
 * anidados —@media— se saltan solos, porque su cabecera nunca llega a
 * casar: lo que casa es la regla de dentro, que es la que interesa.
 */
function reglasDePipCss() {
  const texto = fs
    .readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [];
  const patron = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = patron.exec(texto)) !== null) {
    reglas.push({ selector: m[1].trim().replace(/\s+/g, " "), cuerpo: m[2] });
  }
  return reglas;
}

/* Cada selector de una regla, por separado: "a, b" son dos. */
function selectores(regla) {
  return regla.selector.split(",").map((s) => s.trim()).filter(Boolean);
}

function ventana(opciones) {
  const { win } = crearEntorno(undefined, opciones);
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

  return {
    win,
    doc,
    banco,
    PipView: win.YTMPip.PipView,
    raiz: doc.getElementById("ytmpip-root"),
    opacidad: () => doc.getElementById("ytmpip-root").style.getPropertyValue("--ytmpip-opacidad")
  };
}

function estado(playing) {
  return { connected: true, playing: playing, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

/* ------------------------------------------------------------------
 * La regla
 * ------------------------------------------------------------------ */

test("sin haber pedido nada la ventana se ve entera, suene o no", () => {
  const o = ventana().PipView.opacidadDelPip;

  assert.strictEqual(o(0, true), 1);
  assert.strictEqual(o(0, false), 1);
});

test("en pausa NUNCA se atenua, por mucho que se haya pedido", () => {
  /*
   * No es una omision: la ventana medio borrada ES la señal de que la
   * musica sigue. Atenuando tambien en pausa, los dos estados dejarian de
   * distinguirse de un vistazo y la opcion perderia su gracia.
   */
  const o = ventana().PipView.opacidadDelPip;

  assert.strictEqual(o(50, false), 1);
  assert.strictEqual(o(PIP_LIMITS.TRANSPARENCY_MAX, false), 1);
});

test("el porcentaje pedido es lo que se quita, no lo que queda", () => {
  const o = ventana().PipView.opacidadDelPip;

  assert.strictEqual(o(20, true), 0.8, "pedir un 20 % de transparencia dejo la ventana al 20 %");
  assert.strictEqual(o(50, true), 0.5);
});

test("en el tope del rango sigue quedando algo que ver", () => {
  /*
   * La razon de que el techo sea 80 y no 100: al 80 % queda un quinto de
   * opacidad, que es poco, pero es una silueta con la que apuntar el raton.
   * Al 100 % la ventana desapareceria y no habria forma de recuperarla sin
   * ir a las opciones a ciegas.
   */
  const o = ventana().PipView.opacidadDelPip;
  const restante = o(PIP_LIMITS.TRANSPARENCY_MAX, true);

  assert.ok(restante > 0, "al maximo la ventana se vuelve invisible");
  assert.strictEqual(restante, 0.2);
});

test("un porcentaje absurdo no devuelve una opacidad absurda", () => {
  /*
   * El acotado vive en la normalizacion de preferencias, no aqui, asi que
   * lo unico que se le pide a esta funcion es no inventarse valores
   * imposibles con lo que no es un numero positivo. Un negativo o un NaN
   * significan "no se pidio nada", que es opacidad entera.
   */
  const o = ventana().PipView.opacidadDelPip;

  for (const valor of [-10, NaN, undefined, null, "mucho", {}]) {
    assert.strictEqual(o(valor, true), 1, `transparencia ${String(valor)}`);
  }
});

/* ------------------------------------------------------------------
 * EL CABLE: que el numero llegue al CSS
 *
 * La regla puede ser perfecta y no verse nada. Estas son las pruebas que
 * se habrian echado en falta: quien escribe la variable es render() en
 * cada estado, y applySettings cuando cambia el porcentaje.
 * ------------------------------------------------------------------ */

test("por defecto no se escribe ningun atenuado que haya que deshacer", async () => {
  const v = ventana();
  await v.win.YTMPip.Settings.load();

  v.PipView.onStateUpdate(estado(true));

  assert.strictEqual(DEFAULT_SETTINGS.pipTransparency, 0, "premisa: de fabrica no se atenua");
  assert.strictEqual(v.opacidad(), "1");
});

test("EL CASO PEDIDO: al sonar la ventana se atenua y al pausar vuelve", async () => {
  const v = ventana({ storage: { pipTransparency: 40 } });
  await v.win.YTMPip.Settings.load();

  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.opacidad(), "0.6", "la ventana no se atenuo al empezar a sonar");

  v.PipView.onStateUpdate(estado(false));
  assert.strictEqual(v.opacidad(), "1", "la ventana se quedo atenuada en pausa");
});

test("cambiar el porcentaje en opciones se nota sin esperar al estado siguiente", async () => {
  /*
   * Entre dos estados pueden pasar segundos. Si el atenuado solo se
   * repasara en render(), mover el numero en la pagina de opciones
   * parecería no hacer nada, que es exactamente la clase de fallo que este
   * proyecto ya ha pagado con el resto de preferencias.
   */
  const v = ventana({ storage: { pipTransparency: 40 } });
  await v.win.YTMPip.Settings.load();

  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.opacidad(), "0.6", "premisa");

  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { pipTransparency: 80 })
  );

  assert.strictEqual(v.opacidad(), "0.2");
});

test("subir el porcentaje con la musica en pausa no atenua la ventana", () => {
  // El otro lado del cable anterior: applySettings no puede olvidarse de
  // que la regla depende ADEMAS de si suena.
  const v = ventana();

  v.PipView.onStateUpdate(estado(false));
  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { pipTransparency: 60 })
  );

  assert.strictEqual(v.opacidad(), "1");
});

test("volver a cero deshace el atenuado en vez de dejarlo pegado", async () => {
  /*
   * La misma leccion que el color del espectro: si la variable solo se
   * escribiera cuando hay algo que atenuar, quitar la opcion dejaria la
   * ventana medio borrada para siempre.
   */
  const v = ventana({ storage: { pipTransparency: 40 } });
  await v.win.YTMPip.Settings.load();

  v.PipView.onStateUpdate(estado(true));
  assert.strictEqual(v.opacidad(), "0.6", "premisa");

  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { pipTransparency: 0 })
  );

  assert.strictEqual(v.opacidad(), "1");
});

/* ------------------------------------------------------------------
 * HACIA QUE SE ATENUA
 *
 * Aqui empieza lo que faltaba, y faltaba justo donde dolio. Todo lo de
 * arriba estaba en verde mientras el usuario miraba un rectangulo negro y
 * escribia "aun no se ve el fondo": el numero era correcto y el cable
 * llegaba: lo que estaba mal era A QUE ELEMENTO se le aplicaba.
 *
 * La opacidad vivia en #ytmpip-root, que es el padre de TODO —del texto,
 * del velo y tambien de la caratula difuminada del fondo—. Atenuar el
 * padre atenuaba tambien la caratula, asi que lo que asomaba por debajo no
 * era el escritorio ni la portada, era el color plano de html/body.
 *
 * ESTAS PRUEBAS LEEN CSS COMO TEXTO, y conviene ser claro sobre lo que eso
 * vale: no dicen como se ve la ventana —jsdom no pinta, y aunque pintara
 * una ventana Document PiP se compone opaca, cosa ya medida—. Dicen que
 * ningun ancestro de la caratula se lleva el atenuado por delante. Es un
 * invariante de estructura, y esa clase de fallo es exactamente la que
 * vuelve sola cuando alguien mueve una regla de sitio.
 * ------------------------------------------------------------------ */

test("el atenuado NO se aplica a un ancestro de la caratula del fondo", () => {
  /*
   * Lo que se busca es el SUJETO de la regla: el ultimo trozo del selector,
   * que es el elemento al que se le acaba aplicando la opacidad. Que la
   * caratula misma lea la variable esta bien —de eso va la prueba
   * siguiente—; lo que no puede es leerla uno de sus contenedores.
   */
  const contiene = (sujeto) =>
    sujeto === "html" || sujeto === "body" || sujeto.indexOf("#ytmpip-root") === 0;
  const culpables = reglasDePipCss()
    .filter((r) => /opacity\s*:[^;]*--ytmpip-opacidad/.test(r.cuerpo))
    .flatMap(selectores)
    .filter((s) => contiene(s.split(" ").pop().split(":")[0]));

  assert.deepStrictEqual(
    culpables,
    [],
    "el atenuado cuelga de un ancestro de .ytmpip-backdrop: atenuara tambien la caratula y la ventana se ira a negro"
  );
});

test("alguien se lleva el atenuado, o la opcion no hace nada", () => {
  // El reverso de la anterior: "no se lo lleva #ytmpip-root" tambien lo
  // cumpliria una hoja de estilos que no usara la variable en absoluto.
  const quienes = reglasDePipCss()
    .filter((r) => /opacity\s*:[^;]*--ytmpip-opacidad/.test(r.cuerpo))
    .flatMap(selectores);

  assert.ok(
    quienes.some((s) => /\.ytmpip-content$/.test(s)),
    "nadie atenua el contenido: la preferencia no se notaria"
  );
});

test("la caratula sube segun se atenua lo demas", () => {
  /*
   * La otra mitad del arreglo. Quitar la opacidad de #ytmpip-root deja de
   * apagar la portada, pero la portada de fabrica esta al 0.55: atenuando
   * el contenido al 20 % lo que se veria seria una portada a medio gas
   * sobre el gris de siempre. La cuenta de esta regla hace que el hueco
   * que deja el contenido lo ocupe la imagen.
   */
  const regla = reglasDePipCss().find((r) =>
    selectores(r).includes(".ytmpip-backdrop.ytmpip-has-art")
  );

  assert.ok(regla, "no existe la regla que decide cuanto se ve la caratula");
  assert.match(
    regla.cuerpo,
    /--ytmpip-opacidad/,
    "la caratula no sabe nada del atenuado: se quedara fija mientras el resto se apaga"
  );
});

test("los modos que cambian el fondo lo hacen por la variable, no pisando la regla", () => {
  /*
   * En video la caratula del fondo baja (compite con la imagen) y con la
   * letra en el escenario sube (es el unico dibujo). Escribiendo esos
   * numeros como `opacity` se pisaba la regla de arriba, y el agujero negro
   * volvia en esos dos modos —que ademas son los que mas se usan—. Van por
   * --ytmpip-fondo justamente para que la cuenta del atenuado siga
   * aplicandose encima.
   */
  const pisan = reglasDePipCss()
    .filter((r) => selectores(r).some((s) => /\.ytmpip-backdrop/.test(s)))
    .filter((r) => /(^|[;{\s])opacity\s*:/.test(r.cuerpo))
    .flatMap(selectores)
    .filter((s) => !/^\.ytmpip-backdrop(\.ytmpip-has-art)?$/.test(s))
    .filter((s) => !/^#ytmpip-root:(hover|focus-within) /.test(s));

  assert.deepStrictEqual(
    pisan,
    [],
    "estos selectores le escriben la opacidad a la caratula a mano: usa --ytmpip-fondo"
  );
});
