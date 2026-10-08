/*
 * DIAGNOSTICO: ¿SE PUEDE LEER EL AUDIO DE YOUTUBE MUSIC?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO.
 *
 * Existe porque un espectro necesita acceso a las muestras de audio, y ese
 * acceso puede estar cerrado por dos motivos que NO se pueden averiguar
 * leyendo codigo: si la pista viene cifrada (DRM/EME) el navegador entrega
 * silencio a proposito, y la captura de un elemento alimentado por
 * MediaSource ha tenido fallos historicos en Chrome. Antes de construir
 * nada hay que saber cual de las dos cosas pasa en esta cuenta y en esta
 * version del navegador.
 *
 * POR QUE ESTE DIAGNOSTICO NO TOCA EL AUDIO
 *
 * El camino habitual para un espectro es `createMediaElementSource(video)`,
 * y es una puerta de un solo sentido: a partir de esa llamada el sonido del
 * elemento SALE por el AudioContext y no por su ruta normal, para siempre.
 * Si el contexto se queda suspendido, la musica se calla y solo se arregla
 * recargando la pagina. En una extension para escuchar musica, ese riesgo
 * no se corre para "ver si funciona".
 *
 * Se usa `video.captureStream()`, que entrega una copia del audio y deja el
 * elemento sonando por donde sonaba. Si esto da datos, el espectro se puede
 * hacer sin poner en riesgo la reproduccion.
 *
 * QUE MIRAR EN LA SALIDA
 *   - "DRM": si sale "si", no hay espectro posible por ninguna via.
 *   - "pistas de audio": 0 significa que la captura no trajo sonido.
 *   - "movimiento": el numero que importa. Si es 0 durante los dos segundos
 *     de muestreo, se estan recibiendo silencios y el espectro seria una
 *     linea plana.
 *   - "seguia sonando": tiene que decir "si". Confirma que medir no calla.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[espectro]", "color:#f15a5a;font-weight:bold", ...args);

  const video = Array.from(document.querySelectorAll("video")).find(
    (v) => v.readyState > 0 && !v.paused
  );

  if (!video) {
    log("No encuentro ningun <video> reproduciendo. Pon una cancion y vuelve a pegar esto.");
    return;
  }

  log("elemento:", video.duration ? `${video.duration.toFixed(0)} s de duracion` : "sin duracion");
  log("DRM:", video.mediaKeys ? "SI — pista cifrada, el audio no se puede leer" : "no");
  log("origen:", (video.currentSrc || "").slice(0, 40) || "(sin src, alimentado por MediaSource)");

  if (video.mediaKeys) {
    log("Con DRM no hay nada mas que probar: el navegador entrega silencio a proposito.");
    return;
  }

  if (typeof video.captureStream !== "function") {
    log("Este navegador no expone captureStream() en los elementos de medios.");
    return;
  }

  let stream;
  try {
    stream = video.captureStream();
  } catch (err) {
    log("captureStream() ha fallado:", err && err.name, err && err.message);
    return;
  }

  const pistas = stream.getAudioTracks();
  log("pistas de audio:", pistas.length, pistas.length ? `(${pistas[0].readyState})` : "");

  if (!pistas.length) {
    log("Sin pista de audio en la captura: por esta via no hay espectro.");
    return;
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const fuente = ctx.createMediaStreamSource(stream);
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 256;
  fuente.connect(analizador);
  // A proposito NO se conecta a ctx.destination: se mediria y ademas se
  // oiria dos veces, con eco.

  const bandas = new Uint8Array(analizador.frequencyBinCount);
  const tiempoAlEmpezar = video.currentTime;
  let movimiento = 0;
  let maximo = 0;
  let muestras = 0;

  log("estado del contexto:", ctx.state, "— midiendo dos segundos…");

  const reloj = setInterval(() => {
    analizador.getByteFrequencyData(bandas);
    let suma = 0;
    for (let i = 0; i < bandas.length; i++) {
      suma += bandas[i];
      if (bandas[i] > maximo) maximo = bandas[i];
    }
    if (suma > 0) movimiento++;
    muestras++;
  }, 50);

  setTimeout(() => {
    clearInterval(reloj);

    log("muestras tomadas:", muestras);
    log("movimiento:", movimiento, `de ${muestras} (cuantas traian algo distinto de silencio)`);
    log("banda mas alta vista:", maximo, "de 255");
    log(
      "seguia sonando:",
      !video.paused && video.currentTime > tiempoAlEmpezar ? "si" : "NO — avisame de esto",
      `(${tiempoAlEmpezar.toFixed(1)} → ${video.currentTime.toFixed(1)})`
    );

    if (movimiento === 0) {
      log("VEREDICTO: llegan ceros. El espectro real no es viable por esta via.");
    } else {
      log("VEREDICTO: hay señal. El espectro se puede hacer sin tocar la reproduccion.");
    }

    // Se suelta todo: este diagnostico no deja nada corriendo.
    fuente.disconnect();
    ctx.close();
    pistas.forEach((p) => p.stop());
  }, 2000);
})();
