/*
 * Pruebas del PULSO: que lo que ocupe el escenario crezca con los graves.
 *
 * Se dijo "la caratula" durante toda su primera vida, y aqui quedaba escrito
 * asi. Ahora late tambien el video, y el nombre viejo describia el sitio en
 * vez del efecto.
 *
 * Se llama pulso y no latido a proposito. "Latido" ya esta cogido en este
 * proyecto para el tick de 300 ms que repara la barra de tiempo
 * (tests/unit/pip-latido.test.js), que es el fallo mas reincidente de todos.
 * Dos cosas distintas con el mismo nombre es exactamente la ambiguedad que
 * aqui se paga cara.
 *
 * Lo que aqui se puede probar y lo que no:
 *
 *  - SE PRUEBA la MEDICION: como se promedian los graves, como persigue la
 *    referencia y cuando eso cuenta como golpe. Son numeros y son reglas.
 *  - SE PRUEBA EL CABLE: que el numero llegue a la variable CSS, que el
 *    boton aparezca cuando debe y que encender uno de los dos efectos no
 *    encienda ni apague el otro.
 *  - SE PRUEBA QUE LA DECISION ESTE TOMADA en pip.css, leyendo la hoja como
 *    texto: que la portada y el hueco del video compartan la regla del
 *    pulso y que las dos se callen con el movimiento reducido. Es poco, pero
 *    es la diferencia entre un efecto medido y un efecto medido que no se ve.
 *  - NO SE PRUEBA que se vea bien creciendo. Cuanto crece lo decide pip.css
 *    y jsdom no maqueta. Eso es cosa de mirar la ventana, y para medirlo en
 *    la pagina real esta tools/diagnostico-pulso.js.
 *
 * El AudioContext se finge, y sus NUMEROS tambien, al reves que en
 * pip-espectro.test.js. Ahi fingir niveles no probaria nada porque lo que
 * importa es cuando se monta y cuando se suelta; aqui la regla ES el
 * numero, asi que hay que poder decir "ahora los graves suben 9 dB".
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

function conAudio(video) {
  const pista = { readyState: "live", stop() {} };
  video.captureStream = () => ({ getAudioTracks: () => [pista] });
  if (!video.currentSrc) {
    Object.defineProperty(video, "currentSrc", {
      value: "blob:https://music.youtube.com/9c92c774",
      writable: true,
      configurable: true
    });
  }
  return video;
}

/*
 * Hasta donde llegan los graves de la cancion FALSA que suena en el doble.
 *
 * Mas alto que los 120 Hz que pide el modulo, y a proposito. Una cancion de
 * verdad no corta en seco: el bombo se derrama por encima de su banda, y
 * ademas `mediaDb` redondea hacia arriba, asi que la ultima banda que lee
 * esta ya un poco pasada de 120. Lo que hace falsable el doble no es donde
 * acaban los graves, es que MAS ARRIBA haya mucha menos energia.
 */
const HASTA_HZ_FALSOS = 150;

/*
 * AudioContext de mentira con un espectro gobernable.
 *
 * Tres detalles del doble que no son adorno, y cada uno se gano su sitio
 * cuando una mutacion sobrevivio por no estar:
 *
 * 1. `sampleRate`. El modulo calcula los hercios por banda a partir de el, y
 *    sin el la banda de graves sale NaN y TODA lectura pareceria silencio.
 *    44100 es lo que dan las maquinas reales, y con 1024 bandas deja
 *    ~21,5 Hz por banda: de 20 a 120 Hz caen las bandas 1 a 6.
 *
 * 2. CADA BANDA VALE SEGUN SU FRECUENCIA, en vez de rellenar el array entero
 *    con el mismo numero. Con un espectro liso da igual que banda se mire, y
 *    entonces ninguna prueba puede notar que el modulo mire el trozo
 *    equivocado: sobrevivian a la vez "el analizador se queda a 256" y "la
 *    banda de graves se estira hasta la voz". La banda 0 lleva 0 dB —la
 *    componente continua, que es basura y no sonido— y esa es la trampa que
 *    obliga a saltarsela.
 *
 * 3. `smoothingTimeConstant` SE HONRA, mezclando cada lectura con la
 *    anterior como hace un AnalyserNode de verdad. Sin eso, suavizar los
 *    graves antes de medirlos —que es justo lo que borra un bombo— no se
 *    notaba en ninguna prueba. Con el 0 que usa el codigo la mezcla es la
 *    identidad, asi que esto no cambia ningun numero de los de abajo.
 *
 * `frequencyBinCount` es un getter derivado de fftSize, como en el navegador,
 * para que el analizador de graves entregue 1024 bandas y el de barras 128.
 * Con un numero fijo no se podria notar la diferencia entre los dos.
 */
