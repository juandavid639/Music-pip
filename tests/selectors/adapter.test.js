/*
 * Pruebas del adaptador: la unica capa que sabe como es el DOM de
 * YouTube Music.
 *
 * Dos cosas concretas se blindan aqui.
 *
 * 1. La honestidad del estado. "Me gusta" se puede saber (sale de un
 *    atributo, no de una etiqueta traducida); repetir y aleatorio no
 *    siempre. La tentacion de deducirlos del aria-label existe y seria un
 *    error: la interfaz mostraria un estado inventado que no cambia al
 *    pulsar. Los tests fijan que "no se sabe" se devuelve como undefined.
 *
 * 2. El prestamo del <video>. Al mostrarlo en la ventana flotante el
 *    elemento se MUEVE de documento, asi que un querySelector sobre la
 *    pagina deja de encontrarlo. Sin la referencia prestada se romperia
 *    todo lo demas (play, pausa, tiempo, volumen), porque todo pasa por
 *    getMediaElement().
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido, documentoFlotante, conTiempos } = require("../helpers/entorno.js");

/*
 * jsdom no reproduce nada: `paused` es un getter que siempre devuelve
 * true. Para simular un video SONANDO hay que redefinir la propiedad,
 * igual que hace conTiempos con `duration`.
 */
function sonando(video) {
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  return video;
}
const CONSTANTS = require("../helpers/constantes.js");

test("getLikeStatus lee el atributo like-status, no la etiqueta traducida", () => {
  const { YTMPip } = entornoContenido("controles-completos.html");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), CONSTANTS.LIKE_STATUS.LIKE);
});

test("getLikeStatus normaliza a mayusculas", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  win.document.querySelector("ytmusic-like-button-renderer").setAttribute("like-status", "dislike");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), CONSTANTS.LIKE_STATUS.DISLIKE);
});

test("un like-status desconocido se descarta en vez de propagarse", () => {
  // Si Google añadiera un valor nuevo, preferimos "no se sabe" a pintar un
  // corazon a partir de una cadena que no entendemos.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  win.document.querySelector("ytmusic-like-button-renderer").setAttribute("like-status", "SUPERLIKE");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), undefined);
});

test("sin renderer de me gusta, getLikeStatus devuelve undefined", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  assert.strictEqual(YTMPip.Adapter.getLikeStatus(), undefined);
});

test("isToggleActive devuelve true con aria-pressed explicito", () => {
  // Se pone a mano: el fixture ya no trae ningun boton con aria-pressed,
  // porque la pagina real tampoco. Lo que se prueba aqui es la regla, no
  // que YouTube Music la cumpla (no la cumple).
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  win.document.querySelector(".shuffle").setAttribute("aria-pressed", "true");
  assert.strictEqual(YTMPip.Adapter.isToggleActive(YTMPip.Adapter.getShuffleButton()), true);
});

test("EL SINTOMA REPORTADO: el boton de repetir de verdad no trae aria-pressed", () => {
  /*
   * "se oprime el boton de repetir pero no se si esta activo o no".
   * Comprobado en la pagina real: aria-pressed es null. Por eso
   * isToggleActive se abstenia siempre y el boton no se encendia nunca.
   * Esta prueba fija la premisa; el estado se lee ahora de la barra.
   */
  const { YTMPip } = entornoContenido("controles-completos.html");
  const boton = YTMPip.Adapter.getRepeatButton();

  assert.ok(boton, "el boton tiene que seguir encontrandose");
  assert.strictEqual(boton.getAttribute("aria-pressed"), null);
  assert.strictEqual(YTMPip.Adapter.isToggleActive(boton), undefined);
});

test("getRepeatMode lee las tres posiciones de la barra", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const barra = win.document.querySelector("ytmusic-player-bar");

  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), "ONE");
  for (const modo of ["NONE", "ALL", "ONE"]) {
    barra.setAttribute("repeat-mode", modo);
    assert.strictEqual(YTMPip.Adapter.getRepeatMode(), modo);
  }
});

test("un modo de repeticion que no conocemos se trata como desconocido", () => {
  // Si YouTube Music inventa un modo nuevo, preferimos no decir nada a
  // pintar algo que no entendemos.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  win.document.querySelector("ytmusic-player-bar").setAttribute("repeat-mode", "SHUFFLE_ONE");

  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), undefined);
});

