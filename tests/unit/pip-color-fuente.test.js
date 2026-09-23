/*
 * Pruebas del cuarto modo de color del espectro: EL QUE SALE DEL VIDEO O DE
 * LA CARATULA (src/shared/color-fuente.js y su cable en src/pip/pip.js).
 *
 * ------------------------------------------------------------------
 * LO QUE ESTAS PRUEBAS NO DICEN
 * ------------------------------------------------------------------
 *
 * No dicen que el color que sale se PAREZCA a la portada. Eso no se puede
 * comprobar aqui y conviene decirlo antes de que alguien lea el archivo como
 * una garantia: jsdom no pinta, asi que `getImageData` devolveria ceros y un
 * `<video>` de jsdom no tiene fotogramas. Las imagenes de estas pruebas son
 * arrays de numeros escritos a mano.
 *
 * Lo que si se puede clavar es la REGLA —de estos pixeles sale este color— y
 * el CABLE —que ese color llegue al `fillStyle` y se olvide al apagar—. Que
 * el resultado sea bonito es cosa de mirar la ventana, y para eso estan
 * tools/diagnostico-color-video.js y tools/diagnostico-color-portada.js, que
 * son los que dieron todos los numeros que se comprueban aqui abajo.
 *
 * ------------------------------------------------------------------
 * LAS MEDIDAS DE VERDAD, que es de donde salen los casos
 * ------------------------------------------------------------------
 *
 *   video       hsl(355, 70%, 49%)   4,467 ms por lectura; 4 grados de
 *                                    salto medio de tono, 13 el maximo
 *   carátula 1  hsl( 62, 37%, 24%)   6 de 256 pixeles con color (2 %)
 *   carátula 2  hsl(  8, 49%, 30%)   121 de 256 (25 %)
 *
 * La carátula 1 es la que obliga a que exista MIN_SHARE, y las dos carátulas
 * juntas son las que obligan a normalizar la luz.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

/* ==================================================================
 * 1. La regla: de unos pixeles sale un color
 * ================================================================== */

function modulo() {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/paleta.js", "src/shared/color-fuente.js");
  return win.YTMPip;
}

/**
 * Una imagen de 16x16 hecha a mano: una lista de `[cuantos, [r,g,b]]` y el
 * resto en negro hasta completar los 256 pixeles.
 *
 * Se rellena con NEGRO y no con transparente porque el negro es lo que de
 * verdad hay en las portadas medidas —el 98 % de la carátula 1 era oscuro— y
 * porque el negro y lo transparente se descartan por motivos distintos: uno
 * por LIGHT_FLOOR y otro por el alfa. Mezclarlos aqui haria que una prueba
 * pasara por el motivo equivocado.
 */
function imagen(tramos) {
  const datos = [];
  for (const [cuantos, rgb] of tramos) {
    for (let i = 0; i < cuantos; i++) datos.push(rgb[0], rgb[1], rgb[2], 255);
  }
  while (datos.length < 256 * 4) datos.push(0, 0, 0, 255);
  return { data: datos, width: 16, height: 16 };
}

test("el color que MANDA no es el color MEDIO", () => {
  /*
   * Esta es la razon de ser del recuento por franjas, y el fallo que evita es
   * de los que se ven bonitos: promediar media imagen roja y media verde da
   * un caqui que no esta en ninguna de las dos mitades. Cuanto mas colorida
   * la portada, mas pardo el promedio.
   *
   * Se comprueba que el ganador es UNO DE LOS DOS y no algo de en medio.
   */
  const { ColorFuente } = modulo();
  const mitadYmitad = ColorFuente.colorDominante(
    imagen([
      [128, [220, 30, 30]],
      [128, [30, 220, 30]]
    ])
  );

  assert.ok(mitadYmitad, "premisa: con 256 pixeles de color tiene que salir alguno");
  const tono = Math.round(mitadYmitad.h);
  assert.ok(
    tono < 15 || (tono > 105 && tono < 135),
    `salio un tono de ${tono}: ni rojo ni verde, o sea el barrizal del promedio`
  );
});

