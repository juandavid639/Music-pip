/*
 * Pruebas del HALO DE LUZ: el borde de acento de la ventana, fijo o
 * latiendo con los graves.
 *
 * El halo es el TERCER cliente del analizador de audio (espectro, pulso,
 * halo) y el primero cuyo latido es una PREFERENCIA guardada en vez de un
 * clic de la sesion. Esa diferencia es la que mas reglas nuevas trae y la
 * que mas se prueba aqui: el AudioContext nace suspendido sin un gesto del
 * usuario, asi que un latido guardado NO puede conectarse solo al abrir la
 * ventana — sale fijo y arranca con el primer clic que toque audio.
 *
 * Lo que se prueba y lo que no, como en pip-pulso.test.js:
 *
 *  - SE PRUEBA EL CABLE: que la preferencia mueva la capa y el boton, que
 *    el golpe llegue a SU variable CSS (--ytmpip-halo-golpe, no
 *    --ytmpip-pulse), y que los tres clientes compartan UN analizador.
 *  - SE PRUEBA LA REGLA DEL GESTO, que es lo unico realmente nuevo.
 *  - SE PRUEBA QUE LA DECISION VISUAL ESTE TOMADA en pip.css, leyendo la
 *    hoja como texto (jsdom no maqueta).
 *  - NO SE PRUEBA como se ve brillar. Eso es mirar la ventana.
 *
 * La MEDICION del golpe no se reprueba aqui: es la misma de pip-pulso
 * (leerPulso), y dos baterias midiendo lo mismo serian dos verdades.
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
 * El mismo AudioContext gobernable de pip-pulso.test.js, reducido a lo que
 * estas pruebas usan: graves y resto en decibelios, suavizado honrado. El
 * porque de cada pieza esta explicado alli y no se repite.
 */
const HASTA_HZ_FALSOS = 150;

