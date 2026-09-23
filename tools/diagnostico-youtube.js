/*
 * Diagnostico del DOM de youtube.com (normal, no Music) para la tanda 2.
 *
 * COMO USARLO:
 *   1. Abre un video en www.youtube.com y dale a reproducir.
 *   2. F12 -> pestaña Consola. Si Chrome pide escribir "allow pasting",
 *      escribelo y Enter (es su proteccion anti-pegado, una sola vez).
 *   3. Pega este archivo ENTERO y Enter.
 *   4. Copia todo lo que imprime y pegalo de vuelta en la conversacion.
 *   5. IDEAL: repetirlo dos veces — una con un video suelto y otra con un
 *      video dentro de una LISTA de reproduccion (para la pregunta de la
 *      cola). El guion detecta solo cual de los dos casos tiene delante.
 *
 * No toca nada: solo lee. Ningun clic, ningun cambio de estado.
 */
(function () {
  const L = [];
  const log = (s) => L.push(s);

  log("=== DIAGNOSTICO YOUTUBE NORMAL — " + location.href.slice(0, 80) + " ===");

  /* ---- 1. Los candidatos a selector, interrogados uno a uno ---------- */
  const CANDIDATOS = {
    mediaElement: ["#movie_player video", "video.html5-main-video", "video"],
    playerContainer: ["#movie_player .html5-video-container", "#movie_player", "ytd-player"],
    raiz: ["ytd-watch-flexy", "ytd-watch-metadata"],
    playPause: [".ytp-play-button"],
    next: [".ytp-next-button"],
    prev: [".ytp-prev-button"],
    titulo: ["ytd-watch-metadata #title h1 yt-formatted-string", "ytd-watch-metadata #title", "h1.ytd-watch-metadata"],
    canal: ["ytd-watch-metadata #owner ytd-channel-name a", "ytd-channel-name #text", "#owner #channel-name"],
    meGusta: ["like-button-view-model button", "segmented-like-dislike-button-view-model like-button-view-model button"],
    noMeGusta: ["dislike-button-view-model button"],
    barraProgreso: [".ytp-progress-bar"],
    tiempoActual: [".ytp-time-current"],
    tiempoTotal: [".ytp-time-duration"],
    panelDeLista: ["ytd-playlist-panel-renderer#playlist", "ytd-playlist-panel-renderer"],
    itemsDeLista: ["ytd-playlist-panel-video-renderer"],
    pestanasDeTabs: [".tab-header", "tp-yt-paper-tab"]
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

  /* ---- 2. El <video>: vida, tiempos y fuente ------------------------- */
  const videos = Array.from(document.querySelectorAll("video"));
  log("videos en pagina: " + videos.length);
  videos.forEach((v, i) => {
    log(
      "  video[" + i + "]: readyState=" + v.readyState +
      " paused=" + v.paused +
      " currentTime=" + v.currentTime.toFixed(1) +
      " duration=" + (isFinite(v.duration) ? v.duration.toFixed(1) : v.duration) +
      " src=" + (v.currentSrc || "(vacio)").slice(0, 40)
    );
  });

  /* ---- 3. La barra y los textos de tiempo (la pregunta del acumulado) - */
  const barra = document.querySelector(".ytp-progress-bar");
  if (barra) {
    log(
      "barra: aria-valuenow=" + barra.getAttribute("aria-valuenow") +
      " aria-valuemax=" + barra.getAttribute("aria-valuemax") +
      " aria-valuetext=" + JSON.stringify((barra.getAttribute("aria-valuetext") || "").slice(0, 60))
    );
  } else log("barra: NO HAY .ytp-progress-bar");
  const tc = document.querySelector(".ytp-time-current");
  const td = document.querySelector(".ytp-time-duration");
  log("texto de tiempo: actual=" + JSON.stringify(tc && tc.textContent) + " total=" + JSON.stringify(td && td.textContent));
  log("(si actual/total salen vacios o viejos: mueve el raton sobre el video y vuelve a pegar SOLO esta linea:");
  log("  document.querySelector('.ytp-time-current').textContent + ' / ' + document.querySelector('.ytp-time-duration').textContent )");

  /* ---- 4. Transporte: que dicen los botones -------------------------- */
  ["ytp-play-button", "ytp-next-button", "ytp-prev-button"].forEach((c) => {
    const b = document.querySelector("." + c);
    if (!b) return log(c + ": NO EXISTE");
    const st = getComputedStyle(b);
    log(
      c + ": title=" + JSON.stringify(b.getAttribute("title")) +
      " aria-label=" + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 40)) +
      " data-title-no-tooltip=" + JSON.stringify(b.getAttribute("data-title-no-tooltip")) +
      " visible=" + (st.display !== "none" && st.visibility !== "hidden")
    );
  });

  /* ---- 5. Titulo y canal --------------------------------------------- */
  const t = document.querySelector("ytd-watch-metadata #title");
  log("titulo: " + JSON.stringify(t ? t.textContent.trim().slice(0, 60) : null));
  const canal = document.querySelector("ytd-watch-metadata #owner ytd-channel-name a");
  log("canal: " + JSON.stringify(canal ? canal.textContent.trim().slice(0, 40) : null));
  const flexy = document.querySelector("ytd-watch-flexy");
  log("ytd-watch-flexy[video-id]: " + JSON.stringify(flexy && flexy.getAttribute("video-id")));

  /* ---- 6. Me gusta / no me gusta: donde vive el estado ---------------- */
  const like = document.querySelector("like-button-view-model button");
  const dislike = document.querySelector("dislike-button-view-model button");
  [["like", like], ["dislike", dislike]].forEach(([n, b]) => {
    if (!b) return log(n + ": NO EXISTE");
    log(
      n + ": aria-pressed=" + JSON.stringify(b.getAttribute("aria-pressed")) +
      " aria-label=" + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 50))
    );
  });

  /* ---- 7. La lista de reproduccion (la pregunta de la cola) ----------- */
  const panel = document.querySelector("ytd-playlist-panel-renderer");
  if (!panel) {
    log("lista de reproduccion: NO HAY PANEL (video suelto) — repetir con una lista si se puede");
  } else {
    const items = Array.from(panel.querySelectorAll("ytd-playlist-panel-video-renderer"));
    log("lista de reproduccion: panel presente, items=" + items.length);
    items.slice(0, 3).forEach((it, i) => {
      const ti = it.querySelector("#video-title");
      const by = it.querySelector("#byline");
      log(
        "  item[" + i + "]: selected=" + it.hasAttribute("selected") +
        " titulo=" + JSON.stringify(ti ? ti.textContent.trim().slice(0, 40) : null) +
        " byline=" + JSON.stringify(by ? by.textContent.trim().slice(0, 30) : null)
      );
    });
  }

  /* ---- 8. Lo que NO deberia existir aqui (letras, repetir, aleatorio) -- */
  log("pestañas tipo YTM (.tab-header): " + document.querySelectorAll(".tab-header").length);
  log("boton repetir de pagina: " + document.querySelectorAll("[aria-label*='epetir'], .repeat").length);
  log("boton aleatorio de pagina: " + document.querySelectorAll("[aria-label*='leatorio'], .shuffle").length);
  const enPanel = panel ? panel.querySelectorAll("[aria-label]").length : 0;
  if (panel) {
    log("botones con aria-label DENTRO del panel de lista: " + enPanel);
    Array.from(panel.querySelectorAll("button[aria-label]")).slice(0, 6).forEach((b) => {
      log("   panel-boton: " + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 40)));
    });
  }

  /* ---- 9. El padre del video (para el prestamo del PiP) ---------------- */
  const v0 = document.querySelector("#movie_player video") || videos[0];
  if (v0 && v0.parentElement) {
    const p = v0.parentElement;
    log("padre del video: " + p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + " ." + String(p.className).split(/\s+/).slice(0, 2).join("."));
  }

  console.log(L.join("\n"));
})();
