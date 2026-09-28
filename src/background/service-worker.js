/*
 * Service worker (seccion 3.3). Responsabilidades:
 * - Localizar la pestaña activa de YouTube Music.
 * - Coordinar la apertura del PiP reenviando la activacion de usuario
 *   del clic en el popup hacia el content script de esa pestaña.
 * - Gestionar instalacion/actualizacion y preferencias por defecto.
 * - Manejar la perdida o cierre de la pestaña musical.
 */
importScripts("../shared/constants.js", "../shared/messages.js");

const { MESSAGE_TYPES, COMMAND_TYPES, createMessage, createCommand } = self.YTMPip;
const { STORAGE_KEYS, DEFAULT_SETTINGS, PIP_DIMENSIONS, SITIOS_SOPORTADOS, URL_POR_DEFECTO, SPECTRUM_LIMITS } =
  self.YTMPip.CONSTANTS;

/*
 * Desde la tanda multi-sitio, los patrones y prefijos salen de la lista de
 * constants.js: aqui habia CUATRO copias literales de music.youtube.com y
 * abrirse a YouTube normal las habria dejado desacordadas en silencio.
 * chrome.tabs.query admite un array de patrones tal cual.
 */
const PATRONES_DE_SITIO = SITIOS_SOPORTADOS.map((s) => s.patron);

function esUrlSoportada(url) {
  return !!url && SITIOS_SOPORTADOS.some((s) => url.startsWith(s.prefijo));
}

/*
 * LA PESTAÑA MUSICAL, recordada en storage.session y no solo en una
 * variable (tanda T).
 *
 * Hasta la 1.0.1 vivia solo en `musicTabId`, y un service worker de MV3
 * se duerme a los ~30 s sin eventos: al despertar la variable valia null,
 * y como la rehidratacion solo corria al instalar y al arrancar Chrome,
 * `findMusicTab` caia a `tabs[0]`. Con la musica en pausa (ninguna
 * pestaña `audible`), Alt+Shift+K un minuto despues le daba al play de
 * la PRIMERA pestaña soportada, que desde que www.youtube.com es sitio
 * soportado puede ser un tutorial cualquiera.
 *
 * storage.session es justo la vida que hace falta: sobrevive al sueño del
 * service worker y muere al reiniciar el navegador o actualizar la
 * extension, que es cuando los ids de pestaña dejan de significar nada.
 * NO va en STORAGE_KEYS a proposito: aquellas son de storage.local, las
 * vigila Settings y las clasifica el censo de settings-recargas.test.js.
 *
 * La variable se queda como cache: `pestanaRecordada` solo va a storage
 * la primera vez de cada despertar.
 */
const CLAVE_PESTANA = "pestanaMusical";
let musicTabId = null;
let pestanaLeida = false;

async function pestanaRecordada() {
  if (!pestanaLeida) {
    try {
      const guardado = await chrome.storage.session.get(CLAVE_PESTANA);
      // Si alguien la fijo mientras se esperaba a storage, gana ese: es
      // mas nuevo que lo guardado.
      if (!pestanaLeida && typeof guardado[CLAVE_PESTANA] === "number") {
        musicTabId = guardado[CLAVE_PESTANA];
      }
    } catch (err) {
      // Sin storage.session (navegador viejo): queda la variable, como antes.
    }
    pestanaLeida = true;
  }
  return musicTabId;
}

function recordarPestana(id) {
  musicTabId = typeof id === "number" ? id : null;
  pestanaLeida = true;
  try {
    const escritura =
      musicTabId === null
        ? chrome.storage.session.remove(CLAVE_PESTANA)
        : chrome.storage.session.set({ [CLAVE_PESTANA]: musicTabId });
    Promise.resolve(escritura).catch(() => {});
  } catch (err) {
    // Igual que arriba: la variable sigue valiendo mientras el SW este despierto.
  }
}

async function rehydrateMusicTab() {
  const tabs = await chrome.tabs.query({ url: PATRONES_DE_SITIO });
  if (tabs.length === 0) {
    recordarPestana(null);
    return;
  }
  const audible = tabs.find((t) => t.audible);
  recordarPestana((audible || tabs[0]).id);
}

