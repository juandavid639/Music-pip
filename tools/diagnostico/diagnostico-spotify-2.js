/*
 * Diagnostico 2 de open.spotify.com: los tres huecos que el primero
 * no alcanzo — el aleatorio sin data-testid, las filas de la cola y
 * las lineas de letras.
 *
 * COMO USARLO (dos pasadas):
 *   PASADA A: con una cancion sonando y el panel de COLA abierto
 *             (como en tu pantallazo de "Fila de reproduccion").
 *   PASADA B: con la vista de LETRAS abierta (el boton del microfono,
 *             en una cancion que si tenga letra).
 *   En cada una: F12 -> Consola -> pegar este archivo ENTERO -> Enter
 *   -> copiar lo impreso y pegarlo en la conversacion.
 *
 * Solo lee. Ningun clic, ningun cambio de estado.
 */
(function () {
  const L = [];
  const log = (s) => L.push(s);
  const testid = (el) => el.getAttribute("data-testid");

  log("=== DIAGNOSTICO SPOTIFY 2 — " + location.href.slice(0, 70) + " ===");

  /* ---- A. La caza del aleatorio: TODOS los botones de la zona de
   *         controles, tengan testid o no ---------------------------- */
  const zona = document.querySelector("[data-testid='player-controls']");
  if (!zona) {
    log("player-controls: NO EXISTE");
  } else {
    Array.from(zona.querySelectorAll("button")).forEach((b, i) => {
      log(
        "control[" + i + "]: testid=" + JSON.stringify(testid(b)) +
        " aria-label=" + JSON.stringify((b.getAttribute("aria-label") || "").slice(0, 50)) +
        " aria-checked=" + JSON.stringify(b.getAttribute("aria-checked")) +
        " clase=" + JSON.stringify(String(b.className).split(/\s+/).slice(0, 1).join(""))
      );
    });
  }

  /* ---- B. La barra: se mueve el value o va a saltos de 5000? --------
   * (comparar entre dos pegadas del script tambien vale) */
  const input = document.querySelector("[data-testid='playback-progressbar'] input");
  const pos = document.querySelector("[data-testid='playback-position']");
  if (input) log("barra ahora: value=" + input.value + " max=" + input.max + " texto=" + JSON.stringify(pos && pos.textContent));

  /* ---- C. El panel derecho por dentro: la cola --------------------- */
  const asides = Array.from(document.querySelectorAll("aside"));
  log("asides en pagina: " + asides.length);
  asides.forEach((aside, ai) => {
    const vistos = {};
    aside.querySelectorAll("[data-testid]").forEach((el) => {
      const k = testid(el);
      vistos[k] = (vistos[k] || 0) + 1;
    });
    const claves = Object.entries(vistos).map(([k, n]) => k + " x" + n);
    log("aside[" + ai + "] (" + claves.length + " testids):");
    claves.slice(0, 40).forEach((k) => log("   " + k));

    // Las filas: probar lo generico — li, role=row, role=listitem
    ["li", "[role='row']", "[role='listitem']"].forEach((sel) => {
      const filas = aside.querySelectorAll(sel);
      if (!filas.length) return;
      log("aside[" + ai + "] filas con '" + sel + "': " + filas.length);
      Array.from(filas).slice(0, 3).forEach((f, i) => {
        const enlaces = Array.from(f.querySelectorAll("a")).slice(0, 2)
          .map((a) => JSON.stringify(a.textContent.trim().slice(0, 30)) + " href=" + (a.getAttribute("href") || "").slice(0, 25));
        log(
          "   fila[" + i + "]: aria-current=" + JSON.stringify(f.getAttribute("aria-current")) +
          " aria-selected=" + JSON.stringify(f.getAttribute("aria-selected")) +
          " texto=" + JSON.stringify(f.textContent.trim().slice(0, 55))
        );
        enlaces.forEach((e) => log("      enlace: " + e));
      });
    });
  });

  /* ---- D. Los encabezados del panel de cola ("Estas escuchando" /
   *         "Proximas canciones"), para separar lo sonando de lo
   *         que viene --------------------------------------------------- */
  asides.forEach((aside, ai) => {
    Array.from(aside.querySelectorAll("h1,h2,h3,h4")).slice(0, 8).forEach((h) => {
      log("aside[" + ai + "] " + h.tagName.toLowerCase() + ": " + JSON.stringify(h.textContent.trim().slice(0, 45)));
    });
  });

  /* ---- E. Las letras (solo dira algo en la PASADA B) ----------------- */
  const candidatosLetras = [
    "[data-testid='fullscreen-lyric']",
    "[data-testid='lyrics-line']",
    "main [data-testid]"
  ];
  candidatosLetras.forEach((sel) => {
    try {
      log("letras '" + sel + "': " + document.querySelectorAll(sel).length);
    } catch (e) { log("letras '" + sel + "': SELECTOR INVALIDO"); }
  });
  const linea = document.querySelector("[data-testid='fullscreen-lyric']");
  if (linea) {
    log("linea de letra ejemplo: " + JSON.stringify(linea.textContent.trim().slice(0, 50)) +
      " clase=" + JSON.stringify(String(linea.className).slice(0, 60)));
  } else {
    // El volcado de main, por si el nombre es otro
    const vistos = {};
    document.querySelectorAll("main [data-testid]").forEach((el) => {
      const k = testid(el);
      vistos[k] = (vistos[k] || 0) + 1;
    });
    log("testids en main (" + Object.keys(vistos).length + "):");
    Object.entries(vistos).slice(0, 25).forEach(([k, n]) => log("   " + k + " x" + n));
  }

  /* ---- F. Las 3 caratulas: sus src, para ver los tamaños ------------- */
  document.querySelectorAll("[data-testid='cover-art-image']").forEach((img, i) => {
    log("caratula[" + i + "]: " + (img.src || "").slice(0, 90));
  });

  console.log(L.join("\n"));
})();
