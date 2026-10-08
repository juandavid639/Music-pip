/*
 * DIAGNOSTICO: EL RELEVO DE CANCION (espectro) Y EL ESTADO DE REPETIR
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO.
 *
 * Responde a los dos sintomas reportados, y ninguno de los dos se puede
 * responder leyendo codigo:
 *
 * 1. "cuando cambia de cancion el espectro deja de servir y toca oprimir
 *    el boton otra vez".
 *
 *    La extension se reengancha comparando el ELEMENTO <video>: si es otro,
 *    reconecta. Que eso no baste solo puede significar una cosa, y hay que
 *    verla: que el elemento sea el MISMO y lo que muera sea la pista
 *    capturada. captureStream() entrega una copia del audio, y cuando el
 *    reproductor cambia de fuente esa copia se queda sin nada que copiar;
 *    la pista pasa a "ended" y el analizador lee silencio para siempre, que
 *    es exactamente "deja de servir".
 *
 *    Si sale asi, la guarda hay que ponerla sobre la PISTA, no sobre el
 *    elemento. Si sale que el elemento cambia, entonces el fallo es otro y
 *    este diagnostico habra evitado un arreglo equivocado.
 *
 * 2. "se oprime repetir pero no se si esta activo".
 *
 *    La extension solo pinta el boton encendido si YouTube Music expone un
 *    `aria-pressed` explicito; si no, se abstiene a proposito. Aqui se
 *    vuelcan TODOS los atributos del boton y de la barra del reproductor
 *    antes y despues de cada pulsacion, para encontrar donde vive de verdad
 *    ese estado. Ojo: repetir tiene TRES posiciones (off / todo / una), asi
 *    que puede que no haya ningun booleano que valga.
 *
 * COMO SE USA
 *   1. Pega esto con una cancion sonando.
 *   2. Pulsa el boton de REPETIR de YouTube Music tres veces, despacio.
 *      Cada pulsacion imprime que atributos cambiaron.
 *   3. Pasa a la SIGUIENTE CANCION. Al detectarlo imprime el veredicto del
 *      espectro y termina.
 *   Se rinde solo a los 3 minutos.
 *
 * No toca la reproduccion (usa captureStream, nunca
 * createMediaElementSource) y no envia nada a ningun sitio.
 */
