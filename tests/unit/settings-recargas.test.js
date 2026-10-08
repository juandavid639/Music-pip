/*
 * QUIEN DESPIERTA A LAS PREFERENCIAS: que claves de storage hacen que
 * Settings relea todo y avise a la ventana, y cuales no.
 *
 * De donde sale. Hasta la 1.0.1 la lista de exclusiones de settings.js
 * (CLAVES_QUE_SE_APLICAN) se olvidaba de `lastKnownState`, que la escribe
 * el service worker con cada estado nuevo —y el estado lleva el segundo de
 * reproduccion en la firma—. Resultado: mientras sonaba musica, cada
 * pestaña releia TODAS las preferencias y la ventana volvia a aplicarlas
 * una vez por segundo. Ninguna prueba lo veia porque ninguna preguntaba
 * por esa clave: las que habia (interruptor-ecualizador.test.js) solo
 * cubren las anotaciones que alguien se acordo de excluir.
 *
 * Por eso aqui no se prueba una clave suelta sino EL CENSO ENTERO: cada
 * clave de STORAGE_KEYS tiene que estar clasificada en la tabla de abajo.
 * Una clave nueva sin clasificar tumba la prueba, y quien la añada tiene
 * que decidir por escrito si es preferencia o anotacion. El olvido que
 * costo esta tanda deja de ser posible en silencio.
 *
 * LO QUE NO: cuanto cuesta de verdad una recarga en un navegador. Eso no
 * se mide aqui; se cuenta cuantas veces se lee storage, que es lo que el
 * fallo multiplicaba.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, i18nFalso } = require("../helpers/entorno.js");
const { STORAGE_KEYS } = require("../helpers/constantes.js");

/*
 * true  = preferencia: cambiarla recarga y se aplica en vivo.
 * false = anotacion o dato de otro: cambiarla NO despierta a nadie.
 */
const SE_APLICA = {
  seekSeconds: true,
  theme: true,
  pipSize: true,
  defaultSection: true,
  lyricsPreference: true,
  videoPreference: true,
  canvasPreference: true,
  haloPreference: true,
  haloMode: true,
  haloColor: true,
  spectrumBars: true,
  spectrumFall: true,
  spectrumHeight: true,
  spectrumColor: true,
  spectrumStyle: true,
  coverStyle: true,
  badgePreference: true,
  accentColor: true,
  pipTransparency: true,
  equalizer: true,
  lastKnownState: false, // la de esta tanda: la escribe el SW cada segundo
  selectorSchemaVersion: false, // la escribe el SW al instalar, nada que aplicar
  pipLastSize: false,
  equalizerLast: false,
  equalizerBySong: false,
  // Tanda AS: cambia el nombre que dice el boton del ecualizador de la ventana.
  equalizerCustom: true,
  // Tanda AT: el interruptor es una preferencia (Preferencias lo enseña y se
  // exporta); la lista crece con cada cancion y NO puede despertar a nadie.
  historyPreference: true,
  listeningHistory: false
};

function montar() {
  const { win } = crearEntorno(undefined);
  const oyentes = [];
  let lecturas = 0;

  win.chrome = {
    i18n: i18nFalso({}),
    runtime: {
      id: "id-de-prueba",
      getURL: (p) => `chrome-extension://id-de-prueba/${p}`,
      sendMessage: () => Promise.resolve({ ok: true }),
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get() {
          lecturas++;
          return Promise.resolve({});
        },
        set: () => Promise.resolve()
      },
      onChanged: {
        addListener(fn) {
          oyentes.push(fn);
        }
      }
    }
  };

  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js"
  );

  return {
    avisar: (cambios, area = "local") => oyentes.forEach((fn) => fn(cambios, area)),
    lecturas: () => lecturas,
    asentar: () => new Promise((r) => setTimeout(r, 0))
  };
}

test("EL CENSO: toda clave de storage esta clasificada, y solo las que existen", () => {
  const claves = Object.values(STORAGE_KEYS);
  const sinClasificar = claves.filter((k) => !(k in SE_APLICA));
  assert.deepStrictEqual(
    sinClasificar,
    [],
    "clave nueva sin decidir: ¿es una preferencia que se aplica en vivo o una anotacion?"
  );
  const fantasmas = Object.keys(SE_APLICA).filter((k) => !claves.includes(k));
  assert.deepStrictEqual(fantasmas, [], "la tabla clasifica claves que ya no existen");
});

test("REGRESION 1.0.1: el estado que escribe el service worker NO recarga las preferencias", async () => {
  const v = montar();
  await v.asentar();
  const antes = v.lecturas();

  // Diez segundos de musica: diez estados nuevos.
  for (let s = 0; s < 10; s++) {
    v.avisar({ [STORAGE_KEYS.LAST_KNOWN_STATE]: { newValue: { connected: true, currentTime: s } } });
  }
  await v.asentar();

  assert.strictEqual(v.lecturas(), antes, "cada segundo de musica relee todas las preferencias");
});

test("cada clave hace exactamente lo que dice su clasificacion", async () => {
  for (const clave of Object.values(STORAGE_KEYS)) {
    const v = montar();
    await v.asentar();
    const antes = v.lecturas();

    v.avisar({ [clave]: { newValue: "x" } });
    await v.asentar();

    const esperado = SE_APLICA[clave];
    assert.strictEqual(
      v.lecturas() - antes,
      esperado ? 1 : 0,
      esperado
        ? `"${clave}" es una preferencia y cambiarla no se aplica en vivo`
        : `"${clave}" es una anotacion y cambiarla recarga las preferencias`
    );
  }
});

test("una preferencia que llega junto al estado SI recarga (no se tira el lote entero)", async () => {
  const v = montar();
  await v.asentar();
  const antes = v.lecturas();

  v.avisar({
    [STORAGE_KEYS.LAST_KNOWN_STATE]: { newValue: { connected: true } },
    [STORAGE_KEYS.THEME]: { newValue: "light" }
  });
  await v.asentar();

  assert.strictEqual(v.lecturas(), antes + 1);
});

test("los cambios de otra zona de storage no despiertan a nadie", async () => {
  const v = montar();
  await v.asentar();
  const antes = v.lecturas();

  v.avisar({ [STORAGE_KEYS.THEME]: { newValue: "light" } }, "sync");
  await v.asentar();

  assert.strictEqual(v.lecturas(), antes);
});
