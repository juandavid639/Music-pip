/*
 * DIAGNOSTICO: ¿SE PUEDEN LEER LOS PIXELES DEL VIDEO?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com, CON UN VIDEO SONANDO Y VIENDOSE (no vale una
 * cancion que solo tenga caratula: aqui se mide el video). NO hace falta
 * abrir la ventana flotante.
 *
 * POR QUE EXISTE, Y POR QUE ES OTRO ARCHIVO
 *
 * Su hermano `diagnostico-color-portada.js` pregunta lo mismo sobre la
 * caratula, y aquello se aparco sin llegar a correrlo. Ahora se ha pedido
 * ademas que el espectro tome el color DEL VIDEO. Parece la misma pregunta
 * y no lo es, por tres motivos que hacen que una pueda salir bien y la otra
 * mal:
 *
 *   1. La caratula es una imagen de otro dominio y todo depende de una
 *      cabecera CORS. El video no llega por una URL de otro dominio: llega
 *      por MSE, o sea, la propia pagina se descarga los trozos y se los da
 *      al elemento. El `src` es un `blob:` del mismo origen. Las reglas de
 *      contaminacion son otras.
 *   2. El video puede estar CIFRADO (EME/Widevine). Un video protegido no
 *      se deja dibujar en un canvas ni aunque el origen sea correcto: sale
 *      negro o lanza. `audio-spectrum.js` ya esquiva ese caso para el audio
 *      —mira `video.mediaKeys`— y aqui hay que mirarlo igual.
 *   3. La caratula se lee UNA vez por cancion. El video cambia sesenta
 *      veces por segundo, asi que ademas de "¿se puede?" hay que contestar
 *      "¿cuanto cuesta?" y "¿el color se esta quieto o parpadea?". Un color
 *      correcto que salte en cada plano convierte el espectro en una luz de
 *      discoteca, y eso no es lo que se ha pedido.
 *
 * Yo NO puedo contestar nada de esto desde aqui: depende del navegador y de
 * lo que sirva Google hoy. Asi que en vez de escribir la funcion y cruzar
 * los dedos, esto lo mide.
 *
 * COMO SE USA
 *
 *   1. Pon una cancion QUE TENGA VIDEO y dejala reproduciendose a la vista.
 *   2. Pega esto en la consola de la PESTAÑA.
 *   3. Espera unos 4 segundos (toma varias muestras a proposito).
 *   4. Copiame lo que imprima, entero. Los veredictos son las lineas en rojo
 *      o las que empiezan por VEREDICTO.
 *
 * QUE MIDE, Y POR QUE CADA COSA
 *
 *   A. Que clase de video es: si esta cifrado, de donde viene el `src`, si
 *      tiene fotogramas listos. Sin esto, un fallo mas abajo no se sabe
 *      interpretar.
 *   B. Si drawImage() + getImageData() funcionan. La pregunta que decide si
 *      la funcion existe o no existe.
 *   C. Cuanto tarda una lectura. Si costara varios milisegundos habria que
 *      leer de tarde en tarde, no en cada fotograma, y eso cambia el diseño.
 *   D. Cuanto se MUEVE el color a lo largo de unos segundos. Es lo que dice
 *      si hace falta suavizado y de cuanto.
 *
 * No envia nada a ningun sitio, no toca la pagina y no altera la
 * reproduccion: solo dibuja fotogramas en un canvas suelto de 16x16 que
 * nunca se inserta en el documento.
 */
