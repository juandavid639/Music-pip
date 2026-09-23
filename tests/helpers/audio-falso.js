/*
 * Un AudioContext de mentira, lo justo para que src/content/audio-grafo.js
 * corra dentro de jsdom.
 *
 * POR QUE ESTO EXISTE. jsdom no tiene Web Audio, asi que sin un doble el
 * grafo seria codigo que nadie ejecuta nunca hasta que lo ejecuta un usuario.
 * Y hay decisiones de ese archivo que NO son cuestion de oido y por tanto no
 * hay excusa para dejarlas sin probar:
 *
 *   - que un plan apagado no cruce la puerta,
 *   - que la puerta no se cruce dos veces para el mismo elemento,
 *   - que la fuente quede conectada a destination ANTES que a nada mas,
 *   - que apagar puentee en vez de intentar deshacer lo indeshacible.
 *
 * Lo que este doble NO puede decir es como suena nada. Eso se mide en el
 * navegador con tools/diagnostico-ecualizador.js y no hay atajo.
 *
 * DOS COMPORTAMIENTOS DEL NAVEGADOR SE IMITAN A PROPOSITO, porque son
 * justamente los que el codigo tiene que respetar:
 *
 *   1. createMediaElementSource LANZA InvalidStateError la segunda vez que se
 *      le pide el mismo elemento. Si el doble lo dejara pasar, la prueba de
 *      "apagar y volver a encender" pasaria aqui y explotaria en la pagina.
 *   2. connect() del mismo par dos veces NO duplica la conexion; es un no-op,
 *      igual que en la especificacion. Sin eso habria que llevar la cuenta a
 *      mano de si `toma` ya esta conectada a destination.
 */

/*
 * Un AudioParam de mentira que LLEVA LA CUENTA de quien le escribe.
 *
 * `escrituras` no es adorno: la unica forma de comprobar que a un filtro de
 * tipo shelf no se le toca la Q es contar que nadie se la ha escrito. Mirar el
 * valor no sirve, porque el valor de fabrica coincide con el que tendria una
 * campana y la prueba pasaria por casualidad.
 */
function parametro(inicial) {
  let actual = inicial;
  const p = {
    // Lo que se le pidio por rampa la ultima vez. El navegador se acerca al
    // objetivo por una curva; aqui llega de golpe, que para comprobar QUE
    // valor se pidio da igual y para comprobar COMO suena no valdria nada.
    objetivo: null,
    constante: null,
    rampas: 0,
    escrituras: 0,
    setTargetAtTime(valor, cuando, constante) {
      p.objetivo = valor;
      p.constante = constante;
      p.rampas++;
      actual = valor;
    }
  };
  Object.defineProperty(p, "value", {
    enumerable: true,
    get() {
      return actual;
    },
    set(v) {
      actual = v;
      p.escrituras++;
    }
  });
  return p;
}

function nodo(ctx, tipo, extra) {
  const n = Object.assign(
    {
      tipo,
      salidas: [],
      desconexiones: 0,
      connect(destino) {
        // No-op si ya estaban conectados, como en el navegador.
        if (this.salidas.indexOf(destino) === -1) this.salidas.push(destino);
        return destino;
      },
      disconnect(destino) {
        this.desconexiones++;
        if (destino === undefined) {
          this.salidas.length = 0;
          return;
        }
        const i = this.salidas.indexOf(destino);
        if (i !== -1) this.salidas.splice(i, 1);
      }
    },
    extra
  );
  ctx.creados.push(n);
  return n;
}

/**
 * @param {object} opciones
 *   - state: "running" | "suspended"
 *   - fallaAlCruzar: true para que createMediaElementSource lance siempre
 *   - fallaAlCrearGain: true para que createGain lance siempre
 */
