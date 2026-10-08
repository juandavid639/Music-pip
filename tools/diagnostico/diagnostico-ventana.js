/*
 * DIAGNOSTICO DE LA MAQUETACION DE LA VENTANA FLOTANTE
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com (NO en la de la ventana flotante), CON LA
 * VENTANA FLOTANTE ABIERTA. Llega hasta ella por
 * `documentPictureInPicture.window`, que es la referencia que el navegador
 * le da a la pagina que la abrio.
 *
 * Existe por dos sintomas reportados sobre un pantallazo que yo no consigo
 * reproducir en tools/vista-previa.html: la cabecera (Conectado, ⤢, ✕) no
 * se ve, y "aparece algo de mas debajo de los controles". A los mismos
 * tamaños, la vista previa pinta las dos cosas en su sitio, asi que la
 * diferencia no esta en el CSS de densidad sino en el estado real de la
 * ventana. Antes de tocar nada hay que saber cual.
 *
 * Lo que hay que mirar en la salida:
 *   - "desplazamiento": si algo distinto de 0, el contenido esta scrolleado
 *     y por eso se pierde la cabecera por arriba.
 *   - cada fila dice si esta DENTRO o FUERA del alto visible. Lo que salga
 *     FUERA es lo que el usuario no ve.
 *   - "sobra" avisa de contenido mas alto que la ventana.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[ventana]", "color:#f15a5a;font-weight:bold", ...args);

  if (typeof documentPictureInPicture === "undefined" || !documentPictureInPicture.window) {
    log("No hay ventana flotante abierta, o este navegador no expone la API.");
    log("Abre la ventana desde la extension y vuelve a pegar esto AQUI, en la consola de la pestaña.");
    return;
  }

  const win = documentPictureInPicture.window;
  const doc = win.document;
  const root = doc.getElementById("ytmpip-root");

  if (!root) {
    log("La ventana esta abierta pero no tiene #ytmpip-root: no ha llegado a montarse.");
    return;
  }

  const alto = doc.documentElement.clientHeight;
  const ancho = doc.documentElement.clientWidth;

  log("--- la ventana ---");
  log("mide", ancho + "x" + alto);
  log("clases de #ytmpip-root:", root.className || "(ninguna)");

  /*
   * LA BARRA DE ARRIBA: CUANTO CUESTA Y POR QUE NO SE PUEDE QUITAR
   *
   * Se pidio esconder la barra que pone "music.youtube.com". No se puede, y
   * este bloque esta para que esa respuesta venga con un numero en vez de
   * con una afirmacion mia: `outerHeight - innerHeight` es exactamente lo
   * que se queda el navegador, o sea lo que se ganaria si se pudiera.
   *
   * No se puede porque esa barra no es documento, es cromo del navegador, y
   * lleva dos cosas que Chrome no deja esconder: el ORIGEN y la X. Una
   * ventana pequeña, siempre encima de las demas y sin decir de que sitio
   * viene seria un formulario de contraseñas perfecto para suplantar a
   * cualquiera. Lo unico que la especificacion deja tocar de esa barra es
   * `disallowReturnToOpener`, que quita el boton de volver a la pestaña;
   * el origen y la X se quedan siempre.
   *
   * Si algun dia esto imprime 0, es que el navegador ha cambiado de idea y
   * hay que volver a mirarlo.
   */
  const barra = win.outerHeight - win.innerHeight;
  const bordes = win.outerWidth - win.innerWidth;
  log("--- lo que se lleva el navegador (barra de titulo y bordes) ---");
  log("por fuera", win.outerWidth + "x" + win.outerHeight, "· por dentro", win.innerWidth + "x" + win.innerHeight);
  log(
    "la barra ocupa", barra + "px de alto",
    win.outerHeight > 0 ? "(" + ((barra / win.outerHeight) * 100).toFixed(1) + " % del alto total)" : "",
    bordes ? "· bordes laterales " + bordes + "px" : "· sin bordes laterales"
  );
  log("no se puede esconder: lleva el origen y la X, y eso Chrome no lo cede.");

  const contenido = doc.querySelector(".ytmpip-content");
  log("--- desplazamiento (deberia ser 0 en todo) ---");
  log("documentElement.scrollTop:", doc.documentElement.scrollTop);
  log("body.scrollTop:", doc.body.scrollTop);
  log("content.scrollTop:", contenido ? contenido.scrollTop : "(sin .ytmpip-content)");
  if (contenido) {
    const sobra = contenido.scrollHeight - contenido.clientHeight;
    log("content mide", contenido.scrollHeight, "y le caben", contenido.clientHeight, sobra > 0 ? "→ SOBRAN " + sobra + "px" : "→ cabe entero");
  }

  /*
   * El orden es el del documento: asi la lista se lee como la ventana de
   * arriba abajo y se ve de un vistazo donde se corta.
   */
  const FILAS = [
    [".ytmpip-header", "cabecera"],
    ["#ytmpip-status", "estado (Conectado)"],
    ["#ytmpip-video-toggle", "boton video/caratula"],
    ["#ytmpip-expand-toggle", "boton tamaño"],
    ["#ytmpip-close", "boton cerrar"],
    [".ytmpip-stage", "escenario (portada o video)"],
    [".ytmpip-info", "titulo y artista"],
    ["#ytmpip-now-line", "linea que suena"],
    [".ytmpip-progress-row", "barra de progreso"],
    [".ytmpip-controls", "transporte"],
    [".ytmpip-extras", "extras (volumen, me gusta…)"],
    [".ytmpip-secondary-actions", "Letras / Volver a YouTube Music"],
    [".ytmpip-lyrics-panel", "panel de letra"]
  ];

  log("--- que se ve y que no ---");
  for (const [sel, nombre] of FILAS) {
    const el = doc.querySelector(sel);
    if (!el) {
      log(nombre.padEnd(30), "NO EXISTE en el DOM");
      continue;
    }
    const cs = win.getComputedStyle(el);
    if (cs.display === "none") {
      log(nombre.padEnd(30), "oculto por CSS (display:none)");
      continue;
    }
    if (el.hidden) {
      log(nombre.padEnd(30), "oculto por el atributo hidden");
      continue;
    }
    const r = el.getBoundingClientRect();
    const arriba = Math.round(r.top);
    const abajo = Math.round(r.bottom);
    const fuera = abajo <= 0 || arriba >= alto;
    const cortado = !fuera && (arriba < 0 || abajo > alto);
    const veredicto = fuera ? "FUERA de la ventana" : cortado ? "CORTADO" : "dentro";
    log(nombre.padEnd(30), "y=" + arriba + ".." + abajo, "opacidad=" + cs.opacity, "→", veredicto);
  }

  /*
   * "Algo de mas debajo de los controles": lo que sea, es un elemento. Se
   * listan TODOS los hijos visibles por debajo del transporte, con su
   * texto, para poder ponerle nombre en vez de seguir describiendolo.
   */
  const transporte = doc.querySelector(".ytmpip-controls");
  if (transporte) {
    const limite = transporte.getBoundingClientRect().bottom;
    log("--- que hay por debajo del transporte (y >", Math.round(limite) + ") ---");
    let encontrado = false;
    for (const el of doc.querySelectorAll("#ytmpip-root *")) {
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.top < limite) continue;
      // Solo el elemento mas externo de cada rama: si no, sale el boton y
      // ademas cada uno de sus padres diciendo lo mismo.
      if (el.parentElement && el.parentElement.getBoundingClientRect().top >= limite) continue;
      encontrado = true;
      const texto = (el.textContent || "").trim().slice(0, 40);
      log("·", el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).split(" ").join(".") : ""),
        "y=" + Math.round(r.top) + ".." + Math.round(r.bottom),
        texto ? "texto: " + JSON.stringify(texto) : "(sin texto)");
    }
    if (!encontrado) log("nada: el transporte es lo ultimo que se pinta.");
  }

  /*
   * El boton de video/caratula solo aparece si la cancion trae imagen, y eso
   * se decide con el tamaño real del <video>. En modo "cancion" YouTube
   * Music reproduce solo audio y el <video> existe pero mide 0x0.
   */
  log("--- por que sale o no el boton de video ---");
  const prestado = doc.querySelector("video");
  const enPagina = document.querySelector("video");
  const v = prestado || enPagina;
  log("el <video> esta", prestado ? "prestado a la ventana" : enPagina ? "todavia en la pagina" : "en ningun sitio");
  if (v) {
    log("mide", v.videoWidth + "x" + v.videoHeight, v.videoWidth > 0 && v.videoHeight > 0 ? "→ hay imagen: el boton DEBE salir" : "→ solo audio: el boton se oculta a proposito");
  }
})();
