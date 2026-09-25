/*
 * Pruebas del ESPECTRO de la musica.
 *
 * Lo que aqui se puede probar y lo que no, dicho antes de empezar para que
 * nadie lea estas pruebas como una garantia de que el espectro se ve bien:
 *
 *  - SE PRUEBA el reparto de bandas en barras, el suavizado y la decision
 *    de encender o apagar. Son numeros y son reglas: se pueden clavar.
 *  - NO SE PRUEBA que se pinte nada. jsdom devuelve null en
 *    canvas.getContext("2d") y no tiene AudioContext ni analizador de
 *    verdad. Que las barras se vean es cosa de mirar la ventana.
 *
 * El AudioContext se finge a proposito y no se intenta emular: fingirlo
 * sirve para comprobar CUANDO se monta y CUANDO se suelta, que es donde
 * estan los fallos caros (uno por cada apertura de la ventana, o un
 * analizador clavado a un <video> muerto). Fingir sus numeros no probaria
 * nada que no fuera mi propia invencion.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

function sonando(video) {
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  return video;
}

/*
 * Un <video> del que SI se puede sacar audio. Es exactamente lo que
 * puedeMedirse exige: captureStream y ninguna clave de cifrado.
 *
 * La pista lleva `readyState` porque una MediaStreamTrack de verdad SIEMPRE
 * lo lleva. Aqui estuvo `{ stop() {} }` a secas, y ese doble de mentira era
 * el que dejaba pasar el fallo reportado: una pista que no puede morir no
 * puede reproducir el caso en que muere.
 *
 * Cada llamada a captureStream() entrega una pista NUEVA, como el navegador:
 * la copia es del audio de ese momento, no del elemento.
 */
