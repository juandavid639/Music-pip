/*
 * Pruebas del MENU de la barra de herramientas.
 *
 * Es el primer archivo de pruebas que tiene. Hasta ahora lo unico que le
 * miraba algo era iconos.test.js, y solo para comprobar que sus `data-ico`
 * tuvieran dibujo. Eso deja fuera todo lo que hace popup.js, y ahi habia dos
 * fallos mudos viviendo tranquilamente:
 *
 *  - `src = ""` para decir "sin portada", que el navegador resuelve contra
 *    la propia pagina y pinta como imagen rota.
 *  - `disabled` puesto por JavaScript sin ninguna regla en la hoja que lo
 *    contara, o sea un boton apagado con pinta de encendido.
 *
 * Los dos son de la misma familia: NO DAN ERROR. Se ven, y solo si alguien
 * abre el menu sin YouTube Music delante, que es precisamente el caso que
 * nadie prueba a mano.
 *
 * LO QUE AQUI NO SE PRUEBA: que el menu se vea bien. El fondo difuminado, la
 * jerarquia de los botones y las sombras son decisiones de la hoja y jsdom no
 * maqueta. De la hoja solo se leen, como texto, las DECISIONES que sostienen
 * un comportamiento —que exista regla para `:disabled`, que el fondo se apague
 * con la clase— y esta escrito ahi mismo que es lo unico que demuestran.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, RAIZ } = require("../helpers/entorno.js");

/*
 * Monta el menu de verdad: su HTML, sus scripts y en su orden.
 *
 * El HTML se lee del archivo en vez de escribirse aqui a mano. Un fixture
 * copiado seria una segunda version del menu que no se entera de los
 * cambios: se podria borrar un boton de popup.html y estas pruebas seguirian
 * en verde pulsando el del fixture.
 *
 * `respuesta` es lo que contesta la pestaña. Se guarda ademas cada mensaje
 * enviado, porque los botones no devuelven nada observable: lo unico que
 * hacen es mandar un comando.
 */
