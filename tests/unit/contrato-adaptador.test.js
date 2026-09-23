/*
 * Pruebas del CONTRATO DEL ADAPTADOR (src/content/adapter-registry.js).
 *
 * LA PETICION, LITERAL: "podemos adaptar la extensión a youtube normal y a
 * spotify". Esta tanda es la cimentacion: antes de escribir el segundo
 * adaptador hay que nombrar la interfaz que el primero cumplia sin decirlo
 * —36 metodos— y obligar a cualquier adaptador futuro a declararla entera,
 * mas sus capacidades (que TIENE el sitio, no que devuelve el DOM ahora
 * mismo: en Spotify `audioGrafo: false` existira porque el DRM silencia el
 * audio al conectarlo a Web Audio, y eso no se descubre mirando el DOM).
 *
 * Lo que estas pruebas fijan, en orden de miedo:
 *
 *   - que la tanda NO cambio nada: el adaptador de YTM sigue siendo el
 *     mismo objeto de siempre, solo que ahora lo publica el registro;
 *   - que la lista del contrato no se quede atras en silencio cuando
 *     alguien añada un metodo nuevo al adaptador;
 *   - que la eleccion por hostname elige y que la red de seguridad
 *     (primer registrado) sostiene los hostnames que nadie declara;
 *   - que la validacion revienta NOMBRANDO lo que falta: un adaptador a
 *     medio escribir debe morir al cargar, no en el latido numero mil.
 *
 * El adaptador falso de las pruebas 3-6 se fabrica CLONANDO los metodos
 * del real a partir de la propia lista del contrato: asi el andamio no
 * mantiene una segunda lista que tambien pudiera quedarse atras.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoContenido } = require("../helpers/entorno.js");

/** Un adaptador que cumple el contrato entero, clonado del de verdad. */
function adaptadorFalso(YTMPip) {
  const falso = {
    schemaVersion: YTMPip.Adapter.schemaVersion,
    SELECTORS: {}
  };
  YTMPip.Adaptadores.METODOS_DEL_CONTRATO.forEach((metodo) => {
    falso[metodo] = YTMPip.Adapter[metodo].bind(YTMPip.Adapter);
  });
  return falso;
}

/** Las ocho capacidades, todas con el mismo valor. */
function capacidades(YTMPip, valor) {
  const caps = {};
  YTMPip.Adaptadores.CAPACIDADES_DEL_CONTRATO.forEach((cap) => {
    caps[cap] = valor;
  });
  return caps;
}

/** Una definicion valida completa, lista para sabotear. */
function definicionFalsa(YTMPip, id) {
  return {
    id,
    // El rotulo humano que exige validar() desde la tanda del fondo
    // Canvas (lo consume el boton «Volver a …» de la ventana).
    nombre: "Musica Falsa",
    /*
     * Un hostname INVENTADO a proposito: hasta la tanda 3 el falso
     * declaraba open.spotify.com, pero ese hostname ya tiene dueño de
     * verdad registrado antes que el (y el primero que coincide gana),
     * asi que el falso nunca volveria a ser elegido por hostname.
     */
    hostnames: ["musica.falsa.example"],
    capacidades: capacidades(YTMPip, false),
    adapter: adaptadorFalso(YTMPip)
  };
}

/* ==================================================================
 * 1. Sin cambio de comportamiento: el registro publica lo de siempre
 * ================================================================== */

test("el registro publica el adaptador de YTM identico al de siempre", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");

  const activo = YTMPip.Adaptadores.activo();
  assert.strictEqual(activo.id, "youtube-music");
  assert.strictEqual(
    YTMPip.Adapter,
    activo.adapter,
    "YTMPip.Adapter debe ser EL MISMO objeto registrado, no una copia"
  );

  // La prueba de fuego de que es el adaptador real y no un doble: lee.
  assert.strictEqual(YTMPip.Adapter.getTitleElement().textContent, "Bohemian Rhapsody");

  // YouTube Music lo tiene todo: es el sitio sobre el que se diseño cada
  // funcion. Las ocho en true, incluida audioGrafo (MSE sin DRM).
  YTMPip.Adaptadores.CAPACIDADES_DEL_CONTRATO.forEach((cap) => {
    assert.strictEqual(YTMPip.Capacidades[cap], true, "capacidad " + cap);
  });
});

/* ==================================================================
 * 2. El contrato no se queda corto
 * ================================================================== */

