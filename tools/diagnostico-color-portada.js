/*
 * DIAGNOSTICO: ¿SE PUEDEN LEER LOS PIXELES DE LA PORTADA?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com, CON UNA CANCION SONANDO (o al menos
 * cargada, para que la barra de abajo tenga portada). NO hace falta abrir
 * la ventana flotante.
 *
 * POR QUE EXISTE
 *
 * Se propuso sacar el color del espectro de la portada de la cancion. La
 * idea es de una linea: se dibuja la imagen en un <canvas>, se leen los
 * pixeles con getImageData() y se elige el color que mas mande.
 *
 * El problema es que ese "se leen los pixeles" puede estar prohibido. La
 * portada no la sirve music.youtube.com: viene de otro dominio
 * (googleusercontent). Si ese servidor no manda las cabeceras CORS
 * adecuadas, el navegador marca el canvas como CONTAMINADO y getImageData()
 * lanza una SecurityError. Entonces no hay color que sacar, y no lo hay
 * haga lo que haga la extension.
 *
 * Yo NO puedo contestar eso desde aqui: depende de lo que mande hoy un
 * servidor de Google, no del codigo. Asi que en vez de implementarlo y
 * cruzar los dedos, esto lo mide.
 *
 * COMO SE USA
 *
 *   1. Pon una cancion (cualquiera, pero mejor una con portada de colores
 *      vivos: una portada gris no dice nada).
 *   2. Pega esto en la consola de la PESTAÑA y espera un par de segundos.
 *   3. Copiame lo que imprima. Con el veredicto de la ultima linea me basta.
 *
 * QUE MIDE, Y POR QUE CADA COSA
 *
 *   A. De donde sale la portada (el dominio). Si hiciera falta pedir un
 *      permiso nuevo en el manifest, es este dato el que lo dice.
 *   B. Si la imagen se deja cargar con crossOrigin="anonymous". Este es el
 *      interruptor que hay que encender ANTES de dibujar; si el servidor no
 *      lo admite, la imagen ni siquiera carga.
 *   C. Si getImageData() funciona de verdad. Es la prueba que importa: se
 *      puede cargar y aun asi estar prohibido leer.
 *   D. Y si funciona, QUE COLOR sale. Que sea legal no basta: un color
 *      correcto pero gris barro seria una funcion inutil, y prefiero saberlo
 *      antes de escribirla que despues.
 *
 * No envia nada a ningun sitio ni toca la pagina: solo carga una imagen que
 * el navegador ya tiene en cache e imprime en consola.
 */
