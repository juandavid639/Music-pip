/*
 * Generador de los iconos de la extension (la tanda del logo).
 *
 * EL LOGO ES CODIGO Y NO UN BINARIO SUELTO a proposito: los tres PNG de
 * assets/icons/ salen de este archivo, deterministas byte a byte, y la
 * bateria de pruebas compara lo comprometido en el repo con lo que este
 * generador produce. Un icono retocado a mano en un editor dejaria de
 * casar y la prueba lo diria. Para cambiar el logo se cambia ESTE
 * archivo y se vuelve a correr:
 *
 *   node tools/generar-iconos.js
 *
 * El dibujo (la imagen de referencia aprobada: ventana oscura con la
 * tarjeta roja de la nota):
 *
 *  - 128 y 48: la HISTORIA de la extension en un cuadro. La ventana
 *    grande oscura es la pagina de musica; dos barras grises arriba a
 *    la izquierda sugieren su contenido; y la tarjeta roja con la nota
 *    blanca, abajo a la derecha, ES la ventanita flotante (abajo a la
 *    derecha porque ahi viven las ventanas PiP).
 *  - 16: solo la tarjeta roja con la nota, a todo el lienzo. A ese
 *    tamano la ventana de atras seria un borde de un pixel ilegible.
 *
 * El rojo es el de la casa: el rojo 255 del acento oscuro (#ff0000,
 * la tanda N). No es una copia del CSS que deba seguir a nada en
 * caliente —un icono no se repinta—, pero la coherencia se vigila con
 * una prueba de texto igual que las demas copias deliberadas del rojo.
 * El gris de la ventana, en cambio, NO es el #0f0f0f del fondo real:
 * es un punto mas claro (#202124) a proposito, porque el fondo real
 * se funde con la barra de herramientas oscura de Chrome y el icono
 * perderia la silueta de la ventana, que es la historia entera.
 *
 * Tecnica: campos de distancia con signo (SDF) para rectangulos
 * redondeados y circulos, supermuestreo 8x8 por pixel para el
 * antialiasing (65 niveles de cobertura por borde), y promedio en
 * premultiplicado para que los bordes contra lo transparente no se
 * oscurezcan (promediar RGBA recto tine los bordes de negro).
 *
 * El PNG se codifica aqui mismo: firma, IHDR, un solo IDAT (deflate de
 * node:zlib sobre las filas con filtro 0) e IEND, con el CRC32 de la
 * especificacion implementado a mano (node no lo expone en todas las
 * versiones que soportamos). Sin dependencias.
 */
"use strict";

const zlib = require("node:zlib");

/* ------------------------------------------------------------------ */
/* Los colores y el censo de tamanos                                   */
/* ------------------------------------------------------------------ */

const COLORES = {
  // El rojo 255 del acento oscuro (pip.css es la fuente de verdad).
  tarjeta: [255, 0, 0],
  // Un gris oscuro MAS CLARO que el #0f0f0f del fondo real, a
  // proposito: contra la barra oscura de Chrome el fondo real no se
  // ve, y sin silueta de ventana el logo pierde su historia.
  ventana: [32, 33, 36],
  // Las barras de contenido: el gris de texto apagado de Google (#5f6368).
  contenido: [95, 99, 104],
  nota: [255, 255, 255]
};

// Los tres del manifiesto. La prueba de coherencia los coteja contra
// los "icons" declarados alli: un tamano nuevo aqui sin manifiesto (o
// al reves) no vive en silencio.
const ICONOS = [
  { tamano: 16, archivo: "icon16.png" },
  { tamano: 48, archivo: "icon48.png" },
  { tamano: 128, archivo: "icon128.png" }
];

/* ------------------------------------------------------------------ */
/* Las formas: dentro o fuera, con la distancia clasica                */
/* ------------------------------------------------------------------ */

/**
 * Rectangulo redondeado, centrado en (cx, cy), de ancho w, alto h y
 * radio r en las esquinas. La forma clasica: se resta el radio de la
 * media caja y lo que sobresale se compara contra el circulo de la
 * esquina.
 */
