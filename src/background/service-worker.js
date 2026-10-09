/*
 * Service worker (seccion 3.3). Responsabilidades:
 * - Localizar la pestaña activa de YouTube Music.
 * - Coordinar la apertura del PiP reenviando la activacion de usuario
 *   del clic en el popup hacia el content script de esa pestaña.
 * - Gestionar instalacion/actualizacion y preferencias por defecto.
 * - Manejar la perdida o cierre de la pestaña musical.
 */
importScripts("../shared/constants.js", "../shared/messages.js", "../shared/historial.js");

const { MESSAGE_TYPES, COMMAND_TYPES, createMessage, createCommand } = self.YTMPip;
const {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  PIP_DIMENSIONS,
  SITIOS_SOPORTADOS,
  SITIOS_OPCIONALES,
  URL_POR_DEFECTO,
  SPECTRUM_LIMITS
} = self.YTMPip.CONSTANTS;

/*
 * Desde la tanda multi-sitio, los patrones y prefijos salen de la lista de
 * constants.js: aqui habia CUATRO copias literales de music.youtube.com y
 * abrirse a YouTube normal las habria dejado desacordadas en silencio.
 * chrome.tabs.query admite un array de patrones tal cual.
 */
const PATRONES_DE_SITIO = SITIOS_SOPORTADOS.map((s) => s.patron);

/*
 * Los opcionales cuentan como «de musica» por la URL (tanda AV): si el
 * usuario no dio el permiso no hay script en esa pestaña, y los caminos que
 * la usan ya saben contestar «sin script» sin romperse. Lo que SI depende
 * del permiso es buscar pestañas (patronesActivos): una pestaña sin permiso
 * no puede ser la musical.
 */
function esUrlSoportada(url) {
  return !!url && SITIOS_SOPORTADOS.concat(SITIOS_OPCIONALES || []).some((s) => url.startsWith(s.prefijo));
}

async function sitiosOpcionalesConcedidos() {
  if (!chrome.permissions || !chrome.permissions.contains) return [];
  const concedidos = [];
  for (const sitio of SITIOS_OPCIONALES || []) {
    try {
      if (await chrome.permissions.contains({ origins: [sitio.patron] })) concedidos.push(sitio);
    } catch (err) {
      // Sin respuesta: como si no estuviera concedido.
    }
  }
  return concedidos;
}

async function patronesActivos() {
  return PATRONES_DE_SITIO.concat((await sitiosOpcionalesConcedidos()).map((s) => s.patron));
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
  const tabs = await chrome.tabs.query({ url: await patronesActivos() });
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

/*
 * EL CONTENT SCRIPT DE LOS SITIOS OPCIONALES (tanda AV). No puede ir en el
 * manifiesto (eso pediria el permiso a todos), asi que se registra en
 * marcha cuando el permiso esta y se quita cuando no: los MISMOS archivos que
 * el bloque fijo del manifiesto, para que no haya dos listas que mantener.
 * Se repasa al instalar, al arrancar y cada vez que cambian los permisos;
 * persistAcrossSessions hace que el registro sobreviva a cerrar Chrome.
 */
const PREFIJO_DE_REGISTRO = "sitio-";

async function sincronizarSitiosOpcionales() {
  if (!chrome.permissions || !chrome.scripting || !chrome.scripting.registerContentScripts) return;
  for (const sitio of SITIOS_OPCIONALES || []) {
    const id = PREFIJO_DE_REGISTRO + sitio.id;
    try {
      const concedido = await chrome.permissions.contains({ origins: [sitio.patron] });
      const registrados = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
      if (concedido && registrados.length === 0 && ARCHIVOS_DE_CONTENIDO.length) {
        await chrome.scripting.registerContentScripts([
          { id, matches: [sitio.patron], js: ARCHIVOS_DE_CONTENIDO, runAt: "document_idle", persistAcrossSessions: true }
        ]);
      } else if (!concedido && registrados.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: [id] });
      }
    } catch (err) {
      console.info("[YTMPip] No se pudo poner al dia el sitio opcional", sitio.id, err);
    }
  }
}

try {
  if (chrome.permissions && chrome.permissions.onAdded) {
    // Recien concedido: se registra y se lleva el script a las pestañas que
    // ya estaban abiertas, sin pedir que se recarguen.
    chrome.permissions.onAdded.addListener(() =>
      sincronizarSitiosOpcionales().then(() => inyectarEnPestanasAbiertas())
    );
    chrome.permissions.onRemoved.addListener(() => sincronizarSitiosOpcionales());
  }
} catch (err) {
  // Sin la API de permisos: los sitios opcionales no existen aqui.
}

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
    const tabs = await chrome.tabs.query({ url: await patronesActivos() });
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
  // Con un color de acento propio (tanda AE), la etiqueta lo sigue.
  return estado && estado.playing ? acentoDelIcono || SPECTRUM_LIMITS.COLOR_SUGGESTED : "#5f6368";
}

