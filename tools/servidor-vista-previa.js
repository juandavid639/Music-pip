/*
 * Servidor estatico minimo para mirar la ventana flotante sin abrir Chrome
 * ni reproducir nada.
 *
 * Existe solo porque el marco (src/options/vista-previa.html) hace fetch()
 * de pip.html, y fetch() sobre file:// esta prohibido. Nada mas: no hay
 * dependencias, no se empaqueta y la extension no lo usa jamas.
 *
 *   node tools/servidor-vista-previa.js
 *   -> http://127.0.0.1:8347/tools/vista-previa.html
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PUERTO = Number(process.env.PUERTO || 8347);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const servidor = http.createServer((req, res) => {
  let relativa = decodeURIComponent(new URL(req.url, "http://x").pathname);

  // La raiz es la rejilla: asi vale con abrir el puerto a secas.
  if (relativa === "/") relativa = "/tools/vista-previa.html";

  const destino = path.resolve(RAIZ, "." + relativa);

  // Sin esto, un ../../ en la URL leeria cualquier fichero del disco. Es un
  // servidor de desarrollo, pero escucha en un socket: se comprueba igual.
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) {
    res.writeHead(403).end("fuera del proyecto");
    return;
  }

  fs.readFile(destino, (err, datos) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("no encontrado: " + relativa);
      return;
    }
    res.writeHead(200, {
      "content-type": TIPOS[path.extname(destino)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(datos);
  });
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`Vista previa en http://127.0.0.1:${PUERTO}/tools/vista-previa.html`);
});