test("la cuota se mide sobre la imagen ENTERA, no sobre los que votan", () => {
  /*
   * EL CASO REAL, y el unico numero de este archivo que ya engaño una vez.
   * El diagnostico dijo de la carátula 1 que el ganador "mandaba sobre el
   * 100 %", y era el 100 % de 6 pixeles: los otros 250 eran demasiado
   * oscuros para votar. Sobre la imagen es el 2 %.
   *
   * Si algun dia `cuota` volviera a dividirse entre los votantes, esto
   * saldria 1 y el espectro se pintaria con el ruido de una portada negra.
   */
  const { ColorFuente } = modulo();
  const comoLaCaratula1 = imagen([[6, [180, 170, 40]]]);

  const hallazgo = ColorFuente.colorDominante(comoLaCaratula1);
  assert.ok(hallazgo, "premisa: seis pixeles con color si son un color dominante");
  assert.ok(
    Math.abs(hallazgo.cuota - 6 / 256) < 1e-9,
    `la cuota salio ${hallazgo.cuota} en vez de 6/256; se esta dividiendo entre los votantes`
  );

  // Y la consecuencia: por debajo del minimo NO se entrega color.
  assert.strictEqual(
    ColorFuente.deImagen(comoLaCaratula1),
    null,
    "un color que representa al 2 % de la imagen no es el color de esa imagen"
  );
});

test("por encima del minimo SI se entrega color", () => {
  /*
   * La pareja de la anterior, y hace falta: un `deImagen` que devolviera
   * `null` siempre pasaria la prueba de arriba con nota. Es la carátula 2,
   * la que si tenia color (121 de 256).
   */
  const { ColorFuente } = modulo();
  const color = ColorFuente.deImagen(imagen([[121, [180, 90, 60]]]));

  assert.ok(color, "121 de 256 pixeles es una cuarta parte de la imagen: eso es un color");
});

test("un gris no vota al rojo", () => {
  /*
   * Un gris no tiene tono, y `rgbAHsl` le pone 0 por convenio, que resulta
   * ser el rojo (esta contado en su comentario, en paleta.js). Sin el filtro
   * de saturacion, una portada en blanco y negro entregaria un rojo perfecto
   * con toda la apariencia de ser el color de la imagen.
   *
   * Lo correcto es no dar ninguno: una imagen sin color no tiene un color que
   * mande, y decir que si lo tiene es inventarselo.
   */
  const { ColorFuente } = modulo();

  assert.strictEqual(ColorFuente.deImagen(imagen([[256, [128, 128, 128]]])), null, "gris medio");
  assert.strictEqual(ColorFuente.deImagen(imagen([[256, [250, 250, 250]]])), null, "casi blanco");
  assert.strictEqual(ColorFuente.deImagen(imagen([[256, [4, 4, 4]]])), null, "casi negro");
});

test("una imagen vacia no revienta ni se inventa un color", () => {
  const { ColorFuente } = modulo();

  assert.strictEqual(ColorFuente.colorDominante(null), null);
  assert.strictEqual(ColorFuente.colorDominante({ data: [], width: 0, height: 0 }), null);
});

test("se conserva el TONO y se normaliza la LUZ", () => {
  /*
   * Las tres medidas de verdad, pasadas por la normalizacion. Es la decision
   * que el usuario aprobo con "normaliza la luz", y tiene dos mitades que hay
   * que vigilar por separado:
   *
   *  - EL TONO NO SE TOCA. Es lo que una persona reconoce como "el color de
   *    esa portada"; moverlo seria pintar de otro color.
   *  - LA LUZ SI. Las dos carátulas venian al 24 % y al 30 %, que sobre el
   *    fondo negro de la ventana es un espectro fiel e invisible.
   */
  const { ColorFuente, Paleta } = modulo();

  const caratula1 = ColorFuente.normalizarLuz({ h: 62, s: 0.37, l: 0.24 });
  const caratula2 = ColorFuente.normalizarLuz({ h: 8, s: 0.49, l: 0.3 });
  const video = ColorFuente.normalizarLuz({ h: 355, s: 0.7, l: 0.49 });

  assert.strictEqual(caratula1.h, 62, "el tono de la carátula 1 se movio");
  assert.strictEqual(caratula2.h, 8, "el tono de la carátula 2 se movio");
  assert.strictEqual(video.h, 355, "el tono del video se movio");

  assert.ok(caratula1.l > 0.4, `la carátula 1 se quedo al ${caratula1.l}: sigue sin verse`);
  assert.ok(caratula2.l > 0.4, `la carátula 2 se quedo al ${caratula2.l}: sigue sin verse`);

  /*
   * El video YA venia bien y por eso no se le toca nada. Es la mitad que se
   * pierde facil: una normalizacion que empujara TODO a la banda daria el
   * mismo 45 % para las tres, y entonces la luz dejaria de ser informacion.
   */
  assert.strictEqual(video.l, 0.49, "al video, que ya estaba bien, se le movio la luz");
  assert.strictEqual(video.s, 0.7, "al video, que ya estaba saturado, se le movio la saturacion");

  // Y que salga algo que un fillStyle acepte, que es a lo que va todo esto.
  assert.strictEqual(Paleta.hslACss(caratula1), "hsl(62, 50%, 45%)");
});

