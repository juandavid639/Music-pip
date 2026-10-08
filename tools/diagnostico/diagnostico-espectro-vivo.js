/*
 * DIAGNOSTICO: por que se congela el espectro al cambiar de cancion.
 *
 * DONDE SE PEGA: en la consola de la PESTAÑA de music.youtube.com, con la
 * ventana flotante abierta y el espectro ENCENDIDO. Pegar, Enter, dejar que
 * cambie la cancion, y copiar lo que salga.
 *
 * ---------------------------------------------------------------------
 * POR QUE LA PRIMERA VERSION DE ESTE ARCHIVO NO FUNCIONO
 *
 * Decia "[diag] No hay YTMPip.Espectro en esta pestaña. Recarga la pagina",
 * y recargar no arreglaba nada porque el problema no era ese. Los content
 * scripts de una extension corren en un MUNDO AISLADO: comparten el DOM con
 * la pagina pero no las variables. La consola evalua por defecto en el mundo
 * de la pagina, donde `YTMPip` no existe y no va a existir nunca.
 *
 * Asi que este script ya NO depende de las tripas de la extension. Mira el
 * canvas, que es DOM y se ve desde cualquier mundo, y compara su contenido
 * consigo mismo cada medio segundo. Con eso basta para separar los tres
 * estados que hay que separar:
 *
 *   - La imagen CAMBIA          -> el espectro esta vivo.
 *   - La imagen NO cambia y NO esta vacia -> CONGELADO. El bucle de dibujo
 *     esta muerto y se quedo el ultimo fotograma pintado. La causa esta en
 *     pip.js.
 *   - La imagen NO cambia y ESTA vacia    -> el bucle vive pero lo que lee
 *     es silencio; las barras cayeron a cero. La causa esta en la captura
 *     del audio.
 *
 * Si ademas se pega en el mundo de la extension (en el desplegable de arriba
 * de la consola, donde pone "top", eligiendo "YouTube Music PiP"), se
 * añaden los datos de dentro. Es opcional: sin ellos la pregunta principal
 * ya queda contestada.
 * ---------------------------------------------------------------------
 */
(() => {
  const ventanaPip = () => self.documentPictureInPicture && self.documentPictureInPicture.window;

  const w = ventanaPip();
  if (!w) {
    console.error("[diag] La ventana flotante no esta abierta, o esta pestaña no es la que la abrio.");
    return;
  }

  const canvas = w.document.getElementById("ytmpip-spectrum");
  if (!canvas) {
    console.error("[diag] No hay canvas del espectro en la ventana flotante.");
    return;
  }

  /*
   * Las tripas de la extension, SI se ve este mundo. No es obligatorio: todo
   * lo importante se deduce del canvas.
   */
  const Espectro = self.YTMPip && self.YTMPip.Espectro;
  console.log(
    Espectro
      ? "[diag] Se ven las tripas de la extension: habra datos extra."
      : "[diag] Mundo de la pagina (normal). Se mira solo el canvas, que es suficiente."
  );

  /*
   * La firma de lo que hay pintado. toDataURL es lento para un bucle de
   * animacion pero aqui se llama dos veces por segundo, y evita tener que
   * pedir el contexto 2d del canvas de otro mundo.
   */
  function firma() {
    try {
      return canvas.toDataURL();
    } catch (err) {
      return "ERROR:" + err.name;
    }
  }

  /* Un canvas del mismo tamaño y sin pintar: la firma del "todo apagado". */
  function firmaVacia() {
    const vacio = document.createElement("canvas");
    vacio.width = canvas.width;
    vacio.height = canvas.height;
    return vacio.toDataURL();
  }

  const video = document.querySelector("video");
  const titulo = () => {
    const el = document.querySelector("ytmusic-player-bar .title");
    return (el && el.textContent.trim()) || "?";
  };

  let anterior = firma();
  let iguales = 0;
  let cancion = titulo();
  let tic = 0;

  console.log("[diag] Mirando cada medio segundo. Deja que cambie la cancion y copia todo.");

  const timer = setInterval(() => {
    tic++;
    const ahora = firma();
    const cambio = ahora !== anterior;
    iguales = cambio ? 0 : iguales + 1;
    anterior = ahora;

    const t = titulo();
    if (t !== cancion) {
      console.warn(`[diag] ===== CAMBIO DE CANCION: "${cancion}" -> "${t}" =====`);
      cancion = t;
    }

    // Solo se informa cada 2 muestras (1 s) para no llenar la consola.
    if (tic % 2) return;

    const vacio = ahora === firmaVacia();
    let veredicto;
    if (cambio) veredicto = "VIVO (la imagen cambia)";
    else if (vacio) veredicto = `PLANO: barras a cero desde hace ${(iguales / 2).toFixed(1)}s -> mirar la CAPTURA DE AUDIO`;
    else veredicto = `CONGELADO desde hace ${(iguales / 2).toFixed(1)}s -> mirar el BUCLE DE DIBUJO en pip.js`;

    const extra = Espectro ? ` | conectado=${Espectro.conectado()}` : "";
    console.log(
      `[diag ${tic / 2}s] ${veredicto} | canvas ${canvas.width}x${canvas.height} oculto=${canvas.hidden}` +
        ` | video ${video && !video.paused ? "sonando" : "pausado"} t=${video ? video.currentTime.toFixed(1) : "?"}${extra}`
    );
  }, 500);

  /*
   * Un error dentro del callback de requestAnimationFrame corta la cadena
   * para siempre y no lo ve nadie. Es la forma mas facil de que el bucle
   * muera dejando el ultimo fotograma pintado, asi que se escucha aparte.
   */
  w.addEventListener("error", (e) => {
    console.error("[diag] ERROR EN LA VENTANA FLOTANTE:", e.message, e.filename + ":" + e.lineno);
  });
  w.addEventListener("unhandledrejection", (e) => {
    console.error("[diag] PROMESA RECHAZADA EN LA VENTANA FLOTANTE:", e.reason);
  });

  self.__pararDiagEspectro = () => {
    clearInterval(timer);
    console.log("[diag] Parado.");
  };
  console.log("[diag] Para pararlo: __pararDiagEspectro()");
})();
