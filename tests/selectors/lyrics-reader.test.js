/*
 * Pruebas de la maquina de estados del lector de letras.
 *
 * Motivo de existir: los selectores de letras estuvieron rotos desde la
 * primera version y fallaron EN SILENCIO, porque un querySelector que
 * devolvia null se traducia a "esta cancion no tiene letra". El usuario
 * veia un mensaje plausible y nadie sospechaba del selector. Un test con
 * HTML de fixture habria gritado en el primer minuto.
 *
 * Por eso los fixtures reproducen la estructura REAL de YouTube Music,
 * incluidos el .header y el .footer que rodean al texto: son la trampa en
 * la que cayo el primer lector, que devolvia los tres concatenados.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

const { LYRICS_STATUS } = require("../helpers/constantes.js");

test("cancion CON letra: devuelve AVAILABLE con el texto limpio", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const letra = YTMPip.LyricsReader.read();

  assert.strictEqual(letra.status, LYRICS_STATUS.AVAILABLE);
  assert.ok(letra.text.startsWith("Is this the real life?"), `texto inesperado: ${letra.text}`);
  assert.ok(letra.text.includes("No escape from reality"), "falta la ultima linea");
});

test("cancion CON letra: el texto NO arrastra el encabezado ni el pie", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const { text } = YTMPip.LyricsReader.read();

  // Regresion directa: apuntar al shelf entero en vez de a .description
  // metia "Letra" y "Fuente: LyricFind" dentro de la propia letra.
  assert.ok(!text.includes("Letra"), "el encabezado del panel se coló en el texto");
  assert.ok(!text.includes("Fuente"), "el pie de fuente se coló en el texto");
  assert.ok(!text.includes("LyricFind"), "la fuente se coló en el texto");
});

test("cancion CON letra: la fuente se extrae sin el prefijo 'Fuente:'", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  assert.strictEqual(YTMPip.LyricsReader.read().source, "LyricFind");
});

test("cancion SIN letra: pestaña deshabilitada => UNAVAILABLE", () => {
  const { YTMPip } = entornoContenido("letras-no-disponibles.html");
  const letra = YTMPip.LyricsReader.read();

  assert.strictEqual(letra.status, LYRICS_STATUS.UNAVAILABLE);
  assert.strictEqual(letra.text, undefined);
});

test("cancion SIN letra: el ytmusic-message-renderer basta por si solo", () => {
  // Se quitan los atributos de la pestaña para dejar activa UNICAMENTE la
  // segunda señal. En la interfaz real llegan juntas, pero no queremos que
  // la deteccion dependa de que ambas coincidan.
  const { win, YTMPip } = entornoContenido("letras-no-disponibles.html");
  const pestana = YTMPip.Adapter.getLyricsTab();
  pestana.removeAttribute("disabled");
  pestana.removeAttribute("aria-disabled");

  assert.strictEqual(YTMPip.Adapter.isLyricsTabDisabled(), false, "la pestaña debia quedar habilitada");
  assert.strictEqual(YTMPip.LyricsReader.read().status, LYRICS_STATUS.UNAVAILABLE);
  assert.ok(win.YTMPip.Adapter.getLyricsMessageElement(), "el mensaje de YTM debia seguir presente");
});

test("panel cerrado: LOADING, nunca UNAVAILABLE", () => {
  // ESTE es el fallo original. La cancion si tiene letra, pero el usuario
  // aun no ha abierto el panel, asi que #tab-renderer esta vacio. Cualquier
  // ausencia se reportaba como "no hay letra" y la letra no aparecia jamas.
  const { YTMPip } = entornoContenido("letras-panel-cerrado.html");
  const letra = YTMPip.LyricsReader.read();

  assert.strictEqual(letra.status, LYRICS_STATUS.LOADING);
  assert.notStrictEqual(letra.status, LYRICS_STATUS.UNAVAILABLE);
});

test("pagina sin reproductor: LOADING (no se sabe todavia)", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  assert.strictEqual(YTMPip.LyricsReader.read().status, LYRICS_STATUS.LOADING);
  assert.strictEqual(YTMPip.LyricsReader.isTabPresent(), false);
});

test("isTabPresent detecta la pestaña aunque este deshabilitada", () => {
  const { YTMPip } = entornoContenido("letras-no-disponibles.html");
  assert.strictEqual(YTMPip.LyricsReader.isTabPresent(), true);
  assert.strictEqual(YTMPip.Adapter.isLyricsTabDisabled(), true);
});

test("isPanelOpen distingue el panel abierto del cerrado", () => {
  const abierto = entornoContenido("letras-disponibles.html").YTMPip;
  const cerrado = entornoContenido("letras-panel-cerrado.html").YTMPip;

  assert.strictEqual(abierto.LyricsReader.isPanelOpen(), true);
  assert.strictEqual(cerrado.LyricsReader.isPanelOpen(), false);
});

test("la pestaña de letras se encuentra por su TEXTO, y por posicion solo de ultimo recurso", () => {
  /*
   * Fue al reves (posicion primero) hasta la fase 0 sobre el sitio real:
   * alli las pestañas ya eran CUATRO («Comentarios» es nueva) y la de
   * letras seguia siendo la segunda de pura suerte. Ademas ninguna lleva
   * aria-label, asi que el "refuerzo" por aria-label estaba muerto. Con el
   * fixture estandar ambas rutas coinciden: lo que se afirma aqui es que
   * la elegida es LETRA y que es exactamente la que la ruta vieja daba.
   */
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  const elegida = YTMPip.Adapter.getLyricsTab();
  const cabeceras = win.document.querySelectorAll("#player-page .tab-header");

  assert.strictEqual(elegida.textContent.trim(), "LETRA");
  assert.strictEqual(elegida, cabeceras[1], "con tres pestañas, texto y posicion deben coincidir");
});

