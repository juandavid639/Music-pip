/*
 * EL SERVICE WORKER: a que pestaña habla, quien escribe el ultimo estado,
 * y que pasa con las pestañas que ya estaban abiertas al actualizar.
 *
 * Es el primer archivo de pruebas que tiene (tanda T). Hasta aqui nadie lo
 * cargaba, y la auditoria del 2026-09-28 le encontro cinco fallos, todos de
 * la misma familia: NO DAN ERROR. Un atajo que pausa la pestaña equivocada,
 * un menu que dice «conectado» a una pestaña cerrada, un «abierto» que no
 * se abrio, una extension muerta tras cada actualizacion hasta un F5.
 *
 * EL BANCO. `service-worker.js` se ejecuta en un contexto de `vm` con un
 * `chrome` falso y un `importScripts` que carga los dos archivos de verdad
 * que pide. Cada pestaña falsa lleva su MUNDO AISLADO: `vivo` dice si tiene
 * content script de esta version. Las funciones que el service worker
 * inyecta con `executeScript({ func })` se ejecutan de verdad dentro de ese
 * mundo, serializadas como hace Chrome (por su texto): asi se prueba lo que
 * hacen, no lo que se supone que hacen.
 *
 * «Dormirse» es tirar el contexto y montar otro con la MISMA sesion: es
 * exactamente lo que le pasa al service worker de MV3, que pierde sus
 * variables y conserva chrome.storage.session.
 *
 * LO QUE NO SE PRUEBA AQUI: que Chrome de verdad borre storage.session al
 * actualizar, ni que executeScript con `files` deje el mundo como lo deja
 * el manifiesto. Eso es de Chrome, y la reinyeccion NO ESTA MEDIDA en vivo
 * (ver el README, tanda T).
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { RAIZ, plano } = require("../helpers/entorno.js");

const MANIFIESTO = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
const SW = path.join(RAIZ, "src/background/service-worker.js");

const SIN_RESPUESTA = { sinRespuesta: true };
const NADIE = "Could not establish connection. Receiving end does not exist.";

function pestana(id, url, extra = {}) {
  return Object.assign({ id, url, status: "complete", audible: false, discarded: false, vivo: true, windowId: 1 }, extra);
}

/*
 * Monta un service worker. `pestanas` se comparte entre despertares (son
 * las del navegador), igual que `sesion` y `local`.
 */
