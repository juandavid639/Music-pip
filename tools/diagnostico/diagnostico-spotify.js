/*
 * Diagnostico del DOM de open.spotify.com para la tanda 3.
 *
 * COMO USARLO:
 *   1. Abre open.spotify.com, inicia sesion y pon una cancion a SONAR.
 *   2. F12 -> pestaña Consola. Si Chrome pide escribir "allow pasting",
 *      escribelo y Enter (es su proteccion anti-pegado, una sola vez).
 *   3. Pega este archivo ENTERO y Enter.
 *   4. Copia todo lo que imprime y pegalo de vuelta en la conversacion.
 *   5. IDEAL: repetirlo dos veces — una con la vista normal y otra con el
 *      panel de COLA abierto (el boton de la lista, junto al volumen),
 *      para la pregunta de "lo que sigue".
 *
 * No toca nada: solo lee. Ningun clic, ningun cambio de estado. En
 * particular NO crea AudioContext ni toca el reproductor: sobre audio
 * con DRM eso puede dejarlo mudo. Solo mira si el DRM esta ahi.
 */
(function () {
  const L = [];
  const log = (s) => L.push(s);

  log("=== DIAGNOSTICO SPOTIFY — " + location.href.slice(0, 80) + " ===");

  /* ---- 1. Los candidatos a selector, interrogados uno a uno ----------
   * Los data-testid son SOSPECHAS, no certezas: si un candidato sale en
   * 0, la seccion 8 (el volcado de data-testid reales) dira como se
   * llama de verdad. */
  const CANDIDATOS = {
    mediaElement: ["video", "audio"],
    barraInferior: ["[data-testid='now-playing-bar']", "footer"],
    fichaSonando: ["[data-testid='now-playing-widget']"],
    playPause: ["[data-testid='control-button-playpause']"],
    next: ["[data-testid='control-button-skip-forward']"],
    prev: ["[data-testid='control-button-skip-back']"],
    aleatorio: ["[data-testid='control-button-shuffle']"],
    repetir: ["[data-testid='control-button-repeat']"],
    titulo: ["[data-testid='context-item-info-title']", "[data-testid='context-item-link']"],
    artista: ["[data-testid='context-item-info-subtitles']", "[data-testid='context-item-info-artist']"],
    caratula: ["[data-testid='cover-art-image']", "[data-testid='now-playing-widget'] img"],
    meGusta: ["[data-testid='add-button']", "[data-testid='now-playing-widget'] button[aria-checked]"],
    barraProgreso: ["[data-testid='playback-progressbar']", "[data-testid='playback-progressbar'] input[type='range']"],
    tiempoActual: ["[data-testid='playback-position']"],
    tiempoTotal: ["[data-testid='playback-duration']"],
    botonCola: ["[data-testid='control-button-queue']"],
    botonLetras: ["[data-testid='lyrics-button']"],
    panelDerecho: ["[data-testid='NPV_Panel_OpenDiv']", "aside"]
  };

  for (const [clave, lista] of Object.entries(CANDIDATOS)) {
    const partes = lista.map((sel) => {
      let n = 0;
      let el = null;
      try {
        n = document.querySelectorAll(sel).length;
        el = document.querySelector(sel);
      } catch (e) {
        return sel + " -> SELECTOR INVALIDO";
      }
      if (!el) return sel + " -> 0";
      const id = el.id ? "#" + el.id : "";
      const cls = (el.className && el.className.baseVal === undefined ? el.className : "")
        .toString().split(/\s+/).slice(0, 2).join(".");
      return sel + " -> " + n + " [" + el.tagName.toLowerCase() + id + (cls ? "." + cls : "") + "]";
    });
    log(clave + ":");
    partes.forEach((p) => log("   " + p));
  }

  /* ---- 2. Los <video>/<audio>: vida, tiempos, fuente y EL DRM --------- */
  const medios = Array.from(document.querySelectorAll("video, audio"));
  log("elementos de medio en pagina: " + medios.length);
  medios.forEach((v, i) => {
    log(
      "  medio[" + i + "] <" + v.tagName.toLowerCase() + ">:" +
      " readyState=" + v.readyState +
      " paused=" + v.paused +
      " currentTime=" + v.currentTime.toFixed(1) +
      " duration=" + (isFinite(v.duration) ? v.duration.toFixed(1) : v.duration) +
      " src=" + (v.currentSrc || "(vacio)").slice(0, 40)
    );
    // La pregunta del DRM, leida sin tocar: mediaKeys puesto = EME
    // activo = audioGrafo condenado (Chrome saca silencio de ahi).
    log(
      "  medio[" + i + "] DRM: mediaKeys=" + (v.mediaKeys ? "SI (" + (v.mediaKeys.constructor && v.mediaKeys.constructor.name) + ")" : "no") +
      " crossOrigin=" + JSON.stringify(v.crossOrigin) +
      " muted=" + v.muted + " volume=" + v.volume.toFixed(2)
    );
    const p = v.parentElement;
    if (p) log("  medio[" + i + "] padre: " + p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + " ." + String(p.className).split(/\s+/).slice(0, 2).join("."));
  });

  /* ---- 3. La barra y los textos de tiempo ----------------------------- *
   * En YTM la barra mentia acumulando la cola; en YouTube normal se
   * helaba. Aqui toca medir que hace la de Spotify, y si el medio[i]
   * de arriba lleva el tiempo de verdad o va por su cuenta. */
  const barraP = document.querySelector("[data-testid='playback-progressbar']");
  if (barraP) {
    const input = barraP.querySelector("input[type='range']") || barraP.querySelector("input");
    if (input) {
      log("barra: input min=" + input.min + " max=" + input.max + " value=" + input.value + " step=" + input.step);
    } else {
      const conAria = barraP.querySelector("[aria-valuenow]") || barraP;
      log(
        "barra: aria-valuenow=" + conAria.getAttribute("aria-valuenow") +
        " aria-valuemax=" + conAria.getAttribute("aria-valuemax")
      );
    }
  } else log("barra: NO HAY [data-testid='playback-progressbar']");
  const tc = document.querySelector("[data-testid='playback-position']");
  const td = document.querySelector("[data-testid='playback-duration']");
  log("texto de tiempo: actual=" + JSON.stringify(tc && tc.textContent) + " total=" + JSON.stringify(td && td.textContent));

  /* ---- 4. Transporte: que dicen los botones y sus estados ------------- */
  [
    ["playPause", "[data-testid='control-button-playpause']"],
    ["next", "[data-testid='control-button-skip-forward']"],
    ["prev", "[data-testid='control-button-skip-back']"],
    ["aleatorio", "[data-testid='control-button-shuffle']"],
    ["repetir", "[data-testid='control-button-repeat']"]
  ].forEach(([n, sel]) => {
    const b = document.querySelector(sel);
    if (!b) return log(n + ": NO EXISTE (" + sel + ")");
    const st = getComputedStyle(b);
    log(
      n + ": aria-label=" + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 45)) +
      " aria-checked=" + JSON.stringify(b.getAttribute("aria-checked")) +
      " disabled=" + b.disabled +
      " visible=" + (st.display !== "none" && st.visibility !== "hidden")
    );
  });

  /* ---- 5. Titulo, artista y caratula de la ficha sonando -------------- */
  const t = document.querySelector("[data-testid='context-item-info-title']");
  log("titulo: " + JSON.stringify(t ? t.textContent.trim().slice(0, 60) : null));
  const art = document.querySelector("[data-testid='context-item-info-subtitles']");
  log("artista: " + JSON.stringify(art ? art.textContent.trim().slice(0, 40) : null));
  if (t) {
    const enlaces = Array.from((art || t.parentElement || t).querySelectorAll("a")).slice(0, 3);
    enlaces.forEach((a, i) => log("  enlace[" + i + "]: href=" + (a.getAttribute("href") || "").slice(0, 40) + " texto=" + JSON.stringify(a.textContent.trim().slice(0, 30))));
  }
  const img = document.querySelector("[data-testid='cover-art-image']") || document.querySelector("[data-testid='now-playing-widget'] img");
  log("caratula: " + (img ? "src=" + (img.src || "").slice(0, 80) : "NO HAY IMG"));

  /* ---- 6. Me gusta: donde vive el estado ------------------------------ */
  const ficha = document.querySelector("[data-testid='now-playing-widget']");
  if (ficha) {
    Array.from(ficha.querySelectorAll("button")).slice(0, 6).forEach((b, i) => {
      log(
        "ficha-boton[" + i + "]: data-testid=" + JSON.stringify(b.getAttribute("data-testid")) +
        " aria-checked=" + JSON.stringify(b.getAttribute("aria-checked")) +
        " aria-label=" + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 45))
      );
    });
  } else log("ficha sonando: NO HAY now-playing-widget");

  /* ---- 7. La cola (con el panel abierto, si esta) --------------------- */
  const colaBtn = document.querySelector("[data-testid='control-button-queue']");
  log("boton de cola: " + (colaBtn ? "existe, aria-checked=" + JSON.stringify(colaBtn.getAttribute("aria-checked")) : "NO EXISTE"));
  const filasCola = document.querySelectorAll("[data-testid='queue-track-row'], [aria-label*='cola'] li, [aria-label*='queue'] li");
  log("filas de cola visibles: " + filasCola.length + " (si es 0, abre el panel de cola y repite)");
  Array.from(filasCola).slice(0, 3).forEach((f, i) => {
    log("  fila[" + i + "]: " + JSON.stringify(f.textContent.trim().slice(0, 60)));
  });

  /* ---- 8. EL VOLCADO: los data-testid reales, por si los candidatos
   *         fallaron. Primero la barra inferior entera, luego los del
   *         resto de la pagina que suenen a reproductor. ---------------- */
  const barra = document.querySelector("[data-testid='now-playing-bar']") || document.querySelector("footer");
  if (barra) {
    const vistos = {};
    Array.from(barra.querySelectorAll("[data-testid]")).forEach((el) => {
      const k = el.getAttribute("data-testid");
      vistos[k] = (vistos[k] || 0) + 1;
    });
    log("data-testid DENTRO de la barra inferior (" + Object.keys(vistos).length + " distintos):");
    Object.entries(vistos).forEach(([k, n]) => log("   " + k + " x" + n));
  } else log("volcado: NO HAY barra inferior que volcar");

  /* ---- 9. Letras: existe el boton? ------------------------------------ */
  const letras = document.querySelector("[data-testid='lyrics-button']");
  log("boton de letras: " + (letras ? "existe, aria-label=" + JSON.stringify((letras.getAttribute("aria-label") || "").slice(0, 40)) : "NO EXISTE con [data-testid='lyrics-button']"));

  console.log(L.join("\n"));
})();