function enRectanguloRedondeado(x, y, cx, cy, w, h, r) {
  const dx = Math.max(Math.abs(x - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (h / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function enCirculo(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/* ------------------------------------------------------------------ */
/* La escena, en coordenadas relativas [0..1] del lienzo               */
/* ------------------------------------------------------------------ */

/**
 * La corchea doble (el glifo de "musica"): dos cabezas, dos plicas y
 * la barra que las une. Todo son ejes rectos a proposito — una corchea
 * suelta pide una banderola inclinada, que a 16 pixeles se vuelve una
 * mancha; la pareja unida por la barra se lee como musica a cualquier
 * tamano con solo circulos y rectangulos.
 *
 * Recibe el centro (ncx, ncy) y el tamano c de la tarjeta que la
 * acoge; todas las medidas son proporciones de c.
 */
function enNota(x, y, ncx, ncy, c) {
  const plicaAncho = 0.075 * c;
  const cabezaR = 0.105 * c;
  // Bordes DERECHOS de las dos plicas (la cabeza cuelga a la
  // izquierda de su plica, como en la partitura).
  const plicaIzqX = ncx - 0.13 * c;
  const plicaDerX = ncx + 0.25 * c;
  const barraArriba = ncy - 0.27 * c;
  const barraAlto = 0.1 * c;
  const cabezaY = ncy + 0.2 * c;

  // La barra de arriba, de la plica izquierda a la derecha.
  if (
    enRectanguloRedondeado(
      x,
      y,
      (plicaIzqX - plicaAncho + plicaDerX) / 2,
      barraArriba + barraAlto / 2,
      plicaDerX - plicaIzqX + plicaAncho,
      barraAlto,
      barraAlto * 0.3
    )
  ) {
    return true;
  }

  // Las dos plicas, de la barra a su cabeza.
  for (const derechaX of [plicaIzqX, plicaDerX]) {
    if (
      enRectanguloRedondeado(
        x,
        y,
        derechaX - plicaAncho / 2,
        (barraArriba + cabezaY) / 2,
        plicaAncho,
        cabezaY - barraArriba,
        plicaAncho * 0.3
      )
    ) {
      return true;
    }
  }

  // Las dos cabezas, colgadas del lado izquierdo de su plica.
  for (const derechaX of [plicaIzqX, plicaDerX]) {
    if (enCirculo(x, y, derechaX - cabezaR * 0.85, cabezaY, cabezaR)) return true;
  }

  return false;
}

/**
 * El color de un punto (u, v) en coordenadas [0..1], o null si es
 * transparente. El orden de las capas es el dibujo entero: la nota
 * tapa a la tarjeta, la tarjeta a la ventana, la ventana al vacio.
 */
function colorEn(u, v, tamano) {
  if (tamano <= 16) {
    // El pequeno: la tarjeta a todo el lienzo, sin ventana detras.
    if (enNota(u, v, 0.5, 0.5, 1)) return COLORES.nota;
    if (enRectanguloRedondeado(u, v, 0.5, 0.5, 0.96, 0.96, 0.26)) return COLORES.tarjeta;
    return null;
  }

  // La tarjeta: la ventanita PiP, abajo a la derecha.
  const c = 0.6;
  const ncx = 0.9 - c / 2;
  const ncy = 0.9 - c / 2;
  if (enNota(u, v, ncx, ncy, c)) return COLORES.nota;
  if (enRectanguloRedondeado(u, v, ncx, ncy, c, c, 0.22 * c)) return COLORES.tarjeta;

  // Las dos barras de contenido de la pagina de atras.
  if (enRectanguloRedondeado(u, v, 0.33, 0.235, 0.38, 0.085, 0.0425)) return COLORES.contenido;
  if (enRectanguloRedondeado(u, v, 0.27, 0.395, 0.26, 0.085, 0.0425)) return COLORES.contenido;

  // La ventana grande, la pagina de musica.
  if (enRectanguloRedondeado(u, v, 0.5, 0.5, 0.96, 0.96, 0.2)) return COLORES.ventana;

  return null;
}

/* ------------------------------------------------------------------ */
/* El pintor: supermuestreo y promedio premultiplicado                 */
/* ------------------------------------------------------------------ */

const SUBMUESTRAS = 8;

/**
 * Pinta una escena rectangular de ancho x alto y devuelve
 * { ancho, alto, datos } con los pixeles RGBA (alfa recto, como los
 * quiere el PNG). La escena es una funcion (x, y) -> color | null EN
 * PIXELES (no en [0..1]): con un lienzo no cuadrado las coordenadas
 * normalizadas estiran los circulos a elipses, y en pixeles las formas
 * son unidades-agnosticas (enNota ya recibe todo proporcional a c).
 *
 * El promedio de las submuestras se hace EN PREMULTIPLICADO: cada
 * submuestra aporta su color multiplicado por su alfa, y al final se
 * deshace la multiplicacion. Promediar el RGBA recto contaria lo
 * transparente como negro y los bordes contra el vacio saldrian con un
 * cerco oscuro — el fallo clasico de los antialiasing caseros.
 */
function pintarEscena(ancho, alto, escena) {
  const datos = new Uint8Array(ancho * alto * 4);
  const paso = 1 / SUBMUESTRAS;

  for (let py = 0; py < alto; py++) {
    for (let px = 0; px < ancho; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUBMUESTRAS; sy++) {
        for (let sx = 0; sx < SUBMUESTRAS; sx++) {
          const color = escena(px + (sx + 0.5) * paso, py + (sy + 0.5) * paso);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }

      const i = (py * ancho + px) * 4;
      if (a > 0) {
        datos[i] = Math.round(r / a);
        datos[i + 1] = Math.round(g / a);
        datos[i + 2] = Math.round(b / a);
        datos[i + 3] = Math.round((a / (SUBMUESTRAS * SUBMUESTRAS)) * 255);
      }
      // Con a en cero el pixel se queda 0,0,0,0: transparente de verdad.
    }
  }

  return { ancho, alto, datos };
}

/**
 * El icono cuadrado de siempre: la escena de colorEn (que habla en
 * [0..1]) traducida a pixeles. Devuelve tambien `tamano` porque el
 * main y las pruebas de la tanda O lo leen.
 */
function pintarIcono(tamano) {
  const imagen = pintarEscena(tamano, tamano, (x, y) => colorEn(x / tamano, y / tamano, tamano));
  return { tamano, ancho: imagen.ancho, alto: imagen.alto, datos: imagen.datos };
}

/* ------------------------------------------------------------------ */
/* El PNG: firma, IHDR, IDAT, IEND y el CRC de la especificacion       */
/* ------------------------------------------------------------------ */

// La tabla del CRC32 (polinomio 0xedb88320), calculada una vez.
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Un chunk PNG: longitud + tipo + datos + CRC(tipo + datos). */
function chunk(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([longitud, cuerpo, crc]);
}

/**
 * Codifica la imagen como PNG RGBA de 8 bits. Cada fila lleva delante
 * su byte de filtro (0, "ninguno"): comprimir mas fino con los otros
 * filtros ahorraria unos cientos de bytes en iconos que pesan menos
 * que este comentario, a cambio de un codificador mas dificil de leer.
 */
function codificarPng(imagen) {
  // Todas las imagenes traen ancho/alto: pintarEscena los pone y
  // pintarIcono los copia (ademas de su `tamano` historico). Un
  // respaldo "si no hay ancho, usa tamano" seria rama muerta — el
  // mutante inmortal clasico — asi que no existe a proposito.
  const { ancho, alto, datos } = imagen;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // tipo de color: RGBA
  ihdr[10] = 0; // compresion: deflate
  ihdr[11] = 0; // filtrado: el estandar
  ihdr[12] = 0; // sin entrelazado

  const bytesPorFila = ancho * 4;
  const crudo = Buffer.alloc(alto * (1 + bytesPorFila));
  for (let y = 0; y < alto; y++) {
    // El byte de filtro de la fila queda en 0 (el alloc ya lo puso).
    crudo.set(datos.subarray(y * bytesPorFila, (y + 1) * bytesPorFila), y * (1 + bytesPorFila) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------ */
/* El main: escribir los tres de assets/icons/                         */
/* ------------------------------------------------------------------ */

function generarTodos() {
  const fs = require("node:fs");
  const path = require("node:path");
  const carpeta = path.join(__dirname, "..", "assets", "icons");
  for (const { tamano, archivo } of ICONOS) {
    const destino = path.join(carpeta, archivo);
    fs.writeFileSync(destino, codificarPng(pintarIcono(tamano)));
    console.log(`  ${archivo} (${tamano}x${tamano})`);
  }
}

if (require.main === module) {
  console.log("Generando los iconos de Music PiP");
  generarTodos();
}

module.exports = {
  COLORES,
  ICONOS,
  pintarIcono,
  pintarEscena,
  codificarPng,
  crc32,
  colorEn,
  // Las formas se exportan para el mosaico de la tienda
  // (tools/generar-mosaico.js): reusar el dibujo, no copiarlo.
  enRectanguloRedondeado,
  enCirculo,
  enNota
};
