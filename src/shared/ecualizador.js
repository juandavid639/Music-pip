/*
 * ECUALIZADOR: la parte que se puede pensar sin audio.
 *
 * Aqui NO hay ni un BiquadFilterNode ni un AudioContext. Todo lo de este
 * archivo es aritmetica sobre numeros: que significa lo que hay guardado,
 * cuantos decibelios pide cada banda, y cuanto hay que bajar el volumen de
 * entrada para que subir los graves no recorte. Montar el grafo es otra
 * cosa y vive donde vive el AudioContext (src/content/audio-spectrum.js,
 * que ya es el unico sitio que decide si hay conexion).
 *
 * ESTA SEPARACION NO ES ESTETICA. El grafo solo se puede probar en un
 * navegador de verdad, con una cancion sonando y una persona escuchando.
 * Lo de aqui se prueba con `node --test` y sin fingir nada, asi que las
 * decisiones que se OYEN —que frecuencias, cuanto sube cada preset, que
 * pasa cuando alguien pide +12 en todo— quedan del lado que se puede
 * verificar. Cuando algo suene mal, esa frontera dice de que lado mirar.
 *
 * Y vive en src/shared/ y no en src/content/ por un motivo concreto:
 * `normalizar` es la definicion de que es un ecualizador valido, y esa
 * definicion la necesitan tres sitios que no comparten proceso —settings.js
 * al leer storage, la pagina de opciones al pintar los mandos, y el grafo al
 * montarse—. Repetida en tres archivos no seria una regla, serian tres.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});
  const { EQUALIZER_BANDS, EQUALIZER_PRESETS, EQUALIZER_LIMITS, DEFAULT_SETTINGS } = YTMPip.CONSTANTS;

  const APAGADO = "off";
  const NUM_BANDAS = EQUALIZER_BANDS.length;

  /**
   * Una ganancia suelta, acotada a [GAIN_MIN, GAIN_MAX]. `null` si lo que
   * llega no es un numero.
   *
   * ACOTA en vez de rechazar porque un +20 guardado no es basura: es alguien
   * (o una version futura con mas rango) pidiendo "todo lo que puedas", y
   * darle el maximo se parece mucho mas a lo que queria que devolverle un
   * cero. Rechaza, en cambio, lo que ni siquiera es un numero, porque eso no
   * es una ganancia que se pasa: es otra cosa.
   *
   * El vacio se aparta a mano por lo mismo que en `unirBarras` de
   * settings.js: `Number("")` es 0, no NaN, asi que una casilla recien
   * borrada pasaria por "cero decibelios" —que es un valor legitimo y
   * silencioso— en vez de por "no he puesto nada".
   *
   * Pura.
   */
  function unaGanancia(valor) {
    const texto = typeof valor === "string" ? valor.trim() : valor;
    if (texto === "" || texto === null || texto === undefined) return null;
    const n = Number(texto);
    if (!Number.isFinite(n)) return null;
    return Math.min(EQUALIZER_LIMITS.GAIN_MAX, Math.max(EQUALIZER_LIMITS.GAIN_MIN, Math.round(n)));
  }

  /**
   * Una lista de ganancias a mano: exactamente una por banda, o `null`.
   *
   * EXIGE el numero exacto de bandas y no rellena las que falten. Rellenar
   * con ceros convertiria "2,4" —que es un guardado de una version con dos
   * bandas, o un texto corrupto— en un ecualizador de cinco bandas que nadie
   * pidio, y sonaria distinto de lo que el usuario dejo puesto sin que nada
   * avisara. Cuando el numero de bandas no cuadra, lo honesto es decir "esto
   * no es una lista de ganancias" y dejar que quien pregunte caiga en el
   * valor por defecto.
   *
   * Una sola ganancia mala tumba la lista entera, igual que en
   * `normalizarPaleta`: quedarse con cuatro de cinco daria un sonido
   * distinto del elegido, en silencio.
   *
   * Pura.
   */
  function normalizarGanancias(valor) {
    if (Array.isArray(valor)) return desdeLista(valor);
    if (typeof valor !== "string") return null;
    // Sin coma no es una lista. Se mira antes de partir porque "graves" sin
    // comas tiene que poder llegar entero a `normalizar` y reconocerse como
    // nombre de preset, no como una lista de un elemento que no vale.
    if (valor.indexOf(",") === -1) return null;
    return desdeLista(valor.split(","));
  }

  function desdeLista(trozos) {
    if (trozos.length !== NUM_BANDAS) return null;
    const ganancias = [];
    for (let i = 0; i < trozos.length; i++) {
      const g = unaGanancia(trozos[i]);
      if (g === null) return null;
      ganancias.push(g);
    }
    return ganancias;
  }

  /**
   * Lo que hay guardado, en su forma canonica: `"off"`, el nombre de un
   * preset, o las ganancias separadas por comas.
   *
   * Se guarda TEXTO y no un objeto por lo mismo que `spectrumColor`: la
   * forma del texto dice el modo, asi que no puede haber un modo guardado
   * que no cuadre con las ganancias guardadas. No hay dos campos que
   * contradecirse porque no hay dos campos.
   *
   * El orden de las tres preguntas importa. `"off"` primero porque es el
   * valor por defecto y el unico que significa "ni siquiera montes el
   * grafo". Los presets antes que las ganancias porque un nombre de preset
   * no lleva comas y no se confundiria, pero preguntarlo despues obligaria a
   * recordar por que no se confunde.
   *
   * Un preset se guarda POR SU NOMBRE y no por sus cinco numeros. Si algun
   * dia se afina "graves", quien lo tenia elegido oye la version afinada, que
   * es lo que espera quien elige un preset y no unos numeros. Quien queria
   * esos numeros exactos los tiene a mano, y entonces se guardan como lista.
   *
   * Pura.
   */
  function normalizar(valor) {
    if (valor === APAGADO) return APAGADO;
    if (typeof valor === "string" && Object.prototype.hasOwnProperty.call(EQUALIZER_PRESETS, valor)) {
      return valor;
    }
    const ganancias = normalizarGanancias(valor);
    if (ganancias) return ganancias.join(",");
    return DEFAULT_SETTINGS.equalizer;
  }

  /**
   * Si el ecualizador esta apagado, o sea si hay que dejar el audio en paz.
   *
   * Existe como funcion propia y no como `valor === "off"` suelto por todo
   * el codigo porque de esta pregunta depende CRUZAR LA PUERTA de un solo
   * sentido. Un sitio que se equivoque al escribir la comparacion mete el
   * audio en el grafo de alguien que no lo pidio, y eso no se deshace.
   *
   * Pura.
   */
  function estaApagado(valor) {
    return normalizar(valor) === APAGADO;
  }

  /**
   * Los decibelios que pide cada banda, en el orden de EQUALIZER_BANDS.
   *
   * Apagado devuelve CINCO CEROS y no `null`. Podria parecer que apagado no
   * tiene ganancias que devolver, pero quien pinta los deslizadores tiene que
   * poder enseñarlos en algun sitio con el ecualizador apagado, y "todos en
   * el centro" es la respuesta correcta. Quien necesita saber si hay que
   * montar el grafo pregunta `estaApagado`, que es otra pregunta.
   *
   * Pura. Devuelve un array nuevo cada vez: los presets de CONSTANTS son
   * compartidos y quien reciba esto va a querer moverle un numero.
   */
  function ganancias(valor) {
    const limpio = normalizar(valor);
    if (limpio === APAGADO) return EQUALIZER_PRESETS.plano.slice();
    const preset = EQUALIZER_PRESETS[limpio];
    if (preset) return preset.slice();
    return normalizarGanancias(limpio) || EQUALIZER_PRESETS.plano.slice();
  }

  /**
   * El nombre del preset elegido, o `null` si las ganancias son a mano.
   *
   * `null` y no `"custom"`: quien pregunta esto quiere marcar un boton de la
   * lista de presets, y "ninguno" es un estado legitimo de esa lista, no un
   * preset mas que hubiera que añadir a EQUALIZER_PRESETS.
   *
   * Apagado tampoco es un preset. Es la ausencia de todo esto.
   *
   * Pura.
   */
  function presetDe(valor) {
    const limpio = normalizar(valor);
    if (limpio === APAGADO) return null;
    return EQUALIZER_PRESETS[limpio] ? limpio : null;
  }

  /**
   * Cuanto sube de verdad el pico, contando el solape entre bandas vecinas.
   *
   * El pico del conjunto lo pone LA BANDA MAS ALTA, no la suma de todas: cada
   * una manda en su tramo del espectro y no coinciden en la misma frecuencia.
   * Sumarlas seria correcto solo si coincidieran, y daria un numero enorme en
   * cuanto alguien subiera tres bandas.
   *
   * Pero las campanas SI se rozan por los bordes (Q = 1, ver constants.js),
   * asi que la banda de al lado aporta algo en el punto donde se cruzan. Ese
   * algo es lo unico que se suma, y con dos topes:
   *
   *   - solo cuenta LA VECINA, no cualquier otra banda subida. Las que estan
   *     a dos posiciones —60 Hz y 1 kHz, por ejemplo— quedan a mas de cuatro
   *     octavas y ahi una campana de Q = 1 ya no llega;
   *   - nunca mas de lo que la vecina vale, ni mas de HEADROOM_DB.
   *
   * ASI ES COMO ESTABA MAL. Antes se sumaba HEADROOM_DB siempre, hubiera
   * vecina subida o no. Con una sola banda arriba no hay nada que se solape
   * con nada y se cobraban tres decibelios de todas formas.
   *
   * Pura. Devuelve un numero >= 0, en decibelios.
   */
  function subidaDelPico(db) {
    const alta = Math.max(0, ...db);
    if (alta === 0) return 0;
    const i = db.indexOf(alta);
    const vecinas = [];
    if (i > 0) vecinas.push(db[i - 1]);
    if (i < db.length - 1) vecinas.push(db[i + 1]);
    const aporta = Math.min(Math.max(0, ...vecinas), EQUALIZER_LIMITS.HEADROOM_DB);
    return alta + aporta;
  }

  /**
   * Cuantos decibelios por encima del umbral puede tragarse el limitador sin
   * que a la salida se le escape nada por encima del tope.
   *
   * Sale de los dos numeros del limitador y de nada mas. Un pico que llega a
   * P decibelios sale del limitador a `umbral + (P - umbral) / ratio`, asi que
   * para que eso no pase de cero: `P <= umbral * (1 - ratio)`.
   *
   * OJO CON QUE PREGUNTA CONTESTA, porque durante un tiempo se uso para
   * contestar otra. Esta dice cuanto cabe SIN QUE SE ESCAPE NADA POR LA
   * SALIDA. No dice cuanto cabe sin que el limitador SE PONGA A TRABAJAR, que
   * es lo que decide como suena, y que no depende de estos dos numeros sino
   * de la holgura que traiga la cancion. Con el umbral en −1 esta funcion
   * devolvia 19 dB —mas de los 15 que se pueden pedir con los mandos— y de
   * ahi salia que la preamplificacion no hacia falta nunca. Medido sobre
   * musica real, la holgura era CERO y el limitador estaba trabajando el
   * 100 % del tiempo (ver tools/diagnostico-limitador.js y el comentario del
   * UMBRAL_DB en constants.js).
   *
   * Con el umbral a cero las dos preguntas vuelven a coincidir: el margen es
   * `0 * (1 - 20)` = 0 y no se fia nada al limitador que no sea un pico de
   * verdad. Sigue sin estar escrito como un cero a pelo porque el dia que
   * alguien vuelva a bajar el umbral, la cuenta tiene que cambiar sola.
   *
   * Pura.
   */
  function margenDelLimitador() {
    const { UMBRAL_DB, RATIO } = EQUALIZER_LIMITS.LIMITADOR;
    /*
     * El `+ 0` NO es de adorno y borrarlo rompe pruebas de forma
     * desconcertante. Con el umbral a cero la cuenta es `0 * (1 - 20)`, que en
     * coma flotante da CERO NEGATIVO, y `-0` no es `0` para `Object.is`, que
     * es lo que usa `assert.strictEqual`. Sumar cero lo devuelve a `+0` y de
     * paso evita que un `-0` acabe pintado en la pagina de opciones.
     */
    return UMBRAL_DB * (1 - RATIO) + 0;
  }

  /**
   * Cuantos decibelios hay que BAJAR la señal antes de los filtros.
   *
   * ESTO ES LO MENOS OBVIO DE TODO EL ARCHIVO, asi que va despacio.
   *
   * La musica de YouTube Music viene masterizada casi al tope de la escala:
   * los picos rozan el maximo que se puede representar. Un filtro con +8 dB
   * en los graves multiplica esos picos por 2,5, y lo que se sale del maximo
   * no suena mas fuerte: se recorta, y recortar suena a distorsion sucia.
   *
   * DURANTE UN TIEMPO ESTA FUNCION DEVOLVIO −(maximo + 3) Y ESO ESTABA MAL,
   * y merece quedar escrito porque parecia de manual. Bajar la entrada tanto
   * como se va a subir es la defensa clasica y funciona; el problema es que se
   * paga entera y por adelantado. Haciendo la cuenta, la banda mas subida
   * acababa en `maximo − (maximo + 3)`, o sea en −3 dB EXACTOS, siempre, para
   * cualquier ganancia. Los dos «maximo» se cancelan. Dicho de otra forma:
   * el ecualizador no podia subir nada, solo bajar todo lo demas, y «subir los
   * graves» sonaba mas flojo que tenerlo apagado. Lo encontro el usuario, no
   * una prueba, y lo dijo exactamente asi: «apagado suena mas fuerte que con
   * esta configuracion».
   *
   * El comentario que lo justificaba decia que acusticamente da igual «porque
   * lo que se oye es la diferencia entre bandas». Es verdad a medias: solo da
   * igual si luego subes el volumen para compensar, y eso no lo hacia nadie.
   *
   * DESPUES SE PROBO A DEJARLE TODO EL TRABAJO AL LIMITADOR, y tambien
   * estaba mal, aunque hizo falta medirlo para verlo. Con el umbral a −1 esta
   * funcion devolvia cero siempre y la unica defensa era el limitador; sobre
   * el audio real eso no salio «una red que salta cuando hace falta» sino un
   * limitador trabajando el 100 % del tiempo y comiendose 3 dB seguidos, o
   * sea la misma atenuacion de antes pero dinamica, invisible y con bombeo.
   * No se quito la atenuacion: se escondio. Y el usuario lo volvio a notar
   * primero: «no diria que suena mas fuerte, pero talvez si mas profundo el
   * bajo». El bajo si, el volumen no.
   *
   * ASI QUE EL REPARTO DE AHORA es: esta funcion baja la entrada lo que de
   * verdad sube el pico —con el solape ya contado, sin peaje fijo— y el
   * limitador se queda para lo que se salga de escala pese a todo, que es
   * poco. Cada uno hace su trabajo y ninguno hace el del otro.
   *
   * La cuenta no cambio de forma: sigue siendo «lo que sube» menos «lo que el
   * limitador absorbe». Lo que cambio es que el umbral se puso a cero, y con
   * el a cero lo que absorbe es cero. Ver constants.js.
   *
   * Y CONVIENE SABER LO QUE ESTO CUESTA, porque es real y se oye: si «graves»
   * sube 11 dB el pico, todo lo demas baja 11 dB. Un ecualizador honesto sobre
   * material sin holgura no puede hacer otra cosa —anadir graves a algo que ya
   * toca el techo es, forzosamente, quitar el resto—, pero significa que un
   * preset agresivo suena mas flojo, y eso hay que DECIRLO en la interfaz en
   * vez de dejar que se descubra oyendo.
   *
   * Y solo se compensa lo que SUBE. Un ecualizador que solo baja bandas no
   * puede recortar nada, y bajarle ademas el volumen de entrada seria
   * castigar a quien uso "voz" o "nocturno" con una musica mas floja sin
   * ninguna razon.
   *
   * Devuelve un numero <= 0, en decibelios. Cero significa "no hace falta
   * tocar el volumen".
   *
   * Pura.
   */
  function preamplificacion(valor) {
    const sobra = subidaDelPico(ganancias(valor)) - margenDelLimitador();
    return sobra > 0 ? -sobra : 0;
  }

  /**
   * Un factor de volumen lineal a partir de unos decibelios.
   *
   * Existe porque `GainNode.gain` NO se mide en decibelios: se mide en
   * "cuanto se multiplica la onda". Los decibelios son logaritmicos y esa
   * conversion es la definicion misma de la unidad. Escribirla suelta en el
   * sitio donde se monta el grafo la dejaria sin prueba y a un signo de
   * distancia de subir el volumen cuando queria bajarlo.
   *
   * Pura.
   */
  function factorDe(db) {
    return Math.pow(10, db / 20);
  }

  /**
   * Todo lo que hace falta para montar el grafo, ya calculado: el factor de
   * entrada y una linea por banda con su tipo, su frecuencia, su Q y sus
   * decibelios.
   *
   * Se devuelve MASTICADO —y no las ganancias sueltas— para que el sitio que
   * toca los nodos de audio no tenga que decidir nada. Ahi cada decision es
   * una decision tomada delante de una puerta que no se puede cruzar dos
   * veces, y ademas es el unico codigo del ecualizador que no se puede
   * probar sin un navegador. Cuanto menos piense, mejor.
   *
   * `null` si esta apagado: no hay filtros que montar, y devolver una lista
   * de cinco filtros a cero invitaria a montarlos igual, o sea a cruzar la
   * puerta para no hacer nada.
   *
   * Pura.
   */
  function plan(valor) {
    if (estaApagado(valor)) return null;
    const db = ganancias(valor);
    const lim = EQUALIZER_LIMITS.LIMITADOR;
    return {
      entrada: factorDe(preamplificacion(valor)),
      /*
       * Los ajustes del limitador viajan DENTRO del plan, ya despiezados, en
       * vez de que audio-grafo.js lea EQUALIZER_LIMITS por su cuenta. Es la
       * misma regla que el resto del plan: el archivo que toca los nodos de
       * audio no decide nada, porque es el unico que no se puede probar con
       * `node --test`. Aqui se lee la constante una vez y con prueba; alli se
       * vuelca y ya esta.
       *
       * Los nombres son los de esta casa (`umbralDb`, `relajacionS`) y no los
       * de Web Audio (`threshold`, `release`): la traduccion se hace en un solo
       * sitio, que es donde se montan los nodos.
       */
      limitador: {
        umbralDb: lim.UMBRAL_DB,
        rodillaDb: lim.RODILLA_DB,
        ratio: lim.RATIO,
        ataqueS: lim.ATAQUE_S,
        relajacionS: lim.RELAJACION_S
      },
      filtros: EQUALIZER_BANDS.map((banda, i) => ({
        id: banda.id,
        tipo: banda.tipo,
        hz: banda.hz,
        // Los shelf no llevan Q (ver constants.js): se manda `null` y quien
        // monte el nodo deja el que trae de fabrica.
        q: typeof banda.q === "number" ? banda.q : null,
        db: db[i]
      }))
    };
  }

  YTMPip.Ecualizador = {
    APAGADO,
    normalizar,
    normalizarGanancias,
    estaApagado,
    ganancias,
    presetDe,
    preamplificacion,
    subidaDelPico,
    margenDelLimitador,
    factorDe,
    plan
  };
})(typeof self !== "undefined" ? self : globalThis);
