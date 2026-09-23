/*
 * El color que manda en lo que se esta viendo: el video o la carátula.
 *
 * ESTE ARCHIVO NO TOCA UN CANVAS NI UN <video>. Recibe pixeles ya leidos
 * —un ImageData, o cualquier cosa con la misma forma— y devuelve un color.
 * Quien pone el fotograma en un lienzo y arriesga el SecurityError es
 * src/pip/pip.js, que es el unico que tiene una ventana delante.
 *
 * La separacion no es estetica: sin ella, "que color sale de esta imagen"
 * solo se podria comprobar abriendo YouTube Music y mirando. Asi se
 * comprueba con veinte pixeles inventados en una prueba de un milisegundo.
 *
 * ------------------------------------------------------------------
 * POR QUE EL COLOR DOMINANTE Y NO EL COLOR MEDIO
 * ------------------------------------------------------------------
 *
 * Promediar los pixeles de una imagen da SIEMPRE un gris pardo, y cuanto
 * mas colorida sea la imagen, mas pardo: los colores opuestos se cancelan.
 * Una portada mitad roja y mitad verde promedia a un caqui que no esta en
 * ninguna de las dos mitades. Lo que una persona llama "el color de esa
 * portada" no es la media de nada, es el que ocupa mas sitio.
 *
 * Asi que se vota: cada pixel con derecho a voto (ver SAT_MIN, LIGHT_FLOOR
 * y LIGHT_CEIL en constants.js) mete su tono en una de las 24 franjas, y
 * gana la franja mas llena.
 *
 * ------------------------------------------------------------------
 * LA CUOTA, QUE ES LA PARTE QUE YA ENGAÑO UNA VEZ
 * ------------------------------------------------------------------
 *
 * El diagnostico de la carátula decia, de la primera cancion medida, que el
 * color ganador "mandaba sobre el 100 %". Sonaba a certeza absoluta y era
 * el 100 % de 6 pixeles: los otros 250 no tenian derecho a voto por grises
 * o por oscuros. El ganador representaba al 2 % de la imagen.
 *
 * Por eso `cuota` se mide SOBRE LA IMAGEN ENTERA y no sobre los votantes.
 * Un porcentaje necesita que se diga de que, y el denominador comodo es el
 * que hace quedar bien al resultado.
 */