function trabajador({ pestanas = [], sesion = {}, local = {}, abrir = "opened", fallaVentana = false, contextos = [] } = {}) {
  const oyentes = {};
  const ev = (nombre) => ({ addListener: (fn) => (oyentes[nombre] = oyentes[nombre] || []).push(fn) });
  const registro = { enviados: [], inyecciones: [], destacados: [], ventanas: [], creadas: [], avisos: [], insignias: [], colores: [], enfocadas: [] };

  const pick = (almacen, claves) => {
    if (claves == null) return Object.assign({}, almacen);
    const lista = Array.isArray(claves) ? claves : [claves];
    const r = {};
    for (const k of lista) if (k in almacen) r[k] = almacen[k];
    return r;
  };
  const buscar = (id) => pestanas.find((p) => p.id === id);

  // El mundo aislado de una pestaña, visto desde una funcion inyectada.
  function mundo(tab) {
    const g = { Event: class {}, Boolean };
    g.self = g;
    g.window = { dispatchEvent: () => registro.avisos.push(["evento", tab.id]) };
    if (tab.vivo) {
      g.YTMPip = {
        PipView: {
          // "respaldo" (tanda AF): la pestaña no tiene Document PiP y lo dice.
          open: () =>
            abrir === "opened" ? Promise.resolve() : abrir === "respaldo" ? Promise.resolve("respaldo") : Promise.reject({ name: abrir }),
          destacarLanzador: () => {
            registro.destacados.push(tab.id);
            return tab.lanzador !== false;
          }
        }
      };
    }
    return g;
  }

  const chrome = {
    runtime: {
      id: "id-de-prueba",
      getURL: (p) => `chrome-extension://id-de-prueba/${p}`,
      getManifest: () => MANIFIESTO,
      // Las paginas de la extension abiertas (tanda AF: la ventana de respaldo).
      getContexts: async () => contextos,
      onInstalled: ev("instalar"),
      onStartup: ev("arrancar"),
      onMessage: ev("mensaje")
    },
    storage: {
      local: {
        get: async (k) => pick(local, k),
        set: async (o) => void Object.assign(local, o)
      },
      onChanged: ev("almacen"),
      session: {
        get: async (k) => pick(sesion, k),
        set: async (o) => void Object.assign(sesion, o),
        remove: async (k) => void delete sesion[k]
      }
    },
    tabs: {
      query: async () => pestanas.map((p) => Object.assign({}, p)),
      get: async (id) => {
        const t = buscar(id);
        if (!t) throw new Error("No tab with id");
        return Object.assign({}, t);
      },
      update: async () => ({}),
      create: async (o) => void registro.creadas.push(o),
      sendMessage: async (id, mensaje) => {
        const t = buscar(id);
        if (!t || !t.vivo) throw new Error(NADIE);
        registro.enviados.push({ id, tipo: mensaje.type, mensaje });
        if (mensaje.type === "REQUEST_CURRENT_STATE") return { state: { connected: true, deLaPestana: id } };
        return { ok: true };
      },
      onRemoved: ev("cerrar"),
      onUpdated: ev("navegar")
    },
    scripting: {
      executeScript: async ({ target, files, func }) => {
        const t = buscar(target.tabId);
        if (!t) throw new Error("No tab with id");
        if (files) {
          registro.inyecciones.push({ id: t.id, files });
          t.vivo = true;
          return [{ result: undefined }];
        }
        const ctx = vm.createContext(mundo(t));
        const result = await vm.runInContext(`(${func.toString()})()`, ctx);
        return [{ result }];
      }
    },
    windows: {
      create: async (o) => {
        if (fallaVentana) throw new Error("no se pudo crear la ventana");
        registro.ventanas.push(o);
      },
      update: async (id, cambios) => void registro.enfocadas.push([id, cambios])
    },
    action: {
      onClicked: ev("icono"),
      // El icono con estado (tanda AC): se apunta lo que se le pinta.
      setBadgeText: async ({ text }) => void registro.insignias.push(text),
      setBadgeBackgroundColor: async ({ color }) => void registro.colores.push(color)
    },
    commands: { onCommand: ev("atajo") }
  };

  const consola = { log() {}, info() {}, warn: (...a) => registro.avisos.push(a), error: (...a) => registro.avisos.push(a) };
  const contexto = { chrome, console: consola, Promise };
  contexto.self = contexto;
  contexto.importScripts = (...rutas) => {
    for (const r of rutas) {
      vm.runInContext(fs.readFileSync(path.resolve(path.dirname(SW), r), "utf8"), contexto);
    }
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(SW, "utf8"), contexto, { filename: SW });

  const disparar = (nombre, ...args) => Promise.all((oyentes[nombre] || []).map((fn) => fn(...args)));

  return {
    registro,
    contexto,
    sesion,
    local,
    pestanas,
    disparar,
    /*
     * Un mensaje de runtime, esperando a su sendResponse. Con plazo: un
     * sendResponse que no llega nunca es justo uno de los fallos que se
     * persiguen (OPEN_FALLBACK_WINDOW sin catch), y sin plazo esa prueba no
     * caeria, colgaria la suite entera.
     */
    mensaje(tipo, extra = {}, tabId) {
      return new Promise((resolve) => {
        const plazo = setTimeout(() => resolve(SIN_RESPUESTA), 500);
        const responder = (r) => {
          clearTimeout(plazo);
          resolve(r);
        };
        const sender = typeof tabId === "number" ? { tab: { id: tabId } } : {};
        const fn = (oyentes.mensaje || [])[0];
        const asincrono = fn(Object.assign({ type: tipo }, extra), sender, responder);
        if (asincrono !== true) responder(undefined);
      });
    },
    atajo: (nombre) => disparar("atajo", nombre, undefined),
    /** Tirar este contexto y montar otro con la misma sesion y pestañas. */
    despertar(opciones = {}) {
      return trabajador(Object.assign({ pestanas, sesion, local, abrir }, opciones));
    }
  };
}

const YTM = "https://music.youtube.com/watch?v=x";
const YT = "https://www.youtube.com/";
const SPOTIFY = "https://open.spotify.com/";

/* ==================================================================
 * 1. La pestaña recordada sobrevive al sueño
 * ================================================================== */

test("REGRESION TANDA T: tras dormirse, el atajo va a la pestaña que sonaba y no a la primera", async () => {
  // La 3 es una pestaña de YouTube cualquiera y va PRIMERA en la lista; la
  // musica sonaba en la 7 y esta en pausa (nada `audible`).
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)] });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);

  const despierto = w.despertar();
  await despierto.atajo("reproducir-pausar");

  assert.deepStrictEqual(
    despierto.registro.enviados.map((e) => e.id),
    [7],
    "el play/pausa se lo llevo otra pestaña"
  );
});

