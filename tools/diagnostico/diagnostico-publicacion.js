/*
 * LA COMPROBACION ANTES DE PUBLICAR (tanda AL).
 *
 * La suite corre contra fixtures; la tienda la usa gente contra el sitio de
 * hoy. Este guion es la lista de comprobacion que faltaba entre las dos:
 * pegado en cada uno de los tres sitios con la version NUEVA cargada, dice
 * en veinte segundos si el adaptador sigue encontrando lo que necesita, si
 * el estado sale entero y si la ventana tiene por donde abrirse.
 *
 * COMO SE USA (en cada sitio: YouTube Music, YouTube y Spotify)
 *   1. Cargar la extension desempaquetada con la version a publicar y
 *      recargar la pestaña (F5). Poner una cancion a sonar.
 *   2. DevTools > Consola > desplegable de contexto (donde pone «top»):
 *      elegir «Music PiP».
 *   3. Pegar este archivo y pulsar Intro. Sale una tabla y un veredicto;
 *      el resumen queda en el portapapeles para pegarlo en las notas de la
 *      version.
 *
 * Lo que NO hace: pulsar nada. Solo lee. Abrir la ventana sigue siendo un
 * clic tuyo en el boton PiP (Chrome exige el gesto), y es el ultimo paso
 * de la receta de la ficha (tienda/ficha.md, seccion 10).
 */
(function () {
  if (typeof YTMPip === "undefined" || !YTMPip.Adapter) {
    console.error(
      "[publicacion] No veo la extension. Elige «Music PiP» en el desplegable de contexto de la consola " +
        "(arriba a la izquierda, donde pone «top») y vuelve a pegar el guion."
    );
    return;
  }
  const A = YTMPip.Adapter;
  const filas = [];
  const fila = (que, ok, detalle) => filas.push({ que, resultado: ok === null ? "—" : ok ? "OK" : "FALLA", detalle: detalle || "" });

  const registro = YTMPip.Adaptadores && YTMPip.Adaptadores.activo ? YTMPip.Adaptadores.activo() : null;
  fila("adaptador activo", Boolean(registro), registro ? registro.nombre + " (schemaVersion " + A.schemaVersion + ")" : "ninguno");

  // 1. Cada lista de selectores: cual casa. Un indice > 0 funciona, pero es
  //    el aviso temprano de que el principal ya no esta.
  const SEL = A.SELECTORS || {};
  for (const clave of Object.keys(SEL)) {
    const lista = [].concat(SEL[clave]).filter((s) => typeof s === "string");
    if (!lista.length) continue;
    let indice = -1;
    for (let i = 0; i < lista.length; i++) {
      try {
        if (document.querySelector(lista[i])) {
          indice = i;
          break;
        }
      } catch (err) {
        fila("selector " + clave, false, "no es un selector valido: " + lista[i]);
        indice = -2;
        break;
      }
    }
    if (indice === -2) continue;
    fila(
      "selector " + clave,
      indice === -1 ? null : indice === 0,
      indice === -1 ? "no casa ninguno (puede ser normal: letra cerrada, sin cola...)" : indice === 0 ? lista[0] : "casa el respaldo n." + indice + ": " + lista[indice]
    );
  }

  // 2. La salud que tambien mira la ventana (tanda AK).
  if (YTMPip.Adaptadores && typeof YTMPip.Adaptadores.salud === "function") {
    const s = YTMPip.Adaptadores.salud();
    if (!s.comprobable) fila("piezas vitales", null, "no suena nada: pon una cancion y repite");
    else fila("piezas vitales", s.faltan.length === 0, s.faltan.length ? "faltan: " + s.faltan.join(", ") : "todas");
  }

  // 3. El estado que viaja a la ventana, leido como lo lee el latido.
  try {
    const e = YTMPip.MetadataReader.read();
    fila("estado: titulo", Boolean(e.title), e.title || "(vacio)");
    fila("estado: artista", Boolean(e.artist), e.artist || "(vacio)");
    fila("estado: duracion", e.duration > 0, e.duration > 0 ? Math.round(e.duration) + " s" : String(e.duration));
    fila("estado: suena", e.playing === true ? true : null, String(e.playing));
    fila("estado: caratula", Boolean(e.artworkUrl), e.artworkUrl ? "si" : "sin url");
  } catch (err) {
    fila("estado", false, "MetadataReader.read() lanza: " + err.message);
  }
  try {
    const l = YTMPip.LyricsReader.read();
    fila("letra", null, l.status + (l.source ? " (" + l.source + ")" : ""));
  } catch (err) {
    fila("letra", false, "LyricsReader.read() lanza: " + err.message);
  }

  // 4. La ventana: la vista cargada, el boton en la pagina y la API.
  fila("vista flotante cargada", Boolean(YTMPip.PipView), YTMPip.PipView ? "" : "pip.js no se cargo");
  fila("boton PiP en la pagina", Boolean(document.getElementById("ytmpip-launcher")), "");
  fila("Document Picture-in-Picture", "documentPictureInPicture" in window, "sin ella se abre la ventana de respaldo");
  fila("contexto de la extension", YTMPip.isContextValid ? YTMPip.isContextValid() : null, "falso = pestaña huerfana: recargala");

  console.table(filas);
  const fallos = filas.filter((f) => f.resultado === "FALLA");
  const version = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "?";
  const veredicto = fallos.length ? fallos.length + " FALLO(S): no publicar sin mirarlo." : "Todo en orden en " + location.hostname + ".";
  console.log("%c[publicacion] " + veredicto, "font-weight:bold;color:" + (fallos.length ? "#f15a5a" : "#4caf50"));
  const resumen =
    "Music PiP " + version + " en " + location.hostname + " (" + new Date().toISOString().slice(0, 10) + "): " + veredicto +
    (fallos.length ? "\n" + fallos.map((f) => "- " + f.que + ": " + f.detalle).join("\n") : "");
  try {
    copy(resumen);
  } catch (err) {
    // Fuera de DevTools no hay copy(); el veredicto ya esta en la consola.
  }
})();
