/*
 * DIAGNOSTICO: ¿EL PULSO SIGUE DE VERDAD AL BOMBO?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA CANCION SONANDO, a poder ser una que
 * tenga bombo marcado.
 *
 * ------------------------------------------------------------------
 * ESTE SE PUEDE DESHACER
 * ------------------------------------------------------------------
 * Usa `captureStream()`, que entrega una COPIA del audio y deja el elemento
 * sonando por donde sonaba. NO llama a createMediaElementSource, asi que no
 * cruza la puerta de un solo sentido que describe diagnostico-ecualizador.js
 * y no puede dejar la musica muda. `ytmpipPulso.parar()` lo suelta todo.
 *
 * ------------------------------------------------------------------
 * QUE SE ESTA COMPROBANDO, Y POR QUE HACE FALTA COMPROBARLO
 * ------------------------------------------------------------------
 *
 *  1. ¿HAY RESOLUCION PARA VER LOS GRAVES? La extension usa fftSize 2048
 *     para esto y 256 para las barras, y no por gusto: a 256 hay 172 Hz por
 *     banda y los graves enteros (20-120 Hz) caben dentro de la banda 0, que
 *     ademas es la componente continua. Aqui se imprime el reparto real con
 *     el sampleRate de esta maquina, que no tiene por que ser 44100.
 *
 *  2. ¿SE MUEVE EL NUMERO? Un nivel de graves que no varia es una linea
 *     plana disfrazada de pulso. Se mide el recorrido en dB durante unos
 *     segundos: si los graves no suben y bajan varios dB, no hay nada que
 *     enseñar y el efecto sobra.
 *
 *  3. ¿EL 0..1 QUE SALE ES USABLE? Es la pregunta que las pruebas no pueden
 *     contestar. Un pulso que se pasa la cancion pegado al 1 no late: esta
 *     encendido. Uno que nunca pasa de 0,1 no se ve. Se imprime el reparto
 *     —cuanto tiempo pasa en cada tramo— y cuantos golpes claros ha contado.
 *
 *  4. ¿LA MEDIDA TRAE DATO? Anadida despues, y por vergüenza propia: en la
 *     primera medicion real salieron 312 fotogramas sin dato de 483 y este
 *     mismo archivo dictamino "pulso usable", porque las tres preguntas de
 *     arriba no miraban esa cifra. Ahora, si faltan mas del 10 % de los
 *     fotogramas, NO SE DICTAMINA: con la mitad de la senal agujereada, el
 *     reparto de abajo no describe el pulso, describe los huecos.
 *
 * NADA DE ESTO DICE SI QUEDA BONITO. Eso se mira, no se calcula.
 *
 *   ytmpipPulso.parar()   suelta el audio y deja de imprimir
 */