function fingirAudio(win) {
  const creados = [];
  creados.nivel = 0;
  creados.graves = -60;
  creados.resto = -85;

  win.AudioContext = function () {
    const ctx = {
      state: "running",
      sampleRate: 44100,
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
      createAnalyser: () => {
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
              if (i === 0) db = 0;
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

/*
 * Las ventanas se apuntan para CERRARLAS al final del archivo, la misma
 * red que en pip-color-fuente.test.js y por el mismo motivo: desde la
 * tanda del halo segun la caratula, un halo con color "source" enciende
 * el muestreo, que es un setInterval DE VERDAD en la ventana de jsdom, y
 * un intervalo vivo mantiene vivo el proceso entero — `node --test` se
 * quedaria esperando este archivo para siempre.
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

  /*
   * EL MISMO CABLEADO QUE LA VENTANA DE VERDAD: openPip suscribe
   * applySettings a los cambios de settings, y el manejador del ✨ confia
   * en esa suscripcion (guarda la preferencia y deja que el suscriptor
   * repinte). Un banco sin la suscripcion probaria una ventana que no
   * existe: el clic guardaria y no pasaria nada.
   */
  win.YTMPip.Settings.subscribe(banco.aplicarPreferencias);

  return {
    win,
    doc,
    banco,
    fotogramas,
    contextos: fingirAudio(win),
    Adapter: win.YTMPip.Adapter,
    Espectro: win.YTMPip.Espectro,
    PipView: win.YTMPip.PipView,
    Settings: win.YTMPip.Settings,
    raiz: doc.getElementById("ytmpip-root"),
    capa: doc.getElementById("ytmpip-halo"),
    boton: doc.getElementById("ytmpip-halo-toggle"),
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

/* Aplica los settings de serie con los cambios que se pidan encima. */
function aplicar(v, cambios) {
  v.banco.aplicarPreferencias(Object.assign({}, v.Settings.get(), cambios || {}));
}

/*
 * Una ventana con musica capturable y el halo en modo LATIDO, todavia SIN
 * gesto: el punto de partida de casi todas las pruebas del latido.
 *
 * El modo va SEMBRADO EN EL ALMACEN y entra por Settings.load(), no por
 * aplicar(): guardarPreferenciaHalo notifica con LA CACHE, y una cache que
 * nunca aprendio el "pulse" repintaria "fixed" encima al primer clic del
 * ✨ — el banco probaria una ventana que no existe. En la de verdad el
 * modo viene de storage, asi que aqui tambien.
 */
async function conLatidoGuardado(opciones) {
  const v = ventana(Object.assign({ storage: { haloMode: "pulse" } }, opciones || {}));
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  await v.Settings.load();
  return v;
}

/* El mismo instante de arranque que en pip-pulso; el porque esta alli. */
const T0 = 5000;

/* Un golpe entero: referencia en -60 y bombo 9 dB por encima. */
function golpear(v) {
  v.contextos.graves = -60;
  v.banco.unFotograma(T0);
  v.contextos.graves = -51;
  v.banco.unFotograma(T0 + 16);
}

/* ------------------------------------------------------------------
 * La preferencia: capa y boton
 * ------------------------------------------------------------------ */

test("de serie el halo esta encendido y FIJO: la capa se ve y no se monta ningun analizador", () => {
  /*
   * Las dos mitades importan. La capa visible es la preferencia de serie
   * (haloPreference "shown"); el analizador sin montar es la promesa de
   * que un halo fijo es CSS puro, sin FFT por fotograma para una luz que
   * no se mueve.
   */
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  aplicar(v);

  assert.strictEqual(v.capa.hidden, false);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "true");
  assert.strictEqual(v.boton.title, "Quitar el halo");
  assert.strictEqual(v.banco.haloLateAhora(), false);
  assert.strictEqual(v.contextos.length, 0, "un halo fijo monto un analizador");
});

test("apagado en preferencias, la capa se esconde y el boton anuncia encender", () => {
  const v = ventana();
  aplicar(v, { haloPreference: "hidden" });

  assert.strictEqual(v.capa.hidden, true);
  assert.strictEqual(v.boton.getAttribute("aria-pressed"), "false");
  assert.strictEqual(v.boton.title, "Ver el halo");
  assert.strictEqual(v.boton.getAttribute("aria-label"), "Mostrar el halo de luz del borde");
});

test("el boton ✨ escribe SOLO el interruptor: el modo guardado sobrevive al apagado", () => {
  /*
   * La razon de que sean dos claves y no una de tres valores. Si el clic
   * escribiera tambien haloMode, apagar el halo desde la ventana borraria
   * el «latiendo» elegido en preferencias, y volver a encenderlo daria
   * otra cosa que la que habia.
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  const escrituras = [];
  v.win.chrome.storage.local.set = (claves) => escrituras.push(claves);

  v.banco.pulsarHalo();

  assert.strictEqual(v.capa.hidden, true, "el clic no apago la capa");
  assert.strictEqual(escrituras.length, 1);
  assert.strictEqual(escrituras[0].haloPreference, "hidden");
  assert.ok(!("haloMode" in escrituras[0]), "el boton escribio el modo, que no es suyo");

  v.banco.pulsarHalo();
  assert.strictEqual(v.capa.hidden, false, "el segundo clic no la volvio a encender");
  assert.strictEqual(escrituras[1].haloPreference, "shown");
});

/* ------------------------------------------------------------------
 * La regla del gesto: un latido guardado no puede conectarse solo
 * ------------------------------------------------------------------ */

test("LA REGLA DEL GESTO: latido guardado sin ningun clic sale FIJO, sin analizador", async () => {
  /*
   * El AudioContext nace suspendido si no lo pide un gesto del usuario, y
   * conectar al abrir leeria un golpe plano de un contexto dormido: un
   * halo «latiendo» clavado en cero, que parece roto. Mejor decir la
   * verdad: fijo hasta el primer clic.
   */
  const v = await conLatidoGuardado();

  assert.strictEqual(v.capa.hidden, false, "premisa: el halo se ve");
  assert.strictEqual(v.banco.haloLateAhora(), false);
  assert.strictEqual(v.contextos.length, 0, "se conecto audio sin gesto del usuario");
});

test("EL CASO PEDIDO: el propio ✨ es gesto — apagar y encender arranca el latido, y el golpe llega a SU variable", async () => {
  const v = await conLatidoGuardado();

  v.banco.pulsarHalo(); // apagar: el primer clic ya cuenta como gesto
  v.banco.pulsarHalo(); // encender: ahora si hay gesto en la sesion

  assert.strictEqual(v.banco.haloLateAhora(), true, "con gesto y latido guardado no late");
  assert.strictEqual(v.contextos.length, 1, "no se monto el analizador");

  golpear(v);

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "1.000");
});

test("el gesto del 📊 tambien desbloquea el latido, y los dos comparten UN analizador", async () => {
  /*
   * Cualquier clic que conecte audio vale, no solo el ✨: si el espectro
   * ya esta midiendo, el AudioContext ya esta despierto y no dejar latir
   * al halo seria un formalismo. Y tiene que ser EL MISMO contexto: dos
   * analizadores para el mismo audio es el fallo que la pareja
   * espectro/pulso ya tiene resuelto.
   */
  const v = await conLatidoGuardado();

  v.banco.pulsarEspectro();

  assert.strictEqual(v.banco.haloLateAhora(), true, "el gesto del espectro no desperto el latido");
  assert.strictEqual(v.contextos.length, 1, `se montaron ${v.contextos.length} AudioContext`);
});

/* ------------------------------------------------------------------
 * Variables separadas: el halo no mueve la caratula ni al reves
 * ------------------------------------------------------------------ */

test("el halo late con --ytmpip-halo-golpe y la caratula se queda quieta", async () => {
  const v = await conLatidoGuardado();
  v.banco.pulsarHalo();
  v.banco.pulsarHalo();

  golpear(v);

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "1.000", "premisa: el halo late");
  assert.strictEqual(
    v.raiz.style.getPropertyValue("--ytmpip-pulse"),
    "0.000",
    "el latido del halo movio la caratula sin que nadie pulsara el 💓"
  );
});

test("y al reves: el 💓 encendido con el halo fijo no hace brillar el borde", () => {
  const v = ventana();
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(sinVideo());
  aplicar(v); // halo de serie: encendido y fijo

  v.banco.pulsarPulso();
  golpear(v);

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "premisa: la caratula late");
  assert.strictEqual(
    v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"),
    "0.000",
    "el pulso de la caratula hizo latir un halo que se pidio fijo"
  );
});

/* ------------------------------------------------------------------
 * Apagados y escenarios
 * ------------------------------------------------------------------ */

test("apagar el halo a mitad de un golpe devuelve la luz de base y suelta el analizador", async () => {
  /*
   * Las dos cosas que un apagado puede dejarse encendidas: la variable con
   * el ultimo golpe escrito (el borde brillando de mas para siempre) y un
   * AudioContext midiendo para nadie.
   */
  const v = await conLatidoGuardado();
  v.banco.pulsarHalo();
  v.banco.pulsarHalo();
  golpear(v);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "1.000", "premisa");

  v.banco.pulsarHalo();

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "0.000", "el borde se quedo brillando");
  assert.strictEqual(v.contextos[0].state, "closed", "el analizador se quedo midiendo para nadie");
});

test("apagar el halo CON LA CARATULA LATIENDO: la luz vuelve a la base aunque la animacion siga", async () => {
  /*
   * La pareja de la prueba anterior, y no es redundante: alli el apagado
   * tambien PARA la animacion, y pararAnimacion pone su propio cero de
   * cortesia — el cero de sincronizarEspectro queda enmascarado. Aqui el
   * 💓 mantiene viva la animacion, pararAnimacion no corre, y el unico
   * cero posible es el del apagado en si. Sin el, el borde se queda con
   * el ultimo golpe para siempre mientras la caratula sigue bailando.
   */
  const v = await conLatidoGuardado();
  v.banco.pulsarPulso(); // gesto + caratula latiendo: la animacion no parara
  golpear(v);
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "1.000", "premisa");

  v.banco.pulsarHalo(); // apagar el halo; el 💓 sigue

  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "0.000", "el borde se quedo brillando");
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-pulse"), "1.000", "apagar el halo le quito el golpe a la caratula");
  assert.strictEqual(v.contextos[0].state, "running", "apagar el halo solto un analizador que el 💓 sigue usando");
});

