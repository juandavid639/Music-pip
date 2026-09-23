/*
 * Pruebas del MANIFIESTO frente a las reglas de la Chrome Web Store.
 *
 * POR QUE EXISTE ESTE ARCHIVO. Las reglas que deciden si un paquete se sube
 * o se rechaza no viven en este proyecto: viven en la documentacion de
 * Google y en un formulario web. Eso las convierte en el peor tipo de regla
 * que hay —una que no esta escrita en ningun sitio que se ejecute— y el
 * modo en que se descubre que se ha incumplido es siempre el mismo: subes
 * el ZIP, esperas, y el dashboard te dice que no.
 *
 * Aqui se traen abajo las que SI se pueden comprobar sin red y sin cuenta:
 *
 *   - que la descripcion quepa en los 132 caracteres que admite la ficha,
 *   - que no se pida ningun permiso que el codigo no use,
 *   - que todo archivo que el manifiesto nombra exista de verdad,
 *   - que todo archivo que el manifiesto nombra caiga DENTRO de la lista
 *     blanca del empaquetador (si no, el ZIP se sube perfecto y la
 *     extension esta rota al instalarla),
 *   - y que la version no se cuente dos veces en dos archivos distintos.
 *
 * LO QUE NO SE PRUEBA AQUI, a proposito: nada que dependa del criterio de
 * un revisor humano. Si un nombre es aceptable o no para Google, eso no lo
 * dice una expresion regular.
 *
 * Fuente de los numeros: la documentacion de Chrome para desarrolladores
 * ("Prepare your extension": la descripcion es "a string of no more than
 * 132 characters"). Si Google cambia el limite, esta prueba miente; por eso
 * el numero esta en una constante con nombre y no repartido por el archivo.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { RAIZ } = require("../helpers/entorno.js");

/** Tope de la ficha de la tienda para `description`. */
const TOPE_DESCRIPCION = 132;

const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, "manifest.json"), "utf8"));
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const empaquetador = fs.readFileSync(path.join(RAIZ, "tools", "empaquetar.ps1"), "utf8");

/*
 * Los catalogos de idioma. Desde que el manifiesto dice
 * "__MSG_extension_descripcion__", la descripcion que lee la tienda no esta
 * en el manifiesto: esta en _locales/<idioma>/messages.json, UNA POR IDIOMA,
 * y la ficha enseña la del idioma del visitante. Las reglas de la tienda
 * (el tope de 132, la frase de "no es de Google") se aplican a lo que se
 * lee, asi que ahora hay que comprobarlas contra CADA catalogo.
 */
const CATALOGOS = {};
for (const idioma of fs.readdirSync(path.join(RAIZ, "_locales"))) {
  CATALOGOS[idioma] = JSON.parse(
    fs.readFileSync(path.join(RAIZ, "_locales", idioma, "messages.json"), "utf8")
  );
}

/** Un texto del manifiesto con sus __MSG_x__ resueltos contra un catalogo. */
function resuelto(texto, idioma) {
  return texto.replace(/__MSG_([A-Za-z0-9_]+)__/g, (todo, clave) => {
    const entrada = CATALOGOS[idioma][clave];
    assert.ok(
      entrada && entrada.message,
      `El manifiesto usa __MSG_${clave}__ y esa clave no esta en _locales/${idioma}/messages.json: ` +
        `Chrome enseñaria un texto vacio.`
    );
    return entrada.message;
  });
}

/*
 * QUE JUSTIFICA CADA PERMISO.
 *
 * La clave es el permiso tal cual aparece en el manifiesto; el valor, la
 * huella que ese permiso deja en el codigo. La prueba mira en las DOS
 * direcciones, que es lo que la hace util:
 *
 *   - un permiso en el manifiesto que no este en esta tabla => se pide algo
 *     que nadie ha justificado (y en la tienda hay que justificarlo por
 *     escrito, uno por uno),
 *   - una entrada de esta tabla cuya huella ya no aparezca en el codigo =>
 *     la justificacion ha caducado y el permiso sobra.
 *
 * `activeTab` estuvo aqui y se quito: no tiene huella posible. No es una
 * API, es un permiso implicito, y todo el acceso a pestañas de este
 * proyecto pasa por chrome.tabs.query({ url: ... }) filtrando por
 * music.youtube.com, que lo cubre el permiso de host. Pedirlo era pedir de
 * mas, y un permiso de mas es una pregunta del revisor.
 *
 * OJO: la busqueda es TEXTUAL. Una mencion en un comentario cuenta como
 * huella. Esto no demuestra que el permiso se use, demuestra que alguien
 * escribio su nombre; sirve para cazar el permiso olvidado, no para
 * auditar el codigo.
 */
