/*
 * EL CABLE DEL ECUALIZADOR, con el content script realmente en marcha.
 *
 * Todo lo demas del ecualizador ya estaba probado y en verde —el nucleo
 * puro (ecualizador.test.js) y el grafo de audio (audio-grafo.test.js)— y
 * sin este archivo el ecualizador no habria sonado NUNCA, porque nadie
 * llamaba a `montar`. Un nucleo perfecto que no esta enchufado a nada da
 * exactamente el mismo resultado que no haberlo escrito.
 *
 * Las tres preguntas que se hacen aqui son las tres formas que tiene el
 * cable de estar suelto, y ninguna da error en la consola:
 *
 *   1. Encender el ecualizador no hace nada hasta cambiar de cancion.
 *   2. Funciona en la cancion en la que se encendio y deja de funcionar en
 *      la siguiente (YouTube Music se fabrica un <video> nuevo al
 *      encadenar; es el mismo fallo que ya se pago tres veces con el
 *      contador y con el espectro).
 *   3. Apagarlo desde opciones no devuelve el sonido a plano.
 *
 * Y una cuarta que no es del cable sino de la puerta, y por eso va la
 * primera: con el ecualizador APAGADO no se puede tocar el audio. Cruzar
 * `createMediaElementSource` no se deshace, asi que hacerlo "por si acaso"
 * en la maquina de alguien que solo queria una ventana flotante es un daño
 * que solo repara recargar la pestaña.
 *
 * Se observa por el AudioContext falso —quien ha cruzado la puerta, quien
 * esta conectado con quien, que ganancias se han escrito— y no por los
 * mensajes, porque el cable del ecualizador no emite ninguno.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoPagina, pulso, conTiempos, documentoFlotante } = require("../helpers/entorno.js");
const { instalarAudioFalso } = require("../helpers/audio-falso.js");

/**
 * Un entorno de pagina con Web Audio de mentira y unas preferencias que se
 * pueden cambiar en caliente.
 *
 * `almacen` se devuelve para poder moverlo: el doble de chrome.storage
 * resuelve `get` con ESE MISMO objeto, asi que mutarlo y volver a llamar a
 * Settings.load() reproduce lo que pasa al guardar en la pagina de
 * opciones. El `onChanged` de verdad no se puede simular —el doble lo
 * ignora—, y esa parte queda dicha aqui en vez de fingida.
 */
function pagina(equalizer) {
  const almacen = equalizer === undefined ? {} : { equalizer };
  let dameCtx;
  const entorno = entornoPagina("controles-completos.html", {
    storage: almacen,
    antesDeCargar: (win) => {
      dameCtx = instalarAudioFalso(win);
    }
  });
  return {
    entorno,
    almacen,
    ctx: () => dameCtx(),
    async guardar(valor) {
      almacen.equalizer = valor;
      await entorno.win.YTMPip.Settings.load();
      await pulso(50);
    }
  };
}

/**
 * Con quien acaba conectada la fuente del elemento que suena.
 *
 * SOLO HAY DOS RESPUESTAS BUENAS, y conviene tenerlas escritas porque la
 * primera version de estas pruebas esperaba una tercera que habria sido un
 * fallo de sonido:
 *
 *   ["gain"]         el audio entra en la cadena de filtros. La fuente
 *                    SUELTA destination al entrar, y tiene que soltarlo:
 *                    conectado a los dos se oiria a la vez la señal
 *                    filtrada y la de origen, o sea el ecualizador a medio
 *                    gas y con un peine de fase encima.
 *   ["destination"]  puenteado. Es lo que significa "apagado" cuando la
 *                    puerta ya se cruzo: no se deshace nada, se rodea.
 *
 * `[]` es la respuesta que deja mudo al usuario.
 */
function salidasDeLaFuente(ctx, video) {
  if (!ctx) return [];
  const fuente = ctx.creados.find((n) => n.tipo === "fuente" && n.mediaElement === video);
  return fuente ? fuente.salidas.map((s) => s.tipo) : [];
}