test("la pestaña recordada se guarda en storage.session, no solo en memoria", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)] });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  assert.strictEqual(w.sesion.pestanaMusical, 7);
});

test("una pestaña que SUENA gana el puesto aunque ya hubiera otra recordada", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM), pestana(9, SPOTIFY)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 9);
  await w.atajo("cancion-siguiente");
  assert.deepStrictEqual(w.registro.enviados.map((e) => e.id), [9]);
});

test("una pestaña que solo CARGA no le quita el puesto a la recordada", async () => {
  // Hasta la 1.0.1 CONTENT_SCRIPT_READY se lo quedaba sin preguntar:
  // abrir youtube.com bastaba para que los atajos dejaran la musica.
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("CONTENT_SCRIPT_READY", {}, 3);
  await w.atajo("reproducir-pausar");
  assert.deepStrictEqual(w.registro.enviados.map((e) => e.id), [7]);
});

test("...pero si el puesto esta vacante, la primera que carga se lo queda", async () => {
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)] });
  await w.mensaje("CONTENT_SCRIPT_READY", {}, 7);
  assert.strictEqual(w.sesion.pestanaMusical, 7);
});

test("una pestaña audible sigue mandando sobre la recordada", async () => {
  const w = trabajador({
    pestanas: [pestana(7, YTM), pestana(9, SPOTIFY, { audible: true })],
    sesion: { pestanaMusical: 7 }
  });
  await w.atajo("reproducir-pausar");
  assert.deepStrictEqual(w.registro.enviados.map((e) => e.id), [9]);
});

/* ==================================================================
 * 2. El ultimo estado conocido
 * ================================================================== */

test("REGRESION TANDA T: una pestaña que no suena no pisa el estado de la recordada", async () => {
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true, title: "La buena" } }, 7);
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: false, title: "" } }, 3);
  assert.strictEqual(w.local.lastKnownState.title, "La buena");
});

test("la recordada si escribe su estado, suene o no", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: false, title: "En pausa" } }, 7);
  assert.strictEqual(w.local.lastKnownState.title, "En pausa");
});

test("REGRESION TANDA T: cerrar la pestaña recordada tras dormirse deja constancia de que no hay musica", async () => {
  // Cerrar la pestaña DESPIERTA al service worker: la variable vale null
  // y la comparacion de la 1.0.1 fallaba justo aqui.
  const w = trabajador({ pestanas: [pestana(7, YTM)] });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);

  const despierto = w.despertar();
  await despierto.disparar("cerrar", 7);

  assert.deepStrictEqual(plano(despierto.local.lastKnownState), { connected: false });
  assert.strictEqual(despierto.sesion.pestanaMusical, undefined);
});

test("cerrar otra pestaña no toca el estado", async () => {
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await w.disparar("cerrar", 3);
  assert.strictEqual(w.local.lastKnownState.connected, true);
});

test("salir del sitio con la pestaña recordada la olvida", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.disparar("navegar", 7, { url: "https://example.com/" });
  assert.strictEqual(w.sesion.pestanaMusical, undefined);
});

/* ==================================================================
 * 3. La reinyeccion
 * ================================================================== */

test("REGRESION TANDA T: al actualizar, las pestañas abiertas sin script vivo lo reciben", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false }), pestana(9, SPOTIFY, { vivo: false })] });
  await w.disparar("instalar", { reason: "update" });
  assert.deepStrictEqual(w.registro.inyecciones.map((i) => i.id).sort(), [7, 9]);
});

test("se inyectan EXACTAMENTE los archivos del manifiesto, en su orden", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })] });
  await w.disparar("instalar", { reason: "update" });
  assert.deepStrictEqual(w.registro.inyecciones[0].files, MANIFIESTO.content_scripts[0].js);
});

test("al instalar tambien: las pestañas que ya estaban abiertas no tienen nada", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })] });
  await w.disparar("instalar", { reason: "install" });
  assert.deepStrictEqual(w.registro.inyecciones.map((i) => i.id), [7]);
});