// El acento propio, o null (el de serie). Lo lee iconoEncendido con la
// preferencia de la etiqueta, y lo pone al dia el mismo oyente de storage.
let acentoDelIcono = null;

function acentoDe(valor) {
  return typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor) ? valor : null;
}

/*
 * LO QUE ESCUCHASTE (tanda AT). Se anota aqui porque es el unico sitio que
 * ve el estado de la pestaña recordada, y solo de esa: dos pestañas sonando
 * no cuentan doble. Las reglas (que es una escucha) estan en
 * shared/historial.js; aqui solo se lee, se decide con Historial.paso y se
 * guarda. Nada si el usuario no lo encendio (apagado de serie).
 *
 * La marca de la cancion en curso vive en storage.session, como la pestaña
 * recordada y por lo mismo: el service worker se duerme entre estados.
 */
const MARCA_DE_ESCUCHA = "escuchaEnCurso";
// null = aun sin leer en este despertar; lo mantiene al dia el oyente de
// storage de abajo, como iconoPermitido.
let historialPermitido = null;

async function historialEncendido() {
  if (historialPermitido === null) {
    try {
      const guardado = await chrome.storage.local.get(STORAGE_KEYS.HISTORY_PREFERENCE);
      historialPermitido = guardado[STORAGE_KEYS.HISTORY_PREFERENCE] === "on";
    } catch (err) {
      historialPermitido = false;
    }
  }
  return historialPermitido;
}

async function anotarEscucha(estado) {
  if (!(await historialEncendido())) return;
  const sesion = await chrome.storage.session.get(MARCA_DE_ESCUCHA);
  const antes = sesion[MARCA_DE_ESCUCHA] || null;
  const { marca, contar } = self.YTMPip.Historial.paso(antes, estado);
  if (JSON.stringify(marca) !== JSON.stringify(antes)) {
    await chrome.storage.session.set({ [MARCA_DE_ESCUCHA]: marca });
  }
  if (!contar) return;
  const guardado = await chrome.storage.local.get(STORAGE_KEYS.LISTENING_HISTORY);
  await chrome.storage.local.set({
    [STORAGE_KEYS.LISTENING_HISTORY]: self.YTMPip.Historial.anotar(
      guardado[STORAGE_KEYS.LISTENING_HISTORY],
      estado,
      Date.now()
    )
  });
}

try {
  chrome.storage.onChanged.addListener((cambios, zona) => {
    if (zona !== "local" || !cambios[STORAGE_KEYS.HISTORY_PREFERENCE]) return;
    historialPermitido = cambios[STORAGE_KEYS.HISTORY_PREFERENCE].newValue === "on";
  });
} catch (err) {
  // Sin storage.onChanged: se leera en el proximo despertar.
}

// null = aun sin leer en este despertar; se lee una vez y lo mantiene al
// dia el oyente de storage de abajo.
let iconoPermitido = null;

async function iconoEncendido() {
  if (iconoPermitido === null) {
    try {
      const guardado = await chrome.storage.local.get([STORAGE_KEYS.BADGE_PREFERENCE, STORAGE_KEYS.ACCENT_COLOR]);
      iconoPermitido = guardado[STORAGE_KEYS.BADGE_PREFERENCE] !== "hidden";
      acentoDelIcono = acentoDe(guardado[STORAGE_KEYS.ACCENT_COLOR]);
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
    if (zona !== "local") return;
    const etiqueta = cambios[STORAGE_KEYS.BADGE_PREFERENCE];
    const acento = cambios[STORAGE_KEYS.ACCENT_COLOR];
    if (!etiqueta && !acento) return;
    if (etiqueta) iconoPermitido = etiqueta.newValue !== "hidden";
    if (acento) acentoDelIcono = acentoDe(acento.newValue);
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
    /*
     * La bienvenida (tanda AR), SOLO al instalar: al actualizar, quien ya
     * la usa no necesita que le expliquen nada, y abrirle una pestaña en
     * cada version seria una molestia. Lo primero que hace quien instala es
     * pulsar el icono, y el icono no puede abrir la ventana: la pagina le
     * enseña el boton PiP de la pagina antes de que se frustre.
     */
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/bienvenida/bienvenida.html") });
    } catch (err) {
      // Sin pestaña de bienvenida la extension funciona igual.
      console.warn("[YTMPip] No se pudo abrir la bienvenida", err);
    }
  }
  // Primero el content script y despues la pestaña: rehidratar no lo
  // necesita, pero asi la pestaña recordada ya tiene a quien hablarle.
  await sincronizarSitiosOpcionales();
  if (details.reason === "install" || details.reason === "update") {
    await inyectarEnPestanasAbiertas();
  }
  await rehydrateMusicTab();
});

