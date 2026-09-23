/*
 * DIAGNOSTICO DE LA TRANSPARENCIA DE LA VENTANA FLOTANTE
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com (NO en la de la ventana flotante), CON LA
 * VENTANA FLOTANTE ABIERTA.
 *
 * POR QUE EXISTE
 *
 * Se pidio "una opcion para colocar transparente el pip mientras se
 * reproduce la musica", y lo que se ha implementado atenua el CONTENIDO:
 * baja la opacidad de #ytmpip-root, asi que por debajo asoma el fondo de la
 * propia ventana, no el escritorio. Eso funciona y se ve, pero no es lo
 * mismo que una ventana traslucida de verdad.
 *
 * Si una ventana Document PiP PUEDE llegar a ser traslucida —dejar ver lo
 * que hay detras— no lo se, y no pienso afirmarlo sin medirlo: depende del
 * compositor del sistema y de lo que Chrome decida para este tipo de
 * ventana, y ninguna de las dos cosas se puede preguntar desde JavaScript.
 * Lo unico que puede hacer este script es dejar la ventana en el estado en
 * que SERIA traslucida si el navegador lo permitiera, y que una persona
 * mire.
 *
 * COMO SE USA
 *
 *   1. Coloca la ventana flotante encima de algo con color y facil de
 *      reconocer: el escritorio, una foto, una ventana de otro color. Sobre
 *      un fondo blanco o negro no vas a poder distinguir "transparente" de
 *      "blanco" o de "negro".
 *   2. Pega esto y mira la ventana.
 *   3. Escribe en la consola `ytmpipTransparencia.restaurar()` para
 *      devolverla a la normalidad. Tambien vuelve sola al cerrarla y
 *      abrirla otra vez: esto no toca ningun archivo ni ninguna
 *      preferencia.
 *
 * QUE HAY QUE MIRAR Y QUE SIGNIFICA
 *
 *   - Si ves LO QUE HAY DETRAS (el escritorio, la foto): la ventana admite
 *     alfa de verdad, y entonces si se puede ofrecer transparencia real.
 *   - Si ves BLANCO o NEGRO liso donde antes estaba el fondo: el navegador
 *     compone la ventana sobre un color opaco y NO hay nada que hacer desde
 *     la extension. Lo que ya esta hecho (atenuar el contenido) es todo lo
 *     que se puede dar.
 *   - Si no cambia NADA: alguna regla del CSS esta ganando; avisame y miro,
 *     porque entonces la prueba no ha llegado a hacerse.
 *
 * No envia nada a ningun sitio: solo imprime en consola y toca estilos en
 * vivo de una ventana que se va a cerrar.
 */