test("si Google reordena las pestañas, la de letras se encuentra por su texto", () => {
  /*
   * El mundo temido: la pestaña nueva entra ANTES de la de letras y la
   * posicion [1] pasa a ser una intrusa. La intrusa se llama «LETRAS DEL
   * MOMENTO» a proposito: una busqueda sin anclas la elegiria («LETRAS»
   * contiene «LETRA»), asi que este test tambien vigila la regex anclada.
   * Y la maquina entera debe sobrevivir: read() sigue dando AVAILABLE.
   */
  const { win, YTMPip } = entornoContenido("letras-cuatro-pestanas-reordenadas.html");
  const cabeceras = win.document.querySelectorAll("#player-page .tab-header");
  const elegida = YTMPip.Adapter.getLyricsTab();

  assert.strictEqual(elegida.textContent.trim(), "LETRA");
  assert.strictEqual(elegida, cabeceras[2], "debia saltarse a la intrusa de la posicion [1]");
  assert.strictEqual(YTMPip.LyricsReader.read().status, LYRICS_STATUS.AVAILABLE);
});

test("en un idioma desconocido se cae a la posicion: la segunda cabecera", () => {
  /*
   * La lista de textos conocidos es corta (Letra/Lyrics) a proposito: la
   * regla de la casa prohibe que una etiqueta traducida sea el unico
   * metodo de identificacion, y la posicion es el metodo que no depende
   * del idioma. En frances no se reconoce ningun texto y el ultimo
   * recurso debe seguir siendo la segunda cabecera, como siempre fue.
   */
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  const cabeceras = win.document.querySelectorAll("#player-page .tab-header");
  ["SUIVANT", "PAROLES", "SIMILAIRES"].forEach((texto, i) => {
    cabeceras[i].textContent = texto;
  });

  const elegida = YTMPip.Adapter.getLyricsTab();
  assert.strictEqual(elegida, cabeceras[1], "sin texto conocido, manda la posicion");
  assert.strictEqual(elegida.textContent.trim(), "PAROLES");
});

/*
 * ---------------- Better Lyrics ----------------
 *
 * Segunda fuente, y la unica que ve el usuario cuando tiene esa extension
 * instalada: Better Lyrics OCULTA el panel nativo. Todo lo que sigue se
 * lee del DOM que ya esta en la pagina; no hay ni una peticion de red.
 */

