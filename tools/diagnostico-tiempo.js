/*
 * DIAGNOSTICO DEL TIEMPO POR PISTA
 *
 * No forma parte de la extension. Se pega en la consola de DevTools
 * estando en music.youtube.com, CON MUSICA SONANDO y, a ser posible, ya
 * por la SEGUNDA cancion de una cola (que es donde se ve el fallo).
 *
 * Existe porque el arreglo de "se junta el tiempo entre canciones" se
 * apoya en dos selectores que YO NO HE VERIFICADO contra el DOM real:
 * #progress-bar y .time-info. Si los dos fallan, getPageTrackTime()
 * devuelve null y la extension se cae en silencio a los numeros del
 * <video>, que son los ACUMULADOS de toda la cola: exactamente el fallo
 * que se pretendia arreglar. Cinco intentos anteriores se perdieron por
 * dar por buena una conjetura sobre el DOM; esto es para no hacer el
 * sexto a ciegas.
 *
 * Lo que hay que mirar en la salida: si "pista" coincide con lo que se ve
 * en la barra de YouTube Music y "cola" es un numero mayor, el arreglo
 * esta funcionando. Si "pista" sale null, hay que corregir los selectores.
 *
 * No envia nada a ningun sitio: solo imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[tiempo]", "color:#3ba55d;font-weight:bold", ...args);

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

  function reloj(s) {
    if (!Number.isFinite(s)) return String(s);
    return Math.floor(s / 60) + ":" + Math.floor(s % 60).toString().padStart(2, "0");
  }

  const SELECTORES = {
    progressBar: [
      "#progress-bar",
      "tp-yt-paper-slider#progress-bar",
      '[role="slider"][aria-label*="tiempo" i]',
      '[role="slider"][aria-label*="time" i]'
    ],
    timeInfo: [
      "ytmusic-player-bar .time-info",
      "ytmusic-player-bar span.time-info",
      ".ytmusic-player-bar .time-info"
    ]
  };

  // ---------- 1. Los selectores que usa la extension ----------
  log("--- selectores actuales ---");
  for (const [nombre, lista] of Object.entries(SELECTORES)) {
    for (const sel of lista) {
      const el = document.querySelector(sel);
      log(el ? "OK  " : "no  ", nombre, sel, el ? ruta(el) : "");
    }
  }

  // ---------- 2. Que valores dan ----------
  const slider = SELECTORES.progressBar.map((s) => document.querySelector(s)).find(Boolean);
  if (slider) {
    log("--- deslizador ---", {
      "aria-valuenow": slider.getAttribute("aria-valuenow"),
      "aria-valuemax": slider.getAttribute("aria-valuemax"),
      value: slider.value,
      max: slider.max
    });
  } else {
    log("--- deslizador --- NO ENCONTRADO");
    // Red de rescate: cualquier slider de la pagina, para poder corregir.
    document.querySelectorAll('[role="slider"], tp-yt-paper-slider').forEach((el) => {
      log("   candidato:", ruta(el), {
        now: el.getAttribute("aria-valuenow"),
        max: el.getAttribute("aria-valuemax"),
        label: el.getAttribute("aria-label")
      });
    });
  }

  const texto = SELECTORES.timeInfo.map((s) => document.querySelector(s)).find(Boolean);
  if (texto) {
    log("--- texto de tiempo ---", JSON.stringify(texto.textContent));
  } else {
    log("--- texto de tiempo --- NO ENCONTRADO");
    // Cualquier nodo de la barra cuyo texto se parezca a "1:35 / 3:18".
    const barra = document.querySelector("ytmusic-player-bar");
    if (barra) {
      barra.querySelectorAll("*").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (el.children.length === 0 && /^\d{1,2}:\d{2}(:\d{2})?\s*[/•]/.test(t)) {
          log("   candidato:", ruta(el), JSON.stringify(t));
        }
      });
    }
  }

  // ---------- 3. La comparacion que importa ----------
  const video = document.querySelector("video");
  if (video) {
    log("--- el <video> (numeros de LA COLA) ---", {
      currentTime: video.currentTime + " (" + reloj(video.currentTime) + ")",
      duration: video.duration + " (" + reloj(video.duration) + ")"
    });
  } else {
    log("--- el <video> --- NO ENCONTRADO (¿modo PiP con el video prestado?)");
  }

  log(
    "COMPARA: los numeros de la barra de YouTube Music son los de la PISTA. " +
      "Si el <video> marca mas, es la cola entera y el arreglo es necesario. " +
      "Si arriba salio NO ENCONTRADO en las DOS fuentes, la extension no puede " +
      "saber el tiempo de la pista y hay que corregir los selectores."
  );
})();