function conAudio(video) {
  let pista = { readyState: "live", stop() {} };
  video.captureStream = () => ({ getAudioTracks: () => [pista] });
  // Para poder terminar EXACTAMENTE la pista que el modulo tiene guardada.
  video.__pistaActual = () => pista;
  video.__renovarPista = () => {
    pista = { readyState: "live", stop() {} };
  };
  /*
   * Una fuente, porque el <video> de YouTube Music SIEMPRE tiene una: un
   * blob de MSE. Medido en la pagina real con
   * tools/diagnostico-espectro-bucle.js:
   *
   *     fuente=blob:https://music.youtube.com/9c92c774-2a82-44d0-82ac-
   *
   * Sin esto el doble no podia reproducir el fallo, porque un elemento sin
   * fuente no puede cambiar de fuente.
   */
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
 * EL CAMBIO DE CANCION A MANO, tal y como se midio en la pagina real.
 *
 * Lo importante es lo que este doble NO hace: no termina la pista. Medido:
 * al pulsar "siguiente", YouTube Music reutiliza el mismo elemento, le pone
 * otro blob, y la copia capturada se queda `live` sin llevar audio.
 *
 *     elemento video#1 -> video#1 (EL MISMO, solo cambio la fuente)
 *     fuente nueva: blob:https://music.youtube.com/56e3b52b-...
 *
 * El fixture anterior (matarPistaCapturada) daba por hecho que la pista se
 * marcaba `ended`. Eso era una suposicion mia, y las pruebas escritas sobre
 * ella pasaban con el fallo puesto.
 */
function cambiarFuenteSinMatarPista(video, blob) {
  video.currentSrc = blob || "blob:https://music.youtube.com/56e3b52b";
  video.__renovarPista();
  return video;
}

/* El hueco entre dos canciones: el elemento se queda un rato sin fuente. */
function sinFuente(video) {
  video.currentSrc = "";
  return video;
}

/*
 * Lo que hace el navegador cuando el elemento cambia de fuente: la copia
 * capturada antes se termina, y una captura nueva daria una pista viva.
 * El elemento sigue siendo EL MISMO objeto, que es justo lo que hacia que
 * la guarda antigua no se enterase de nada.
 */
function matarPistaCapturada(video) {
  const muerta = video.__pistaActual();
  muerta.readyState = "ended";
  video.__renovarPista();
  return muerta;
}

/*
 * AudioContext de mentira. Guarda cada uno que se crea para poder contar
 * montajes y ver cual se cerro: es lo unico que estas pruebas vigilan de
 * verdad del modulo de audio.
 */
function fingirAudio(win) {
  const creados = [];
  /*
   * Lo que "suena": todas las bandas al mismo valor. Va colgado del array
   * de contextos y no como un parametro porque `ventana()` ya devuelve ese
   * array y asi las pruebas que no miden nada no se enteran de que existe.
   * Cambiarlo entre dos lecturas es lo unico que permite comprobar la
   * caida sin audio de verdad.
   */
  creados.nivel = 0;
  win.AudioContext = function () {
    const ctx = {
      state: "running",
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => ({
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 128,
        getByteFrequencyData(destino) {
          destino.fill(creados.nivel);
        }
      }),
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
  /*
   * El halo se clava FIJO en todo el archivo desde la 1.0.1, en que el de
   * serie paso a ser "pulse": el latido lee el golpe con
   * getFloatFrequencyData, que el AudioContext fingido de arriba no
   * implementa A PROPOSITO (aqui se mide el espectro, no el halo — el
   * halo tiene su archivo con su doble completo). Sin este clavo, el
   * clic del 📊 es gesto suficiente y el primer fotograma revienta con
   * un TypeError que no habla de ninguna barra.
   */
  opciones = Object.assign({}, opciones);
  opciones.storage = Object.assign({ haloMode: "fixed" }, opciones.storage);
  const { win } = crearEntorno(leerFixture("controles-completos.html"), opciones);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    // pip.js llama a YTMPip.Paleta para el modo paleta. Si falta, el
    // espectro se pinta igual en los demas modos y el fallo solo asoma en
    // ese: por eso va en la lista aunque una prueba concreta no lo use.
    "src/shared/paleta.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  // jsdom no trae requestAnimationFrame salvo en modo visual. Se pone uno
  // que APUNTA los fotogramas en vez de ejecutarlos: asi se puede afirmar
  // "se pidio pintar" sin depender de un temporizador.
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
    boton: doc.getElementById("ytmpip-spectrum-toggle"),
    lienzo: doc.getElementById("ytmpip-spectrum")
  };
}

function sinVideo() {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: {} };
}

function conLetra() {
  return Object.assign(sinVideo(), {
    lyrics: { status: "available", source: "Better Lyrics", lines: [{ text: "una linea", time: 1 }] }
  });
}

/* ------------------------------------------------------------------
 * El reparto de bandas en barras
 *
 * Es la unica parte del espectro que decide como se VE, y es pura. Si
 * estas cuentas estan mal, el espectro sale roto de una forma concreta:
 * tres cuartas partes de las barras clavadas a cero.
 * ------------------------------------------------------------------ */

test("los cortes cubren todas las bandas y ninguna barra se queda vacia", () => {
  const cortes = ventana().Espectro.cortesDeBarras(128, 24);

  assert.strictEqual(cortes[0], 0, "hay que empezar por la banda cero");
  assert.strictEqual(cortes[cortes.length - 1], 128, "la ultima banda se quedaba fuera");
  for (let i = 1; i < cortes.length; i++) {
    assert.ok(cortes[i] > cortes[i - 1], `la barra ${i - 1} no cubre ninguna banda`);
  }
});

test("el reparto es logaritmico: los agudos cubren mas bandas que los graves", () => {
  /*
   * La razon de existir de cortesDeBarras. El analizador reparte sus
   * bandas por igual hasta ~22 kHz, donde casi no hay musica; con un
   * reparto a partes iguales la mitad izquierda del espectro se lleva de
   * 0 a 11 kHz y el resto de las barras no se mueve nunca.
   */
  const cortes = ventana().Espectro.cortesDeBarras(128, 16);
  const primera = cortes[1] - cortes[0];
  const ultima = cortes[cortes.length - 1] - cortes[cortes.length - 2];

  assert.ok(ultima > primera * 4, `reparto plano: ${primera} bandas abajo y ${ultima} arriba`);
});

test("pedir mas barras que bandas no inventa barras vacias", () => {
  const cortes = ventana().Espectro.cortesDeBarras(8, 40);
  assert.strictEqual(cortes.length - 1, 8, "hay mas barras que bandas para repartir");
});

test("sin bandas o sin barras no hay reparto", () => {
  // Se compara la longitud y no el array entero: los objetos creados
  // dentro de jsdom no son reference-equal con los de Node (ver `plano`).
  const e = ventana().Espectro;
  assert.strictEqual(e.cortesDeBarras(0, 10).length, 0);
  assert.strictEqual(e.cortesDeBarras(128, 0).length, 0);
});

test("cada barra es la MEDIA de su grupo, no el maximo", () => {
  /*
   * Con el maximo, una sola banda ruidosa levanta la barra entera y el
   * espectro tiembla sin relacion con lo que se oye.
   */
  const media = ventana().Espectro.agruparEnBarras([0, 0, 0, 200], [0, 4]);
  assert.deepStrictEqual(Array.from(media), [50]);
});

test("el suavizado sube de golpe y baja con freno", () => {
  const e = ventana().Espectro;
  assert.strictEqual(e.suavizar(10, 200, 12), 200, "el golpe de bateria llega tarde");
  assert.strictEqual(e.suavizar(200, 10, 12), 188, "la barra cae de golpe y el espectro parpadea");
  assert.strictEqual(e.suavizar(200, 195, 12), 195, "una bajada corta no debe frenarse a mas de lo que baja");
  assert.strictEqual(e.suavizar(0, 40, 12), 40, "la primera lectura no tiene de donde caer");
});

test("el numero de barras se ajusta al ancho, con topes en los dos extremos", () => {
  const b = ventana().PipView.barrasParaAncho;

  assert.ok(b(400) > b(160), "el mismo espectro para una ventana mini que para una ampliada");
  assert.strictEqual(b(40), 8, "por debajo de ocho barras ya no es un espectro, es un vumetro");
  assert.strictEqual(b(2000), 40, "con barras de menos de un pixel no se ve nada");
  assert.strictEqual(b(0), 8, "un ancho sin medir no puede devolver cero barras");
});

/* ------------------------------------------------------------------
 * Las preferencias del espectro
 *
 * Se prueba que el numero elegido LLEGUE hasta donde se usa. Que se vea
 * bien con cuarenta barras en la ventana mini es cosa de mirarlo: aqui
 * solo se garantiza que no se ignore lo que el usuario guardo.
 * ------------------------------------------------------------------ */

test("un numero de barras preferido manda sobre el ancho de la ventana", () => {
  const b = ventana().PipView.barrasParaAncho;

  assert.strictEqual(b(400, 12), 12, "se ignoro el numero elegido en preferencias");
  assert.strictEqual(b(40, 40), 40, "pedir cuarenta barras en la ventana mini es una eleccion legitima");
  assert.strictEqual(b(400, "auto"), b(400), '"auto" tiene que dejar decidir al ancho');
  assert.strictEqual(b(400, undefined), b(400), "sin preferencia se reparte por ancho, como siempre");
});

test("la velocidad de caida entra por parametro y decide cuanto baja la barra", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  // Suena fuerte: la primera lectura clava las barras en 200.
  v.contextos.nivel = 200;
  assert.strictEqual(v.Espectro.leerBarras(8, 12)[0], 200, "premisa: subir es inmediato");

  // Y se calla de golpe: lo que baja es exactamente la velocidad pedida.
  v.contextos.nivel = 0;
  assert.strictEqual(v.Espectro.leerBarras(8, 12)[0], 188);
});