(function () {
  const log = (...args) => console.log("%c[transparencia]", "color:#5ac8f1;font-weight:bold", ...args);

  /*
   * DE QUE CONSOLA SE HA PEGADO ESTO
   *
   * La primera version exigia la consola de la pestaña y, si no, decia "no
   * hay ventana flotante abierta". Se pego en la consola de la PROPIA
   * ventana flotante —que es lo natural: es la ventana de la que se quiere
   * saber algo— y el mensaje fue una mentira con la ventana delante.
   *
   * Las dos consolas son sitios legitimos y se distinguen sin ambigüedad:
   *
   *  - En la pestaña, `documentPictureInPicture.window` apunta a la ventana
   *    flotante. Es la referencia que el navegador le da a QUIEN LA ABRIO.
   *  - En la ventana flotante esa misma propiedad es null, y no significa
   *    que no haya ninguna: significa que ESTA ventana no ha abierto otra.
   *    Ella es la abierta. Se reconoce porque su documento es el nuestro.
   *
   * Preguntar por `#ytmpip-root` sirve para las dos cosas a la vez: dice si
   * estamos dentro, y dice si la ventana ha llegado a montarse.
   */
  function objetivo() {
    const dpip = self.documentPictureInPicture;
    if (dpip && dpip.window && !dpip.window.closed) {
      return { win: dpip.window, desde: "la pestaña" };
    }
    if (self.document && self.document.getElementById("ytmpip-root")) {
      return { win: self, desde: "la propia ventana flotante" };
    }
    return null;
  }

  const encontrada = objetivo();
  if (!encontrada) {
    if (typeof documentPictureInPicture === "undefined") {
      log("este navegador no expone la API de Document Picture-in-Picture.");
    } else {
      log("no encuentro la ventana flotante ni desde aqui ni como ventana propia.");
      log("Vale cualquiera de las dos consolas: la de la pestaña de music.youtube.com");
      log("o la de la propia ventana flotante (boton derecho dentro -> Inspeccionar).");
      log("Si esta abierta y aun asi sale esto, es que no ha llegado a montarse.");
    }
    return;
  }

  const win = encontrada.win;
  const doc = win.document;
  const root = doc.getElementById("ytmpip-root");
  log("ventana flotante encontrada desde:", encontrada.desde);

  if (!root) {
    log("La ventana esta abierta pero no tiene #ytmpip-root: no ha llegado a montarse.");
    return;
  }

  /*
   * Lo que se ve AHORA, antes de tocar nada. Importa que quede escrito: si
   * el fondo ya viniera con alfa, media pregunta estaria contestada, y si
   * el atenuado del contenido no estuviera puesto, lo que se mire despues
   * no diria nada del efecto que se acaba de implementar.
   */
  const html = doc.documentElement;
  const cuerpo = doc.body;

  log("--- como esta la ventana ahora ---");
  log("mide", html.clientWidth + "x" + html.clientHeight);
  log("clases de #ytmpip-root:", root.className || "(ninguna)");
  log("fondo de <html>:", win.getComputedStyle(html).backgroundColor);
  log("fondo de <body>:", win.getComputedStyle(cuerpo).backgroundColor);
  log("fondo de #ytmpip-root:", win.getComputedStyle(root).backgroundColor);
  log(
    "opacidad de #ytmpip-root:",
    win.getComputedStyle(root).opacity,
    "(la variable dice:",
    (root.style.getPropertyValue("--ytmpip-opacidad") || "(sin escribir)") + ")"
  );

  /*
   * El experimento. Se quitan los tres fondos opacos que hay entre el
   * contenido y el compositor del sistema; si queda uno solo, lo unico que
   * se veria es ese, y la prueba no probaria nada.
   *
   * Se guarda el valor exacto que tenia el atributo `style` de cada uno
   * —no el calculado— porque es lo unico que devuelve el elemento a como
   * estaba, incluido "no tenia nada escrito".
   */
  const antes = [html, cuerpo, root].map((el) => [el, el.getAttribute("style")]);

  html.style.background = "transparent";
  cuerpo.style.background = "transparent";
  root.style.background = "transparent";
  // El fondo difuminado de la portada tapa la ventana entera y es opaco de
  // sobra: dejarlo puesto seria mirar la portada, no el escritorio.
  const fondo = doc.getElementById("ytmpip-backdrop");
  if (fondo) {
    antes.push([fondo, fondo.getAttribute("style")]);
    fondo.style.display = "none";
  }

  log("--- hecho: los fondos estan quitados ---");
  log("MIRA LA VENTANA FLOTANTE AHORA. Detras de los botones y el texto:");
  log("  ¿se ve lo que hay debajo (escritorio, foto)?  → la transparencia real es posible");
  log("  ¿se ve blanco o negro liso?                   → el navegador la compone opaca");
  log("Para dejarlo como estaba: ytmpipTransparencia.restaurar()");

  /*
   * Se cuelga de la pestaña y no de la ventana flotante a proposito: la
   * consola en la que se ha pegado esto es la de la pestaña, y ahi es donde
   * se va a escribir restaurar().
   */
  window.ytmpipTransparencia = {
    restaurar() {
      for (const [el, valor] of antes) {
        if (valor === null) el.removeAttribute("style");
        else el.setAttribute("style", valor);
      }
      log("restaurado.");
    }
  };
})();
