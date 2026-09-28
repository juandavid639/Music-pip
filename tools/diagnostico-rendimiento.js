/*
 * DIAGNOSTICO: cuanto trabaja la extension en una pestaña, con la ventana
 * flotante cerrada y abierta.
 *
 * DE DONDE SALE. La auditoria del 2026-09-28 dejo apuntado, sin medir, que
 * en cada pestaña soportada el observador de la pagina y buildState corren
 * hasta ~6 veces por segundo AUNQUE LA VENTANA ESTE CERRADA, y que con
 * Better Lyrics cada buildState clona las ~60 lineas de la letra. Antes de
 * tocar el bucle principal —que ya se ha roto otras veces— hay que saber
 * si eso cuesta algo de verdad. Este guion lo mide; no arregla nada.
 *
 * DONDE SE PEGA: en la consola (F12) de la pestaña de musica, pero en el
 * MUNDO DE LA EXTENSION, no en el de la pagina. Arriba a la izquierda de
 * la consola hay un desplegable que pone «top»: se abre y se elige
 * «Music PiP». Sin ese paso el guion lo dice y no hace nada (los content
 * scripts viven en un mundo aislado; ver diagnostico-espectro-vivo.js).
 *
 * QUE HACE, durante 30 segundos (o los que se pasen: medirRendimiento(60)):
 *   - Envuelve las funciones REALES del bucle y cuenta llamadas y tiempo:
 *     MetadataReader.read, LyricsReader.read, PipView.onStateUpdate,
 *     PipView.ensureLauncher. buildState no se puede envolver (vive dentro
 *     de un cierre), pero cada buildState llama DOS veces a
 *     MetadataReader.read y una a LyricsReader.read, y nadie mas los llama:
 *     las llamadas a LyricsReader.read SON los buildState.
 *   - Cuenta los mensajes al service worker (STATE_UPDATE y demas) y las
 *     lecturas de chrome.storage.local.get (esta ultima comprueba en
 *     produccion la tanda S: con musica sonando deberian ser ~0 por segundo).
 *   - Pone un MutationObserver GEMELO del de la extension (mismas opciones)
 *     para contar lotes y registros por segundo: es la carga que recibe el
 *     de verdad.
 *   - Cuenta las tareas largas (>50 ms) del hilo principal, de quien sean.
 * Al terminar DEVUELVE TODO A SU SITIO, imprime una tabla y deja en el
 * portapapeles (si la consola lo permite) un JSON para pegarlo en el chat.
 *
 * LAS CUATRO PASADAS QUE HACEN FALTA (una por pegado, 30 s cada una):
 *   A. music.youtube.com, cancion sonando, ventana flotante CERRADA.
 *   B. Lo mismo con la ventana ABIERTA.
 *   C. Con Better Lyrics activo y su letra a la vista (si se usa).
 *   D. www.youtube.com en la portada, sin reproducir nada, ventana cerrada
 *      (la pestaña «de paso» que la auditoria señalaba).
 *
 * No toca la musica ni las preferencias. Si se cierra la pestaña a mitad,
 * no queda nada colgado: los envoltorios viven en esa pestaña y mueren con
 * ella.
 */
