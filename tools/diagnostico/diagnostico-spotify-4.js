/*
 * Diagnostico 4 (y ultimo) de open.spotify.com: las tres señales que
 * faltan para no escribir nada de memoria.
 *
 *   1. COMO SE VE "ESTA SONANDO" sin idioma: el icono del boton de
 *      play/pausa (el aria-label "Pausar"/"Reproducir" cambia con el
 *      idioma de la interfaz; el dibujo del SVG no).
 *   2. EL ENVOLTORIO de los artistas en una fila de la cola (para
 *      leer "Nico Hernandez, Banda Los Recoditos" entero y no solo
 *      el primer enlace).
 *   3. LOS ATRIBUTOS del boton de letras (como dice "activo" y como
 *      dice "esta cancion no tiene letra" sin leer el texto).
 *
 * COMO USARLO (tres pasadas cortas):
 *   PASADA A: cancion SONANDO + panel de cola abierto -> pegar entero.
 *   PASADA B: pausa la musica -> pegar entero otra vez.
 *   PASADA C (si se puede): con una cancion SIN letra sonando ->
 *             pegar entero una ultima vez.
 *
 * Solo lee. Ningun clic, ningun cambio de estado.
 */
(function () {
  const L = [];
  const log = (s) => L.push(s);

  log("=== DIAGNOSTICO SPOTIFY 4 — " + location.pathname.slice(0, 40) + " ===");

  /* ---- 1. El boton de play/pausa por dentro ------------------------- */
  const pp = document.querySelector("[data-testid='control-button-playpause']");
  if (!pp) {
    log("playpause: NO EXISTE");
  } else {
    log("playpause aria-label=" + JSON.stringify(pp.getAttribute("aria-label")));
    const svg = pp.querySelector("svg");
    const path = svg && svg.querySelector("path");
    log("playpause svg: " + (svg ? "existe" : "NO HAY") +
      (path ? " path.d=" + JSON.stringify((path.getAttribute("d") || "").slice(0, 60)) : " SIN <path>"));
    // Por si la señal esta en otro sitio: todos los atributos del boton.
    log("playpause atributos: " + Array.from(pp.attributes).map((a) => a.name + "=" + JSON.stringify(String(a.value).slice(0, 30))).join(" "));
  }

  /* ---- 2. El envoltorio de los artistas en las filas de la cola ------ */
  const filas = Array.from(document.querySelectorAll("aside li")).slice(0, 5);
  if (!filas.length) log("cola: SIN FILAS (abre el panel de cola)");
  filas.forEach((li, i) => {
    const a = li.querySelector("a");
    if (!a) return log("fila[" + i + "]: sin enlace");
    const p = a.parentElement;
    log(
      "fila[" + i + "] padre-del-enlace: " + p.tagName.toLowerCase() +
      " testid=" + JSON.stringify(p.getAttribute("data-testid")) +
      " clase=" + JSON.stringify(String(p.className).split(/\s+/).slice(0, 2).join(".").slice(0, 45)) +
      " TEXTO=" + JSON.stringify(p.textContent.trim().slice(0, 45))
    );
  });

  /* ---- 3. El boton de letras, con todos sus atributos ---------------- */
  const ly = document.querySelector("[data-testid='lyrics-button']");
  if (!ly) {
    log("letras: NO EXISTE el boton");
  } else {
    log("letras disabled=" + ly.disabled + " atributos: " +
      Array.from(ly.attributes).map((a) => a.name + "=" + JSON.stringify(String(a.value).slice(0, 45))).join(" "));
  }

  /* ---- 4. De paso: donde estamos (la vista de letras es una RUTA) ---- */
  log("pathname: " + location.pathname);

  console.log(L.join("\n"));
})();