test("sin barra de reproductor no hay modo de repeticion", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  assert.strictEqual(YTMPip.Adapter.getRepeatMode(), undefined);
});

test("REGRESION: sin aria-pressed el estado es undefined, NO false", () => {
  // El fixture deja el boton de aleatorio sin aria-pressed. Devolver false
  // seria afirmar que esta apagado sin haberlo comprobado; la ventana
  // flotante lo pintaria como inactivo aunque estuviera activo.
  const { YTMPip } = entornoContenido("controles-completos.html");
  const estado = YTMPip.Adapter.isToggleActive(YTMPip.Adapter.getShuffleButton());

  assert.strictEqual(estado, undefined, `se esperaba undefined y llego ${estado}`);
});

test("isToggleActive devuelve false con aria-pressed=\"false\"", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  win.document.querySelector(".shuffle").setAttribute("aria-pressed", "false");
  assert.strictEqual(YTMPip.Adapter.isToggleActive(YTMPip.Adapter.getShuffleButton()), false);
});

test("isToggleActive sin boton no lanza", () => {
  const { YTMPip } = entornoContenido("vacio.html");
  assert.strictEqual(YTMPip.Adapter.isToggleActive(null), undefined);
});

test("los botones de me gusta y no me gusta se distinguen", () => {
  const { YTMPip } = entornoContenido("controles-completos.html");
  const like = YTMPip.Adapter.getLikeButton();
  const dislike = YTMPip.Adapter.getDislikeButton();

  assert.ok(like, "no se encontro el boton de me gusta");
  assert.ok(dislike, "no se encontro el boton de no me gusta");
  assert.notStrictEqual(like, dislike, "ambos selectores apuntan al mismo boton");
  assert.strictEqual(like.parentNode.id, "button-shape-like");
  assert.strictEqual(dislike.parentNode.id, "button-shape-dislike");
});

test("REGRESION: el video prestado sigue siendo el elemento multimedia activo", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const video = YTMPip.Adapter.getPageMediaElement();
  const pip = documentoFlotante(win);

  // Esto es exactamente lo que hace la ventana flotante: cambiar el
  // elemento de documento.
  pip.body.appendChild(video);
  YTMPip.Adapter.setBorrowedMedia(video);

  assert.strictEqual(
    win.document.querySelector("video"),
    null,
    "premisa de la prueba: desde la pagina ya no deberia verse ningun <video>"
  );
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), video);
});

test("al devolver el video, getMediaElement vuelve a encontrarlo por selector", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const video = YTMPip.Adapter.getPageMediaElement();
  const contenedor = video.parentNode;
  const pip = documentoFlotante(win);

  pip.body.appendChild(video);
  YTMPip.Adapter.setBorrowedMedia(video);

  // Cierre de la ventana flotante: se reinserta y se cancela el prestamo.
  contenedor.appendChild(video);
  YTMPip.Adapter.setBorrowedMedia(null);

  assert.strictEqual(YTMPip.Adapter.getMediaElement(), video);
  assert.strictEqual(video.parentNode, contenedor, "el video debe volver a su sitio original");
});

test("un video prestado suelto, sin documento, se descarta", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const viejo = win.document.createElement("video");
  YTMPip.Adapter.setBorrowedMedia(viejo);

  const actual = YTMPip.Adapter.getMediaElement();
  assert.notStrictEqual(actual, viejo);
  assert.strictEqual(actual, YTMPip.Adapter.getPageMediaElement());
});

