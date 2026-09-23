(function () {
  const { MESSAGE_TYPES, COMMAND_TYPES, createCommand, createMessage } = self.YTMPip;

  /*
   * Los textos en el idioma del navegador, con el mismo atajo de respaldo
   * que pip.js y options.js: sin textos.js, la clave pelada —un fallo que
   * se ve— antes que un menu mudo.
   */
  const t = (clave, subs) => (self.YTMPip.Textos ? self.YTMPip.Textos.t(clave, subs) : clave);

  const els = {
    status: document.getElementById("ytmpip-popup-status"),
    dot: document.getElementById("ytmpip-popup-dot"),
    backdrop: document.getElementById("ytmpip-popup-backdrop"),
    artwork: document.getElementById("ytmpip-popup-artwork"),
    title: document.getElementById("ytmpip-popup-title"),
    artist: document.getElementById("ytmpip-popup-artist"),
    playPause: document.getElementById("ytmpip-popup-play-pause"),
    next: document.getElementById("ytmpip-popup-next"),
    previous: document.getElementById("ytmpip-popup-previous"),
    openPip: document.getElementById("ytmpip-popup-open-pip")
  };

  /*
   * La portada de reserva, la MISMA que usa la ventana flotante.
   *
   * Aqui antes se hacia `els.artwork.src = state.artworkUrl || ""`, y esa
   * cadena vacia no significa "sin imagen": un src vacio se resuelve contra
   * la URL de la propia pagina, asi que el navegador se pedia popup.html a
   * si mismo como si fuera un PNG y pintaba el icono de imagen rota. Fallo
   * mudo de los de siempre —ni un error en consola— y solo se ve cuando el
   * menu se abre sin cancion, que es justo la primera vez que se abre.
   *
   * `chrome.runtime.getURL` y no una ruta relativa a mano: el menu es una
   * pagina de la extension y la ruta le funcionaria, pero entonces habria
   * dos formas de nombrar el mismo archivo segun quien lo pida. Esta es la
   * que ya usa pip.js.
   */
  function urlDeReserva() {
    try {
      return chrome.runtime.getURL("assets/placeholders/artwork.svg");
    } catch (e) {
      // Contexto invalidado (extension recargada con el menu abierto). Sin
      // portada, pero sin reventar el render entero por una imagen.
      return "";
    }
  }

  // Los dibujos que vienen escritos en popup.html. Se pintan ya, sin
  // esperar al primer estado: el menu se abre y se ve, aunque todavia no
  // haya respuesta de la pestaña.
  self.YTMPip.Iconos.pintarTodos(document);

  // Y los textos escritos en popup.html, con el mismo criterio: se
  // reescriben en su idioma antes del primer estado. Una clave que no
  // resuelve deja el español del HTML, que es el plan B a proposito.
  if (self.YTMPip.Textos) self.YTMPip.Textos.aplicar(document);

  /*
   * Y la portada de reserva TAMBIEN antes del primer estado, por lo mismo.
   * El <img> nace sin `src` y hasta que contesta la pestaña se ve el icono
   * de imagen rota. Es un parpadeo corto, pero es el primer fotograma del
   * menu cada vez que se abre.
   */
  els.artwork.src = urlDeReserva();

  let lastPlaying = false;

  function render(state) {
    if (!state) return;
    /*
     * EL SITIO DE VERDAD, no "YouTube Music" fijo: state.siteName viaja
     * desde el lector con el nombre que el adaptador declaro al
     * registrarse ("Spotify", "YouTube Music", "YouTube"). Antes esta
     * linea decia "Conectado a YouTube Music" tambien en una pestaña de
     * Spotify, que era mentira a primera vista.
     *
     * Sin nombre (un estado de escenario viejo, un registro sin exponer)
     * se cae a "Conectado" a secas: generico antes que inventado, la
     * misma politica que repetir/aleatorio en el lector.
     */
    els.status.textContent = state.connected
      ? state.siteName
        ? t("conectado_a_sitio", [state.siteName])
        : t("conectado")
      : t("musica_no_encontrada");
    /*
     * El punto dice lo MISMO que la frase de al lado, y sale de la MISMA
     * pregunta. Estuvo la tentacion de darle un tercer estado ("buscando"),
     * y no lo tiene: `render` solo se llama con una respuesta ya recibida,
     * asi que ese estado no existe aqui. Inventarlo seria un punto naranja
     * que no se enciende nunca.
     */
    if (els.dot) els.dot.classList.toggle("ytmpip-conectado", Boolean(state.connected));
    els.title.textContent = state.title || t("sin_reproduccion");
    els.artist.textContent = state.artist || "";
    els.artwork.src = state.artworkUrl || urlDeReserva();

    /*
     * El fondo se apaga con la CLASE y no bajando la opacidad a mano, por lo
     * mismo que en la ventana flotante: cuanto se ve la portada difuminada es
     * una decision de aspecto y vive en la hoja. Aqui solo se dice si hay
     * portada o no.
     *
     * Y se pone la portada DE VERDAD, no la de reserva: difuminar el dibujo
     * gris de "sin portada" da un fondo gris difuminado, o sea nada, con el
     * coste de un blur a pantalla completa.
     */
    if (els.backdrop) {
      els.backdrop.style.backgroundImage = state.artworkUrl ? `url("${state.artworkUrl}")` : "";
      els.backdrop.classList.toggle("ytmpip-has-art", Boolean(state.artworkUrl));
    }

    lastPlaying = !!state.playing;
    self.YTMPip.Iconos.poner(els.playPause, lastPlaying ? "pausar" : "reproducir");
    els.playPause.setAttribute("aria-label", lastPlaying ? t("pausar") : t("reproducir"));

    /*
     * Los mandos tampoco sirven de nada sin pestaña, y estaban quedandose
     * encendidos: solo se apagaba el de abrir la ventana. Tres botones que
     * responden a un clic sin hacer nada es peor que tres botones apagados,
     * porque el usuario no sabe si ha fallado el, la extension o la cancion.
     */
    const sinPestana = !state.connected;
    els.openPip.disabled = sinPestana;
    els.playPause.disabled = sinPestana;
    els.next.disabled = sinPestana;
    els.previous.disabled = sinPestana;
  }

  function refreshState() {
    chrome.runtime
      .sendMessage(createMessage(MESSAGE_TYPES.REQUEST_CURRENT_STATE))
      .then((response) => render(response && response.state))
      .catch(() => render({ connected: false }));
  }

  /*
   * El fallo de un comando NO se traga en silencio. Aqui habia un
   * `.catch(() => {})`: el usuario pulsaba, no pasaba nada y no quedaba
   * ni rastro en la consola para saber si fallo el, la extension o la
   * pestaña. La reaccion es la MISMA que la de `refreshState` cuando no
   * contesta nadie: pintar el menu como desconectado, que apaga los
   * botones y pone la frase honesta en el estado. Y un warn, porque el
   * menu tiene su propia consola y un fallo aqui es raro de verdad
   * (el service worker no contesto), no una condicion normal.
   */
  function sendCommand(type, extra) {
    chrome.runtime
      .sendMessage(createMessage(MESSAGE_TYPES.COMMAND, { command: createCommand(type, extra) }))
      .then(() => setTimeout(refreshState, 200))
      .catch((err) => {
        console.warn("[YTMPip] El comando no llego al service worker", type, err);
        render({ connected: false });
      });
  }

  els.playPause.addEventListener("click", () => sendCommand(lastPlaying ? COMMAND_TYPES.PAUSE : COMMAND_TYPES.PLAY));
  els.next.addEventListener("click", () => sendCommand(COMMAND_TYPES.NEXT_TRACK));
  els.previous.addEventListener("click", () => sendCommand(COMMAND_TYPES.PREVIOUS_TRACK));

  /*
   * Banco de pruebas del menu, con el mismo criterio que el de pip.js.
   *
   * Este archivo pinta un estado y no devuelve nada: la unica forma de
   * mirarle algo desde fuera seria mandarle un comando y esperar a que
   * `sendCommand` vuelva a pedir el estado 200 ms despues. Eso convierte
   * cada prueba en una espera con un numero inventado dentro, y las pruebas
   * que dependen de un temporizador fallan solas cada tantas ejecuciones.
   *
   * SE EXPONE `render` Y NADA MAS. No es una puerta trasera para tocar el
   * menu por dentro: es la funcion que ya se llama sola al recibir un
   * estado, llamada con un estado escrito a mano. Lo que se prueba por aqui
   * es exactamente lo que pasa cuando contesta la pestaña.
   */
  self.YTMPip.__menuDePruebas = { render: render };

  els.openPip.addEventListener("click", () => {
    // Mismo criterio que sendCommand: si la peticion de abrir la ventana
    // no llega, el menu lo dice en vez de quedarse callado.
    chrome.runtime.sendMessage(createMessage(MESSAGE_TYPES.OPEN_PIP_REQUEST)).catch((err) => {
      console.warn("[YTMPip] La peticion de abrir la ventana no llego", err);
      render({ connected: false });
    });
  });

  refreshState();
})();