function fingirAudio(win) {
  const creados = [];
  creados.nivel = 0; // lo que leen las barras (bytes)
  creados.graves = -60; // decibelios por debajo de HASTA_HZ_FALSOS
  creados.resto = -85; // decibelios del resto del espectro

  win.AudioContext = function () {
    const ctx = {
      state: "running",
      sampleRate: 44100,
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => {
        // El estado que necesita el suavizado: lo que se entrego la vez
        // anterior. Arranca en el suelo de ruido, que es de donde sale un
        // analizador recien montado.
        let anterior = null;
        const nodo = {
          fftSize: 2048,
          smoothingTimeConstant: 0,
          get frequencyBinCount() {
            return nodo.fftSize / 2;
          },
          getByteFrequencyData(destino) {
            destino.fill(creados.nivel);
          },
          getFloatFrequencyData(destino) {
            const hzPorBanda = ctx.sampleRate / 2 / destino.length;
            const s = nodo.smoothingTimeConstant;
            if (!anterior || anterior.length !== destino.length) {
              anterior = new Float32Array(destino.length);
              anterior.fill(creados.resto);
            }
            for (let i = 0; i < destino.length; i++) {
              const hz = i * hzPorBanda;
              let db;
              if (i === 0) db = 0; // continua: no es sonido
              else if (hz <= HASTA_HZ_FALSOS) db = creados.graves;
              else db = creados.resto;

              const mezclable = s > 0 && Number.isFinite(anterior[i]) && Number.isFinite(db);
              const suave = mezclable ? s * anterior[i] + (1 - s) * db : db;
              anterior[i] = suave;
              destino[i] = suave;
            }
          }
        };
        return nodo;
      },
      resume: () => Promise.resolve(),
      close() {
        ctx.state = "closed";
        return Promise.resolve();
      }
    };
    creados.push(ctx);
    return ctx;
  };
  return creados;
}

function ventana(opciones) {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  const fotogramas = [];
  win.requestAnimationFrame = (fn) => fotogramas.push(fn);
  win.cancelAnimationFrame = () => {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    banco,
    fotogramas,
    contextos: fingirAudio(win),
    Adapter: win.YTMPip.Adapter,
    Espectro: win.YTMPip.Espectro,
    PipView: win.YTMPip.PipView,
    raiz: doc.getElementById("ytmpip-root"),
    boton: doc.getElementById("ytmpip-pulse-toggle"),
    botonEspectro: doc.getElementById("ytmpip-spectrum-toggle"),
    lienzo: doc.getElementById("ytmpip-spectrum")
  };
}

function sinVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

function conVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: true, lyrics: {} };
}

function conLetra() {
  return Object.assign(sinVideo(), {
    lyrics: { status: "available", source: "Better Lyrics", lines: [{ text: "una linea", time: 1 }] }
  });
}

/* Una ventana con el pulso YA encendido y el analizador montado. */
function conPulso(opciones) {
  const v = ventana(opciones);
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarPulso();
  return v;
}

/*
 * El instante en el que arrancan las pruebas que miden tiempo.
 *
 * No es cero, y eso importa. El reloj que llega aqui es el de
 * requestAnimationFrame, que cuenta desde que se cargo la pagina: cuando el
 * usuario le da al boton ya han pasado segundos. Empezar las pruebas en 0
 * mete al modulo por un camino que en la ventana real no se pisa nunca —el
 * primer hueco entre fotogramas sale de longitud cero— y varias pruebas de
 * aqui abajo pasaban por esa razon y no por la suya.
 */
const T0 = 5000;

/* Pone el nivel de graves y pide una lectura en ese instante. */
function leer(v, ms, db) {
  if (db !== undefined) v.contextos.graves = db;
  return v.Espectro.leerPulso(ms);
}

/* ------------------------------------------------------------------
 * mediaDb: de que trozo del espectro se mira y cual se ignora
 *
 * Es la parte que hace falsable toda la idea. Con las 128 bandas del
 * espectro de barras, UNA banda son 172 Hz: los graves enteros caben en la
 * banda 0, que ademas es la de la componente continua. A esa resolucion
 * "los graves" y "el ruido de 0 Hz" son literalmente el mismo numero, y de
 * ahi que exista un segundo analizador a 2048.
 * ------------------------------------------------------------------ */

test("la banda cero NO entra en la media: es continua, no es musica", () => {
  /*
   * Si entrara, cualquier senal continua del analizador se leeria como
   * graves permanentes: la caratula se quedaria grande y quieta.
   */
  const m = ventana().Espectro.mediaDb;
  // ~21,5 Hz por banda: de 20 a 120 Hz son las bandas 1 a 6.
  const bandas = [0, -50, -50, -50, -50, -50, -50, -50, -50, -50];

  assert.strictEqual(m(bandas, 21.5, 20, 120), -50, "la banda continua se colo en la media");
});

test("las bandas sin valor no arrastran la media hacia abajo", () => {
  /*
   * getFloatFrequencyData devuelve -Infinity en las bandas sin senal.
   * Promediarlas daria -Infinity para todo el grupo, y una sola banda muda
   * apagaria el pulso de la cancion entera.
   */
  const m = ventana().Espectro.mediaDb;
  const bandas = [0, -40, -Infinity, -60, NaN, -50, -Infinity, 0];

  assert.strictEqual(m(bandas, 21.5, 20, 120), -50, "una banda muda contamino la media");
});