test("REGRESION: el prestamo caduca si YouTube Music se hace un <video> nuevo", () => {
  /*
   * Este es el caso que de verdad ocurre, y el que no estaba cubierto.
   *
   * Habia una comprobacion `borrowedMedia.isConnected` con un comentario
   * diciendo que servia para descartar un elemento que YouTube Music
   * hubiera destruido. No servia para nada: el elemento prestado vive en el
   * documento de la ventana flotante, donde isConnected es SIEMPRE true.
   * La condicion no podia ser falsa mientras el prestamo estuviera vigente,
   * asi que la proteccion que el comentario prometia no existia.
   *
   * La prueba anterior pasaba igualmente porque usaba un <video> creado y
   * nunca insertado en ningun sitio: eso si tiene isConnected false, pero
   * es una situacion que no se da. El elemento prestado SIEMPRE esta en un
   * documento.
   *
   * Consecuencia real: si YouTube Music se fabrica un <video> nuevo para la
   * pista siguiente, le seguiamos leyendo el tiempo al viejo, que ya no es
   * el que suena.
   *
   * NOTA POSTERIOR. Este test afirmaba antes algo mas fuerte: que bastaba
   * con que la pagina tuviera CUALQUIER <video> distinto para caducar el
   * prestamo. Eso era lo que pedia el codigo que yo habia escrito, y ese
   * codigo provoco la cuarta aparicion del fallo (ver el test de mas
   * abajo). El prestamo caduca, si, pero hace falta una prueba: aqui la
   * pista prestada ya termino.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const prestado = conTiempos(YTMPip.Adapter.getPageMediaElement(), 223, 223);
  const pip = documentoFlotante(win);

  pip.body.appendChild(prestado);
  YTMPip.Adapter.setBorrowedMedia(prestado);
  assert.strictEqual(prestado.isConnected, true,
    "premisa: dentro del documento del PiP el elemento SIGUE conectado");

  // YouTube Music encadena la siguiente pista y se crea su propio <video>.
  const nuevo = win.document.createElement("video");
  YTMPip.Adapter.getPlayerContainer().appendChild(nuevo);

  assert.strictEqual(YTMPip.Adapter.getMediaElement(), nuevo,
    "se seguia contestando con el video prestado, que ya no es el que suena");
});

test("REGRESION: un cadaver A MEDIAS en la pagina no le quita el sitio al video prestado", () => {
  /*
   * LA CUARTA APARICION DEL FALLO, y la unica que provoque yo.
   *
   * La captura: la ventana flotante marcaba 7:46 de 9:00 y YouTube Music
   * iba por 0:35 de 3:40. Que la DURACION tambien estuviera mal es lo que
   * lo delato: una barra congelada mantiene su duracion, asi que aquello
   * no era una barra parada sino el <video> equivocado, leido en vivo.
   *
   * El arreglo anterior decia "si la pagina tiene un <video> distinto del
   * prestado, el prestado ya no vale". La justificacion parecia solida (el
   * nuestro nos lo llevamos, luego cualquier otro es nuevo) y le faltaba
   * un caso: el <video> que queda cuando el usuario SE SALTA una cancion
   * por la mitad. Ese ni es el nuestro ni es el que suena, y como no habia
   * llegado al final ninguna comprobacion lo rechazaba.
   *
   * Los numeros son los de la captura, en segundos.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const prestado = conTiempos(YTMPip.Adapter.getPageMediaElement(), 35, 220);
  const pip = documentoFlotante(win);

  pip.body.appendChild(prestado);
  YTMPip.Adapter.setBorrowedMedia(prestado);

  // 7:46 de 9:00: pausado, pero lejisimos de su final.
  const saltada = conTiempos(win.document.createElement("video"), 466, 540);
  YTMPip.Adapter.getPlayerContainer().appendChild(saltada);

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), saltada,
    "premisa: mirando solo la pagina, el cadaver es el unico candidato");
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), prestado,
    "se contestaba con el cadaver: de ahi el 7:46 de 9:00 de la captura");
  assert.strictEqual(YTMPip.Adapter.getReplacementFor(prestado), null,
    "y con ese relevo falso, syncVideoMode TIRABA el video que estaba sonando");
});

test("un <video> de la pagina que SUENA si releva al prestado", () => {
  // La otra mitad: desconfiar no puede convertirse en no soltar nunca. Si
  // en la pagina hay algo reproduciendose, eso es la cancion de ahora
  // aunque el prestado no haya llegado a su final (el usuario se la salto).
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const prestado = conTiempos(YTMPip.Adapter.getPageMediaElement(), 35, 220);
  const pip = documentoFlotante(win);

  pip.body.appendChild(prestado);
  YTMPip.Adapter.setBorrowedMedia(prestado);

  const nueva = sonando(conTiempos(win.document.createElement("video"), 3, 187));
  YTMPip.Adapter.getPlayerContainer().appendChild(nueva);

  assert.strictEqual(YTMPip.Adapter.getReplacementFor(prestado), nueva);
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), nueva);
});

test("getReplacementFor no ve relevo donde no hay nada que relevar", () => {
  // Sin <video> en la pagina (el caso normal en modo video: nos lo hemos
  // llevado nosotros) y con el propio prestado como candidato.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const prestado = conTiempos(YTMPip.Adapter.getPageMediaElement(), 35, 220);

  assert.strictEqual(YTMPip.Adapter.getReplacementFor(prestado), null,
    "el prestado no puede relevarse a si mismo");

  documentoFlotante(win).body.appendChild(prestado);
  YTMPip.Adapter.setBorrowedMedia(prestado);

  assert.strictEqual(win.document.querySelector("video"), null, "premisa de la prueba");
  assert.strictEqual(YTMPip.Adapter.getReplacementFor(prestado), null);
  assert.strictEqual(YTMPip.Adapter.getReplacementFor(null), null, "sin prestamo no hay relevo");
});

test("mientras la pagina no tenga <video> propio, el prestamo sigue vigente", () => {
  // La otra mitad: no vale con desconfiar del prestamo siempre. Durante el
  // funcionamiento normal la pagina NO tiene video (nos lo llevamos), y el
  // prestado tiene que seguir siendo la respuesta.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const prestado = YTMPip.Adapter.getPageMediaElement();
  const pip = documentoFlotante(win);

  pip.body.appendChild(prestado);
  YTMPip.Adapter.setBorrowedMedia(prestado);

  assert.strictEqual(win.document.querySelector("video"), null, "premisa de la prueba");
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), prestado);
});

test("un <video> muerto reinsertado YA NO gana: el adaptador elige el vivo", () => {
  /*
   * Historia de este test, porque su afirmacion se ha INVERTIDO.
   *
   * Antes fijaba un hecho incomodo: pip.js devolvia el video prestado a
   * su posicion ORIGINAL, ANTES del nuevo en el orden del documento, y
   * como el adaptador se quedaba con el primero que encontraba, el
   * cadaver volvia a ganar y la ventana seguia congelada. Ese hecho
   * justificaba que discardVideo() lo tirase en vez de devolverlo.
   *
   * discardVideo() sigue existiendo (evita acumular un <video> huerfano
   * por cancion), pero ya no es la unica defensa: el adaptador ahora mira
   * TODOS los candidatos y descarta al que ya termino de sonar. Asi que
   * aunque el cadaver se reinserte delante, pierde.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const viejo = YTMPip.Adapter.getPageMediaElement();
  const padre = viejo.parentNode;
  const siguiente = viejo.nextSibling;
  const pip = documentoFlotante(win);

  conTiempos(viejo, 223, 223); // parado al final: la firma de un cadaver
  pip.body.appendChild(viejo);
  YTMPip.Adapter.setBorrowedMedia(viejo);

  const nuevo = conTiempos(win.document.createElement("video"), 16, 209);
  YTMPip.Adapter.getPlayerContainer().appendChild(nuevo);

  // Esto es exactamente lo que hacia returnVideo(): reinsertarlo en su sitio.
  if (siguiente && siguiente.parentNode === padre) padre.insertBefore(viejo, siguiente);
  else padre.appendChild(viejo);
  YTMPip.Adapter.setBorrowedMedia(null);

  assert.strictEqual(win.document.querySelectorAll("video").length, 2, "premisa: quedan los dos");
  assert.strictEqual(
    YTMPip.Adapter.getPageMediaElement(),
    nuevo,
    "reinsertado delante y todo, el muerto ya no debe ganarle al bueno"
  );
});

test("REGRESION: el cadaver que YouTube Music abandona en SU pagina ya no congela el tiempo", () => {
  /*
   * El caso que discardVideo() NO cubria, reportado dos veces como "se
   * junta el tiempo entre canciones".
   *
   * En modo caratula no hay prestamo: el <video> nunca sale de la pagina.
   * Al encadenar pistas, YouTube Music a veces abandona el elemento de la
   * cancion anterior en el DOM, DELANTE del nuevo. Nuestro discardVideo()
   * solo tiraba cadaveres fabricados por nosotros; este es de YouTube
   * Music y ahi se queda. El sintoma de la captura del usuario: titulo de
   * la cancion nueva con la barra clavada al 90%, porque el tiempo se
   * leia del video viejo.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const cadaver = conTiempos(YTMPip.Adapter.getPageMediaElement(), 223, 223);

  const nuevo = sonando(conTiempos(win.document.createElement("video"), 16, 209));
  YTMPip.Adapter.getPlayerContainer().appendChild(nuevo);

  assert.strictEqual(
    win.document.querySelectorAll("video")[0],
    cadaver,
    "premisa: el cadaver esta primero en el orden del documento"
  );
  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), nuevo);
  assert.strictEqual(YTMPip.Adapter.getMediaElement(), nuevo,
    "getMediaElement sin prestamo tambien debe elegir al vivo");
});

test("con los dos en pausa, gana el que va A MEDIAS, no el que ya termino", () => {
  /*
   * Usuario con la pausa puesta a mitad de cancion: ninguno esta
   * `!paused`, asi que decide el segundo criterio. El cadaver se pone el
   * ULTIMO en el orden del documento a proposito: si este test pasara
   * solo por "gana el ultimo", el filtro de terminados seria decorativo
   * y una mutacion que lo borre pasaria sin ruido.
   */
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const aMedias = conTiempos(YTMPip.Adapter.getPageMediaElement(), 16, 209);

  // 222.7 de 223: los reproductores casi nunca llegan al ultimo
  // milisegundo antes de encadenar. El margen de medio segundo del
  // adaptador existe exactamente para esto.
  const cadaver = conTiempos(win.document.createElement("video"), 222.7, 223);
  YTMPip.Adapter.getPlayerContainer().appendChild(cadaver);

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), aMedias);
});

