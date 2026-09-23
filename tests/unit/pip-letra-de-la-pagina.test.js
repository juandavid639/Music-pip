/*
 * Pruebas de la letra sincronizada POR LA PAGINA (la de Spotify).
 *
 * Hasta esta tanda la ventana solo sabia sincronizar la letra por
 * TIEMPOS (los data-time de Better Lyrics contra el reloj del <video>).
 * Las lineas de Spotify no traen tiempos, pero la pagina marca cual se
 * canta (una clase que ninguna otra linea repite; el adaptador la
 * convierte en state.lyrics.activeLine) y ese indice tiene que encender
 * lo mismo que encendia el reloj: el resalte, el desplazamiento y la
 * linea en vivo.
 *
 * Lo unico que NO enciende es el salto con clic, y las pruebas lo fijan:
 * saltar necesita un tiempo al que ir, y sigue sin haberlo.
 *
 * La regla de "que fuente manda" vive en el latido (tickLyrics), en un
 * solo sitio: con tiempos manda el reloj; sin tiempos manda la pagina;
 * sin ninguna de las dos, la letra es un bloque estatico, como siempre
 * fue. Aqui se ejercita el latido de verdad, no una copia.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { crearEntorno, cargar, leerFixture, conTiempos, RAIZ } = require("../helpers/entorno.js");

function ventana(fixture) {
  const { win } = crearEntorno(fixture ? leerFixture(fixture) : undefined);
  cargar(
    win,
    "src/shared/constants.js",
    "src/shared/textos.js",
    "src/shared/messages.js",
    "src/shared/ecualizador.js",
    "src/shared/settings.js",
    "src/content/adapter-registry.js",
    "src/content/youtube-music-adapter.js",
    "src/content/track-timeline.js",
    "src/content/player-controller.js",
    "src/content/audio-spectrum.js",
    "src/shared/iconos.js",
    "src/pip/pip.js"
  );

  // jsdom no maqueta: los desplazamientos se anulan (aqui no se mide el
  // scroll, eso ya lo vigila pip-desplazamiento-letra.test.js).
  win.Element.prototype.scrollTo = function () {};
  win.Element.prototype.scrollIntoView = function () {};

  const doc = win.document.implementation.createHTMLDocument("pip");
  doc.body.innerHTML = fs.readFileSync(path.join(RAIZ, "src/pip/pip.html"), "utf8");

  const banco = win.YTMPip.PipView.__bancoDePruebas;
  banco.montar(win, doc);

  return {
    win,
    doc,
    banco,
    PipView: win.YTMPip.PipView,
    // Los indices de las lineas resaltadas AHORA (deberia ser uno o ninguno).
    resaltadas() {
      return [...doc.getElementById("ytmpip-lyrics-lines").children]
        .map((p, i) => (p.classList.contains("ytmpip-lyric-active") ? i : -1))
        .filter((i) => i >= 0);
    }
  };
}

// La forma exacta de la letra de Spotify: lineas sin ningun tiempo.
const SIN_TIEMPOS = [
  { text: "Primer verso sin tiempo", time: null },
  { text: "Segundo verso sin tiempo", time: null },
  { text: "Tercer verso sin tiempo", time: null }
];

function estado(lyrics) {
  return { connected: true, playing: true, title: "x", artist: "y", hasVideo: false, lyrics: lyrics };
}

function conLetraDePagina(activeLine) {
  return estado({ status: "available", source: "Spotify", lines: SIN_TIEMPOS, activeLine: activeLine });
}

test("sin tiempos, el resalte obedece a la linea que marca la pagina", () => {
  const v = ventana();
  v.PipView.onStateUpdate(conLetraDePagina(1));

  /*
   * La premisa de la letra de Spotify, fijada antes de mirar el resalte:
   * ninguna linea trae tiempo, asi que ninguna puede ser un boton de
   * "saltar a este momento". Si alguna saliera clicable, la ventana
   * estaria ofreciendo un salto que no puede dar.
   */
  const parrafos = [...v.doc.getElementById("ytmpip-lyrics-lines").children];
  assert.strictEqual(parrafos.length, 3, "premisa: la letra entera esta pintada");
  parrafos.forEach((p) => {
    assert.ok(!p.classList.contains("ytmpip-lyric-clickable"), "una linea sin tiempo salio clicable");
    assert.strictEqual(p.getAttribute("role"), null, "una linea sin tiempo salio como boton");
  });

  v.banco.latidoDeLetra();

  assert.deepStrictEqual(v.resaltadas(), [1]);
});

