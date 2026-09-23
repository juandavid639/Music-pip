/*
 * Pruebas del encadenado automatico de canciones, con el content script
 * REALMENTE en marcha.
 *
 * El fallo, tal y como lo describio quien lo sufrio: "esta reproduciendo
 * otra cancion y como antes habia una, no se reinicia el tiempo del
 * reproductor; en YouTube inicio la cancion y en lo que hemos creado aun
 * no. Si le doy siguiente cancion ahi se vuelve a reiniciar".
 *
 * La captura que lo acompañaba fue la prueba decisiva: la barra flotante
 * estaba LLENA del todo mientras la pagina marcaba 0:16 / 3:29. Como el
 * tiempo y la duracion salen los dos del MISMO elemento (ver
 * MetadataReader.read), una barra llena no puede significar "vamos
 * retrasados": significa que estabamos leyendo el ultimo fotograma de la
 * cancion ANTERIOR, congelado.
 *
 * La causa: al encadenar, YouTube Music se fabrica un <video> nuevo y
 * abandona el anterior sin avisar. El nuestro seguia siendo el prestado a
 * la ventana flotante, y ahi `isConnected` es siempre true, asi que
 * getMediaElement() lo seguia dando por bueno. El elemento abandonado ya
 * no emite `timeupdate`, y con el se paraba el bucle entero. Pulsar
 * "siguiente" lo arreglaba porque handleCommand fuerza un
 * scheduleUpdate() a mano: de ahi el sintoma tan raro de que ese boton
 * concreto lo reviviera.
 *
 * Por eso estas pruebas no llaman a ninguna funcion directamente. El
 * content script no publica nada; se le observa por los mensajes que
 * emite, que es justo el bucle que se rompia.
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  entornoPagina,
  pulso,
  conTiempos,
  documentoFlotante
} = require("../helpers/entorno.js");

const EVENTOS_MEDIA = ["play", "pause", "timeupdate", "loadedmetadata", "ended"];

/*
 * Lleva la cuenta de que suscripciones siguen VIVAS sobre cada elemento.
 *
 * Hace falta instrumentar porque el DOM no permite preguntar "que
 * listeners tienes puestos". Y hace falta preguntarlo porque una
 * suscripcion abandonada no da error ni sale en ninguna asercion de
 * comportamiento: solo se acumula.
 */
function registroDeSuscripciones(win) {
  const vivas = [];
  const movimientos = [];
  const proto = win.EventTarget.prototype;
  const addOriginal = proto.addEventListener;
  const removeOriginal = proto.removeEventListener;

  proto.addEventListener = function (tipo, fn, opciones) {
    vivas.push({ destino: this, tipo, fn });
    movimientos.push({ destino: this, tipo });
    return addOriginal.call(this, tipo, fn, opciones);
  };
  proto.removeEventListener = function (tipo, fn, opciones) {
    const i = vivas.findIndex((s) => s.destino === this && s.tipo === tipo && s.fn === fn);
    if (i !== -1) vivas.splice(i, 1);
    movimientos.push({ destino: this, tipo });
    return removeOriginal.call(this, tipo, fn, opciones);
  };

  return {
    /** Suscripciones que siguen puestas sobre un elemento. */
    de(destino) {
      return vivas.filter((s) => s.destino === destino).map((s) => s.tipo);
    },
    /*
     * Altas y bajas ACUMULADAS, se hayan compensado o no.
     *
     * Sin esto no se puede distinguir "no se toco nada" de "se quito y se
     * volvio a poner": las dos dejan el mismo numero de suscripciones
     * vivas. La diferencia entre las dos es justo lo que vigila la guarda
     * de "es el mismo elemento".
     */
    movimientosDe(destino) {
      return movimientos.filter((m) => m.destino === destino).length;
    }
  };
}

/**
 * Monta la situacion exacta del fallo y devuelve las dos piezas.
 *
 * Es importante que el video viejo quede en el documento de la ventana
 * flotante y no simplemente suelto: ahi `isConnected` sigue siendo true,
 * que es lo que engañaba a la comprobacion antigua. Un elemento creado y
 * nunca insertado no reproduce el fallo.
 */
async function encadenarCancion(entorno) {
  const viejo = entorno.YTMPip.Adapter.getPageMediaElement();
  conTiempos(viejo, 223, 223); // terminada
  documentoFlotante(entorno.win).body.appendChild(viejo);
  entorno.YTMPip.Adapter.setBorrowedMedia(viejo);
  await pulso();

  const nuevo = entorno.win.document.createElement("video");
  conTiempos(nuevo, 16, 209); // recien empezada: 0:16 de 3:29
  entorno.YTMPip.Adapter.getPlayerContainer().appendChild(nuevo);
  await pulso();

  return { viejo, nuevo };
}

test("EL CASO REPORTADO: al encadenar, el tiempo sale del video nuevo y no del viejo", async () => {
  const entorno = entornoPagina("controles-completos.html");
  await pulso();

  const { viejo } = await encadenarCancion(entorno);
  const estado = entorno.ultimoEstado();

  assert.strictEqual(viejo.currentTime, 223, "premisa: el video viejo sigue clavado en su final");
  assert.strictEqual(
    estado.currentTime,
    16,
    `se seguia leyendo el video abandonado (llego ${estado.currentTime}, se esperaba 16)`
  );
  assert.strictEqual(estado.duration, 209, "la duracion tambien tiene que ser la de la cancion nueva");
});

