/*
 * Pruebas de los ICONOS GENERADOS de la extension (tools/generar-iconos.js
 * y los tres PNG de assets/icons/).
 *
 * LA PETICION, LITERAL: "el logo de la app cambiarlo" y despues "genera el
 * logo por codigo SI PUEDES". Se pudo: los tres PNG del manifiesto salen de
 * un generador determinista sin dependencias, y eso cambia QUE se puede
 * probar. Un binario suelto solo admite "existe y pesa algo"; un binario
 * generado admite lo mejor de las pruebas de esta casa:
 *
 *   - LA PRUEBA CENTRAL: lo comprometido en el repo es byte a byte lo que
 *     el generador produce hoy. Un icono retocado a mano en un editor, o
 *     un generador cambiado sin regenerar, dejan de casar al instante.
 *   - El PNG esta bien formado SIN confiar en el codificador propio como
 *     juez y parte: la firma y los chunks se leen a mano, el IDAT lo
 *     descomprime node:zlib (el inverso independiente del deflate usado
 *     al codificar), y el CRC32 propio se coteja primero contra el vector
 *     conocido de la especificacion ("123456789" -> 0xcbf43926) para que
 *     verificar los CRC de los chunks con esa misma funcion no sea
 *     circular.
 *   - El DIBUJO cuenta la historia aprobada: ventana oscura, barras de
 *     contenido, tarjeta roja abajo a la derecha con la nota blanca; y el
 *     16 es solo la tarjeta (la ventana a ese tamano seria un borde
 *     ilegible). Se fija con pixeles de muestra elegidos por geometria,
 *     no al azar: uno por capa, lejos de los bordes.
 *   - El rojo de la tarjeta ES el rojo 255 del acento oscuro (tanda N):
 *     otra copia deliberada vigilada por prueba de texto, como las seis
 *     del censo. El gris de la ventana NO se coteja contra ningun CSS a
 *     proposito: es #202124, deliberadamente MAS CLARO que el #0f0f0f del
 *     fondo real, porque contra la barra oscura de Chrome el fondo real
 *     no dibuja silueta.
 *   - El promedio premultiplicado se prueba por su SINTOMA, no por su
 *     formula: en el 16 todo pixel de borde con alfa parcial debe ser
 *     rojo PURO. El promedio recto (el fallo clasico) contaria lo
 *     transparente como negro y esos mismos pixeles saldrian con un rojo
 *     ensuciado.
 *
 * Los pixeles de muestra se leen del GENERADOR y no del archivo en disco
 * a proposito: la prueba central ya ata el disco al generador byte a
 * byte, asi que probar el generador ES probar los archivos, y de paso
 * cada regla del dibujo muere por su propia prueba y no solo por el
 * cotejo global (que mata cualquier cambio sin decir cual).
 *
 * Lo que NO se prueba aqui, a proposito: que el logo sea "bonito". Eso se
 * miro en las lecturas visuales de los tres tamanos y lo juzga el usuario.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { RAIZ } = require("../helpers/entorno.js");

const {
  COLORES,
  ICONOS,
  pintarIcono,
  codificarPng,
  crc32
} = require(path.join(RAIZ, "tools", "generar-iconos.js"));

const {
  MOSAICO,
  TARJETA,
  pintarMosaico
} = require(path.join(RAIZ, "tools", "generar-mosaico.js"));

/** Lee el pixel (x, y) de una imagen del generador como [r, g, b, a]. */
function pixel(imagen, x, y) {
  const i = (y * imagen.tamano + x) * 4;
  return Array.from(imagen.datos.subarray(i, i + 4));
}

/**
 * Trocea un PNG en sus chunks: [{ tipo, datos, crcLeido }]. Lector a
 * mano y minimo a proposito: es el juez independiente del codificador.
 */