test("con la letra en grande el halo queda FIJO, el espectro no se cuela y el gesto no se gasta", async () => {
  /*
   * Tres decisiones en una. El latido se para porque mantener `conectado`
   * vivo enseñaria el canvas del espectro debajo de la letra (la regresion
   * documentada en sincronizarEspectro); la CAPA se queda, porque el borde
   * si se ve leyendo; y el AudioContext NO se suelta, porque al salir de la
   * letra el latido tiene que volver solo, sin pedirle otro clic al usuario.
   */
  const v = ventana({ storage: { haloMode: "pulse" } });
  conAudio(conTiempos(v.Adapter.getPageMediaElement(), 35, 220));
  v.PipView.onStateUpdate(conLetra());
  await v.Settings.load();
  v.banco.pulsarHalo();
  v.banco.pulsarHalo();
  assert.strictEqual(v.banco.haloLateAhora(), true, "premisa: late");

  v.banco.pulsarAlternarVideo(); // la letra ocupa el escenario

  assert.strictEqual(v.banco.haloLateAhora(), false, "se late debajo de la letra");
  assert.strictEqual(v.raiz.style.getPropertyValue("--ytmpip-halo-golpe"), "0.000");
  assert.strictEqual(v.capa.hidden, false, "la letra en grande apago la capa entera");
  assert.strictEqual(v.lienzo.hidden, true, "el espectro se colo sin que nadie lo pidiera");
  assert.strictEqual(v.contextos[0].state, "running", "se solto el contexto y el gesto se perdio");

  v.banco.pulsarAlternarVideo(); // vuelve la portada

  assert.strictEqual(v.banco.haloLateAhora(), true, "al salir de la letra el latido no volvio solo");
});