(function () {
  const log = (...args) => console.log("%c[portada]", "color:#5ac8f1;font-weight:bold", ...args);
  const mal = (...args) => console.log("%c[portada]", "color:#f15a5a;font-weight:bold", ...args);

  // El mismo selector que usa el adaptador de la extension, por orden de
  // prioridad. Copiarlo aqui es a proposito: este archivo no se empaqueta y
  // no puede importar nada de src/, y si el selector estuviera roto quiero
  // que este diagnostico lo diga en vez de heredar el fallo en silencio.
  const SELECTORES = ["ytmusic-player-bar img.image", "ytmusic-player-bar img.ytmusic-player-bar"];

  /*
   * ---------- EL FALLO QUE TUVO ESTE ARCHIVO, Y QUE SE CORRIGIO ----------
   *
   * La primera version media el `src` del <img> de la barra TAL CUAL. Y el
   * <img> de la barra es una miniatura de 60x60. La extension NUNCA mira esa
   * imagen: `metadata-reader.js` reescribe la URL a 544x544 antes de usarla.
   *
   * O sea que el diagnostico contestaba con precision una pregunta que no
   * era la que habia que hacer. Salio "28 pixeles con color de 256", un dato
   * que no dice nada de la imagen de verdad: a 60x60 y con la compresion que
   * lleva, los colores ya vienen lavados hacia el gris.
   *
   * Y el motivo es el de siempre: aqui se copio el SELECTOR del adaptador y
   * no se copio la linea de al lado, la que transforma la URL. Media regla
   * copiada es peor que ninguna, porque parece la regla entera.
   *
   * Se mide ahora la misma URL que usa la extension, y ademas la pequeña,
   * para ver cuanto cambia la respuesta segun cual se mire.
   */
  const A_GRANDE = (src) => src.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");

  let img = null;
  for (const sel of SELECTORES) {
    img = document.querySelector(sel);
    if (img) {
      log("portada encontrada con el selector:", sel);
      break;
    }
  }

  if (!img || !img.src) {
    mal("No hay portada en la barra del reproductor.");
    mal("Pon una cancion y vuelve a pegar esto. Si ya hay una sonando, avisame:");
    mal("significaria que el selector de la portada tambien esta roto.");
    return;
  }

  const urlPequena = img.src;
  const urlGrande = A_GRANDE(urlPequena);
  let host = "(no es una URL normal)";
  try {
    host = new URL(urlPequena, location.href).host;
  } catch (err) {
    /* una data: URL, por ejemplo; el host no aplica y no pasa nada */
  }

  log("--- A. de donde viene ---");
  log("dominio:", host);
  log("mismo dominio que la pagina:", host === location.host ? "SI (entonces no hay problema CORS)" : "NO");
  log("miniatura de la barra:", img.naturalWidth + "x" + img.naturalHeight, "(esta NO es la que usa la extension)");
  log("la reescritura a 544 funciona:", urlGrande !== urlPequena ? "SI" : "NO — el patron =wNN-hNN no casa, ojo");
  log("url que usa la extension:", urlGrande.length > 120 ? urlGrande.slice(0, 120) + "…" : urlGrande);

  /*
   * Se prueban las DOS formas, y en este orden, porque contestan preguntas
   * distintas y la segunda solo tiene sentido si la primera falla:
   *
   *   1. Con crossOrigin="anonymous": si esto funciona, la extension puede
   *      leer la portada sin pedir ningun permiso nuevo. Es la buena.
   *   2. Sin crossOrigin: la imagen carga casi seguro, pero el canvas queda
   *      contaminado. Sirve para distinguir "la imagen no carga" de "la
   *      imagen carga pero no se puede leer", que son dos arreglos
   *      completamente distintos y se confunden con facilidad.
   */
  function probar(conCors, url) {
    return new Promise((resolve) => {
      const prueba = new Image();
      if (conCors) prueba.crossOrigin = "anonymous";
      prueba.onload = () => resolve({ cargo: true, img: prueba });
      prueba.onerror = () => resolve({ cargo: false, img: null });
      /*
       * El parametro sobrante fuerza una peticion NUEVA. Sin el, el
       * navegador reutiliza la imagen que ya tiene cacheada SIN CORS, y la
       * prueba con crossOrigin fallaria (o pasaria) por el motivo
       * equivocado. Es una trampa clasica y silenciosa.
       */
      prueba.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "ytmpipDiag=" + Date.now();
    });
  }

  function leerPixeles(fuente) {
    /*
     * 16x16 y no el tamaño real: para saber que color manda no hacen falta
     * cien mil pixeles, y el propio navegador hace la media al reescalar.
     * Ademas getImageData sobre una imagen grande es lento de verdad.
     */
    const LADO = 16;
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO;
    lienzo.height = LADO;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, LADO, LADO);
    // AQUI es donde salta la SecurityError si el canvas esta contaminado.
    return ctx.getImageData(0, 0, LADO, LADO).data;
  }

  /*
   * El color "que mas manda" NO es la media de los pixeles: la media de una
   * portada con rojo y verde es un marron, y ese marron no esta en la
   * imagen. Se cuenta por cubos de tono y gana el mas repetido, ignorando
   * lo casi gris y lo casi negro/blanco, que en una portada suele ser
   * fondo y no color.
   *
   * Esto es una version rapida y de usar y tirar; si el diagnostico sale
   * bien, la de verdad se escribira aparte y con pruebas.
   */
  function colorQueManda(datos) {
    const cubos = new Map();
    let vivos = 0;
    for (let i = 0; i < datos.length; i += 4) {
      const r = datos[i] / 255;
      const g = datos[i + 1] / 255;
      const b = datos[i + 2] / 255;
      const alfa = datos[i + 3];
      if (alfa < 128) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luz = (max + min) / 2;
      const delta = max - min;
      if (delta < 0.12) continue; // casi gris: no aporta color
      if (luz < 0.12 || luz > 0.93) continue; // casi negro o casi blanco

      let tono;
      if (max === r) tono = 60 * (((g - b) / delta) % 6);
      else if (max === g) tono = 60 * ((b - r) / delta + 2);
      else tono = 60 * ((r - g) / delta + 4);
      if (tono < 0) tono += 360;

      const saturacion = delta / (1 - Math.abs(2 * luz - 1));
      const cubo = Math.floor(tono / 15); // 24 cubos de 15 grados
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
      /*
       * OJO CON ESTE NUMERO, QUE YA HA ENGAÑADO UNA VEZ. Es el porcentaje
       * sobre los pixeles QUE TIENEN COLOR, no sobre la imagen. En la
       * primera medicion salio "manda sobre el 100 %" y sonaba redondo;
       * eran 28 pixeles de 256, o sea el 100 % de un 11 %. Por eso ahora
       * va acompañado de `sobreLaImagen`, que es el que hay que mirar.
       */
      mandaSobre: Math.round((mejor.n / vivos) * 100),
      sobreLaImagen: Math.round((mejor.n / (datos.length / 4)) * 100),
      pixelesConColor: vivos,
      pixelesTotales: datos.length / 4
    };
  }

  /** Carga, lee e informa de UNA de las dos URLs. Devuelve el color o null. */
  async function analizar(etiqueta, url) {
    log("---", etiqueta, "---");
    const conCors = await probar(true, url);

    if (!conCors.cargo) {
      mal("NO carga con crossOrigin=anonymous.");
      log("Probando sin el, solo para distinguir 'no carga' de 'no se deja leer'…");
      const sinCors = await probar(false, url);
      if (!sinCors.cargo) {
        mal("Tampoco carga sin crossOrigin: el problema NO es CORS, es la URL o la red.");
        mal("Si esto pasa SOLO con la grande, la reescritura a 544 esta mal y es");
        mal("un fallo de la extension, no del servidor. Avisame.");
      } else {
        mal("Sin crossOrigin si carga. O sea: el servidor de la portada NO admite CORS.");
        mal("Haria falta pedir un permiso de host nuevo en el manifest, y eso es una");
        mal("decision tuya, no mia.");
      }
      return null;
    }

    log("carga con CORS. Tamaño real:", conCors.img.naturalWidth + "x" + conCors.img.naturalHeight);

    let datos;
    try {
      datos = leerPixeles(conCors.img);
    } catch (err) {
      mal("getImageData() ha lanzado:", err && err.name, "-", err && err.message);
      mal("El canvas esta CONTAMINADO: la imagen se ve pero no se puede leer.");
      return null;
    }

    const color = colorQueManda(datos);
    if (!color) {
      mal("No hay ningun color con fuerza: todo gris, blanco o negro.");
      return null;
    }

    const css = `hsl(${color.tono}, ${color.sat}%, ${color.luz}%)`;
    log("tono", color.tono + "°", "| saturacion", color.sat + "%", "| luz", color.luz + "%");
    log(
      "pixeles con color:",
      color.pixelesConColor,
      "de",
      color.pixelesTotales,
      "— el tono elegido cubre el",
      color.sobreLaImagen + "% de la imagen",
      "(" + color.mandaSobre + "% de los que tienen color)"
    );
    console.log(
      "%c          " + css + "          ",
      `background:${css};color:#fff;font-weight:bold;padding:6px;border-radius:4px;text-shadow:0 1px 2px #000`
    );
    return color;
  }

  (async function () {
    /*
     * Se miran las DOS, y en este orden, porque la comparacion es el dato
     * que faltaba: si la grande y la pequeña dan colores muy distintos, es
     * que la miniatura miente y cualquier medida hecha sobre ella tambien.
     */
    const grande = await analizar("B. la imagen QUE USA LA EXTENSION (544x544)", urlGrande);
    const pequena = await analizar("C. la miniatura de la barra (60x60), solo para comparar", urlPequena);

    log("--- D. veredicto ---");

    if (!grande) {
      mal("Con la imagen buena no se ha podido sacar color. Mira arriba el motivo.");
      mal("VEREDICTO: no se puede, o no con esta cancion. Prueba con una portada");
      mal("de colores vivos antes de darlo por imposible.");
      return;
    }

    if (pequena) {
      const d = Math.abs(grande.tono - pequena.tono) % 360;
      const distancia = d > 180 ? 360 - d : d;
      log("diferencia de tono entre la grande y la miniatura:", distancia + "°");
      if (distancia > 30) {
        mal("Son colores DISTINTOS. Confirma que medir la miniatura no valia.");
      } else {
        log("Coinciden. La miniatura no mentia en el tono (si en la cantidad de color).");
      }
    }

    /*
     * La luz importa tanto como el tono y es lo que la primera medicion casi
     * deja pasar: salio un rojo de luz 26 %, que sobre el fondo oscuro de la
     * ventana flotante es una barra que no se ve. Un color "correcto" que no
     * se distingue del fondo es una funcion rota, no una funcion fea.
     */
    if (grande.luz < 35) {
      mal("La luz es del " + grande.luz + "%: DEMASIADO OSCURA para el fondo de la ventana.");
      mal("Habra que subirle la luz al pintar, no usar el color tal cual.");
    } else if (grande.luz > 75) {
      mal("La luz es del " + grande.luz + "%: casi blanca. Se vera, pero perdera el color.");
    } else {
      log("La luz (" + grande.luz + "%) sirve tal cual sobre el fondo oscuro.");
    }

    if (grande.sobreLaImagen < 15) {
      mal("El tono elegido solo cubre el " + grande.sobreLaImagen + "% de la portada.");
      mal("Es un color 'dominante' que domina poco: puede no pegar con lo que se ve.");
    }

    log("VEREDICTO: SE PUEDE. Dime si la muestra de la parte B pega con la portada");
    log("o no pega nada, y con eso decido si se usa tal cual o se le ajusta la luz.");
  })();
})();
