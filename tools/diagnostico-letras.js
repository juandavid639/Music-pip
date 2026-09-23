/*
 * DIAGNOSTICO DE SELECTORES DE LETRAS
 *
 * No forma parte de la extension. Se pega en la consola de DevTools
 * estando en music.youtube.com, con el panel de letras ABIERTO.
 *
 * Objetivo: descubrir la estructura real del DOM de letras para dejar de
 * adivinar selectores en youtube-music-adapter.js. Ancla principal: la
 * atribucion "LyricFind" que YouTube Music renderiza bajo el texto.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const OUT = [];
  const log = (...args) => console.log("%c[letras]", "color:#f15a5a;font-weight:bold", ...args);

  function ruta(el) {
    const partes = [];
    let node = el;
    while (node && node.nodeType === 1 && partes.length < 8) {
      let s = node.tagName.toLowerCase();
      if (node.id) s += "#" + node.id;
      if (node.classList && node.classList.length) s += "." + [...node.classList].join(".");
      partes.unshift(s);
      node = node.parentElement;
    }
    return partes.join(" > ");
  }

  // ---------- 1. Que encuentran los selectores actuales ----------
  const ACTUALES = {
    lyricsTab: [
      'tp-yt-paper-tab[aria-label*="Letra" i]',
      'tp-yt-paper-tab[aria-label*="Lyrics" i]',
      '[role="tab"][aria-label*="Letra" i]',
      '[role="tab"][aria-label*="Lyrics" i]'
    ],
    lyricsContainer: [
      "ytmusic-description-shelf-renderer .lyrics",
      "#contents.ytmusic-description-shelf-renderer",
      '[data-testid="lyrics-container"]'
    ]
  };

  log("=== 1. Selectores actuales ===");
  Object.entries(ACTUALES).forEach(([nombre, lista]) => {
    lista.forEach((sel) => {
      let n = 0;
      try {
        n = document.querySelectorAll(sel).length;
      } catch (e) {
        n = -1;
      }
      log(`${n > 0 ? "OK  " : "----"} ${nombre}: ${sel}  -> ${n} coincidencia(s)`);
    });
  });

  // ---------- 2. Todas las pestañas del panel lateral ----------
  log("=== 2. Pestañas visibles (para el selector de 'Letras') ===");
  document.querySelectorAll('tp-yt-paper-tab, [role="tab"]').forEach((t) => {
    log({
      texto: (t.textContent || "").trim().slice(0, 40),
      ariaLabel: t.getAttribute("aria-label"),
      seleccionada: t.getAttribute("aria-selected"),
      ruta: ruta(t)
    });
  });

  // ---------- 3. Ancla LyricFind ----------
  log("=== 3. Elementos que mencionan la fuente (LyricFind / Musixmatch) ===");
  const anclas = [...document.querySelectorAll("*")].filter((el) => {
    if (el.children.length > 0) return false; // solo hojas
    const t = (el.textContent || "").trim();
    return /lyricfind|musixmatch|fuente:|source:/i.test(t) && t.length < 120;
  });
  anclas.forEach((el) => log({ texto: el.textContent.trim(), ruta: ruta(el) }));

  if (anclas.length) {
    log("=== 3b. Ancestros del ancla (el contenedor de letras esta aqui) ===");
    let node = anclas[0].parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const t = (node.textContent || "").trim();
      log(`nivel ${i + 1}: ${ruta(node)}  | ${t.length} chars | saltos: ${(t.match(/\n/g) || []).length}`);
      node = node.parentElement;
    }
  } else {
    log("No se encontro la atribucion. ¿Esta el panel de letras abierto?");
  }

  // ---------- 4. Bloques con pinta de letra ----------
  log("=== 4. Bloques de texto largo y multilinea (candidatos a contenedor) ===");
  const candidatos = [...document.querySelectorAll("div, section, ytmusic-description-shelf-renderer, yt-formatted-string")]
    .map((el) => {
      const t = (el.textContent || "").trim();
      return { el, chars: t.length, saltos: (t.match(/\n/g) || []).length };
    })
    .filter((c) => c.chars > 200 && c.saltos >= 4)
    // El contenedor mas PROFUNDO que cumple es el mas ajustado al texto.
    .filter((c) => ![...c.el.children].some((h) => (h.textContent || "").trim().length > 200 && (h.textContent.match(/\n/g) || []).length >= 4))
    .sort((a, b) => a.chars - b.chars)
    .slice(0, 8);

  candidatos.forEach((c) => {
    log({
      chars: c.chars,
      saltos: c.saltos,
      ruta: ruta(c.el),
      muestra: (c.el.textContent || "").trim().slice(0, 60).replace(/\s+/g, " ") + "…"
    });
    OUT.push(ruta(c.el));
  });

  log("=== RESUMEN: rutas candidatas ===");
  console.log(OUT.join("\n"));
  log("Copia toda esta salida y pegasela a Claude.");
})();