test("el suavizado NO depende de los fotogramas por segundo", () => {
  /*
   * La razon de que `pasoDeSuavizado` sea una exponencial del tiempo real y
   * no una fraccion fija por fotograma. Con la fraccion fija, una pantalla de
   * 120 Hz suavizaria el doble de rapido que una de 60 con el mismo codigo, y
   * nadie lo notaria salvo quien tuviera las dos delante.
   *
   * Se comprueba la propiedad que lo garantiza: recorrer 220 ms de una
   * zancada tiene que dejar lo mismo que recorrerlos en cuatro.
   */
  const { ColorFuente } = modulo();
  const desde = { h: 0, s: 1, l: 0.5 };
  const hasta = { h: 100, s: 1, l: 0.5 };

  const deUnaVez = ColorFuente.acercar(desde, hasta, 220);

  let aPlazos = desde;
  for (let i = 0; i < 4; i++) aPlazos = ColorFuente.acercar(aPlazos, hasta, 55);

  assert.ok(
    Math.abs(deUnaVez.h - aPlazos.h) < 1e-9,
    `220 ms de golpe dieron ${deUnaVez.h} y en cuatro pasos ${aPlazos.h}`
  );
  // Y que de verdad se haya movido: dos formas de no moverse tambien
  // coincidirian, y esta prueba las aprobaria las dos.
  assert.ok(deUnaVez.h > 50, "en una constante de tiempo hay que cubrir el 63 % del camino");
  assert.ok(deUnaVez.h < 100, "no se puede llegar del todo en una constante de tiempo");
});

test("una pausa larga salta al color de AHORA en vez de arrastrar el desvanecido", () => {
  const { ColorFuente } = modulo();
  const hasta = { h: 100, s: 1, l: 0.5 };

  const trasMedioMinuto = ColorFuente.acercar({ h: 0, s: 1, l: 0.5 }, hasta, 30000);

  assert.ok(
    Math.abs(trasMedioMinuto.h - 100) < 0.01,
    "la ventana estuvo minimizada media hora y el color sigue viniendo de otra cancion"
  );
});

test("sin color de partida se entrega el objetivo TAL CUAL", () => {
  /*
   * Sin esto habria que elegir un color inicial, y cualquiera seria mentira:
   * el espectro nacería en gris o en rojo y se arrastraria hasta el color de
   * la cancion a la vista del usuario, como si ese primer color significara
   * algo.
   */
  const { ColorFuente } = modulo();
  const objetivo = { h: 355, s: 0.7, l: 0.49 };

  assert.deepStrictEqual(
    Object.assign({}, ColorFuente.acercar(null, objetivo, 16)),
    Object.assign({}, objetivo)
  );
  assert.strictEqual(ColorFuente.acercar(null, null, 16), null, "sin objetivo no hay color");
});

/* ==================================================================
 * 2. El cable: que ese color llegue a las barras
 * ================================================================== */

function fingirAudio(win) {
  win.AudioContext = function () {
    return {
      state: "running",
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 128,
        getByteFrequencyData(destino) {
          destino.fill(120);
        }
      }),
      resume: () => Promise.resolve(),
      close: () => Promise.resolve()
    };
  };
}

