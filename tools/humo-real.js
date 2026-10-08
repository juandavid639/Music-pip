/*
 * LA PRUEBA DE HUMO CONTRA EL SITIO REAL (tanda AX).
 *
 *   npm run humo            (sin ventana)
 *   npm run humo -- --ver   (con la ventana de Chromium a la vista)
 *
 * La suite corre contra fixtures; esto carga la extension DE VERDAD en un
 * Chromium limpio (perfil temporal, sin cuentas) y la pasea por YouTube real.
 * Es la red para el dia que YouTube cambie su HTML: lo vemos aqui antes que
 * en una reseña.
 *
 * SOLO EN LOCAL, a mano, antes de publicar (decision del autor). No va en CI
 * ni en npm test: los sitios reales fallan por anuncios, regiones y avisos de
 * cookies, y harian el CI inestable. Tampoco toca Spotify ni Deezer (piden
 * cuenta) ni pulsa nada que guarde algo en ninguna cuenta: no hay cuenta.
 *
 * Que comprueba, en orden (para en el primer fallo que impida seguir):
 *   1. El service worker arranca.
 *   2. Al instalar se abre la pagina de bienvenida (tanda AR).
 *   3. En un video de YouTube aparece el boton PiP de la pagina.
 *   4. Con el video sonando, el estado que guarda el service worker trae
 *      titulo, «conectado» y NINGUNA pieza vital que falte (la salud del
 *      adaptador de la tanda AK, contra el sitio de hoy).
 *   5. El menu del icono dice «Connected to YouTube».
 */
// `chrome` y `window` solo aparecen dentro de evaluate(): esas funciones
// corren en el service worker o en la pagina, no en Node.
/* global chrome, window */
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { chromium } = require("playwright");

const RAIZ = path.resolve(__dirname, "..");
const VER = process.argv.includes("--ver");
// Un video publico y longevo; si un dia desaparece, se cambia aqui.
const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const filas = [];
function apuntar(paso, ok, detalle) {
  filas.push({ paso, resultado: ok ? "OK" : "FALLA", detalle: detalle || "" });
  console.log((ok ? "  ok    " : "  FALLA ") + paso + (detalle ? " — " + detalle : ""));
  return ok;
}

async function principal() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "music-pip-humo-"));
  const contexto = await chromium.launchPersistentContext(perfil, {
    channel: "chromium",
    headless: !VER,
    args: [`--disable-extensions-except=${RAIZ}`, `--load-extension=${RAIZ}`, "--autoplay-policy=no-user-gesture-required"]
  });
  try {
    // 1. El service worker.
    let [trabajador] = contexto.serviceWorkers();
    if (!trabajador) trabajador = await contexto.waitForEvent("serviceworker", { timeout: 15000 });
    const id = new URL(trabajador.url()).host;
    apuntar("el service worker arranca", Boolean(id), "id " + id);

    // 2. La bienvenida (la abre el service worker al instalar).
    const bienvenida = await esperarA(
      () => contexto.pages().find((p) => p.url().includes("/src/bienvenida/bienvenida.html")),
      8000
    );
    apuntar("al instalar se abre la bienvenida", Boolean(bienvenida));

    // 3. El boton PiP en un video de YouTube.
    const pagina = await contexto.newPage();
    await pagina.goto(VIDEO, { waitUntil: "domcontentloaded" });
    const boton = await pagina
      .waitForSelector("#ytmpip-launcher", { timeout: 25000 })
      .then(() => true)
      .catch(() => false);
    if (!apuntar("aparece el boton PiP en la pagina", boton)) return;

    // 4. Sonando: el estado guardado y la salud del adaptador.
    await pagina.locator("video").first().evaluate((v) => v.play().catch(() => {}));
    const estado = await esperarA(async () => {
      const guardado = await trabajador.evaluate(() => chrome.storage.local.get("lastKnownState"));
      const s = guardado && guardado.lastKnownState;
      return s && s.connected && s.playing && s.title ? s : null;
    }, 30000);
    if (!apuntar("el estado llega con titulo y sonando", Boolean(estado), estado ? "«" + estado.title + "»" : "")) return;
    const faltan = estado.piezasQueFaltan || [];
    apuntar("ninguna pieza vital falta en el sitio de hoy", faltan.length === 0, faltan.join(", "));

    /*
     * 4b. La ventana flotante DE VERDAD: el clic de Playwright es un gesto
     * real, asi que requestWindow lo acepta. Es la prueba en vivo de la
     * tanda AU: la ventana carga pip.html y pip.css por getURL, que con
     * use_dynamic_url devuelve la direccion aleatoria de la sesion. Si algo
     * los pidiera por otro camino, la ventana saldria vacia o sin estilos.
     */
    await pagina.click("#ytmpip-launcher");
    const ventana = await esperarA(
      () =>
        pagina.evaluate(() => {
          const w = window.documentPictureInPicture && window.documentPictureInPicture.window;
          const raiz = w && w.document.getElementById("ytmpip-root");
          const titulo = w && w.document.getElementById("ytmpip-title");
          const hoja = w && Array.from(w.document.styleSheets).some((s) => s.cssRules && s.cssRules.length > 10);
          return raiz && titulo && titulo.textContent ? { titulo: titulo.textContent, hoja } : null;
        }),
      10000
    );
    apuntar("la ventana flotante se abre con su HTML", Boolean(ventana), ventana ? "«" + ventana.titulo + "»" : "");
    apuntar("y con su hoja de estilos (direccion dinamica)", Boolean(ventana && ventana.hoja));

    // 5. El menu del icono.
    const menu = await contexto.newPage();
    await menu.goto(`chrome-extension://${id}/src/popup/popup.html`);
    const frase = await esperarA(async () => {
      const t = await menu.locator("#ytmpip-popup-status").textContent();
      return t && /YouTube/.test(t) ? t : null;
    }, 8000);
    apuntar("el menu dice a que sitio esta conectado", Boolean(frase), frase || "");
  } finally {
    await contexto.close();
    fs.rmSync(perfil, { recursive: true, force: true });
  }
}

async function esperarA(funcion, plazo) {
  const hasta = Date.now() + plazo;
  for (;;) {
    const r = await funcion();
    if (r) return r;
    if (Date.now() > hasta) return null;
    await new Promise((ok) => setTimeout(ok, 500));
  }
}

principal()
  .catch((err) => apuntar("la prueba llego al final", false, err.message))
  .finally(() => {
    const fallos = filas.filter((f) => f.resultado === "FALLA").length;
    console.log(fallos ? `\n${fallos} FALLO(S): no publicar sin mirarlo.` : "\nTodo en orden contra el sitio real.");
    process.exitCode = fallos ? 1 : 0;
  });
