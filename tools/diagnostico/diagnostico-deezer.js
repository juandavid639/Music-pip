/*
 * MEDIR DEEZER PARA ESCRIBIR SU ADAPTADOR (tanda AW).
 *
 * Deezer pide sesion iniciada, asi que quien escribe el adaptador no puede
 * medirlo solo: este guion lo mide en la pestaña del autor y deja el
 * resultado en el portapapeles para pegarlo en el chat. No escribe nada en
 * la pagina, no pulsa nada y no lee nada de la cuenta (solo la barra del
 * reproductor).
 *
 * COMO SE USA
 *   1. En deezer.com, con una cancion SONANDO.
 *   2. DevTools > Consola, en el contexto de siempre («top»: aqui todavia no
 *      hay extension que elegir).
 *   3. Pegar este archivo entero y pulsar Intro. Se mide dos veces, sonando
 *      y (tras pausar tu) en pausa, para ver que cambia: el guion lo pide.
 *
 * Que mide: si hay <audio>/<video> en el documento (decide si hay
 * ecualizador y barras), la barra del reproductor (todo lo que lleva
 * data-testid, aria-label o es un deslizador, con sus atributos), los
 * botones con su estado (aria-pressed/aria-checked/clases), la caratula y
 * los textos de tiempo. Recorta textos a 80 caracteres.
 */
(function () {
  const recorta = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 80);

  function describir(el) {
    const atributos = {};
    for (const a of el.attributes) {
      if (/^(data-testid|aria-[a-z]+|role|type|min|max|value|step|title|class|src|style)$/.test(a.name)) {
        atributos[a.name] = recorta(a.value);
      }
    }
    return { tag: el.tagName.toLowerCase(), texto: recorta(el.textContent), atributos };
  }

  // La barra: el contenedor que mas mandos de reproduccion tiene dentro.
  function barra() {
    const candidatos = document.querySelectorAll("footer, [data-testid*='player' i], [class*='player' i], [id*='player' i]");
    let mejor = null;
    let puntos = -1;
    for (const c of candidatos) {
      const n = c.querySelectorAll("button, input[type='range'], [role='slider'], [role='progressbar']").length;
      if (n > puntos && n < 80) {
        mejor = c;
        puntos = n;
      }
    }
    return mejor;
  }

  function medir(etiqueta) {
    const b = barra();
    const dentro = b
      ? Array.from(
          b.querySelectorAll(
            "[data-testid], [aria-label], button, a, img, input[type='range'], [role='slider'], [role='progressbar'], time, [aria-valuenow]"
          )
        ).slice(0, 160)
      : [];
    return {
      etiqueta,
      url: location.href.replace(/\?.*$/, ""),
      medios: {
        audio: document.querySelectorAll("audio").length,
        video: document.querySelectorAll("video").length,
        audioConSrc: Array.from(document.querySelectorAll("audio")).map((a) => ({ src: recorta(a.currentSrc || a.src), paused: a.paused }))
      },
      barra: b ? describir(b) : null,
      elementos: dentro.map(describir)
    };
  }

  const resultado = { sonando: medir("sonando") };
  console.log("%c[deezer] Medido SONANDO. Ahora pausa la canción y escribe: ytmpipDeezerPausa()", "font-weight:bold;color:#4caf50");
  window.ytmpipDeezerPausa = function () {
    resultado.pausa = medir("pausa");
    const texto = JSON.stringify(resultado, null, 1);
    try {
      copy(texto);
      console.log("%c[deezer] Listo: el resultado está en el portapapeles. Pégalo en el chat.", "font-weight:bold;color:#4caf50");
    } catch (err) {
      console.log(texto);
      console.log("[deezer] copy() no está disponible: copia el texto de arriba.");
    }
  };
})();