async function findMusicTab() {
  const tabs = await chrome.tabs.query({ url: PATRONES_DE_SITIO });
  if (tabs.length === 0) return null;
  const recordada = await pestanaRecordada();
  const audible = tabs.find((t) => t.audible);
  const chosen = audible || tabs.find((t) => t.id === recordada) || tabs[0];
  recordarPestana(chosen.id);
  return chosen;
}

/*
 * REINYECCION: dar content script a las pestañas que ya estaban abiertas.
 *
 * Chrome solo inyecta los content_scripts del manifiesto en las paginas que
 * se cargan DESPUES de instalar o actualizar. Las que ya estaban abiertas se
 * quedan sin nada (instalacion) o con un script huerfano (actualizacion), y
 * el huerfano no sirve para abrir la ventana: `openPip` necesita la
 * extension viva para cargar pip.html y se niega (pip.js, openPip). O sea
 * que cada version publicada dejaba la extension MUERTA en todas las
 * pestañas abiertas hasta un F5 que nadie sabia que tenia que dar: ni el
 * icono, ni los atajos, ni el boton PiP de la pagina.
 *
 * La lista de archivos se lee del propio manifiesto: una copia aqui seria
 * una segunda lista que no se entera cuando se añade un modulo.
 *
 * Solo se inyecta donde NO hay un script vivo en el mundo aislado actual y
 * la pagina ya termino de cargar. La pagina que esta cargando la cubre el
 * propio Chrome con el manifiesto al llegar a document_idle; inyectarle
 * tambien aqui daria dos copias de todo en el mismo mundo. Las pestañas
 * descartadas no tienen documento que inyectar.
 *
 * Lo que convive con el huerfano (la pestaña no se recarga): su observer
 * sigue corriendo y su grafo de audio, si llego a ecualizar, sigue sonando
 * con el ultimo ajuste; el mundo nuevo no puede volver a cruzar ese
 * <video> (createMediaElementSource solo se hace una vez por elemento) y su
 * ecualizador se queda sin efecto hasta el F5. Es la unica perdida, y solo
 * para quien tenia el ecualizador encendido al actualizar. El boton PiP de
 * la pagina lo adopta el mundo nuevo (pip.js, ensureLauncherButton).
 */
const ARCHIVOS_DE_CONTENIDO = (() => {
  try {
    const scripts = chrome.runtime.getManifest().content_scripts;
    return (scripts && scripts[0] && scripts[0].js) || [];
  } catch (err) {
    return [];
  }
})();

async function tieneScriptVivo(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: () => Boolean(self.YTMPip && self.YTMPip.PipView)
  });
  return Boolean(result);
}

/** Devuelve "inyectada", "viva", "omitida" o "error". Nunca lanza. */
async function inyectarSiFalta(tab) {
  if (!tab || typeof tab.id !== "number") return "omitida";
  if (tab.discarded || tab.status !== "complete") return "omitida";
  if (ARCHIVOS_DE_CONTENIDO.length === 0) return "error";
  try {
    if (await tieneScriptVivo(tab.id)) return "viva";
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      files: ARCHIVOS_DE_CONTENIDO
    });
    return "inyectada";
  } catch (err) {
    // Una pagina de error, una pestaña que se cerro a mitad: no hay nada
    // que hacer y no es un fallo nuestro.
    console.info("[YTMPip] No se pudo dar content script a la pestaña", tab.id, err);
    return "error";
  }
}

async function inyectarEnPestanasAbiertas() {
  try {
    const tabs = await chrome.tabs.query({ url: PATRONES_DE_SITIO });
    return await Promise.all(tabs.map(inyectarSiFalta));
  } catch (err) {
    console.info("[YTMPip] No se pudieron repasar las pestañas abiertas", err);
    return [];
  }
}