test("sin ninguna banda util la respuesta es -Infinity, que es lo que significa silencio", () => {
  /*
   * Y NO cero. Cero decibelios es el maximo, no la ausencia: devolverlo
   * seria decir "esto suena a tope" cada vez que no se puede medir.
   */
  const m = ventana().Espectro.mediaDb;

  assert.strictEqual(m([0, -Infinity, -Infinity, -Infinity], 21.5, 20, 120), -Infinity);
  assert.strictEqual(m([], 21.5, 20, 120), -Infinity, "sin bandas no hay media");
  assert.strictEqual(m(null, 21.5, 20, 120), -Infinity);
  assert.strictEqual(m([0, -50, -50], 0, 20, 120), -Infinity, "sin hercios por banda no se sabe donde mirar");
});

test("la banda de graves no se sale del array por mucho que se pida", () => {
  /*
   * Con pocas bandas, 120 Hz cae mas alla del final. Leer fuera daria
   * undefined, que no es finito, y la media saldria de menos elementos de
   * los que dice: mejor recortar y decir la verdad.
   */
  const m = ventana().Espectro.mediaDb;

  assert.strictEqual(m([0, -30, -30], 21.5, 20, 120), -30, "se leyeron bandas que no existen");
});

/* ------------------------------------------------------------------
 * alfaPara: por que la referencia no depende de los fotogramas
 * ------------------------------------------------------------------ */

test("la adaptacion se mide en milisegundos reales, no en fotogramas", () => {
  const a = ventana().Espectro.alfaPara;

  assert.ok(Math.abs(a(8, 1500) * 2 - a(16, 1500)) < 1e-12, "el doble de tiempo no adapta el doble");
  assert.strictEqual(a(750, 1500), 0.5, "la mitad del tiempo tiene que adaptar la mitad");
});

test("un paron largo no inventa un golpe: la referencia salta al presente", () => {
  /*
   * Sin el tope en 1, una pausa de diez segundos daria un alfa de 6,6 y la
   * referencia se pasaria de largo hasta el otro lado del nivel actual. La
   * primera nota despues de volver saldria disparada.
   */
  const a = ventana().Espectro.alfaPara;

  assert.strictEqual(a(10000, 1500), 1);
  assert.strictEqual(a(1500, 1500), 1);
  assert.strictEqual(a(0, 1500), 1, "sin tiempo medido no hay pasado que conservar");
  assert.strictEqual(a(-5, 1500), 1);
  assert.strictEqual(a(16, 0), 1, "sin tiempo de adaptacion no hay nada que perseguir");
});

/* ------------------------------------------------------------------
 * fuerzaDeGolpe: cuanto de golpe es esto
 * ------------------------------------------------------------------ */

test("un golpe es estar POR ENCIMA de la referencia, y GOLPE_DB por encima es uno entero", () => {
  const e = ventana().Espectro;
  const f = e.fuerzaDeGolpe;

  assert.strictEqual(f(-60, -60, 9), 0, "estar donde siempre no es un golpe");
  assert.strictEqual(f(-51, -60, 9), 1);
  assert.strictEqual(f(-55.5, -60, 9), 0.5);
  assert.strictEqual(f(-30, -60, 9), 1, "el golpe se desborda y la caratula pegaria un salto");
  assert.strictEqual(f(-70, -60, 9), 0, "por debajo de la referencia no hay golpe negativo");
});

test("lo que no es un numero no es un golpe", () => {
  const f = ventana().Espectro.fuerzaDeGolpe;

  assert.strictEqual(f(-Infinity, -60, 9), 0, "el silencio no puede ser un golpe");
  assert.strictEqual(f(-51, null, 9), 0, "sin referencia no hay con que comparar");
  assert.strictEqual(f(NaN, -60, 9), 0);
  assert.strictEqual(f(-51, -60, 0), 0, "sin margen, cualquier ruido seria un golpe entero");
});

/* ------------------------------------------------------------------
 * La referencia movil: leerPulso sobre el analizador montado
 *
 * Aqui esta la idea entera. "Los graves estan a -32 dB" no dice nada; hay
 * canciones enteras a -32 dB. Un golpe es estar por encima de donde se
 * llevaba estando.
 * ------------------------------------------------------------------ */

test("sin analizador montado la respuesta es null, que no es cero", () => {
  /*
   * Cero significaria "no hay graves" y encogeria la caratula. null
   * significa "no se sabe", y quien pinta la deja como estaba.
   */
  const v = ventana();

  assert.strictEqual(v.Espectro.leerPulso(0), null);
});

test("la primera lectura no late: no hay pasado con el que comparar", () => {
  /*
   * Es la diferencia entre arrancar la cancion y arrancar la cancion con un
   * salto de la portada que nadie ha oido.
   */
  const v = conPulso();

  assert.strictEqual(leer(v, T0, -60), 0);
});

test("EL CASO PEDIDO: los graves suben sobre su propia referencia y la caratula late", () => {
  const v = conPulso();

  leer(v, T0, -60); // se fija la referencia
  assert.strictEqual(leer(v, T0 + 16, -51), 1, "un bombo de 9 dB sobre lo de siempre no movio la portada");
});

