/*
 * DIAGNOSTICO 2: ¿el bucle de dibujo esta muerto, o esta vivo pintando ceros?
 *
 * DONDE SE PEGA: en la consola de la PESTAÑA de music.youtube.com (el mundo
 * normal, el de siempre), con la ventana flotante abierta y el espectro
 * ENCENDIDO. Pegar, Enter, y cambiar de cancion CON EL BOTON DE SIGUIENTE,
 * que es el caso que falla.
 *
 * ---------------------------------------------------------------------
 * POR QUE HACE FALTA UN SEGUNDO DIAGNOSTICO
 *
 * El primero (diagnostico-espectro-vivo.js) separaba "congelado" de "plano"
 * mirando si el canvas estaba VACIO, y eso esta mal. Culpa mia: pip.js pinta
 * cada barra con `Math.max(1, ...)`, o sea que con las barras a cero sigue
 * pintando una raya de un pixel en el fondo. El canvas NO queda vacio, asi
 * que un bucle VIVO leyendo silencio se informaba como "CONGELADO", que es
 * justo la causa contraria. Las dos posibilidades daban la misma respuesta,
 * y una respuesta que no distingue no es una respuesta.
 *
 * POR QUE NO SE PARCHEAN LOS PROTOTIPOS
 *
 * La idea obvia era contar las llamadas a `getContext` parcheando
 * `HTMLCanvasElement.prototype`. No funciona, y por la MISMA razon que tumbo
 * al primer diagnostico: los mundos aislados tienen sus propios prototipos y
 * sus propios envoltorios de los nodos. Un parche puesto desde el mundo de la
 * pagina no lo ve el content script, asi que el contador se quedaria a cero
 * pasara lo que pasara y "confirmaria" que el bucle esta muerto aunque
 * estuviera corriendo a sesenta fotogramas por segundo.
 *
 * LO QUE SI CRUZA: EL ESTADO DEL DOM
 *
 * Los prototipos son de cada mundo, pero el nodo es UNO SOLO. `canvas.width`
 * es estado del elemento, no del envoltorio, asi que si se cambia desde aqui
 * lo ve el otro mundo. De ahi la sonda:
 *
 *   1. Se pone `canvas.width` a un valor absurdo.
 *   2. Se espera 150 ms.
 *   3. Si volvio a su valor -> pip.js lo reescribio -> EL BUCLE ESTA VIVO.
 *      Si sigue absurdo -> nadie lo toco -> EL BUCLE ESTA MUERTO.
 *
 * No hay interpretacion posible y no hace falta cambiar de mundo en la
 * consola. Efecto secundario: tocar `width` borra el canvas, asi que si el
 * bucle vive se vera un parpadeo por segundo. Es a proposito y se acaba al
 * pararlo.
 *
 * Y para la otra mitad de la pregunta —si lo que se lee es silencio— se mide
 * la ALTURA de lo pintado copiando el canvas a uno propio. Un pixel de alto
 * es silencio; barras altas y quietas es un bucle muerto.
 *
 * Ademas apunta la identidad del <video> y su `currentSrc` en cada cambio de
 * cancion, que es el dato que decide COMO arreglarlo: no es lo mismo que
 * YouTube Music cambie de elemento a que reutilice el mismo con otra fuente.
 * ---------------------------------------------------------------------
 */