test("EL CASO REPORTADO: YTM dice que no hay letra pero Better Lyrics si la tiene", () => {
  /*
   * Antes de esto devolviamos UNAVAILABLE, porque isLyricsTabDisabled()
   * se consultaba PRIMERO y cortaba en seco. Y era una respuesta doblemente
   * mala: no solo estaba mal, es que estaba mal mirando un panel que Better
   * Lyrics habia escondido y que el usuario ni siquiera tenia delante.
   */
  const { YTMPip } = entornoContenido("letras-better-lyrics.html");

  assert.strictEqual(YTMPip.Adapter.isLyricsTabDisabled(), true,
    "el fixture debe tener la pestaña nativa deshabilitada; si no, no prueba nada");

  const letra = YTMPip.LyricsReader.read();
  assert.strictEqual(letra.status, LYRICS_STATUS.AVAILABLE);
  assert.ok(letra.text.includes("Walking down the street tonight"), `texto inesperado: ${letra.text}`);
  assert.ok(letra.text.includes("I don't know what's wrong or right"), "falta la ultima linea");
});

test("EL SEGUNDO CASO REPORTADO: la letra sale con las palabras pegadas", () => {
  /*
   * "algo adicional, no sé qué pasó con la letra, la que muestra nuestra
   * aplicación está junta": salia "Walkingdownthestreettonight".
   *
   * Better Lyrics parte cada linea en un <span> por palabra y los emite
   * PEGADOS: descarta los trozos en blanco y pinta el hueco con CSS
   * (`margin-right` sobre los marcados con blyrics--has-trailing-space).
   * Asi que los espacios no se perdian por el camino: nunca estuvieron en
   * el DOM, y textContent no podia inventarlos.
   *
   * Esta prueba no existia porque el fixture estaba INVENTADO: le habia
   * puesto saltos de linea entre los <span>, el HTML los convertia en
   * nodos de texto en blanco y textContent devolvia las palabras
   * separadas. El fixture enseñaba la letra bien y tapaba el defecto.
   */
  const { text } = entornoContenido("letras-better-lyrics.html").YTMPip.LyricsReader.read();

  for (const palabra of ["Walking", "down", "street", "tonight"]) {
    assert.ok(text.includes(palabra), `falta la palabra "${palabra}"`);
  }
  assert.ok(
    !/[a-z][A-Z]|thestreet|downthe/.test(text),
    `las palabras siguen pegadas: ${JSON.stringify(text.split("\n")[0])}`
  );
});

test("Better Lyrics: una palabra larga partida en dos se vuelve a pegar SIN espacio", () => {
  /*
   * Better Lyrics trocea las palabras muy largas en varios <span> para
   * poder cortar de linea (`data-wrap-after`). Poner un espacio entre
   * TODAS las palabras es la solucion ingenua y rompe justo aqui:
   * "intentions" saldria como "inten tions". El espacio va solo donde la
   * propia extension dice que lo hay.
   */
  const { text } = entornoContenido("letras-better-lyrics.html").YTMPip.LyricsReader.read();

  assert.ok(text.includes("bad intentions"), `se partio la palabra: ${text}`);
  assert.ok(!text.includes("inten tions"), "se metio un espacio dentro de la palabra");
});

test("Better Lyrics: la traduccion, la romanizacion y los coros NO se cuelan", () => {
  /*
   * Exactamente la misma trampa del `.footer` de YouTube Music, con otro
   * disfraz: leer el textContent de la linea entera pega la letra, su
   * traduccion y su romanizacion en un solo renglon ilegible.
   *
   * El coro de fondo se colaba de verdad: la clase que se quitaba era
   * `.blyrics-background-line`, que es el nombre de una version de Better
   * Lyrics que aun no han publicado. En la instalada se llama
   * `.blyrics-background-lyric` y no la quitaba nadie.
   */
  const { text } = entornoContenido("letras-better-lyrics.html").YTMPip.LyricsReader.read();

  assert.ok(!text.includes("Caminando"), "la traduccion se coló en el texto");
  assert.ok(!text.includes("wokingu"), "la romanizacion se coló en el texto");
  assert.ok(!text.includes("(tonight)"), "el coro de fondo se coló en el texto");
});

test("Better Lyrics: una linea por renglon y en orden", () => {
  const { text } = entornoContenido("letras-better-lyrics.html").YTMPip.LyricsReader.read();

  assert.deepStrictEqual(text.split("\n"), [
    "Walking down the street tonight",
    "I've come to share bad intentions",
    "♪",
    "I don't know what's wrong or right"
  ]);
});

