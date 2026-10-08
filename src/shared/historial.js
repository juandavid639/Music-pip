/*
 * LO QUE ESCUCHASTE (tanda AT): las reglas del historial, puras.
 *
 * Lo usan dos sitios y por eso vive aqui: el service worker anota (paso,
 * anotar) y la pagina del historial resume (resumen). Ninguna toca storage:
 * reciben listas y devuelven listas, y asi se prueban sin navegador.
 *
 * QUE ES UNA ESCUCHA. Una cancion cuenta UNA vez cuando lleva sonando el
 * umbral (30 s, o la mitad si es mas corta), como hacen los servicios de
 * «scrobbling»: pasar de largo por una cancion no es escucharla. Si la
 * misma cancion vuelve a empezar (repetir), puede contar otra vez.
 *
 * QUE NO ES. El historial esta APAGADO de serie (decision del autor): nadie
 * empieza a tener su escucha anotada por una actualizacion sin enterarse.
 * Ese interruptor lo mira el service worker, no este modulo. Y nunca sale
 * del equipo: no se exporta con las preferencias y no viaja a ningun sitio.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  const LIMITES = {
    // Mil escuchas son unas semanas de uso intenso; mas no aporta a «lo que
    // escuchaste» y si pesa en cada lectura del service worker.
    MAX: 1000,
    // Lo de mas de noventa dias se olvida solo.
    DIAS: 90,
    UMBRAL_S: 30,
    // Por debajo de esto la cancion «esta empezando»: la que ya conto puede
    // volver a contar (repetir una cancion es volver a escucharla).
    REINICIO_S: 5
  };

  const DIA_MS = 24 * 60 * 60 * 1000;

  function claveDe(estado) {
    return [estado.siteName || "", estado.title || "", estado.artist || ""].join("\u001f");
  }

  function umbralDe(estado) {
    const duracion = Number(estado.duration);
    return Number.isFinite(duracion) && duracion > 0 ? Math.min(LIMITES.UMBRAL_S, duracion / 2) : LIMITES.UMBRAL_S;
  }

  /*
   * Un paso del contador con cada estado que llega. `marca` es lo que hay
   * que recordar entre estados ({ clave, contada } o null) y la guarda quien
   * llama (el service worker, en storage.session, porque se duerme). Devuelve
   * la marca nueva y si este estado completa una escucha.
   */
  function paso(marca, estado) {
    if (!estado || !estado.connected || !estado.title) return { marca: marca || null, contar: false };
    const clave = claveDe(estado);
    const segundo = Number(estado.currentTime) || 0;
    let actual = marca && marca.clave === clave ? marca : { clave, contada: false };
    if (actual.contada && segundo < LIMITES.REINICIO_S) actual = { clave, contada: false };
    if (!actual.contada && estado.playing && segundo >= umbralDe(estado)) {
      return { marca: { clave, contada: true }, contar: true };
    }
    return { marca: actual, contar: false };
  }

  /** Lo guardado, saneado: solo entradas con titulo y fecha. Pura. */
  function normalizar(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (e) => e && typeof e.titulo === "string" && e.titulo && Number.isFinite(e.cuando)
    );
  }

  /** La lista con una escucha mas, sin lo caducado y con su tope. Pura. */
  function anotar(lista, estado, ahora) {
    const limite = ahora - LIMITES.DIAS * DIA_MS;
    const vigentes = normalizar(lista).filter((e) => e.cuando >= limite);
    vigentes.push({
      titulo: String(estado.title),
      artista: String(estado.artist || ""),
      sitio: String(estado.siteName || ""),
      cuando: ahora
    });
    return vigentes.slice(-LIMITES.MAX);
  }

  function contar(lista, claveDeEntrada) {
    const veces = new Map();
    for (const e of lista) {
      const clave = claveDeEntrada(e);
      const previo = veces.get(clave);
      if (previo) previo.veces++;
      else veces.set(clave, { entrada: e, veces: 1 });
    }
    // Mas escuchadas primero; a igualdad, la que sono mas recientemente.
    return Array.from(veces.values()).sort((a, b) => b.veces - a.veces || b.entrada.cuando - a.entrada.cuando);
  }

  /*
   * Lo que enseña la pagina, desde `desde` (ms; 0 = todo). Las entradas
   * llegan en orden de llegada, asi que la ultima de cada cancion es la mas
   * reciente: se recorre al reves para que «entrada» sea la ultima vez.
   */
  function resumen(lista, desde) {
    const dentro = normalizar(lista)
      .filter((e) => e.cuando >= (desde || 0))
      .reverse();
    return {
      total: dentro.length,
      canciones: contar(dentro, (e) => e.titulo + "\u001f" + e.artista)
        .slice(0, 10)
        .map((c) => ({ titulo: c.entrada.titulo, artista: c.entrada.artista, veces: c.veces })),
      artistas: contar(
        dentro.filter((e) => e.artista),
        (e) => e.artista
      )
        .slice(0, 5)
        .map((c) => ({ artista: c.entrada.artista, veces: c.veces })),
      recientes: dentro.slice(0, 30)
    };
  }

  YTMPip.Historial = { LIMITES, claveDe, paso, normalizar, anotar, resumen };
})(typeof self !== "undefined" ? self : globalThis);