test("una velocidad mas alta baja mas en el mismo fotograma", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  v.contextos.nivel = 200;
  v.Espectro.leerBarras(8, 50);
  v.contextos.nivel = 0;
  assert.strictEqual(v.Espectro.leerBarras(8, 50)[0], 150);
});

test("sin velocidad se usa la de siempre, no cero", () => {
  /*
   * Importa porque leerBarras se llamaba con un solo argumento hasta que
   * la velocidad fue configurable. Una caida de cero dejaria las barras
   * clavadas arriba para siempre: un espectro que sube y no baja.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  v.contextos.nivel = 200;
  v.Espectro.leerBarras(8);
  v.contextos.nivel = 0;
  assert.strictEqual(v.Espectro.leerBarras(8)[0], 200 - v.Espectro.CAIDA_POR_FOTOGRAMA);
});

test("EL CABLE: las preferencias guardadas llegan al bucle de dibujo", async () => {
  /*
   * Sin esta prueba, cambiar las preferencias podia no cambiar nada y
   * ninguna otra se enteraba: leerBarras acepta los dos numeros y
   * barrasParaAncho respeta la preferencia, pero nadie comprobaba que
   * pip.js se los pasara de verdad.
   *
   * jsdom no pinta, asi que se le presta al canvas un tamaño y un contexto
   * 2d de mentira. No se finge NADA del dibujo: lo unico que se mira es
   * con que argumentos se pide la lectura.
   */
  const v = ventana({ storage: { spectrumBars: 15, spectrumFall: 40 } });
  await v.win.YTMPip.Settings.load();

  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  const llamadas = [];
  v.Espectro.leerBarras = (barras, caida) => {
    llamadas.push([barras, caida]);
    return [100];
  };
  const pintado = { clearRect() {}, fillRect() {}, fillStyle: "" };
  v.lienzo.getBoundingClientRect = () => ({ width: 200, height: 40 });
  v.lienzo.getContext = () => pintado;

  // El color sale de una variable CSS, y quien la escribe es applySettings.
  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { spectrumColor: "#00ff88" })
  );

  v.fotogramas.pop()();

  assert.deepStrictEqual(llamadas, [[15, 40]]);
  assert.strictEqual(pintado.fillStyle, "#00ff88", "se pinto con un color que nadie eligio");
});