const PERMISOS_JUSTIFICADOS = {
  storage: "chrome.storage.",
  scripting: "chrome.scripting."
};

/** Todo el codigo publicable, concatenado, para buscar huellas dentro. */
function codigoDeSrc() {
  const trozos = [];
  (function recorrer(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completa);
      else if (/\.(js|html)$/.test(entrada.name)) trozos.push(fs.readFileSync(completa, "utf8"));
    }
  })(path.join(RAIZ, "src"));
  return trozos.join("\n");
}

/** Todas las rutas de archivo que el manifiesto nombra, en una sola lista. */
function rutasDelManifiesto() {
  const rutas = [manifiesto.background.service_worker, manifiesto.options_page];
  for (const bloque of manifiesto.content_scripts) rutas.push(...bloque.js);
  for (const icono of Object.values(manifiesto.icons)) rutas.push(icono);
  for (const icono of Object.values(manifiesto.action.default_icon)) rutas.push(icono);
  for (const bloque of manifiesto.web_accessible_resources) rutas.push(...bloque.resources);
  return rutas;
}

test("LA DESCRIPCION CABE EN LA FICHA DE LA TIENDA, EN CADA IDIOMA", () => {
  for (const idioma of Object.keys(CATALOGOS)) {
    const descripcion = resuelto(manifiesto.description, idioma);
    assert.ok(
      descripcion.length <= TOPE_DESCRIPCION,
      `La descripcion en «${idioma}» tiene ${descripcion.length} caracteres y la ficha admite ` +
        `${TOPE_DESCRIPCION}. El ZIP se rechaza al subirlo, no al instalarlo.`
    );
  }
});

test("LA DESCRIPCION SIGUE DICIENDO QUE ESTO NO ES DE GOOGLE, EN CADA IDIOMA", () => {
  /*
   * El nombre lleva "YouTube" dentro. La unica defensa escrita que tiene el
   * paquete contra la lectura de "esto lo hace Google" es esta frase, y es
   * justo la clase de frase que desaparece al recortar para que quepa.
   *
   * La frase se busca POR IDIOMA porque cada visitante de la ficha lee la
   * suya: una descripcion inglesa que perdiera el "unofficial" seguiria en
   * verde si solo se mirara la española. Un idioma nuevo sin su expresion
   * aqui hace fallar la prueba a proposito: la defensa hay que escribirla,
   * no heredarla.
   */
  const DESCARGO_POR_IDIOMA = {
    es: /no oficial|sin relaci/i,
    en: /unofficial|not affiliated/i
  };
  for (const idioma of Object.keys(CATALOGOS)) {
    const expresion = DESCARGO_POR_IDIOMA[idioma];
    assert.ok(
      expresion,
      `Hay un catalogo «${idioma}» sin expresion de descargo en esta prueba: escribela.`
    );
    assert.match(resuelto(manifiesto.description, idioma), expresion);
  }
});

test("LA DESCRIPCION NOMBRA LOS TRES SITIOS DONDE FUNCIONA, EN CADA IDIOMA", () => {
  /*
   * La descripcion dijo «YouTube Music» a secas durante meses despues de
   * que la extension funcionara tambien en YouTube y Spotify: la ficha de
   * la tienda habria estrenado esa mentira en su primera linea. Los
   * nombres no se escriben aqui a mano: se leen de los `nombre: "..."`
   * de los adaptadores, que son la lista real de sitios (mismo truco que
   * los chips de Preferencias en la tanda G) — un adaptador nuevo hace
   * fallar esta prueba hasta que la descripcion lo anuncie o alguien
   * decida a proposito que no cabe.
   *
   * LIMITE CONFESADO: «YouTube» esta contenido en «YouTube Music», asi
   * que un recorte que borrara solo «YouTube» pasaria mientras quede
   * «YouTube Music». No hay forma barata de distinguirlos con includes y
   * las marcas no admiten limites de palabra fiables; se vigila lo
   * vigilable.
   */
  const ADAPTADORES = [
    "src/content/youtube-music-adapter.js",
    "src/content/youtube-adapter.js",
    "src/content/spotify-adapter.js"
  ];
  const nombres = ADAPTADORES.map((ruta) => {
    const fuente = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    const nombre = fuente.match(/nombre:\s*"([^"]+)"/);
    assert.ok(nombre, `No se encuentra el nombre declarado en ${ruta}.`);
    return nombre[1];
  });
  for (const idioma of Object.keys(CATALOGOS)) {
    const descripcion = resuelto(manifiesto.description, idioma);
    for (const nombre of nombres) {
      assert.ok(
        descripcion.includes(nombre),
        `La descripcion en «${idioma}» no nombra «${nombre}»: la ficha anunciaria ` +
          `menos de lo que la extension hace.`
      );
    }
  }
});