(function () {
  const log = (...args) => console.log("%c[video]", "color:#5ac8f1;font-weight:bold", ...args);
  const mal = (...args) => console.log("%c[video]", "color:#f15a5a;font-weight:bold", ...args);

  /*
   * El mismo orden de prioridad que usa el adaptador de la extension.
   * Copiarlo aqui es a proposito: este archivo no se empaqueta y no puede
   * importar nada de src/. Si el selector estuviera roto, prefiero que este
   * diagnostico lo diga en vez de heredar el fallo en silencio.
   */
  const SELECTORES = ["ytmusic-player video", "#movie_player video", "video"];

  let video = null;
  for (const sel of SELECTORES) {
    const encontrado = document.querySelector(sel);
    if (encontrado) {
      video = encontrado;
      log("video encontrado con el selector:", sel);
      break;
    }
  }

  if (!video) {
    mal("No hay ningun <video> en la pagina.");
    mal("Pon una cancion y vuelve a pegar esto. Si ya hay una sonando, avisame:");
    mal("significaria que el selector del video tambien esta roto.");
    return;
  }

  log("--- A. que clase de video es ---");
  log("origen del src:", (video.currentSrc || video.src || "(sin src)").slice(0, 60) + "…");
  log("por MSE (blob:):", (video.currentSrc || "").startsWith("blob:") ? "SI" : "NO");
  log("cifrado (mediaKeys):", video.mediaKeys ? "SI — esto casi seguro lo impide" : "no");
  log("tamaño real del video:", video.videoWidth + "x" + video.videoHeight);
  log("readyState:", video.readyState, "(hacen falta 2 o mas para que haya fotograma)");
  log("reproduciendose:", !video.paused && !video.ended ? "SI" : "NO — parado");

  if (!video.videoWidth || !video.videoHeight) {
    mal("El video no tiene dimensiones: o es una cancion SIN video (solo caratula),");
    mal("o todavia no ha cargado. Pon una que tenga video de verdad y repite.");
    mal("VEREDICTO: no concluyente.");
    return;
  }

  /*
   * 16x16 y no el tamaño real, por lo mismo que en el diagnostico de la
   * caratula: para saber que color manda no hacen falta dos millones de
   * pixeles, el navegador ya promedia al reescalar, y getImageData sobre un
   * fotograma entero es lento de verdad. Aqui ademas importa el doble,
   * porque esto correria muchas veces por segundo.
   */
  const LADO = 16;
  const lienzo = document.createElement("canvas");
  lienzo.width = LADO;
  lienzo.height = LADO;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });

  function leerPixeles() {
    ctx.drawImage(video, 0, 0, LADO, LADO);
    // AQUI salta la SecurityError si el canvas esta contaminado.
    return ctx.getImageData(0, 0, LADO, LADO).data;
  }

  /*
   * El color "que mas manda" NO es la media de los pixeles: la media de un
   * fotograma con rojo y verde es un marron que no esta en la imagen. Se
   * cuenta por cubos de tono y gana el mas repetido, ignorando lo casi gris
   * y lo casi negro/blanco, que en un video suele ser fondo, letterbox o
   * sombra y no color.
   *
   * Es la MISMA funcion que la del diagnostico de la caratula, copiada a
   * proposito: si el color del video y el de la portada se midieran con
   * criterios distintos, comparar los dos resultados no diria nada. Cuando
   * esto se implemente de verdad ira en shared/ una sola vez y con pruebas.
   */
  function colorQueManda(datos) {
    const cubos = new Map();
    let vivos = 0;
    for (let i = 0; i < datos.length; i += 4) {
      const r = datos[i] / 255;
      const g = datos[i + 1] / 255;
      const b = datos[i + 2] / 255;
      if (datos[i + 3] < 128) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luz = (max + min) / 2;
      const delta = max - min;
      if (delta < 0.12) continue;
      if (luz < 0.12 || luz > 0.93) continue;

      let tono;
      if (max === r) tono = 60 * (((g - b) / delta) % 6);
      else if (max === g) tono = 60 * ((b - r) / delta + 2);
      else tono = 60 * ((r - g) / delta + 4);
      if (tono < 0) tono += 360;

      const saturacion = delta / (1 - Math.abs(2 * luz - 1));
      const cubo = Math.floor(tono / 15);
      const previo = cubos.get(cubo) || { n: 0, tono: 0, sat: 0, luz: 0 };
      previo.n += 1;
      previo.tono += tono;
      previo.sat += saturacion;
      previo.luz += luz;
      cubos.set(cubo, previo);
      vivos += 1;
    }

    if (!vivos) return null;

    let mejor = null;
    cubos.forEach((v) => {
      if (!mejor || v.n > mejor.n) mejor = v;
    });

    return {
      tono: Math.round(mejor.tono / mejor.n),
      sat: Math.round((mejor.sat / mejor.n) * 100),
      luz: Math.round((mejor.luz / mejor.n) * 100),
      mandaSobre: Math.round((mejor.n / vivos) * 100),
      pixelesConColor: vivos
    };
  }

  /** Distancia entre dos tonos por el camino corto: de 350 a 10 hay 20, no 340. */
  function distanciaDeTono(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  log("--- B. ¿deja leer los pixeles? ---");
  let primera;
  try {
    primera = leerPixeles();
  } catch (err) {
    mal("drawImage/getImageData ha lanzado:", err && err.name, "-", err && err.message);
    if (video.mediaKeys) {
      mal("El video esta CIFRADO (mediaKeys). Era el sospechoso numero uno.");
      mal("VEREDICTO: NO SE PUEDE con este video. Prueba con otro que no sea");
      mal("de pago/protegido antes de darlo por imposible del todo.");
    } else {
      mal("El canvas esta CONTAMINADO: el video se ve pero no se puede leer.");
      mal("VEREDICTO: NO SE PUEDE. Lo del video habria que descartarlo, y quedaria");
      mal("solo el color de la caratula (ver diagnostico-color-portada.js).");
    }
    return;
  }
  log("SI: getImageData() ha devuelto", primera.length / 4, "pixeles.");

  log("--- C. ¿cuanto cuesta una lectura? ---");
  const VUELTAS = 30;
  const t0 = performance.now();
  for (let i = 0; i < VUELTAS; i++) leerPixeles();
  const porLectura = (performance.now() - t0) / VUELTAS;
  log("media de", VUELTAS, "lecturas:", porLectura.toFixed(3), "ms");
  if (porLectura > 2) {
    mal("Eso es CARO para hacerlo en cada fotograma (16 ms de presupuesto).");
    mal("Habria que leer de tarde en tarde e interpolar entre lecturas.");
  } else {
    log("Barato. Aun asi, leer en cada fotograma sobra: ver la parte D.");
  }

  log("--- D. ¿el color se esta quieto o parpadea? ---");
  log("Tomando muestras cada 250 ms durante 4 segundos. Espera…");

  const muestras = [];
  let n = 0;
  const reloj = setInterval(() => {
    n++;
    let color = null;
    try {
      color = colorQueManda(leerPixeles());
    } catch (err) {
      /* si empieza a fallar a mitad, se vera en el recuento de abajo */
    }
    if (color) muestras.push(color);

    if (n < 16) return;
    clearInterval(reloj);

    if (!muestras.length) {
      mal("Ninguna de las 16 muestras ha dado un color con fuerza.");
      mal("El video es gris, muy oscuro o muy claro casi todo el rato.");
      mal("VEREDICTO: SE PUEDE LEER, pero hara falta un plan B para estos casos");
      mal("(lo razonable: volver al color del tema cuando no hay color que sacar).");
      return;
    }

    log("muestras con color:", muestras.length, "de 16");

    let saltoMaximo = 0;
    let saltoTotal = 0;
    for (let i = 1; i < muestras.length; i++) {
      const salto = distanciaDeTono(muestras[i].tono, muestras[i - 1].tono);
      saltoTotal += salto;
      if (salto > saltoMaximo) saltoMaximo = salto;
    }
    const saltoMedio = muestras.length > 1 ? saltoTotal / (muestras.length - 1) : 0;

    log("salto de tono entre muestras: medio", Math.round(saltoMedio) + "°,", "maximo", saltoMaximo + "°");

    for (const m of muestras.slice(-6)) {
      const css = `hsl(${m.tono}, ${m.sat}%, ${m.luz}%)`;
      console.log(
        "%c     " + css + " — manda sobre el " + m.mandaSobre + "%     ",
        `background:${css};color:#fff;font-weight:bold;padding:4px;border-radius:4px;text-shadow:0 1px 2px #000`
      );
    }
    log("MIRA las muestras de arriba y comparalas con lo que se ve en el video.");

    if (saltoMedio > 45) {
      mal("VEREDICTO: SE PUEDE, PERO el color salta mucho de una muestra a otra.");
      mal("Tal cual, las barras parpadearian. Hace falta suavizado fuerte");
      mal("(mover el tono poco a poco hacia el nuevo, no cambiarlo de golpe).");
    } else {
      log("VEREDICTO: SE PUEDE, y el color se esta razonablemente quieto.");
      log("Con un suavizado suave deberia bastar.");
    }
    log("Dime si los colores de arriba pegan con el video o no pegan nada.");
  }, 250);
})();