test("todo metodo publico del adaptador de YTM esta en la lista del contrato", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const lista = YTMPip.Adaptadores.METODOS_DEL_CONTRATO;

  /*
   * La direccion peligrosa. Que el adaptador implemente la lista ya lo
   * exige registrar(); lo que nadie exigiria sin esto es lo contrario:
   * que un metodo nuevo añadido al adaptador entre TAMBIEN en la lista.
   * Si no entra, el proximo adaptador podria omitirlo y firmar igual.
   */
  Object.keys(YTMPip.Adapter).forEach((clave) => {
    if (typeof YTMPip.Adapter[clave] !== "function") return; // schemaVersion, SELECTORS
    assert.ok(
      lista.indexOf(clave) !== -1,
      clave + "() existe en el adaptador pero no esta en METODOS_DEL_CONTRATO"
    );
  });

  // 36 contados al firmar + isPagePlaying (tanda 3: Spotify no tiene
  // medio en el DOM del que leer "esta sonando") +
  // getActiveLyricsLineIndex (letra sincronizada de Spotify: sin
  // tiempos, la linea que se canta la marca la propia pagina) +
  // getCanvasVideo (el bucle visual de Spotify que la ventana usa de
  // fondo via captureStream; sin DRM, medido) + el trio de escritura
  // en la pagina (seekPageTo, setPageVolume, getPageVolume: los
  // deslizadores de Spotify aceptan el setter nativo, medido con salto
  // y volumen audibles).
  assert.strictEqual(
    lista.length,
    42,
    "36 originales + isPagePlaying + getActiveLyricsLineIndex + getCanvasVideo + seekPageTo + setPageVolume + getPageVolume"
  );
});

/* ==================================================================
 * 3. La eleccion por hostname
 * ================================================================== */

test("un adaptador de otro sitio no destrona a YTM en music.youtube.com", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  const deAntes = YTMPip.Adapter;

  YTMPip.Adaptadores.registrar(definicionFalsa(YTMPip, "spotify-falso"));

  // El entorno vive en music.youtube.com (la URL del JSDOM): sigue YTM.
  assert.strictEqual(YTMPip.Adaptadores.activo().id, "youtube-music");
  assert.strictEqual(YTMPip.Adapter, deAntes, "el adaptador publicado no debe moverse");

  // Pero el hostname del otro sitio SI encuentra al recien llegado.
  assert.strictEqual(YTMPip.Adaptadores.elegir("musica.falsa.example").id, "spotify-falso");

  // Y el hostname REAL de Spotify tiene dueño desde la tanda 3: el
  // falso, registrado despues, no se lo puede quitar (primero gana).
  assert.strictEqual(YTMPip.Adaptadores.elegir("open.spotify.com").id, "spotify");
});

/* ==================================================================
 * 4. La red de seguridad
 * ================================================================== */

test("en un hostname que nadie declara gana el primero registrado", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");
  YTMPip.Adaptadores.registrar(definicionFalsa(YTMPip, "spotify-falso"));

  assert.strictEqual(
    YTMPip.Adaptadores.elegir("radio.desconocida.example").id,
    "youtube-music",
    "sin coincidencia, la red es el primero que firmo"
  );
});

/* ==================================================================
 * 5. La validacion delata al incompleto
 * ================================================================== */

test("un adaptador al que le falta un metodo muere nombrando el metodo", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");

  const sinMetodo = definicionFalsa(YTMPip, "spotify-falso");
  delete sinMetodo.adapter.getRepeatMode;
  assert.throws(() => YTMPip.Adaptadores.registrar(sinMetodo), /getRepeatMode/);

  const sinCapacidad = definicionFalsa(YTMPip, "spotify-falso");
  delete sinCapacidad.capacidades.cola;
  assert.throws(() => YTMPip.Adaptadores.registrar(sinCapacidad), /«cola»/);

  // Ninguno de los dos intentos fallidos debe haber quedado registrado.
  // Los TRES ids legitimos vienen de serie: el entorno carga los tres
  // adaptadores en el orden del manifest (YouTube normal desde la tanda
  // 2, Spotify desde la 3). Array.from cruza el reino: registradosIds()
  // devuelve un Array DE LA VENTANA jsdom, y deepStrictEqual tambien
  // compara prototipos.
  assert.deepStrictEqual(Array.from(YTMPip.Adaptadores.registradosIds()), ["youtube-music", "youtube", "spotify"]);
});

/* ==================================================================
 * 6. El error de tecleo muere al cargar
 * ================================================================== */

test("una capacidad inventada o un id repetido revientan con su nombre", () => {
  const { YTMPip } = entornoContenido("letras-disponibles.html");

  /*
   * «aletorio» es el error de tecleo tipico de «aleatorio»: sin esta
   * guarda, el adaptador declararia la capacidad buena en undefined y la
   * mala en un rincon que nadie lee, y las dos mentiras serian mudas.
   */
  const conTypo = definicionFalsa(YTMPip, "spotify-falso");
  conTypo.capacidades.aletorio = true;
  assert.throws(() => YTMPip.Adaptadores.registrar(conTypo), /aletorio/);

  const repetido = definicionFalsa(YTMPip, "youtube-music");
  assert.throws(() => YTMPip.Adaptadores.registrar(repetido), /duplicado/);
});