test("EL NOMBRE DEL MANIFIESTO ES EL QUE LEE EL USUARIO", () => {
  /*
   * El nombre estaba escrito a mano en SEIS sitios: el manifiesto, el
   * titulo del menu, el titulo y el encabezado de Preferencias, y las dos
   * etiquetas del boton que se inyecta en la pagina. Seis copias de una
   * cosa que se cambia entera o no se cambia.
   *
   * El dia del renombrado se vio lo que eso vale: la tienda habria
   * anunciado un nombre y el producto habria enseñado otro por dentro, que
   * es exactamente el detalle que un revisor lee como "esto no es lo que
   * dice ser". No se puede dejar de repetir el nombre —son documentos sin
   * nada compartido— pero si se puede exigir que las copias coincidan.
   *
   * Las etiquetas del boton que se inyecta en la pagina ya no viven en
   * pip.js: con la localizacion se mudaron a los catalogos, que es donde
   * ahora se lee el nombre. Por eso la lista vigila los catalogos (los DOS:
   * la marca no se traduce, asi que un renombrado tiene que pasar por
   * ambos) y no el archivo que los consulta.
   */
  const DONDE_SE_LEE = [
    "src/popup/popup.html",
    "src/options/options.html",
    "_locales/es/messages.json",
    "_locales/en/messages.json"
  ];
  for (const ruta of DONDE_SE_LEE) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    assert.ok(
      texto.includes(manifiesto.name),
      `El manifiesto se llama "${manifiesto.name}" y ese nombre no aparece en ${ruta}. ` +
        `O se ha renombrado la extension sin renombrar el producto, o al reves.`
    );
  }
});

test("NO SE PIDE NINGUN PERMISO QUE EL CODIGO NO USE", () => {
  const codigo = codigoDeSrc();

  for (const permiso of manifiesto.permissions) {
    const huella = PERMISOS_JUSTIFICADOS[permiso];
    assert.ok(
      huella,
      `El manifiesto pide "${permiso}" y nadie lo ha justificado. En la ficha de ` +
        `la tienda hay que explicar cada permiso por escrito: escribe aqui su huella ` +
        `en el codigo, o quitalo del manifiesto.`
    );
    assert.ok(
      codigo.includes(huella),
      `Se pide "${permiso}" pero "${huella}" ya no aparece en src/. O la huella ` +
        `cambio de nombre, o el permiso sobra.`
    );
  }

  for (const permiso of Object.keys(PERMISOS_JUSTIFICADOS)) {
    assert.ok(
      manifiesto.permissions.includes(permiso),
      `Sobra la justificacion de "${permiso}": ya no se pide en el manifiesto.`
    );
  }
});

test("EL DOMINIO AL QUE SE ENTRA ESTA ESCRITO IGUAL EN LOS TRES SITIOS", () => {
  // Una regla repartida en tres listas no es una regla, son tres. Si algun
  // dia esto se abre a music.youtube.com y a youtube.com, el que cambie
  // solo una de las tres se encontrara con un content script que entra
  // donde no tiene permiso de host, que falla en silencio.
  const deHost = manifiesto.host_permissions;
  for (const bloque of manifiesto.content_scripts) {
    assert.deepEqual(bloque.matches, deHost, "content_scripts entra en sitios que no son los del permiso de host.");
  }
  for (const bloque of manifiesto.web_accessible_resources) {
    assert.deepEqual(bloque.matches, deHost, "web_accessible_resources se expone en sitios que no son los del permiso de host.");
  }
});

test("TODO ARCHIVO QUE EL MANIFIESTO NOMBRA EXISTE", () => {
  for (const ruta of rutasDelManifiesto()) {
    if (ruta.endsWith("/*")) {
      // Comodin: basta con que la carpeta exista y tenga algo dentro.
      const carpeta = path.join(RAIZ, ruta.slice(0, -2));
      assert.ok(fs.existsSync(carpeta), `El manifiesto expone "${ruta}" y esa carpeta no existe.`);
      assert.ok(fs.readdirSync(carpeta).length > 0, `El manifiesto expone "${ruta}" y esa carpeta esta vacia.`);
      continue;
    }
    assert.ok(fs.existsSync(path.join(RAIZ, ruta)), `El manifiesto nombra "${ruta}" y ese archivo no existe.`);
  }
});

