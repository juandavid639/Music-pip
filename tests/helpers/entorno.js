/*
 * Monta un entorno de navegador simulado (jsdom) y carga los archivos de
 * la extension tal cual son, sin transformarlos.
 *
 * Funciona porque todos los modulos siguen el mismo patron:
 *   (function (root) { ... })(typeof self !== "undefined" ? self : globalThis)
 * Dentro de jsdom, `self` es la ventana, asi que YTMPip se construye en
 * ella exactamente igual que en un content script real.
 */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..", "..");

/*
 * El catalogo español DE VERDAD, no frases copiadas aqui. Es la pieza que
 * mantiene honestas a las pruebas de etiquetas: cuando una afirma que el
 * boton dice «Pausar», lo que esta comprobando es lo que el usuario ve,
 * porque el doble de chrome.i18n contesta con el mismo archivo que Chrome.
 * Si el catalogo se desvia del texto esperado, la prueba cae; con frases
 * copiadas seguiria en verde mintiendo.
 */
const CATALOGO_ES = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "_locales", "es", "messages.json"), "utf8")
);

/*
 * Doble de chrome.i18n.getMessage con las mismas reglas que el real: clave
 * ausente devuelve "", y $1..$9 se sustituyen por posicion (un hueco sin
 * sustitucion queda vacio). Con el contexto invalidado LANZA, que es el
 * comportamiento real que obliga a textos.js a llevar su cache.
 */
function i18nFalso(opciones) {
  return {
    getMessage(clave, sustituciones) {
      if (opciones.contextoValido === false) {
        throw new Error("Extension context invalidated.");
      }
      const entrada = CATALOGO_ES[clave];
      if (!entrada) return "";
      const subs = Array.isArray(sustituciones)
        ? sustituciones
        : sustituciones === undefined
          ? []
          : [sustituciones];
      return entrada.message.replace(/\$(\d)/g, (todo, n) => {
        const valor = subs[Number(n) - 1];
        return valor === undefined ? "" : String(valor);
      });
    }
  };
}

/** Doble de chrome.* suficiente para los modulos que lo tocan. */
function chromeFalso(opciones = {}) {
  const almacen = opciones.storage || {};
  return {
    i18n: i18nFalso(opciones),
    runtime: {
      // `id` undefined simula el contexto invalidado tras recargar la extension.
      id: opciones.contextoValido === false ? undefined : "id-de-prueba",
      getURL: (p) => `chrome-extension://id-de-prueba/${p}`,
      sendMessage: opciones.sendMessage || (() => Promise.resolve({ ok: true })),
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get: () => Promise.resolve(almacen),
        set: () => Promise.resolve()
      },
      onChanged: { addListener() {} }
    }
  };
}

function crearEntorno(html = "<!doctype html><html><body></body></html>", opciones = {}) {
  const dom = new JSDOM(html, {
    /*
     * La URL decide que adaptador elige el registro (por hostname). Por
     * defecto se simula YouTube Music, que es donde vive casi toda la
     * bateria; las pruebas del adaptador de YouTube normal pasan la suya
     * con `opciones.url`.
     */
    url: opciones.url || "https://music.youtube.com/watch?v=prueba",
    /*
     * IMPRESCINDIBLE. Sin `runScripts`, jsdom crea la ventana sin contexto
     * de ejecucion propio: window.eval existe, no lanza y NO HACE NADA.
     * Los modulos parecian cargarse y win.YTMPip quedaba undefined.
     *
     * "outside-only" da un contexto JS a la ventana pero no ejecuta los
     * <script> del HTML, que es justo lo que queremos: los fixtures son
     * DOM inerte y los modulos los inyectamos nosotros con cargar().
     */
    runScripts: "outside-only"
  });
  const win = dom.window;
  win.self = win;
  win.chrome = chromeFalso(opciones);
  return { dom, win };
}

/** Evalua archivos de src/ dentro de la ventana, en orden. */
function cargar(win, ...rutasRelativas) {
  for (const rel of rutasRelativas) {
    const codigo = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    win.eval(codigo);
  }
  // Red de seguridad: si el eval vuelve a ser un no-op silencioso, que
  // reviente aqui con un mensaje claro en vez de en cada assert.
  if (!win.YTMPip) {
    throw new Error(
      "cargar(): los modulos no se evaluaron en la ventana (win.YTMPip sigue sin existir). " +
        "Revisa la opcion runScripts de JSDOM."
    );
  }
}