function leerChunks(png) {
  const chunks = [];
  let p = 8; // tras la firma
  while (p < png.length) {
    const longitud = png.readUInt32BE(p);
    const tipo = png.toString("latin1", p + 4, p + 8);
    const datos = png.subarray(p + 8, p + 8 + longitud);
    const crcLeido = png.readUInt32BE(p + 8 + longitud);
    chunks.push({ tipo, datos, crcLeido });
    p += 12 + longitud;
  }
  return chunks;
}

/* ------------------------------------------------------------------ */
/* 1. El CRC y el contenedor PNG                                       */
/* ------------------------------------------------------------------ */

test("el CRC32 propio reproduce el vector conocido de la especificacion", () => {
  // El vector de la spec de zlib/PNG: sin el, verificar los CRC de los
  // chunks con la misma funcion que los escribio seria circular.
  assert.strictEqual(crc32(Buffer.from("123456789", "latin1")), 0xcbf43926);
});

test("los tres PNG estan bien formados: firma, IHDR RGBA de 8 bits, CRCs e IEND", () => {
  for (const { tamano } of ICONOS) {
    const png = codificarPng(pintarIcono(tamano));

    // La firma de los 8 bytes, tal cual la especificacion.
    assert.deepStrictEqual(
      Array.from(png.subarray(0, 8)),
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      `firma del ${tamano}`
    );

    const chunks = leerChunks(png);
    assert.strictEqual(chunks[0].tipo, "IHDR", `primer chunk del ${tamano}`);
    assert.strictEqual(chunks[chunks.length - 1].tipo, "IEND", `ultimo chunk del ${tamano}`);
    assert.strictEqual(chunks[chunks.length - 1].datos.length, 0, `IEND vacio del ${tamano}`);

    const ihdr = chunks[0].datos;
    assert.strictEqual(ihdr.length, 13, `IHDR de 13 bytes del ${tamano}`);
    assert.strictEqual(ihdr.readUInt32BE(0), tamano, `ancho del ${tamano}`);
    assert.strictEqual(ihdr.readUInt32BE(4), tamano, `alto del ${tamano}`);
    assert.strictEqual(ihdr[8], 8, `bits por canal del ${tamano}`);
    assert.strictEqual(ihdr[9], 6, `tipo de color RGBA del ${tamano}`);
    assert.strictEqual(ihdr[12], 0, `sin entrelazado en el ${tamano}`);

    // Cada CRC guardado casa con el CRC del tipo + datos. La funcion ya
    // quedo validada contra el vector conocido, asi que esto no es
    // circular: es comprobar que el codificador la APLICO donde tocaba.
    for (const { tipo, datos, crcLeido } of chunks) {
      const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
      assert.strictEqual(crcLeido, crc32(cuerpo), `CRC del chunk ${tipo} del ${tamano}`);
    }
  }
});