(function () {
  const ANTERIOR = self.ytmpipPulso;
  if (ANTERIOR && typeof ANTERIOR.parar === "function") ANTERIOR.parar();

  const log = (...a) => console.log("[pulso]", ...a);
  const dB = (n) => (Number.isFinite(n) ? n.toFixed(1) + " dB" : "silencio");

  /* Los MISMOS numeros que src/content/audio-spectrum.js. Si aqui se tocan
   * y alli no, este diagnostico deja de describir la extension y pasa a
   * describir otra cosa parecida. */
  const TAMANO_FFT = 2048;
  const DESDE_HZ = 20;
  const HASTA_HZ = 120;
  const MS_ADAPTACION = 1500;
  const GOLPE_DB = 9;
  const MS_CAIDA = 250;

  const video = document.querySelector("video");
  if (!video) {
    log("no hay <video> en la pagina: abre una cancion primero.");
    return;
  }
  if (video.mediaKeys) {
    log("la pista viene cifrada (mediaKeys): no hay nada que medir.");
    return;
  }
  if (typeof video.captureStream !== "function") {
    log("este navegador no expone captureStream().");
    return;
  }

  let ctx = null;
  let stream = null;
  let bucle = null;

  function parar() {
    if (bucle !== null) cancelAnimationFrame(bucle);
    bucle = null;
    try {
      if (ctx && ctx.state !== "closed") ctx.close();
    } catch (err) {
      /* cerrar dos veces no es un problema de nadie */
    }
    ctx = null;
    stream = null;
    log("suelto. La musica no se ha enterado en ningun momento.");
  }

  try {
    stream = video.captureStream();
  } catch (err) {
    log("captureStream() ha fallado:", err);
    return;
  }
  if (!stream || !stream.getAudioTracks().length) {
    log("el stream capturado no trae audio.");
    return;
  }

  ctx = new (self.AudioContext || self.webkitAudioContext)();
  const fuente = ctx.createMediaStreamSource(stream);
  const analizador = ctx.createAnalyser();
  analizador.fftSize = TAMANO_FFT;
  // Cero, igual que en la extension: suavizar antes de medir un cambio es
  // medir otra cosa.
  analizador.smoothingTimeConstant = 0;
  fuente.connect(analizador);
  // La cadena NO llega a ctx.destination: sonaria una segunda vez, con eco.
  const bandas = new Float32Array(analizador.frequencyBinCount);

  const hzPorBanda = ctx.sampleRate / 2 / bandas.length;
  const primera = Math.max(1, Math.floor(DESDE_HZ / hzPorBanda));
  const ultima = Math.min(bandas.length - 1, Math.ceil(HASTA_HZ / hzPorBanda));

  log("PARTE 1: ¿hay resolucion para ver los graves?");
  log("  sampleRate:", ctx.sampleRate, "Hz");
  log("  fftSize:", TAMANO_FFT, "->", bandas.length, "bandas");
  log("  " + hzPorBanda.toFixed(1) + " Hz por banda");
  log(
    "  " + DESDE_HZ + "-" + HASTA_HZ + " Hz = bandas " + primera + " a " + ultima,
    "(" + (ultima - primera + 1) + " bandas)"
  );
  if (ultima < primera) {
    log("  ATENCION: no queda ninguna banda dentro del rango. Nada que medir.");
    parar();
    return;
  }
  if (primera <= 1 && ultima <= 2) {
    log("  ATENCION: una o dos bandas, y pegadas a la componente continua.");
    log("  A esta resolucion 'los graves' y 'el ruido de 0 Hz' son el mismo numero.");
  }

  function nivelDb() {
    analizador.getFloatFrequencyData(bandas);
    let suma = 0;
    let cuenta = 0;
    for (let i = primera; i <= ultima; i++) {
      if (Number.isFinite(bandas[i])) {
        suma += bandas[i];
        cuenta++;
      }
    }
    return cuenta ? suma / cuenta : -Infinity;
  }

  /* ---- estado del pulso, calcado de audio-spectrum.js ---- */
  let baseDb = null;
  let pulso = 0;
  let msUltimo = 0;

  /* ---- lo que se va observando ---- */
  let minNivel = Infinity;
  let maxNivel = -Infinity;
  let fotogramas = 0;
  let mudos = 0;
  /*
   * LOS AGUJEROS SE MIDEN, NO SE MENCIONAN DE PASADA.
   *
   * La primera version contaba `mudos` y lo imprimia entre parentesis, y
   * despues dictaba veredicto sin mirarlo. En una medicion real salio con
   * 312 de 483 fotogramas sin dato y las tres preguntas contestaron que SI.
   *
   * Un fotograma mudo no es "suena bajito": getFloatFrequencyData solo da
   * -Infinity cuando la magnitud es cero, o sea con el bufer entero a ceros.
   * En una cancion que esta sonando eso es un HUECO en la medida.
   *
   * Y hay que distinguir dos enfermedades que se parecen en el reparto:
   *  - pulso debil: hay dato en todos los fotogramas y aun asi no despega.
   *  - medida con huecos: hay golpes, pero cada racha muda los borra.
   * Por eso el reparto se imprime DOS veces, sobre todos los fotogramas y
   * solo sobre los que traian dato. Si los dos se parecen, el pulso es
   * flojo de verdad; si el segundo esta mucho mas arriba, lo que falla es
   * la captura y bajar GOLPE_DB seria subirle el volumen a una senal que
   * lo que tiene son cortes.
   */
  let rachaMuda = 0;
  let rachaMudaMax = 0;
  let rachasMudas = 0;
  // Cuanto tiempo pasa el pulso en cada quinto de su recorrido. Un reparto
  // con todo en el primer tramo es un efecto invisible; todo en el ultimo es
  // una luz encendida, no un pulso.
  const tramos = [0, 0, 0, 0, 0];
  const tramosConDato = [0, 0, 0, 0, 0];
  let golpes = 0;
  let estabaArriba = false;
  const T0 = performance.now();

  function paso(ms) {
    bucle = requestAnimationFrame(paso);
    const nivel = nivelDb();
    // Sin Math.max: igual que en audio-spectrum.js, de donde se quito por ser
    // la misma regla escrita tres veces. Los dos sitios que usan dt ya
    // preguntan si es mayor que cero.
    const dt = msUltimo > 0 ? ms - msUltimo : 0;
    msUltimo = ms;
    fotogramas++;

    const hayDato = Number.isFinite(nivel);
    if (hayDato) {
      if (rachaMuda > 0) {
        rachasMudas++;
        if (rachaMuda > rachaMudaMax) rachaMudaMax = rachaMuda;
        rachaMuda = 0;
      }
    } else {
      rachaMuda++;
    }

    if (!hayDato) {
      mudos++;
      pulso = Math.max(0, pulso - (dt > 0 ? dt / MS_CAIDA : 1));
    } else {
      if (nivel < minNivel) minNivel = nivel;
      if (nivel > maxNivel) maxNivel = nivel;
      if (baseDb === null) {
        baseDb = nivel;
        pulso = 0;
      } else {
        const exceso = (nivel - baseDb) / GOLPE_DB;
        const crudo = exceso > 0 ? Math.min(1, exceso) : 0;
        baseDb += (nivel - baseDb) * Math.min(1, dt > 0 ? dt / MS_ADAPTACION : 1);
        pulso = crudo >= pulso ? crudo : Math.max(crudo, pulso - (dt > 0 ? dt / MS_CAIDA : 1));
      }
    }

    const tramo = Math.min(4, Math.floor(pulso * 5));
    tramos[tramo]++;
    if (hayDato) tramosConDato[tramo]++;
    // Un golpe se cuenta al CRUZAR hacia arriba, no mientras esta arriba: si
    // no, un pulso pegado al techo contaria sesenta golpes por segundo.
    if (pulso >= 0.5 && !estabaArriba) {
      golpes++;
      estabaArriba = true;
    } else if (pulso < 0.25) {
      estabaArriba = false;
    }
  }

  bucle = requestAnimationFrame(paso);
  log("PARTE 2: midiendo 8 segundos. Deja la cancion sonando.");

  setTimeout(function veredicto() {
    const segundos = (performance.now() - T0) / 1000;
    const recorrido = Number.isFinite(maxNivel) && Number.isFinite(minNivel) ? maxNivel - minNivel : 0;
    const porMinuto = segundos > 0 ? (golpes / segundos) * 60 : 0;

    if (rachaMuda > 0) {
      rachasMudas++;
      if (rachaMuda > rachaMudaMax) rachaMudaMax = rachaMuda;
    }
    const conDato = fotogramas - mudos;
    const parteMuda = fotogramas ? mudos / fotogramas : 1;

    log("--------------------------------------------------");
    log("PARTE 3: lo que ha salido en " + segundos.toFixed(1) + " s");
    log("  fotogramas:", fotogramas, "(" + (fotogramas / segundos).toFixed(0) + " por segundo)");
    log(
      "  sin dato: " + mudos + " (" + (parteMuda * 100).toFixed(1) + " %)" +
        (mudos ? " en " + rachasMudas + " rachas, la mayor de " + rachaMudaMax + " fotogramas" : "")
    );
    log("  estado del contexto:", ctx ? ctx.state : "cerrado");
    log("  graves: entre " + dB(minNivel) + " y " + dB(maxNivel));
    log("  recorrido: " + recorrido.toFixed(1) + " dB   (el umbral de golpe entero es " + GOLPE_DB + " dB)");
    const etiquetas = ["0,0-0,2", "0,2-0,4", "0,4-0,6", "0,6-0,8", "0,8-1,0"];
    for (let i = 0; i < tramos.length; i++) {
      const parte = fotogramas ? (tramos[i] / fotogramas) * 100 : 0;
      const parteUtil = conDato ? (tramosConDato[i] / conDato) * 100 : 0;
      log(
        "  pulso " + etiquetas[i] + ": " + parte.toFixed(1) + " %" +
          "   (solo con dato: " + parteUtil.toFixed(1) + " %)"
      );
    }
    log("  golpes contados:", golpes, "(" + porMinuto.toFixed(0) + " por minuto)");

    const seMueve = recorrido >= 6;
    // Ni clavado abajo ni clavado arriba. Los dos extremos son la misma
    // enfermedad: un numero que no distingue nada.
    //
    // El liston de "abajo del todo" era 0,95 y era una barbaridad: dejaba
    // pasar como bueno un pulso invisible tres cuartas partes del tiempo.
    // Se mide sobre los fotogramas CON DATO, que es donde el efecto puede
    // demostrar algo; los huecos se juzgan aparte, mas abajo.
    const abajoDelTodo = conDato ? tramosConDato[0] / conDato > 0.85 : true;
    const arribaDelTodo = conDato ? tramosConDato[4] / conDato > 0.6 : false;
    const ritmoPlausible = porMinuto >= 30 && porMinuto <= 400;
    // Un fotograma de cada diez sin dato ya se ve: son 100 ms de caida, y la
    // caida entera dura 250.
    const medidaFiable = parteMuda <= 0.1;

    log("--------------------------------------------------");
    log("  ¿la medida trae dato?    " + (medidaFiable ? "SI" : "NO") + " — " + (100 - parteMuda * 100).toFixed(0) + " % de los fotogramas");
    log("  ¿se mueven los graves?   " + (seMueve ? "SI" : "NO") + " — " + recorrido.toFixed(1) + " dB");
    log("  ¿el pulso distingue?     " + (!abajoDelTodo && !arribaDelTodo ? "SI" : "NO"));
    log("  ¿ritmo plausible?        " + (ritmoPlausible ? "SI" : "NO") + " — " + porMinuto.toFixed(0) + "/min");

    if (!medidaFiable) {
      log("VEREDICTO: NO SE PUEDE DICTAMINAR. La captura llega con agujeros.");
      log("   " + (parteMuda * 100).toFixed(0) + " % de los fotogramas no traen ni un dato en 20-120 Hz,");
      log("   y eso no es silencio: es el bufer entero a ceros con la cancion sonando.");
      log("   Cada racha muda le resta al pulso 1 por cada " + MS_CAIDA + " ms, asi que la");
      log("   mayor de aqui (" + rachaMudaMax + " fotogramas) se lo lleva por delante entero.");
      log("   ESO es lo que se ve mal, y no se arregla tocando GOLPE_DB.");
      log("   Antes de tocar nada hay que saber de donde salen los huecos. Sospecha");
      log("   principal: este diagnostico abre SU PROPIA captura del mismo <video>");
      log("   que ya esta capturando la extension, y las dos se estorban. Para");
      log("   descartarlo: apaga el pulso Y el espectro en la ventana flotante y");
      log("   vuelve a correr esto. Si el porcentaje se desploma, el culpable era");
      log("   el propio instrumento y la extension nunca tuvo el problema.");
    } else if (!seMueve) {
      log("VEREDICTO: los graves no se mueven. O la cancion no tiene, o esta pausada.");
      log("   Prueba con algo de bombo marcado antes de dar esto por malo.");
    } else if (abajoDelTodo) {
      log("VEREDICTO: el pulso casi no despega. GOLPE_DB (" + GOLPE_DB + ") pide demasiado.");
      log("   Bajarlo en audio-spectrum.js haria el efecto mas visible.");
    } else if (arribaDelTodo) {
      log("VEREDICTO: el pulso vive pegado al techo: eso no late, esta encendido.");
      log("   Subir GOLPE_DB, o acortar MS_ADAPTACION para que la referencia siga mas de cerca.");
    } else {
      log("VEREDICTO: los numeros dan un pulso usable.");
      log("   Lo unico que queda es MIRARLO: si queda bien no lo dice ningun numero.");
    }
    log("   Cuando termines:  ytmpipPulso.parar()");
  }, 8000);

  self.ytmpipPulso = { parar };
  log("listo. Para cortar antes de tiempo:  ytmpipPulso.parar()");
})();
