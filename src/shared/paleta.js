/*
 * El degradado de la paleta propia: qué color le toca a cada barra.
 *
 * POR QUE ESTO VIVE EN shared/ Y NO EN pip.js, QUE ES QUIEN PINTA
 *
 * Porque hay DOS sitios que necesitan la respuesta y tienen que dar la
 * misma: el espectro de la ventana flotante, y la vista previa de la página
 * de opciones, que enseña el degradado mientras se eligen los colores.
 *
 * Empezó estando en pip.js, junto al arcoíris, que es donde parecía que
 * tocaba. Al escribir la vista previa se vio el problema: options.html no
 * carga pip.js —es otro documento, con su propia lista de scripts— así que
 * la única forma de tenerla allí era copiarla. Una vista previa que interpola
 * distinto que el espectro no es una vista previa, es un dibujo bonito que se
 * parece; y el día que alguien cambie la interpolación en un archivo, el otro
 * seguirá mintiendo sin que ninguna prueba se entere.
 *
 * Una regla duplicada en dos archivos no es una regla, son dos.
 *
 * La alternativa era pintar la vista previa con un `linear-gradient` de CSS,
 * que es una línea de código. No vale: CSS interpola en otro espacio de color
 * y el resultado NO es el mismo que el de aquí, con lo que la mentira sería
 * la misma pero más difícil de ver.
 */
(function (root) {
  "use strict";

  const YTMPip = (root.YTMPip = root.YTMPip || {});
  const { SPECTRUM_LIMITS } = YTMPip.CONSTANTS;

  /** #rrggbb -> {r,g,b} de 0 a 255. Pura. */
  function hexARgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  /** {r,g,b} -> {h: 0-360, s: 0-1, l: 0-1}. Pura. */
  function rgbAHsl(c) {
    const r = c.r / 255;
    const g = c.g / 255;
    const b = c.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    // Un gris puro no tiene tono. Se devuelve 0 y saturacion 0; quien
    // interpole ya sabra que ese 0 no significa "rojo" (ver mezclarHsl).
    if (!delta) return { h: 0, s: 0, l };
    const s = delta / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
    return { h, s, l };
  }

  /**
   * Mezcla dos colores HSL. `t` va de 0 (todo `a`) a 1 (todo `b`). Pura.
   *
   * SE INTERPOLA EN HSL Y NO EN RGB, y la diferencia se ve a simple vista:
   * mezclando a medias rojo (#ff0000) y verde (#00ff00) en RGB sale
   * (128,128,0), un verde oliva sucio que no esta en ninguno de los dos; en
   * HSL el tono pasa de 0 a 120 grados por el camino corto y en el medio hay
   * un amarillo limpio. Un degradado entre dos colores vivos con un barrizal
   * en el medio parece un fallo.
   */
  function mezclarHsl(a, b, t) {
    /*
     * EL CASO QUE SE ESCAPA SI NO SE MIRA: un extremo sin saturacion
     * —blanco, negro o gris— no tiene tono, y su `h` vale 0 por convenio,
     * que resulta ser el rojo. Interpolando negro con azul, ese 0 de mentira
     * arrastraria el tono desde el rojo y el degradado pasaria por morados
     * que nadie eligio. Cuando uno de los dos es gris se usa el tono del
     * OTRO y solo se mueven la luz y la saturacion, que es lo que de verdad
     * los separa.
     */
    let h;
    if (!a.s) h = b.h;
    else if (!b.s) h = a.h;
    else {
      // Por el camino corto: de 350 a 10 grados hay 20, no 340.
      let d = b.h - a.h;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      h = a.h + d * t;
    }
    return {
      h: ((h % 360) + 360) % 360,
      s: a.s + (b.s - a.s) * t,
      l: a.l + (b.l - a.l) * t
    };
  }

  /**
   * {h, s, l} -> "hsl(h, s%, l%)". Pura.
   *
   * Estaba escrita al final de `colorDePaleta`, que era el unico sitio que
   * necesitaba un color HSL en texto. Dejo de serlo con el color del video:
   * shared/color-fuente.js tambien acaba con un {h,s,l} en la mano y tambien
   * tiene que entregarselo a un `fillStyle`. Copiar alli las tres llamadas a
   * `Math.round` habria sido copiar el redondeo, que es justo la clase de
   * detalle que se desincroniza sin que se note.
   *
   * REDONDEA a proposito, y no es cosmetica: `fillStyle` acepta decimales,
   * pero un tono con doce cifras cambia en cada fotograma por debajo de lo
   * que el ojo distingue y obliga al navegador a reparsear la cadena cada
   * vez. Al grado, al uno por ciento, y ahi se para.
   */
  function hslACss(c) {
    return (
      "hsl(" + Math.round(c.h) + ", " + Math.round(c.s * 100) + "%, " + Math.round(c.l * 100) + "%)"
    );
  }

  /**
   * El color CSS que le toca a la barra `indice` de `total` con la paleta
   * `colores` (lista de #rrggbb).
   *
   * Reparte los colores a lo ANCHO: el primero en la barra de la izquierda,
   * el ultimo en la de la derecha, y los de en medio repartidos por igual.
   * Entre dos colores contiguos se interpola.
   *
   * QUIETO, no girando como el arcoiris, y eso lo decidio la peticion sin
   * querer: se pidio "empezar con un rojo y terminar con un azul". Si el
   * degradado avanzara con el reloj, el rojo NO estaria al empezar mas que
   * un instante de cada seis segundos. Girar y "empezar en" son
   * incompatibles, y aqui manda el segundo.
   *
   * Pura.
   */
  function colorDePaleta(colores, indice, total) {
    if (!colores || !colores.length) return SPECTRUM_LIMITS.COLOR_SUGGESTED;
    // Con un solo color no hay nada que interpolar; se devuelve TAL CUAL y
    // no se toca, para que un "#abc123" salga exactamente ese y no el
    // resultado de pasarlo por HSL y volver, que redondea y no siempre
    // vuelve al mismo sitio.
    if (colores.length === 1) return colores[0];
    /*
     * Con una sola barra no hay reparto: se pinta con el PRIMER color. El
     * primero y no el del medio porque la paleta se lee "empieza en… y
     * acaba en…", y con una barra lo que se ve es el principio.
     *
     * Ademas evita dividir por cero: `total - 1` seria 0, la posicion
     * saldria NaN y la barra se quedaria sin pintar en silencio.
     */
    const posicion = total > 1 ? (indice / (total - 1)) * (colores.length - 1) : 0;
    /*
     * El tope de `colores.length - 2` es para la ULTIMA barra: ahi
     * `posicion` vale justo `colores.length - 1` y `floor` daria el ultimo
     * color, con lo que `colores[desde + 1]` seria undefined. Acotando, la
     * ultima barra cae en el ultimo tramo con t = 1, que es exactamente el
     * ultimo color.
     */
    const desde = Math.min(colores.length - 2, Math.floor(posicion));
    const t = posicion - desde;
    const mezcla = mezclarHsl(
      rgbAHsl(hexARgb(colores[desde])),
      rgbAHsl(hexARgb(colores[desde + 1])),
      t
    );
    return hslACss(mezcla);
  }

  YTMPip.Paleta = {
    colorDePaleta,
    // Expuestas para poder probarlas por separado: cuando el degradado sale
    // raro, saber si el fallo esta en la conversion o en la mezcla ahorra
    // media hora.
    hexARgb,
    rgbAHsl,
    mezclarHsl,
    hslACss
  };
})(typeof self !== "undefined" ? self : globalThis);