(function () {
  function medirRendimiento(segundos = 30) {
    const Y = self.YTMPip;
    if (!Y || !Y.MetadataReader || !Y.LyricsReader) {
      console.error(
        "[rendimiento] No veo la extension desde aqui. Elige «Music PiP» en el desplegable «top» de la consola y vuelve a pegar."
      );
      return;
    }
    if (Y.__midiendoRendimiento) {
      console.warn("[rendimiento] Ya hay una medicion en marcha en esta pestaña.");
      return;
    }
    Y.__midiendoRendimiento = true;

    const ahora = () => performance.now();
    const contadores = {};
    const restaurar = [];

    function envolver(nombre, objeto, metodo) {
      if (!objeto || typeof objeto[metodo] !== "function") return;
      const original = objeto[metodo];
      const c = (contadores[nombre] = { llamadas: 0, ms: 0, tiempos: [] });
      objeto[metodo] = function (...args) {
        const t0 = ahora();
        try {
          return original.apply(this, args);
        } finally {
          const dt = ahora() - t0;
          c.llamadas++;
          c.ms += dt;
          c.tiempos.push(dt);
        }
      };
      restaurar.push(() => (objeto[metodo] = original));
    }

    envolver("MetadataReader.read", Y.MetadataReader, "read");
    envolver("LyricsReader.read", Y.LyricsReader, "read");
    envolver("PipView.onStateUpdate", Y.PipView, "onStateUpdate");
    envolver("PipView.ensureLauncher", Y.PipView, "ensureLauncher");
    envolver("storage.local.get", chrome.storage && chrome.storage.local, "get");

    // Los mensajes, por tipo: sendMessage no es sincrono, se cuenta sin tiempo.
    const mensajes = {};
    if (chrome.runtime && typeof chrome.runtime.sendMessage === "function") {
      const enviar = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = function (mensaje, ...resto) {
        const tipo = (mensaje && mensaje.type) || "?";
        mensajes[tipo] = (mensajes[tipo] || 0) + 1;
        return enviar.call(this, mensaje, ...resto);
      };
      restaurar.push(() => (chrome.runtime.sendMessage = enviar));
    }

    // El gemelo del observador de content-script.js (mismas opciones).
    let lotes = 0;
    let registros = 0;
    let msGemelo = 0;
    const gemelo = new MutationObserver((lista) => {
      const t0 = ahora();
      lotes++;
      registros += lista.length;
      msGemelo += ahora() - t0;
    });
    gemelo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "aria-label", "class"]
    });
    restaurar.push(() => gemelo.disconnect());

    // Tareas largas del hilo principal, de quien sean.
    const largas = { n: 0, ms: 0 };
    try {
      const po = new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          largas.n++;
          largas.ms += e.duration;
        }
      });
      po.observe({ entryTypes: ["longtask"] });
      restaurar.push(() => po.disconnect());
    } catch (e) {
      largas.n = null;
    }

    const ventana = () => Boolean(self.documentPictureInPicture && self.documentPictureInPicture.window);
    const video = Y.Adapter && Y.Adapter.getMediaElement && Y.Adapter.getMediaElement();
    const contexto = {
      sitio: location.hostname,
      ruta: location.pathname,
      ventanaAbiertaAlEmpezar: ventana(),
      sonando: Boolean(video && !video.paused),
      betterLyrics: Boolean(document.querySelector(".blyrics-container, [class*='blyrics']")),
      segundos
    };
    console.info("[rendimiento] Midiendo " + segundos + " s…", contexto);

    const inicio = ahora();
    setTimeout(() => {
      restaurar.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
      delete Y.__midiendoRendimiento;
      const dur = (ahora() - inicio) / 1000;

      const pct = (lista, p) => {
        if (!lista.length) return 0;
        const o = [...lista].sort((a, b) => a - b);
        return o[Math.min(o.length - 1, Math.floor(p * o.length))];
      };
      const r = (x) => Math.round(x * 100) / 100;

      const filas = {};
      for (const [nombre, c] of Object.entries(contadores)) {
        filas[nombre] = {
          "llamadas/s": r(c.llamadas / dur),
          "ms/s": r(c.ms / dur),
          "p50 ms": r(pct(c.tiempos, 0.5)),
          "p95 ms": r(pct(c.tiempos, 0.95)),
          "max ms": r(c.tiempos.length ? Math.max(...c.tiempos) : 0)
        };
      }
      filas["(observador gemelo)"] = {
        "llamadas/s": r(lotes / dur),
        "ms/s": r(msGemelo / dur),
        "p50 ms": "",
        "p95 ms": "",
        "max ms": ""
      };

      // buildState es el UNICO que llama a los lectores (comprobado con grep
      // el 2026-09-28), y a LyricsReader.read exactamente una vez.
      const lecturasLetra = contadores["LyricsReader.read"] ? contadores["LyricsReader.read"].llamadas : 0;
      const resumen = Object.assign({}, contexto, {
        ventanaAbiertaAlAcabar: ventana(),
        duracion: r(dur),
        buildStatePorSegundo: r(lecturasLetra / dur),
        // Lo sincrono de la extension que se ha podido envolver. storage.get
        // queda fuera: es asincrono y su tiempo aqui es solo el de pedirlo.
        msDeLaExtensionPorSegundo: r(
          Object.entries(contadores)
            .filter(([n]) => n !== "storage.local.get")
            .reduce((suma, [, c]) => suma + c.ms, 0) / dur
        ),
        registrosDeMutacionPorSegundo: r(registros / dur),
        mensajesPorSegundo: Object.fromEntries(Object.entries(mensajes).map(([k, v]) => [k, r(v / dur)])),
        tareasLargas: largas.n === null ? "no disponible" : { n: largas.n, msTotal: r(largas.ms) },
        funciones: filas
      });

      console.table(filas);
      console.info("[rendimiento] Resumen:", resumen);
      const json = JSON.stringify(resumen);
      try {
        if (typeof copy === "function") {
          copy(json);
          console.info("[rendimiento] El JSON esta en el portapapeles: pegalo en el chat.");
        } else {
          console.info("[rendimiento] Copia esta linea y pegala en el chat:\n" + json);
        }
      } catch (e) {
        console.info("[rendimiento] Copia esta linea y pegala en el chat:\n" + json);
      }
    }, segundos * 1000);
  }

  self.medirRendimiento = medirRendimiento;
  medirRendimiento();
})();