test("un hueco que no es tiempo aplica la caida entera, y no la resta al reves", () => {
  /*
   * requestAnimationFrame no deberia retroceder, pero el pulso se reengancha
   * a un analizador nuevo en cada cancion y el reloj de la ventana flotante
   * no es el de la pagina. Sin la pregunta "¿de verdad ha pasado tiempo?",
   * un dt negativo se RESTA de una resta: el pulso sube solo, se sale de la
   * escala y la portada se queda inflada sin un solo grave que lo justifique.
   *
   * Se miran los dos caminos porque son dos lineas distintas y cada una se
   * puede romper sin la otra: el de la musica y el del silencio.
   */
  const conMusica = conPulso();
  leer(conMusica, T0, -60);
  leer(conMusica, T0 + 16, -51);
  const atras = leer(conMusica, T0 - 1000, -90);

  assert.ok(atras >= 0 && atras <= 1, `el pulso se salio de la escala: ${atras}`);
  // Sin tiempo que medir se aplica la caida ENTERA, el mismo criterio que
  // usa alfaPara para la referencia: no saber cuanto ha pasado se resuelve
  // hacia el presente, nunca inventando un golpe.
  assert.strictEqual(atras, 0);

  const enSilencio = conPulso();
  leer(enSilencio, T0, -60);
  assert.strictEqual(leer(enSilencio, T0 + 16, -51), 1, "premisa: hay un golpe entero");
  // El MISMO instante otra vez: cero tiempo transcurrido.
  assert.strictEqual(leer(enSilencio, T0 + 16, -Infinity), 0);
});

test("una cancion masterizada bajita late igual que una alta", () => {
  /*
   * La razon de que la referencia sea movil y no un umbral fijo. Con un
   * umbral absoluto, media discografia no latiria nunca y la otra media
   * estaria latiendo siempre.
   */
  const bajita = conPulso();
  leer(bajita, T0, -80);
  const golpeBajito = leer(bajita, T0 + 16, -71);

  const alta = conPulso();
  leer(alta, T0, -40);
  const golpeAlto = leer(alta, T0 + 16, -31);

  assert.strictEqual(golpeBajito, 1);
  assert.strictEqual(golpeAlto, golpeBajito, "el mismo golpe relativo dio resultados distintos");
});

test("el golpe se mide contra la referencia ANTERIOR, no contra una ya movida por el mismo golpe", () => {
  /*
   * Si la referencia se adaptara antes de comparar, el golpe se estaria
   * midiendo en parte contra si mismo y saldria siempre mas flojo de lo que
   * fue.
   *
   * Se mira con un hueco de MS_ADAPTACION entero porque ahi el alfa vale 1 y
   * los dos ordenes dan respuestas que no se parecen: comparando primero sale
   * medio golpe; adaptando primero, la referencia se planta encima del nivel
   * y el golpe desaparece del todo. Con un hueco de un fotograma la
   * diferencia son milesimas y la prueba no distinguiria nada.
   */
  const v = conPulso();

  leer(v, T0, -60);
  assert.strictEqual(leer(v, T0 + 1500, -55.5), 0.5, "la referencia se movio antes de comparar");
});

test("el silencio NO arrastra la referencia hacia abajo", () => {
  /*
   * El fallo que esto impide: durante una pausa la referencia bajaria hasta
   * el suelo, y la primera nota al volver seria un golpe maximo que nadie
   * ha oido. Pasa en cada cambio de cancion.
   */
  const v = conPulso();

  leer(v, T0, -60);
  leer(v, T0 + 500, -Infinity);
  leer(v, T0 + 1000, -Infinity);
  leer(v, T0 + 1500, -Infinity);

  assert.strictEqual(leer(v, T0 + 2000, -60), 0, "la referencia se fue con el silencio y volvio dando un salto");
});

test("el pulso cae en MS_CAIDA, no de golpe", () => {
  /*
   * Bajar de golpe daria un parpadeo, no un latido: la portada volveria a su
   * tamano en el fotograma siguiente al bombo.
   */
  const v = conPulso();
  const caida = v.Espectro.MS_CAIDA;

  leer(v, T0, -60);
  assert.strictEqual(leer(v, T0 + 16, -51), 1, "premisa: hay un golpe entero");

  // Por debajo de la referencia: no hay golpe nuevo, solo caida.
  assert.strictEqual(leer(v, T0 + 16 + caida / 2, -90), 0.5);
  assert.strictEqual(leer(v, T0 + 16 + caida, -90), 0);
});

test("durante el silencio el pulso tambien cae en vez de quedarse clavado", () => {
  const v = conPulso();
  const caida = v.Espectro.MS_CAIDA;

  leer(v, T0, -60);
  leer(v, T0 + 16, -51);

  assert.strictEqual(leer(v, T0 + 16 + caida / 2, -Infinity), 0.5);
  assert.strictEqual(leer(v, T0 + 16 + caida, -Infinity), 0);
});