test("las preferencias de alto y color se traducen a variables CSS", () => {
  /*
   * El canvas se dimensiona y se colorea desde el CSS, con dos variables
   * que escribe applySettings. Se comprueban las variables y no los
   * pixeles: jsdom no maqueta, y como se ve el resultado se mira en
   * tools/vista-previa.html.
   */
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");

  v.banco.aplicarPreferencias(Object.assign(v.win.YTMPip.Settings.get(), {}));
  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-height"), "34%");
  assert.strictEqual(
    raiz.style.getPropertyValue("--ytmpip-spectrum-color"),
    "var(--ytmpip-accent)",
    "por defecto el color lo pone el tema, no este archivo"
  );

  v.banco.aplicarPreferencias(
    Object.assign({}, v.win.YTMPip.Settings.get(), { spectrumHeight: 70, spectrumColor: "#00ff88" })
  );
  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-height"), "70%");
  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-color"), "#00ff88");
});

test("volver al color del tema NO deja pegado el color anterior", () => {
  /*
   * Si el color solo se escribiera cuando es propio, desmarcarlo dejaria
   * la variable con el valor de antes y el espectro se quedaria verde para
   * siempre. Se escribe SIEMPRE, tambien para decir "el del tema".
   */
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");
  const base = v.win.YTMPip.Settings.get();

  v.banco.aplicarPreferencias(Object.assign({}, base, { spectrumColor: "#00ff88" }));
  v.banco.aplicarPreferencias(Object.assign({}, base, { spectrumColor: "accent" }));

  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-color"), "var(--ytmpip-accent)");
});

/* ------------------------------------------------------------------
 * El arcoiris que gira
 *
 * Lo pedido: "colores o combinacion de colores, RGB, como los computadores
 * gamer, que cambian de color constante". Que quede bonito es cosa de
 * mirarlo; lo que si se puede clavar es el TONO que le toca a cada barra en
 * cada instante, que es una funcion pura de tres numeros.
 *
 * El efecto son dos cosas a la vez, y las pruebas las separan porque cada
 * una se puede romper sin la otra: el REPARTO (cada barra un tono, para que
 * una sola foto ya sea un degradado) y el GIRO (que todo avance con el
 * reloj, que es lo que se pidio).
 * ------------------------------------------------------------------ */

test("el tono siempre cae dentro de la rueda de color", () => {
  /*
   * Un tono fuera de [0, 360) no es un error a medias: hsl() con un valor
   * invalido no pinta nada, asi que las barras desaparecerian.
   */
  const m = ventana().PipView.matizRgb;

  for (let ms = 0; ms < 20000; ms += 137) {
    for (const total of [1, 2, 8, 40]) {
      for (const i of [0, Math.floor(total / 2), total - 1]) {
        const tono = m(ms, i, total);
        assert.ok(tono >= 0 && tono < 360, `ms ${ms}, barra ${i}/${total}: tono ${tono}`);
        assert.ok(Number.isFinite(tono), `ms ${ms}, barra ${i}/${total}: tono no numerico`);
      }
    }
  }
});

