/*
 * Diagnostico 5 de open.spotify.com: ¿se puede ESCRIBIR donde hoy solo
 * se lee? Tres preguntas, cada una decide una tanda:
 *
 *   1. LA BARRA DE PROGRESO: el tiempo se lee de sus textos, pero sin
 *      <video> en el DOM no hay currentTime que escribir. ¿El input
 *      range acepta el truco del setter nativo + evento 'input' (lo que
 *      React suele escuchar), o la pagina lo ignora/revierte? De esto
 *      depende arrastrar la barra y los botones de ±10 s en Spotify.
 *   2. EL VOLUMEN: la misma pregunta sobre su deslizador. Se prueba y
 *      SE RESTAURA el valor original.
 *   3. EL CANVAS SIN PANEL: todas las mediciones del fondo 🌌 fueron
 *      con la Fila de reproduccion abierta. ¿El elemento sigue en el
 *      DOM con el panel cerrado, o la señal se apaga (como ya asume la
 *      ventana)? ¿Hay otra ancla?
 *
 * COMO USARLO (dos pasadas):
 *   PASADA A: cancion SONANDO + panel lateral ABIERTO -> pegar entero.
 *             Espera ~4 segundos: el guion imprime tres bloques (el
 *             ultimo dice FIN). Escucha si la musica SALTA ~5 s
 *             adelante y si el volumen hace un toque breve: apuntalo.
 *   PASADA B: CIERRA el panel lateral (la vista "en reproduccion") ->
 *             pegar entero otra vez. De esta pasada solo importa el
 *             bloque del CANVAS; los experimentos se repiten solos y
 *             no estorban.
 *
 * OJO, ESTE GUION NO ES SOLO-LECTURA (los cuatro anteriores si lo
 * eran): salta +5 s en la cancion y mueve el volumen un instante antes
 * de devolverlo. Es exactamente lo que se quiere medir.
 */