function leerFixture(nombre) {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", nombre), "utf8");
}

/** Entorno tipico de content script con los modulos de lectura cargados. */
function entornoContenido(fixture, opciones) {
  const { dom, win } = crearEntorno(leerFixture(fixture), opciones);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    // El registro ANTES que el adaptador, como en el manifest: es quien
    // publica YTMPip.Adapter cuando el adaptador se registra.
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    // Los TRES adaptadores, como en el manifest: en produccion todos se
    // cargan en todos los sitios y es el registro quien elige por hostname.
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js",
    "src/content/track-timeline.js",
    "src/content/metadata-reader.js",
    "src/content/lyrics-reader.js"
  );
  return { dom, win, YTMPip: win.YTMPip };
}

/*
 * Entorno de pagina COMPLETO: lo mismo que entornoContenido mas el
 * orquestador (content-script.js) realmente en marcha.
 *
 * La diferencia importa. entornoContenido carga solo lectores y se les
 * pregunta a mano; aqui arranca el bucle de verdad
 * (MutationObserver -> buildState -> sendState), que es donde viven los
 * fallos de "la ventana se quedo congelada": ninguna funcion da un
 * resultado incorrecto, simplemente deja de llamarse a nadie.
 *
 * El content script no publica nada en YTMPip, asi que no hay forma de
 * llamarle por dentro. Se le observa por donde se le observa en
 * produccion: los mensajes que emite. `enviados` los recoge todos.
 *
 * `antesDeCargar` corre con la ventana ya creada pero antes de evaluar
 * ningun modulo, que es la unica posicion desde la que se puede
 * instrumentar algo que el content script vaya a usar durante su init().
 */
function entornoPagina(fixture, opciones = {}) {
  const enviados = [];
  const { dom, win } = crearEntorno(
    leerFixture(fixture),
    Object.assign(
      {
        sendMessage(mensaje) {
          enviados.push(mensaje);
          return Promise.resolve({ ok: true });
        }
      },
      opciones
    )
  );

  if (opciones.antesDeCargar) opciones.antesDeCargar(win);

  cargar(
    win,
    "src/shared/constants.js",
    // En la misma posicion que en el manifest: los textos van antes que
    // cualquier modulo que pueda pintar una etiqueta.
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    // El registro ANTES que el adaptador, como en el manifest: es quien
    // publica YTMPip.Adapter cuando el adaptador se registra.
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    // Los TRES adaptadores, como en el manifest: en produccion todos se
    // cargan en todos los sitios y es el registro quien elige por hostname.
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js",
    "src/content/track-timeline.js",
    "src/content/metadata-reader.js",
    "src/content/lyrics-reader.js",
    "src/content/player-controller.js",
    // El temporizador de apagado, en la misma posicion que en el manifest:
    // el orquestador lo consulta en cada latido y sin el ese cable quedaria
    // sin ejercitar (se guarda con un `if`, o sea que fallaria en silencio).
    "src/content/temporizador-apagado.js",
    // La memoria del ecualizador por cancion, por lo mismo y con el mismo
    // riesgo: su llamada en el latido tambien va tras un `if`.
    "src/content/ecualizador-por-cancion.js",
    /*
     * El grafo va ANTES del orquestador y no es opcional: content-script.js
     * le pasa el <video> que suena en cada relevo. Sin el, el orquestador
     * no reventaria —se guarda de que YTMPip.GrafoAudio no exista— pero el
     * ecualizador dejaria de cablearse en silencio, que es exactamente el
     * fallo que las pruebas del cable buscan. El orden es el mismo del
     * manifest a proposito.
     */
    "src/content/audio-grafo.js",
    "src/content/content-script.js"
  );

  return {
    dom,
    win,
    YTMPip: win.YTMPip,
    enviados,
    ultimoEstado() {
      const msg = enviados.filter((m) => m.type === "STATE_UPDATE").pop();
      return msg ? msg.state : null;
    }
  };
}

/*
 * Espera a que se asiente el bucle del content script.
 *
 * No es un sleep arbitrario: hay DOS retrasos reales encadenados que
 * cruzar. El MutationObserver entrega sus registros en un microtask, y
 * scheduleUpdate() ademas mete un debounce de OBSERVER_DEBOUNCE_MS. Con
 * menos espera la prueba mediria el estado a medio camino y fallaria de
 * forma intermitente, que es peor que no tenerla.
 */