test("la maquetacion NUEVA de Better Lyrics se lee igual de bien", () => {
  /*
   * Better Lyrics reescribio su DOM y la version nueva aun no esta
   * publicada. Cuando la publiquen llegara sola a los navegadores sin que
   * nosotros toquemos nada, asi que se lee ya: cambia el marcado entero
   * (aparece .blyrics-line-main, los espacios pasan a ser nodos de texto
   * de verdad y las palabras largas duplican su texto en un
   * .blyrics-word-highlight para animarlo).
   *
   * El resultado tiene que ser EXACTAMENTE el mismo que con la publicada.
   */
  const { text } = entornoContenido("letras-better-lyrics-nueva.html").YTMPip.LyricsReader.read();

  assert.deepStrictEqual(text.split("\n"), [
    "Walking down the street tonight",
    "I've come to share bad intentions",
    "♪",
    "I don't know what's wrong or right"
  ]);
  assert.ok(!text.includes("streetstreet"), "el clon de animacion duplico la palabra");
});

test("Better Lyrics: los interludios se marcan, no se pierden en silencio", () => {
  // Una linea instrumental no tiene texto, solo un SVG animado. Si se
  // devolviera vacia, la letra parecia saltar de golpe sin explicacion.
  const { text } = entornoContenido("letras-better-lyrics.html").YTMPip.LyricsReader.read();
  assert.ok(text.includes("♪"), "el interludio desaparecio");
});

test("Better Lyrics: la fuente atribuye al proveedor real, sin el texto del icono", () => {
  /*
   * El enlace del pie lleva el nombre del proveedor MAS un <span> con un
   * SVG, y ese SVG puede traer un <title>. textContent lo concatenaria:
   * "LRCLIBSincronizada palabra a palabra". Por eso solo se leen los nodos
   * de texto directos del enlace.
   */
  const { YTMPip } = entornoContenido("letras-better-lyrics.html");

  assert.strictEqual(YTMPip.Adapter.getBetterLyricsSourceName(), "LRCLIB");
  assert.strictEqual(YTMPip.LyricsReader.read().source, "LRCLIB (Better Lyrics)");
});

test("Better Lyrics sin proveedor legible: sigue diciendo de donde salio", () => {
  const { win, YTMPip } = entornoContenido("letras-better-lyrics.html");
  win.document.getElementById("betterLyricsFooterLink").remove();

  assert.strictEqual(YTMPip.LyricsReader.read().source, "Better Lyrics");
});

test("Better Lyrics dice que tampoco la tiene: no se inventa una letra", () => {
  // data-no-lyrics="true" es la señal explicita de Better Lyrics. Manda
  // sobre las lineas que haya en pantalla (que son su marcador de "no
  // encontrada"), igual que el ytmusic-message-renderer manda en lo nativo.
  const { win, YTMPip } = entornoContenido("letras-better-lyrics.html");
  win.document.querySelector(".blyrics-container").setAttribute("data-no-lyrics", "true");

  assert.strictEqual(YTMPip.LyricsReader.read().status, LYRICS_STATUS.UNAVAILABLE);
});

test("Better Lyrics vacia: se cede el turno a la fuente nativa, no se pisa", () => {
  /*
   * Better Lyrics presente pero sin nada que ofrecer NO puede tapar una
   * letra que YouTube Music si tiene. Que se mire primero no significa que
   * gane siempre: significa que gana cuando tiene algo.
   */
  const { win, YTMPip } = entornoContenido("letras-disponibles.html");
  const contenedor = win.document.createElement("div");
  contenedor.className = "blyrics-container";
  contenedor.setAttribute("data-no-lyrics", "true");
  win.document.body.appendChild(contenedor);

  const letra = YTMPip.LyricsReader.read();
  assert.strictEqual(letra.status, LYRICS_STATUS.AVAILABLE);
  assert.strictEqual(letra.source, "LyricFind");
});