test("TODO ARCHIVO QUE EL MANIFIESTO NOMBRA VIAJA EN EL PAQUETE", () => {
  /*
   * ESTE ES EL FALLO CARO. El empaquetador usa lista blanca: manifest.json,
   * src y assets. El dia que alguien meta en content_scripts un
   * "vendor/algo.js", el ZIP se construira sin protestar, pesara lo de
   * siempre, se subira bien, pasara la revision... y la extension estara
   * rota en cuanto se instale, porque ese archivo no va dentro.
   *
   * La lista blanca se lee del propio .ps1 en vez de copiarla aqui: si se
   * copiara, esta prueba seguiria en verde despues de cambiarla alli.
   */
  const bloque = empaquetador.match(/\$incluir\s*=\s*@\(([\s\S]*?)\)/);
  assert.ok(bloque, "No se encuentra la lista blanca $incluir en tools/empaquetar.ps1.");
  const raices = [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(raices.length > 0, "La lista blanca del empaquetador esta vacia.");

  for (const ruta of rutasDelManifiesto()) {
    const primera = ruta.split("/")[0];
    assert.ok(
      raices.includes(primera) || raices.includes(ruta),
      `El manifiesto nombra "${ruta}", pero "${primera}" no esta en la lista blanca ` +
        `de tools/empaquetar.ps1 (${raices.join(", ")}). El ZIP saldria sin ese archivo.`
    );
  }
});

test("CADA ATAJO DE TECLADO EXISTE EN LOS DOS LADOS DEL PUENTE", () => {
  /*
   * Los atajos son una regla escrita en dos archivos que no comparten nada:
   * el manifiesto declara los nombres y el service worker los escucha por
   * ese mismo nombre, como texto. Un rename en uno solo no da error en
   * ninguna parte: el atajo aparece en chrome://extensions/shortcuts, el
   * usuario lo pulsa y no pasa NADA. Es el fallo mas mudo de todo el
   * proyecto, porque ni siquiera hay una promesa que rechazar.
   *
   * La extraccion es TEXTUAL, con el mismo alcance que la de permisos: no
   * demuestra que el listener funcione, demuestra que los dos archivos
   * siguen de acuerdo en los nombres.
   */
  assert.ok(manifiesto.commands, "El manifiesto ya no declara atajos de teclado.");
  const declarados = Object.keys(manifiesto.commands);
  assert.ok(declarados.length > 0, "El bloque commands esta vacio.");

  const sw = fs.readFileSync(path.join(RAIZ, manifiesto.background.service_worker), "utf8");

  for (const nombre of declarados) {
    assert.ok(
      sw.includes(`"${nombre}"`),
      `El manifiesto declara el atajo "${nombre}" y el service worker no lo menciona: ` +
        `se pulsa y no pasa nada.`
    );
    assert.ok(
      manifiesto.commands[nombre].description,
      `El atajo "${nombre}" no tiene descripcion: en chrome://extensions/shortcuts ` +
        `apareceria una fila sin texto, y Chrome puede rechazar el manifiesto.`
    );
  }

  // Y la vuelta: todo nombre que el service worker escucha (las claves del
  // mapa de atajos y las comparaciones directas) tiene que estar declarado.
  const escuchados = [
    ...[...sw.matchAll(/"([a-z-]+)":\s*COMMAND_TYPES\./g)].map((m) => m[1]),
    ...[...sw.matchAll(/atajo === "([a-z-]+)"/g)].map((m) => m[1])
  ];
  assert.ok(escuchados.length > 0, "El service worker ya no escucha ningun atajo.");
  for (const nombre of escuchados) {
    assert.ok(
      declarados.includes(nombre),
      `El service worker escucha "${nombre}" y el manifiesto no lo declara: es codigo ` +
        `al que ningun teclado puede llegar.`
    );
  }
});

test("LA VERSION NO SE CUENTA DOS VECES", () => {
  // El ZIP se llama con la version del manifiesto; package.json lleva la
  // suya. Mientras sean dos numeros, uno de los dos se quedara atras.
  assert.match(manifiesto.version, /^\d+(\.\d+){0,3}$/, "Chrome exige de uno a cuatro numeros separados por puntos.");
  assert.equal(
    paquete.version,
    manifiesto.version,
    "package.json y manifest.json dicen versiones distintas: el ZIP se llamara como el manifiesto."
  );
});