test("sin audio capturable (Spotify) el latido guardado no puede latir, pero el halo se queda fijo", async () => {
  /*
   * En Spotify no hay captureStream que valga: puedeMedirse dice que no y
   * conectar falla. El halo no debe desaparecer por eso — fijo es
   * exactamente lo que se puede cumplir alli — y el boton ✨ sigue
   * ofreciendose, porque encender y apagar una luz fija no pide audio.
   */
  const v = ventana({ storage: { haloMode: "pulse" } });
  // Sin conAudio: el <video> del fixture no se deja capturar.
  v.PipView.onStateUpdate(sinVideo());
  await v.Settings.load();
  v.banco.pulsarHalo();
  v.banco.pulsarHalo();

  assert.strictEqual(v.banco.haloLateAhora(), false);
  assert.strictEqual(v.capa.hidden, false, "el halo desaparecio por no poder latir");
  assert.strictEqual(v.boton.hidden, false, "el ✨ se escondio como si dependiera del audio");
});

/* ------------------------------------------------------------------
 * El color del halo (tanda K): "accent" o un hex, por la FORMA
 * ------------------------------------------------------------------ */

test("de serie el color es el del tema: la capa NO lleva la variable en linea", () => {
  /*
   * La ausencia ES el mecanismo: sin --ytmpip-halo-color en linea, la
   * cadena del CSS cae a var(--ytmpip-accent) y el halo sigue al tema
   * solo. Si aqui apareciera un hex copiado del tema, cambiar de tema
   * dejaria el halo con el color viejo.
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  aplicar(v);

  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "");
});

test("un color mio se escribe en linea sobre la capa, y volver al tema lo QUITA", () => {
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());

  aplicar(v, { haloColor: "#00ff88" });
  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "#00ff88");

  aplicar(v, { haloColor: "accent" });
  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "",
    "volver al tema dejo el color viejo escrito en linea"
  );
});

test("el color guardado entra por storage ya saneado: minusculas y pintado sin gesto ninguno", async () => {
  /*
   * El camino real completo: storage -> normalizarColorDeHalo (que baja a
   * minusculas) -> sincronizarHalo -> variable en linea. Sin clics ni
   * audio: el color es preferencia pura, no necesita gesto como el latido.
   */
  const v = ventana({ storage: { haloColor: "#ABCDEF" } });
  v.PipView.onStateUpdate(sinVideo());
  await v.Settings.load();

  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "#abcdef");
  assert.strictEqual(v.contextos.length, 0, "pintar el color monto un analizador");
});

/* ------------------------------------------------------------------
 * El halo segun la caratula (tanda M): el tercer modo, "source"
 *
 * El muestreo en si (leer pixeles) no se puede ejercitar en jsdom y ya
 * esta probado en pip-color-fuente.test.js; aqui se prueba LA COSTURA:
 * que el color muestreado llegue a la variable del halo, que sin color
 * la variable se quite (caer al acento), y que el olvido del muestreo
 * limpie el halo SOLO cuando el halo sigue a la fuente.
 * ------------------------------------------------------------------ */

test('EL TERCER MODO: "source" guardado pinta el color muestreado en la capa, sin gesto ninguno', async () => {
  /*
   * El camino real completo, como el del hex de arriba: storage ->
   * normalizarColorDeHalo (que desde esta tanda deja pasar "source") ->
   * sincronizarHalo -> pintarColorFuenteEnHalo -> variable en linea. El
   * color entra por la puerta de atras del banco porque jsdom no pinta
   * pixeles; lo que se prueba es que, puesto un color, el halo lo lleve.
   * Sin clics y sin analizador: el color es preferencia, no latido.
   */
  const v = ventana({ storage: { haloColor: "source" } });
  v.PipView.onStateUpdate(sinVideo());
  v.banco.fijarColorFuente({ h: 355, s: 0.7, l: 0.49 });
  await v.Settings.load();

  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "hsl(355, 70%, 49%)",
    "el color muestreado no llego al borde"
  );
  assert.strictEqual(v.contextos.length, 0, "seguir a la caratula monto un analizador");
});

