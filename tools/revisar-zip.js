/*
 * Comprueba el contenido del zip empaquetado sin descomprimirlo ni instalar
 * dependencias: recorre las cabeceras locales y lista los nombres.
 *
 * Vigila las dos cosas que ya han fallado antes: que no se cuele nada de
 * tools/, tests/, node_modules/ ni better-lyrics-master, y que las rutas
 * internas usen barra normal (Compress-Archive de PowerShell 5.1 escribe
 * barra invertida y Chrome rechaza el paquete).
 *
 *   node tools/revisar-zip.js dist/youtube-music-pip-0.1.0.zip
 */
const fs = require("node:fs");

const ruta = process.argv[2];
if (!ruta) {
  console.error("uso: node tools/revisar-zip.js <ruta.zip>");
  process.exit(2);
}

const zip = fs.readFileSync(ruta);
const FIRMA = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const nombres = [];

for (let i = 0; (i = zip.indexOf(FIRMA, i)) !== -1; i += 4) {
  const largo = zip.readUInt16LE(i + 26);
  nombres.push(zip.slice(i + 30, i + 30 + largo).toString("utf8"));
}

const PROHIBIDO = /^(tools|tests|node_modules|dist|\.claude|better-lyrics-master)\//;
const indebidos = nombres.filter((n) => PROHIBIDO.test(n));
const conBarraMala = nombres.filter((n) => n.includes("\\"));

console.log(`archivos: ${nombres.length}`);
console.log(nombres.map((n) => "  " + n).join("\n"));
console.log(`\nindebidos: ${indebidos.length ? indebidos.join(", ") : "ninguno"}`);
console.log(`rutas con barra invertida: ${conBarraMala.length}`);

process.exit(indebidos.length || conBarraMala.length ? 1 : 0);
