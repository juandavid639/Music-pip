/*
 * CAPTURAR UNA FIXTURE DEL SITIO REAL (tanda AL).
 *
 * Las fixtures de tests/fixtures/ estan escritas a mano a partir de lo que
 * se vio en el sitio, y envejecen en silencio: YouTube Music cambia una
 * clase, las pruebas siguen verdes contra el HTML de hace meses y el fallo
 * lo descubre un usuario. Este guion recorta del DOM VIVO justo lo que el
 * adaptador lee, con sus antepasados, y lo deja en el portapapeles como una
 * fixture lista para guardar.
 *
 * COMO SE USA
 *   1. En la pestaña del sitio (YouTube Music, YouTube o Spotify), con una
 *      cancion sonando y, si interesa, la letra o la cola abiertas.
 *   2. DevTools > Consola. En el desplegable de contexto (arriba a la
 *      izquierda, pone «top») elegir «Music PiP». Sin eso el guion no ve
 *      el adaptador: la extension vive en un mundo aislado.
 *   3. Pegar este archivo entero y pulsar Intro. La fixture queda copiada;
 *      pegarla en tests/fixtures/<nombre>.html.
 *
 * ANTES DE GUARDARLA, LEELA. Se quitan scripts, estilos, iframes, lienzos,
 * atributos de evento y los src de los <video> (son blobs de la sesion),
 * pero el texto se queda: titulos, artistas, la cola y la letra que
 * hubiera en pantalla. Nada de la cuenta (el avatar y el menu de usuario
 * no estan en lo que el adaptador lee), pero la ultima palabra es tuya.
 *
 * Los selectores NO se copian aqui: se preguntan al adaptador activo
 * (sus getters), asi que el guion no envejece cuando cambien.
 */
(function () {
  if (typeof YTMPip === "undefined" || !YTMPip.Adapter) {
    console.error(
      "[fixture] No veo la extension. Elige «Music PiP» en el desplegable de contexto de la consola " +
        "(arriba a la izquierda, donde pone «top») y vuelve a pegar el guion."
    );
    return;
  }
  const A = YTMPip.Adapter;
  const registro = YTMPip.Adaptadores && YTMPip.Adaptadores.activo ? YTMPip.Adaptadores.activo() : null;

  // Lo que el adaptador sabe encontrar. Cada getter se llama sin argumentos;
  // los que devuelven listas (la cola) se aplanan.
  const GETTERS = [
    "getPlayerBar",
    "getPlayPauseButton",
    "getNextButton",
    "getPreviousButton",
    "getTitleElement",
    "getSubtitleElement",
    "getArtworkElement",
    "getProgressBarElement",
    "getTimeInfoElement",
    "getLikeButton",
    "getDislikeButton",
    "getRepeatButton",
    "getShuffleButton",
    "getLyricsTab",
    "getTabRenderer",
    "getLyricsTextElement",
    "getLyricsSourceElement",
    "getLyricsMessageElement",
    "getBetterLyricsContainer",
    "getQueueItems",
    "getPageMediaElement",
    "getCanvasVideo"
  ];

  const encontrados = [];
  const informe = [];
  for (const nombre of GETTERS) {
    let r = null;
    try {
      r = typeof A[nombre] === "function" ? A[nombre]() : null;
    } catch (err) {
      informe.push({ getter: nombre, resultado: "LANZA: " + err.message });
      continue;
    }
    const lista = (Array.isArray(r) ? r : r && r.nodeType === 1 ? [r] : r && r.length ? Array.from(r) : []).filter(
      (el) => el && el.nodeType === 1
    );
    informe.push({ getter: nombre, resultado: lista.length ? lista.length + " elemento(s)" : "nada" });
    encontrados.push(...lista);
  }

  // Quien ya esta dentro de otro capturado sobra: va con el.
  const raices = encontrados.filter((el, i) => encontrados.indexOf(el) === i && !encontrados.some((o) => o !== el && o.contains(el)));

  const FUERA = "script,style,link,iframe,canvas,noscript,template";
  function limpiar(el) {
    el.querySelectorAll(FUERA).forEach((n) => n.remove());
    for (const n of [el, ...el.querySelectorAll("*")]) {
      for (const a of Array.from(n.attributes)) {
        const largo = a.value.length > 400 && a.name !== "d";
        if (/^on/i.test(a.name) || a.name === "style" || a.name === "srcset" || largo) n.removeAttribute(a.name);
      }
      if (n.tagName === "VIDEO" || n.tagName === "AUDIO") n.removeAttribute("src");
    }
    const quitar = [];
    const it = document.createNodeIterator(el, NodeFilter.SHOW_COMMENT);
    for (let c = it.nextNode(); c; c = it.nextNode()) quitar.push(c);
    quitar.forEach((c) => c.remove());
    return el;
  }

  // El esqueleto: cada raiz cuelga de copias VACIAS de sus antepasados, para
  // que los selectores con contexto («ytmusic-player video») sigan casando.
  const cuerpo = document.createElement("body");
  const copias = new Map([[document.body, cuerpo]]);
  function cascara(el) {
    if (copias.has(el)) return copias.get(el);
    const c = limpiar(el.cloneNode(false));
    copias.set(el, c);
    cascara(el.parentElement || document.body).appendChild(c);
    return c;
  }
  for (const raiz of raices) {
    if (!document.body.contains(raiz)) continue;
    const padre = raiz.parentElement === document.body ? cuerpo : cascara(raiz.parentElement);
    padre.appendChild(limpiar(raiz.cloneNode(true)));
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const cabecera = [
    "<!--",
    "  Capturada del sitio real con tools/diagnostico/diagnostico-fixture.js el " + fecha + ".",
    "  Sitio: " + location.hostname + ". Adaptador: " + ((registro && registro.nombre) || "?") +
      " (schemaVersion " + A.schemaVersion + ").",
    "  Recortada: solo lo que leen los getters del adaptador, con sus antepasados vacios.",
    "  Escribe aqui QUE caso fija esta fixture antes de guardarla.",
    "-->"
  ].join("\n");
  const html = "<!doctype html>\n" + cabecera + '\n<html lang="' + (document.documentElement.lang || "es") + '">\n  ' + cuerpo.outerHTML + "\n</html>\n";

  console.table(informe);
  try {
    copy(html);
    console.log("%c[fixture] Copiada al portapapeles (" + Math.round(html.length / 1024) + " KB). Leela antes de guardarla.", "color:#4caf50;font-weight:bold");
  } catch (err) {
    console.log(html);
    console.log("[fixture] copy() no esta disponible aqui: copia el HTML de arriba a mano.");
  }
})();