test("no se inyecta dos veces, ni en la que carga, ni en la descartada", async () => {
  // La viva ya tiene script en este mundo; la que carga la cubre Chrome con
  // el manifiesto al llegar a document_idle; la descartada no tiene documento.
  const w = trabajador({
    pestanas: [
      pestana(1, YTM),
      pestana(2, YTM, { vivo: false, status: "loading" }),
      pestana(3, YTM, { vivo: false, discarded: true })
    ]
  });
  await w.disparar("instalar", { reason: "update" });
  assert.deepStrictEqual(w.registro.inyecciones, []);
});

test("una actualizacion de Chrome no reinyecta nada", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })] });
  await w.disparar("instalar", { reason: "chrome_update" });
  assert.deepStrictEqual(w.registro.inyecciones, []);
});

test("un atajo sobre una pestaña sin script vivo le da script y llega al segundo intento", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })], sesion: { pestanaMusical: 7 } });
  await w.atajo("cancion-siguiente");
  assert.deepStrictEqual(w.registro.inyecciones.map((i) => i.id), [7]);
  assert.deepStrictEqual(w.registro.enviados.map((e) => [e.id, e.mensaje.command.type]), [[7, "NEXT_TRACK"]]);
});

test("el menu pide el estado a una pestaña huerfana y lo recibe igual", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })], sesion: { pestanaMusical: 7 } });
  const r = await w.mensaje("REQUEST_CURRENT_STATE");
  assert.strictEqual(r.state.deLaPestana, 7);
});

/* ==================================================================
 * 4. Abrir la ventana: decir lo que paso
 * ================================================================== */

test("REGRESION TANDA T: si Chrome no deja abrir desde el menu, el menu recibe ok:false y el boton parpadea", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], abrir: "NotAllowedError" });
  const r = await w.mensaje("OPEN_PIP_REQUEST");
  assert.strictEqual(r.ok, false, "el menu recibio «abierto» de una ventana que no se abrio");
  assert.strictEqual(r.result, "destacado");
  assert.deepStrictEqual(w.registro.destacados, [7]);
});

test("sin boton que destacar, el menu se entera tambien", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { lanzador: false })], abrir: "NotAllowedError" });
  const r = await w.mensaje("OPEN_PIP_REQUEST");
  assert.deepStrictEqual([r.ok, r.result], [false, "sin-lanzador"]);
});

test("si la ventana se abre, el menu recibe ok:true", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)] });
  const r = await w.mensaje("OPEN_PIP_REQUEST");
  assert.deepStrictEqual([r.ok, r.result, r.tabId], [true, "opened", 7]);
});

test("sin pestaña musical, el menu recibe not_found como siempre", async () => {
  const w = trabajador();
  const r = await w.mensaje("OPEN_PIP_REQUEST");
  assert.deepStrictEqual(plano(r), { ok: false, reason: "not_found" });
});

test("el icono sobre una pestaña sin script vivo le da script y reintenta", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })] });
  const [resultado] = await w.disparar("icono", pestana(7, YTM));
  assert.deepStrictEqual(w.registro.inyecciones.map((i) => i.id), [7]);
  assert.strictEqual(resultado, "opened", "se le dio script pero no se volvio a intentar");
  assert.deepStrictEqual(w.registro.destacados, [], "se abrio al segundo intento: no habia nada que destacar");
});

test("TANDA AI: sin script vivo no se dispara ningun evento en la pagina (la puerta ytmpip:open-pip se cerro)", async () => {
  /*
   * El evento no lo podia oir nadie (su oyente vivia en el mismo pip.js
   * que publica PipView) y el oyente dejaba abrir la ventana a cualquier
   * script de la pagina. Se contesta «sin-script» y el service worker da
   * script y reintenta, que es lo que ya hacia.
   */
  const w = trabajador({ pestanas: [pestana(7, YTM, { vivo: false })] });
  await w.disparar("icono", pestana(7, YTM));
  assert.deepStrictEqual(w.registro.avisos.filter((a) => a[0] === "evento"), []);
  assert.deepStrictEqual(w.registro.inyecciones.map((i) => i.id), [7], "sin script, se le da script");
});

test("REGRESION TANDA T: si la ventana de respaldo no se puede crear, el que la pidio recibe respuesta", async () => {
  const w = trabajador({ fallaVentana: true });
  const r = await w.mensaje("OPEN_FALLBACK_WINDOW");
  assert.notStrictEqual(r, SIN_RESPUESTA, "el emisor se quedo esperando para siempre");
  assert.strictEqual(r.ok, false);
});

/* ==================================================================
 * 5. El estado en el icono de la barra (tanda AC)
 * ================================================================== */

const ultima = (lista) => lista[lista.length - 1];

