/*
 * Generador del mosaico promocional de la Chrome Web Store (440x280).
 *
 * MISMA FILOSOFIA QUE LOS ICONOS (tanda O): el mosaico es codigo, no
 * un binario suelto. Sale determinista de este archivo y la bateria
 * compara lo comprometido en tienda/ con lo que el generador produce.
 * Para cambiarlo se cambia ESTE archivo y se vuelve a correr:
 *
 *   node tools/generar-mosaico.js
 *
 * El dibujo REUSA las formas del generador de iconos (exportadas alli
 * a proposito: reusar el dibujo, no copiarlo): la misma historia del
 * logo, en panoramico. La ventana oscura llena el lienzo ENTERO (los
 * mosaicos de la tienda van a sangre: un PNG con transparencia se ve
 * roto sobre el fondo blanco de la ficha), dos barras grises sugieren
 * la pagina de musica, y la tarjeta roja con la corchea —la ventanita
 * flotante— vive abajo a la derecha, donde viven las ventanas PiP.
 *
 * Lo nuevo aqui es el HALO: un resplandor rojo alrededor de la tarjeta
 * que se funde con el gris de la ventana. Es el guiño a la funcion
 * estrella (el halo de la tanda J) y el unico sitio del dibujo con
 * degradado, asi que vive en este archivo y no en el de los iconos
 * (a 16 pixeles un degradado es barro). La caida es cuadratica, como
 * el golpe del halo real.
 *
 * OJO con las coordenadas: la escena habla en PIXELES, no en [0..1].
 * Con un lienzo no cuadrado las coordenadas normalizadas estiran los
 * circulos a elipses; en pixeles las formas de enNota son fieles.
 */
"use strict";

const {
  COLORES,
  pintarEscena,
  codificarPng,
  enRectanguloRedondeado,
  enNota
} = require("./generar-iconos.js");

const MOSAICO = {
  ancho: 440,
  alto: 280,
  archivo: "mosaico-440x280.png"
};

/* ------------------------------------------------------------------ */
/* La escena, en pixeles del lienzo 440x280                            */
/* ------------------------------------------------------------------ */

// La tarjeta: lado, centro y radio en pixeles. Abajo a la derecha con
// un margen que deja respirar el halo.
const TARJETA = {
  lado: 168,
  cx: 440 - 36 - 168 / 2,
  cy: 280 - 36 - 168 / 2
};

// Hasta donde llega el resplandor, medido desde el borde de la tarjeta.
const HALO_ALCANCE = 44;
// Cuanto rojo se mezcla pegado al borde (0..1). Discreto a proposito:
// es un resplandor, no un segundo rectangulo.
const HALO_FUERZA = 0.4;

/**
 * Distancia (>= 0) desde el punto al borde del rectangulo redondeado
 * de la tarjeta; 0 dentro. Es la version con medida del booleano
 * enRectanguloRedondeado: el halo necesita saber CUANTO de lejos, no
 * solo si dentro o fuera.
 */
function distanciaATarjeta(x, y) {
  const r = 0.22 * TARJETA.lado;
  const dx = Math.max(Math.abs(x - TARJETA.cx) - (TARJETA.lado / 2 - r), 0);
  const dy = Math.max(Math.abs(y - TARJETA.cy) - (TARJETA.lado / 2 - r), 0);
  return Math.max(Math.sqrt(dx * dx + dy * dy) - r, 0);
}

/** Mezcla lineal de dos colores RGB, t en [0..1] hacia el segundo. */
function mezclar(base, tinte, t) {
  return [
    Math.round(base[0] + (tinte[0] - base[0]) * t),
    Math.round(base[1] + (tinte[1] - base[1]) * t),
    Math.round(base[2] + (tinte[2] - base[2]) * t)
  ];
}

/**
 * El color de un punto (x, y) en pixeles. Como en los iconos, el orden
 * de las capas es el dibujo entero: la nota tapa a la tarjeta, la
 * tarjeta al halo, el halo a las barras, y la ventana lo llena todo
 * (aqui no hay vacio: el mosaico va a sangre).
 */
function colorEnMosaico(x, y) {
  if (enNota(x, y, TARJETA.cx, TARJETA.cy, TARJETA.lado)) return COLORES.nota;
  if (
    enRectanguloRedondeado(
      x,
      y,
      TARJETA.cx,
      TARJETA.cy,
      TARJETA.lado,
      TARJETA.lado,
      0.22 * TARJETA.lado
    )
  ) {
    return COLORES.tarjeta;
  }

  // Las dos barras de contenido, arriba a la izquierda (las medidas
  // rimian con las del icono: misma proporcion barra/lienzo a ojo).
  if (enRectanguloRedondeado(x, y, 145, 66, 250, 26, 13)) return COLORES.contenido;
  if (enRectanguloRedondeado(x, y, 105, 116, 170, 26, 13)) return COLORES.contenido;

  // El halo: gris de la ventana tenido de rojo, cayendo al cuadrado
  // con la distancia (la misma curva que el golpe del halo real).
  const d = distanciaATarjeta(x, y);
  if (d < HALO_ALCANCE) {
    const cercania = 1 - d / HALO_ALCANCE;
    return mezclar(COLORES.ventana, COLORES.tarjeta, cercania * cercania * HALO_FUERZA);
  }

  // La ventana, a sangre: nunca null (nada de transparencia).
  return COLORES.ventana;
}

function pintarMosaico() {
  return pintarEscena(MOSAICO.ancho, MOSAICO.alto, colorEnMosaico);
}

/* ------------------------------------------------------------------ */
/* El main: escribir tienda/mosaico-440x280.png                        */
/* ------------------------------------------------------------------ */

function generarMosaico() {
  const fs = require("node:fs");
  const path = require("node:path");
  const destino = path.join(__dirname, "..", "tienda", MOSAICO.archivo);
  fs.writeFileSync(destino, codificarPng(pintarMosaico()));
  console.log(`  ${MOSAICO.archivo} (${MOSAICO.ancho}x${MOSAICO.alto})`);
}

if (require.main === module) {
  console.log("Generando el mosaico de la tienda");
  generarMosaico();
}

module.exports = { MOSAICO, TARJETA, HALO_ALCANCE, HALO_FUERZA, pintarMosaico, colorEnMosaico };