test('"source" SIN color muestreado QUITA la variable: portada en blanco y negro es caer al tema', () => {
  /*
   * Se parte de un hex escrito para que quitar sea distinguible de no
   * haber escrito nunca: si el cambio a "source" dejara el hex viejo, el
   * borde mentiria con el color propio anterior; si escribiera algo, una
   * portada gris pintaria un color inventado. La ausencia es la promesa
   * documentada: var(--ytmpip-halo-color, var(--ytmpip-accent)).
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());

  aplicar(v, { haloColor: "#00ff88" });
  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "#00ff88", "premisa");

  aplicar(v, { haloColor: "source" }); // sin fijarColorFuente: no hay nada muestreado

  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "",
    "sin color de la fuente el borde tenia que caer al acento, no quedarse con el hex viejo"
  );
});

test("apagar el halo OLVIDA el color muestreado: reabrirlo no brilla con la cancion de antes", async () => {
  /*
   * La misma mentira con retraso que ya vigila pip-color-fuente para las
   * barras, en version halo: apagar la capa para el muestreo (nadie mas
   * lo queria) y el olvido tiene que limpiar tambien la variable del
   * borde. Sin esa limpieza, volver a encender media hora despues
   * pintaria el halo con el color de una cancion que ya no suena.
   */
  const v = ventana({ storage: { haloColor: "source" } });
  v.PipView.onStateUpdate(sinVideo());
  v.banco.fijarColorFuente({ h: 8, s: 0.49, l: 0.3 });
  await v.Settings.load();
  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "hsl(8, 49%, 30%)", "premisa");

  aplicar(v, { haloPreference: "hidden", haloColor: "source" });

  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "",
    "el color de la ultima cancion se quedo escrito en el borde apagado"
  );
});

test("la limpieza del olvido vive en el APAGADO DEL MUESTREO mismo, no en el repintado de preferencias", async () => {
  /*
   * En applySettings el apagado va seguido de sincronizarHalo, que
   * repinta el halo y ENMASCARARIA una limpieza ausente: quitarle a
   * pararMuestreoFuente su llamada al pintor pasaria la prueba de arriba
   * igual. Pero render() tambien apaga el muestreo (cada estado con el
   * espectro escondido pasa por ahi) y despues de ese apagado nadie
   * repinta el halo: la unica limpieza posible es la del propio
   * pararMuestreoFuente. Aqui se le llama directo, como render lo hace,
   * y la variable tiene que salir limpia de esa llamada sola.
   */
  const v = ventana({ storage: { haloColor: "source" } });
  v.PipView.onStateUpdate(sinVideo());
  v.banco.fijarColorFuente({ h: 120, s: 0.6, l: 0.45 });
  await v.Settings.load();
  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "hsl(120, 60%, 45%)", "premisa");

  v.banco.sincronizarColorFuente(false, {
    spectrumColor: "accent",
    haloPreference: "hidden",
    haloColor: "source"
  });

  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "",
    "el apagado del muestreo dejo el color viejo escrito, esperando a que otro lo limpie"
  );
});

test("el olvido del muestreo NO toca un hex propio: el pintor se abstiene si el halo no sigue a la fuente", () => {
  /*
   * El muestreo puede encenderse y apagarse por el OTRO cliente (el
   * espectro en modo fuente) mientras el halo va con su color propio. El
   * apagado limpia llamando al pintor del halo con el objetivo ya en
   * null, y sin la guarda de haloSigueLaFuente esa llamada arrancaria el
   * hex elegido — el usuario veria su color desaparecer por apagar las
   * barras, que no tienen nada que ver.
   */
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());
  aplicar(v, { haloColor: "#00ff88" });
  assert.strictEqual(v.capa.style.getPropertyValue("--ytmpip-halo-color"), "#00ff88", "premisa");

  // El espectro pide muestreo y luego lo suelta; el halo ni entra ni sale.
  v.banco.sincronizarColorFuente(true, { spectrumColor: "source" });
  v.banco.sincronizarColorFuente(false, { spectrumColor: "source" });

  assert.strictEqual(
    v.capa.style.getPropertyValue("--ytmpip-halo-color"),
    "#00ff88",
    "apagar el muestreo del espectro borro el color propio del halo"
  );
});