(function () {
  const log = (s) => console.log(s);
  const linea = (s) => "  " + s;

  log("=== DIAGNOSTICO SEEK+VOLUMEN — " + location.hostname + " ===");
  if (location.hostname !== "open.spotify.com") {
    log("ESTO NO ES SPOTIFY: pega el guion en la pestaña de open.spotify.com");
    return;
  }

  /* El truco del setter nativo: React reemplaza el setter de `value` en
   * la instancia para enterarse de los cambios; escribiendo por el del
   * PROTOTIPO y despachando 'input' el cambio le llega como si fuera
   * del usuario. Es lo primero que hay que medir: hay paginas que lo
   * aceptan y paginas que lo revierten en el siguiente render. */
  const setterNativo = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  function escribir(input, valor) {
    setterNativo.call(input, String(valor));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ancla(el) {
    let n = el;
    while (n && n !== document.body) {
      const t = n.getAttribute && n.getAttribute("data-testid");
      if (t) return t;
      n = n.parentElement;
    }
    return "(sin testid)";
  }

  /* ---- 0. Censo de TODOS los deslizadores de la pagina -------------- */
  log("--- 0. CENSO DE RANGES (el mapa antes de tocar nada) ---");
  const ranges = Array.from(document.querySelectorAll("input[type='range']"));
  log("ranges en la pagina: " + ranges.length);
  ranges.forEach((r, i) => {
    log(linea(
      "[" + i + "] ancla=" + JSON.stringify(ancla(r)) +
      " min=" + r.min + " max=" + r.max + " step=" + r.step +
      " value=" + r.value +
      " aria-valuenow=" + JSON.stringify(r.getAttribute("aria-valuenow")) +
      " disabled=" + r.disabled
    ));
  });

  /* ---- 3 (sincrono, para la PASADA B). El Canvas y su panel --------- */
  log("--- CANVAS (compara PASADA A vs PASADA B) ---");
  const panel = document.querySelector("[data-testid='NPV_Panel_OpenDiv']");
  log("NPV_Panel_OpenDiv: " + (panel ? "EXISTE" : "NO EXISTE"));
  const videos = Array.from(document.querySelectorAll("video"));
  log("videos en la pagina: " + videos.length);
  videos.forEach((v, i) => {
    log(linea(
      "[" + i + "] ancla=" + JSON.stringify(ancla(v)) +
      " " + v.videoWidth + "x" + v.videoHeight +
      " loop=" + v.loop + " muted=" + v.muted +
      " mediaKeys=" + (v.mediaKeys ? "SI (DRM)" : "null") +
      " src=" + JSON.stringify((v.currentSrc || v.src || "").slice(0, 40))
    ));
  });

  /* ---- 1. El experimento del salto (+5 s) --------------------------- */
  const progreso = document.querySelector(
    "[data-testid='playback-progressbar'] input[type='range']"
  );
  const posicion = () => {
    const el = document.querySelector("[data-testid='playback-position']");
    return el ? el.textContent : "(sin texto)";
  };

  if (!progreso) {
    log("--- 1. PROGRESO: NO HAY RANGE bajo playback-progressbar ---");
  } else {
    const antesValor = Number(progreso.value);
    const antesTexto = posicion();
    // +5000 ms, lejos del final para que el salto no cambie de cancion.
    const objetivo = Math.min(antesValor + 5000, Number(progreso.max) - 15000);
    log("--- 1. PROGRESO: escribiendo " + antesValor + " -> " + objetivo + " ---");
    escribir(progreso, objetivo);
    log(linea("recien escrito: value=" + progreso.value + " (¿acepto la escritura?)"));

    setTimeout(() => {
      const despuesValor = Number(progreso.value);
      const despuesTexto = posicion();
      log("--- 1b. PROGRESO, 1,5 s despues ---");
      log(linea("texto de posicion: " + JSON.stringify(antesTexto) + " -> " + JSON.stringify(despuesTexto)));
      log(linea("value del range: " + antesValor + " -> " + despuesValor + " (objetivo " + objetivo + ")"));
      log(linea("VEREDICTO: " + (
        Math.abs(despuesValor - objetivo) < 3000
          ? "la pagina SIGUIO el valor escrito (el seek sintetico FUNCIONA)"
          : despuesValor > antesValor && despuesValor < objetivo - 3000
            ? "el value solo avanzo lo natural: la pagina IGNORO la escritura"
            : "resultado raro: apunta los numeros de arriba tal cual"
      )));
      log(linea("¿LA MUSICA SALTO ~5 s? Apuntalo: el oido es la medida que el DOM no da."));

      /* ---- 2. El experimento del volumen (dentro del mismo reloj) --- */
      const rangoVolumen = ranges.find((r) => /volume/i.test(ancla(r)));
      if (!rangoVolumen) {
        log("--- 2. VOLUMEN: ningun range con ancla 'volume' (mira el censo) ---");
        log("=== FIN (pega TODO lo impreso) ===");
        return;
      }
      const volumenOriginal = rangoVolumen.value;
      const max = Number(rangoVolumen.max) || 1;
      // Un objetivo bien distinto del actual, para que el cambio se oiga.
      const objetivoVol = Number(volumenOriginal) > max / 2 ? max * 0.25 : max * 0.85;
      log("--- 2. VOLUMEN: escribiendo " + volumenOriginal + " -> " + objetivoVol + " ---");
      escribir(rangoVolumen, objetivoVol);

      setTimeout(() => {
        const leido = rangoVolumen.value;
        log("--- 2b. VOLUMEN, 1,2 s despues ---");
        log(linea("value: " + volumenOriginal + " -> " + leido + " (objetivo " + objetivoVol + ")"));
        /* EL VEREDICTO QUE MINTIO, arreglado. En la pasada real el range
         * tenia step=0.1: se escribio 0.85, la pagina ASENTO 0.9 (el
         * multiplo del step) y el volumen SE OYO subir — pero
         * |0.9-0.85|=0.05 fallaba el umbral estricto `< max*0.05` justo
         * en el borde y este guion imprimio "REVIRTIO". Se compara
         * contra el objetivo CUANTIZADO al step del range, que es lo
         * que la pagina puede asentar como mucho. */
        const paso = Number(rangoVolumen.step);
        const esperado = paso > 0 ? Math.round(objetivoVol / paso) * paso : objetivoVol;
        log(linea("esperado tras el step del range (" + (paso || "sin step") + "): " + esperado));
        log(linea("VEREDICTO: " + (
          Math.abs(Number(leido) - esperado) <= (paso > 0 ? paso / 2 : max * 0.05)
            ? "el value se QUEDO donde se escribio (cuantizado por la pagina)"
            : "la pagina lo REVIRTIO: la escritura sintetica no vale"
        )));
        log(linea("¿SE OYO el cambio? Apuntalo tambien: el value puede quedarse y el audio no moverse."));
        // Se devuelve lo que habia, por la misma via que se toco.
        escribir(rangoVolumen, volumenOriginal);
        log(linea("volumen restaurado a " + rangoVolumen.value));
        log("=== FIN (pega TODO lo impreso, y di que oiste) ===");
      }, 1200);
    }, 1500);
  }
})();
