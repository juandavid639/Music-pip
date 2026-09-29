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

/*
 * Como el t() de pip.js, pero con el ESPAÑOL de respaldo en vez de la
 * clave pelada. La ventana nunca corre sin catalogo; este marco si: la
 * rejilla de tools/vista-previa.html lo sirve fuera de la extension, sin
 * chrome.i18n, y ahi «conectado» a secas seria un fallo que no es.
 */
function t(clave, subs, respaldo) {
  const texto = self.YTMPip.Textos ? self.YTMPip.Textos.t(clave, subs) : clave;
  return texto === clave ? respaldo : texto;
}

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
 * ---------- LA VISTA PREVIA VIVA (tanda AD) ----------
 *
 * Hasta la tanda AD esta vista enseñaba la ventana a sus dos tamaños y nada
 * mas: «los ajustes de esta pagina no cambian esta vista», decia su propia
 * ayuda. Ahora lee las preferencias GUARDADAS y se repinta cuando cambian,
 * con las mismas piezas que la ventana: el tema, el halo, el disco de
 * vinilo y el espectro (forma, color, cuantas barras y altura).
 *
 * El espectro se dibuja con shared/formas-espectro.js, el MISMO codigo que
 * la ventana; lo unico inventado es el sonido. Antes aqui habia unas
 * barras de mentira propias, y cada forma nueva habria sido una copia.
 *
 * Lo que NO enseña, dicho claro: el atenuado mientras suena, el latido de
 * la caratula (es un boton de la ventana, no una preferencia) y el video.
 */

// El color «de la fuente» de esta cancion de mentira: el de su portada,
// pasado por la misma normalizacion que un color muestreado de verdad.
function colorDeLaPortada() {
  const Y = self.YTMPip;
  if (!Y.ColorFuente || !Y.Paleta) return null;
  return Y.ColorFuente.normalizarLuz(Y.Paleta.rgbAHsl({ r: 0x7b, g: 0x3f, b: 0xe4 }));
}

function sistemaEnClaro() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
  } catch (err) {
    return false;
  }
}

function menosMovimiento() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (err) {
    return false;
  }
}

// Lo que ahora mismo dicen las preferencias; lo lee el dibujo en cada fotograma.
let preferencias = null;

/**
 * Pinta en la vista las preferencias `p`. Las mismas decisiones que la
 * ventana (applySettings), con la cancion de mentira como fuente de color.
 */
function aplicarPreferencias(p) {
  preferencias = p;
  const Y = self.YTMPip;
  const html = document.documentElement;
  const root = document.getElementById("ytmpip-root");
  if (!root) return;
  const fuente = colorDeLaPortada();

  // El tema.
  html.classList.toggle("ytmpip-theme-light", p.theme === "light" || (p.theme === "auto" && sistemaEnClaro()));
  const tinte = p.theme === "source" && Y.ColorFuente ? Y.ColorFuente.temaDeLaFuente(fuente) : null;
  if (tinte) {
    html.style.setProperty("--ytmpip-bg-rgb", tinte.fondo.join(", "));
    html.style.setProperty("--ytmpip-accent", "rgb(" + tinte.acento.join(", ") + ")");
  } else {
    html.style.removeProperty("--ytmpip-bg-rgb");
    html.style.removeProperty("--ytmpip-accent");
  }

  // El halo: se ve o no, y su color (el tema, uno propio o el de la portada).
  const halo = document.getElementById("ytmpip-halo");
  if (halo) {
    halo.hidden = p.haloPreference === "hidden";
    if (String(p.haloColor).charAt(0) === "#") halo.style.setProperty("--ytmpip-halo-color", p.haloColor);
    else if (p.haloColor === "source" && fuente) halo.style.setProperty("--ytmpip-halo-color", Y.Paleta.hslACss(fuente));
    else halo.style.removeProperty("--ytmpip-halo-color");
  }

  // El disco de vinilo, y «sonando»: la cancion de mentira siempre suena.
  root.classList.toggle("ytmpip-vinilo", p.coverStyle === "vinyl");
  root.classList.toggle("ytmpip-sonando", true);

  // El espectro: altura, color fijo y el lienzo a pantalla completa del anillo.
  // Los parametros de la URL mandan: son para mirar extremos en la rejilla.
  root.style.setProperty("--ytmpip-spectrum-height", (parametros.get("altoEspectro") || p.spectrumHeight) + "%");
  const propio = Y.Settings && Y.Settings.partirColor(p.spectrumColor).modo === "custom";
  root.style.setProperty(
    "--ytmpip-spectrum-color",
    parametros.get("colorEspectro") || (propio ? p.spectrumColor : "var(--ytmpip-accent)")
  );
  const lienzo = document.getElementById("ytmpip-spectrum");
  if (lienzo) lienzo.classList.toggle("ytmpip-espectro-anillo", p.spectrumStyle === "ring");
  if (conEspectro) pintarEspectroDeMentira(performance.now());
}