test("el suavizado del color muestreado es de la hoja: transition de box-shadow, sin bucle de fotogramas", () => {
  /*
   * La decision contada en pintarColorFuenteEnHalo: el halo NO tiene rAF
   * propio y la ventana escribe el color objetivo DE GOLPE; quien lo
   * acerca despacio es pip.css con una transition de box-shadow. Si la
   * transition desapareciera, el codigo seguiria "funcionando" y el
   * borde saltaria de color a tirones dos veces y media por segundo en
   * modo video — justo el tiron que el espectro evita con mezclarHsl.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const sinComentarios = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    cuerpo: m[2]
  }));
  const capa = reglas.find((r) => r.selector === "#ytmpip-halo");

  assert.ok(capa, "no hay regla propia para la capa del halo");
  assert.match(
    capa.cuerpo,
    /transition:[^;]*box-shadow/,
    "el color muestreado llegaria de golpe: falta la transition que lo suaviza"
  );
});

/* ------------------------------------------------------------------
 * La decision visual, leida de la hoja
 * ------------------------------------------------------------------ */

test("LA DECISION ES DE pip.css: sombra interior del acento, opacidad leyendo el golpe, sin robar clics", () => {
  /*
   * jsdom no maqueta, asi que esto no prueba que se vea bien: prueba que
   * la decision exista y este donde se dijo. Sombra INTERIOR porque la
   * ventana es un rectangulo opaco del sistema y fuera del borde no hay
   * lienzo; opacidad y no box-shadow animado porque la opacidad la
   * compone el compositor sin repintar; pointer-events none porque debajo
   * estan los mandos.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const sinComentarios = hoja.replace(/\/\*[\s\S]*?\*\//g, "");
  const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    cuerpo: m[2]
  }));
  const capa = reglas.find((r) => r.selector === "#ytmpip-halo");

  assert.ok(capa, "no hay regla propia para la capa del halo");
  /*
   * La cadena entera y no solo el acento: var(--ytmpip-halo-color,
   * var(--ytmpip-accent)). Sin el respaldo, elegir "el del tema" en
   * Preferencias dejaria el halo sin color (la ventana QUITA la variable
   * en ese caso, no escribe el hex del tema); sin la variable, el color
   * elegido no llegaria nunca. Buscar solo var(--ytmpip-accent) pasaria
   * con ambas roturas, porque es subcadena del respaldo.
   */
  assert.match(
    capa.cuerpo,
    /box-shadow:[\s\S]*inset[\s\S]*var\(--ytmpip-halo-color,\s*var\(--ytmpip-accent\)\)/,
    "la luz no es interior o no cae al acento cuando no hay color propio"
  );
  assert.match(capa.cuerpo, /opacity:[\s\S]*var\(--ytmpip-halo-golpe/, "el golpe no mueve la opacidad");
  assert.doesNotMatch(capa.cuerpo, /var\(--ytmpip-pulse[,)]/, "el halo lee la variable de la caratula");
  assert.match(capa.cuerpo, /pointer-events:\s*none/, "la capa roba los clics de los mandos");
});

test("quien pide menos movimiento se queda con la luz fija: la fuerza del latido se anula en CSS", () => {
  /*
   * En CSS y no en JavaScript, como el pulso de la caratula: el analizador
   * puede seguir midiendo (el espectro quiza este encendido) y lo unico
   * que desaparece es el movimiento. Se busca un bloque reduce que anule
   * --ytmpip-halo-fuerza para la capa.
   */
  const hoja = fs.readFileSync(path.join(RAIZ, "src/pip/pip.css"), "utf8");
  const bloques = [...hoja.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)];
  const elDelHalo = bloques.find((b) => /#ytmpip-halo/.test(b[1]));

  assert.ok(elDelHalo, "ningun bloque de movimiento reducido conoce al halo");
  assert.match(elDelHalo[1], /--ytmpip-halo-fuerza:\s*0/, "se anula otra cosa que no es la fuerza del latido");
});

test("el boton tiene icono propio y no se queda con el emoji de respaldo", () => {
  const v = ventana();
  v.PipView.onStateUpdate(sinVideo());

  assert.strictEqual(v.boton.dataset.ico, "halo");
  assert.ok(v.win.YTMPip.Iconos.NOMBRES.includes("halo"), "no hay dibujo para el halo");
  assert.ok(v.boton.querySelector("svg"), "el boton se quedo con el emoji");
});
