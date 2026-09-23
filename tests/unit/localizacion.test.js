/*
 * LA LOCALIZACIÓN: los catálogos de _locales/, el módulo textos.js y la
 * costura entre ambos y el resto del proyecto.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. La localización es, casi entera, una promesa
 * de coherencia entre archivos que no comparten nada: el HTML lleva el
 * español escrito, el catálogo español lleva EL MISMO texto, el catálogo
 * inglés lleva las mismas claves, el manifest nombra claves por su nombre y
 * las constantes respaldan a dos familias de claves. Ninguna de esas
 * promesas da error al romperse:
 *
 *   - una clave que falte en el catálogo inglés se ve como clave pelada
 *     («pausar») solo para quien usa Chrome en inglés,
 *   - un texto del HTML que se desvíe del catálogo hace que el plan B
 *     enseñe otra cosa que el plan A, y nadie mira el plan B,
 *   - un __MSG_x__ mal escrito en el manifest sale como descripción vacía
 *     en la tienda,
 *   - una traducción que pierda su $1 se come el número sin quejarse.
 *
 * Todas se ven mirando, y solo en el idioma equivocado. Aquí se vuelven
 * ejecutables.
 *
 * LO QUE NO SE PRUEBA AQUÍ, a propósito: la CALIDAD de la traducción. Que
 * «Sleep timer» sea buena traducción de «Temporizador de apagado» no lo
 * decide una prueba; que exista, tenga las mismas claves y los mismos
 * huecos, sí.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");
const { EQUALIZER_PRESETS, EQUALIZER_BANDS, EQUALIZER_PRESET_LABELS } = require("../helpers/constantes.js");

const ES = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales", "es", "messages.json"), "utf8"));
const EN = JSON.parse(fs.readFileSync(path.join(RAIZ, "_locales", "en", "messages.json"), "utf8"));

/* Los tres documentos con texto marcado y los tres scripts que piden textos. */
const HTMLS = ["src/pip/pip.html", "src/popup/popup.html", "src/options/options.html"];
const SCRIPTS = ["src/pip/pip.js", "src/popup/popup.js", "src/options/options.js"];

/*
 * Qué atributo del nodo respalda cada marca. Es la MISMA tabla que la de
 * textos.js, escrita dos veces a propósito: si aquí se leyera la de verdad,
 * borrar una fila allí borraría también al vigilante que debía notarlo.
 */
const MARCAS = [
  ["data-t", (el) => el.textContent],
  ["data-t-title", (el) => el.getAttribute("title")],
  ["data-t-aria", (el) => el.getAttribute("aria-label")],
  ["data-t-alt", (el) => el.getAttribute("alt")]
];

/*
 * El texto en línea se normaliza (espacios seguidos → uno, sin bordes)
 * porque el HTML parte los párrafos largos en varias líneas indentadas y
 * eso es formato del archivo, no texto del usuario: el navegador colapsa
 * los espacios igual. El catálogo, en cambio, se compara TAL CUAL: es un
 * JSON de una línea por texto y un espacio doble ahí sí es un error.
 */
function normalizado(texto) {
  return (texto || "").replace(/\s+/g, " ").trim();
}

/** Todos los nodos marcados de los tres HTML: { archivo, marca, clave, texto }. */
function nodosMarcados() {
  const nodos = [];
  for (const rel of HTMLS) {
    const doc = new JSDOM(fs.readFileSync(path.join(RAIZ, rel), "utf8")).window.document;
    for (const [marca, leer] of MARCAS) {
      for (const el of doc.querySelectorAll("[" + marca + "]")) {
        nodos.push({ archivo: rel, marca, clave: el.getAttribute(marca), texto: normalizado(leer(el)) });
      }
    }
  }
  return nodos;
}

test("LOS DOS CATALOGOS TIENEN LAS MISMAS CLAVES, Y NINGUNA MUDA", () => {
  /*
   * Una clave que esté solo en español es un texto que en inglés aparece
   * como clave pelada; una que esté solo en inglés es una traducción de
   * algo que ya no existe. Y una clave con message vacío es peor que una
   * ausente: getMessage devuelve "" y textos.js lo trata como fallo, así
   * que el catálogo estaría declarando un texto que nunca sirve.
   */
  const deEs = Object.keys(ES);
  const deEn = Object.keys(EN);
  assert.ok(deEs.length > 0, "el catálogo español está vacío");

  const faltanEnIngles = deEs.filter((c) => !(c in EN));
  const sobranEnIngles = deEn.filter((c) => !(c in ES));
  assert.deepEqual(faltanEnIngles, [], "claves sin traducir al inglés");
  assert.deepEqual(sobranEnIngles, [], "claves inglesas que el español no conoce");

  for (const [idioma, catalogo] of [["es", ES], ["en", EN]]) {
    for (const clave of Object.keys(catalogo)) {
      assert.ok(
        catalogo[clave].message && catalogo[clave].message.length > 0,
        `_locales/${idioma}: la clave «${clave}» tiene el message vacío`
      );
    }
  }
});

