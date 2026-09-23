/*
 * DIAGNOSTICO 2 DE LA PORTADA: ¿UNA IMAGEN MAS GRANDE, Y QUE HACER CON
 * LAS PORTADAS APAGADAS?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com, con una cancion sonando. NO hace falta
 * abrir la ventana flotante.
 *
 * POR QUE EXISTE (esto es la segunda mitad del diagnostico anterior)
 *
 * El primer diagnostico contesto la pregunta que bloqueaba todo: los
 * pixeles de la portada SI se pueden leer, crossOrigin="anonymous" pasa y
 * getImageData() no lanza. Hasta ahi, bien.
 *
 * Pero el resultado dejo dos cosas feas a la vista, y las dos son motivo
 * suficiente para que la funcion salga mal:
 *
 *   1. LA IMAGEN ERA UN SELLO DE CORREOS. La portada de la barra del
 *      reproductor se sirve a 60x60, porque es el tamaño al que se ve. La
 *      URL lo lleva escrito ("=w60-h60-…"): es el CDN de Google, que
 *      recorta y reescala segun lo que se le pida. De 60x60 salen 3.600
 *      pixeles ya promediados por el reescalado del servidor, y los tonos
 *      pequeños pero importantes de una portada (una franja roja, un
 *      logotipo) puede que ya no existan ahi.
 *
 *      Se le PUEDE pedir otro tamaño reescribiendo esos parametros. Lo que
 *      no se puede es DAR POR HECHO que la version grande pasa el CORS
 *      igual que la pequeña: es una peticion distinta, y las cabeceras las
 *      decide el servidor, no yo. Si la grande no pasa, mejor saberlo
 *      ahora que despues de escribir la funcion entera.
 *
 *   2. EL COLOR SALIO UN MARRON APAGADO. En la prueba, el dominante fue
 *      hsl(25, 24%, 44%) y solo 37 de 256 pixeles tenian color. Un 24 % de
 *      saturacion pintado en las barras del espectro no se lee como "el
 *      color de la portada": se lee como un gris sucio, y el usuario
 *      pensara que la funcion esta rota. Hay tres salidas posibles y hay
 *      que elegir CON DATOS:
 *
 *        a. Usar el color tal cual (y aceptar que a veces sea barro).
 *        b. Subirle la saturacion y la luz hasta un minimo digno.
 *        c. Si la portada no tiene color suficiente, RENDIRSE y volver al
 *           color de acento, que es honesto.
 *
 *      La (c) necesita un numero: ¿a partir de que porcentaje de pixeles
 *      con color se considera que una portada "tiene color"? Ese numero no
 *      me lo puedo inventar, y por eso esto lo mide en varias portadas.
 *
 * COMO SE USA
 *
 *   1. Pon una cancion y pega esto. Espera un par de segundos.
 *   2. MIRA las muestras de color que imprime al lado de la portada real.
 *   3. Repitelo con TRES O CUATRO canciones distintas, y a proposito
 *      variadas: una de portada colorida, una oscura, y una en blanco y
 *      negro o casi. La en blanco y negro es la importante: es la que
 *      decide donde va el listron de "esta portada no tiene color".
 *   4. Copiame las lineas VEREDICTO de cada una.
 *
 * No envia nada a ningun sitio ni toca la pagina.
 */