test("subir es inmediato: un golpe no espera a la caida del anterior", () => {
  const v = conPulso();

  leer(v, T0, -60);
  leer(v, T0 + 16, -51); // golpe entero
  leer(v, T0 + 100, -90); // cayendo
  assert.ok(leer(v, T0 + 120, -90) < 1, "premisa: venia bajando");

  assert.strictEqual(leer(v, T0 + 140, -51), 1, "el golpe llego tarde por esperar a la caida");
});

test("una pantalla de 120 Hz no adapta al doble de velocidad que una de 60", () => {
  /*
   * La misma musica durante el mismo tiempo tiene que dar el mismo pulso,
   * pinte quien pinte. Se mide con la referencia persiguiendo un nivel nuevo
   * durante MS_ADAPTACION, repartido en fotogramas de 25 y de 50 ms.
   *
   * No salen identicos y no pueden salirlo: la persecucion se aplica una vez
   * por fotograma, asi que el numero de pasos deja un residuo. Lo que se
   * exige es que ese residuo sea despreciable. Si alfaPara ignorase el
   * tiempo y usara un paso fijo, los dos relojes se separarian por encima
   * de medio golpe.
   */
  function correr(paso) {
    const v = conPulso();
    leer(v, T0, -80); // referencia inicial
    let ms = T0;
    while (ms - T0 < v.Espectro.MS_ADAPTACION) {
      ms += paso;
      leer(v, ms, -60);
    }
    return leer(v, ms + paso, -60);
  }

  const a = correr(25);
  const b = correr(50);

  assert.ok(Math.abs(a - b) < 0.05, `el pulso depende del reloj de la pantalla: ${a} contra ${b}`);
});