/**
 * Reproduce el encadenado: el <video> viejo se va a la ventana flotante y
 * la pagina se fabrica uno nuevo.
 *
 * Es el mismo montaje que tests/integration/encadenado.test.js y por el
 * mismo motivo: un elemento creado y nunca insertado no reproduce el
 * fallo, porque lo que engaña a getMediaElement es que el viejo sigue
 * teniendo `isConnected` true dentro del documento flotante.
 */
async function encadenarCancion(entorno) {
  const viejo = entorno.YTMPip.Adapter.getPageMediaElement();
  conTiempos(viejo, 223, 223);
  documentoFlotante(entorno.win).body.appendChild(viejo);
  entorno.YTMPip.Adapter.setBorrowedMedia(viejo);
  await pulso();

  const nuevo = entorno.win.document.createElement("video");
  conTiempos(nuevo, 16, 209);
  entorno.YTMPip.Adapter.getPlayerContainer().appendChild(nuevo);
  await pulso();

  return { viejo, nuevo };
}

/* ------------------------------------------------------------------
 * 0. La puerta
 * ------------------------------------------------------------------ */

test("APAGADO: el orquestador no toca el audio de nadie", async () => {
  /*
   * La prueba mas importante del archivo, y la unica cuyo fallo no se
   * puede arreglar recargando el codigo: hay que recargar la pestaña del
   * usuario. "off" es el valor de fabrica, asi que esto cubre a todo el
   * que instale la extension y no entre nunca en las opciones.
   *
   * Se mira que no exista NI UN AudioContext, no que no haya filtros. Un
   * contexto creado ya es una decision tomada, y el siguiente paso de
   * quien lo tenga delante sera cruzar la puerta con el.
   */
  const p = pagina();
  await pulso();

  assert.strictEqual(p.ctx(), null, "con el ecualizador apagado se monto Web Audio igualmente");
});

test("APAGADO: tampoco al encadenar la cancion siguiente", async () => {
  // El relevo de elemento es un sitio nuevo desde el que se llama a
  // `montar`, y por tanto un sitio nuevo desde el que se podria cruzar la
  // puerta sin permiso.
  const p = pagina();
  await pulso();

  await encadenarCancion(p.entorno);

  assert.strictEqual(p.ctx(), null, "el encadenado cruzo la puerta de un elemento que nadie pidio ecualizar");
});

/* ------------------------------------------------------------------
 * 1. Encendido
 * ------------------------------------------------------------------ */

test("EL CASO PEDIDO: con un preset guardado, el audio pasa por los filtros", async () => {
  const p = pagina("graves");
  await pulso();

  const ctx = p.ctx();
  assert.ok(ctx, "no se monto ningun grafo: el ecualizador guardado no sonaria");

  const video = p.entorno.YTMPip.Adapter.getMediaElement();
  assert.deepStrictEqual(
    salidasDeLaFuente(ctx, video),
    ["gain"],
    "la fuente no entro en la cadena de filtros"
  );
  assert.strictEqual(
    ctx.creados.filter((n) => n.tipo === "biquad").length,
    5,
    "no se montaron las cinco bandas"
  );
});