test("textoDelIcono: nada sin musica, ▶ si suena, ❚❚ en pausa, y el temporizador manda", () => {
  const { contexto } = trabajador();
  const t = contexto.textoDelIcono;
  assert.strictEqual(t(null), "");
  assert.strictEqual(t({ connected: false, playing: true }), "");
  assert.strictEqual(t({ connected: true, playing: true }), "▶");
  assert.strictEqual(t({ connected: true, playing: false }), "❚❚");
  assert.strictEqual(t({ connected: true, playing: true, sleepTimer: { remainingMs: 29.5 * 60000 } }), "30′", "los minutos se redondean hacia arriba, como en la ventana");
  assert.strictEqual(t({ connected: true, playing: false, sleepTimer: { remainingMs: 0 } }), "❚❚", "un temporizador vencido no cuenta");
});

test("REGRESION TANDA AC: el estado de la pestaña recordada se pinta en el icono, con su color", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  // El color va un paso asincrono detras del texto: un turno de espera.
  const asentar = () => new Promise((r) => setTimeout(r, 0));
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await asentar();
  assert.strictEqual(ultima(w.registro.insignias), "▶");
  assert.strictEqual(ultima(w.registro.colores), w.contexto.self.YTMPip.CONSTANTS.SPECTRUM_LIMITS.COLOR_SUGGESTED);
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: false } }, 7);
  await asentar();
  assert.strictEqual(ultima(w.registro.insignias), "❚❚");
  assert.strictEqual(ultima(w.registro.colores), "#5f6368");
});

test("una pestaña que no es la recordada no pinta el icono (icono y menu cuentan lo mismo)", async () => {
  const w = trabajador({ pestanas: [pestana(3, YT), pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: false } }, 3);
  assert.strictEqual(w.registro.insignias.length, 0);
});

test("con la preferencia apagada el icono queda limpio", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 }, local: { badgePreference: "hidden" } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  assert.strictEqual(ultima(w.registro.insignias), "");
});

test("cambiar la preferencia repinta al momento con el ultimo estado guardado", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await w.disparar("almacen", { badgePreference: { newValue: "hidden" } }, "local");
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(ultima(w.registro.insignias), "", "apagarla no limpio el icono");
  await w.disparar("almacen", { badgePreference: { newValue: "shown" } }, "local");
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(ultima(w.registro.insignias), "▶", "encenderla no lo volvio a pintar");
});

test("cerrar la pestaña recordada limpia el icono", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await w.disparar("cerrar", 7);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(ultima(w.registro.insignias), "");
});

test("REGRESION TANDA AE: con un acento propio, la etiqueta del icono lo sigue", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 }, local: { accentColor: "#12ab34" } });
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(ultima(w.registro.colores), "#12ab34");
});

test("...y cambiarlo en Preferencias repinta la etiqueta al momento", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], sesion: { pestanaMusical: 7 } });
  w.local.lastKnownState = { connected: true, playing: true };
  await w.mensaje("STATE_UPDATE", { state: { connected: true, playing: true } }, 7);
  await w.disparar("almacen", { accentColor: { newValue: "#12ab34" } }, "local");
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(ultima(w.registro.colores), "#12ab34");
});

/* ==================================================================
 * 6. La ventana de respaldo (tanda AF)
 * ================================================================== */

test("REGRESION TANDA AF: sin Document PiP, el menu recibe «respaldo» y no «abierta»", async () => {
  const w = trabajador({ pestanas: [pestana(7, YTM)], abrir: "respaldo" });
  const r = await w.mensaje("OPEN_PIP_REQUEST");
  assert.deepStrictEqual([r.ok, r.result], [false, "respaldo"]);
  assert.deepStrictEqual(w.registro.destacados, [], "no hay boton que destacar: la ventana de respaldo ya esta pedida");
});

test("REGRESION TANDA AF: si ya hay una ventana de respaldo, se enfoca en vez de abrir otra", async () => {
  const w = trabajador({ contextos: [{ windowId: 42 }] });
  const r = await w.mensaje("OPEN_FALLBACK_WINDOW");
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(w.registro.ventanas, [], "se abrio una segunda ventana de respaldo");
  assert.strictEqual(w.registro.enfocadas[0][0], 42);
});

test("...y si no hay ninguna, se abre", async () => {
  const w = trabajador();
  await w.mensaje("OPEN_FALLBACK_WINDOW");
  assert.strictEqual(w.registro.ventanas.length, 1);
});