(() => {
  const w = self.documentPictureInPicture && self.documentPictureInPicture.window;
  if (!w) {
    console.error("[diag2] La ventana flotante no esta abierta, o esta pestaña no es la que la abrio.");
    return;
  }

  const canvas = w.document.getElementById("ytmpip-spectrum");
  if (!canvas) {
    console.error("[diag2] No hay canvas del espectro en la ventana flotante.");
    return;
  }
  if (canvas.hidden) {
    console.warn("[diag2] OJO: el espectro esta apagado. Enciendelo con el boton de la onda y vuelve a pegar esto.");
  }

  const ANCHO_ABSURDO = 3;

  /*
   * La altura de lo pintado, en pixeles del canvas. Se copia a un canvas
   * propio porque el contexto 2d del suyo pertenece al otro mundo; dibujar
   * un canvas ajeno si esta permitido, y con el mismo origen no lo mancha.
   */
  function alturaPintada() {
    try {
      const copia = document.createElement("canvas");
      copia.width = canvas.width;
      copia.height = canvas.height;
      if (!copia.width || !copia.height) return -1;
      const ctx = copia.getContext("2d");
      ctx.drawImage(canvas, 0, 0);
      const datos = ctx.getImageData(0, 0, copia.width, copia.height).data;
      for (let y = 0; y < copia.height; y++) {
        for (let x = 0; x < copia.width; x++) {
          // El canal alfa: lo que no se pinto se queda transparente.
          if (datos[(y * copia.width + x) * 4 + 3] > 0) return copia.height - y;
        }
      }
      return 0;
    } catch (err) {
      return -1;
    }
  }

  let contadorVideos = 0;
  function sello(video) {
    if (!video) return "sin video";
    // Una marca propia sobre el elemento: si tras el cambio sale el mismo
    // numero, YouTube Music REUTILIZO el elemento en vez de crear otro.
    if (!video.__diagSello) video.__diagSello = "video#" + ++contadorVideos;
    return video.__diagSello;
  }
  const elVideo = () => document.querySelector("video");
  const fuente = (video) => {
    const s = (video && (video.currentSrc || video.src)) || "";
    return s ? s.slice(0, 55) : "(vacia)";
  };
  const titulo = () => {
    const el = document.querySelector("ytmusic-player-bar .title");
    return (el && el.textContent.trim()) || "?";
  };

  let cancion = titulo();
  let selloAnterior = sello(elVideo());
  let fuenteAnterior = fuente(elVideo());
  let tic = 0;

  console.log(`[diag2] Arranque: ${selloAnterior} fuente=${fuenteAnterior}`);
  console.log("[diag2] Mirando. CAMBIA DE CANCION CON EL BOTON DE SIGUIENTE y copia todo.");
  console.log("[diag2] Para pararlo: __pararDiag2()");

  const timer = setInterval(() => {
    tic++;
    const video = elVideo();
    const s = sello(video);
    const f = fuente(video);
    const t = titulo();

    if (t !== cancion || s !== selloAnterior || f !== fuenteAnterior) {
      console.warn(
        `[diag2] ===== CAMBIO: "${cancion}" -> "${t}" | elemento ${selloAnterior} -> ${s} ` +
          `(${s === selloAnterior ? "EL MISMO, solo cambio la fuente" : "OTRO elemento"}) =====`
      );
      console.warn(`[diag2]        fuente nueva: ${f}`);
      cancion = t;
      selloAnterior = s;
      fuenteAnterior = f;
    }

    // Se mide ANTES de la sonda, porque la sonda borra el canvas.
    const alto = alturaPintada();
    const anchoReal = canvas.width;
    canvas.width = ANCHO_ABSURDO;

    setTimeout(() => {
      const revivio = canvas.width !== ANCHO_ABSURDO;
      if (!revivio) canvas.width = anchoReal; // no dejarlo roto si nadie lo toca

      let veredicto;
      if (!revivio) {
        veredicto = "BUCLE MUERTO (nadie reescribio el canvas) -> la causa esta en pip.js";
      } else if (alto >= 0 && alto <= 2) {
        veredicto =
          `BUCLE VIVO PERO MUDO (barra mas alta ${alto} px) -> la causa esta en la CAPTURA DE AUDIO`;
      } else {
        veredicto = `VIVO (barra mas alta ${alto} px)`;
      }

      console.log(
        `[diag2 ${tic}s] ${veredicto} | canvas ${anchoReal}x${canvas.height} oculto=${canvas.hidden}` +
          ` | video ${video && !video.paused ? "sonando" : "pausado"}` +
          ` t=${video ? video.currentTime.toFixed(1) : "?"}`
      );
    }, 150);
  }, 1000);

  w.addEventListener("error", (e) => {
    console.error("[diag2] ERROR EN LA VENTANA FLOTANTE:", e.message, e.filename + ":" + e.lineno);
  });

  self.__pararDiag2 = () => {
    clearInterval(timer);
    console.log("[diag2] Parado.");
  };
})();