/*
 * Mandar un mensaje a la pestaña, y si nadie contesta, darle content script
 * y probar UNA vez mas.
 *
 * Es la red para lo que `inyectarEnPestanasAbiertas` no alcanzo: la pestaña
 * que estaba descartada o cargando al actualizar, o un fallo puntual. El
 * error de "nadie al otro lado" (Receiving end does not exist) es justo el
 * sintoma de una pestaña sin script vivo. Si la pestaña SI tenia script
 * (`inyectarSiFalta` dice "viva"), el fallo era otro y se devuelve tal cual.
 */
async function enviarALaPestana(tab, mensaje) {
  try {
    return await chrome.tabs.sendMessage(tab.id, mensaje);
  } catch (err) {
    if ((await inyectarSiFalta(tab)) !== "inyectada") throw err;
    return chrome.tabs.sendMessage(tab.id, mensaje);
  }
}

/*
 * EL ESTADO EN EL ICONO DE LA BARRA (tanda AC).
 *
 * Sobre el icono de la extension, una etiqueta corta: ▶ si suena, ❚❚ si esta
 * en pausa, o los minutos que le quedan al temporizador de apagado, que
 * mandan sobre lo demas (son lo unico que caduca). Sin musica, nada.
 *
 * La pinta el service worker porque es quien ya recibe el estado de la
 * pestaña recordada (tanda T): se pinta con el MISMO estado que se guarda,
 * asi que icono y menu no pueden contar dos cosas distintas. No pide
 * permisos: setBadgeText viene con el icono.
 *
 * El color es el acento cuando suena y gris en pausa. El rojo se toma de
 * COLOR_SUGGESTED, que ya es una de las seis copias del acento que vigila la
 * prueba de la tanda N: escribirlo aqui a mano seria una septima copia fuera
 * del censo.
 */
function textoDelIcono(estado) {
  if (!estado || !estado.connected) return "";
  const temporizador = estado.sleepTimer;
  if (temporizador && temporizador.remainingMs > 0) {
    return Math.ceil(temporizador.remainingMs / 60000) + "′";
  }
  return estado.playing ? "▶" : "❚❚";
}

function colorDelIcono(estado) {
  return estado && estado.playing ? SPECTRUM_LIMITS.COLOR_SUGGESTED : "#5f6368";
}

// null = aun sin leer en este despertar; se lee una vez y lo mantiene al
// dia el oyente de storage de abajo.
let iconoPermitido = null;

async function iconoEncendido() {
  if (iconoPermitido === null) {
    try {
      const guardado = await chrome.storage.local.get(STORAGE_KEYS.BADGE_PREFERENCE);
      iconoPermitido = guardado[STORAGE_KEYS.BADGE_PREFERENCE] !== "hidden";
    } catch (err) {
      iconoPermitido = true;
    }
  }
  return iconoPermitido;
}

async function pintarIcono(estado) {
  const texto = (await iconoEncendido()) ? textoDelIcono(estado) : "";
  try {
    await chrome.action.setBadgeText({ text: texto });
    if (texto) await chrome.action.setBadgeBackgroundColor({ color: colorDelIcono(estado) });
  } catch (err) {
    // Sin icono que pintar (navegador sin la API): no es un fallo de nadie.
  }
}

/*
 * Apagar o encender la etiqueta en Preferencias se ve al momento, con el
 * ultimo estado guardado, sin esperar a que cambie la cancion.
 */