function conAudio(video) {
  video.captureStream = () => ({ getAudioTracks: () => [{ readyState: "live", stop() {} }] });
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
 * Las ventanas se apuntan para CERRARLAS al final del archivo. No es
 * cosmetica: estas pruebas encienden el muestreo del color, que es un
 * setInterval DE VERDAD en la ventana de jsdom, y un intervalo vivo
 * mantiene vivo el proceso entero. Sin este cierre, `node --test` se queda
 * esperando este archivo para siempre y la suite completa nunca termina
 * (que es exactamente como se descubrio).
 */
const ventanas = [];
test.after(() => {
  for (const w of ventanas) w.close();
});

function ventana(opciones) {
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
  ventanas.push(win);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/shared/paleta.js",
    // El orden es el del manifiesto, y aqui NO es decorativo: color-fuente.js
    // se queda con `rgbAHsl` y `mezclarHsl` de Paleta al evaluarse, asi que
    // cargarlo antes lo dejaria sin las dos funciones y sin avisar.
    "src/shared/color-fuente.js",
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

  // Los intervalos se APUNTAN ademas de crearse: es la unica forma de
  // comprobar que el muestreo se enciende y se apaga, porque lo que hace
  // por dentro (leer pixeles) jsdom no lo puede hacer.
  const intervalos = [];
  const setIntervalDeVerdad = win.setInterval.bind(win);
  win.setInterval = (fn, ms) => {
    intervalos.push(ms);
    return setIntervalDeVerdad(fn, ms);
  };

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  fingirAudio(win);
  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    banco,
    fotogramas,
    intervalos,
    Adapter: win.YTMPip.Adapter,
    Espectro: win.YTMPip.Espectro,
    PipView: win.YTMPip.PipView,
    lienzo: doc.getElementById("ytmpip-spectrum")
  };
}

function sinVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

/**
 * Enciende el espectro y devuelve la lista de fillStyle usados al pintar un
 * fotograma en el instante `ms`.
 *
 * El lienzo se finge entero —caja y contexto— porque jsdom no da ninguno de
 * los dos: `getBoundingClientRect` devuelve ceros y `getContext("2d")`
 * devuelve null, asi que `dibujarEspectro` se saldria por la primera guarda
 * sin llegar nunca al color. Lo que se prueba con el lienzo fingido no es que
 * se pinte: es CON QUE COLOR se pide pintar.
 */
async function pintar(v, ms, preferencias) {
  await v.win.YTMPip.Settings.load();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  v.Espectro.leerBarras = () => [100, 100];
  const usados = [];
  const pintado = {
    clearRect() {},
    fillStyle: "",
    fillRect() {
      usados.push(pintado.fillStyle);
    }
  };
  v.lienzo.getBoundingClientRect = () => ({ width: 200, height: 40 });
  v.lienzo.getContext = () => pintado;
  v.banco.aplicarPreferencias(preferencias || v.win.YTMPip.Settings.get());

  const fn = v.fotogramas.pop();
  assert.ok(fn, "premisa: el bucle de animacion tenia que estar en marcha");
  fn(ms);
  return usados;
}

test("EL CABLE: el color de la fuente llega al fillStyle de las barras", async () => {
  /*
   * La regla puede estar perfecta y el espectro seguir pintandose del color
   * del tema. Lo que se mira aqui es la costura: que `dibujarEspectro`
   * pregunte por el color de la fuente cuando el modo lo pide.
   */
  const v = ventana({ storage: { spectrumColor: "source" } });
  v.banco.fijarColorFuente({ h: 355, s: 0.7, l: 0.49 });

  const usados = await pintar(v, 1000);

  assert.strictEqual(usados.length, 2, "premisa: se pintaron las dos barras");
  assert.strictEqual(
    usados[0],
    "hsl(355, 70%, 49%)",
    `se pinto con ${usados[0]} en vez del color medido del video`
  );
  // Un color FIJO para todas las barras, a diferencia del arcoiris y de la
  // paleta: la fuente da UN color, no uno por barra.
  assert.strictEqual(new Set(usados).size, 1);
});