test("uno SONANDO le gana a uno pausado a medias, este despues en el documento", () => {
  // Sin el primer criterio, ambos son "no terminados" y ganaria el ultimo
  // del documento, que aqui es el pausado. El orden esta elegido para que
  // solo el filtro de reproduccion pueda dar la respuesta correcta.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const activo = sonando(conTiempos(YTMPip.Adapter.getPageMediaElement(), 16, 209));

  const pausado = conTiempos(win.document.createElement("video"), 40, 180);
  YTMPip.Adapter.getPlayerContainer().appendChild(pausado);

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), activo);
});

test("en empate total decide el orden del documento: gana el mas reciente", () => {
  // Dos videos pausados a medias: ninguno esta sonando y ninguno ha
  // terminado, asi que no hay señal de reproduccion que valga. Queda el
  // unico dato util: YouTube Music añade los elementos nuevos DESPUES de
  // abandonar los viejos, asi que el ultimo del documento es el actual.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  conTiempos(YTMPip.Adapter.getPageMediaElement(), 40, 180);

  const reciente = conTiempos(win.document.createElement("video"), 0, 195);
  YTMPip.Adapter.getPlayerContainer().appendChild(reciente);

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), reciente);
});

test("un video recien creado sin metadatos (duration NaN) no cuenta como terminado", () => {
  // Al arrancar la pista siguiente el <video> nuevo aun no cargo
  // metadatos: duration es NaN y currentTime 0. Declararlo "terminado"
  // seria devolver el cadaver justo en el peor momento.
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  conTiempos(YTMPip.Adapter.getPageMediaElement(), 223, 223);

  const recien = win.document.createElement("video"); // duration NaN de serie
  YTMPip.Adapter.getPlayerContainer().appendChild(recien);

  assert.strictEqual(YTMPip.Adapter.getPageMediaElement(), recien);
});

test("getPageMediaElement ignora el prestamo", () => {
  const { win, YTMPip } = entornoContenido("controles-completos.html");
  const impostor = win.document.createElement("video");
  win.document.body.appendChild(impostor);
  YTMPip.Adapter.setBorrowedMedia(impostor);

  assert.notStrictEqual(YTMPip.Adapter.getPageMediaElement(), impostor);
});

test("getPlayerContainer localiza el contenedor al que devolver el video", () => {
  const { YTMPip } = entornoContenido("controles-completos.html");
  assert.strictEqual(YTMPip.Adapter.getPlayerContainer().id, "movie_player");
});