test("la marca se muda de linea con cada estado, como en la pagina", () => {
  const v = ventana();
  v.PipView.onStateUpdate(conLetraDePagina(0));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), [0]);

  /*
   * El estado siguiente trae la MISMA letra (misma firma: el DOM de las
   * lineas no se reconstruye) con la marca en otra linea. Es el caso de
   * cada pocos segundos en Spotify, y el que se lleva por delante a
   * cualquier implementacion que solo recoja el indice al reconstruir.
   */
  v.PipView.onStateUpdate(conLetraDePagina(2));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), [2], "el resalte no siguio a la pagina");
});

test("REGRESION GEMELA: sin tiempos y sin indice, la letra es un bloque estatico", () => {
  /*
   * La letra nativa de YouTube Music (LyricFind): tampoco trae tiempos,
   * y su pagina NO marca nada. Antes de esta tanda no se resaltaba nada
   * y despues tampoco debe: resaltar un verso al azar seria fingir una
   * sincronizacion que no existe.
   */
  const v = ventana();
  v.PipView.onStateUpdate(estado({ status: "available", source: "LyricFind", lines: SIN_TIEMPOS }));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), []);
});

test("si la pagina se abstiene o desbarra, el resalte se apaga", () => {
  const v = ventana();
  v.PipView.onStateUpdate(conLetraDePagina(1));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), [1], "premisa: habia resalte que apagar");

  // La abstencion (el adaptador no encontro marca): se apaga, no se
  // queda clavado en un verso que ya no se canta.
  v.PipView.onStateUpdate(conLetraDePagina(undefined));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), [], "el resalte se quedo clavado tras la abstencion");

  // Y un indice fuera de la letra pintada (un desfase entre las dos
  // lecturas del DOM) tampoco puede resaltar nada.
  v.PipView.onStateUpdate(conLetraDePagina(7));
  v.banco.latidoDeLetra();
  assert.deepStrictEqual(v.resaltadas(), [], "un indice fuera de rango encendio algo");
});

test("con tiempos manda el reloj, no el indice que traiga el estado", () => {
  /*
   * Las dos fuentes a la vez, en contradiccion: la letra trae tiempos
   * (Better Lyrics) y el estado ademas dice activeLine 0. El reloj late
   * aqui mismo cada 300 ms y permite saltar con un clic; el indice del
   * estado llega con el rebote del observador. Con tiempos a la vista,
   * el reloj es la fuente de verdad.
   */
  const v = ventana("controles-completos.html");
  conTiempos(v.win.YTMPip.Adapter.getPageMediaElement(), 20, 300);

  v.PipView.onStateUpdate(
    estado({
      status: "available",
      source: "Better Lyrics",
      lines: [
        { text: "Primera", time: 10 },
        { text: "Segunda", time: 14 },
        { text: "Tercera", time: 18 },
        { text: "Cuarta", time: 22 }
      ],
      activeLine: 0
    })
  );
  v.banco.latidoDeLetra();

  // En el segundo 20 suena la tercera (empezo en 18), no la que diga
  // activeLine.
  assert.deepStrictEqual(v.resaltadas(), [2]);
});

test("la linea en vivo tambien se enciende con la letra de la pagina", () => {
  const v = ventana();
  v.PipView.onStateUpdate(conLetraDePagina(1));

  /*
   * La ventana pequeña: el panel esta "abierto" pero el CSS de densidad
   * no lo enseña. jsdom no tiene esa hoja, asi que se cierra a mano,
   * igual que en pip-siguiente-linea.test.js. Es la situacion donde la
   * linea en vivo ES la letra.
   */
  v.doc.getElementById("ytmpip-lyrics-panel").hidden = true;
  v.banco.latidoDeLetra();

  const enVivo = v.doc.getElementById("ytmpip-now-line");
  assert.strictEqual(enVivo.hidden, false, "la letra en grande no se encendio sin tiempos");
  assert.strictEqual(enVivo.textContent, "Segundo verso sin tiempo");

  // Sin la marca de la pagina, la misma ventana no enseña linea en vivo:
  // no hay sincronia que enseñar.
  v.PipView.onStateUpdate(estado({ status: "available", source: "LyricFind", lines: SIN_TIEMPOS }));
  v.doc.getElementById("ytmpip-lyrics-panel").hidden = true;
  v.banco.latidoDeLetra();
  assert.strictEqual(enVivo.hidden, true, "salio una linea en vivo sin ninguna fuente de sincronia");
});