test("sin color de la fuente se vuelve al color del tema", async () => {
  /*
   * La mitad que hace honesta a la opcion. Una portada en blanco y negro no
   * da color, y entonces las barras tienen que volver al acento en vez de
   * quedarse con el de la cancion anterior o pintarse de negro.
   */
  const v = ventana({ storage: { spectrumColor: "source" } });
  v.banco.fijarColorFuente(null);

  const usados = await pintar(v, 1000);

  assert.ok(usados.length, "premisa: se pinto algo");
  assert.ok(
    !/^hsl\(/.test(usados[0]),
    `se pinto con ${usados[0]}: eso es un color de fuente y no habia ninguno`
  );
});

test("el color avanza HACIA la fuente en vez de saltar en cada lectura", async () => {
  /*
   * Los 400 ms entre lecturas y los 13 grados de salto maximo medidos: sin
   * suavizado, el espectro cambiaria de color a tirones dos veces y media por
   * segundo. Se comprueba que el primer fotograma tras un cambio de objetivo
   * pinta un color INTERMEDIO, no el nuevo.
   */
  const v = ventana({ storage: { spectrumColor: "source" } });
  v.banco.fijarColorFuente({ h: 0, s: 1, l: 0.5 });

  await pintar(v, 1000);
  // Ahora la fuente dice otra cosa muy distinta, y el bucle pinta 16 ms
  // despues: un fotograma normal.
  v.banco.fijarColorFuente({ h: 200, s: 1, l: 0.5 });
  const pintado = v.banco.colorFuentePintado();
  assert.ok(pintado && Math.round(pintado.h) === 0, "premisa: se venia pintando el primero");

  v.fotogramas.pop()(1016);

  /*
   * OJO CON EL CIRCULO: de 0 a 200 grados hay mas de media vuelta, y la
   * mezcla va por el camino corto A PROPOSITO (esta contado en mezclarHsl,
   * en paleta.js: "de 350 a 10 grados hay 20, no 340"). O sea que el color
   * se acerca a 200 RETROCEDIENDO por el 360: el intermedio esperado esta
   * entre 300 y 360, no entre 0 y 200. La primera version de esta prueba
   * pedia `h < 100` y fallaba con el codigo funcionando bien.
   */
  const ahora = v.banco.colorFuentePintado();
  assert.ok(ahora.h !== 0, "el color no se movio nada hacia el nuevo");
  assert.ok(
    ahora.h > 300,
    `salto a ${ahora.h} en un fotograma: eso es un tiron (o el camino largo), no un suavizado`
  );
});

test("apagar el modo OLVIDA el color en vez de guardarlo para la proxima", async () => {
  /*
   * Guardarlo parece amable y es una mentira con retraso: volver a encender
   * media hora despues pintaria las barras con el color de una cancion que ya
   * no suena, y se corregiria solo unas decimas despues. Empezar sin color es
   * empezar con la verdad.
   */
  const v = ventana({ storage: { spectrumColor: "source" } });
  v.banco.fijarColorFuente({ h: 355, s: 0.7, l: 0.49 });
  await pintar(v, 1000);
  assert.ok(v.banco.colorFuentePintado(), "premisa: habia un color pintandose");

  /*
   * Desde la tanda M la funcion recibe las preferencias ENTERAS (el halo
   * tambien puede querer muestreo). Aqui se pasa un objeto minimo: sin
   * haloColor, el deseo del halo queda apagado y manda solo el espectro.
   */
  v.banco.sincronizarColorFuente(false, { spectrumColor: "source" });

  assert.strictEqual(v.banco.colorFuentePintado(), null);
});

test("no se muestrea para un espectro que no se ve", async () => {
  /*
   * Leer un fotograma cuesta 4,467 ms medidos. Hacerlo dos veces y media por
   * segundo para un canvas escondido —el usuario puede tener el modo puesto y
   * el espectro apagado durante horas— es trabajo para nadie.
   */
  const v = ventana({ storage: { spectrumColor: "source" } });
  const { SOURCE_COLOR } = v.win.YTMPip.CONSTANTS.SPECTRUM_LIMITS;

  v.banco.sincronizarColorFuente(false, { spectrumColor: "source" });
  assert.ok(
    !v.intervalos.includes(SOURCE_COLOR.SAMPLE_MS),
    "se encendio el muestreo con el espectro escondido"
  );

  v.banco.sincronizarColorFuente(true, { spectrumColor: "source" });
  assert.ok(
    v.intervalos.includes(SOURCE_COLOR.SAMPLE_MS),
    "con el espectro a la vista el muestreo tiene que arrancar"
  );
});

test("no se muestrea cuando el color elegido es otro", async () => {
  const v = ventana();
  const { SOURCE_COLOR } = v.win.YTMPip.CONSTANTS.SPECTRUM_LIMITS;

  v.banco.sincronizarColorFuente(true, { spectrumColor: "accent" });
  v.banco.sincronizarColorFuente(true, { spectrumColor: "rgb" });
  v.banco.sincronizarColorFuente(true, { spectrumColor: "#00ff88" });

  assert.ok(
    !v.intervalos.includes(SOURCE_COLOR.SAMPLE_MS),
    "se esta leyendo el video para pintar de un color que no sale del video"
  );
});

test("EL SEGUNDO CLIENTE: el halo en modo fuente enciende el muestreo con el espectro escondido", () => {
  /*
   * Desde la tanda del halo segun la caratula, el muestreo tiene dos
   * clientes. El caso que separa a los dos es este: espectro APAGADO
   * (visible en falso, que hasta ahora bastaba para no muestrear) pero
   * halo encendido y siguiendo a la fuente — el muestreo tiene que
   * arrancar igual, porque el borde necesita el color aunque las barras
   * no esten. Y ojo: el deseo del halo NO lleva `visible`, porque el halo
   * no depende del estado de la pista, solo de la portada.
   */
  const v = ventana();
  const { SOURCE_COLOR } = v.win.YTMPip.CONSTANTS.SPECTRUM_LIMITS;

  v.banco.sincronizarColorFuente(false, {
    spectrumColor: "accent",
    haloPreference: "shown",
    haloColor: "source"
  });

  assert.ok(
    v.intervalos.includes(SOURCE_COLOR.SAMPLE_MS),
    "el halo pidio el color de la fuente y nadie fue a buscarlo"
  );
});

test("y el halo APAGADO no pide muestreo, aunque su color guardado sea el de la fuente", () => {
  /*
   * La otra mitad del deseo del halo: el color "source" con la capa
   * escondida es una preferencia dormida, no una peticion. Muestrear para
   * un halo que no se ve seria el mismo trabajo para nadie que muestrear
   * para un canvas escondido.
   */
  const v = ventana();
  const { SOURCE_COLOR } = v.win.YTMPip.CONSTANTS.SPECTRUM_LIMITS;

  v.banco.sincronizarColorFuente(false, {
    spectrumColor: "accent",
    haloPreference: "hidden",
    haloColor: "source"
  });

  assert.ok(
    !v.intervalos.includes(SOURCE_COLOR.SAMPLE_MS),
    "se muestrea para un halo que esta apagado"
  );
});

test('el modo "source" no acaba metido en la variable CSS como si fuera un color', () => {
  /*
   * El mismo fallo que ya se vigila con "rgb", y que vuelve con cada modo
   * nuevo: applySettings escribe el color elegido en
   * --ytmpip-spectrum-color, y sin distinguir modo de color el CSS recibiria
   * `--ytmpip-spectrum-color: source` y el navegador descartaria la
   * declaracion entera. Quien lo distingue es `partirColor`, la misma
   * funcion que usa la pagina de opciones.
   */
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");

  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { spectrumColor: "source" })
  );

  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-color"), "var(--ytmpip-accent)");
});