test("EL ESPAÑOL DEL HTML Y EL DEL CATALOGO SON EL MISMO TEXTO", () => {
  /*
   * El español está escrito DOS veces adrede: en el HTML (lo que se ve si
   * textos.js no llega a correr) y en _locales/es (lo que escribe
   * aplicar()). Es el mismo criterio que los emoji detrás de los SVG, y la
   * misma condición: la redundancia solo vale si una prueba jura que las
   * dos copias dicen lo mismo. Sin esto, corregir una errata en un sitio y
   * no en el otro sería un menú que cambia de texto al cargar el módulo.
   */
  const nodos = nodosMarcados();
  // La premisa, sin la cual el bucle pasaría en verde sobre nada: los tres
  // documentos tienen texto marcado.
  for (const rel of HTMLS) {
    assert.ok(
      nodos.some((n) => n.archivo === rel),
      `${rel} no tiene ni un nodo marcado con data-t*: o se desmarcó el HTML o cambió la marca`
    );
  }

  for (const nodo of nodos) {
    const entrada = ES[nodo.clave];
    assert.ok(
      entrada,
      `${nodo.archivo}: el nodo con ${nodo.marca}="${nodo.clave}" no tiene entrada en _locales/es`
    );
    assert.equal(
      nodo.texto,
      entrada.message,
      `${nodo.archivo} (${nodo.marca}="${nodo.clave}"): el HTML dice «${nodo.texto}» y el ` +
        `catálogo español «${entrada.message}». El plan B y el plan A cuentan cosas distintas.`
    );
  }
});

