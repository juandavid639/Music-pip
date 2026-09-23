// El guion del marco de vista previa (vista-previa.html). Pinta una cancion
// de mentira sobre el pip.html y el pip.css REALES, para que lo que se vea
// sea lo que se vera en la ventana flotante. Va en archivo aparte porque la
// CSP de Manifest V3 ignora los <script> en linea dentro de la extension.
const PORTADA =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#7b3fe4"/><stop offset="1" stop-color="#e4553f"/>
       </linearGradient></defs>
       <rect width="544" height="544" fill="url(#g)"/>
       <circle cx="272" cy="272" r="120" fill="rgba(255,255,255,.25)"/>
     </svg>`
  );

const FOTOGRAMA =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
       <rect width="1280" height="720" fill="#1d3b2a"/>
       <text x="640" y="380" font-family="sans-serif" font-size="90"
             fill="#8fe3b0" text-anchor="middle">VÍDEO 16:9</text>
     </svg>`
  );

const parametros = new URLSearchParams(location.search);
const conVideo = parametros.has("video");
// Modo karaoke: la cancion no tiene video pero si letra sincronizada,
// asi que se enseña la linea que suena bajo el artista. Es el estado
// de los pantallazos que reportan cabecera y fila de acciones
// ausentes, y hasta ahora la rejilla no lo cubria.
const conLetra = parametros.has("letra");
// La letra ocupa el escenario: la portada se va al fondo difuminado y
// el panel completo se queda con la ventana entera, sea cual sea su
// tamaño. Es el estado que pinta la clase ytmpip-lyrics-stage.
const letraEnGrande = conLetra && parametros.has("escenario");
// Solo caratula: el boton "Aa" quita el titulo y el artista y la
// imagen se queda con el hueco que dejan.
const sinTexto = parametros.has("limpio");
// Espectro. Aqui las barras son inventadas a proposito: lo que hay
// que poder mirar es DONDE cae el canvas y cuanto tapa, y para eso
// da igual de donde salgan los numeros.
const conEspectro = parametros.has("espectro");

/*
 * OJO: esta es una COPIA de la regla de densidad de pip.js, solo para
 * la vista previa. Lee los mismos umbrales de constants.js, asi que no
 * puede desviarse en los numeros; la version buena, y la que esta
 * cubierta por pruebas, es YTMPip.PipView.densityFor.
 */
const { PIP_BREAKPOINTS } = self.YTMPip.CONSTANTS;

function aplicarDensidad(root) {
  const alto = window.innerHeight;
  const ancho = window.innerWidth;
  const mini = alto < PIP_BREAKPOINTS.HEIGHT_MINI;
  const tight = !mini && alto < PIP_BREAKPOINTS.HEIGHT_TIGHT;

  root.classList.toggle("ytmpip-mini", mini);
  root.classList.toggle("ytmpip-tight", tight);
  root.classList.toggle("ytmpip-narrow", ancho < PIP_BREAKPOINTS.WIDTH_NARROW);
  root.classList.toggle("ytmpip-video-mode", conVideo);
  root.classList.toggle("ytmpip-karaoke", conLetra && !conVideo);
  root.classList.toggle("ytmpip-lyrics-stage", letraEnGrande);
  root.classList.toggle("ytmpip-sin-texto", sinTexto);
  // Los mandos flotan encima con el videoclip pequeño Y con la letra
  // en grande, a cualquier tamaño. Copia de layoutFor, como el resto
  // de esta funcion.
  const superpuesto = letraEnGrande || (mini && conVideo);
  root.classList.toggle("compact", mini && !conVideo && !superpuesto);
  root.classList.toggle("expanded", !mini && !conVideo && !superpuesto);
  root.classList.toggle("ytmpip-overlay", superpuesto);
}

/*
 * Barras inventadas, y a proposito no se copia aqui barrasParaAncho:
 * la pregunta que responde esta vista es donde cae el canvas y
 * cuanto tapa, y para eso el numero exacto de barras da igual.
 * Copiar la regla seria tener dos, y esta vista previa ya carga con
 * una copia (la de densidad, arriba) que al menos lee los mismos
 * umbrales.
 */
function pintarBarrasDeMentira(lienzo) {
  const caja = lienzo.getBoundingClientRect();
  if (!caja.width || !caja.height) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = Math.round(caja.width * escala);
  const alto = Math.round(caja.height * escala);
  lienzo.width = ancho;
  lienzo.height = alto;

  const contexto = lienzo.getContext("2d");
  const barras = 24;
  const paso = ancho / barras;
  const grosor = Math.max(1, paso - Math.max(1, paso / 6));
  // La misma variable que lee pip.js, no --ytmpip-accent: si aqui se
  // leyera otra, esta vista dejaria de enseñar lo que se va a ver.
  contexto.fillStyle = getComputedStyle(document.getElementById("ytmpip-root"))
    .getPropertyValue("--ytmpip-spectrum-color")
    .trim();
  for (let i = 0; i < barras; i++) {
    // Curva con forma de musica: mucho grave, poco agudo y un pico.
    const fraccion = Math.max(0.06, Math.pow(1 - i / barras, 1.6) * (i % 5 === 2 ? 1.3 : 0.8));
    contexto.fillRect(i * paso, alto - fraccion * alto, grosor, fraccion * alto);
  }
}