test("sin Better Lyrics instalada no cambia nada", () => {
  // Red anti-regresion: la fuente nueva no debe alterar el comportamiento
  // de quien no tiene la extension. Los fixtures de siempre, intactos.
  const conLetra = entornoContenido("letras-disponibles.html").YTMPip.LyricsReader.read();
  const sinLetra = entornoContenido("letras-no-disponibles.html").YTMPip.LyricsReader.read();

  assert.strictEqual(conLetra.status, LYRICS_STATUS.AVAILABLE);
  assert.strictEqual(conLetra.source, "LyricFind");
  assert.strictEqual(sinLetra.status, LYRICS_STATUS.UNAVAILABLE);
});

test("las sublineas no se cuelan como lineas sueltas de la lista", () => {
  // getBetterLyricsLines usa `:scope >` por esto: un querySelectorAll a
  // secas de .blyrics--line seguiria valiendo aqui, pero si Better Lyrics
  // anida lineas (los coros ya van dentro) empezarian a contarse dos veces.
  const { YTMPip } = entornoContenido("letras-better-lyrics.html");
  assert.strictEqual(YTMPip.Adapter.getBetterLyricsLines().length, 4);
});

/*
 * ---------------- Lineas con tiempo (letra sincronizada) ----------------
 *
 * La ventana flotante resalta la linea que suena y permite saltar a ella.
 * Para eso el lector debe entregar la letra partida en lineas, cada una
 * con su segundo de inicio si se conoce. Los tiempos salen del `data-time`
 * que Better Lyrics pone en cada linea para su propia animacion.
 */

test("Better Lyrics: cada linea trae su tiempo de inicio", () => {
  const { YTMPip } = entornoContenido("letras-better-lyrics.html");
  const letra = YTMPip.LyricsReader.read();

  assert.ok(Array.isArray(letra.lines), "faltan las lineas");
  assert.deepStrictEqual(
    Array.from(letra.lines, (l) => l.time),
    [12.4, 15.6, 18.4, 27.4],
    "los tiempos no coinciden con los data-time del DOM"
  );
  assert.strictEqual(letra.lines[0].text, "Walking down the street tonight");
  assert.strictEqual(letra.lines[2].text, "♪", "el interludio tambien lleva tiempo: es una pausa real");
});

test("la maquetacion NUEVA de Better Lyrics tambien trae los tiempos", () => {
  const { YTMPip } = entornoContenido("letras-better-lyrics-nueva.html");
  const letra = YTMPip.LyricsReader.read();

  assert.deepStrictEqual(
    Array.from(letra.lines, (l) => l.time),
    [12.4, 15.6, 18.4, 27.4]
  );
});

test("letra nativa: lineas SIN tiempo, porque LyricFind no los da", () => {
  /*
   * Aqui lo importante es lo que NO se hace: inventar tiempos. Una letra
   * sin tiempos se muestra por lineas pero no se anima ni permite saltar;
   * time null es la señal de "no se puede sincronizar".
   */
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const letra = YTMPip.LyricsReader.read();

  assert.ok(Array.isArray(letra.lines), "faltan las lineas");
  assert.strictEqual(letra.lines.length, 4);
  assert.ok(
    letra.lines.every((l) => l.time === null),
    "una letra sin data-time no puede traer tiempos inventados"
  );
});

test("unir las lineas reconstruye el texto exacto", () => {
  // El texto plano sigue siendo la firma de cambio y lo que muestran el
  // popup y la ventana de respaldo: lineas y texto no pueden divergir.
  for (const fixture of ["letras-disponibles.html", "letras-better-lyrics.html"]) {
    const letra = entornoContenido(fixture).YTMPip.LyricsReader.read();
    assert.strictEqual(
      letra.lines.map((l) => l.text).join("\n"),
      letra.text,
      `${fixture}: lineas y texto divergen`
    );
  }
});

test("un data-time con basura se convierte en null, no en 0", () => {
  // 0 significaria "esta linea empieza al principio de la cancion", y esa
  // afirmacion no la ha hecho nadie.
  const { win, YTMPip } = entornoContenido("letras-better-lyrics.html");
  win.document.querySelectorAll(".blyrics--line").forEach((l) => l.setAttribute("data-time", "pronto"));

  const letra = YTMPip.LyricsReader.read();
  assert.ok(letra.lines.every((l) => l.time === null), "la basura debia quedar en null");
  assert.strictEqual(letra.status, LYRICS_STATUS.AVAILABLE, "la letra en si sigue valiendo");
});