chrome.runtime.onStartup.addListener(() => sincronizarSitiosOpcionales().then(rehydrateMusicTab));

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
      /*
       * Sin PipView en este mundo aislado no hay script vivo, y ya esta: se
       * contesta y el service worker le da script (intentarAbrir).
       *
       * Aqui se disparaba un evento "ytmpip:open-pip" por si alguien lo
       * oia. Nadie podia: quien lo escuchaba era pip.js, el mismo que
       * publica PipView, asi que si faltaba uno faltaba el otro. Y el
       * oyente, en cambio, si estaba siempre puesto en la pagina, y los
       * eventos de window cruzan los mundos: cualquier script de la PAGINA
       * podia pedir abrir la ventana. Se quitaron los dos (tanda AI).
       */
      if (!self.YTMPip || !self.YTMPip.PipView) return "sin-script";
      // open() dice que paso (tanda AF): "opened", "respaldo" (sin
      // Document PiP, se abrio la ventana de respaldo) o "sin-extension".
      return self.YTMPip.PipView.open().then(
        (que) => que || "opened",
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
 * UN CLIC EN CUALQUIER SITIO DE LA PAGINA (tanda AZ). Lo que pidio el
 * autor: que «Abrir ventana flotante» del menu la abra, en vez de mandarle a
 * buscar el boton PiP. Abrirla desde el menu no se puede (el clic no ocurre
 * en la pagina y Chrome exige ese gesto, ver abrirPipDesdeElNavegador); lo
 * mas cerca que se puede llegar es esto: se lleva al usuario a la pestaña
 * musical y la pagina entera se vuelve el boton durante unos segundos. El
 * siguiente clic, donde caiga, abre la ventana.
 */
async function esperarClicEnPestana(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === "number") await chrome.windows.update(tab.windowId, { focused: true });
  } catch (err) {
    // Sin poder enfocarla, el aviso se pone igual: estara cuando la mire.
  }
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "ISOLATED",
    func: () => {
      const vista = self.YTMPip && self.YTMPip.PipView;
      return Boolean(vista && vista.esperarClicParaAbrir && vista.esperarClicParaAbrir());
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

/*
 * UNA ventana de respaldo como mucho (tanda AF). En un navegador sin
 * Document PiP, el boton «Abrir ventana flotante» de la propia ventana de
 * respaldo pedia la flotante, la pestaña no podia, y pedia... otra ventana
 * de respaldo: una cada clic. Si ya hay una, se enfoca.
 *
 * getContexts (Chrome 116+) ve las paginas de la propia extension sin
 * permiso "tabs". Sin la API, se abre como siempre.
 */
async function ventanaDeRespaldoAbierta() {
  if (!chrome.runtime.getContexts) return null;
  try {
    const url = chrome.runtime.getURL("src/popup/popup.html");
    const contextos = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [url] });
    return contextos.length && typeof contextos[0].windowId === "number" ? contextos[0].windowId : null;
  } catch (err) {
    return null;
  }
}

async function openFallbackWindow() {
  const abierta = await ventanaDeRespaldoAbierta();
  if (abierta !== null) {
    await chrome.windows.update(abierta, { focused: true });
    return;
  }
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
 * "sin-script" es la pestaña sin script vivo en este mundo aislado
 * (abierta antes de instalar, o huerfana de una version anterior que la
 * reinyeccion no alcanzo): se le da script y se reintenta una vez.
 */
async function intentarAbrir(target, origen) {
  let result = await openPipOnTab(target);
  if (result === "sin-script" && (await inyectarSiFalta(target)) === "inyectada") {
    result = await openPipOnTab(target);
  }
  if (result === "opened") return "opened";
  // Sin Document PiP no hay nada que destacar: la pestaña ya pidio la
  // ventana de respaldo (openFallbackWindow no abre una segunda).
  if (result === "respaldo") return "respaldo";

  if (result === "NotAllowedError") {
    // No es un fallo que se pueda reintentar: la API exige un gesto en la
    // propia pagina. Primero, que el siguiente clic en ella abra la ventana
    // (tanda AZ); si eso no se puede poner, se destaca el boton PiP.
    if (await esperarClicEnPestana(target)) return "esperando-clic";
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

/*
 * EL ICONO ABRE EL MENU (tanda AP, 1.2.1). Aqui habia un
 * chrome.action.onClicked que intentaba abrir la ventana desde el icono;
 * con default_popup en el manifiesto Chrome ya no lo dispara, asi que se
 * quito en vez de dejarlo como codigo muerto. No se pierde nada: la fase 0
 * ya demostro que el clic en el icono no le pasa la activacion a la
 * pestaña, y lo unico que conseguia era hacer parpadear el boton PiP. Eso
 * mismo lo hace ahora el boton «Abrir ventana flotante» del menu
 * (OPEN_PIP_REQUEST -> intentarAbrir), y el atajo Alt+Shift+P sigue
 * pasando por abrirPipDesdeElNavegador.
 */

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
    // Devolviendo el resultado: Chrome lo ignora, y quien dispare el oyente
    // (las pruebas, tanda AP) sabe cuando termino y QUE paso.
    return abrirPipDesdeElNavegador(tab, "El atajo");
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
          return chrome.storage.local
            .set({ [STORAGE_KEYS.LAST_KNOWN_STATE]: message.state })
            .then(() => anotarEscucha(message.state));
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