function pulso(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
 * Le pone a un <video> de jsdom unos tiempos creibles.
 *
 * jsdom implementa `duration` como getter que devuelve NaN y no admite
 * asignacion, asi que hay que redefinir la propiedad. `currentTime` si
 * es asignable. Sin duracion valida MetadataReader devuelve {0, 0} y
 * cualquier prueba sobre tiempos seria vacua.
 */
function conTiempos(video, currentTime, duration) {
  Object.defineProperty(video, "duration", { value: duration, configurable: true });
  video.currentTime = currentTime;
  return video;
}

function reloj(segundos) {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Pone en la barra de YouTube Music el tiempo de LA PISTA que suena.
 *
 * Es la unica fuente que lo sabe: el <video> lleva la cola entera en una
 * sola linea de tiempo y sus numeros son acumulados. Se rellenan las DOS
 * formas que tiene la pagina de decirlo, porque el adaptador usa una como
 * respaldo de la otra.
 *
 * Con `null` se vacian, que es como se reproduce una pagina en la que
 * Google haya cambiado la barra y no podamos leerla.
 */
function conTiempoDePagina(win, elapsed, duration) {
  const slider = win.document.querySelector("#progress-bar");
  const texto = win.document.querySelector(".time-info");
  const vacio = elapsed === null || duration === null;

  if (slider) {
    if (vacio) {
      slider.removeAttribute("aria-valuenow");
      slider.removeAttribute("aria-valuemax");
    } else {
      slider.setAttribute("aria-valuenow", String(elapsed));
      slider.setAttribute("aria-valuemax", String(duration));
    }
  }
  if (texto) texto.textContent = vacio ? "" : `${reloj(elapsed)} / ${reloj(duration)}`;
}

/*
 * Simula el documento de la ventana flotante.
 *
 * No basta con mover el <video> a otro sitio de la MISMA pagina: el
 * adaptador tiene "video" como ultimo selector de reserva, asi que lo
 * seguiria encontrando y la prueba pasaria aunque el prestamo no
 * funcionase. Lo que ocurre de verdad al abrir el PiP es que el elemento
 * cambia de documento, y ahi si deja de ser alcanzable desde la pagina.
 *
 * createHTMLDocument devuelve un Document independiente dentro de la misma
 * ventana; appendChild lo adopta igual que hace el navegador.
 */
function documentoFlotante(win) {
  return win.document.implementation.createHTMLDocument("pip");
}

/*
 * Reconstruye un valor en el realm de Node.
 *
 * Los objetos creados dentro de la ventana jsdom heredan del Object de ESA
 * ventana, no del de Node. assert.deepStrictEqual compara prototipos, asi
 * que falla con "same structure but not reference-equal" aunque el
 * contenido sea identico. No es un fallo del codigo: es cross-realm.
 *
 * Se hace a mano en vez de con JSON.parse(JSON.stringify(...)) porque el
 * round-trip por JSON elimina las claves con valor undefined, y varias
 * (album, text) son significativas.
 */
function plano(valor) {
  /*
   * `Array.from` y no `valor.map(plano)` a secas, que es lo que habia aqui.
   * `map` construye el array nuevo con el constructor del array de ENTRADA,
   * asi que un array salido de la ventana jsdom producia otro array de
   * jsdom: la linea prometia reconstruir en el realm de Node y para los
   * arrays no lo hacia. Los objetos si estaban bien —`const salida = {}` se
   * crea aqui, en Node—, y esa asimetria es la que lo mantuvo escondido.
   *
   * Salio a la luz al comparar `partirColor`, que fue lo primero que devolvio
   * un array dentro de un objeto.
   */
  if (Array.isArray(valor)) return Array.from(valor, plano);
  if (valor && typeof valor === "object") {
    const salida = {};
    for (const clave of Object.keys(valor)) salida[clave] = plano(valor[clave]);
    return salida;
  }
  return valor;
}

module.exports = {
  crearEntorno,
  cargar,
  i18nFalso,
  leerFixture,
  entornoContenido,
  entornoPagina,
  pulso,
  conTiempos,
  conTiempoDePagina,
  chromeFalso,
  documentoFlotante,
  plano,
  RAIZ
};
