/*
 * DIAGNOSTICO: ¿AGUANTA LA VELOCIDAD DE REPRODUCCION?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO.
 *
 * ------------------------------------------------------------------
 * ESTE SI SE PUEDE DESHACER
 * ------------------------------------------------------------------
 * Al reves que diagnostico-ecualizador.js, aqui no hay ninguna puerta de un
 * solo sentido. `playbackRate` es una propiedad normal del <video>: se
 * escribe, se lee y se devuelve a 1. No toca el grafo de audio, no llama a
 * createMediaElementSource y no puede dejar la musica muda. Pegar esto es
 * seguro, y ademas restaura la velocidad al terminar pase lo que pase.
 *
 * ------------------------------------------------------------------
 * LAS TRES PREGUNTAS
 * ------------------------------------------------------------------
 *
 *  1. ¿SE ESCRIBE SIQUIERA? Que `media.playbackRate = 1.5` no lance no
 *     prueba nada: YouTube Music tiene su propio codigo mirando el elemento
 *     y podria devolverlo a 1 en el mismo instante. Se vuelve a leer.
 *
 *  2. ¿SUENA DE VERDAD MAS RAPIDO? Esta es la pregunta que no se puede
 *     contestar leyendo la propiedad, y es la misma trampa que el
 *     ecualizador: el atributo puede decir 1,5 mientras el audio sigue a 1.
 *     Se mide cuanto avanza `currentTime` contra el reloj de pared. A 1,5x,
 *     en 3 segundos reales la pista tiene que avanzar unos 4,5.
 *
 *     Ojo: se usa `performance.now()` y no `Date.now()`. El segundo puede
 *     saltar hacia atras si el sistema ajusta la hora, y entonces la
 *     division daria una velocidad inventada.
 *
 *  3. ¿SOBREVIVE AL CAMBIO DE CANCION? LA importante, y la que decide si el
 *     boton necesita reaplicar la velocidad o no. Por especificacion,
 *     `playbackRate` vuelve a `defaultPlaybackRate` cada vez que el elemento
 *     hace `load()`, y YouTube Music recarga la pista por su cuenta. Si se
 *     resetea, un boton que enseñe 1,5x despues de cambiar de cancion estaria
 *     mintiendo.
 *
 *     Esta no se puede automatizar: hace falta que TU pulses "siguiente".
 *     Por eso va aparte, en `ytmpipVelocidad.vigilar()`.
 *
 * ------------------------------------------------------------------
 * QUE MIRAR EN LA SALIDA
 * ------------------------------------------------------------------
 *   - "medida": tiene que rondar la velocidad pedida. Si dice 1,0 mientras
 *     la propiedad dice 1,5, la propiedad esta mintiendo y el boton no se
 *     puede publicar tal cual.
 *   - "preservesPitch": si sale `false` o no existe, la voz saldra de
 *     dibujos animados y hay que decirlo en la interfaz.
 *   - En `vigilar()`: si aparece "SE RESETEO", la extension tiene que
 *     reaplicar la velocidad al empezar cada cancion.
 *
 * Y ESCUCHA. Durante la prueba la musica va a ir mas rapida unos segundos.
 * Si no lo oyes, la pregunta 2 esta mintiendo.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[velocidad]", "color:#4fd1c5;font-weight:bold", ...args);
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n));

  const video = Array.from(document.querySelectorAll("video")).find(
    (v) => v.readyState > 0 && !v.paused
  );

  if (!video) {
    log("No encuentro ningun <video> reproduciendo. Pon una cancion y vuelve a pegar esto.");
    return;
  }

  const VELOCIDAD_PRUEBA = 1.5;

  /**
   * Cuanto avanza la pista por cada segundo de reloj de pared.
   *
   * Es la unica forma honesta de saber si suena mas rapido. Leer
   * `media.playbackRate` es preguntarle al elemento por su propia intencion;
   * esto mide el resultado.
   */
  async function medirVelocidadReal(ms) {
    const t0 = performance.now();
    const p0 = video.currentTime;
    await esperar(ms);
    const relojReal = (performance.now() - t0) / 1000;
    const avanzoLaPista = video.currentTime - p0;
    /*
     * Si la pista no avanzo nada, no es "velocidad 0": es que se pauso, o
     * que salto de cancion en medio de la medida. Dividir daria un cero que
     * se leeria como "no funciona", y no es lo mismo.
     */
    if (relojReal <= 0 || avanzoLaPista <= 0) return null;
    return avanzoLaPista / relojReal;
  }

  async function probar() {
    const original = video.playbackRate;
    log("velocidad al empezar:", num(original));
    log(
      "preservesPitch:",
      "preservesPitch" in video ? String(video.preservesPitch) : "NO EXISTE en este navegador"
    );

    // --- Pregunta 1: ¿se escribe? -----------------------------------
    video.playbackRate = VELOCIDAD_PRUEBA;
    await esperar(300);
    const leida = video.playbackRate;
    log("se pidio", VELOCIDAD_PRUEBA, "y la propiedad dice", num(leida));

    // --- Pregunta 2: ¿suena mas rapido? -----------------------------
    log("%cESCUCHA: midiendo 3 segundos a 1,5×…", "color:#e8a33d;font-weight:bold");
    const medida = await medirVelocidadReal(3000);

    video.playbackRate = original;
    log("velocidad devuelta a", num(original));

    if (medida === null) {
      log("La pista no avanzo durante la medida (¿pausa, o cambio de cancion?). Repite.");
      return;
    }
    log("medida:", num(medida), "segundos de pista por segundo de reloj");

    // --- Veredicto ---------------------------------------------------
    /*
     * El margen es amplio a proposito. `currentTime` no se actualiza de
     * forma continua sino a saltos, y en tres segundos eso mete facilmente
     * un 5 % de error que no significa nada. Lo que hay que distinguir aqui
     * es 1,5 de 1,0, no 1,50 de 1,48.
     */
    const seEscribe = Math.abs(leida - VELOCIDAD_PRUEBA) < 0.01;
    const suena = Math.abs(medida - VELOCIDAD_PRUEBA) < 0.2;
    const tono = "preservesPitch" in video;

    log("--------------------------------------------------");
    log("¿la propiedad acepta?  ", seEscribe ? "SI" : `NO — se quedo en ${num(leida)}`);
    log("¿suena mas rapido?     ", suena ? `SI — ${num(medida)}×` : `NO — medido ${num(medida)}×`);
    log("¿corrige el tono?      ", tono ? "SI" : "NO — la voz saldra desafinada, hay que avisarlo");
    log(
      "VEREDICTO:",
      seEscribe && suena
        ? "la velocidad funciona. Falta saber si aguanta el cambio de cancion:"
        : "la velocidad NO se puede publicar tal cual. Cuentame los numeros."
    );
    if (seEscribe && suena) {
      log("   escribe  ytmpipVelocidad.vigilar()  y luego pulsa SIGUIENTE en YouTube Music.");
    }
  }

  /**
   * Pregunta 3: deja la velocidad puesta y avisa si algo la cambia.
   *
   * No hay evento para "playbackRate cambio por su cuenta"... en realidad si
   * lo hay (`ratechange`), pero se dispara TAMBIEN cuando lo cambiamos
   * nosotros, asi que por si solo no distingue quien lo hizo. Por eso se
   * anota `pedida` y el manejador compara: si el valor nuevo no es el que
   * pedimos, lo cambio otro.
   */
  function vigilar() {
    const pedida = VELOCIDAD_PRUEBA;
    video.playbackRate = pedida;
    log(`velocidad puesta a ${pedida}×. VIGILANDO.`);
    log("Ahora pulsa SIGUIENTE en YouTube Music, o espera a que acabe la cancion.");
    log("Para terminar:  ytmpipVelocidad.parar()");

    const alCambiar = () => {
      if (Math.abs(video.playbackRate - pedida) < 0.01) return;
      log(
        `%cSE RESETEO: la velocidad paso sola de ${pedida}× a ${num(video.playbackRate)}×`,
        "color:#f15a5a;font-weight:bold"
      );
      log("=> la extension TIENE que reaplicar la velocidad al empezar cada cancion.");
    };
    const alEmpezar = () => log("(empieza una pista nueva; velocidad ahora:", num(video.playbackRate) + ")");

    video.addEventListener("ratechange", alCambiar);
    video.addEventListener("loadstart", alEmpezar);
    video.addEventListener("playing", alEmpezar);

    window.ytmpipVelocidad.parar = function parar() {
      video.removeEventListener("ratechange", alCambiar);
      video.removeEventListener("loadstart", alEmpezar);
      video.removeEventListener("playing", alEmpezar);
      video.playbackRate = 1;
      log("vigilancia terminada y velocidad devuelta a 1×.");
      log("Si NO ha salido ningun 'SE RESETEO' despues de cambiar de cancion,");
      log("la velocidad aguanta sola y la extension no tiene que hacer nada.");
    };
  }

  window.ytmpipVelocidad = {
    probar,
    vigilar,
    parar: function () {
      log("no hay ninguna vigilancia en marcha.");
    }
  };

  probar();
})();
