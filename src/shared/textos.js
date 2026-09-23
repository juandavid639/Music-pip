/*
 * Los textos que ve el usuario, en su idioma.
 *
 * Este módulo es la ÚNICA puerta hacia chrome.i18n. Los catálogos viven en
 * _locales/<idioma>/messages.json (español como idioma por defecto, inglés
 * como traducción) y el navegador elige solo: no hay selector propio porque
 * Chrome ya tiene uno y duplicarlo sería mantener dos respuestas a la misma
 * pregunta.
 *
 * DOS FORMAS DE USARLO, para dos clases de texto:
 *
 *   t(clave, sustituciones)  — para los textos que escribe JavaScript en
 *     caliente (etiquetas que cambian con el estado: «Pausar»/«Reproducir»,
 *     «Temporizador de apagado: …»). Devuelve el texto en el idioma del
 *     navegador, o la clave pelada si no hay catálogo que responda: una
 *     clave a la vista es un fallo que se ve y se arregla, un texto vacío
 *     es un botón mudo.
 *
 *   aplicar(doc) — para los textos que ya están ESCRITOS en el HTML. Los
 *     nodos marcados con data-t (contenido), data-t-title, data-t-aria y
 *     data-t-alt se reescriben con su clave. El español se queda escrito
 *     dentro del HTML a propósito, con el mismo criterio que los emoji
 *     detrás de los SVG: es lo que se ve si esto no llega a correr, y una
 *     prueba comprueba que ese texto y el del catálogo español son EL
 *     MISMO, para que la redundancia no se desincronice en silencio.
 *
 * LA CACHÉ no es una optimización: es el paracaídas del contexto
 * invalidado. Cuando la extensión se recarga con la ventana abierta,
 * chrome.i18n deja de contestar; sin caché, cada repintado iría borrando
 * las etiquetas que el usuario ya tenía delante. Con ella, el último texto
 * que se resolvió bien se sigue sirviendo. Se cachea por clave Y
 * sustituciones, porque «Adelantar 10 segundos» y «Adelantar 30 segundos»
 * son respuestas distintas de la misma clave.
 *
 * Lo que NO pasa por aquí, a propósito: los mensajes de consola (hablan
 * con quien depura, no con quien oye música), la marca «Music PiP» (un
 * nombre propio no se traduce) y las claves internas de presets o comandos
 * (son identificadores, no frases).
 */
(function (root) {
  "use strict";

  const YTMPip = root.YTMPip || (root.YTMPip = {});

  /** Último texto bien resuelto por clave+sustituciones. */
  const cache = new Map();

  /**
   * El texto de una clave, o null si nadie contesta (sin chrome.i18n, con
   * el contexto invalidado, o con una clave que no está en el catálogo).
   * Separado de t() porque aplicar() necesita distinguir «no hay texto»
   * (deja el español del HTML en paz) de «la clave misma», que t() usa
   * como último recurso.
   */
  function mensaje(clave, sustituciones) {
    const subs = Array.isArray(sustituciones)
      ? sustituciones.map(String)
      : sustituciones === undefined
        ? []
        : [String(sustituciones)];
    const claveCache = clave + "\u001f" + subs.join("\u001f");

    let texto = "";
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
        texto = chrome.i18n.getMessage(clave, subs) || "";
      }
    } catch (e) {
      // Contexto invalidado: getMessage puede reventar en vez de callar.
      texto = "";
    }

    if (texto !== "") {
      cache.set(claveCache, texto);
      return texto;
    }
    return cache.has(claveCache) ? cache.get(claveCache) : null;
  }

  /** El texto de una clave; la clave pelada si no hay quien conteste. */
  function t(clave, sustituciones) {
    const texto = mensaje(clave, sustituciones);
    return texto === null ? clave : texto;
  }

  /*
   * Qué atributo del nodo escribe cada marca. `data-t` escribe el
   * contenido; las otras tres, el atributo que dice su nombre. Un botón
   * con aria-label y title iguales lleva las dos marcas, porque son dos
   * escrituras aunque digan lo mismo.
   */
  const MARCAS = [
    ["data-t", (el, texto) => (el.textContent = texto)],
    ["data-t-title", (el, texto) => el.setAttribute("title", texto)],
    ["data-t-aria", (el, texto) => el.setAttribute("aria-label", texto)],
    ["data-t-alt", (el, texto) => el.setAttribute("alt", texto)]
  ];

  /**
   * Reescribe en `doc` (un documento o cualquier nodo con querySelectorAll)
   * todos los nodos marcados. Si una clave no resuelve, el nodo se queda
   * como está: eso deja el español del HTML, que es exactamente el plan B.
   */
  function aplicar(doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return;
    for (const [marca, escribir] of MARCAS) {
      for (const el of doc.querySelectorAll("[" + marca + "]")) {
        const texto = mensaje(el.getAttribute(marca));
        if (texto !== null) escribir(el, texto);
      }
    }
  }

  YTMPip.Textos = { t, aplicar };
})(typeof self !== "undefined" ? self : globalThis);