test("TODA CLAVE USADA EXISTE EN LOS DOS CATALOGOS", () => {
  /*
   * Las claves entran al proyecto por cuatro puertas y esta prueba las
   * recorre todas: las llamadas t("...") de los scripts, las marcas
   * data-t* de los HTML, los __MSG_x__ del manifest y las familias que se
   * CONSTRUYEN («preset_» + clave, «banda_» + id, las tres de
   * ETIQUETA_REPETIR). Las familias son la parte importante: una llamada
   * dinámica no deja su clave escrita en ningún sitio greppeable, así que
   * añadir un preset nuevo sin su entrada de catálogo no lo cazaría nada.
   *
   * La extracción es TEXTUAL, con el mismo alcance que la de permisos del
   * manifiesto: no demuestra que la clave se use bien, demuestra que todo
   * nombre de clave escrito o construible tiene respuesta en los dos
   * idiomas.
   */
  const usadas = new Map(); // clave -> dónde se vio

  for (const rel of SCRIPTS) {
    const codigo = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    for (const m of codigo.matchAll(/\bt\("([a-z0-9_]+)"/g)) usadas.set(m[1], rel);
  }
  for (const nodo of nodosMarcados()) usadas.set(nodo.clave, nodo.archivo);

  const manifiesto = fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8");
  for (const m of manifiesto.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) usadas.set(m[1], "manifest.json");

  for (const preset of Object.keys(EQUALIZER_PRESETS)) usadas.set("preset_" + preset, "EQUALIZER_PRESETS");
  for (const banda of EQUALIZER_BANDS) usadas.set("banda_" + banda.id, "EQUALIZER_BANDS");

  // ETIQUETA_REPETIR vive dentro de pip.js; se extrae el bloque para no
  // copiar aquí sus tres claves, que quedarían atrás al cambiar el mapa.
  const pip = fs.readFileSync(path.join(RAIZ, "src/pip/pip.js"), "utf8");
  const bloque = pip.match(/ETIQUETA_REPETIR = \{([\s\S]*?)\}/);
  assert.ok(bloque, "no se encuentra ETIQUETA_REPETIR en pip.js: si se renombró, renombra aquí");
  const deRepetir = [...bloque[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(deRepetir.length >= 3, "ETIQUETA_REPETIR ya no declara sus claves entre comillas");
  for (const clave of deRepetir) usadas.set(clave, "ETIQUETA_REPETIR");

  /*
   * La premisa de toda extracción textual: que siga extrayendo. Si el
   * proyecto pasara de t("x") a otra forma de llamar, este número caería y
   * la prueba avisaría de que se quedó ciega, en vez de pasar sobre un
   * conjunto vacío.
   */
  assert.ok(usadas.size > 100, `solo se encontraron ${usadas.size} claves usadas: la extracción se quedó ciega`);

  for (const [clave, donde] of usadas) {
    assert.ok(clave in ES, `«${clave}» (vista en ${donde}) no está en _locales/es`);
    assert.ok(clave in EN, `«${clave}» (vista en ${donde}) no está en _locales/en`);
  }
});

test("LOS HUECOS $1/$2 COINCIDEN ENTRE IDIOMAS", () => {
  /*
   * «Adelantar $1 segundos» y «Forward seconds» son la misma clave con
   * distinta suerte: la segunda perdió el número al traducir y no hay
   * error posible, getMessage simplemente no tiene dónde poner el 10. Se
   * comparan como CONJUNTOS y no como listas porque un idioma puede
   * necesitar los huecos en otro orden («$2: $1») y eso es gramática, no
   * error.
   */
  const huecos = (texto) => [...texto.matchAll(/\$\d/g)].map((m) => m[0]).sort().join(" ");
  for (const clave of Object.keys(ES)) {
    if (!(clave in EN)) continue; // ya lo denuncia la prueba de claves
    assert.equal(
      huecos(EN[clave].message),
      huecos(ES[clave].message),
      `«${clave}»: el español usa [${huecos(ES[clave].message) || "nada"}] y el inglés ` +
        `[${huecos(EN[clave].message) || "nada"}]. La traducción perdió o inventó un hueco.`
    );
  }
});

test("EL CATALOGO ESPAÑOL DICE LO MISMO QUE LA CONSTANTE DE RESPALDO", () => {
  /*
   * Presets y bandas tienen DOS fuentes: el catálogo (para poder salir en
   * inglés) y la constante de constants.js (el respaldo cuando el catálogo
   * no contesta). El trato que hace tolerable esa redundancia es el mismo
   * del HTML: en español, las dos fuentes son EL MISMO texto, de modo que
   * caer al respaldo nunca cambia lo que se ve, solo aguanta el tipo. Un
   * preset renombrado en constants.js y no en el catálogo (o al revés)
   * sería un botón que dice una cosa en la ventana y otra en Preferencias.
   */
  for (const preset of Object.keys(EQUALIZER_PRESET_LABELS)) {
    const entrada = ES["preset_" + preset];
    assert.ok(entrada, `el preset «${preset}» no tiene clave preset_${preset} en _locales/es`);
    assert.equal(
      entrada.message,
      EQUALIZER_PRESET_LABELS[preset],
      `preset «${preset}»: el catálogo dice «${entrada.message}» y la constante ` +
        `«${EQUALIZER_PRESET_LABELS[preset]}». El respaldo cambiaría el texto al caer.`
    );
  }
  for (const banda of EQUALIZER_BANDS) {
    const entrada = ES["banda_" + banda.id];
    assert.ok(entrada, `la banda «${banda.id}» no tiene clave banda_${banda.id} en _locales/es`);
    assert.equal(
      entrada.message,
      banda.etiqueta,
      `banda «${banda.id}»: el catálogo dice «${entrada.message}» y la constante «${banda.etiqueta}».`
    );
  }
});

test("_LOCALES VIAJA EN EL PAQUETE Y EL IDIOMA POR DEFECTO EXISTE", () => {
  /*
   * El mismo fallo caro que ya vigila la prueba del manifiesto, en su
   * variante nueva: _locales no lo nombra ninguna ruta del manifest —lo
   * nombra default_locale, por convención—, así que el recorrido de
   * rutasDelManifiesto() no lo cubre. Sin la carpeta dentro del ZIP,
   * Chrome rechaza el paquete entero en la instalación: un manifest con
   * default_locale exige el catálogo de ese idioma.
   *
   * La lista blanca se lee del .ps1 de verdad, no se copia, por lo mismo
   * que allí: una copia seguiría en verde después de cambiar el original.
   */
  const empaquetador = fs.readFileSync(path.join(RAIZ, "tools", "empaquetar.ps1"), "utf8");
  const bloque = empaquetador.match(/\$incluir\s*=\s*@\(([\s\S]*?)\)/);
  assert.ok(bloque, "no se encuentra la lista blanca $incluir en tools/empaquetar.ps1");
  const raices = [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    raices.includes("_locales"),
    `la lista blanca del empaquetador (${raices.join(", ")}) no incluye "_locales": el ZIP ` +
      `saldría sin catálogos y Chrome lo rechaza al instalar.`
  );

  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
  assert.ok(manifiesto.default_locale, "el manifest ya no declara default_locale");
  assert.ok(
    fs.existsSync(path.join(RAIZ, "_locales", manifiesto.default_locale, "messages.json")),
    `default_locale es "${manifiesto.default_locale}" y no existe su messages.json: ` +
      `Chrome rechaza la extensión entera.`
  );
});

/* ---------- El módulo textos.js por dentro ---------- */

/** Una ventana con textos.js cargado; `ajustar` retoca win.chrome antes. */
function conTextos(ajustar) {
  const { win } = crearEntorno();
  if (ajustar) ajustar(win);
  cargar(win, "src/shared/textos.js");
  return win;
}

test("SIN CATALOGO, t() DEVUELVE LA CLAVE PELADA, no un texto vacío", () => {
  /*
   * Es la decisión de diseño del módulo: una clave a la vista («pausar» en
   * un botón) es un fallo que alguien ve y reporta; un botón sin texto es
   * un fallo que se queda. Se prueba sin chrome.i18n, que es como corre
   * textos.js en cualquier contexto donde la API no llegó a existir.
   */
  const win = conTextos((w) => {
    delete w.chrome.i18n;
  });
  assert.equal(win.YTMPip.Textos.t("pausar"), "pausar");
  assert.equal(win.YTMPip.Textos.t("clave_que_no_existe"), "clave_que_no_existe");
});

test("aplicar() ESCRIBE LO QUE RESUELVE Y NO TOCA LO QUE NO", () => {
  /*
   * Las dos mitades del plan B. La primera: un nodo marcado recibe el
   * texto del catálogo en su sitio (contenido o atributo, según la marca).
   * La segunda es la importante: cuando la clave no resuelve, el nodo se
   * queda EXACTAMENTE como estaba, porque lo que tiene dentro es el
   * español escrito del HTML y borrarlo sería convertir un fallo de
   * catálogo en una interfaz muda.
   */
  const win = conTextos();
  const doc = win.document;
  doc.body.innerHTML =
    '<button data-t="pausar">texto del html</button>' +
    '<button data-t-aria="silenciar" aria-label="vieja">🔇</button>' +
    '<p data-t="clave_que_no_existe">Español de reserva</p>';

  win.YTMPip.Textos.aplicar(doc);

  assert.equal(doc.querySelector("[data-t='pausar']").textContent, ES.pausar.message);
  assert.equal(
    doc.querySelector("[data-t-aria]").getAttribute("aria-label"),
    ES.silenciar.message,
    "data-t-aria tiene que escribir el atributo, no el contenido"
  );
  assert.equal(
    doc.querySelector("[data-t='clave_que_no_existe']").textContent,
    "Español de reserva",
    "una clave sin respuesta tiene que dejar el español del HTML en paz"
  );
});

test("LA CACHE ES EL PARACAIDAS DEL CONTEXTO INVALIDADO", () => {
  /*
   * El escenario real: la extensión se recarga con la ventana abierta y
   * chrome.i18n pasa de contestar a REVENTAR. Sin caché, el siguiente
   * repintado iría borrando etiquetas que el usuario ya tenía delante.
   * Aquí se reproduce el ciclo entero: resolver, invalidar, y comprobar
   * que lo resuelto se sigue sirviendo… y que lo NUNCA resuelto cae a la
   * clave, incluida la misma clave con otras sustituciones, porque
   * «Adelantar 10 segundos» y «Adelantar 30 segundos» son respuestas
   * distintas y cachear una no autoriza a inventar la otra.
   */
  const win = conTextos();
  const { t } = win.YTMPip.Textos;

  // Fase 1: el contexto vive y resuelve.
  assert.equal(t("pausar"), ES.pausar.message);
  assert.equal(t("adelantar_segundos", [10]), ES.adelantar_segundos.message.replace("$1", "10"));

  // Fase 2: la extensión se recargó; getMessage ya solo lanza.
  win.chrome.i18n.getMessage = () => {
    throw new Error("Extension context invalidated.");
  };

  assert.equal(t("pausar"), ES.pausar.message, "lo ya resuelto tiene que seguir sirviéndose");
  assert.equal(
    t("adelantar_segundos", [10]),
    ES.adelantar_segundos.message.replace("$1", "10"),
    "la caché guarda clave+sustituciones, y esta pareja ya se resolvió"
  );
  assert.equal(
    t("adelantar_segundos", [30]),
    "adelantar_segundos",
    "otras sustituciones nunca resueltas no salen de la caché: caen a la clave, que se ve"
  );
});