fetch("../pip/pip.html")
  .then((r) => r.text())
  .then((html) => {
    document.body.innerHTML = html;
    // Lo primero, igual que en cacheElements: los emoji del HTML no
    // se llegan a ver ni un fotograma.
    self.YTMPip.Iconos.pintarTodos(document);
    const root = document.getElementById("ytmpip-root");
    root.className = "";

    document.getElementById("ytmpip-status").textContent = "Conectado";
    document.getElementById("ytmpip-title").textContent =
      'Ginger Root - "Weather" (Official Music Video)';
    document.getElementById("ytmpip-artist").textContent = "Ginger Root";
    document.getElementById("ytmpip-album").textContent = "Rikki";
    document.getElementById("ytmpip-artwork").src = PORTADA;

    const fondo = document.getElementById("ytmpip-backdrop");
    fondo.style.backgroundImage = `url("${PORTADA}")`;
    fondo.classList.add("ytmpip-has-art");

    const seek = document.getElementById("ytmpip-seek");
    seek.max = 223;
    seek.value = 63;
    seek.style.setProperty("--ytmpip-played", `${(63 / 223) * 100}%`);
    document.getElementById("ytmpip-current-time").textContent = "1:03";
    document.getElementById("ytmpip-duration").textContent = "3:43";

    const vol = document.getElementById("ytmpip-volume");
    vol.value = 70;
    vol.style.setProperty("--ytmpip-played", "70%");

    const VERSOS = [
      "Sorry, don't want you to visit, no",
      "I've been on my own since the day that I was born",
      "And I don't need anybody, no",
      "Tell me why you keep on calling me at night"
    ];

    /*
     * Con la letra en grande manda el panel completo, asi que la linea
     * bajo el titulo y su adelanto sobran: en la ventana real los
     * esconde updateNowLine por la misma razon (seria la misma letra
     * dos veces). Por eso las dos ramas son excluyentes.
     */
    if (letraEnGrande) {
      const lineas = document.getElementById("ytmpip-lyrics-lines");
      VERSOS.forEach((texto, i) => {
        const p = document.createElement("p");
        p.className = "ytmpip-lyric-line" + (i === 1 ? " ytmpip-lyric-active" : "");
        p.textContent = texto;
        lineas.appendChild(p);
      });
      lineas.hidden = false;
      document.getElementById("ytmpip-lyrics-text").hidden = true;
      document.getElementById("ytmpip-lyrics-source").textContent = "Letra: Better Lyrics";
      document.getElementById("ytmpip-lyrics-panel").hidden = false;
      document.getElementById("ytmpip-lyrics-toggle").setAttribute("aria-expanded", "true");
    } else if (conLetra && !conVideo) {
      const linea = document.getElementById("ytmpip-now-line");
      linea.textContent = VERSOS[0];
      linea.hidden = false;

      // Se preparan las tres que prepara pip.js; el CSS de densidad
      // decide cuantas sobreviven en cada recuadro, que es justo lo
      // que hay que poder mirar aqui.
      const siguientes = document.getElementById("ytmpip-next-lines");
      for (const texto of VERSOS.slice(1)) {
        const p = document.createElement("p");
        p.className = "ytmpip-next-line";
        p.textContent = texto;
        siguientes.appendChild(p);
      }
      siguientes.hidden = false;
    }

    if (conVideo) {
      const hueco = document.getElementById("ytmpip-video-slot");
      const video = document.createElement("video");
      video.poster = FOTOGRAMA;
      // Estilos en linea como los que pone YouTube Music: sirven para
      // comprobar que pip.css los machaca de verdad.
      video.setAttribute("style", "width:854px;height:480px;position:absolute;left:120px");
      hueco.appendChild(video);
      hueco.hidden = false;

      // El boton de alternar video/caratula nace oculto y quien lo
      // enseña es syncVideoMode, que aqui no corre. Se destapa a mano
      // SOLO para poder mirar como queda la cabecera con tres
      // botones: esta vista previa no alterna nada, solo maqueta.
      document.getElementById("ytmpip-video-toggle").hidden = false;
    }

    // Los dos botones nuevos. El de espectro tambien nace oculto (lo
    // destapa sincronizarEspectro segun pueda medirse el audio) y el
    // de "Aa" ya nace visible; aqui solo se marca como pulsado.
    const botonLimpio = document.getElementById("ytmpip-clean-toggle");
    botonLimpio.setAttribute("aria-pressed", String(sinTexto));
    const botonEspectro = document.getElementById("ytmpip-spectrum-toggle");
    botonEspectro.hidden = false;
    botonEspectro.setAttribute("aria-pressed", String(conEspectro));

    /*
     * El alto y el color del espectro los escribe applySettings, que
     * aqui no corre: pip.css ya no les pone valor de reserva a
     * proposito (el valor por defecto vive en DEFAULT_SETTINGS y
     * repetirlo en el CSS seria tenerlo en dos sitios). Asi que esta
     * vista los escribe igual que lo haria la ventana, leyendo las
     * mismas constantes, y admite un valor por la URL para poder
     * mirar los extremos: ?altoEspectro=100&colorEspectro=%2300ff88
     */
    const preferido = self.YTMPip.CONSTANTS.DEFAULT_SETTINGS;
    root.style.setProperty(
      "--ytmpip-spectrum-height",
      (parametros.get("altoEspectro") || preferido.spectrumHeight) + "%"
    );
    root.style.setProperty(
      "--ytmpip-spectrum-color",
      parametros.get("colorEspectro") || "var(--ytmpip-accent)"
    );

    if (conEspectro) {
      const lienzo = document.getElementById("ytmpip-spectrum");
      lienzo.hidden = false;
      pintarBarrasDeMentira(lienzo);
      // El canvas se estira con el escenario, asi que hay que
      // repintarlo al cambiar de tamaño o sale borroso.
      window.addEventListener("resize", () => pintarBarrasDeMentira(lienzo));
    }

    aplicarDensidad(root);
    window.addEventListener("resize", () => aplicarDensidad(root));
  });
