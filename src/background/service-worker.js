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
const { STORAGE_KEYS, DEFAULT_SETTINGS, PIP_DIMENSIONS, SITIOS_SOPORTADOS, URL_POR_DEFECTO } =
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

let musicTabId = null;

async function rehydrateMusicTab() {
  const tabs = await chrome.tabs.query({ url: PATRONES_DE_SITIO });
  if (tabs.length === 0) {
    musicTabId = null;
    return;
  }
  const audible = tabs.find((t) => t.audible);
  musicTabId = (audible || tabs[0]).id;
}

async function findMusicTab() {
  const tabs = await chrome.tabs.query({ url: PATRONES_DE_SITIO });
  if (tabs.length === 0) return null;
  const audible = tabs.find((t) => t.audible);
  const chosen = audible || tabs.find((t) => t.id === musicTabId) || tabs[0];
  musicTabId = chosen.id;
  return chosen;
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
  rehydrateMusicTab();
});

chrome.runtime.onStartup.addListener(rehydrateMusicTab);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === musicTabId) {
    musicTabId = null;
    chrome.storage.local.set({
      [STORAGE_KEYS.LAST_KNOWN_STATE]: { connected: false }
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId !== musicTabId) return;
  if (changeInfo.url && !esUrlSoportada(changeInfo.url)) {
    musicTabId = null;
  }
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
  const candidates = [senderTabId, musicTabId];
  for (const id of candidates) {
    if (typeof id !== "number") continue;
    try {
      const tab = await chrome.tabs.get(id);
      await chrome.tabs.update(id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
      musicTabId = id;
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
      return;
    }
    const result = await openPipOnTab(target);
    if (result === "opened") return;

    if (result === "NotAllowedError") {
      // No es un fallo que se pueda reintentar: la API exige un gesto en la
      // propia pagina. Se destaca el boton que si lo es.
      const destacado = await destacarLanzadorEnPestana(target.id);
      console.info(
        destacado
          ? `[YTMPip] ${origen} no puede dar la activacion de usuario; se ha destacado el boton PiP de la pagina.`
          : `[YTMPip] ${origen} no puede dar la activacion de usuario y tampoco hay boton PiP en la pagina; recarga la pestaña (F5).`
      );
      return;
    }

    console.warn("[YTMPip] No se pudo abrir el PiP desde la pestaña", result);
  } catch (err) {
    console.error(`[YTMPip] Fallo al abrir el PiP (${origen})`, err);
  }
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
    await chrome.tabs.sendMessage(musical.id, createMessage(MESSAGE_TYPES.COMMAND, { command: createCommand(tipo) }));
  } catch (err) {
    console.warn(`[YTMPip] El atajo "${atajo}" no llego a la pestaña musical`, err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case MESSAGE_TYPES.CONTENT_SCRIPT_READY: {
      if (sender.tab) musicTabId = sender.tab.id;
      sendResponse({ ok: true });
      return true;
    }

    case MESSAGE_TYPES.STATE_UPDATE: {
      chrome.storage.local.set({ [STORAGE_KEYS.LAST_KNOWN_STATE]: message.state });
      sendResponse({ ok: true });
      return true;
    }

    case MESSAGE_TYPES.TAB_DISCONNECTED: {
      if (sender.tab && sender.tab.id === musicTabId) musicTabId = null;
      sendResponse({ ok: true });
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
          return openPipOnTab(tab).then(() => sendResponse({ ok: true, tabId: tab.id }));
        })
        .catch((err) => sendResponse({ ok: false, reason: String(err) }));
      return true;
    }

    case MESSAGE_TYPES.OPEN_FALLBACK_WINDOW: {
      openFallbackWindow().then(() => sendResponse({ ok: true }));
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
          return chrome.tabs
            .sendMessage(tab.id, message)
            .then((response) => sendResponse(response || { ok: true }));
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
          return chrome.tabs.sendMessage(tab.id, message).then((response) => sendResponse(response));
        })
        .catch((err) => sendResponse({ state: { connected: false }, error: String(err) }));
      return true;
    }

    default:
      return false;
  }
});