function contextoFalso(opciones = {}) {
  const ctx = {
    state: opciones.state || "running",
    sampleRate: 48000,
    currentTime: 0,
    creados: [],
    // Cuentas que las pruebas miran directamente.
    cruzados: [],
    resumes: 0,
    cerrado: false,
    resume() {
      this.resumes++;
      this.state = "running";
      return Promise.resolve();
    },
    close() {
      // Que exista para poder comprobar que NADIE la llama: cerrar el contexto
      // con la puerta cruzada deja al usuario sin audio hasta que recargue.
      this.cerrado = true;
      this.state = "closed";
      return Promise.resolve();
    },
    createMediaElementSource(elemento) {
      if (opciones.fallaAlCruzar) throw new Error("no se puede cruzar");
      if (this.cruzados.indexOf(elemento) !== -1) {
        const err = new Error("InvalidStateError: ya hay una fuente para este elemento");
        err.name = "InvalidStateError";
        throw err;
      }
      this.cruzados.push(elemento);
      return nodo(this, "fuente", { mediaElement: elemento });
    },
    createGain() {
      if (opciones.fallaAlCrearGain) throw new Error("sin gain");
      return nodo(this, "gain", { gain: parametro(1) });
    },
    createBiquadFilter() {
      return nodo(this, "biquad", {
        type: "peaking",
        frequency: parametro(350),
        Q: parametro(1),
        gain: parametro(0),
        detune: parametro(0)
      });
    },
    /*
     * El limitador del final de la cadena del ecualizador.
     *
     * Los valores de fabrica son LOS DE LA ESPECIFICACION, no los que este
     * proyecto quiere: asi, si `aplicar` dejara de escribir alguno, la prueba
     * lo ve como "se quedo en el de fabrica" en vez de encontrarse el bueno
     * puesto por el doble.
     *
     * `sinLimitador: true` lo quita del contexto entero, para poder probar
     * que la cadena no se queda sin salida en un navegador que no lo tenga.
     */
    createDynamicsCompressor: opciones.sinLimitador
      ? undefined
      : function createDynamicsCompressor() {
          return nodo(this, "limitador", {
            threshold: parametro(-24),
            knee: parametro(30),
            ratio: parametro(12),
            attack: parametro(0.003),
            release: parametro(0.25),
            reduction: 0
          });
        },
    createMediaStreamSource(stream) {
      return nodo(this, "fuenteStream", { mediaStream: stream });
    },
    createAnalyser() {
      const a = nodo(this, "analizador", {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        getByteFrequencyData(destino) {
          destino.fill(0);
        },
        getFloatFrequencyData(destino) {
          destino.fill(-100);
        }
      });
      // frequencyBinCount es la mitad del fftSize y cambia cuando se le
      // asigna: si fuera un numero fijo, el modulo pediria arrays del tamaño
      // equivocado y la prueba no se enteraria.
      Object.defineProperty(a, "frequencyBinCount", {
        enumerable: true,
        get() {
          return a.fftSize / 2;
        }
      });
      return a;
    }
  };
  ctx.destination = nodo(ctx, "destination", {});
  return ctx;
}

/**
 * Instala el doble en una ventana jsdom ANTES de cargar los modulos.
 *
 * Devuelve una funcion que entrega el ULTIMO contexto creado, o null si no se
 * ha creado ninguno —que en si mismo es un resultado que interesa: significa
 * que nadie ha tocado el audio—. Trae ademas `.todos` y `.primero()`, que
 * hacen falta cuando en una misma prueba hay dos contextos vivos: el que se
 * monto el espectro por su cuenta y el del ecualizador.
 */
function instalarAudioFalso(win, opciones = {}) {
  const todos = [];
  const dame = () => (todos.length ? todos[todos.length - 1] : null);
  dame.todos = todos;
  dame.primero = () => todos[0] || null;
  win.AudioContext = function () {
    const creado = contextoFalso(opciones);
    todos.push(creado);
    return creado;
  };
  return dame;
}

/**
 * Un <video> de jsdom que ademas sabe hacer captureStream().
 *
 * jsdom no lo implementa, y sin el `puedeMedirse` dice que no y el espectro no
 * llega a montarse: la prueba pasaria sin haber probado nada.
 */
function conCaptura(video) {
  const pistas = [{ readyState: "live", kind: "audio" }];
  const stream = {
    getAudioTracks: () => pistas,
    getTracks: () => pistas
  };
  video.captureStream = () => {
    video.capturas = (video.capturas || 0) + 1;
    return stream;
  };
  video.capturas = 0;
  return video;
}

module.exports = { contextoFalso, instalarAudioFalso, parametro, conCaptura };