test("las ganancias que llegan a los nodos son las del preset, no ceros", async () => {
  /*
   * Montar la cadena y no escribir nada en ella suena EXACTAMENTE igual
   * que tener el ecualizador apagado, y ademas con la puerta ya cruzada.
   * Es el fallo mas facil de dar por bueno de todo el ecualizador: la
   * musica sigue sonando, no hay errores, y nadie oye ninguna diferencia
   * porque no la hay.
   */
  const p = pagina("graves");
  await pulso();

  const bandas = p.ctx().creados.filter((n) => n.tipo === "biquad");
  const pide = p.entorno.win.YTMPip.CONSTANTS.EQUALIZER_PRESETS.graves;

  /*
   * ESTA PRUEBA MIRABA SOLO LA PRIMERA BANDA Y ESTUVO A PUNTO DE QUEDARSE
   * CIEGA. Decia `assert…, 8` a mano; cuando "graves" paso a [7,0,0,0,1] se
   * puso roja sin que nada estuviera roto, y se cambio por leer el preset.
   * Pero al preset siguiente —[0,4,-6,-2,1]— la banda de 60 Hz vale CERO, y
   * "el nodo trae cero" es exactamente el fallo que esta prueba existe para
   * cazar: se habria puesto verde comprobando la nada.
   *
   * Asi que no mira una banda: LAS MIRA TODAS. Da igual cual sea la que sube
   * y da igual que el preset cambie otra vez.
   */
  assert.strictEqual(bandas.length, pide.length, "no hay un nodo por banda");
  assert.deepStrictEqual(
    bandas.map((b) => b.gain.objetivo),
    Array.from(pide),
    "las ganancias que llegaron a los nodos no son las del preset"
  );

  // Y la premisa, que ya no es "la primera sube" sino "alguna hace algo":
  // contra un preset todo a ceros la comparacion de arriba no probaria nada.
  assert.ok(
    pide.some((g) => g !== 0),
    "premisa: 'graves' tiene que tocar alguna banda, si no esta prueba no mira nada"
  );

  assert.strictEqual(bandas[0].type, "lowshelf", "la primera banda tiene que ser el shelf de graves");
  assert.strictEqual(bandas[0].frequency.value, 60);
});

test("lo que no se ve en ningun filtro —entrada y limitador— tambien llega", async () => {
  /*
   * ESTA PRUEBA DECIA ANTES `entrada.gain.objetivo < 1`, y esa linea en
   * verde era el fallo, no su ausencia. La preamplificacion valia
   * -(subidaMaxima + 3), asi que la banda mas alta acababa SIEMPRE en -3 dB
   * hiciera lo que hiciera el usuario: el ecualizador no podia subir nada,
   * solo bajar el resto. Lo encontro el usuario oyendolo —"apagado suena
   * mas fuerte que con esta configuracion"—, no una prueba, porque la
   * prueba estaba escrita para exigir precisamente eso.
   *
   * Lo que de verdad tiene que comprobar el cable es que las dos partes del
   * plan que no aparecen en ningun filtro llegan enteras. Si se perdieran,
   * no habria error en consola: se oiria recorte, y el sintoma se leeria
   * como "el ecualizador suena sucio".
   *
   * Se compara contra el plan, no contra numeros a mano: asi la prueba
   * sigue diciendo la verdad si mañana cambian las constantes.
   */
  const p = pagina("graves");
  await pulso();

  const ctx = p.ctx();
  const plan = p.entorno.win.YTMPip.Ecualizador.plan("graves");
  const entrada = ctx.creados.filter((n) => n.tipo === "gain")[0];
  const limitador = ctx.creados.find((n) => n.tipo === "limitador");

  assert.strictEqual(entrada.gain.objetivo, plan.entrada);
  assert.ok(limitador, "sin limitador, subir una banda vuelve a costar preamplificacion");
  assert.strictEqual(limitador.threshold.value, plan.limitador.umbralDb);
  assert.strictEqual(limitador.ratio.value, plan.limitador.ratio);
  assert.strictEqual(limitador.knee.value, plan.limitador.rodillaDb);
  assert.strictEqual(limitador.attack.value, plan.limitador.ataqueS);
  assert.strictEqual(limitador.release.value, plan.limitador.relajacionS);
});

/* ------------------------------------------------------------------
 * 2. El relevo de cancion
 * ------------------------------------------------------------------ */

test("EL FALLO CARO: el ecualizador sigue puesto en la cancion siguiente", async () => {
  /*
   * Sin la llamada a `sincronizarEcualizador` dentro de
   * attachMediaListeners, esto pasa: el ecualizador se oye en la cancion
   * en la que se encendio y en la siguiente deja de hacer nada. No hay
   * error, no hay aviso, y el usuario lo cuenta como "a veces funciona".
   */
  const p = pagina("voz");
  await pulso();

  const { nuevo } = await encadenarCancion(p.entorno);
  const ctx = p.ctx();

  assert.deepStrictEqual(
    salidasDeLaFuente(ctx, nuevo),
    ["gain"],
    "el <video> de la cancion nueva no llego a entrar en el ecualizador"
  );
});

