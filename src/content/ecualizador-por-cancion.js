/*
 * Memoria del ecualizador POR CANCION: fijar un ajuste a una cancion
 * concreta para que se ponga solo cada vez que esa cancion suene.
 *
 * ==================== LA DECISION QUE SOSTIENE TODO ====================
 *
 * Este modulo NO tiene un camino propio hacia el grafo de audio. Cuando
 * una cancion fijada empieza, ESCRIBE el ajuste guardado con
 * Settings.guardarEcualizador, exactamente igual que si el usuario lo
 * hubiera elegido en la pagina de opciones. Todo lo demas pasa solo: el
 * grafo se remonta porque ya esta suscrito a Settings, el interruptor de
 * la ventana se repinta porque ya se repinta con cada cambio, y la pagina
 * de opciones enseña el ajuste real porque lee la misma clave de siempre.
 *
 * La alternativa —un "ecualizador efectivo" calculado aparte, con la
 * preferencia global intacta debajo— parecia mas respetuosa y era una
 * mentira estructural: habria DOS respuestas a "como suena ahora", y cada
 * mando de la extension tendria que saber cual de las dos enseñar. El
 * comentario de EQUALIZER en constants.js dice que esa clave significa
 * COMO SUENA AHORA; si la cancion fijada suena con su ajuste, eso es lo
 * que la clave tiene que decir. Un mando que enseña la preferencia global
 * mientras suena otra cosa es un mando que miente.
 *
 * EL PRECIO de esa honestidad es que hay que DEVOLVER lo que habia cuando
 * la cancion fijada termina, y solo si el usuario no toco el ecualizador
 * mientras tanto. De eso se ocupa `pendiente`: guarda que habia antes
 * (`anterior`) y que puso la maquina (`aplicado`). Al llegar una cancion
 * sin ajuste fijado, si el valor global sigue siendo el que la maquina
 * puso, se restaura `anterior`; si ya es otro, el usuario tomo el mando
 * durante la cancion y su eleccion se respeta —restaurar por encima de el
 * seria pelearle el volante—.
 *
 * ==================== POR QUE VIVE EN EL CONTENT SCRIPT ====================
 *
 * Por lo mismo que el temporizador de apagado: quien sabe que cancion
 * suena es esta pagina (el latido de scheduleUpdate ya construye el
 * estado con titulo y artista), y quien escribe Settings de forma
 * sincrona tambien. Pasar por el service worker seria un viaje de ida y
 * vuelta para tomar una decision que se toma entera aqui.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  // clave de la cancion que suena ahora, o null si aun no consta ninguna.
  let actual = null;
  // Map clave -> valor canonico del ecualizador. El ORDEN de insercion es
  // la antiguedad: la primera entrada es la proxima en salir si no cabe.
  let memoria = new Map();
  /*
   * { anterior, aplicado } mientras haya un ajuste puesto POR LA MAQUINA
   * pendiente de devolver, o null. `aplicado` es la prueba del delito: si
   * al terminar la cancion el valor global ya no es ese, no lo puso la
   * maquina lo ultimo, lo puso el usuario, y no se devuelve nada.
   */
  let pendiente = null;
  // Lo que sonaba cuando empezo la cancion actual. Es el `anterior` del
  // primer fijado: quien fija a mitad de cancion quiere volver, al acabar,
  // a lo que sonaba antes de que ESTA cancion trajera su ajuste.
  let alEmpezar = null;

  /*
   * La clave con la que una cancion se recuerda: titulo y artista, con un
   * salto de linea en medio porque es un caracter que un titulo no trae.
   *
   * NO se reutiliza songKeyOf de content-script.js a proposito, aunque las
   * dos peguen titulo y artista. Aquella compara dos lecturas separadas
   * por milisegundos para descartar una carrera, y le da igual el
   * separador o que el titulo venga vacio: las dos lecturas fallarian
   * igual. Esta clave IDENTIFICA una cancion a traves de dias y sesiones,
   * y ahi un titulo vacio no es una clave rara, es la AUSENCIA de cancion:
   * fijar un ajuste a "" seria fijarselo a todos los momentos en que la
   * pagina aun no ha cargado. Mismo aspecto, contratos distintos; una sola
   * funcion con dos contratos es la que acaba rompiendo uno de los dos.
   *
   * Pura.
   */
  function claveDe(metadata) {
    if (!metadata || typeof metadata.title !== "string" || metadata.title === "") return null;
    const artista = typeof metadata.artist === "string" ? metadata.artist : "";
    return metadata.title + "\n" + artista;
  }

  /*
   * De lo que haya en storage a un Map sano. Entra cualquier cosa; salen
   * solo pares [clave, valor] donde la clave es un texto no vacio y el
   * valor es EXACTAMENTE canonico.
   *
   * "Canonico" se comprueba con la propia normalizacion del ecualizador:
   * los valores validos son los PUNTOS FIJOS de Ecualizador.normalizar
   * (normalizar un valor canonico lo devuelve tal cual). Lo corrupto se
   * TIRA, no se normaliza: normalizar aqui convertiria basura en "off", y
   * un "off" fijado a una cancion es una orden real ("esta cancion sin
   * ecualizar"), no el residuo de un dato roto. Mejor olvidar un fijado
   * ilegible que inventarse uno.
   *
   * Si vienen mas entradas de las que caben se conservan las ULTIMAS: el
   * final de la lista es lo mas reciente, y la expulsion siempre come por
   * el principio.
   *
   * Pura. Expuesta para poder probarla sin montar un storage.
   */
  function normalizarMemoria(pares) {
    const mapa = new Map();
    if (!Array.isArray(pares)) return mapa;
    for (const par of pares) {
      if (!Array.isArray(par) || par.length < 2) continue;
      const clave = par[0];
      const valor = par[1];
      if (typeof clave !== "string" || clave === "") continue;
      if (YTMPip.Ecualizador.normalizar(valor) !== valor) continue;
      // Una clave repetida se queda con la ULTIMA aparicion y ademas se
      // recoloca al final: es la mas reciente de las dos.
      mapa.delete(clave);
      mapa.set(clave, valor);
    }
    const MAX = YTMPip.CONSTANTS.EQUALIZER_BY_SONG_LIMITS.MAX_SONGS;
    while (mapa.size > MAX) {
      mapa.delete(mapa.keys().next().value);
    }
    return mapa;
  }

  function persistir() {
    const KEY = YTMPip.CONSTANTS.STORAGE_KEYS.EQUALIZER_BY_SONG;
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return;
    try {
      chrome.storage.local.set({ [KEY]: Array.from(memoria.entries()) });
    } catch (err) {
      // Contexto invalidado: la memoria de esta sesion sigue funcionando;
      // lo unico que se pierde es que sobreviva a cerrar la pestaña.
    }
  }

  // guardarEcualizador repinta y escribe storage aunque el valor no
  // cambie. Preguntar antes evita ese trabajo cuando no hay nada que
  // cambiar, que es el caso normal (casi ninguna cancion esta fijada).
  function ponerGlobal(valor) {
    if (valor === YTMPip.Settings.get().equalizer) return;
    YTMPip.Settings.guardarEcualizador(valor);
  }

  /*
   * El latido: se llama con cada estado que construye content-script.js.
   * Casi siempre no hace nada (misma cancion); trabaja solo al CAMBIAR.
   *
   * Un estado sin titulo (pagina cargando, anuncio, DOM a medio pintar) se
   * ignora del todo: no es "otra cancion", es un parpadeo, y tratarlo como
   * cambio dispararia una devolucion que un segundo despues habria que
   * deshacer cuando el titulo volviera.
   */
  function alSonar(metadata) {
    const clave = claveDe(metadata);
    if (clave === null || clave === actual) return;
    actual = clave;
    const global = YTMPip.Settings.get().equalizer;
    alEmpezar = global;
    const guardado = memoria.has(clave) ? memoria.get(clave) : null;
    if (guardado !== null) {
      /*
       * CADENA de canciones fijadas: si lo que suena lo puso la maquina
       * (global === pendiente.aplicado), el "anterior" que hay que
       * conservar es el ORIGINAL de antes de la cadena, no el ajuste de la
       * cancion fijada previa. Si el usuario toco algo en medio, su valor
       * pasa a ser el nuevo "anterior": tomo el mando y ahi es donde se
       * vuelve.
       */
      const anterior = pendiente && global === pendiente.aplicado ? pendiente.anterior : global;
      pendiente = { anterior, aplicado: guardado };
      ponerGlobal(guardado);
      return;
    }
    if (pendiente !== null) {
      if (global === pendiente.aplicado) {
        ponerGlobal(pendiente.anterior);
        /*
         * `alEmpezar` se corrige DESPUES de devolver, y no vale el de la
         * linea de arriba: aquel se apunto antes de la devolucion, o sea
         * que decia el ajuste de la cancion fijada ANTERIOR. Esta cancion
         * empieza sonando con lo devuelto; si el usuario la fija ahora,
         * "volver a lo de antes" es volver a esto, no a un ajuste que la
         * maquina acababa de retirar. Se encontro derivando a mano el
         * caso "fijar justo despues de una devolucion": sin esta linea,
         * el ecualizador de la cancion fijada previa se colaba de
         * `anterior` y reaparecia dos canciones mas tarde.
         */
        alEmpezar = pendiente.anterior;
      }
      pendiente = null;
    }
  }

  /*
   * Fija a la cancion actual LO QUE SUENA AHORA MISMO. No recibe el valor
   * por argumento a proposito: el boton de la ventana no elige ajustes,
   * congela el que hay, y un argumento seria una segunda puerta por la que
   * podria entrar un valor sin normalizar.
   *
   * Tambien deja `pendiente` armado: fijar convierte el ajuste actual en
   * "cosa de esta cancion", asi que al acabar hay que devolver lo que
   * sonaba al empezar, igual que si la cancion hubiera llegado ya fijada.
   * El `anterior` de un pendiente que ya existiera se conserva (cadena).
   */
  function recordar() {
    if (actual === null) return null;
    const valor = YTMPip.Ecualizador.normalizar(YTMPip.Settings.get().equalizer);
    // Recolocar al final: acaba de usarse, es la mas reciente.
    memoria.delete(actual);
    memoria.set(actual, valor);
    const MAX = YTMPip.CONSTANTS.EQUALIZER_BY_SONG_LIMITS.MAX_SONGS;
    while (memoria.size > MAX) {
      memoria.delete(memoria.keys().next().value);
    }
    persistir();
    pendiente = { anterior: pendiente !== null ? pendiente.anterior : alEmpezar, aplicado: valor };
    return valor;
  }

  /*
   * Borra el fijado de la cancion actual. El sonido NO se toca: quitar la
   * chincheta significa "no lo pongas la proxima vez", no "quitalo ya".
   *
   * `pendiente` se queda a proposito: si el ajuste que suena lo puso la
   * maquina, la maquina lo devolvera al acabar la cancion, con fijado o
   * sin el. Borrarlo aqui dejaria el ajuste de una cancion ya olvidada
   * pegado al resto de la sesion.
   */
  function olvidar() {
    if (actual === null || !memoria.has(actual)) return false;
    memoria.delete(actual);
    persistir();
    return true;
  }

  // El ajuste fijado a la cancion actual, o null. Es lo que el boton de la
  // ventana necesita para saber si pinta la chincheta clavada o suelta.
  function guardada() {
    if (actual === null || !memoria.has(actual)) return null;
    return memoria.get(actual);
  }

  function cancionActual() {
    return actual;
  }

  /*
   * Carga inicial. Asincrona y sin prisa: hasta que llegue, la memoria
   * esta vacia y el latido no fija nada, que es el mismo trato que recibe
   * cualquier preferencia antes de Settings.load().
   *
   * Al terminar se OLVIDA la cancion actual (actual = null) para que el
   * proximo latido vuelva a decidir con la memoria ya cargada: sin esto,
   * la cancion que ya estaba sonando al abrir la pagina se quedaria sin su
   * ajuste fijado hasta la siguiente, porque el latido la habria visto
   * antes de saber que estaba fijada.
   */
  function cargar() {
    const KEY = YTMPip.CONSTANTS.STORAGE_KEYS.EQUALIZER_BY_SONG;
    if (!YTMPip.isContextValid || !YTMPip.isContextValid()) return Promise.resolve(memoria);
    try {
      return Promise.resolve(chrome.storage.local.get(KEY))
        .then((stored) => {
          memoria = normalizarMemoria(stored && stored[KEY]);
          actual = null;
          return memoria;
        })
        .catch(() => memoria);
    } catch (err) {
      return Promise.resolve(memoria);
    }
  }

  YTMPip.EcualizadorPorCancion = {
    claveDe,
    alSonar,
    recordar,
    olvidar,
    guardada,
    cancionActual,
    // Pura y expuesta para poder probarla sin montar un storage.
    normalizarMemoria,
    cargar
  };

  cargar();
})(typeof self !== "undefined" ? self : globalThis);