try {
  chrome.storage.onChanged.addListener((cambios, zona) => {
    if (zona !== "local" || !cambios[STORAGE_KEYS.BADGE_PREFERENCE]) return;
    iconoPermitido = cambios[STORAGE_KEYS.BADGE_PREFERENCE].newValue !== "hidden";
    chrome.storage.local
      .get(STORAGE_KEYS.LAST_KNOWN_STATE)
      .then((guardado) => pintarIcono(guardado[STORAGE_KEYS.LAST_KNOWN_STATE]))
      .catch(() => {});
  });
} catch (err) {
  // Sin storage.onChanged: la preferencia se aplicara en el proximo estado.
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SEEK_SECONDS]: DEFAULT_SETTINGS.seekSeconds,
      [STORAGE_KEYS.THEME]: DEFAULT_SETTINGS.theme,
      [STORAGE_KEYS.PIP_SIZE]: DEFAULT_SETTINGS.pipSize,
      [STORAGE_KEYS.DEFAULT_SECTION]: DEFAULT_SETTINGS.defaultSection,
      [STORAGE_KEYS.LYRICS_PREFERENCE]: DEFAULT_SETTINGS.lyricsPreference,
      [STORAGE_KEYS.SELECTOR_SCHEMA_VERSION]: self.YTMPip.CONSTANTS.SELECTOR_SCHEMA_VERSION
    });
  }
  // Primero el content script y despues la pestaña: rehidratar no lo
  // necesita, pero asi la pestaña recordada ya tiene a quien hablarle.
  if (details.reason === "install" || details.reason === "update") {
    await inyectarEnPestanasAbiertas();
  }
  await rehydrateMusicTab();
});

chrome.runtime.onStartup.addListener(rehydrateMusicTab);

/*
 * Cerrar la pestaña recordada deja constancia de que ya no hay musica. La
 * comparacion es contra la RECORDADA y no contra la variable: cerrar la
 * pestaña despierta al service worker, y recien despierto la variable vale
 * null — la comparacion fallaba justo cuando mas falta hacia, y el menu de
 * respaldo seguia pintando «conectado» con la cancion de una pestaña que ya
 * no existia.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId !== (await pestanaRecordada())) return;
  recordarPestana(null);
  chrome.storage.local.set({
    [STORAGE_KEYS.LAST_KNOWN_STATE]: { connected: false }
  });
  // Sin pestaña no hay nada que contar en el icono.
  pintarIcono(null);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url || esUrlSoportada(changeInfo.url)) return;
  if (tabId !== (await pestanaRecordada())) return;
  recordarPestana(null);
});

/*
 * Intenta abrir la ventana desde la pestaña y devuelve QUE paso, no "lo he
 * intentado".
 *
 * La version anterior llamaba a `open()` y devolvia "opened" sin esperar.
 * Como `open()` es async, dos cosas iban mal a la vez: el service worker
 * creia siempre que la ventana se habia abierto (la rama de aviso de
 * `chrome.action.onClicked` no podia saltar nunca), y el rechazo se
 * quedaba sin nadie que lo atendiera. Eso es lo que el usuario veia en
 * chrome://extensions como "Uncaught (in promise) NotAllowedError", con
 * una traza que señalaba una linea de pip.js que no tenia nada que ver:
 * un rechazo sin dueño se cuelga del fotograma que pille.
 *
 * El `.then(ok, err)` se pone DENTRO de la pagina a proposito. Asi el
 * rechazo queda atendido alli aunque executeScript no esperase la promesa
 * devuelta; que la espere solo sirve para enterarse del motivo.
 */
async function openPipOnTab(tab) {
  // world: "ISOLATED" es el mismo mundo aislado donde corren los
  // content_scripts declarados en el manifest, asi que self.YTMPip.PipView
  // ya existe ahi. Se llama directamente (en vez de un evento sintetico)
  // para minimizar cualquier perdida de la activacion de usuario que
  // documentPictureInPicture.requestWindow() necesita.
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "ISOLATED",
    func: () => {
      if (!self.YTMPip || !self.YTMPip.PipView) {
        window.dispatchEvent(new Event("ytmpip:open-pip"));
        return "event-fallback";
      }
      return self.YTMPip.PipView.open().then(
        () => "opened",
        (err) => (err && err.name) || "error"
      );
    }
  });
  return result;
}

/*
 * Lo unico util que queda cuando el icono no puede abrir la ventana:
 * enseñar cual es el boton que si funciona.
 */
async function destacarLanzadorEnPestana(tabId) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: () => {
      const vista = self.YTMPip && self.YTMPip.PipView;
      return Boolean(vista && vista.destacarLanzador && vista.destacarLanzador());
    }
  });
  return Boolean(result);
}