(function (root) {
  "use strict";

  const YTMPip = (root.YTMPip = root.YTMPip || {});
  const AJUSTES = YTMPip.CONSTANTS.SPECTRUM_LIMITS.SOURCE_COLOR;
  /*
   * La conversion a HSL se PIDE PRESTADA a shared/paleta.js en vez de
   * escribirse aqui. Es la misma cuenta que usa el degradado de la paleta
   * propia, y dos versiones de la misma cuenta acabarian dando dos colores
   * distintos para el mismo pixel el dia que alguien arregle un redondeo en
   * una de las dos. Por eso este archivo va DESPUES de paleta.js en la lista
   * de content_scripts del manifiesto.
   */
  const { rgbAHsl, mezclarHsl } = YTMPip.Paleta;

  const ANCHO_FRANJA = 360 / AJUSTES.HUE_BUCKETS;

  /**
   * El color que mas sitio ocupa en `imagen`, o `null` si no hay ninguno.
   *
   * `imagen` es un ImageData o cualquier objeto con `{ data, width, height }`,
   * con `data` en RGBA de 0 a 255. Se aceptan los dos para poder probar esto
   * sin un canvas: en una prueba, `data` es un array normal.
   *
   * Devuelve `{ h, s, l, cuota }` SIN normalizar: el tono en grados, la
   * saturacion y la luz de 0 a 1 —promedio de los pixeles de la franja
   * ganadora— y la cuota como fraccion de la imagen ENTERA (ver la cabecera).
   *
   * Devuelve `null` cuando ningun pixel tiene derecho a voto, que es un
   * resultado legitimo y distinto de "sale negro": una imagen en blanco y
   * negro no tiene color dominante, y decir que lo tiene seria inventarlo.
   *
   * Pura.
   */
  function colorDominante(imagen) {
    if (!imagen || !imagen.data) return null;
    const datos = imagen.data;
    const pixeles = Math.floor(datos.length / 4);
    if (!pixeles) return null;

    // Un acumulador por franja: cuantos votos y la suma de sus tonos, luces
    // y saturaciones, para poder promediar al final sin recorrer dos veces.
    const votos = new Array(AJUSTES.HUE_BUCKETS).fill(0);
    const sumaH = new Array(AJUSTES.HUE_BUCKETS).fill(0);
    const sumaS = new Array(AJUSTES.HUE_BUCKETS).fill(0);
    const sumaL = new Array(AJUSTES.HUE_BUCKETS).fill(0);

    for (let i = 0; i < datos.length; i += 4) {
      /*
       * Lo transparente no vota PERO SI CUENTA en el denominador. Es la
       * misma decision que con los grises: un pixel transparente es parte de
       * la imagen, y descontarlo del total volveria a inflar la cuota del
       * ganador, que es justo el engaño que este archivo intenta no repetir.
       */
      if (datos[i + 3] < 128) continue;
      const hsl = rgbAHsl({ r: datos[i], g: datos[i + 1], b: datos[i + 2] });
      if (hsl.l < AJUSTES.LIGHT_FLOOR || hsl.l > AJUSTES.LIGHT_CEIL) continue;
      if (hsl.s < AJUSTES.SAT_MIN) continue;
      /*
       * El `%` de mas no es paranoia: un tono de exactamente 360 saldria de
       * la ultima franja y escribiria en un hueco del array que no existe.
       * `rgbAHsl` no lo produce hoy, pero es una cuenta con divisiones y no
       * quiero que un redondeo futuro se manifieste como un `undefined`.
       */
      const franja = Math.floor(hsl.h / ANCHO_FRANJA) % AJUSTES.HUE_BUCKETS;
      votos[franja]++;
      sumaH[franja] += hsl.h;
      sumaS[franja] += hsl.s;
      sumaL[franja] += hsl.l;
    }

    let mejor = -1;
    for (let f = 0; f < votos.length; f++) {
      if (votos[f] > (mejor === -1 ? 0 : votos[mejor])) mejor = f;
    }
    if (mejor === -1) return null;

    const n = votos[mejor];
    /*
     * La media de los tonos DENTRO de una franja se puede hacer a pelo, sin
     * las vueltas del camino corto que hace `mezclarHsl`. Las franjas tienen
     * bordes fijos y ninguna cruza el 360: la ultima va de 345 a 360 y la
     * primera de 0 a 15, asi que dentro de una franja no hay dos tonos que
     * esten cerca por el otro lado del circulo. Promediar tonos de franjas
     * DISTINTAS si necesitaria el camino corto, y por eso no se hace.
     */
    return {
      h: sumaH[mejor] / n,
      s: sumaS[mejor] / n,
      l: sumaL[mejor] / n,
      cuota: n / pixeles
    };
  }

  /**
   * Deja el color en condiciones de pintarse sobre el fondo de la ventana:
   * respeta el tono y sube la luz y la saturacion hasta la banda visible.
   *
   * SOLO SUBE LA SATURACION Y ACOTA LA LUZ POR LOS DOS LADOS, y la asimetria
   * tiene motivo. Un color demasiado saturado sigue viendose perfectamente;
   * uno demasiado claro se pierde contra el blanco del tema claro igual que
   * uno oscuro se pierde contra el negro del oscuro. La luz es la que decide
   * si hay algo que mirar, asi que es la unica que se acota arriba y abajo.
   *
   * Pura.
   */
  function normalizarLuz(hsl) {
    return {
      h: hsl.h,
      s: Math.max(AJUSTES.OUT_SAT_MIN, hsl.s),
      l: Math.min(AJUSTES.OUT_LIGHT_MAX, Math.max(AJUSTES.OUT_LIGHT_MIN, hsl.l))
    };
  }

  /**
   * Lo que de verdad pide la ventana: de estos pixeles, ¿con que color pinto?
   *
   * `{ h, s, l }` listo para pintar, o `null` para "no hay respuesta, usa el
   * acento del tema". Las tres decisiones —quien gana, si gana por bastante,
   * y como se deja presentable— viven juntas aqui para que quien llame no
   * tenga que acordarse de aplicar el umbral. Olvidarselo no daria un error:
   * daria un espectro pintado con el ruido del 2 % de una portada, que es un
   * fallo que solo se ve mirando.
   *
   * Pura.
   */
  function deImagen(imagen) {
    const hallazgo = colorDominante(imagen);
    if (!hallazgo) return null;
    if (hallazgo.cuota < AJUSTES.MIN_SHARE) return null;
    return normalizarLuz(hallazgo);
  }

  /**
   * Cuanto hay que acercarse al color nuevo en `dt` milisegundos: de 0
   * (quedarse donde se esta) a 1 (llegar del todo).
   *
   * ES UNA EXPONENCIAL Y NO UNA FRACCION FIJA POR FOTOGRAMA. La fraccion fija
   * es una linea mas corta y esconde una dependencia del hardware: a 120 Hz
   * se aplicaria el doble de veces por segundo que a 60, asi que el mismo
   * codigo suavizaria el doble de rapido en una pantalla mejor. Nadie lo
   * notaria salvo quien tuviera las dos delante, que es la peor clase de
   * fallo. Con el tiempo real medido, el color tarda lo mismo en llegar
   * pinte a los fotogramas que pinte.
   *
   * `SMOOTH_MS` es la constante de tiempo: en ese rato se cubre el 63 % de lo
   * que falta, y practicamente todo en el triple. Nunca llega a 1 con un `dt`
   * finito, y da igual: `mezclarHsl` con t = 0,99 da un color que ya no se
   * distingue del destino.
   *
   * Un `dt` enorme —la ventana estuvo minimizada, el bucle paro— da un paso
   * de casi 1, o sea un salto directo al color de ahora. Es lo correcto:
   * arrastrar un desvanecido de hace medio minuto seria animar hacia un
   * color que ya nadie espera.
   *
   * Pura.
   */
  function pasoDeSuavizado(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    return 1 - Math.exp(-dt / AJUSTES.SMOOTH_MS);
  }

  /**
   * El color que toca pintar ahora mismo, avanzando `actual` hacia `objetivo`.
   *
   * Devuelve el objetivo TAL CUAL cuando no hay un `actual` del que salir. Sin
   * esto habria que elegir un color de partida, y cualquiera que se eligiera
   * seria mentira: el espectro empezaria a existir en gris o en rojo y se
   * arrastraria hasta el color de la cancion a la vista del usuario, como si
   * el primer color significara algo.
   *
   * Pura: no guarda nada. Quien lleva la cuenta del color actual es pip.js,
   * que es quien tiene el bucle.
   */
  function acercar(actual, objetivo, dt) {
    if (!objetivo) return null;
    if (!actual) return objetivo;
    return mezclarHsl(actual, objetivo, pasoDeSuavizado(dt));
  }

  YTMPip.ColorFuente = {
    deImagen,
    acercar,
    // Los tres pasos por separado, para que cuando el color salga raro se
    // pueda saber si el fallo esta en el recuento, en el umbral o en la
    // normalizacion, sin tener que deducirlo del resultado final.
    colorDominante,
    normalizarLuz,
    pasoDeSuavizado
  };
})(typeof self !== "undefined" ? self : globalThis);