test("el elemento abandonado se queda con salida propia, no mudo", async () => {
  /*
   * La otra mitad del relevo. La fuente del elemento viejo se desconecta
   * de los filtros para que no sigan sonando dos canciones por la misma
   * cadena, y ahi es donde se puede dejar a un elemento SIN NINGUNA
   * salida. Como su audio ya solo sale por el AudioContext —eso es lo que
   * significa haber cruzado la puerta—, quedarse sin salida es quedarse
   * mudo para siempre. Y ese elemento es el que sigue prestado a la
   * ventana flotante.
   */
  const p = pagina("voz");
  await pulso();

  const { viejo } = await encadenarCancion(p.entorno);

  assert.deepStrictEqual(
    salidasDeLaFuente(p.ctx(), viejo),
    ["destination"],
    "el elemento de la cancion anterior se quedo sin salida"
  );
});

test("no se cruza la puerta dos veces por el mismo elemento", async () => {
  /*
   * createMediaElementSource lanza InvalidStateError la segunda vez, y el
   * doble lo imita a proposito. Si el cable llamara a `montar` una vez por
   * evento del <video> en vez de una por relevo, esto reventaria cuatro
   * veces por segundo.
   */
  const p = pagina("plano");
  await pulso();

  const video = p.entorno.YTMPip.Adapter.getMediaElement();
  video.dispatchEvent(new p.entorno.win.Event("play"));
  video.dispatchEvent(new p.entorno.win.Event("timeupdate"));
  await pulso();

  const fuentes = p.ctx().creados.filter((n) => n.tipo === "fuente");
  assert.strictEqual(fuentes.length, 1, `se crearon ${fuentes.length} fuentes para el mismo <video>`);
});

/* ------------------------------------------------------------------
 * 3. Cambiar de opinion en la pagina de opciones
 * ------------------------------------------------------------------ */

test("cambiar de preset se oye sin esperar a la cancion siguiente", async () => {
  const p = pagina("plano");
  await pulso();

  const bandas = p.ctx().creados.filter((n) => n.tipo === "biquad");
  const pide = p.entorno.win.YTMPip.CONSTANTS.EQUALIZER_PRESETS.graves;

  const antes = bandas.map((b) => b.gain.objetivo);
  assert.deepStrictEqual(antes, [0, 0, 0, 0, 0], "premisa: 'plano' deja las bandas a cero");

  await p.guardar("graves");

  /*
   * MISMA TRAMPA QUE ARRIBA, y aqui era peor. Esta prueba miraba la banda de
   * 60 Hz y comparaba contra `graves[0]`. En el preset de hoy esa banda vale
   * CERO, o sea que el "antes" y el "despues" son el mismo numero: la prueba
   * se habria quedado verde aunque guardar en opciones no moviera nada, que
   * es literalmente el fallo que viene a cazar.
   *
   * Mirar las cinco lo arregla, pero conviene decir aparte lo que importa:
   * que ALGO CAMBIO. Comparar con el preset y comprobar que el preset no es
   * plano son dos afirmaciones distintas y hacen falta las dos.
   */
  const despues = bandas.map((b) => b.gain.objetivo);
  assert.deepStrictEqual(
    despues,
    Array.from(pide),
    "mover el ecualizador en opciones no se noto hasta cambiar de cancion"
  );
  assert.notDeepStrictEqual(
    despues,
    antes,
    "premisa: 'graves' tiene que sonar distinto de 'plano', si no esta prueba no mira nada"
  );
});

