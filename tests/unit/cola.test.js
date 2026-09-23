/*
 * Pruebas del lector de la COLA ("A continuacion"): el trozo de estado
 * `upNext` que la ventana flotante enseña bajo el boton "Siguientes".
 *
 * Lo que se fija aqui es la POLITICA del lector, no el DOM de Google (eso
 * se mira con tools/diagnostico-cola.js en la pagina real):
 *
 *   - "siguientes" son las de DESPUES del elemento `selected`, nunca las
 *     ya sonadas;
 *   - sin la marca `selected` no se adivina: lista vacia;
 *   - el corte a QUEUE_MAX_ITEMS va ANTES que el filtro de filas vacias,
 *     porque cortar despues seria recorrer una cola de cientos de
 *     elementos en cada latido del estado.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

/*
 * Los arrays del lector nacen en la ventana de jsdom, y deepStrictEqual
 * distingue el Array de un realm del Array de otro (mismo contenido,
 * prototipos distintos). Array.from aqui los "nacionaliza" al realm de la
 * prueba; sin esto, hasta la lista vacia falla la comparacion.
 */
function titulos(upNext) {
  return Array.from(upNext, (c) => c.title);
}

test("las siguientes son las de DESPUES de la marcada, en orden y sin las ya sonadas", () => {
  const { YTMPip } = entornoContenido("cola.html");
  const upNext = YTMPip.MetadataReader.read().upNext;

  assert.deepStrictEqual(titulos(upNext), [
    "Primera Siguiente",
    "Segunda Siguiente",
    "Tercera Siguiente",
    "Cuarta Siguiente",
    "Quinta Siguiente"
  ]);
  // Ni la anterior ni la que suena: eso ya lo enseña la propia ventana.
  assert.ok(!titulos(upNext).includes("Ya Sonó"), "una cancion ya sonada no es 'siguiente'");
  assert.ok(!titulos(upNext).includes("La Que Suena"), "la actual no es 'siguiente'");
});

test("del byline solo sobrevive el artista, como en la barra", () => {
  const { YTMPip } = entornoContenido("cola.html");
  const primera = YTMPip.MetadataReader.read().upNext[0];

  assert.strictEqual(primera.artist, "Ana Torroja");
  assert.ok(!primera.artist.includes("•"), "el separador no debe sobrevivir");
});

test("se corta a QUEUE_MAX_ITEMS: la sexta no viaja", () => {
  const { YTMPip } = entornoContenido("cola.html");
  const upNext = YTMPip.MetadataReader.read().upNext;

  assert.strictEqual(upNext.length, YTMPip.CONSTANTS.QUEUE_MAX_ITEMS);
  assert.ok(!titulos(upNext).includes("Sexta Siguiente"), "la cola que viaja debe venir ya cortada");
});

test("sin elemento `selected` no se adivina: lista vacia", () => {
  /*
   * Es la misma politica que repetir/aleatorio: preferimos no enseñar cola
   * a enseñar una inventada. Sin la marca no hay forma de distinguir lo
   * que viene de lo que ya sono.
   */
  const { win, YTMPip } = entornoContenido("cola.html");
  win.document.querySelector("ytmusic-player-queue-item[selected]").removeAttribute("selected");

  assert.deepStrictEqual(titulos(YTMPip.MetadataReader.read().upNext), []);
});

test("una fila sin titulo se filtra, y el corte va ANTES que el filtro", () => {
  /*
   * La fila sin titulo (un separador, o una fila a medio pintar por el
   * virtual scroll) consume su hueco: quedan cuatro y la sexta NO sube a
   * ocupar el quinto puesto. Es deliberado —cortar primero es lo que evita
   * recorrer la cola entera— y esta prueba esta para que dejar de ser
   * verdad no pase en silencio.
   */
  const { win, YTMPip } = entornoContenido("cola.html");
  const items = win.document.querySelectorAll("ytmusic-player-queue-item");
  // La cuarta del DOM es "Segunda Siguiente": se le arranca el titulo.
  items[3].querySelector(".song-title").remove();

  const upNext = YTMPip.MetadataReader.read().upNext;
  assert.deepStrictEqual(titulos(upNext), [
    "Primera Siguiente",
    "Tercera Siguiente",
    "Cuarta Siguiente",
    "Quinta Siguiente"
  ]);
});

test("sin cola en el DOM el estado trae lista vacia, no undefined", () => {
  // La ventana hace `Array.isArray` de todos modos, pero el contrato del
  // lector es "siempre un array": es lo que permite firmarlo en
  // content-script.js sin preguntar antes si existe.
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const upNext = YTMPip.MetadataReader.read().upNext;
  assert.ok(Array.isArray(upNext), "el contrato es 'siempre un array'");
  assert.strictEqual(upNext.length, 0);
});
