/*
 * La pagina «Lo que escuchaste» (tanda AT).
 *
 * Lee de storage el interruptor y la lista, resume con Historial.resumen
 * (la regla vive en shared/historial.js, pura) y se repinta cuando storage
 * cambia: si suena musica con la pagina abierta, la escucha nueva aparece
 * sola. Los titulos y artistas vienen de las paginas de musica: se pintan
 * siempre con textContent, nunca como HTML.
 */
(function () {
  const { STORAGE_KEYS } = self.YTMPip.CONSTANTS;
  const Historial = self.YTMPip.Historial;
  const Textos = self.YTMPip.Textos;
  const t = (clave, subs) => (Textos ? Textos.t(clave, subs) : clave);
  const DIA_MS = 24 * 60 * 60 * 1000;

  if (Textos) Textos.aplicar(document);

  const $ = (id) => document.getElementById(id);
  let dias = 7;

  function fila(principal, secundario, cuanto) {
    const li = document.createElement("li");
    const que = document.createElement("span");
    que.className = "que";
    const titulo = document.createElement("span");
    titulo.className = "titulo";
    titulo.textContent = principal;
    que.appendChild(titulo);
    if (secundario) {
      const artista = document.createElement("span");
      artista.className = "artista";
      artista.textContent = secundario;
      que.appendChild(artista);
    }
    const derecha = document.createElement("span");
    derecha.className = "cuanto";
    derecha.textContent = cuanto;
    li.append(que, derecha);
    return li;
  }

  function fecha(ms) {
    try {
      return new Date(ms).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (err) {
      return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function pintar(guardado) {
    const encendido = guardado[STORAGE_KEYS.HISTORY_PREFERENCE] === "on";
    $("apagado").hidden = encendido;
    $("encendido").hidden = !encendido;

    document.querySelectorAll("[data-dias]").forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.dias) === dias));
    });

    const desde = dias ? Date.now() - dias * DIA_MS : 0;
    const r = Historial.resumen(guardado[STORAGE_KEYS.LISTENING_HISTORY], desde);
    $("total").textContent = t("historial_total", [String(r.total)]);
    $("vacio").hidden = r.total > 0;
    $("contenido").hidden = r.total === 0;

    $("canciones").replaceChildren(...r.canciones.map((c) => fila(c.titulo, c.artista, "× " + c.veces)));
    $("artistas").replaceChildren(...r.artistas.map((a) => fila(a.artista, "", "× " + a.veces)));
    $("recientes").replaceChildren(...r.recientes.map((e) => fila(e.titulo, e.artista, fecha(e.cuando))));
  }

  function leer() {
    chrome.storage.local.get([STORAGE_KEYS.HISTORY_PREFERENCE, STORAGE_KEYS.LISTENING_HISTORY], (guardado) =>
      pintar(guardado || {})
    );
  }

  $("encender").addEventListener("click", () =>
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_PREFERENCE]: "on" })
  );
  $("apagar").addEventListener("click", () =>
    chrome.storage.local.set({ [STORAGE_KEYS.HISTORY_PREFERENCE]: "off" })
  );
  $("borrar").addEventListener("click", () => {
    if (!window.confirm(t("historial_confirmar_borrar"))) return;
    chrome.storage.local.set({ [STORAGE_KEYS.LISTENING_HISTORY]: [] });
  });
  document.querySelectorAll("[data-dias]").forEach((b) =>
    b.addEventListener("click", () => {
      dias = Number(b.dataset.dias);
      leer();
    })
  );

  try {
    chrome.storage.onChanged.addListener((cambios, zona) => {
      if (zona !== "local") return;
      if (cambios[STORAGE_KEYS.HISTORY_PREFERENCE] || cambios[STORAGE_KEYS.LISTENING_HISTORY]) leer();
    });
  } catch (err) {
    // Contexto invalidado: la pagina se queda con lo que pinto.
  }

  leer();
})();