test("EL REPARTO: en un mismo instante cada barra lleva su tono", () => {
  // Sin esto el espectro entero seria un color liso: se veria cambiar, pero
  // no seria un arcoiris.
  const m = ventana().PipView.matizRgb;
  const tonos = new Set();
  for (let i = 0; i < 12; i++) tonos.add(m(0, i, 12));

  assert.strictEqual(tonos.size, 12, "hay barras compartiendo tono en el mismo fotograma");
});

test("EL GIRO: el mismo sitio cambia de color con el tiempo", () => {
  const m = ventana().PipView.matizRgb;

  assert.notStrictEqual(m(1500, 0, 12), m(0, 0, 12), "el degradado esta quieto");
  assert.notStrictEqual(m(3000, 0, 12), m(0, 0, 12));
});

test("la vuelta se cierra sola: el efecto no se para nunca", () => {
  /*
   * Da igual cuanto lleve sonando la cancion. Si el giro no fuera ciclico,
   * a los pocos minutos el tono se saldria de la rueda y el espectro se
   * apagaria justo en las canciones largas.
   */
  const m = ventana().PipView.matizRgb;

  assert.strictEqual(m(0, 3, 12), m(6000, 3, 12), "una vuelta entera tenia que volver al mismo tono");
  assert.strictEqual(m(0, 3, 12), m(600000, 3, 12), "diez minutos despues el ciclo se habia perdido");
});

test("los dos extremos del espectro no acaban del mismo color", () => {
  /*
   * Por eso el arco es de 300 grados y no de 360: repartiendo la vuelta
   * entera, la ultima barra vuelve al tono de la primera y el degradado
   * parece cortado por la mitad.
   */
  const m = ventana().PipView.matizRgb;
  const primera = m(0, 0, 24);
  const ultima = m(0, 23, 24);

  assert.notStrictEqual(ultima, primera);
  assert.ok(Math.abs(ultima - primera) > 30, `los extremos casi coinciden: ${primera} y ${ultima}`);
});

test("con una sola barra no hay nada que repartir, pero sigue habiendo color", () => {
  // Repartir entre una barra divide por cero: el tono saldria NaN y esa
  // barra no se pintaria. barrasParaAncho no baja de ocho, pero la funcion
  // no puede depender de eso para no romperse.
  const m = ventana().PipView.matizRgb;

  assert.strictEqual(m(0, 0, 1), 0);
  assert.ok(Number.isFinite(m(1234, 0, 1)));
  assert.notStrictEqual(m(3000, 0, 1), m(0, 0, 1), "con una barra se pierde hasta el giro");
});