test("el IDAT descomprime a las filas exactas con filtro 0 en cada una", () => {
  for (const { tamano } of ICONOS) {
    const png = codificarPng(pintarIcono(tamano));
    const idat = leerChunks(png).find((c) => c.tipo === "IDAT");
    assert.ok(idat, `IDAT presente en el ${tamano}`);

    // inflateSync es el inverso INDEPENDIENTE del deflate del codificador:
    // si el crudo no fuera un deflate valido, esto revienta solo.
    const crudo = zlib.inflateSync(idat.datos);
    const bytesPorFila = 1 + tamano * 4;
    assert.strictEqual(crudo.length, tamano * bytesPorFila, `largo del crudo del ${tamano}`);
    for (let y = 0; y < tamano; y++) {
      assert.strictEqual(crudo[y * bytesPorFila], 0, `filtro 0 en la fila ${y} del ${tamano}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. LA PRUEBA CENTRAL: el repo lleva lo que el generador produce     */
/* ------------------------------------------------------------------ */

test("los tres PNG comprometidos en assets/icons son byte a byte los del generador", () => {
  // Si esta prueba cae hay dos sospechosos y un solo remedio: o alguien
  // retoco un PNG a mano, o alguien cambio el generador sin regenerar.
  // En ambos casos: node tools/generar-iconos.js y mirar el diff.
  for (const { tamano, archivo } of ICONOS) {
    const enDisco = fs.readFileSync(path.join(RAIZ, "assets", "icons", archivo));
    const generado = codificarPng(pintarIcono(tamano));
    assert.ok(enDisco.equals(generado), `${archivo} no casa con el generador`);
  }
});

test("el censo de ICONOS y el manifiesto declaran exactamente los mismos archivos", () => {
  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
  const esperado = {};
  for (const { tamano, archivo } of ICONOS) {
    esperado[String(tamano)] = `assets/icons/${archivo}`;
  }
  // Las dos declaraciones del manifiesto (la de la barra y la general):
  // un tamano nuevo en el censo sin manifiesto, o al reves, no vive en
  // silencio.
  assert.deepStrictEqual(manifiesto.icons, esperado, "manifest.icons");
  assert.deepStrictEqual(manifiesto.action.default_icon, esperado, "manifest.action.default_icon");
});

/* ------------------------------------------------------------------ */
/* 3. El dibujo: la historia aprobada, capa por capa                   */
/* ------------------------------------------------------------------ */

test("el 128 cuenta la historia entera: vacio, ventana, barras, tarjeta y nota", () => {
  const im = pintarIcono(128);

  // Las esquinas del lienzo quedan fuera del redondeo de la ventana:
  // transparente DE VERDAD (alfa 0), no negro.
  assert.deepStrictEqual(pixel(im, 0, 0), [0, 0, 0, 0], "esquina (0,0)");
  assert.deepStrictEqual(pixel(im, 127, 127), [0, 0, 0, 0], "esquina (127,127)");

  // Un pixel por capa, elegido por geometria y lejos de los bordes:
  assert.deepStrictEqual(pixel(im, 12, 90), [...COLORES.ventana, 255], "la ventana en (12,90)");
  assert.deepStrictEqual(pixel(im, 42, 30), [...COLORES.contenido, 255], "una barra en (42,30)");
  assert.deepStrictEqual(pixel(im, 46, 107), [...COLORES.tarjeta, 255], "la tarjeta en (46,107)");
  assert.deepStrictEqual(pixel(im, 78, 60), [...COLORES.nota, 255], "la nota en (78,60)");
});

test("el 16 es solo la tarjeta con la nota: ni un pixel del gris de la ventana", () => {
  const im = pintarIcono(16);

  // La tarjeta llena el lienzo: un pixel del borde izquierdo ya es rojo.
  assert.deepStrictEqual(pixel(im, 2, 8), [...COLORES.tarjeta, 255], "tarjeta en (2,8)");

  // Y la ventana de atras no existe a este tamano (seria un borde de un
  // pixel ilegible): ningun pixel puede llevar su gris, ni siquiera
  // mezclado en un borde (el gris puro tampoco apareceria mezclado si
  // la capa no se pinta en absoluto, que es lo que se afirma).
  let grises = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const [r, g, b] = pixel(im, x, y);
      if (r === COLORES.ventana[0] && g === COLORES.ventana[1] && b === COLORES.ventana[2]) {
        grises++;
      }
    }
  }
  assert.strictEqual(grises, 0, "pixeles con el gris de la ventana en el 16");
});

test("el antialiasing promedia en premultiplicado: los bordes parciales del 16 son rojo puro", () => {
  // El sintoma del promedio recto (el fallo clasico de los antialiasing
  // caseros) es un cerco oscuro: las submuestras transparentes cuentan
  // como negro y el borde sale con el rojo ensuciado. En el 16 el unico
  // borde contra el vacio es el de la tarjeta, asi que TODO pixel con
  // alfa parcial debe ser [255, 0, 0] exacto. Se exige ademas que haya
  // varios (el redondeo de las esquinas los garantiza): una imagen sin
  // pixeles parciales pasaria el bucle en vacio y no probaria nada.
  const im = pintarIcono(16);
  let parciales = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const [r, g, b, a] = pixel(im, x, y);
      if (a > 0 && a < 255) {
        parciales++;
        assert.deepStrictEqual([r, g, b], COLORES.tarjeta, `borde parcial en (${x},${y})`);
      }
    }
  }
  assert.ok(parciales >= 10, `bordes parciales de sobra (hubo ${parciales})`);
});

/* ------------------------------------------------------------------ */
/* 4. La copia deliberada del rojo                                     */
/* ------------------------------------------------------------------ */

test("el rojo de la tarjeta es el acento oscuro de pip.css (otra copia del censo de la tanda N)", () => {
  // Un icono no se repinta en caliente, asi que esto no puede ser una
  // variable compartida: es una copia deliberada mas, y como las otras
  // seis del censo, vigilada por prueba de texto contra la fuente de
  // verdad (el acento OSCURO de pip.css; el claro es otro rojo a
  // proposito y no pinta nada aqui).
  const css = fs.readFileSync(path.join(RAIZ, "src", "pip", "pip.css"), "utf8");
  const acento = css.match(/--ytmpip-accent:\s*(#[0-9a-f]{6})/i);
  assert.ok(acento, "el acento oscuro de pip.css se deja leer");

  const hexTarjeta =
    "#" + COLORES.tarjeta.map((c) => c.toString(16).padStart(2, "0")).join("");
  assert.strictEqual(hexTarjeta, acento[1].toLowerCase());
});

/* ------------------------------------------------------------------ */
/* 5. El mosaico de la tienda (tanda Q): el hermano panoramico         */
/* ------------------------------------------------------------------ */

/*
 * El mosaico promocional de 440x280 (tienda/mosaico-440x280.png) sale
 * de tools/generar-mosaico.js con la misma filosofia: determinista,
 * cotejado byte a byte contra lo comprometido, y REUSANDO las formas
 * del generador de iconos (exportadas a proposito) en vez de copiarlas.
 * No viaja en el zip — la carpeta tienda/ queda fuera de la lista
 * blanca del empaquetador — pero SI viaja a la ficha de la tienda, y
 * un binario que se publica merece las mismas pruebas que uno que se
 * instala.
 */

/** El pixel (x, y) de una imagen rectangular como [r, g, b, a]. */
function pixelRect(imagen, x, y) {
  const i = (y * imagen.ancho + x) * 4;
  return Array.from(imagen.datos.subarray(i, i + 4));
}

test("el mosaico comprometido en tienda/ es byte a byte el del generador", () => {
  // La central, como con los iconos: retoque a mano o generador
  // cambiado sin regenerar caen aqui. El remedio es el mismo:
  // node tools/generar-mosaico.js y mirar el diff.
  const enDisco = fs.readFileSync(path.join(RAIZ, "tienda", MOSAICO.archivo));
  const generado = codificarPng(pintarMosaico());
  assert.ok(enDisco.equals(generado), `${MOSAICO.archivo} no casa con el generador`);
});

test("el mosaico es un PNG bien formado de 440x280 con CRCs que casan", () => {
  const png = codificarPng(pintarMosaico());
  assert.deepStrictEqual(
    Array.from(png.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "firma"
  );

  const chunks = leerChunks(png);
  const ihdr = chunks[0].datos;
  // Aqui esta el motivo del refactor de la tanda: el codificador de la
  // tanda O escribia `tamano` en ancho Y en alto. Un mosaico cuadrado
  // de 440x440 pasaria todo lo demas y la tienda lo rechazaria.
  assert.strictEqual(ihdr.readUInt32BE(0), 440, "ancho");
  assert.strictEqual(ihdr.readUInt32BE(4), 280, "alto");
  assert.strictEqual(ihdr[9], 6, "RGBA");

  for (const { tipo, datos, crcLeido } of chunks) {
    const cuerpo = Buffer.concat([Buffer.from(tipo, "latin1"), datos]);
    assert.strictEqual(crcLeido, crc32(cuerpo), `CRC del chunk ${tipo}`);
  }

  // Y el crudo mide alto filas de (1 + ancho*4) bytes: si el
  // codificador confundiera ancho con alto al trocear las filas, el
  // inflate independiente lo diria aqui.
  const idat = chunks.find((c) => c.tipo === "IDAT");
  const crudo = zlib.inflateSync(idat.datos);
  assert.strictEqual(crudo.length, 280 * (1 + 440 * 4), "largo del crudo");
});

test("el mosaico va a sangre: ni un solo pixel transparente", () => {
  // Los mosaicos de la ficha se pintan sobre el fondo blanco de la
  // tienda: un PNG con agujeros se ve roto alli. La escena devuelve
  // color SIEMPRE (la ventana llena el lienzo), y esto lo afirma pixel
  // a pixel: todo alfa a 255.
  const im = pintarMosaico();
  for (let i = 3; i < im.datos.length; i += 4) {
    if (im.datos[i] !== 255) {
      const p = (i - 3) / 4;
      assert.fail(`alfa ${im.datos[i]} en (${p % im.ancho}, ${Math.floor(p / im.ancho)})`);
    }
  }
});

test("el mosaico cuenta la misma historia: ventana, barras, tarjeta y nota, por geometria", () => {
  const im = pintarMosaico();

  // La esquina superior izquierda queda lejos del halo (su alcance no
  // llega): gris de la ventana PURO, no tenido.
  assert.deepStrictEqual(pixelRect(im, 8, 8), [...COLORES.ventana, 255], "ventana en (8,8)");
  // Las barras van POR ENCIMA del halo a proposito (la punta de la
  // primera entra en su zona): el centro de cada una es gris contenido
  // puro, no rojizo.
  assert.deepStrictEqual(pixelRect(im, 145, 66), [...COLORES.contenido, 255], "barra 1 en (145,66)");
  assert.deepStrictEqual(pixelRect(im, 105, 116), [...COLORES.contenido, 255], "barra 2 en (105,116)");
  // La tarjeta, roja pura lejos de la nota y de los bordes; y la nota,
  // blanca en el centro de una cabeza (geometria de enNota con
  // c = TARJETA.lado).
  assert.deepStrictEqual(pixelRect(im, 260, 230), [...COLORES.tarjeta, 255], "tarjeta en (260,230)");
  const cabezaX = Math.round(TARJETA.cx - 0.13 * TARJETA.lado - 0.105 * TARJETA.lado * 0.85);
  const cabezaY = Math.round(TARJETA.cy + 0.2 * TARJETA.lado);
  assert.deepStrictEqual(
    pixelRect(im, cabezaX, cabezaY),
    [...COLORES.nota, 255],
    `la nota en (${cabezaX},${cabezaY})`
  );
});

test("el halo del mosaico existe y cae con la distancia, como el golpe del halo real", () => {
  const im = pintarMosaico();

  // Dos puntos a la izquierda de la tarjeta, sobre su eje horizontal:
  // uno pegado al borde y otro mas lejos (ambos dentro del alcance).
  const cerca = pixelRect(im, 232, Math.round(TARJETA.cy));
  const lejos = pixelRect(im, 224, Math.round(TARJETA.cy));

  for (const [nombre, p] of [["cerca", cerca], ["lejos", lejos]]) {
    // Tenido de rojo: mas rojo que el gris puro de la ventana, menos
    // que la tarjeta, y con el canal rojo mandando sobre el verde
    // (un resplandor rojo, no un gris mas claro).
    assert.ok(p[0] > COLORES.ventana[0], `${nombre}: mas rojo que la ventana (${p[0]})`);
    assert.ok(p[0] < COLORES.tarjeta[0], `${nombre}: menos que la tarjeta (${p[0]})`);
    assert.ok(p[0] > p[1], `${nombre}: el rojo manda sobre el verde`);
    assert.strictEqual(p[3], 255, `${nombre}: opaco`);
  }

  // Y la caida: el pegado al borde brilla estrictamente mas.
  assert.ok(
    cerca[0] > lejos[0],
    `el halo cae con la distancia (cerca ${cerca[0]} vs lejos ${lejos[0]})`
  );
});
