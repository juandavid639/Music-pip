/*
 * DIAGNOSTICO: ¿QUE MIDE UNA VENTANA FLOTANTE?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON LA VENTANA FLOTANTE ABIERTA. No hay que
 * abrir las DevTools de la ventanita: se llega a ella desde la pestaña con
 * documentPictureInPicture.window.
 *
 * POR QUE EXISTE
 *
 * La ventana ya recuerda su tamaño. Para eso hay que hacer dos cosas que
 * parecen la misma y no lo son: MEDIR la ventana cuando el usuario suelta
 * el borde, y PEDIR ese tamaño al abrirla la vez siguiente.
 *
 * Una ventana tiene dos tamaños: el hueco donde se pinta (innerWidth) y la
 * ventana entera (outerWidth), que incluye lo que el navegador ponga
 * alrededor. Si se midiera uno y se pidiera el otro, la ventana cambiaria
 * de tamaño sola UN POCO EN CADA SESION: se piden 300, salen 270, se
 * anotan 270, se piden 270, salen 240… hasta quedarse en el minimo. Es un
 * fallo que no se ve el primer dia, que ninguna prueba puede pillar —jsdom
 * no tiene ventanas flotantes de verdad— y que cuando se nota ya lleva
 * semanas pasando.
 *
 * La extension anota el EXTERIOR. Esto comprueba que esa eleccion es la
 * correcta en tu Chrome, en vez de que yo lo de por hecho.
 *
 * QUE MIDE, Y POR QUE CADA COSA
 *
 *   A. Si la ventana flotante expone outerWidth/outerHeight y cuanto se
 *      diferencian del interior. Si la diferencia es 0, cualquiera de las
 *      dos medidas vale y no hay nada que temer. Si no lo es, el numero
 *      que salga aqui es exactamente lo que se encogeria por sesion.
 *   B. Que entiende resizeTo(): si al pedirle un tamaño acaba siendo el
 *      exterior o el interior. Es la misma pregunta que le corresponde a
 *      requestWindow() al abrir, y es la unica de las dos que se puede
 *      medir sin un clic del usuario.
 *
 * Devuelve la ventana a su tamaño original al terminar. No toca la pagina
 * ni envia nada a ningun sitio.
 */
(function () {
  const log = (...args) => console.log("%c[tamaño]", "color:#5ac8f1;font-weight:bold", ...args);
  const mal = (...args) => console.log("%c[tamaño]", "color:#f15a5a;font-weight:bold", ...args);

  if (typeof documentPictureInPicture === "undefined") {
    mal("Este Chrome no tiene documentPictureInPicture.");
    mal("VEREDICTO: no aplica; en este navegador la extension usa la ventana de reserva.");
    return;
  }

  const w = documentPictureInPicture.window;
  if (!w || w.closed) {
    mal("No hay ninguna ventana flotante abierta.");
    mal("Abrela con el boton de la extension y vuelve a pegar esto.");
    return;
  }

  function medir() {
    return {
      interior: { w: w.innerWidth, h: w.innerHeight },
      exterior: { w: w.outerWidth, h: w.outerHeight }
    };
  }

  const inicial = medir();

  log("--- A. las dos medidas de la ventana ---");
  log("interior (donde se pinta):", inicial.interior.w + "x" + inicial.interior.h);
  log("exterior (la ventana entera):", inicial.exterior.w + "x" + inicial.exterior.h);

  if (!inicial.exterior.w || !inicial.exterior.h) {
    mal("La ventana flotante NO expone outerWidth/outerHeight (salen 0 o vacios).");
    mal("La extension cae al interior, que es lo unico que hay. Avisame igualmente:");
    mal("significa que el tamaño puede encoger entre sesiones y hay que medir cuanto.");
    return;
  }

  const margenW = inicial.exterior.w - inicial.interior.w;
  const margenH = inicial.exterior.h - inicial.interior.h;
  log("margen del navegador:", margenW + " px de ancho, " + margenH + " px de alto");
  if (!margenW && !margenH) {
    log("Las dos medidas COINCIDEN: aqui no hay nada que se pueda encoger.");
  } else {
    log("NO coinciden: esto es justo lo que se perderia por sesion si se midiera mal.");
  }

  /*
   * Se pide un tamaño raro a proposito —no 400x300, que podria coincidir
   * por casualidad con algo— y se mira DONDE cae. Luego se devuelve la
   * ventana a como estaba: esto es un diagnostico, no una travesura.
   */
  const PEDIDO = { w: 372, h: 268 };

  log("--- B. ¿que entiende resizeTo()? ---");
  log("pidiendo " + PEDIDO.w + "x" + PEDIDO.h + "…");

  try {
    w.resizeTo(PEDIDO.w, PEDIDO.h);
  } catch (err) {
    mal("resizeTo() ha lanzado:", err && err.name, "-", err && err.message);
    mal("VEREDICTO: no concluyente. El navegador no deja redimensionar por codigo.");
    return;
  }

  /*
   * Medir en el mismo turno daria el tamaño de antes: el navegador aun no
   * ha rehecho la ventana. Dos fotogramas y un respiro son de sobra y no
   * dependen de adivinar cuantos milisegundos tarda.
   */
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      setTimeout(() => {
        const tras = medir();
        log("interior tras pedirlo:", tras.interior.w + "x" + tras.interior.h);
        log("exterior tras pedirlo:", tras.exterior.w + "x" + tras.exterior.h);

        const esExterior = tras.exterior.w === PEDIDO.w && tras.exterior.h === PEDIDO.h;
        const esInterior = tras.interior.w === PEDIDO.w && tras.interior.h === PEDIDO.h;

        // Devolver la ventana a su sitio antes de opinar nada.
        try {
          w.resizeTo(inicial.exterior.w, inicial.exterior.h);
        } catch (err) {
          mal("(no he podido devolverla a su tamaño; ajustala a mano, perdona)");
        }

        if (esExterior && !esInterior) {
          log("VEREDICTO: lo que se pide es el EXTERIOR. La extension anota el exterior,");
          log("asi que el tamaño se conserva exacto entre sesiones. Todo correcto.");
          return;
        }
        if (esInterior && !esExterior) {
          mal("VEREDICTO: lo que se pide es el INTERIOR, y la extension anota el exterior.");
          mal("La ventana CRECERA " + margenH + " px de alto por sesion. Copiame esto y lo cambio.");
          return;
        }
        if (esInterior && esExterior) {
          log("VEREDICTO: coinciden (margen cero). Da igual cual se anote. Todo correcto.");
          return;
        }
        mal("VEREDICTO: no ha caido en ninguna de las dos. El navegador ha acotado el");
        mal("tamaño por su cuenta (minimos o maximos de pantalla). Copiame los numeros");
        mal("de arriba y prueba otra vez con la ventana a un tamaño intermedio.");
      }, 60)
    )
  );
})();