/*
 * Un sonido inventado: mucho grave, poco agudo, y que se mueve. Pura en el
 * tiempo: el mismo `ms` da siempre las mismas barras.
 */
function barrasDeMentira(n, ms) {
  return Array.from({ length: n }, (_, i) => {
    const forma = Math.pow(1 - i / n, 1.4) * (i % 5 === 2 ? 1.2 : 0.85);
    const vida = 0.55 + 0.45 * Math.abs(Math.sin(ms / 420 + i * 0.7));
    return Math.max(12, Math.min(255, Math.round(255 * forma * vida)));
  });
}

// El golpe del halo «latiendo»: un bombo de mentira, dos por segundo.
function golpeDeMentira(ms) {
  return Math.pow(Math.max(0, Math.sin((ms / 500) * Math.PI)), 8);
}

function pintarEspectroDeMentira(ms) {
  const Y = self.YTMPip;
  const lienzo = document.getElementById("ytmpip-spectrum");
  const p = preferencias;
  if (!lienzo || !p || !Y.FormasEspectro) return;
  const caja = lienzo.getBoundingClientRect();
  if (!caja.width || !caja.height) return;
  const escala = window.devicePixelRatio || 1;
  const ancho = Math.round(caja.width * escala);
  const alto = Math.round(caja.height * escala);
  if (lienzo.width !== ancho) lienzo.width = ancho;
  if (lienzo.height !== alto) lienzo.height = alto;
  const contexto = lienzo.getContext && lienzo.getContext("2d");
  if (!contexto) return;

  const Formas = Y.FormasEspectro;
  const barras = barrasDeMentira(Formas.barrasParaAncho(caja.width, p.spectrumBars), ms);
  contexto.clearRect(0, 0, ancho, alto);
  const colorDeBarra = Formas.colorDeBarraPara(p.spectrumColor, ms, barras.length);
  if (!colorDeBarra) {
    const fuente = p.spectrumColor === "source" ? colorDeLaPortada() : null;
    contexto.fillStyle =
      (fuente && Y.Paleta.hslACss(fuente)) ||
      getComputedStyle(document.getElementById("ytmpip-root")).getPropertyValue("--ytmpip-spectrum-color").trim() ||
      Y.CONSTANTS.SPECTRUM_LIMITS.COLOR_SUGGESTED;
  }

  // Donde esta la caratula, como lo mide la ventana (cajaDeLaCaratula).
  let caratula = null;
  const img = document.getElementById("ytmpip-artwork");
  if (p.spectrumStyle === "ring" && img) {
    const a = img.getBoundingClientRect();
    if (a.width > 0 && a.height > 0) {
      caratula = {
        cx: (a.left + a.width / 2 - caja.left) * escala,
        cy: (a.top + a.height / 2 - caja.top) * escala,
        lado: Math.max(a.width, a.height) * escala,
        redonda: document.getElementById("ytmpip-root").classList.contains("ytmpip-vinilo")
      };
    }
  }
  Formas.pintar(contexto, {
    barras,
    ancho,
    alto,
    escala,
    forma: p.spectrumStyle,
    caratula,
    banda: p.spectrumStyle === "ring" ? Math.round((alto * p.spectrumHeight) / 100) : alto,
    colorDeBarra
  });
}