test("la barra no puede quedarse llena mientras la cancion nueva acaba de empezar", async () => {
  /*
   * La forma en que se vio el fallo, dicha tal cual. Es redundante con la
   * prueba anterior a proposito: aquella fija los numeros exactos y esta
   * fija la propiedad que se veia rota en la captura, que es la que de
   * verdad importa y sobrevivira a que cambien los numeros del fixture.
   */
  const entorno = entornoPagina("controles-completos.html");
  await pulso();

  await encadenarCancion(entorno);
  const { currentTime, duration } = entorno.ultimoEstado();

  assert.ok(duration > 0, "sin duracion la comprobacion no diria nada");
  assert.ok(
    currentTime < duration * 0.5,
    `la barra iba por ${currentTime}/${duration}: practicamente llena con la cancion recien empezada`
  );
});

test("los listeners se mudan al video nuevo en vez de acumularse en el viejo", async () => {
  let registro;
  const entorno = entornoPagina("controles-completos.html", {
    antesDeCargar: (win) => {
      registro = registroDeSuscripciones(win);
    }
  });
  await pulso();

  const { viejo, nuevo } = await encadenarCancion(entorno);

  assert.deepStrictEqual(
    registro.de(nuevo).sort(),
    EVENTOS_MEDIA.slice().sort(),
    "el video que suena ahora tiene que estar escuchado entero"
  );
  assert.deepStrictEqual(
    registro.de(viejo),
    [],
    "quedaron suscripciones pegadas al video abandonado: cada cancion sumaria otro juego"
  );
});

test("el latido se muda: el video nuevo repinta, el viejo ya no", async () => {
  /*
   * La mitad funcional de la prueba anterior. Contar suscripciones dice
   * que la estructura esta bien; esto dice que ademas SIRVE. Sin ello,
   * suscribirse a los eventos equivocados pasaria las dos pruebas de
   * conteo sin que la ventana se actualizara nunca.
   */
  const entorno = entornoPagina("controles-completos.html");
  await pulso();

  const { viejo, nuevo } = await encadenarCancion(entorno);

  nuevo.currentTime = 40;
  nuevo.dispatchEvent(new entorno.win.Event("timeupdate"));
  await pulso();
  assert.strictEqual(entorno.ultimoEstado().currentTime, 40, "el video nuevo no esta despertando al bucle");

  // Ahora al reves: el que ya no suena no debe poder mover nada.
  nuevo.currentTime = 55;
  viejo.dispatchEvent(new entorno.win.Event("timeupdate"));
  await pulso();
  assert.strictEqual(
    entorno.ultimoEstado().currentTime,
    40,
    "el video abandonado sigue disparando actualizaciones"
  );
});

test("mientras el video no cambie no se toca la suscripcion", async () => {
  /*
   * El MutationObserver dispara constantemente (YouTube Music reescribe
   * la barra de progreso cada segundo) y cada disparo llama a
   * attachMediaListeners. La guarda de "es el mismo elemento" es lo que
   * evita que eso se convierta en un desuscribir-y-resuscribir continuo.
   *
   * Escribi esta prueba contando suscripciones VIVAS y no valia: al
   * quitar la guarda seguian siendo cinco, porque la baja y el alta se
   * compensan en el mismo tick. Medir el saldo no distingue "no se hizo
   * nada" de "se deshizo y se rehizo". Por eso cuenta movimientos.
   */
  let registro;
  const entorno = entornoPagina("controles-completos.html", {
    antesDeCargar: (win) => {
      registro = registroDeSuscripciones(win);
    }
  });
  await pulso();

  const media = entorno.YTMPip.Adapter.getMediaElement();
  assert.deepStrictEqual(
    registro.de(media).sort(),
    EVENTOS_MEDIA.slice().sort(),
    "premisa: una suscripcion por evento"
  );
  const movimientosTrasInit = registro.movimientosDe(media);

  // Varias mutaciones del DOM, como las que hace YouTube Music al vuelo.
  for (let i = 0; i < 3; i++) {
    entorno.win.document.body.appendChild(entorno.win.document.createElement("div"));
    await pulso(60);
  }

  assert.deepStrictEqual(
    registro.de(media).sort(),
    EVENTOS_MEDIA.slice().sort(),
    "el saldo de suscripciones tiene que seguir intacto"
  );
  assert.strictEqual(
    registro.movimientosDe(media),
    movimientosTrasInit,
    "cada mutacion del DOM esta rehaciendo la suscripcion del video que no ha cambiado"
  );
});

test("sin video propio en la pagina, el prestado sigue siendo el latido", async () => {
  /*
   * La otra mitad: no vale con desconfiar del prestamo siempre. Durante
   * el funcionamiento normal la pagina NO tiene <video> (nos lo hemos
   * llevado a la ventana flotante), y el prestado tiene que seguir
   * mandando. Si esta prueba se rompe, el arreglo del encadenado se ha
   * llevado por delante el caso normal.
   */
  const entorno = entornoPagina("controles-completos.html");
  await pulso();

  const prestado = entorno.YTMPip.Adapter.getPageMediaElement();
  conTiempos(prestado, 63, 223);
  documentoFlotante(entorno.win).body.appendChild(prestado);
  entorno.YTMPip.Adapter.setBorrowedMedia(prestado);

  prestado.currentTime = 64;
  prestado.dispatchEvent(new entorno.win.Event("timeupdate"));
  await pulso();

  assert.strictEqual(entorno.win.document.querySelector("video"), null, "premisa de la prueba");
  assert.strictEqual(entorno.ultimoEstado().currentTime, 64);
  assert.strictEqual(entorno.ultimoEstado().duration, 223);
});