test("desconectar tira la referencia: la cancion siguiente no hereda la anterior", () => {
  /*
   * La referencia vive en el modulo, no en el analizador, asi que sobrevive
   * a desconectar si no se borra a mano. Una cancion tranquila detras de una
   * ruidosa empezaria con el pulso clavado abajo durante segundo y medio, y
   * al reves clavado arriba.
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarPulso();

  leer(v, T0, -80);
  assert.strictEqual(leer(v, T0 + 16, -80), 0, "premisa: la referencia esta en -80");

  v.Espectro.desconectar();
  v.Espectro.conectar(video);

  // 40 dB por encima de la referencia vieja. Si la hubiera heredado, esto
  // seria un golpe entero en vez de la primera lectura de una cancion.
  assert.strictEqual(leer(v, T0 + 5000, -40), 0, "la cancion nueva empezo comparandose con la anterior");
});

/* ------------------------------------------------------------------
 * El boton: cuando se ofrece y que dice
 * ------------------------------------------------------------------ */

test("sin audio que se pueda capturar el boton ni se ofrece", () => {
  /*
   * Por lo MISMO que el espectro y no por parecido: con una pista cifrada no
   * hay nada que medir, y una caratula que no se mueve pareceria rota.
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  video.mediaKeys = {};

  v.boton.hidden = false; // sin esto la prueba pasaria sola
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, true);
});

test("con audio medible el boton aparece y anuncia lo que hace", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.boton.title, "Pulso con los graves");
});

test("EL BOTON NO PROMETE UNA CARATULA, porque tambien hace latir el video", () => {
  /*
   * Decia "Pulso de la carátula" y era verdad mientras el efecto se apagaba
   * en modo video. Al dejar de apagarse, esa etiqueta pasaba a anunciar una
   * portada mientras hacia latir un videoclip.
   *
   * Se comprueban los DOS textos —el title y el aria-label— y en los dos
   * estados, porque son cuatro cadenas escritas a mano en pip.js y basta con
   * olvidarse de una. Y se comprueba tambien la del HTML, que es la que se
   * ve antes del primer render: ahi vivio la version vieja mucho despues de
   * arreglarse la de JavaScript en un caso parecido.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  const dice = () => v.boton.title + " · " + v.boton.getAttribute("aria-label");

  assert.doesNotMatch(dice(), /carátula/i, `el boton apagado promete portada: ${dice()}`);
  v.banco.pulsarPulso();
  assert.doesNotMatch(dice(), /carátula/i, `el boton encendido promete portada: ${dice()}`);

  const html = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");
  const enBruto = html.match(/<button id="ytmpip-pulse-toggle"[^>]*>/)[0];
  assert.doesNotMatch(enBruto, /carátula/i, "el HTML se quedo con la etiqueta vieja");
});

test("pulsar lo enciende y el boton lo cuenta", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.banco.pulsarPulso();

  assert.strictEqual(v.banco.pidePulso(), true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.boton.title, "Quitar el pulso");
  assert.strictEqual(v.contextos.length, 1, "no se monto ningun analizador");
});

/* ------------------------------------------------------------------
 * Dos efectos, un analizador
 *
 * Comparten la conexion por debajo y NO comparten interruptor. Un
 * interruptor que enciende dos cosas no se puede apagar a medias.
 * ------------------------------------------------------------------ */

test("el pulso no enciende el espectro ni el espectro enciende el pulso", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.banco.pulsarPulso();
  assert.strictEqual(v.lienzo.hidden, true, "aparecieron barras que nadie pidio");
  assert.strictEqual(v.banco.pideEspectro(), false);

  v.banco.pulsarPulso();
  v.banco.pulsarEspectro();
  assert.strictEqual(v.lienzo.hidden, false, "premisa: el espectro si se enciende solo");
  assert.strictEqual(v.banco.pidePulso(), false, "el espectro encendio tambien el pulso");
});

test("los dos a la vez comparten UN analizador, no montan dos", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.banco.pulsarEspectro();
  v.banco.pulsarPulso();

  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} AudioContext para el mismo audio`);
});

test("apagar uno NO suelta el analizador si el otro sigue encendido", () => {
  /*
   * El fallo que esto impide: quitar las barras dejaria la caratula quieta
   * aunque su boton siguiera encendido, porque desconectar es global.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.banco.pulsarEspectro();
  v.banco.pulsarPulso();
  v.banco.pulsarEspectro(); // se apagan las barras, el pulso sigue

  assert.strictEqual(v.contextos[0].state, "running", "se solto el analizador con el pulso todavia pedido");
  assert.strictEqual(v.banco.pulsaAhora(), true);
});

test("cuando ya no lo quiere ninguno, el analizador se suelta", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.banco.pulsarEspectro();
  v.banco.pulsarPulso();
  v.banco.pulsarEspectro();
  v.banco.pulsarPulso();

  assert.strictEqual(v.contextos[0].state, "closed", "el analizador se queda midiendo para nadie");
});

/* ------------------------------------------------------------------
 * Que hay en el escenario, y cuando no hay nada
 *
 * `pulsoPedido` es lo que el usuario quiere; `pulsoActivo` es lo que de
 * verdad esta pasando. Que sean dos variables es lo que permite apagar el
 * efecto sin apagar el boton.
 *
 * Queda UN solo motivo para apagarlo: la letra en grande, que no deja
 * escenario a la vista. El video ya no es motivo —era el bug— y de eso van
 * las dos primeras.
 * ------------------------------------------------------------------ */

test("EL CASO PEDIDO: con video el pulso NO se apaga, late el video", () => {
  /*
   * Aqui ponia lo contrario, y la prueba pasaba: "en modo video no hay
   * portada que late". Era verdad a medias. Cierto que la portada esta
   * escondida detras del video; falso que no quede nada que hacer latir.
   *
   * La linea que lo decidia (`&& !videoMode`) no se ha sustituido por otra
   * condicion: se ha quitado. Quien decide QUE crece es pip.css, que escala
   * tanto la portada como el hueco del video. Por eso esta prueba mira
   * `pulsaAhora()` —"se esta midiendo"— y no un tamaño: el tamaño no vive en
   * JavaScript y jsdom no maqueta.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarPulso();
  assert.strictEqual(v.banco.pulsaAhora(), true, "premisa: late sobre la portada");

  v.PipView.onStateUpdate(conVideo());

  assert.strictEqual(v.banco.pulsaAhora(), true, "el video llego y el pulso se apago");
  assert.strictEqual(v.banco.pidePulso(), true, "se perdio la peticion del usuario");
});

test("y al volver a una cancion sin video sigue latiendo, sin volver a pulsar", () => {
  /*
   * El camino de vuelta es una linea distinta de la de ida y se puede romper
   * sola. Ademas es el sintoma que este proyecto ya se ha comido tres veces:
   * un efecto que hay que volver a encender a mano en la cancion siguiente.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(conVideo());
  v.banco.pulsarPulso();
  assert.strictEqual(v.banco.pulsaAhora(), true, "premisa: late sobre el video");

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.banco.pulsaAhora(), true, "al volver la portada el pulso se quedo por el camino");
});

test("EL DIBUJO DEL VIDEO TAMBIEN CRECE: la hoja escala el hueco, no solo la portada", () => {
  /*
   * Sin esto, todo lo de arriba puede estar en verde con el efecto
   * INVISIBLE en modo video: se mide, se publica el numero en la variable
   * CSS, y no hay ninguna regla que lo lea para el video. Esa es exactamente
   * la forma en que un efecto "funciona" y no se ve.
   *
   * Se lee la HOJA porque jsdom no maqueta: no puede decirse cuanto crece,
   * pero si que la regla existe y que las dos cosas del escenario estan
   * dentro. Es la misma clase de prueba que la de las barritas del
   * ecualizador, y tiene la misma limitacion escrita: comprueba que la
   * decision este tomada, no que se vea bien.
   *
   * `--ytmpip-pulse-strength` es lo unico que se permite distinto entre las
   * dos: la CURVA tiene que ser una sola. Si alguien copia el `calc` a un
   * segundo sitio, esto sigue en verde —no lo detecta— pero al menos el
   * comentario de pip.css dice por que no se hace.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");

  const regla = hoja.match(/\.ytmpip-artwork,\s*\n\s*\.ytmpip-video-slot\s*\{([^}]*)\}/);
  assert.ok(regla, "la portada y el hueco del video ya no comparten la regla del pulso");
  assert.match(regla[1], /transform:\s*scale\(/, "la regla compartida no escala nada");
  assert.match(regla[1], /var\(--ytmpip-pulse/, "la regla compartida no lee el numero del analizador");

  /*
   * ---------- ESTA COMPROBACION MIRABA LA REGLA DE ARRIBA ----------
   *
   * Aqui ponia esto, y estaba mal:
   *
   *   assert.match(hoja, /\.ytmpip-video-slot\s*\{\s*--ytmpip-pulse-strength:/)
   *
   * Parece que busca la regla PROPIA del video. Encajaba con la COMPARTIDA:
   * el selector de arriba termina justamente en `.ytmpip-video-slot {` y lo
   * primero que lleva dentro es `--ytmpip-pulse-strength: 0.1`. O sea que se
   * cumplia sola con la regla que ya estaba comprobada tres lineas antes, y
   * borrar entera la fuerza propia del video la dejaba en verde.
   *
   * No lo vio ninguna lectura: lo enseño la mutacion "el video se queda sin
   * su propia fuerza y crece como la portada" de tools/mutar-pulso.js, al
   * sobrevivir. Es el caso de manual de para que sirve mutar.
   *
   * Lo de ahora parte la hoja en reglas y busca una cuyo selector sea
   * EXACTAMENTE `.ytmpip-video-slot`, sin comas, que es lo unico que
   * distingue la regla propia de la compartida.
   */
  const sinComentarios = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    cuerpo: m[2]
  }));
  const propia = reglas.find(
    (r) => r.selector === ".ytmpip-video-slot" && /--ytmpip-pulse-strength:/.test(r.cuerpo)
  );

  assert.ok(propia, "el video late lo mismo que la portada; se decidio que latiera menos");

  /*
   * Y late MENOS, que es la decision entera. No se comprueba el 0,06: ese
   * numero es un juicio —lo dice el comentario de pip.css— y clavarlo aqui
   * convertiria esta prueba en un vigilante de constantes al que hay que
   * venir a tocar cada vez que se afina el efecto a ojo. Lo que no puede
   * cambiar sin que se entere nadie es el SENTIDO: la portada va recortada y
   * el video entero, asi que el mismo porcentaje se come cara y subtitulos.
   */
  const fuerza = (cuerpo) => Number(cuerpo.match(/--ytmpip-pulse-strength:\s*([\d.]+)/)[1]);

  assert.ok(
    fuerza(propia.cuerpo) < fuerza(regla[1]),
    `el video crece igual o mas que la portada (${fuerza(propia.cuerpo)} contra ${fuerza(regla[1])})`
  );
});

test("quien pide menos movimiento tampoco quiere el video latiendo", () => {
  /*
   * Dejar el video fuera de `prefers-reduced-motion` convertiria la
   * preferencia en "menos movimiento salvo en los videoclips", que es justo
   * donde mas se nota. Se rompe con un descuido de una linea: al añadir el
   * video a la regla de arriba y olvidarse de esta.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const bloque = hoja.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);

  assert.ok(bloque, "no queda ninguna regla de movimiento reducido");
  assert.match(bloque[1], /\.ytmpip-artwork/, "la portada se quedo fuera");
  assert.match(bloque[1], /\.ytmpip-video-slot/, "el video sigue latiendo con el movimiento reducido");
  assert.match(bloque[1], /--ytmpip-pulse-strength:\s*0/, "se anula algo que no es el pulso");
});

test("con la letra en grande el pulso se para, y vuelve solo al salir", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(conLetra());
  v.banco.pulsarPulso();
  assert.strictEqual(v.banco.pulsaAhora(), true, "premisa");

  v.banco.pulsarAlternarVideo(); // la letra ocupa el escenario
  assert.strictEqual(v.banco.pulsaAhora(), false, "se late debajo de un escenario que no se ve");
  assert.strictEqual(v.banco.pidePulso(), true);

  v.banco.pulsarAlternarVideo(); // vuelve la portada
  assert.strictEqual(v.banco.pulsaAhora(), true, "al volver la portada el pulso no volvio solo");
});

/* ------------------------------------------------------------------
 * EL CABLE: del analizador a la variable CSS
 *
 * La medicion puede ser perfecta y la caratula no moverse. Lo unico que las
 * une es una variable CSS escrita en la raiz.
 * ------------------------------------------------------------------ */

test("EL CABLE: el fotograma lleva el golpe hasta la variable CSS", () => {
  const v = conPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0); // fija la referencia
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "0.000");

  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000");
});

test("AQUI NO HAY NINGUN TAMANO: lo que se publica es un 0..1, no pixeles", () => {
  /*
   * Cuanto crece la portada lo decide pip.css. Si este archivo escribiera un
   * scale(), el mismo efecto viviria repartido entre dos sitios y
   * prefers-reduced-motion dejaria de poder apagarlo el solo.
   */
  const v = conPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -55.5;
  v.banco.unFotograma(T0 + 16);

  const valor = v.raiz.style.getPropertyValue("--ytmpip-pulse");
  assert.strictEqual(valor, "0.500");
  assert.strictEqual(v.raiz.style.getPropertyValue("transform"), "", "el tamano se decidio en JavaScript");
});

test("un golpe fuera de escala se recorta antes de llegar al CSS", () => {
  /*
   * leerPulso ya devuelve entre 0 y 1, asi que esto es una red por debajo de
   * otra. Se queda porque quien publica es el ultimo que puede evitar que el
   * CSS reciba una barbaridad: un scale(6) no es un latido fuerte, es la
   * portada tapando la ventana entera y sin forma de volver.
   */
  const v = conPulso();

  v.Espectro.leerPulso = () => 5;
  v.banco.unFotograma(T0);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000");

  v.Espectro.leerPulso = () => -3;
  v.banco.unFotograma(T0 + 16);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "0.000");
});

test("encender el pulso pide el primer fotograma", () => {
  /*
   * Sin esto el efecto queda montado, medido y muerto: `pulsoActivo` en true,
   * el analizador conectado y nadie animando. La cadena de fotogramas la
   * arrancaba solo el espectro, asi que el pulso funcionaba unicamente si
   * ademas habia barras encendidas.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  v.fotogramas.length = 0;
  v.banco.pulsarPulso();

  assert.strictEqual(v.fotogramas.length, 1, "se encendio el pulso sin que nadie pidiera animar");
});

test("el fotograma se vuelve a pedir mientras haya algo que animar", () => {
  const v = conPulso();

  v.fotogramas.length = 0;
  v.banco.unFotograma(T0);

  assert.strictEqual(v.fotogramas.length, 1, "la animacion se corto sola con el pulso encendido");
});

test("REGRESION: apagar el pulso con el espectro puesto devuelve la caratula a su tamano", () => {
  /*
   * El fallo concreto: la variable solo se limpiaba al parar la animacion, y
   * la animacion sigue viva mientras queden barras que pintar. Apagar el
   * pulso a mitad de un golpe dejaba la portada un 4 % mas grande PARA
   * SIEMPRE, sin nada que la devolviera.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  v.banco.pulsarPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "premisa: la portada esta crecida");

  v.banco.pulsarPulso();

  assert.strictEqual(v.lienzo.hidden, false, "premisa: el espectro sigue encendido");
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "0.000", "la caratula se quedo grande");
});

test("irse a modo video NO pone el pulso a cero: el video sigue latiendo", () => {
  /*
   * Esta prueba decia lo contrario y era correcta entonces: con el pulso
   * apagado en modo video habia que devolver la portada a su tamaño o se
   * quedaba congelada crecida detras del video.
   *
   * Ahora el que manda a cero es el enemigo. Si alguien devuelve el
   * `&& !videoMode` a `pulsoActivo`, lo que se vera no es un video quieto:
   * sera un video que late hasta que empieza el videoclip y ahi se planta,
   * porque `if (!pulsoActivo) ponerPulso(0)` le clavaria el tamaño base. Un
   * efecto que se apaga al llegar justo el contenido para el que se pidio.
   *
   * El caso que SI hay que seguir protegiendo —apagar a mitad de un golpe
   * con el bucle todavia vivo— lo cubre la prueba de aqui arriba, la de
   * apagar el pulso con el espectro puesto. Ahi sigue habiendo un
   * `pulsoActivo` en false con la animacion corriendo; aqui ya no.
   */
  const v = conPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "premisa");

  v.PipView.onStateUpdate(conVideo());

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "el video llego y se planto el pulso");
});

test("REGRESION: la letra en grande SI deja la imagen en su sitio", () => {
  /*
   * El otro sitio donde el pulso se apaga solo. Con la letra ocupando el
   * escenario no hay ni portada ni video a la vista, y la variable se
   * quedaria con el ultimo golpe escrito: al salir de la letra, la imagen
   * volveria crecida y quieta sin un solo grave que lo justifique.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(conLetra());
  v.banco.pulsarPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "premisa");

  v.banco.pulsarAlternarVideo(); // la letra pasa al escenario

  assert.strictEqual(v.banco.pulsaAhora(), false, "premisa: el pulso se para con la letra en grande");
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "0.000");
});

test("un golpe que no se puede leer deja la caratula como estaba, no la encoge", () => {
  /*
   * leerPulso devuelve null cuando no hay analizador. Tratarlo como cero
   * seria afirmar que no hay graves, y la portada daria un tiron hacia
   * dentro cada vez que el analizador se esta remontando.
   */
  const v = conPulso();

  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "premisa");

  v.Espectro.leerPulso = () => null;
  v.banco.unFotograma(T0 + 32);

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "se encogio por no saber");
});

/* ------------------------------------------------------------------
 * El icono
 * ------------------------------------------------------------------ */

test("el boton tiene icono propio y no se queda con el emoji de respaldo", () => {
  /*
   * El emoji del HTML es lo que se ve si el dibujo no existe. Que se vea el
   * corazon significa que TRAZOS no tiene la entrada, no que el boton este
   * roto: falla en silencio y solo se nota mirando.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.dataset.ico, "pulso");
  assert.ok(v.win.YTMPip.Iconos.NOMBRES.includes("pulso"), "no hay dibujo para el pulso");
  assert.ok(v.boton.querySelector("svg"), "el boton se quedo con el emoji");
});
