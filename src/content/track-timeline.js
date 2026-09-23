/*
 * El tiempo de la PISTA ACTUAL, que no es el del <video>.
 *
 * Aqui esta el motivo real de "se junta el tiempo entre canciones", dicho
 * por quien lo sufria y con los numeros delante: la ventana marcaba
 * 5:12 / 6:54 mientras YouTube Music iba por 1:35 / 3:18, y la cancion
 * anterior duraba 3:36.
 *
 *   3:36 + 3:18 = 6:54     la duracion era la SUMA
 *   5:12 - 1:35 = 3:37     el tiempo llevaba sumada la pista anterior
 *
 * No se estaba leyendo el <video> equivocado: YouTube Music REUTILIZA el
 * mismo elemento y le va añadiendo las pistas a la misma linea de tiempo
 * (asi consigue el encadenado sin cortes). `currentTime` y `duration` son
 * acumulados de toda la cola. Su barra muestra 3:18 porque le resta el
 * desplazamiento de lo ya sonado.
 *
 * Cinco intentos anteriores dieron por bueno que el <video> sabia por
 * donde iba la cancion. Ninguno lo comprobo: se limitaron a discutir CUAL
 * de los <video> preguntar. El usuario lo dijo desde el primer mensaje,
 * literalmente — "se junta el tiempo entre canciones" — y yo lo lei como
 * "se congela".
 *
 * Lo que hace este modulo:
 *
 *   - La DURACION de la pista sale siempre de la interfaz de YouTube
 *     Music, que es la unica que la sabe.
 *   - El TIEMPO transcurrido se calcula como `currentTime - desplazamiento`
 *     para que avance suave. La pagina publica segundos enteros; leerla a
 *     pelo daria una barra a saltos de un segundo.
 *   - El desplazamiento se guarda y solo se recalcula cuando cambia de
 *     verdad (cambio de pista o salto del usuario). Si se recalculara en
 *     cada lectura, el redondeo de la pagina lo haria bailar y el contador
 *     temblaria.
 *
 * Y sirve para las dos direcciones: para saltar al minuto 2 de la cancion
 * hay que escribir `desplazamiento + 120` en el <video>, no 120.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  /*
   * Margen en segundos. La pagina trunca a segundos enteros, asi que el
   * desplazamiento calculado baila hasta 1 s; con 2 s se distingue ese
   * temblor de un cambio real sin dar falsos positivos.
   */
  const MARGEN = 2;

  let desplazamiento = 0;
  let hayDesplazamiento = false;

  function tiempoDelMedia() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media) return NaN;
    const t = Number(media.currentTime);
    return Number.isFinite(t) ? t : NaN;
  }

  function duracionDelMedia() {
    const media = YTMPip.Adapter.getMediaElement();
    if (!media) return 0;
    const d = Number(media.duration);
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  YTMPip.TrackTimeline = {
    /** `{ elapsed, duration }` en segundos, de la pista que suena. */
    read() {
      const pagina = YTMPip.Adapter.getPageTrackTime();
      const enElMedia = tiempoDelMedia();

      /*
       * Sin la interfaz de YouTube Music no hay forma de saber por donde
       * va la pista. Se contesta con el <video> a secas, que es lo que se
       * hacia antes: en una cola de una sola cancion es correcto, y en el
       * resto de casos al menos se mueve. Y se olvida el desplazamiento,
       * porque el que hubiera guardado ya no se corresponde con nada.
       */
      if (!pagina) {
        hayDesplazamiento = false;
        if (!Number.isFinite(enElMedia)) return { elapsed: 0, duration: 0 };
        return { elapsed: enElMedia, duration: duracionDelMedia() };
      }

      if (!Number.isFinite(enElMedia)) return { elapsed: pagina.elapsed, duration: pagina.duration };

      const candidato = enElMedia - pagina.elapsed;
      if (!hayDesplazamiento || Math.abs(candidato - desplazamiento) > MARGEN) {
        desplazamiento = candidato;
        hayDesplazamiento = true;
      }

      const elapsed = enElMedia - desplazamiento;
      // Si el calculo se sale de la pista, el desplazamiento guardado ya no
      // vale: manda la pagina, que nunca miente aunque vaya a saltos.
      if (elapsed < 0 || elapsed > pagina.duration + MARGEN) {
        return { elapsed: pagina.elapsed, duration: pagina.duration };
      }
      return { elapsed: Math.min(elapsed, pagina.duration), duration: pagina.duration };
    },

    /**
     * El `currentTime` que hay que escribir en el <video> para colocarse en
     * el segundo `segundosDePista` de la cancion actual. Ya viene acotado a
     * los limites de la pista: sin eso, un salto adelante de 10 s al final
     * de la cancion se metia en la SIGUIENTE, que esta en el mismo <video>.
     */
    toMediaTime(segundosDePista) {
      const { duration } = this.read();
      const base = hayDesplazamiento ? desplazamiento : 0;
      const pedido = Math.max(0, Number(segundosDePista) || 0);
      return base + (duration > 0 ? Math.min(pedido, duration) : pedido);
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