(function () {
  const log = (...a) => console.log("%c[relevo]", "color:#f15a5a;font-weight:bold", ...a);
  const ok = (...a) => console.log("%c[relevo]", "color:#8fe3b0;font-weight:bold", ...a);
  const mal = (...a) => console.log("%c[relevo]", "color:#f28b82;font-weight:bold", ...a);

  /* ---------- utilidades ---------- */

  function atributos(el) {
    if (!el) return null;
    const salida = {};
    for (const a of el.attributes) salida[a.name] = a.value;
    return salida;
  }

  function diferencias(antes, ahora) {
    const cambios = {};
    const claves = new Set([...Object.keys(antes || {}), ...Object.keys(ahora || {})]);
    for (const k of claves) {
      const a = antes ? antes[k] : undefined;
      const b = ahora ? ahora[k] : undefined;
      if (a !== b) cambios[k] = `${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    }
    return cambios;
  }

  function tituloActual() {
    const el = document.querySelector("ytmusic-player-bar .title");
    return el ? el.textContent.trim() : "";
  }

  function videoQueSuena() {
    return Array.from(document.querySelectorAll("video")).find((v) => v.readyState > 0 && !v.paused);
  }

  /* ---------- parte 2: repetir ---------- */

  // Los mismos selectores que usa el adaptador, mas la barra entera: en
  // algunas versiones el modo vive en un atributo de la barra y no del boton.
  const botonRepetir =
    document.querySelector("ytmusic-player-bar .repeat") ||
    document.querySelector("ytmusic-player-bar #repeat") ||
    document.querySelector('ytmusic-player-bar [aria-label*="Repeat" i]') ||
    document.querySelector('ytmusic-player-bar [aria-label*="Repetir" i]');
  const barra = document.querySelector("ytmusic-player-bar");

  if (!botonRepetir) {
    mal("no se encuentra el boton de repetir con los selectores de la extension");
  } else {
    log("boton de repetir:", botonRepetir.tagName.toLowerCase(), "| atributos:", atributos(botonRepetir));
    log("  aria-pressed:", JSON.stringify(botonRepetir.getAttribute("aria-pressed")));
    log("  title:", JSON.stringify(botonRepetir.getAttribute("title")));
    log("PULSA REPETIR TRES VECES, DESPACIO. Cada pulsacion imprime que cambio.");

    let ultimoBoton = atributos(botonRepetir);
    let ultimaBarra = atributos(barra);
    let pulsaciones = 0;

    const observador = new MutationObserver(() => {
      const ahoraBoton = atributos(botonRepetir);
      const ahoraBarra = atributos(barra);
      const cb = diferencias(ultimoBoton, ahoraBoton);
      const cba = diferencias(ultimaBarra, ahoraBarra);
      if (!Object.keys(cb).length && !Object.keys(cba).length) return;
      pulsaciones++;
      log(`cambio ${pulsaciones} en repetir:`);
      if (Object.keys(cb).length) log("  en el BOTON:", cb);
      if (Object.keys(cba).length) log("  en la BARRA:", cba);
      ultimoBoton = ahoraBoton;
      ultimaBarra = ahoraBarra;
    });
    observador.observe(botonRepetir, { attributes: true });
    if (barra) observador.observe(barra, { attributes: true });
    setTimeout(() => observador.disconnect(), 180000);
  }

  /* ---------- parte 1: el espectro al cambiar de cancion ---------- */

  const video = videoQueSuena();
  if (!video) {
    mal("no hay ningun <video> sonando: pon una cancion y vuelve a pegar esto");
    return;
  }
  if (typeof video.captureStream !== "function") {
    mal("este navegador no tiene captureStream: el espectro no es posible aqui");
    return;
  }

  let stream;
  try {
    stream = video.captureStream();
  } catch (err) {
    mal("captureStream fallo:", err);
    return;
  }
  const pista = stream.getAudioTracks()[0];
  if (!pista) {
    mal("la captura no trajo ninguna pista de audio");
    return;
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analizador);
  const bandas = new Uint8Array(analizador.frequencyBinCount);

  // OJO: nunca se conecta a ctx.destination. Hacerlo sonaria dos veces.

  function movimiento(ms) {
    return new Promise((resolve) => {
      let maximo = 0;
      const fin = performance.now() + ms;
      (function mirar() {
        analizador.getByteFrequencyData(bandas);
        for (const v of bandas) if (v > maximo) maximo = v;
        if (performance.now() < fin) requestAnimationFrame(mirar);
        else resolve(maximo);
      })();
    });
  }

  const tituloInicial = tituloActual();
  log("cancion actual:", JSON.stringify(tituloInicial));
  log("pista capturada:", pista.readyState, "| id:", pista.id);
  log("AHORA PASA A LA SIGUIENTE CANCION.");

  movimiento(1500).then((pico) => {
    log("pico ANTES del cambio:", pico, "de 255", pico > 0 ? "(hay señal)" : "(silencio: algo va mal ya)");
  });

  const empezo = performance.now();
  const reloj = setInterval(async () => {
    if (performance.now() - empezo > 180000) {
      clearInterval(reloj);
      mal("tres minutos sin cambio de cancion; me rindo. Vuelve a pegarlo y pulsa 'siguiente'.");
      ctx.close();
      return;
    }
    if (tituloActual() === tituloInicial) return;

    clearInterval(reloj);
    // Un respiro para que el reproductor termine de arrancar la pista nueva.
    await new Promise((r) => setTimeout(r, 2500));

    const videoAhora = videoQueSuena();
    const mismoElemento = videoAhora === video;
    const pico = await movimiento(1500);

    log("--- VEREDICTO DEL ESPECTRO ---");
    log("cancion nueva:", JSON.stringify(tituloActual()));
    log("¿el mismo elemento <video>?:", mismoElemento ? "SI" : "NO");
    log("estado de la pista capturada:", pista.readyState, "| muted:", pista.muted);
    log("pistas de audio vivas en el stream:", stream.getAudioTracks().filter((t) => t.readyState === "live").length);
    log("pico DESPUES del cambio:", pico, "de 255");

    // ¿Una captura nueva si daria señal? Es lo que hace pulsar el boton.
    let picoNuevo = null;
    if (videoAhora && typeof videoAhora.captureStream === "function") {
      try {
        const stream2 = videoAhora.captureStream();
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        const an2 = ctx2.createAnalyser();
        an2.fftSize = 256;
        ctx2.createMediaStreamSource(stream2).connect(an2);
        const b2 = new Uint8Array(an2.frequencyBinCount);
        picoNuevo = await new Promise((resolve) => {
          let maximo = 0;
          const fin = performance.now() + 1500;
          (function mirar() {
            an2.getByteFrequencyData(b2);
            for (const v of b2) if (v > maximo) maximo = v;
            if (performance.now() < fin) requestAnimationFrame(mirar);
            else resolve(maximo);
          })();
        });
        ctx2.close();
      } catch (err) {
        mal("la captura nueva fallo:", err);
      }
    }
    log("pico con una captura NUEVA:", picoNuevo, "de 255");

    if (pico > 0) {
      ok("VEREDICTO: la captura vieja SIGUE dando señal. El fallo NO es el relevo de la pista; hay que buscar en otro sitio.");
    } else if (picoNuevo > 0) {
      mal(
        "VEREDICTO: la captura vieja se quedo muda y una nueva si da señal." +
          (mismoElemento
            ? " El elemento <video> es el MISMO, asi que la guarda por elemento no puede enterarse: hay que vigilar la PISTA."
            : " El elemento cambio, asi que la guarda por elemento deberia haber bastado: mirar por que no salto.")
      );
    } else {
      mal("VEREDICTO: ni la vieja ni la nueva dan señal. La cancion nueva puede venir cifrada o estar en pausa; repite el diagnostico.");
    }

    ctx.close();
  }, 500);
})();