function menu(respuesta, opciones = {}) {
  const html = fs.readFileSync(path.join(RAIZ, "src/popup/popup.html"), "utf8");
  const enviados = [];
  const avisos = [];

  const { win } = crearEntorno(html, {
    sendMessage(mensaje) {
      enviados.push(mensaje);
      /*
       * `fallanComandos` simula la pestaña que se esfumo ENTRE abrir el
       * menu y pulsar un boton: la primera consulta de estado contesta
       * bien (el menu arranca conectado, que es la premisa) y todo lo
       * demas rechaza, que es lo que hace sendMessage de verdad cuando
       * no hay nadie al otro lado.
       */
      if (opciones.fallanComandos && mensaje.type !== "REQUEST_CURRENT_STATE") {
        return Promise.reject(new Error("no hay nadie al otro lado"));
      }
      return Promise.resolve(respuesta === undefined ? { ok: true } : { state: respuesta });
    }
  });

  // Se recogen los avisos en vez de dejarlos salir: la prueba los cuenta
  // (son parte del comportamiento) y la salida de la suite queda limpia.
  win.console.warn = (...args) => avisos.push(args);

  cargar(win, "src/shared/constants.js", "src/shared/textos.js", "src/shared/messages.js", "src/shared/iconos.js", "src/popup/popup.js");

  const $ = (id) => win.document.getElementById(id);
  return {
    win,
    enviados,
    avisos,
    $,
    estado: $("ytmpip-popup-status"),
    punto: $("ytmpip-popup-dot"),
    fondo: $("ytmpip-popup-backdrop"),
    portada: $("ytmpip-popup-artwork"),
    titulo: $("ytmpip-popup-title"),
    artista: $("ytmpip-popup-artist"),
    play: $("ytmpip-popup-play-pause"),
    siguiente: $("ytmpip-popup-next"),
    anterior: $("ytmpip-popup-previous"),
    abrir: $("ytmpip-popup-open-pip"),
    // `refreshState` es asincrono (una promesa). Un tick basta para que el
    // `.then` haya corrido, y es preferible a un setTimeout con un numero
    // inventado.
    async asentar() {
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

const SONANDO = {
  connected: true,
  playing: true,
  title: "Rebelión",
  artist: "Joe Arroyo",
  artworkUrl: "https://lh3.googleusercontent.com/portada=w120"
};

const HOJA = fs.readFileSync(path.join(RAIZ, "src/popup/popup.css"), "utf8");

/* ------------------------------------------------------------------
 * La portada que no existe
 * ------------------------------------------------------------------ */

test("SIN PORTADA SE PONE EL DIBUJO DE RESERVA, no una cadena vacia", async () => {
  /*
   * El fallo exacto: `src = ""` no significa "sin imagen". Un src vacio se
   * resuelve contra la URL del documento, asi que el navegador se pide
   * popup.html a si mismo como si fuera un PNG y acaba pintando el icono de
   * imagen rota. Sin un solo error en consola.
   *
   * Se comprueba que la ruta apunte al mismo archivo que usa la ventana
   * flotante, y no solo que sea "algo no vacio": dos placeholders distintos
   * en dos superficies de la misma extension es exactamente el tipo de
   * detalle que aqui se persigue.
   */
  const m = menu({ connected: true, playing: false });
  await m.asentar();

  assert.match(m.portada.getAttribute("src"), /assets\/placeholders\/artwork\.svg$/);
});

test("la reserva ya esta puesta ANTES de que conteste la pestaña", async () => {
  /*
   * Si solo se pusiera en `render`, el primer fotograma del menu —el que se
   * ve cada vez que se abre, antes de que la pestaña responda— seria el
   * icono de imagen rota. Por eso esto se mira SIN asentar.
   */
  const m = menu(SONANDO);

  assert.match(m.portada.getAttribute("src"), /artwork\.svg$/, "el menu abre con la imagen rota");
});

test("con portada de verdad se pone esa, no la de reserva", async () => {
  const m = menu(SONANDO);
  await m.asentar();

  assert.strictEqual(m.portada.getAttribute("src"), SONANDO.artworkUrl);
});

/* ------------------------------------------------------------------
 * El fondo difuminado
 * ------------------------------------------------------------------ */

test("el fondo toma la portada de la cancion", async () => {
  const m = menu(SONANDO);
  await m.asentar();

  assert.match(m.fondo.style.backgroundImage, /portada=w120/);
  assert.ok(m.fondo.classList.contains("ytmpip-has-art"), "el fondo se quedo apagado con portada puesta");
});

test("SIN PORTADA EL FONDO SE VACIA, no se queda el de la cancion anterior", async () => {
  /*
   * El menu no se recarga entre canciones: se abre, se refresca y se vuelve
   * a abrir con el mismo documento vivo. Sin vaciarlo, una cancion sin
   * portada heredaria el fondo de la anterior, que es de los fallos que mas
   * cuesta creer cuando se ve.
   *
   * Y se comprueban las DOS cosas —la imagen y la clase— porque son dos
   * lineas y cada una se puede olvidar sola. Con la clase puesta y la imagen
   * vacia queda un rectangulo oscuro a medias en vez del color plano.
   */
  const m = menu(SONANDO);
  await m.asentar();
  assert.ok(m.fondo.classList.contains("ytmpip-has-art"), "premisa: hay fondo");

  m.win.YTMPip.__menuDePruebas.render({ connected: true, playing: true, title: "otra" });

  assert.strictEqual(m.fondo.style.backgroundImage, "");
  assert.strictEqual(m.fondo.classList.contains("ytmpip-has-art"), false);
});

test("NO SE DIFUMINA EL DIBUJO DE RESERVA: seria un blur para no enseñar nada", async () => {
  /*
   * La portada de reserva SI se pone en el <img> —ahi hace falta algo— pero
   * llevarla tambien al fondo daria un gris difuminado, o sea el mismo color
   * plano de siempre con el coste de un desenfoque a pantalla completa.
   */
  const m = menu({ connected: true, playing: false });
  await m.asentar();

  assert.match(m.portada.getAttribute("src"), /artwork\.svg$/, "premisa: hay reserva en el <img>");
  assert.strictEqual(m.fondo.style.backgroundImage, "", "se difumino el dibujo de reserva");
});

test("cuanto se ve el fondo lo decide la HOJA, no popup.js", async () => {
  /*
   * La misma regla que en la ventana flotante: JavaScript dice si hay
   * portada, la hoja dice cuanto se ve. Si popup.js escribiera la opacidad,
   * el efecto viviria repartido entre dos archivos.
   */
  const m = menu(SONANDO);
  await m.asentar();

  assert.strictEqual(m.fondo.style.opacity, "", "la opacidad se decidio en JavaScript");
  assert.match(HOJA, /\.ytmpip-popup-backdrop\.ytmpip-has-art\s*\{[^}]*opacity:/);
});

/* ------------------------------------------------------------------
 * Sin pestaña no hay mandos
 * ------------------------------------------------------------------ */

test("SIN YOUTUBE MUSIC SE APAGAN LOS CUATRO BOTONES, no solo el de abrir", async () => {
  /*
   * Se apagaba unicamente `openPip`. Los tres del transporte se quedaban
   * encendidos, respondian al clic y mandaban un comando a ninguna parte:
   * el usuario pulsa "siguiente", no pasa nada, y no hay forma de saber si
   * ha fallado el, la extension o la cancion.
   */
  const m = menu({ connected: false });
  await m.asentar();

  assert.strictEqual(m.abrir.disabled, true);
  assert.strictEqual(m.play.disabled, true, "reproducir seguia pulsable sin pestaña");
  assert.strictEqual(m.siguiente.disabled, true, "siguiente seguia pulsable sin pestaña");
  assert.strictEqual(m.anterior.disabled, true, "anterior seguia pulsable sin pestaña");
});

test("y se vuelven a encender cuando aparece la pestaña", async () => {
  /*
   * El camino de vuelta es una linea distinta de la de ida. Apagarlos y no
   * volver a encenderlos deja un menu muerto hasta que se cierra y se abre.
   */
  const m = menu({ connected: false });
  await m.asentar();
  assert.strictEqual(m.play.disabled, true, "premisa");

  m.win.YTMPip.__menuDePruebas.render(SONANDO);

  assert.strictEqual(m.play.disabled, false);
  assert.strictEqual(m.abrir.disabled, false);
});

test("UN BOTON APAGADO SE VE APAGADO: la hoja tiene regla para :disabled", async () => {
  /*
   * Esto prueba TEXTO, y hay que decirlo: jsdom no resuelve la cascada, asi
   * que no puede mirarse el resultado. Lo que demuestra es que la decision
   * este tomada.
   *
   * Se queda porque el fallo que evita es real y era el estado del archivo:
   * `disabled` funcionaba —el clic no llegaba— y no habia NINGUNA regla que
   * lo contara. Un boton que ignora los clics con la misma pinta que uno que
   * los atiende es peor que no tener boton.
   */
  const bloque = HOJA.match(/button:disabled\s*\{([^}]*)\}/);

  assert.ok(bloque, "no hay ninguna regla para los botones apagados");
  assert.match(bloque[1], /opacity:/, "el boton apagado se ve igual que el encendido");
  assert.match(bloque[1], /cursor:\s*not-allowed/, "el cursor sigue diciendo que se puede pulsar");
});

test("el hover NO se enciende en un boton apagado", async () => {
  /*
   * Detalle pequeño con consecuencia grande: un `button:hover` sin
   * `:not(:disabled)` ilumina el boton muerto al pasar por encima, que es
   * exactamente la señal contraria a la que se acaba de dar apagandolo.
   */
  const hovers = HOJA.match(/^[^\n]*:hover[^\n]*\{/gm) || [];
  const sinGuardia = hovers.filter((s) => s.includes("button") || s.includes("ytmpip-popup-p") || s.includes("step"));

  for (const selector of sinGuardia) {
    assert.match(selector, /:not\(:disabled\)/, `este hover se enciende con el boton apagado: ${selector.trim()}`);
  }
  assert.ok(sinGuardia.length > 0, "premisa: hay reglas de hover que revisar");
});

/* ------------------------------------------------------------------
 * El punto de estado
 * ------------------------------------------------------------------ */

test("el punto se enciende con la pestaña y se apaga sin ella", async () => {
  const m = menu(SONANDO);
  await m.asentar();
  assert.ok(m.punto.classList.contains("ytmpip-conectado"));

  m.win.YTMPip.__menuDePruebas.render({ connected: false });
  assert.strictEqual(m.punto.classList.contains("ytmpip-conectado"), false);
});

test("EL COLOR NO VA SOLO: al lado hay una frase que dice lo mismo", async () => {
  /*
   * Un estado contado unicamente con color no lo lee quien no distingue ese
   * color, y el punto mide 8 px. La frase es la que informa; el punto solo
   * la adelanta.
   */
  const m = menu({ connected: false });
  await m.asentar();

  assert.match(m.estado.textContent, /no encontrado/i);
  assert.strictEqual(m.punto.getAttribute("aria-hidden"), "true", "el punto se lee ademas de la frase, duplicandola");

  m.win.YTMPip.__menuDePruebas.render(SONANDO);
  assert.match(m.estado.textContent, /Conectado/i);
});

/* ------------------------------------------------------------------
 * El nombre del sitio en la frase de estado
 *
 * El fallo que estas dos persiguen ya paso una vez con el boton de
 * "volver": un rotulo con "YouTube Music" escrito a mano que mentia en
 * una pestaña de Spotify. La frase del menu decia lo mismo.
 * ------------------------------------------------------------------ */

test("EL ESTADO DICE EL SITIO DE VERDAD, no YouTube Music fijo", async () => {
  /*
   * strictEqual y no un match: la frase entera sale del catalogo real
   * («Conectado a $1») con el nombre que viajo en el estado. Un match
   * de /Spotify/ pasaria igual con "Conectado a Spotify undefined".
   */
  const m = menu(Object.assign({}, SONANDO, { siteName: "Spotify" }));
  await m.asentar();

  assert.strictEqual(m.estado.textContent, "Conectado a Spotify");
});

test("sin nombre de sitio, «Conectado» a secas: generico antes que inventado", async () => {
  /*
   * SONANDO no lleva siteName a proposito: modela un estado de escenario
   * viejo o un lector sin registro. La reaccion correcta es no nombrar a
   * nadie, no resucitar el "YouTube Music" fijo de antes.
   */
  const m = menu(SONANDO);
  await m.asentar();

  assert.strictEqual(m.estado.textContent, "Conectado");
});

test("el verde del punto NO es el rojo de acento", async () => {
  /*
   * El acento marca lo PULSABLE en toda la extension. Darselo ademas a
   * "conectado" le pondria dos significados al mismo color, y entonces no
   * significa ninguno.
   */
  const conectado = HOJA.match(/\.ytmpip-popup-dot\.ytmpip-conectado\s*\{([^}]*)\}/);

  assert.ok(conectado, "el punto conectado no tiene color propio");
  assert.doesNotMatch(conectado[1], /var\(--accent\)/, "el punto se pinto con el color de lo pulsable");
});

/* ------------------------------------------------------------------
 * Que lo de siempre siga funcionando
 *
 * El rediseño toco el HTML entero. Estas tres no son nuevas funcionalidad:
 * son la red por debajo de haber reescrito el archivo.
 * ------------------------------------------------------------------ */

test("los botones siguen mandando su comando despues de mover el HTML", async () => {
  /*
   * El sobre es PLANO: `createMessage(tipo, datos)` hace
   * `Object.assign({ type }, datos)`, asi que el comando cuelga de `command`
   * y no de un `payload` intermedio. Esta prueba se escribio suponiendo lo
   * segundo y fallo en la primera pasada; lo que estaba mal era la prueba,
   * no el menu. Queda anotado porque la suposicion es facil de repetir: casi
   * todos los mensajes de este proyecto SI llevan datos anidados.
   */
  const m = menu(SONANDO);
  await m.asentar();

  m.enviados.length = 0;
  m.siguiente.click();
  m.anterior.click();
  m.play.click();

  const comandos = m.enviados.filter((x) => x.type === "COMMAND" && x.command).map((x) => x.command.type);
  assert.deepStrictEqual(Array.from(comandos), ["NEXT_TRACK", "PREVIOUS_TRACK", "PAUSE"]);
});

test("un boton apagado NO manda comando: `disabled` no es solo un color", async () => {
  /*
   * La otra mitad de apagar los mandos. `disabled` lo impide de verdad en un
   * navegador, pero esta prueba no esta aqui por el navegador: esta por el
   * dia que alguien decida "apagarlos" quitandoles el color en vez de la
   * propiedad, y deje tres botones que parecen muertos y siguen disparando.
   */
  const m = menu({ connected: false });
  await m.asentar();

  m.enviados.length = 0;
  m.siguiente.click();
  m.play.click();
  m.abrir.click();

  assert.deepStrictEqual(Array.from(m.enviados), [], "un boton apagado mando su comando igual");
});

test("el titulo y el artista siguen llegando a su sitio", async () => {
  const m = menu(SONANDO);
  await m.asentar();

  assert.strictEqual(m.titulo.textContent, "Rebelión");
  assert.strictEqual(m.artista.textContent, "Joe Arroyo");
});

test("el boton de reproducir sigue cambiando de dibujo y de etiqueta", async () => {
  const m = menu(SONANDO);
  await m.asentar();

  assert.strictEqual(m.play.dataset.ico, "pausar", "sonando y el boton ofrece reproducir");
  assert.strictEqual(m.play.getAttribute("aria-label"), "Pausar");
  assert.ok(m.play.querySelector("svg"), "el boton se quedo con el emoji de respaldo");

  m.win.YTMPip.__menuDePruebas.render(Object.assign({}, SONANDO, { playing: false }));
  assert.strictEqual(m.play.dataset.ico, "reproducir");
  assert.strictEqual(m.play.getAttribute("aria-label"), "Reproducir");
});

/* ------------------------------------------------------------------
 * El comando que no llega
 *
 * Aqui vivian los dos ultimos `.catch(() => {})` del menu: el usuario
 * pulsaba, la promesa rechazaba y no pasaba NADA. Ni un aviso en consola
 * ni un cambio en la pantalla, o sea el mismo fallo mudo que el resto de
 * este archivo persigue, solo que en el camino de ida.
 * ------------------------------------------------------------------ */

test("SI EL COMANDO NO LLEGA, EL MENU LO CUENTA: se pinta desconectado", async () => {
  /*
   * La reaccion es la MISMA que la de `refreshState` cuando nadie
   * contesta, a proposito: una sola forma de decir "no hay pestaña". Se
   * comprueban las dos mitades por separado —la frase y los botones—
   * porque cada una sale de una linea distinta de `render` y cualquiera
   * de las dos se puede perder sola.
   */
  const m = menu(SONANDO, { fallanComandos: true });
  await m.asentar();
  assert.strictEqual(m.play.disabled, false, "premisa: el menu arranco conectado");

  m.siguiente.click();
  await m.asentar();

  assert.match(m.estado.textContent, /no encontrado/i, "el fallo no cambio la frase de estado");
  assert.strictEqual(m.play.disabled, true, "los botones siguieron encendidos tras el fallo");
  assert.strictEqual(m.siguiente.disabled, true);
});

test("y deja UN aviso en consola, que antes no dejaba ninguno", async () => {
  /*
   * El aviso no es decoracion: el menu tiene su propia consola y sin esta
   * linea el fallo es invisible tambien para quien va a mirarla. Se cuenta
   * que sea UNO —no "al menos uno"— porque un aviso por reintento seria
   * ruido, y se mira que lleve el tipo del comando para que sirva de algo.
   */
  const m = menu(SONANDO, { fallanComandos: true });
  await m.asentar();

  m.siguiente.click();
  await m.asentar();

  assert.strictEqual(m.avisos.length, 1, "el fallo del comando no dejo rastro en consola");
  assert.ok(m.avisos[0].some((x) => x === "NEXT_TRACK"), "el aviso no dice QUE comando fallo");
});

test("el boton de abrir la ventana tampoco se traga el fallo", async () => {
  /*
   * Es el otro `.catch(() => {})` y el mas visible de los dos: se pulsa
   * "abrir ventana", no se abre nada y el menu se queda tan tranquilo
   * diciendo "Conectado".
   */
  const m = menu(SONANDO, { fallanComandos: true });
  await m.asentar();
  assert.strictEqual(m.abrir.disabled, false, "premisa: el menu arranco conectado");

  m.abrir.click();
  await m.asentar();

  assert.match(m.estado.textContent, /no encontrado/i);
  assert.strictEqual(m.abrir.disabled, true);
  assert.strictEqual(m.avisos.length, 1, "abrir la ventana fallo sin dejar rastro");
});

test("cuando el comando SI llega no hay ni aviso ni apagon", async () => {
  /*
   * La otra mitad de la regla, para que el arreglo no se pase de frenada:
   * un catch que se disparara con la promesa resuelta apagaria el menu en
   * cada pulsacion. Si esta prueba falla y las de arriba pasan, el fallo
   * esta en el camino bueno, no en el malo.
   */
  const m = menu(SONANDO);
  await m.asentar();

  m.siguiente.click();
  await m.asentar();

  assert.strictEqual(m.avisos.length, 0, "un comando que llego bien dejo un aviso");
  assert.strictEqual(m.siguiente.disabled, false, "un comando que llego bien apago los botones");
});
