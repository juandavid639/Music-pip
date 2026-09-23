/*
 * DIAGNOSTICO: ¿SE PUEDE ECUALIZAR EL AUDIO DE YOUTUBE MUSIC?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO.
 *
 * ------------------------------------------------------------------
 * LEE ESTO ANTES DE PEGARLO
 * ------------------------------------------------------------------
 *
 * Este diagnostico es DISTINTO de todos los demas del proyecto: los otros
 * miran sin tocar, y este tiene que tocar. Un ecualizador de verdad —el que
 * sube los graves y se oye— solo se puede hacer metiendo el audio del
 * elemento en un AudioContext, y eso se pide con:
 *
 *     ctx.createMediaElementSource(video)
 *
 * que es UNA PUERTA DE UN SOLO SENTIDO. Desde esa llamada el sonido del
 * elemento deja de salir por su ruta normal y sale por el contexto. No hay
 * forma de deshacerlo: ni desconectando los nodos, ni cerrando el contexto
 * (cerrarlo es justo lo peor que se puede hacer, porque entonces no sale
 * por ningun sitio). La unica marcha atras es RECARGAR LA PESTAÑA.
 *
 * Por eso el script esta partido en dos:
 *
 *   PARTE 1 — se ejecuta sola al pegar. No toca nada. Usa captureStream(),
 *             que da una copia del audio, para saber si aqui hay sonido
 *             legible o si la pista viene cifrada. Si la parte 1 dice que
 *             no, la parte 2 ni se ofrece: cruzar la puerta para descubrir
 *             que llega silencio deja la musica muda hasta recargar.
 *
 *   PARTE 2 — hay que pedirla a mano escribiendo en la consola:
 *
 *                 ytmpipEcualizador.probar()
 *
 *             Esa llamada cruza la puerta. Cuando termine, RECARGA LA
 *             PESTAÑA (F5) para devolver el audio a su ruta normal.
 *
 * ------------------------------------------------------------------
 * LAS TRES PREGUNTAS QUE VIENE A RESPONDER
 * ------------------------------------------------------------------
 *
 *  1. ¿FUNCIONA SIQUIERA? El <video> de YouTube Music no tiene un archivo
 *     detras: lo alimenta MediaSource trozo a trozo, y ademas puede venir
 *     cifrado. Con DRM el navegador entrega silencio A PROPOSITO. Eso no se
 *     averigua leyendo codigo ni documentacion: depende de la cuenta, de la
 *     pista y de la version de Chrome.
 *
 *  2. ¿SE OYE EL CAMBIO? Que un BiquadFilterNode acepte `gain = 12` no
 *     prueba nada; lo que hay que ver es que la energia de los graves suba
 *     de verdad al otro extremo de la cadena. Aqui se mide con un analizador
 *     puesto justo antes de la salida.
 *
 *  3. ¿SE RECUPERA DE UNA SUSPENSION? Esta es LA pregunta. Un AudioContext
 *     se suspende solo —politica de autorreproduccion, pestaña al fondo— y
 *     mientras esta suspendido la musica no suena. Si `resume()` lo revive
 *     con fiabilidad, el riesgo se puede vigilar desde la extension. Si no,
 *     el ecualizador no se puede publicar por mucho que las otras dos
 *     preguntas salgan bien.
 *
 * ------------------------------------------------------------------
 * QUE MIRAR EN LA SALIDA
 * ------------------------------------------------------------------
 *   - Parte 1, "movimiento": si es 0, para aqui. No sigas.
 *   - "graves": la resta tiene que rondar los +12 dB, que es lo que se pide.
 *   - "control (2-6 kHz)": tiene que quedarse cerca de 0. Si se mueve mucho,
 *     la cancion cambio de volumen sola y la medida no vale; repite.
 *   - "suspendido -> estado": tiene que decir `suspended` y, sobre todo, no
 *     debe oirse nada. Confirma que la suspension ES el peligro que describe
 *     el comentario de audio-spectrum.js.
 *   - "tras resume() -> señal": tiene que volver a subir. Es lo que decide
 *     si esto se puede hacer o no.
 *
 * Y ESCUCHA. Durante los cuatro segundos del aviso "ESCUCHA" el oido es mejor
 * instrumento que cualquier numero de aqui: si se oye la subida de graves, el
 * filtro funciona, diga lo que diga la tabla.
 *
 * OJO CON UNA TRAMPA: `video.currentTime` sigue avanzando aunque no se
 * oiga nada, porque el elemento no sabe que su audio se fue a otro sitio.
 * Preguntarle a el si "sigue sonando" da un si que no significa nada. Por
 * eso todo lo de aqui se mide con un analizador y no con el reloj del
 * elemento.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[ecualizador]", "color:#f15a5a;font-weight:bold", ...args);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  const video = Array.from(document.querySelectorAll("video")).find(
    (v) => v.readyState > 0 && !v.paused
  );

  if (!video) {
    log("No encuentro ningun <video> reproduciendo. Pon una cancion y vuelve a pegar esto.");
    return;
  }

  /* ================================================================
   * PARTE 1 — sin tocar nada
   * ================================================================ */

  log("PARTE 1: mirando sin tocar.");
  log("DRM:", video.mediaKeys ? "SI — pista cifrada" : "no");

  if (video.mediaKeys) {
    log("Con DRM el navegador entrega silencio a proposito. NO cruces la puerta.");
    return;
  }

  if (typeof video.captureStream !== "function") {
    log("Este navegador no expone captureStream(); no puedo comprobarlo sin arriesgar.");
    return;
  }

  /**
   * ¿Llega sonido de verdad? Es la MISMA comprobacion que ya hace
   * diagnostico-espectro.js, y esta repetida a proposito: quien pegue esto
   * tiene que poder decidir con lo que ve en esta consola, sin haber
   * ejecutado antes otro archivo.
   */
  async function haySonido() {
    const stream = video.captureStream();
    const pistas = stream.getAudioTracks();
    log("pistas de audio en la captura:", pistas.length);
    if (!pistas.length) return false;

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const fuente = ctx.createMediaStreamSource(stream);
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 256;
    fuente.connect(analizador);
    // NO se conecta a ctx.destination: se oiria dos veces, con eco.

    const bandas = new Uint8Array(analizador.frequencyBinCount);
    let movimiento = 0;
    for (let i = 0; i < 20; i++) {
      await esperar(50);
      analizador.getByteFrequencyData(bandas);
      if (bandas.some((v) => v > 0)) movimiento++;
    }

    fuente.disconnect();
    ctx.close();
    pistas.forEach((p) => p.stop());

    log("movimiento:", movimiento, "de 20 muestras");
    return movimiento > 0;
  }

  haySonido().then((vale) => {
    if (!vale) {
      log("VEREDICTO PARTE 1: llegan ceros. NO cruces la puerta: dejaria la musica muda.");
      return;
    }
    log("VEREDICTO PARTE 1: hay señal legible.");
    log("%cPARTE 2 — cruza la puerta y NO se puede deshacer.", "color:#e8a33d;font-weight:bold");
    log("Si quieres seguir, escribe:  ytmpipEcualizador.probar()");
    log("Al terminar, RECARGA LA PESTAÑA para devolver el audio a su ruta normal.");
  });

  /* ================================================================
   * PARTE 2 — la puerta de un solo sentido
   * ================================================================ */

  /*
   * ------------------------------------------------------------------
   * POR QUE SE MIDE EN DECIBELIOS Y NO EN LA ESCALA 0-255
   * ------------------------------------------------------------------
   * La primera version de este archivo uso getByteFrequencyData, y la
   * comprobacion del filtro salia NO aunque el filtro funcionase. No era el
   * filtro: era la regla.
   *
   * getByteFrequencyData reparte el rango [minDecibels, maxDecibels] —por
   * defecto de -100 a -30 dB— en 255 escalones. Son 70 dB en 255 pasos, o sea
   * 0,27 dB por escalon, y TODO lo que pase de -30 dB sale como 255. La
   * medida real fue esta:
   *
   *     graves antes = 224 bytes  ->  -100 + 224*70/255  =  -38,5 dB
   *     techo de la escala (255)  ->                        -30,0 dB
   *     recorrido disponible                                  8,5 dB
   *
   * y encima se le sumaban +12 dB al filtro. No caben. Peor todavia: el
   * veredicto pedia "que suba un 15 %", y un 15 % sobre 224 son 33,6 bytes,
   * que en esta escala son +9,2 dB. Se estaba exigiendo una subida MAYOR que
   * la que el instrumento podia representar. La prueba era imposible de pasar.
   *
   * El fallo de fondo es un error de categoria: un porcentaje LINEAL aplicado
   * a una escala LOGARITMICA. La ganancia de un filtro se pide en decibelios,
   * asi que se comprueba restando decibelios, no dividiendo bytes.
   *
   * getFloatFrequencyData entrega dB de verdad y sin techo. Y promediar en dB
   * —que en otros contextos seria incorrecto, porque no es la media de la
   * energia— aqui es justo lo que hace falta: si todas las bandas suben 12 dB,
   * la media en dB sube exactamente 12.
   */

  /** Media en dB de las bandas entre dos frecuencias. */
  function energiaDb(analizador, bandas, ctx, desdeHz, hastaHz) {
    analizador.getFloatFrequencyData(bandas);
    const porBanda = ctx.sampleRate / 2 / bandas.length;
    // La banda 0 es la componente continua (0 Hz). No es sonido: se salta.
    const desde = Math.max(1, Math.floor(desdeHz / porBanda));
    const hasta = Math.min(bandas.length - 1, Math.ceil(hastaHz / porBanda));
    let suma = 0;
    let cuenta = 0;
    for (let i = desde; i <= hasta; i++) {
      // El silencio absoluto llega como -Infinity y envenenaria la media.
      if (Number.isFinite(bandas[i])) {
        suma += bandas[i];
        cuenta++;
      }
    }
    return cuenta ? suma / cuenta : -Infinity;
  }

  /** Promedia varias lecturas: una sola pillaria un silencio entre notas. */
  async function medir(analizador, bandas, ctx, desdeHz, hastaHz, veces = 24) {
    let suma = 0;
    let cuenta = 0;
    for (let i = 0; i < veces; i++) {
      await esperar(50);
      const db = energiaDb(analizador, bandas, ctx, desdeHz, hastaHz);
      if (Number.isFinite(db)) {
        suma += db;
        cuenta++;
      }
    }
    return cuenta ? suma / cuenta : -Infinity;
  }

  const dB = (n) => (Number.isFinite(n) ? n.toFixed(1) + " dB" : "silencio");
  const conSigno = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + " dB";

  async function probar() {
    let ctx;
    let fuente;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      fuente = ctx.createMediaElementSource(video);
    } catch (err) {
      // InvalidStateError = ya se llamo antes sobre este mismo elemento.
      // La puerta se cruzo en una ejecucion anterior; recarga y repite.
      log("createMediaElementSource ha fallado:", err && err.name, err && err.message);
      log("Si dice InvalidStateError, ya cruzaste la puerta antes. Recarga la pestaña.");
      return;
    }

    log("PUERTA CRUZADA. A partir de aqui el audio sale por el contexto.");

    /*
     * LA CADENA. El analizador va ANTES de la salida y no colgando aparte:
     * asi mide exactamente lo que se va a oir, filtro incluido. Colgandolo
     * de la fuente mediria la señal sin ecualizar y diria que el filtro no
     * hace nada aunque lo estuviera haciendo.
     */
    const grave = ctx.createBiquadFilter();
    grave.type = "lowshelf";
    grave.frequency.value = 200;
    grave.gain.value = 0;

    const analizador = ctx.createAnalyser();
    analizador.fftSize = 2048;
    /*
     * SIN SUAVIZADO. Por defecto vale 0,8: cada lectura arrastra el 80 % de la
     * anterior. Eso esta muy bien para dibujar barras que no tiemblen, y esta
     * muy mal para medir un cambio, porque la lectura llega tarde y rebajada.
     * Aqui no se pinta nada: se mide.
     */
    analizador.smoothingTimeConstant = 0;

    fuente.connect(grave);
    grave.connect(analizador);
    analizador.connect(ctx.destination);

    const bandas = new Float32Array(analizador.frequencyBinCount);

    if (ctx.state === "suspended") {
      log("el contexto nacio suspendido; llamando a resume()…");
      await ctx.resume();
    }
    log("estado del contexto:", ctx.state);

    // --- Pregunta 1: ¿llega algo? -----------------------------------
    const total = await medir(analizador, bandas, ctx, 20, 16000);
    log("señal total:", dB(total));
    if (!Number.isFinite(total) || total < -95) {
      log("VEREDICTO: no llega audio por esta via. RECARGA LA PESTAÑA.");
      return;
    }

    // --- Pregunta 2: ¿se oye el cambio? -----------------------------
    /*
     * DOS BANDAS, NO UNA.
     *
     * La de graves va de 20 a 120 Hz, MUY por debajo del codo del filtro. La
     * primera version medio de 20 a 250 Hz, y el codo esta en 200: un lowshelf
     * da su ganancia entera bien por debajo del codo y solo la mitad justo en
     * el, asi que meter 150-250 Hz dentro de la cuenta rebajaba el resultado
     * sin ningun motivo. Se mide donde el filtro ya da todo lo que da.
     *
     * La de control va de 2 a 6 kHz y tiene que QUEDARSE QUIETA. Es la que
     * separa "el filtro funciona" de "la cancion iba subiendo de volumen ella
     * sola". Sin esta segunda banda, un crescendo firma exactamente el mismo
     * resultado que un ecualizador, y no hay forma de distinguirlos.
     */
    const gravesAntes = await medir(analizador, bandas, ctx, 20, 120);
    const controlAntes = await medir(analizador, bandas, ctx, 2000, 6000);

    log("%cESCUCHA: subiendo los graves +12 dB durante unos segundos…", "color:#4fd1c5;font-weight:bold");
    grave.gain.value = 12;
    await esperar(800); // que la lectura deje de arrastrar lo de antes
    const gravesDespues = await medir(analizador, bandas, ctx, 20, 120);
    const controlDespues = await medir(analizador, bandas, ctx, 2000, 6000);
    grave.gain.value = 0;
    log("graves de vuelta a 0 dB (plano).");

    const subenGraves = gravesDespues - gravesAntes;
    const subeControl = controlDespues - controlAntes;
    log("graves 20-120 Hz:", dB(gravesAntes), "->", dB(gravesDespues), " =", conSigno(subenGraves));
    log("control 2-6 kHz: ", dB(controlAntes), "->", dB(controlDespues), " =", conSigno(subeControl), "(deberia rondar 0)");

    // --- Pregunta 3: LA importante ----------------------------------
    log("suspendiendo el contexto a proposito (esto DEBE callar la musica)…");
    await ctx.suspend();
    await esperar(600);
    /*
     * Con el contexto suspendido el analizador no se actualiza, asi que
     * este numero es el ultimo que quedo escrito, no el de ahora. Lo que
     * de verdad hay que mirar aqui es el ESTADO y, sobre todo, el oido:
     * en estos 600 ms no deberia oirse nada.
     */
    log("estado durante la suspension:", ctx.state, "— ¿se ha callado la musica?");

    await ctx.resume();
    await esperar(300);
    const tras = await medir(analizador, bandas, ctx, 20, 16000);
    log("estado tras resume():", ctx.state, "· señal:", dB(tras));

    // --- Veredicto ---------------------------------------------------
    /*
     * LA COMPARACION VA ENTRE LAS DOS BANDAS, NO CONTRA UN NUMERO FIJO.
     *
     * La version anterior pedia que la banda de control se moviera menos de
     * 3 dB en absoluto, y con eso dio "no concluyente" sobre una medida que
     * era de manual: los graves subieron +12,0 dB, que es EXACTAMENTE la
     * ganancia pedida. Fallaba el umbral, no la medida.
     *
     * El motivo es que 3 dB no significa lo mismo en todas partes. El control
     * estaba en -71,9 dB, practicamente el suelo de ruido, y ahi la energia es
     * tan poca que cualquier plato o entrada de voz la mueve varios dB sin que
     * pase nada raro. Los graves estaban en -38,2 dB: unas 2.500 veces mas
     * energia. Un umbral absoluto trata los dos sitios como si fueran iguales,
     * y no lo son.
     *
     * Lo que de verdad prueba que el filtro es SELECTIVO —y no que la cancion
     * subio de volumen— es la RESTA entre las dos subidas. Si la cancion sube
     * entera, las dos bandas suben lo mismo y la resta se va a cero sola. Si
     * es el filtro, los graves se despegan del control. Esa resta es inmune a
     * cualquier cambio de nivel general, que es justo para lo que se puso la
     * banda de control. Estaba bien puesta y mal usada.
     */
    const selectividad = subenGraves - subeControl;
    const sube = subenGraves >= 6;
    const selectivo = selectividad >= 6;
    const vuelve = Number.isFinite(tras) && tras > -95;

    log("--------------------------------------------------");
    log("¿llega audio?          ", Number.isFinite(total) && total > -95 ? "SI" : "NO");
    log("¿el filtro se nota?    ", sube ? `SI — ${conSigno(subenGraves)} en los graves (se pidieron +12)` : `NO — solo ${conSigno(subenGraves)}`);
    log("¿toca SOLO los graves? ", selectivo ? `SI — se despegan ${conSigno(selectividad)} del control` : `NO — subio todo por igual (${conSigno(selectividad)} de diferencia): fue la cancion, repite`);
    log("¿resume() lo revive?   ", vuelve ? "SI" : "NO — y esto es lo que lo tumba");
    log(
      "VEREDICTO:",
      vuelve && sube && selectivo
        ? "el ecualizador es viable, con un vigilante que llame a resume()."
        : !vuelve
          ? "el ecualizador NO se puede publicar: sin resume() fiable no hay red."
          : "no concluyente. Cuentame que numeros salieron — y si lo OISTE."
    );
    log("%cRECARGA LA PESTAÑA (F5) para devolver el audio a su ruta normal.", "font-weight:bold");

    /*
     * NO se llama a ctx.close() ni se desconecta la fuente. Seria lo
     * ordenado en cualquier otro sitio y aqui es lo peor que se puede
     * hacer: la fuente ya no tiene camino de vuelta, asi que cerrar el
     * contexto deja la musica sin salida ninguna hasta recargar. Se deja
     * todo conectado y sonando, con el filtro a 0 dB, que es transparente.
     */
  }

  window.ytmpipEcualizador = { probar };
})();