test("EL CABLE: en modo RGB cada barra se pinta de su color", async () => {
  /*
   * La regla puede ser perfecta y el espectro seguir saliendo de un color
   * liso. Lo que se mira aqui es con que fillStyle se pinta CADA barra, que
   * es lo unico que separa el arcoiris de un color fijo.
   */
  const v = ventana({ storage: { spectrumColor: "rgb" } });
  await v.win.YTMPip.Settings.load();

  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  v.Espectro.leerBarras = () => [100, 100, 100, 100];
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
  v.banco.aplicarPreferencias(v.win.YTMPip.Settings.get());

  v.fotogramas.pop()();

  assert.strictEqual(usados.length, 4, "premisa: se pintaron las cuatro barras");
  assert.strictEqual(new Set(usados).size, 4, "las cuatro barras salieron del mismo color");
  for (const color of usados) {
    assert.match(color, /^hsl\(/, `se pinto con ${color} en vez de un tono de la rueda`);
  }
});

test('el modo "rgb" no acaba metido en la variable CSS como si fuera un color', async () => {
  /*
   * El fallo que esta prueba impide: applySettings escribe el color elegido
   * en --ytmpip-spectrum-color, y si no supiera que "rgb" es un modo y no un
   * color, el CSS recibiria `--ytmpip-spectrum-color: rgb` y el navegador
   * descartaria la declaracion entera. Quien lo distingue es partirColor,
   * la misma funcion que usa la pagina de opciones.
   */
  const v = ventana();
  const raiz = v.doc.getElementById("ytmpip-root");

  v.banco.aplicarPreferencias(Object.assign({}, v.win.YTMPip.Settings.get(), { spectrumColor: "rgb" }));

  assert.strictEqual(raiz.style.getPropertyValue("--ytmpip-spectrum-color"), "var(--ytmpip-accent)");
});

/* ------------------------------------------------------------------
 * Disponibilidad: cuando se OFRECE el boton
 * ------------------------------------------------------------------ */

test("puedeMedirse rechaza lo que no se puede medir", () => {
  const v = ventana();
  const sinCaptura = v.win.document.createElement("video");
  const cifrado = conAudio(v.win.document.createElement("video"));
  cifrado.mediaKeys = {};

  assert.strictEqual(v.Espectro.puedeMedirse(null), false);
  assert.strictEqual(v.Espectro.puedeMedirse(sinCaptura), false, "sin captureStream no hay copia del audio");
  assert.strictEqual(v.Espectro.puedeMedirse(cifrado), false, "con DRM el navegador entrega silencio");
  assert.strictEqual(v.Espectro.puedeMedirse(conAudio(v.win.document.createElement("video"))), true);
});

test("con audio cifrado el boton ni se ofrece", () => {
  /*
   * Un espectro sobre una pista cifrada seria una linea plana. Antes que
   * ofrecerlo y que parezca roto, no se ofrece.
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
  assert.strictEqual(v.boton.title, "Ver el espectro");
});

/* ------------------------------------------------------------------
 * Encender y apagar
 * ------------------------------------------------------------------ */

test("EL CASO PEDIDO: pulsar monta el analizador y pide pintar", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  assert.strictEqual(v.lienzo.hidden, true, "premisa: el espectro nace apagado");

  v.banco.pulsarEspectro();

  assert.strictEqual(v.lienzo.hidden, false, "el canvas sigue oculto: no hay espectro que ver");
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.boton.title, "Ocultar el espectro");
  assert.strictEqual(v.contextos.length, 1, "no se monto ningun AudioContext");
  assert.strictEqual(v.fotogramas.length, 1, "nadie pidio pintar el primer fotograma");
});

test("apagar suelta el AudioContext en vez de dejarlo analizando para nadie", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.contextos[0].state, "running", "premisa");

  v.banco.pulsarEspectro();

  assert.strictEqual(v.lienzo.hidden, true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.contextos[0].state, "closed", "el analizador se queda abierto para siempre");
});

test("sin nada nuevo, los estados que llegan no vuelven a montar el analizador", () => {
  /*
   * Mientras suena una cancion llegan decenas de estados. Si cada uno
   * rehiciera la cadena, el espectro se cortaria varias veces por segundo
   * y ademas se acumularian AudioContext.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  for (let i = 0; i < 5; i++) v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} analizadores para una cancion`);
});

test("REGRESION: al cambiar de <video>, el espectro se reengancha al que suena", () => {
  /*
   * YouTube Music crea un <video> nuevo al encadenar canciones. Es el
   * fallo que este proyecto ya ha visto tres veces por otros motivos: sin
   * reengancharse, el analizador se queda pegado a un elemento muerto y
   * el espectro se congela en la cancion siguiente.
   *
   * Que se arregle en el refresco y no en el clic es justo lo que hace
   * que se arregle solo: el usuario no vuelve a pulsar nada.
   */
  const v = ventana();
  const viejo = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.contextos.length, 1, "premisa: el espectro esta encendido");

  const nuevo = sonando(conAudio(conTiempos(v.win.document.createElement("video"), 2, 187)));
  v.Adapter.getPlayerContainer().appendChild(nuevo);
  assert.strictEqual(v.Adapter.getMediaElement(), nuevo, "premisa: la cancion suena en el <video> nuevo");
  assert.ok(viejo.isConnected, "premisa: el viejo sigue en la pagina, como cadaver");

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 2, "el analizador se quedo pegado al <video> de la cancion anterior");
  assert.strictEqual(v.contextos[0].state, "closed", "el analizador viejo se quedo abierto");
  assert.strictEqual(v.lienzo.hidden, false, "el espectro se apago solo al cambiar de cancion");
});

