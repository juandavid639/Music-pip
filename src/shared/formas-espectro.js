/*
 * LAS FORMAS DEL ESPECTRO: como se dibujan las barras, la onda y el anillo.
 *
 * Vive aqui desde la tanda AD, y no en pip.js, por la vista previa de
 * Preferencias: tiene que dibujar el espectro igual que la ventana, y la
 * unica forma de que dos dibujos no se separen es que sean el MISMO codigo.
 * Antes la vista previa pintaba unas barras de mentira propias, y cada forma
 * nueva habria sido una segunda copia que mantener de acuerdo con la buena.
 *
 * Este archivo no sabe nada de la ventana: recibe un contexto 2d y lo que
 * hay que dibujar (las barras ya leidas, el tamaño, donde esta la caratula)
 * y dibuja. Quien mide el audio, quien decide el color fijo y quien sabe
 * donde esta la portada son pip.js y vista-previa.js, cada uno a su manera.
 *
 * Va DESPUES de paleta.js y settings.js en la lista del manifiesto: usa
 * Paleta.colorDePaleta y Settings.normalizarPaleta para el color por barra.
 */
(function (root) {
  "use strict";

  const YTMPip = (root.YTMPip = root.YTMPip || {});

  // Ancho de referencia por barra, en pixeles CSS. No es el ancho real:
  // el real sale de repartir el canvas, esto solo decide CUANTAS caben.
  const ANCHO_POR_BARRA = 7;
  const BARRAS_MIN = 8;
  const BARRAS_MAX = 40;

  /**
   * Cuantas barras caben en `ancho` pixeles, o las que pida `preferidas`.
   *
   * Con un numero fijo el espectro sale ridiculo en los dos extremos: en
   * la ventana mini las barras se solapan hasta parecer un bloque, y en la
   * ampliada quedan cuatro columnas gordas. Por eso el reparto por ancho
   * sigue siendo lo que se hace si nadie dice nada. Los topes existen
   * porque por debajo de ocho ya no es un espectro sino un vumetro, y por
   * encima de cuarenta las barras bajan de un pixel y se pierden en el
   * redondeo.
   *
   * Cuando `preferidas` es un numero MANDA, y no se vuelve a acotar: ya
   * viene acotado de la normalizacion, y volver a hacerlo aqui seria tener
   * el rango escrito en dos sitios. Tampoco se mira si "cabe": si alguien
   * pide cuarenta barras en la ventana mini es que quiere cuarenta barras
   * apretadas, y corregirselo en silencio seria ignorar la preferencia que
   * acaba de guardar.
   *
   * Pura.
   */
  function barrasParaAncho(ancho, preferidas) {
    if (Number.isFinite(preferidas)) return preferidas;
    if (!(ancho > 0)) return BARRAS_MIN;
    return Math.max(BARRAS_MIN, Math.min(BARRAS_MAX, Math.floor(ancho / ANCHO_POR_BARRA)));
  }

  /* ---------- Las otras dos formas del espectro (tanda Z) ----------
   *
   * Las barras de siempre se pintan en dibujarEspectro con un fillRect por
   * barra. La onda y el anillo necesitan geometria, y la geometria vive
   * aqui, pura, para poder probarla sin un canvas: jsdom no pinta, pero una
   * lista de puntos se puede comprobar numero a numero.
   */

  /**
   * Los puntos de la ONDA: uno por barra, centrado en su franja, a la altura
   * que le toca. El dibujo los une con curvas y rellena por debajo.
   *
   * Una barra a cero sigue midiendo un pixel, como en las barras: una onda
   * que se hunde hasta el borde desaparece, y un silencio tiene que verse
   * como una linea plana abajo, no como nada. Pura.
   */
  function puntosDeOnda(barras, ancho, alto) {
    const n = barras.length;
    if (!n) return [];
    const paso = ancho / n;
    return barras.map((valor, i) => ({
      x: (i + 0.5) * paso,
      y: alto - Math.max(1, (valor / 255) * alto)
    }));
  }

  /**
   * Los rayos del ANILLO alrededor de la caratula: dos por barra, en espejo.
   *
   * Las barras van de graves a agudos, y un circulo no tiene «izquierda»:
   * repartirlas en la vuelta entera dejaria los graves y los agudos
   * pegados arriba. Asi que ocupan media vuelta —de arriba (-90°) a abajo
   * por la derecha— y se repiten en espejo por la izquierda: los graves
   * arriba, los agudos abajo, y el dibujo simetrico, que es como se lee
   * un anillo. Cada rayo sale del borde (`radio`) hacia fuera, con largo
   * proporcional a su barra y minimo de un pixel, como las barras.
   *
   * `i` es la barra de la que sale, para el color por barra. Pura.
   */
  function rayosDelAnillo(barras, cx, cy, radio, largoMax) {
    const n = barras.length;
    const rayos = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const largo = Math.max(1, (barras[i] / 255) * largoMax);
      for (const angulo of [-Math.PI / 2 + t * Math.PI, -Math.PI / 2 - t * Math.PI]) {
        const cos = Math.cos(angulo);
        const sin = Math.sin(angulo);
        rayos.push({
          i,
          x1: cx + radio * cos,
          y1: cy + radio * sin,
          x2: cx + (radio + largo) * cos,
          y2: cy + (radio + largo) * sin
        });
      }
    }
    return rayos;
  }

  /* ---------- El arcoiris giratorio ("RGB", como los gamer) ----------
   *
   * Dos movimientos a la vez, y hacen falta los dos:
   *
   *   - el REPARTO: cada barra lleva un tono distinto, asi que en una sola
   *     foto ya se ve un degradado y no un bloque de color;
   *   - el GIRO: todo el degradado avanza con el reloj, que es lo que
   *     convierte el degradado en el efecto que se pidio.
   *
   * Con solo el giro, el espectro entero seria un color liso cambiando
   * despacio y a ratos se confundiria con el fondo. Con solo el reparto
   * seria un arcoiris quieto.
   *
   * El arco es de 300 y no de 360 grados para que la ultima barra no acabe
   * en el mismo tono con el que empieza la primera: cerrando la vuelta
   * entera, los dos extremos del espectro salen del mismo color y el
   * degradado parece cortado por la mitad.
   */
  const RGB_PERIODO_MS = 6000;
  const RGB_ARCO = 300;

  /**
   * El tono (0-359) que le toca a la barra `indice` de `total` en el
   * instante `ms`. Pura, y expuesta para poder probarla: es la unica parte
   * del efecto que se puede comprobar sin mirar la pantalla.
   */
  function matizRgb(ms, indice, total) {
    const giro = ((ms % RGB_PERIODO_MS) / RGB_PERIODO_MS) * 360;
    // Con una sola barra no hay nada que repartir, y dividir por cero
    // dejaria el tono en NaN y la barra sin pintar.
    const reparto = total > 1 ? (indice / (total - 1)) * RGB_ARCO : 0;
    return (giro + reparto) % 360;
  }

  /**
   * El color de cada barra para un modo de color, o `null` si el modo es de
   * UN color (tema, propio, «de la fuente»): ese lo pone quien llama en el
   * fillStyle, porque solo el sabe resolverlo (una variable CSS, un color
   * muestreado). Aqui se deciden los dos modos con un color por barra: el
   * arcoiris que gira con `ahora` y la paleta propia. Una sola pregunta, en
   * un solo sitio: la ventana y la vista previa preguntan aqui.
   */
  function colorDeBarraPara(modo, ahora, total) {
    if (modo === "rgb") {
      return (i) => "hsl(" + matizRgb(ahora, i, total) + ", 100%, 60%)";
    }
    const paleta = YTMPip.Settings && YTMPip.Settings.normalizarPaleta(modo);
    if (paleta) return (i) => YTMPip.Paleta.colorDePaleta(paleta, i, total);
    return null;
  }

  /*
   * La onda: la linea une los puntos con curvas (cada punto es el control y
   * el medio con el siguiente el destino, la receta clasica para una curva
   * suave que pasa cerca de todos), y debajo se rellena con el mismo color
   * mas tenue. Con color por barra el trazo es un degradado a lo ancho con
   * una parada por barra: la onda es UNA linea y no puede cambiar de color
   * a mitad.
   */
  function dibujarOnda(contexto, barras, ancho, alto, escala, colorDeBarra) {
    const puntos = puntosDeOnda(barras, ancho, alto);
    if (colorDeBarra(0)) {
      const degradado = contexto.createLinearGradient(0, 0, ancho, 0);
      puntos.forEach((p, i) => degradado.addColorStop(p.x / ancho, colorDeBarra(i)));
      contexto.fillStyle = degradado;
    }
    contexto.strokeStyle = contexto.fillStyle;
    contexto.lineWidth = 2 * escala;
    contexto.lineJoin = "round";

    contexto.beginPath();
    contexto.moveTo(0, puntos[0].y);
    for (let i = 0; i < puntos.length - 1; i++) {
      const mx = (puntos[i].x + puntos[i + 1].x) / 2;
      const my = (puntos[i].y + puntos[i + 1].y) / 2;
      contexto.quadraticCurveTo(puntos[i].x, puntos[i].y, mx, my);
    }
    contexto.lineTo(ancho, puntos[puntos.length - 1].y);
    contexto.stroke();

    contexto.lineTo(ancho, alto);
    contexto.lineTo(0, alto);
    contexto.closePath();
    contexto.globalAlpha = 0.35;
    contexto.fill();
    contexto.globalAlpha = 1;
  }

  /*
   * El anillo: rayos redondeados desde un circulo un poco mayor que la
   * caratula. El radio es la mitad del lado mas un margen, y no la media
   * diagonal: con la diagonal los rayos empezarian lejos del centro de cada
   * lado y la caratula quedaria flotando en un hueco. Las esquinas
   * redondeadas de la portada tapan la diferencia; con el disco de vinilo
   * (tanda AA) el circulo encaja justo.
   *
   * EL CUADRADO DE LA CARATULA SE RECORTA del dibujo. El lienzo esta por
   * encima de la portada, y en las esquinas el circulo queda DENTRO del
   * cuadrado: sin el recorte, los rayos pintaban sobre las esquinas de la
   * imagen (se vio en la primera prueba a ojo). Con el recorte parecen
   * salir de detras de la portada.
   */
  function dibujarAnillo(contexto, barras, caratula, escala, colorDeBarra, ancho, alto) {
    const radio = caratula.lado / 2 + 4 * escala;
    const rayos = rayosDelAnillo(barras, caratula.cx, caratula.cy, radio, caratula.lado * 0.3);
    contexto.save();
    contexto.beginPath();
    contexto.rect(0, 0, ancho, alto);
    if (caratula.redonda) {
      /*
       * Con el disco de vinilo el agujero es el CIRCULO: recortar el
       * cuadrado dejaria un hueco en las diagonales entre el disco y el
       * arranque de los rayos, que salen justo del borde del disco.
       */
      contexto.moveTo(caratula.cx + caratula.lado / 2, caratula.cy);
      contexto.arc(caratula.cx, caratula.cy, caratula.lado / 2, 0, 2 * Math.PI);
    } else {
      contexto.rect(caratula.cx - caratula.lado / 2, caratula.cy - caratula.lado / 2, caratula.lado, caratula.lado);
    }
    contexto.clip("evenodd");
    contexto.lineWidth = Math.max(1, Math.min(4 * escala, (Math.PI * radio) / barras.length - escala));
    contexto.lineCap = "round";
    contexto.strokeStyle = contexto.fillStyle;
    for (const rayo of rayos) {
      const color = colorDeBarra(rayo.i);
      if (color) contexto.strokeStyle = color;
      contexto.beginPath();
      contexto.moveTo(rayo.x1, rayo.y1);
      contexto.lineTo(rayo.x2, rayo.y2);
      contexto.stroke();
    }
    contexto.restore();
  }

  /**
   * Dibuja `d.barras` con la forma `d.forma` en `contexto`, que ya lleva
   * puesto el fillStyle del color fijo si lo hay.
   *
   * `d`: { barras, ancho, alto, escala, forma, caratula, banda, colorDeBarra }
   *   - caratula: { cx, cy, lado, redonda } en pixeles del lienzo, o null
   *     si no esta a la vista (el anillo cae entonces a barras);
   *   - banda: la altura de las barras (la ventana entera, o la banda de
   *     abajo cuando el lienzo del anillo ocupa toda la ventana);
   *   - colorDeBarra: la de colorDeBarraPara, o null.
   */
  function pintar(contexto, d) {
    const barras = d.barras;
    if (!barras || !barras.length) return;
    const colorDeBarra = d.colorDeBarra || (() => null);
    if (d.forma === "wave") {
      dibujarOnda(contexto, barras, d.ancho, d.alto, d.escala, colorDeBarra);
      return;
    }
    if (d.forma === "ring" && d.caratula) {
      dibujarAnillo(contexto, barras, d.caratula, d.escala, colorDeBarra, d.ancho, d.alto);
      return;
    }
    /*
     * Las barras de siempre, que son tambien el plan B del anillo cuando la
     * caratula no esta a la vista. Un sexto de hueco entre barras:
     * proporcional, para que el aire se vea igual con ocho que con cuarenta.
     */
    const paso = d.ancho / barras.length;
    const grosor = Math.max(1, paso - Math.max(1, paso / 6));
    const banda = d.banda || d.alto;
    for (let i = 0; i < barras.length; i++) {
      const color = colorDeBarra(i);
      if (color) contexto.fillStyle = color;
      const altura = Math.max(1, (barras[i] / 255) * banda);
      contexto.fillRect(i * paso, d.alto - altura, grosor, altura);
    }
  }

  YTMPip.FormasEspectro = {
    pintar,
    colorDeBarraPara,
    // Puras y expuestas para probarlas sin un lienzo.
    barrasParaAncho,
    puntosDeOnda,
    rayosDelAnillo,
    matizRgb
  };
})(typeof self !== "undefined" ? self : globalThis);
