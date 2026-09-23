/*
 * Diagnostico 3 de open.spotify.com: las dos piezas que faltan de la
 * cola — donde vive el TITULO dentro de una fila, y si "Estas
 * escuchando" y "Proximas canciones" son listas separadas.
 *
 * COMO USARLO: con una cancion sonando y el panel de COLA abierto,
 * F12 -> Consola -> pegar ENTERO -> Enter -> copiar lo impreso aqui.
 *
 * Solo lee. Ningun clic, ningun cambio de estado.
 */
(function () {
  const L = [];
  const log = (s) => L.push(s);

  log("=== DIAGNOSTICO SPOTIFY 3 — " + location.href.slice(0, 60) + " ===");

  const aside = Array.from(document.querySelectorAll("aside")).find((a) => a.querySelector("li"));
  if (!aside) {
    console.log("NO HAY PANEL CON FILAS: abre la cola y repite");
    return;
  }

  /* ---- 1. La agrupacion: cuantos <ul> hay y de quien es cada uno ---- */
  const uls = Array.from(aside.querySelectorAll("ul"));
  log("uls en el panel: " + uls.length + " -> filas por ul: " + uls.map((u) => u.querySelectorAll("li").length).join(", "));
  uls.forEach((u, i) => {
    const h = u.previousElementSibling;
    log(
      "ul[" + i + "]: aria-label=" + JSON.stringify((u.getAttribute("aria-label") || "").slice(0, 45)) +
      " hermano-previo=" + (h ? h.tagName.toLowerCase() + " " + JSON.stringify(h.textContent.trim().slice(0, 40)) : "(nada)")
    );
    const p = u.parentElement;
    log(
      "ul[" + i + "] padre: " + p.tagName.toLowerCase() +
      " testid=" + JSON.stringify(p.getAttribute("data-testid")) +
      " aria-label=" + JSON.stringify((p.getAttribute("aria-label") || "").slice(0, 45))
    );
  });

  /* ---- 2. La primera fila por dentro: cada elemento que tiene texto
   *         PROPIO (nodos de texto directos), para encontrar el titulo - */
  const fila = aside.querySelector("li");
  log("primera fila, por dentro:");
  Array.from(fila.querySelectorAll("*")).slice(0, 25).forEach((el) => {
    const texto = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join("");
    const tid = el.getAttribute("data-testid");
    if (!texto && !tid) return;
    log(
      "  " + el.tagName.toLowerCase() +
      " testid=" + JSON.stringify(tid) +
      " clase=" + JSON.stringify(String(el.className).split(/\s+/).slice(0, 2).join(".").slice(0, 45)) +
      (texto ? " TEXTO=" + JSON.stringify(texto.slice(0, 35)) : "")
    );
  });

  console.log(L.join("\n"));
})();