/*
 * El bucle: espectro y halo latiendo, con un sonido de mentira. Con «menos
 * movimiento» se pinta un fotograma y ya.
 */
function animar(ms) {
  const p = preferencias;
  if (p) {
    if (conEspectro) pintarEspectroDeMentira(ms);
    const root = document.getElementById("ytmpip-root");
    const late = p.haloPreference !== "hidden" && p.haloMode === "pulse";
    root.style.setProperty("--ytmpip-halo-golpe", late ? golpeDeMentira(ms).toFixed(3) : "0");
  }
  if (!menosMovimiento()) requestAnimationFrame(animar);
}

fetch("../pip/pip.html")
  .then((r) => r.text())
  .then((html) => {
    document.body.innerHTML = html;
    // Lo primero, igual que en cacheElements: los emoji del HTML no
    // se llegan a ver ni un fotograma. Y los textos al idioma del
    // navegador, por la misma puerta que usa la ventana.
    self.YTMPip.Iconos.pintarTodos(document);
    if (self.YTMPip.Textos) self.YTMPip.Textos.aplicar(document);
    /*
     * INERTE, y a proposito (tanda W). Son unos treinta botones de verdad
     * que no hacen nada: quien navegaba Preferencias con el teclado entraba
     * en ellos uno por uno y el lector los anunciaba como botones. Con el
     * cuerpo inerte ni reciben foco ni salen en el arbol de accesibilidad;
     * el iframe conserva su title («Vista previa de la ventana flotante»),
     * que es todo lo que hay que decir de el. El iframe lleva ademas
     * tabindex="-1" en options.html para no ser una parada de tabulador.
     */
    document.body.inert = true;
    const root = document.getElementById("ytmpip-root");
    root.className = "";

    document.getElementById("ytmpip-status").textContent = t("conectado", undefined, "Conectado");
    /*
     * Una cancion INVENTADA (tanda W). Aqui habia titulo, artista, album y
     * cuatro versos de una cancion real, y este archivo viaja en el paquete
     * publicado: letra ajena distribuida sin permiso por un ejemplo. Los
     * versos de abajo se escribieron para esta vista previa.
     */
    document.getElementById("ytmpip-title").textContent = "Luz de madrugada";
    document.getElementById("ytmpip-artist").textContent = "Los Ejemplos";
    document.getElementById("ytmpip-album").textContent = "Maqueta";
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
      "Se enciende la ciudad cuando te vas",
      "y el reloj no sabe esperar",
      "canto bajito para no despertar",
      "a la luna que se quiere quedar"
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
      document.getElementById("ytmpip-lyrics-source").textContent = t("fuente", ["Better Lyrics"], "Fuente: Better Lyrics");
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

    if (conEspectro) document.getElementById("ytmpip-spectrum").hidden = false;

    aplicarDensidad(root);
    window.addEventListener("resize", () => aplicarDensidad(root));

    /*
     * Las preferencias GUARDADAS (tanda AD). Dentro de Preferencias el marco
     * es una pagina de la extension: Settings carga de storage y avisa de
     * cada cambio, asi que tocar una opcion la repinta aqui al momento.
     * Fuera de la extension (la rejilla de tools/) no hay storage y se
     * pintan los valores de serie.
     */
    const Settings = self.YTMPip.Settings;
    /*
     * Sin Settings.load() aqui, y a proposito: settings.js ya lo llama el
     * solo al cargarse. Aqui habia uno, y la mutacion lo delato como codigo
     * que no hace nada (quitarlo no tumbaba ninguna prueba): cuando se pinta
     * por primera vez, la carga de arranque ya termino y get() da lo
     * guardado; lo que llegue despues lo trae subscribe.
     */
    aplicarPreferencias(Settings.get());
    Settings.subscribe(aplicarPreferencias);
    requestAnimationFrame(animar);
  });