test("EL SINTOMA REPORTADO: al cambiar de cancion SIN cambiar de <video>, el espectro revive solo", () => {
  /*
   * El reporte: "cuando cambia de cancion y tengo el espectro activado deja
   * de servir el espectro y toca oprimir nuevamente".
   *
   * La prueba de arriba cubre el caso en que YouTube Music crea un <video>
   * nuevo. Este es el otro: reutiliza el MISMO elemento y le cambia la
   * fuente. La copia que captureStream() entrego se termina, pero el
   * elemento no ha cambiado, asi que la guarda por identidad decia "sigo
   * enganchado" y el analizador leia ceros para siempre. De ahi el "toca
   * oprimir nuevamente": apagar y encender era lo unico que forzaba una
   * captura nueva.
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.contextos.length, 1, "premisa: el espectro esta encendido");

  const muerta = matarPistaCapturada(video);
  assert.strictEqual(v.Adapter.getMediaElement(), video, "premisa: el elemento NO ha cambiado");
  assert.strictEqual(muerta.readyState, "ended", "premisa: la copia capturada se termino");

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 2, "el analizador se quedo con una pista muerta");
  assert.strictEqual(v.contextos[0].state, "closed", "el analizador viejo se quedo abierto");
  assert.strictEqual(v.lienzo.hidden, false, "el espectro no deberia haberse apagado");
});

test("EL SINTOMA REPORTADO, SEGUNDA PARTE: cambiar de cancion A MANO tambien revive el espectro", () => {
  /*
   * El reporte: "la grafica funciona bien si la cancion se cambia
   * automaticamente, pero si el usuario decide cambiar la cancion con el
   * siguiente ahi es donde deja de funcionar".
   *
   * Y esa frase explica por que el arreglo anterior parecia funcionar: en un
   * salto automatico la pista SI llega a terminarse, asi que `pistaTerminada`
   * se enteraba. Al pulsar "siguiente" no. Medido en la pagina real: mismo
   * elemento, otro blob, pista `live` sin audio. Ni la identidad ni la
   * muerte de la pista se enteran; solo la fuente.
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.contextos.length, 1, "premisa: el espectro esta encendido");

  const vieja = video.__pistaActual();
  cambiarFuenteSinMatarPista(video);

  assert.strictEqual(v.Adapter.getMediaElement(), video, "premisa: el elemento NO ha cambiado");
  assert.strictEqual(vieja.readyState, "live", "premisa: la pista capturada NO se marco como terminada");

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 2, "el analizador se quedo capturando la cancion anterior");
  assert.strictEqual(v.contextos[0].state, "closed", "el analizador viejo se quedo abierto");
  assert.strictEqual(v.lienzo.hidden, false, "el espectro no deberia haberse apagado");
});

test("la misma fuente no remonta nada, por muchos refrescos que lleguen", () => {
  /*
   * El precio de la pregunta nueva, acotado. Si "la fuente no coincide" se
   * respondiera que si por descuido, cada refresco montaria un AudioContext.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  for (let i = 0; i < 5; i++) v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} analizadores sin cambiar de fuente`);
});

test("el hueco sin fuente entre dos canciones NO cuenta como fuente nueva", () => {
  /*
   * Entre dos canciones el elemento se queda un rato con `currentSrc` vacio
   * —en el diagnostico son varios segundos con el video en pausa a t=0.0—.
   * Tratar el vacio como "otra fuente" remontaria el analizador en cada
   * refresco de todo ese hueco. Vacio significa "todavia no se", no "otra".
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.contextos.length, 1, "premisa: el espectro esta encendido");

  sinFuente(video);
  for (let i = 0; i < 5; i++) v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} analizadores durante el hueco`);
});

/*
 * AQUI HABIA UNA PRUEBA, y se borro porque no probaba lo que decia.
 *
 * Se llamaba "desconectar olvida la fuente" y afirmaba que sin esa linea la
 * conexion siguiente se compararia con la fuente de la anterior. Pasaba,
 * pero pasaba por otra razon: `fuenteConectada` solo se lee tras comprobar
 * `video === elementoConectado`, y desconectar deja el elemento a null, asi
 * que esa comparacion no llega a hacerse nunca. La mutacion "desconectar se
 * queda con la fuente apuntada" SOBREVIVIA con la prueba puesta y en verde.
 *
 * La linea del codigo se queda —desconectar promete soltarlo todo— y esta
 * documentada alli como superviviente a proposito. Lo que no se queda es una
 * prueba que da una sensacion de cobertura que no existe.
 */

test("una pista viva no se remonta: solo la muerte fuerza una captura nueva", () => {
  /*
   * La otra mitad del arreglo, y la que impide pagar el precio: si
   * bastara con "no consta que este viva" para remontar, cada refresco
   * crearia un AudioContext. Un espectro plano es un fallo; sesenta
   * AudioContext por segundo es otro peor.
   */
  const v = ventana();
  const video = conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  for (let i = 0; i < 5; i++) v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(video.__pistaActual().readyState, "live", "premisa: la pista sigue viva");
  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} analizadores sin que muriera nada`);
});

test("una pista que no dice si vive se trata como viva, no como muerta", () => {
  /*
   * El coste de equivocarse aqui no es simetrico, y por eso la pregunta
   * esta escrita como "esta muerta" y no como "esta viva".
   *
   * Una MediaStreamTrack de verdad siempre dice `live` o `ended`. Pero si
   * algun dia no dijera nada —otro navegador, un doble, una version
   * futura—, tratar el silencio como muerte obligaria a remontar el
   * analizador en CADA refresco: un AudioContext nuevo varias veces por
   * segundo, con su corte de sonido en el espectro. Tratarlo como vida, en
   * el peor caso, deja el espectro plano hasta que el usuario lo pulse, que
   * es exactamente donde estabamos antes de este arreglo.
   */
  const v = ventana();
  const video = conTiempos(v.Adapter.getPageMediaElement(), 35, 220);
  video.captureStream = () => ({ getAudioTracks: () => [{ stop() {} }] });

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  for (let i = 0; i < 5; i++) v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} analizadores por no saber el estado de la pista`);
});