/* ==================================================================
 * 3. Que el desplegable y lo guardado hablen del mismo modo
 * ================================================================== */

test("todo modo del desplegable de color SOBREVIVE a guardarlo y volverlo a leer", () => {
  /*
   * PRUEBA DE TEXTO: lee el HTML como texto, no lo maqueta.
   *
   * Vigila la unica costura que un modo nuevo puede romper en silencio. El
   * <option> escribe un valor en storage y `normalizarColor` decide si lo
   * reconoce; una letra de diferencia entre los dos no da ningun error:
   * `normalizarColor` manda lo que no conoce al valor por defecto, asi que el
   * desplegable volveria solo a «El del tema» al recargar la pagina y el
   * usuario pensaria que no se guarda.
   *
   * Se recorren TODOS los modos y no solo el nuevo: la lista de <option> es
   * la que manda, asi que el dia que se añada un quinto esta prueba ya lo
   * estara mirando sin que nadie la toque.
   */
  const { Settings } = entornoDeAjustes();

  const html = fs.readFileSync(path.join(RAIZ, "src/options/options.html"), "utf8");
  // El [^>]* tolera atributos detras del id: desde el segundo rediseño los
  // selects llevan class="ytmpip-select-real" (la piel de pildoras).
  const bloque = /<select id="spectrumColorMode"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  assert.ok(bloque, "no se encontro el desplegable de color en options.html");

  const modos = [...bloque[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(modos.includes("source"), "el modo nuevo no esta en el desplegable");
  assert.ok(modos.length >= 5, `solo hay ${modos.length} modos: falta alguno`);

  for (const modo of modos) {
    /*
     * "custom" y "palette" LLEVAN UN DATO DENTRO, asi que su valor guardado
     * no es su nombre: se guarda el color o la lista. Son la otra familia de
     * modos —la que `unirColor` tiene que nombrar por fuerza— y por eso se
     * comprueban con su dato, no con su nombre.
     */
    const guardado = Settings.unirColor(modo, "#00ff88", ["#ff0000", "#0000ff"]);
    assert.strictEqual(
      Settings.partirColor(guardado).modo,
      modo,
      `el modo "${modo}" se guarda como "${guardado}" y vuelve como otro`
    );
  }
});

function entornoDeAjustes() {
  const { win } = crearEntorno(undefined);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js"
  );
  return win.YTMPip;
}
