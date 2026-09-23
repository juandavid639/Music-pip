/*
 * Temporizador de apagado: la musica se pausa sola pasado un plazo.
 *
 * VIVE EN EL CONTENT SCRIPT y no en el service worker, y es una decision,
 * no una comodidad:
 *
 *  - No hace falta el permiso "alarms". El manifiesto pide "storage" y
 *    "scripting" y cada permiso nuevo es una pregunta mas en la revision
 *    de la Chrome Web Store y un aviso mas al usuario.
 *  - El plazo MUERE CON LA PESTAÑA, que es justo lo que significa "apaga
 *    ESTA musica en 30 minutos". Un temporizador en el service worker
 *    sobreviviria a la pestaña y se encontraria sin nada que pausar.
 *  - Quien tiene el <video> es esta pagina: pausar desde aqui es una
 *    llamada; pausar desde el service worker es un mensaje que puede no
 *    llegar.
 *
 * DOS RELOJES PARA UN SOLO PLAZO, y cada uno cubre el hueco del otro:
 *
 *  1. EL LATIDO (comprobar() desde content-script.js, con cada evento del
 *     <video>). Mientras SUENA la musica, `timeupdate` llega unas cuatro
 *     veces por segundo, asi que el plazo se atrapa con un cuarto de
 *     segundo de error como mucho, y sin depender de ningun temporizador
 *     que el navegador pueda retrasar.
 *  2. UN setTimeout DE RESPALDO. El latido tiene un punto ciego: si la
 *     musica esta PAUSADA no hay eventos, y un plazo vencido se quedaria
 *     esperando al proximo evento... que podria ser el "play" de mañana, y
 *     entonces pausaria la musica nada mas arrancarla. El setTimeout vence
 *     cerca de la hora aunque no suene nada, consume el plazo, y pausar lo
 *     pausado no hace nada (pause() ya pregunta antes de tocar). En una
 *     pestaña al fondo el navegador puede retrasarlo, pero una pestaña que
 *     REPRODUCE AUDIO esta exenta del estrangulado intensivo, y si aun asi
 *     llegara tarde, el latido ya habra pausado primero.
 *
 * EL PLAZO ES DE PARED, no de musica: pausar a mano no lo congela, igual
 * que en los temporizadores de dormir de toda la vida. "En 30 minutos"
 * significa a las 23:30, no "tras 30 minutos de reproduccion".
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  // Momento (epoch ms) en que hay que pausar, o null si esta apagado.
  let vencimiento = null;
  // Lo que se PIDIO, para que el boton de la ventana pueda ciclar desde
  // ahi: el restante baja cada segundo y no sirve para buscar en la lista.
  let minutosPedidos = 0;
  let timer = null;

  function limpiarTimer() {
    if (timer === null) return;
    root.clearTimeout(timer);
    timer = null;
  }

  // La misma criba que toFiniteNumber en player-controller.js y por el
  // mismo fallo que alli se pago: Number(null) y Number("") valen 0, y un
  // campo perdido por el camino no puede APAGAR un temporizador en marcha.
  function aNumero(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  /*
   * Fija el plazo a `minutes` minutos desde ahora. Cero (o menos) apaga.
   * Basura no toca nada: apagar es una orden, no un accidente.
   *
   * `ahora` es inyectable SOLO para las pruebas, que no pueden esperar
   * quince minutos de reloj; la extension no lo pasa nunca.
   */
  function fijar(minutes, ahora) {
    const pedido = aNumero(minutes);
    if (pedido === null) return;
    limpiarTimer();
    if (pedido <= 0) {
      vencimiento = null;
      minutosPedidos = 0;
      return;
    }
    const MAX = YTMPip.CONSTANTS.SLEEP_TIMER_LIMITS.MAX_MINUTES;
    const m = Math.min(MAX, pedido);
    const now = typeof ahora === "number" ? ahora : Date.now();
    minutosPedidos = m;
    vencimiento = now + m * 60000;
    /*
     * El respaldo apunta un pelin DESPUES de la hora a proposito: si
     * llegara justo, un reloj que redondee hacia abajo lo veria un
     * milisegundo pronto, no consumiria el plazo y ya no habria segunda
     * oportunidad hasta el proximo latido.
     */
    timer = root.setTimeout(() => comprobar(), m * 60000 + 250);
  }

  /*
   * Lo que hay puesto, para el estado que viaja a la ventana: null si esta
   * apagado, o { minutes, remainingMs }. `minutes` es lo pedido (fijo);
   * `remainingMs` es lo que queda (baja).
   */
  function estado(ahora) {
    if (vencimiento === null) return null;
    const now = typeof ahora === "number" ? ahora : Date.now();
    return { minutes: minutosPedidos, remainingMs: Math.max(0, vencimiento - now) };
  }

  /*
   * ¿Ya es la hora? Si lo es, PAUSA y consume el plazo. Consumirlo es tan
   * importante como pausar: un plazo vencido que se quedara puesto seria
   * una trampa armada para el proximo "play".
   *
   * Va por PlayerController y no por un media.pause() directo, para que la
   * pregunta "como se pausa" siga teniendo una sola respuesta (con su
   * caida al boton de la pagina si el <video> no aparece).
   */
  function comprobar(ahora) {
    if (vencimiento === null) return false;
    const now = typeof ahora === "number" ? ahora : Date.now();
    if (now < vencimiento) return false;
    vencimiento = null;
    minutosPedidos = 0;
    limpiarTimer();
    if (YTMPip.PlayerController) {
      YTMPip.PlayerController.execute({ type: YTMPip.COMMAND_TYPES.PAUSE });
    }
    return true;
  }

  YTMPip.TemporizadorApagado = { fijar, estado, comprobar };
})(typeof self !== "undefined" ? self : globalThis);