test("un contexto suspendido por el navegador se reanuda en el refresco", () => {
  /*
   * La otra forma de leer ceros con todo aparentemente montado: la
   * politica de autoreproduccion puede suspender el AudioContext DESPUES
   * de crearlo, por ejemplo al mandar la pestaña al fondo. Se reanudaba
   * solo al montarlo, y ahi ya nadie volvia a mirar.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();

  v.contextos[0].state = "suspended";
  v.contextos[0].resume = () => {
    v.contextos[0].state = "running";
    return Promise.resolve();
  };

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.contextos.length, 1, "no hacia falta remontar nada, solo reanudar");
  assert.strictEqual(v.contextos[0].state, "running", "el contexto se quedo suspendido leyendo ceros");
});

test("con la letra en grande el espectro se apaga, pero la peticion se guarda", () => {
  /*
   * El canvas vive DENTRO del escenario, y con la letra en grande el
   * escenario esta en display:none. Seguir pintando seria gastar sesenta
   * fotogramas por segundo en algo que nadie ve. Olvidar la peticion, en
   * cambio, obligaria a volver a pulsar al salir de ese modo.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(conLetra());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.lienzo.hidden, false, "premisa: encendido con la letra en el sitio normal");

  v.banco.pulsarAlternarVideo(); // pide la letra en grande

  assert.strictEqual(v.lienzo.hidden, true, "se sigue pintando bajo un escenario que no se ve");
  assert.strictEqual(v.banco.pideEspectro(), true, "se perdio la peticion del usuario");
  assert.strictEqual(v.contextos[0].state, "running", "el analizador se solto pese a seguir pedido");

  v.banco.pulsarAlternarVideo(); // vuelve la portada

  assert.strictEqual(v.lienzo.hidden, false, "al volver la portada el espectro no volvio solo");
});

test("si el audio deja de poder medirse, el espectro se apaga sin dejar el boton mintiendo", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));

  v.PipView.onStateUpdate(sinVideo());
  v.banco.pulsarEspectro();
  assert.strictEqual(v.lienzo.hidden, false, "premisa");

  // La cancion siguiente llega cifrada.
  const cifrado = sonando(conAudio(conTiempos(v.win.document.createElement("video"), 2, 187)));
  cifrado.mediaKeys = {};
  v.Adapter.getPlayerContainer().appendChild(cifrado);

  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.hidden, true, "el boton sigue ofreciendo lo que ya no se puede dar");
  assert.strictEqual(v.lienzo.hidden, true, "el canvas se queda a la vista pintando una linea plana");
});