(function () {
  const log = (...args) => console.log("%c[portada2]", "color:#5ac8f1;font-weight:bold", ...args);
  const mal = (...args) => console.log("%c[portada2]", "color:#f15a5a;font-weight:bold", ...args);

  const SELECTORES = ["ytmusic-player-bar img.image", "ytmusic-player-bar img.ytmusic-player-bar"];

  let img = null;
  for (const sel of SELECTORES) {
    img = document.querySelector(sel);
    if (img) break;
  }
  if (!img || !img.src) {
    mal("No hay portada en la barra del reproductor. Pon una cancion.");
    return;
  }

  const url = img.src;

  /*
   * El CDN de Google mete las instrucciones de recorte en el ULTIMO tramo
   * de la ruta, detras de un "=", separadas por guiones: "=w60-h60-l90-rj".
   * Se cambian w y h y se deja el resto en paz, porque ahi puede haber
   * cosas que no entiendo (calidad, formato, recorte inteligente) y
   * quitarlas seria cambiar dos variables a la vez.
   *
   * Si no encuentro el patron NO invento uno: devuelvo null y el
   * diagnostico lo dice. Una URL "arreglada" a ciegas daria un 404 que yo
   * interpretaria como "el CORS falla", que es la conclusion equivocada.
   */
  function urlDeLado(original, lado) {
    const corte = original.lastIndexOf("=");
    if (corte === -1) return null;
    const base = original.slice(0, corte);
    const params = original.slice(corte + 1).split("-");
    let tocados = 0;
    const nuevos = params.map((p) => {
      if (/^w\d+$/.test(p)) {
        tocados += 1;
        return "w" + lado;
      }
      if (/^h\d+$/.test(p)) {
        tocados += 1;
        return "h" + lado;
      }
      if (/^s\d+$/.test(p)) {
        tocados += 1;
        return "s" + lado;
      }
      return p;
    });
    return tocados ? base + "=" + nuevos.join("-") : null;
  }

  function cargar(u) {
    return new Promise((resolve) => {
      const prueba = new Image();
      prueba.crossOrigin = "anonymous";
      prueba.onload = () => resolve(prueba);
      prueba.onerror = () => resolve(null);
      // Parametro sobrante: fuerza peticion nueva en vez de reutilizar una
      // copia cacheada SIN CORS. La misma trampa del diagnostico anterior.
      prueba.src = u + (u.indexOf("?") === -1 ? "?" : "&") + "ytmpipDiag=" + Date.now();
    });
  }

  function pixeles(fuente, lado) {
    const lienzo = document.createElement("canvas");
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, lado, lado);
    return ctx.getImageData(0, 0, lado, lado).data;
  }

  // Misma cuenta que el diagnostico anterior, para poder comparar manzanas
  // con manzanas. Si aqui cambiara el criterio, la comparacion entre la
  // imagen pequeña y la grande no significaria nada.
  function colorQueManda(datos) {
    const cubos = new Map();
    let vivos = 0;
    let total = 0;
    for (let i = 0; i < datos.length; i += 4) {
      const r = datos[i] / 255;
      const g = datos[i + 1] / 255;
      const b = datos[i + 2] / 255;
      if (datos[i + 3] < 128) continue;
      total += 1;

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

    if (!vivos) return { vacio: true, cobertura: 0, total };

    let mejor = null;
    cubos.forEach((v) => {
      if (!mejor || v.n > mejor.n) mejor = v;
    });

    return {
      vacio: false,
      tono: Math.round(mejor.tono / mejor.n),
      sat: Math.round((mejor.sat / mejor.n) * 100),
      luz: Math.round((mejor.luz / mejor.n) * 100),
      mandaSobre: Math.round((mejor.n / vivos) * 100),
      // COBERTURA: que parte de la portada ENTERA tiene color, no solo de
      // los pixeles con color. Este es el numero que decide si la portada
      // merece que le saquemos un color o hay que volver al acento, y es
      // distinto de "mandaSobre": una portada casi negra con cuatro
      // pixeles rojos da mandaSobre=100% y cobertura=2%.
      cobertura: Math.round((vivos / Math.max(1, total)) * 100),
      total
    };
  }

  const css = (c) => `hsl(${c.tono}, ${c.sat}%, ${c.luz}%)`;

  function muestra(etiqueta, c) {
    const color = css(c);
    console.log(
      "%c   " + etiqueta.padEnd(22) + color.padEnd(22) + "   ",
      `background:${color};color:#fff;font-weight:bold;padding:6px;border-radius:4px;text-shadow:0 1px 2px #000`
    );
  }

  /*
   * La "correccion" que se propone si el color sale apagado: subir la
   * saturacion a un minimo y meter la luz en una franja media. NO se toca
   * el TONO nunca: el tono es lo unico que de verdad viene de la portada, y
   * cambiarlo seria inventarse el color en vez de sacarlo.
   */
  const SAT_MINIMA = 55;
  const LUZ_MIN = 40;
  const LUZ_MAX = 65;
  function avivar(c) {
    return {
      tono: c.tono,
      sat: Math.max(SAT_MINIMA, c.sat),
      luz: Math.min(LUZ_MAX, Math.max(LUZ_MIN, c.luz))
    };
  }

  (async function () {
    log("--- A. ¿se puede pedir la portada mas grande? ---");
    log("url que usa la pagina:", url.length > 110 ? url.slice(0, 110) + "…" : url);

    const grande = urlDeLado(url, 544);
    if (!grande) {
      mal("No reconozco los parametros de tamaño en esta URL.");
      mal("VEREDICTO A: hay que quedarse con la imagen tal cual la sirve la pagina.");
      mal("Copiame la url entera de arriba, que el formato ha cambiado.");
    } else {
      log("url que voy a pedir:", grande.length > 110 ? grande.slice(0, 110) + "…" : grande);
    }

    const imgChica = await cargar(url);
    if (!imgChica) {
      mal("Ni siquiera carga la imagen que ya usa la pagina. Algo va mal en la red.");
      mal("VEREDICTO: no concluyente, avisame.");
      return;
    }
    log("pequeña:", imgChica.naturalWidth + "x" + imgChica.naturalHeight);

    let imgGrande = null;
    if (grande) {
      imgGrande = await cargar(grande);
      if (!imgGrande) {
        mal("La version grande NO carga con crossOrigin=anonymous.");
        mal("VEREDICTO A: la extension debe usar la imagen pequeña, la de 60x60.");
      } else if (imgGrande.naturalWidth <= imgChica.naturalWidth) {
        mal("La version grande carga pero el servidor la devuelve igual de pequeña");
        mal("(" + imgGrande.naturalWidth + "x" + imgGrande.naturalHeight + "): ignora lo que se le pide.");
        mal("VEREDICTO A: no se gana nada; usar la que ya hay.");
      } else {
        log("grande:", imgGrande.naturalWidth + "x" + imgGrande.naturalHeight, "— SI carga y SI es mas grande.");
      }
    }

    log("--- B. ¿leer la grande esta permitido? ---");
    let datosChica = null;
    let datosGrande = null;
    try {
      datosChica = pixeles(imgChica, 16);
    } catch (err) {
      mal("La PEQUEÑA ya no deja leerse:", err && err.name);
      mal("VEREDICTO: contradice el diagnostico anterior. Copiamelo entero.");
      return;
    }
    log("pequeña: se lee bien.");

    if (imgGrande && imgGrande.naturalWidth > imgChica.naturalWidth) {
      try {
        datosGrande = pixeles(imgGrande, 32);
      } catch (err) {
        mal("La GRANDE carga pero NO deja leer los pixeles:", err && err.name);
        mal("Esto es exactamente lo que habia que comprobar y por poco.");
        mal("VEREDICTO B: la extension tiene que usar la imagen pequeña.");
        datosGrande = null;
      }
      if (datosGrande) log("grande: se lee bien tambien.");
    }

    log("--- C. ¿cambia el color por usar la grande? ---");
    const cChica = colorQueManda(datosChica);
    if (cChica.vacio) {
      log("pequeña: NINGUN pixel con color (portada gris, oscura o blanca).");
    } else {
      log(
        "pequeña -> tono " + cChica.tono + "° | sat " + cChica.sat + "% | luz " + cChica.luz + "%" +
          " | cobertura " + cChica.cobertura + "%"
      );
    }

    let cGrande = null;
    if (datosGrande) {
      cGrande = colorQueManda(datosGrande);
      if (cGrande.vacio) {
        log("grande: NINGUN pixel con color.");
      } else {
        log(
          "grande  -> tono " + cGrande.tono + "° | sat " + cGrande.sat + "% | luz " + cGrande.luz + "%" +
            " | cobertura " + cGrande.cobertura + "%"
        );
      }
      if (!cChica.vacio && !cGrande.vacio) {
        let dif = Math.abs(cChica.tono - cGrande.tono);
        if (dif > 180) dif = 360 - dif;
        log("diferencia de tono entre las dos:", dif + "°");
        if (dif <= 15) {
          log("VEREDICTO C: las dos dan practicamente el mismo color. NO merece la pena");
          log("pedir la grande: es una peticion de red extra para nada.");
        } else {
          log("VEREDICTO C: dan colores DISTINTOS (" + dif + "° de diferencia). Mira las dos");
          log("muestras de abajo y dime cual pega con la portada.");
        }
      }
    }

    log("--- D. las muestras: comparalas con la portada de verdad ---");
    if (!cChica.vacio) {
      muestra("pequeña, tal cual", cChica);
      muestra("pequeña, avivada", avivar(cChica));
    }
    if (cGrande && !cGrande.vacio) {
      muestra("grande, tal cual", cGrande);
      muestra("grande, avivada", avivar(cGrande));
    }

    log("--- E. ¿esta portada tiene color suficiente? ---");
    const referencia = cGrande && !cGrande.vacio ? cGrande : cChica;
    if (referencia.vacio) {
      log("cobertura: 0 % — esta portada NO tiene color que sacar.");
      log("VEREDICTO E: caso 'plan B'. Anota que con esta cancion hay que volver al acento.");
    } else {
      log("cobertura:", referencia.cobertura + "% de la portada tiene color");
      log("saturacion del dominante:", referencia.sat + "%");
      log("VEREDICTO E: apunta estos dos numeros junto con si la portada TE PARECE");
      log("colorida o apagada. Con tres o cuatro canciones distintas sale solo donde");
      log("poner el listron; con una sola seria inventarmelo.");
    }
  })();
})();
