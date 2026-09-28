/*
 * Comprueba el contenido del zip empaquetado sin descomprimirlo ni instalar
 * dependencias: lee el DIRECTORIO CENTRAL y lista los nombres.
 *
 * Vigila las dos cosas que ya han fallado antes: que no se cuele nada de
 * tools/, tests/, node_modules/ ni better-lyrics-master, y que las rutas
 * internas usen barra normal (Compress-Archive de PowerShell 5.1 escribe
 * barra invertida y Chrome rechaza el paquete).
 *
 * POR QUE EL DIRECTORIO CENTRAL (tanda X). La version anterior buscaba la
 * firma de cabecera local (PK\x03\x04) por TODO el archivo, datos
 * comprimidos incluidos. Cuatro bytes cualesquiera de un PNG o de un
 * deflate que por casualidad formaran esa firma se leian como un archivo
 * mas, con un «nombre» hecho de basura; y ese nombre podia contener una
 * barra invertida y tumbar la revision de un paquete sano, o —peor—
 * parecerse a tools/ sin serlo. El directorio central es el indice que el
 * propio zip declara al final: su posicion la dice el registro de fin
 * (EOCD), y es lo que lee Chrome.
 *
 *   node tools/revisar-zip.js dist/music-pip-<version>.zip
 */
const fs = require("node:fs");

const FIN_DE_DIRECTORIO = 0x06054b50; // "PK\x05\x06"
const ENTRADA_CENTRAL = 0x02014b50; // "PK\x01\x02"

/**
 * Los nombres de las entradas del zip, en el orden del directorio central.
 * Lanza si el archivo no tiene un directorio central coherente: un zip que
 * no se puede leer no es un zip que pase la revision.
 */
function nombresDelZip(zip) {
  // El EOCD mide 22 bytes mas un comentario de hasta 65535: se busca hacia
  // atras desde el final, que es donde tiene que estar.
  const desde = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= desde; i--) {
    if (zip.readUInt32LE(i) === FIN_DE_DIRECTORIO) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("no hay registro de fin de directorio central: no es un zip");

  const total = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  const nombres = [];
  for (let n = 0; n < total; n++) {
    if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== ENTRADA_CENTRAL) {
      throw new Error(`la entrada ${n + 1} de ${total} del directorio central no esta donde dice el indice`);
    }
    const largoNombre = zip.readUInt16LE(pos + 28);
    const largoExtra = zip.readUInt16LE(pos + 30);
    const largoComentario = zip.readUInt16LE(pos + 32);
    nombres.push(zip.subarray(pos + 46, pos + 46 + largoNombre).toString("utf8"));
    pos += 46 + largoNombre + largoExtra + largoComentario;
  }
  return nombres;
}

const PROHIBIDO = /^(tools|tests|node_modules|dist|\.claude|better-lyrics-master)\//;

function revisar(nombres) {
  return {
    indebidos: nombres.filter((n) => PROHIBIDO.test(n)),
    conBarraMala: nombres.filter((n) => n.includes("\\"))
  };
}

module.exports = { nombresDelZip, revisar };

if (require.main === module) {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("uso: node tools/revisar-zip.js <ruta.zip>");
    process.exit(2);
  }

  const nombres = nombresDelZip(fs.readFileSync(ruta));
  const { indebidos, conBarraMala } = revisar(nombres);

  console.log(`archivos: ${nombres.length}`);
  console.log(nombres.map((n) => "  " + n).join("\n"));
  console.log(`\nindebidos: ${indebidos.length ? indebidos.join(", ") : "ninguno"}`);
  console.log(`rutas con barra invertida: ${conBarraMala.length}`);

  process.exit(indebidos.length || conBarraMala.length ? 1 : 0);
}