/*
 * "Volver a YouTube Music": el content script no puede enfocar su propia
 * pestaña, solo el service worker. Se prioriza la pestaña que envio el
 * mensaje; si ya no existe (o el mensaje vino de una pagina de extension,
 * donde sender.tab es undefined) se busca la pestaña musical.
 */
async function focusSourceTab(senderTabId) {
  const candidates = [senderTabId, await pestanaRecordada()];
  for (const id of candidates) {
    if (typeof id !== "number") continue;
    try {
      const tab = await chrome.tabs.get(id);
      await chrome.tabs.update(id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
      recordarPestana(id);
      return { ok: true, tabId: id };
    } catch (err) {
      // Pestaña cerrada o inaccesible: se prueba el siguiente candidato.
    }
  }

  const found = await findMusicTab();
  if (!found) return { ok: false, reason: "not_found" };
  await chrome.tabs.update(found.id, { active: true });
  await chrome.windows.update(found.windowId, { focused: true, drawAttention: true });
  return { ok: true, tabId: found.id };
}

async function openFallbackWindow() {
  const { pipSize } = await chrome.storage.local.get(STORAGE_KEYS.PIP_SIZE);
  const dims = pipSize === "expanded" ? PIP_DIMENSIONS.EXPANDED : PIP_DIMENSIONS.COMPACT;
  await chrome.windows.create({
    url: chrome.runtime.getURL("src/popup/popup.html"),
    type: "popup",
    width: dims.width,
    height: dims.height
  });
}

/*
 * Sin default_popup en el manifest, este listener SI se dispara con el clic
 * real del usuario en el icono, y por eso se actua sobre la MISMA pestaña
 * donde ocurrio el clic.
 *
 * Lo que aqui se dio por supuesto durante mucho tiempo, y era FALSO: que esa
 * activacion de usuario llegara a la pagina. No llega. El clic en el icono
 * ocurre en el navegador, y `chrome.scripting.executeScript` no le da
 * activacion transitoria al documento de la pestaña, asi que
 * documentPictureInPicture.requestWindow() falla con NotAllowedError. El
 * comentario del boton inyectado en pip.js decia justo esto desde el
 * principio; los dos comentarios se contradecian y el que estaba aqui era el
 * equivocado. Lo demostro el error del usuario, no una lectura del codigo.
 *
 * Se sigue intentando porque no cuesta nada y hay navegadores que si la
 * propagan; lo que cambia es que ahora, cuando falla, el icono hace algo
 * util en vez de nada.
 */
async function abrirPipDesdeElNavegador(clickedTab, origen) {
  try {
    let target = clickedTab;
    if (!target || !target.url || !esUrlSoportada(target.url)) {
      target = await findMusicTab();
    }
    if (!target) {
      // No hay pestaña de ningun sitio soportado: se abre la del sitio DE
      // MUSICA (no youtube.com: quien pulsa el icono de Music PiP quiere
      // musica) para que el usuario reproduzca algo antes de reintentar.
      await chrome.tabs.create({ url: URL_POR_DEFECTO });
      return "pestana-creada";
    }
    return await intentarAbrir(target, origen);
  } catch (err) {
    console.error(`[YTMPip] Fallo al abrir el PiP (${origen})`, err);
    return "error";
  }
}

/*
 * El intento de abrir sobre una pestaña YA elegida, con su plan B, y
 * devolviendo QUE paso: "opened", "destacado" (se hizo parpadear el boton
 * PiP de la pagina), "sin-lanzador" o el motivo del fallo.
 *
 * Existe aparte porque el menu (OPEN_PIP_REQUEST) tambien lo necesita y
 * hasta la 1.0.1 no lo usaba: llamaba a `openPipOnTab` a pelo, tiraba el
 * resultado y contestaba `ok: true` siempre. El clic en una pagina de la
 * extension tampoco le da activacion a la pestaña, asi que lo normal era
 * un NotAllowedError que el menu recibia como exito, sin plan B.
 *
 * "event-fallback" es la pestaña sin script vivo en este mundo aislado
 * (abierta antes de instalar, o huerfana de una version anterior que la
 * reinyeccion no alcanzo): se le da script y se reintenta una vez.
 */
async function intentarAbrir(target, origen) {
  let result = await openPipOnTab(target);
  if (result === "event-fallback" && (await inyectarSiFalta(target)) === "inyectada") {
    result = await openPipOnTab(target);
  }
  if (result === "opened") return "opened";

  if (result === "NotAllowedError") {
    // No es un fallo que se pueda reintentar: la API exige un gesto en la
    // propia pagina. Se destaca el boton que si lo es.
    const destacado = await destacarLanzadorEnPestana(target.id);
    console.info(
      destacado
        ? `[YTMPip] ${origen} no puede dar la activacion de usuario; se ha destacado el boton PiP de la pagina.`
        : `[YTMPip] ${origen} no puede dar la activacion de usuario y tampoco hay boton PiP en la pagina; recarga la pestaña (F5).`
    );
    return destacado ? "destacado" : "sin-lanzador";
  }

  console.warn("[YTMPip] No se pudo abrir el PiP desde la pestaña", result);
  return result || "error";
}

chrome.action.onClicked.addListener((clickedTab) => abrirPipDesdeElNavegador(clickedTab, "El icono"));

/*
 * Atajos de teclado del NAVEGADOR (chrome://extensions/shortcuts), no los de
 * la ventana flotante: funcionan con cualquier pestaña delante y, si el
 * usuario cambia el ambito del atajo a "Global", hasta con Chrome de fondo.
 *
 * El de abrir la ventana comparte camino con el icono a proposito, porque
 * comparte su limitacion: la activacion de usuario NO viaja del navegador a
 * la pagina (Fase 0, verificado en Chrome real), asi que el atajo tampoco
 * puede garantizar la apertura y su plan B es el mismo, destacar el boton
 * de la pagina. Dos textos distintos aqui serian dos sitios que mantener
 * de acuerdo sobre un solo hecho.
 *
 * Los de transporte viajan como cualquier comando del popup: al content
 * script, que es quien tiene el <video>. Reproducir/pausar va como
 * TOGGLE_PLAY y la decision se toma alli (ver el comentario del tipo en
 * messages.js: la cache de estado del service worker puede mentir).
 *
 * Sin pestaña musical no se hace NADA, ni siquiera abrirla: quien pulsa
 * "siguiente" sin YouTube Music abierto no quiere una pestaña nueva, y un
 * atajo que a veces cambia de cancion y a veces abre pestañas es peor que
 * uno que a veces no hace nada.
 */
const COMANDOS_DE_ATAJO = {
  "reproducir-pausar": COMMAND_TYPES.TOGGLE_PLAY,
  "cancion-siguiente": COMMAND_TYPES.NEXT_TRACK,
  "cancion-anterior": COMMAND_TYPES.PREVIOUS_TRACK
};

chrome.commands.onCommand.addListener(async (atajo, tab) => {
  if (atajo === "abrir-ventana") {
    abrirPipDesdeElNavegador(tab, "El atajo");
    return;
  }

  const tipo = COMANDOS_DE_ATAJO[atajo];
  if (!tipo) return;

  try {
    const musical = await findMusicTab();
    if (!musical) {
      console.info(`[YTMPip] Atajo "${atajo}" sin pestaña de YouTube Music: no se hace nada.`);
      return;
    }
    await enviarALaPestana(musical, createMessage(MESSAGE_TYPES.COMMAND, { command: createCommand(tipo) }));
  } catch (err) {
    console.warn(`[YTMPip] El atajo "${atajo}" no llego a la pestaña musical`, err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    /*
     * QUIEN ES LA PESTAÑA MUSICAL: la que SUENA, no la que carga.
     *
     * Hasta la 1.0.1, CONTENT_SCRIPT_READY se quedaba el puesto sin
     * preguntar: abrir cualquier pagina de youtube.com bastaba para que
     * los atajos dejaran de ir a la pestaña de musica. Ahora cargar solo
     * da el puesto si esta vacante, y lo que lo gana es empezar a sonar
     * (STATE_UPDATE con `playing`). La recordada es, asi, la ultima que
     * sono, que es a quien se refiere un «pausa» o un «siguiente».
     */
    case MESSAGE_TYPES.CONTENT_SCRIPT_READY: {
      const id = sender.tab && sender.tab.id;
      pestanaRecordada()
        .then((recordada) => {
          if (typeof id === "number" && recordada === null) recordarPestana(id);
        })
        .catch(() => {})
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    /*
     * Y el ultimo estado conocido solo lo escribe la pestaña recordada. Antes
     * lo escribia cualquiera: una pestaña de youtube.com en la portada pisaba
     * con su «sin reproduccion» la cancion que sonaba en la de Spotify, y el
     * menu de respaldo pintaba lo que dijera la ultima en hablar.
     */
    case MESSAGE_TYPES.STATE_UPDATE: {
      const id = sender.tab && sender.tab.id;
      pestanaRecordada()
        .then((recordada) => {
          if (typeof id !== "number") return;
          const suena = Boolean(message.state && message.state.playing);
          if (id !== recordada) {
            if (!suena && recordada !== null) return;
            recordarPestana(id);
          }
          // El icono se pinta con el MISMO estado que se guarda (tanda AC).
          pintarIcono(message.state);
          return chrome.storage.local.set({ [STORAGE_KEYS.LAST_KNOWN_STATE]: message.state });
        })
        .catch(() => {})
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    case MESSAGE_TYPES.TAB_DISCONNECTED: {
      const id = sender.tab && sender.tab.id;
      pestanaRecordada()
        .then((recordada) => {
          if (typeof id === "number" && id === recordada) recordarPestana(null);
        })
        .catch(() => {})
        .then(() => sendResponse({ ok: true }));
      return true;
    }

    case MESSAGE_TYPES.FIND_MUSIC_TAB: {
      findMusicTab().then((tab) => sendResponse({ found: !!tab, tabId: tab ? tab.id : null }));
      return true;
    }

    case MESSAGE_TYPES.OPEN_PIP_REQUEST: {
      findMusicTab()
        .then((tab) => {
          if (!tab) {
            sendResponse({ ok: false, reason: "not_found" });
            return;
          }
          // `ok` dice si la ventana se abrio, no si se intento; `result`
          // dice que paso si no (ver intentarAbrir).
          return intentarAbrir(tab, "El menu").then((result) =>
            sendResponse({ ok: result === "opened", result, tabId: tab.id })
          );
        })
        .catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }

    case MESSAGE_TYPES.OPEN_FALLBACK_WINDOW: {
      // Sin el catch, un fallo de windows.create dejaba al emisor esperando
      // una respuesta que no llegaba nunca ("message port closed").
      openFallbackWindow()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }

    case MESSAGE_TYPES.COMMAND: {
      if (message.command && message.command.type === COMMAND_TYPES.FOCUS_SOURCE_TAB) {
        focusSourceTab(sender.tab && sender.tab.id)
          .then((result) => sendResponse(result))
          .catch((err) => sendResponse({ ok: false, reason: String(err) }));
        return true;
      }

      // Comandos originados en una pagina de extension (popup o ventana
      // de respaldo) que no tiene acceso directo al PlayerController: se
      // reenvian al content script de la pestaña musical.
      findMusicTab()
        .then((tab) => {
          if (!tab) {
            sendResponse({ ok: false, reason: "not_found" });
            return;
          }
          return enviarALaPestana(tab, message).then((response) => sendResponse(response || { ok: true }));
        })
        .catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }

    case MESSAGE_TYPES.REQUEST_CURRENT_STATE: {
      findMusicTab()
        .then((tab) => {
          if (!tab) {
            return chrome.storage.local
              .get(STORAGE_KEYS.LAST_KNOWN_STATE)
              .then((res) => sendResponse({ state: res[STORAGE_KEYS.LAST_KNOWN_STATE] || { connected: false } }));
          }
          return enviarALaPestana(tab, message).then((response) => sendResponse(response));
        })
        .catch((err) => sendResponse({ state: { connected: false }, error: String(err) }));
      return true;
    }

    default:
      return false;
  }
});