test("APAGARLO desde opciones devuelve el sonido a plano sin cerrar el contexto", async () => {
  /*
   * Apagar NO puede deshacer el cruce de la puerta, porque no se puede.
   * Lo que hace es PUENTEAR: la fuente se suelta de los filtros y se
   * conecta directa a destination. Cerrar el contexto seria la reaccion
   * intuitiva y es la peor posible: deja al usuario sin audio hasta que
   * recargue la pestaña.
   */
  const p = pagina("graves");
  await pulso();

  const ctx = p.ctx();
  const video = p.entorno.YTMPip.Adapter.getMediaElement();
  assert.deepStrictEqual(salidasDeLaFuente(ctx, video), ["gain"], "premisa");

  await p.guardar("off");

  assert.deepStrictEqual(
    salidasDeLaFuente(ctx, video),
    ["destination"],
    "apagar el ecualizador dejo el audio pasando por los filtros"
  );
  assert.strictEqual(ctx.cerrado, false, "se cerro el contexto: el usuario se queda sin audio");
});

test("volver a encenderlo despues de apagarlo no exige recargar la pestaña", async () => {
  // Aqui es donde una implementacion que "limpia" al apagar se descubre:
  // al volver, createMediaElementSource lanza InvalidStateError y el
  // ecualizador ya no vuelve a funcionar en esa pestaña.
  const p = pagina("graves");
  await pulso();
  await p.guardar("off");
  await p.guardar("voz");

  const ctx = p.ctx();
  const video = p.entorno.YTMPip.Adapter.getMediaElement();

  assert.deepStrictEqual(
    salidasDeLaFuente(ctx, video),
    ["gain"],
    "no se pudo volver a encender el ecualizador"
  );
  assert.strictEqual(
    ctx.creados.filter((n) => n.tipo === "fuente").length,
    1,
    "se intento cruzar la puerta otra vez en vez de reutilizar la fuente guardada"
  );
});

/* ------------------------------------------------------------------
 * 4. El contexto dormido
 * ------------------------------------------------------------------ */

test("darle a reproducir despierta un contexto suspendido", async () => {
  /*
   * Un AudioContext nace suspendido si no lo pidio un gesto del usuario, y
   * el navegador tambien lo duerme cuando la pestaña lleva un rato al
   * fondo. Con el espectro eso daba barras planas; con el ecualizador da
   * SILENCIO, porque el audio ya solo sale por ahi.
   */
  const p = pagina("graves");
  await pulso();

  const ctx = p.ctx();
  ctx.state = "suspended";
  const antes = ctx.resumes;

  const video = p.entorno.YTMPip.Adapter.getMediaElement();
  video.dispatchEvent(new p.entorno.win.Event("play"));

  assert.ok(ctx.resumes > antes, "el contexto se quedo dormido y la musica muda");
  assert.strictEqual(ctx.state, "running");
});

test("timeupdate NO zarandea el contexto (llega cuatro veces por segundo)", async () => {
  const p = pagina("graves");
  await pulso();

  const ctx = p.ctx();

  /*
   * SUSPENDIDO A PROPOSITO, y esta linea es media prueba.
   *
   * Sin ella el contexto llega aqui EN MARCHA —`montar` termina llamando a
   * `reanudar`— y entonces `reanudar()` no hace nada por su propia guarda
   * (`state === "suspended"`). La cuenta de resumes se quedaba quieta tanto
   * si la llamada colgaba de `play` como si colgaba de TODOS los eventos:
   * la prueba estaba en verde sin distinguir las dos versiones. Lo dijo una
   * mutacion de tools/mutar-mandos.js, no la suite.
   *
   * Dormido, las dos versiones se separan: la buena deja la cuenta quieta
   * porque `timeupdate` no despierta a nadie; la que zarandea el contexto
   * en cada evento la sube diez veces.
   */
  ctx.state = "suspended";
  const antes = ctx.resumes;

  const video = p.entorno.YTMPip.Adapter.getMediaElement();
  for (let i = 0; i < 10; i++) video.dispatchEvent(new p.entorno.win.Event("timeupdate"));

  assert.strictEqual(ctx.resumes, antes, "se llamo a resume() en cada timeupdate");
  assert.strictEqual(ctx.state, "suspended", "alguien lo desperto sin que se lo pidieran");
});
