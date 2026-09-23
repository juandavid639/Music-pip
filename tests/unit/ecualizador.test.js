/*
 * Pruebas del NUCLEO del ecualizador (src/shared/ecualizador.js): la parte
 * que decide que significa lo guardado, cuantos decibelios pide cada banda y
 * cuanto hay que bajar la entrada para que subir graves no recorte.
 *
 * LO QUE ESTAS PRUEBAS NO DICEN, y conviene que quede escrito antes de que
 * alguien las lea como una garantia de que el ecualizador funciona: no dicen
 * que se OIGA nada. Aqui no hay AudioContext ni BiquadFilterNode, y no puede
 * haberlos: jsdom no tiene Web Audio. Que un lowshelf a 60 Hz con +8 dB
 * levante de verdad los graves de una cancion es una medida que solo se hace
 * en el navegador, y ya se hizo una vez con tools/diagnostico-ecualizador.js
 * sobre music.youtube.com (+12,0 dB medidos, 8,5 dB de separacion frente a
 * la banda de control). Lo que se clava aqui es la ARITMETICA que alimenta
 * esos filtros.
 *
 * Hay una prueba que importa mas que todas las demas juntas y es la primera:
 * que el valor por defecto sea "off". Ecualizar cruza una puerta de un solo
 * sentido (createMediaElementSource) y encenderlo por defecto dejaria el
 * audio de cualquiera dentro de un grafo que no pidio.
 */
const test = require("node:test");
const assert = require("node:assert");
const { crearEntorno, cargar, plano } = require("../helpers/entorno.js");

function eq() {
  const { win } = crearEntorno(undefined);
  cargar(win, "src/shared/constants.js", "src/shared/ecualizador.js");
  return {
    Ecualizador: win.YTMPip.Ecualizador,
    CONSTANTS: win.YTMPip.CONSTANTS
  };
}

/* ==================================================================
 * 0. La puerta de un solo sentido
 * ================================================================== */

test("apagado por defecto: nada cruza la puerta sin que alguien lo pida", () => {
  const { Ecualizador, CONSTANTS } = eq();
  assert.strictEqual(CONSTANTS.DEFAULT_SETTINGS.equalizer, Ecualizador.APAGADO);
  assert.strictEqual(Ecualizador.estaApagado(CONSTANTS.DEFAULT_SETTINGS.equalizer), true);
});

test("lo que no se entiende se queda APAGADO, no plano", () => {
  const { Ecualizador } = eq();
  /*
   * La diferencia entre estas dos respuestas es la diferencia entre tocar el
   * audio y no tocarlo. Un storage corrupto, una version futura que guarde
   * otro formato o un valor a medio escribir tienen que caer del lado que no
   * monta nada: "plano" suena igual que apagado pero YA ha cruzado la
   * puerta, y de ahi no se vuelve sin recargar la pestaña.
   */
  for (const basura of [null, undefined, "", "  ", 42, {}, [], "graves,voz", "off!", "PLANO"]) {
    assert.strictEqual(
      Ecualizador.estaApagado(basura),
      true,
      `${JSON.stringify(basura)} deberia dejar el ecualizador apagado`
    );
  }
});

/* ==================================================================
 * 1. Que significa lo guardado
 * ================================================================== */

test("normalizar: los presets se guardan por su NOMBRE y sobreviven", () => {
  const { Ecualizador, CONSTANTS } = eq();
  for (const nombre of Object.keys(CONSTANTS.EQUALIZER_PRESETS)) {
    assert.strictEqual(Ecualizador.normalizar(nombre), nombre);
    assert.strictEqual(Ecualizador.presetDe(nombre), nombre);
  }
});

test("normalizar: una lista de ganancias va y vuelve sin moverse un decibelio", () => {
  const { Ecualizador } = eq();
  assert.strictEqual(Ecualizador.normalizar("-4,0,2,0,6"), "-4,0,2,0,6");
  // Con espacios alrededor, que es lo que sale de escribirlo a mano.
  assert.strictEqual(Ecualizador.normalizar(" -4 , 0 , 2 , 0 , 6 "), "-4,0,2,0,6");
  // Y desde un array, que es lo que va a mandar la interfaz.
  assert.strictEqual(Ecualizador.normalizar([-4, 0, 2, 0, 6]), "-4,0,2,0,6");
});

test("normalizar: las ganancias se ACOTAN, no se rechazan", () => {
  const { Ecualizador, CONSTANTS } = eq();
  const { GAIN_MIN, GAIN_MAX } = CONSTANTS.EQUALIZER_LIMITS;
  /*
   * Acotar y no rechazar: un +99 guardado no es basura, es alguien pidiendo
   * "todo lo que puedas", y el maximo se parece muchisimo mas a lo que
   * queria que un cero.
   */
  assert.deepStrictEqual(plano(Ecualizador.ganancias("99,-99,0,0,0")), [GAIN_MAX, GAIN_MIN, 0, 0, 0]);
  // Los decimales se redondean en vez de tumbar la lista, por lo mismo que
  // en `entero` de settings.js: un 2,4 es una tecla, no un ataque.
  assert.deepStrictEqual(plano(Ecualizador.ganancias("2.4,0,0,0,-1.6")), [2, 0, 0, 0, -2]);
});

test("normalizar: el numero de bandas tiene que cuadrar EXACTAMENTE", () => {
  const { Ecualizador, CONSTANTS } = eq();
  const n = CONSTANTS.EQUALIZER_BANDS.length;
  const cortas = new Array(n - 1).fill(0).join(",");
  const largas = new Array(n + 1).fill(0).join(",");
  /*
   * No se rellena con ceros ni se recorta. Una lista de otro tamaño es un
   * guardado de otra version o un texto corrupto, y completarlo daria un
   * ecualizador de cinco bandas que nadie eligio, sonando distinto de lo que
   * el usuario dejo puesto, sin que nada avisara.
   */
  assert.strictEqual(Ecualizador.normalizarGanancias(cortas), null);
  assert.strictEqual(Ecualizador.normalizarGanancias(largas), null);
  assert.strictEqual(Ecualizador.estaApagado(cortas), true);
});

test("normalizar: una sola ganancia mala tumba la lista entera", () => {
  const { Ecualizador } = eq();
  /*
   * Quedarse con las cuatro buenas daria un sonido distinto del elegido en
   * silencio, que es peor que volver al valor por defecto. Es la misma
   * decision que en `normalizarPaleta`.
   */
  assert.strictEqual(Ecualizador.normalizarGanancias("2,0,hola,0,0"), null);
  assert.strictEqual(Ecualizador.normalizarGanancias("2,0,,0,0"), null);
});

test("presetDe: unas ganancias a mano no son ningun preset", () => {
  const { Ecualizador } = eq();
  assert.strictEqual(Ecualizador.presetDe("-4,0,2,0,6"), null);
  // Ni siquiera cuando coinciden numero a numero con uno: lo que se eligio
  // fueron los numeros, y `null` es lo que hace que la lista de presets
  // aparezca sin ninguno marcado.
  assert.strictEqual(Ecualizador.presetDe("0,0,0,0,0"), null);
  assert.strictEqual(Ecualizador.presetDe(Ecualizador.APAGADO), null);
});

/* ==================================================================
 * 2. Las ganancias
 * ================================================================== */

test("ganancias: siempre una por banda, tambien apagado", () => {
  const { Ecualizador, CONSTANTS } = eq();
  const n = CONSTANTS.EQUALIZER_BANDS.length;
  for (const valor of [Ecualizador.APAGADO, "graves", "-4,0,2,0,6", "basura"]) {
    assert.strictEqual(Ecualizador.ganancias(valor).length, n, `con ${valor}`);
  }
  // Apagado son ceros y no `null`: quien pinta los deslizadores tiene que
  // poder ponerlos en algun sitio, y el centro es la respuesta correcta.
  assert.deepStrictEqual(plano(Ecualizador.ganancias(Ecualizador.APAGADO)), new Array(n).fill(0));
});

test("ganancias: devuelve una COPIA, no el preset compartido", () => {
  const { Ecualizador, CONSTANTS } = eq();
  const antes = plano(CONSTANTS.EQUALIZER_PRESETS.graves);
  const mias = Ecualizador.ganancias("graves");
  mias[0] = -99;
  assert.deepStrictEqual(
    plano(CONSTANTS.EQUALIZER_PRESETS.graves),
    antes,
    "mover la copia ha estropeado el preset de todo el mundo"
  );
});

/* ==================================================================
 * 3. La preamplificacion: que subir graves no recorte
 * ================================================================== */

test("preamplificacion: si nada sube, no se toca el volumen", () => {
  const { Ecualizador } = eq();
  assert.strictEqual(Ecualizador.preamplificacion("plano"), 0);
  assert.strictEqual(Ecualizador.preamplificacion(Ecualizador.APAGADO), 0);
  /*
   * Un ecualizador que SOLO baja bandas no puede recortar nada. Bajarle
   * ademas la entrada seria dejar la musica mas floja sin ninguna razon, y
   * es justo lo que le pasaria a quien use "voz" o "nocturno".
   */
  assert.strictEqual(Ecualizador.preamplificacion("-6,-3,0,-2,0"), 0);
});

test("el pico lo pone la banda MAS ALTA, no la suma de todas", () => {
  const { Ecualizador } = eq();
  const pico = (v) => Ecualizador.subidaDelPico(Ecualizador.ganancias(v));

  /*
   * ESTA ES LA PRUEBA QUE IMPORTA. Cinco bandas a +8 NO tienen el pico de la
   * suma (40 dB): cada una manda en su tramo del espectro y no se apilan.
   * Tomar la suma dejaria la musica practicamente inaudible en cuanto alguien
   * subiera varias.
   *
   * Con las cinco arriba si hay vecina, asi que se cobra el solape entero.
   */
  assert.strictEqual(pico("8,8,8,8,8"), 8 + 3);
  // Y con mezcla de subidas y bajadas manda la subida mas alta.
  assert.strictEqual(pico("-12,3,0,7,-4"), 7);
});

test("EL SOLAPE SE COBRA SOLO SI HAY VECINA SUBIDA", () => {
  /*
   * ESTA PRUEBA ES EL FALLO QUE ENCONTRO EL USUARIO, en seco.
   *
   * El margen existe porque las campanas contiguas se rozan por los bordes.
   * Se estaba sumando SIEMPRE, hubiera vecina o no, y con una sola banda
   * arriba no hay absolutamente nada con lo que solaparse.
   */
  const { Ecualizador, CONSTANTS } = eq();
  const pico = (v) => Ecualizador.subidaDelPico(Ecualizador.ganancias(v));
  const tope = CONSTANTS.EQUALIZER_LIMITS.HEADROOM_DB;

  // Una sola banda subida: nadie al lado, no se paga nada.
  assert.strictEqual(pico("12,0,0,0,0"), 12);
  assert.strictEqual(pico("0,0,8,0,0"), 8);

  // Con la vecina subida se paga, pero solo lo que la vecina vale...
  assert.strictEqual(pico("12,1,0,0,0"), 13);
  // ...y nunca mas que el tope.
  assert.strictEqual(pico("12,9,0,0,0"), 12 + tope);

  /*
   * A DOS POSICIONES NO CUENTA. 60 Hz y 1 kHz estan a mas de cuatro octavas
   * y una campana de Q = 1 ya no llega. Si esto empieza a fallar es que
   * alguien ha metido bandas mas juntas en EQUALIZER_BANDS, y entonces hay
   * que rehacer la cuenta, no relajar la prueba.
   */
  assert.strictEqual(pico("12,0,9,0,0"), 12);
});

test("LA BANDA QUE MAS SUBES ACABA EN EL TECHO: NI RECORTADA NI REGALADA", () => {
  /*
   * ESTA PRUEBA HA TENIDO TRES VERSIONES Y LAS TRES CUENTAN LA MISMA HISTORIA
   * DESDE UN SITIO DISTINTO. Merece la pena porque la respuesta correcta se
   * parece muchisimo a la incorrecta y solo se distinguen por un detalle.
   *
   *   1. La preamplificacion era `-(maximo + 3)`, o sea que la banda mas alta
   *      acababa en `maximo - (maximo + 3)` = −3 dB EXACTOS para cualquier
   *      ganancia: los dos «maximo» se cancelaban. El usuario lo dijo asi:
   *      «apagado suena mas fuerte que con esta configuracion».
   *
   *   2. Se quito el peaje entero y se le dejo el trabajo al limitador. La
   *      banda mas alta acababa entonces en `maximo`, sobre el papel. Sobre
   *      musica real no: el limitador se lo comia, trabajando el 100 % del
   *      tiempo (tools/diagnostico-limitador.js). Sonaba a lo mismo de antes,
   *      pero ahora sin que se viera en ningun numero.
   *
   *   3. Ahora acaba en CERO, o sea exactamente donde estaba con el
   *      ecualizador apagado.
   *
   * Y AQUI ESTA EL DETALLE, porque «siempre en el mismo sitio» era justo la
   * descripcion del fallo (1) y ahora es la descripcion del acierto. La
   * diferencia no es que el numero sea constante: es CUAL es.
   *
   *   - cero es el techo, o sea lo mas alto que puede acabar sin salirse;
   *   - −3 era tres decibelios por debajo del techo, tirados por nada.
   *
   * Que sea constante es la consecuencia inevitable de que la musica llegue
   * sin holgura: no se puede acabar por encima del techo, asi que lo unico
   * que se puede hacer bien es acabar clavado en el.
   */
  const { Ecualizador } = eq();
  const dondeAcabaLaMasAlta = (subida) => {
    const valor = subida + ",0,0,0,0";
    return subida + Ecualizador.preamplificacion(valor);
  };

  const finales = [1, 3, 6, 8, 12].map(dondeAcabaLaMasAlta);
  assert.deepStrictEqual(finales, [0, 0, 0, 0, 0], "la banda mas alta tiene que acabar en el techo");

  // Y lo que separa esto del fallo viejo, dicho como comparacion y no como fe.
  const conElPeajeViejo = 8 - (8 + 3);
  assert.ok(
    dondeAcabaLaMasAlta(8) > conElPeajeViejo,
    "se estan volviendo a tirar decibelios por el peaje fijo"
  );

  /*
   * Lo que el usuario compra al mover un deslizador no es volumen: es
   * SEPARACION entre bandas. Esa si tiene que valer lo que pidio, y es lo
   * unico que la preamplificacion no puede estropear porque se la resta a
   * todas por igual.
   */
  const separacion = (subida) => {
    const p = Ecualizador.preamplificacion(subida + ",0,0,0,0");
    return subida + p - (0 + p);
  };
  assert.deepStrictEqual([1, 3, 6, 8, 12].map(separacion), [1, 3, 6, 8, 12]);
});

test("preamplificacion: lo que cuesta cada subida, y de donde sale ese numero", () => {
  /*
   * LA CUENTA, para que se pueda rehacer sin creerse nada:
   *
   *   - un pico que llega a P sale del limitador a `umbral + (P-umbral)/ratio`;
   *   - para que eso no pase de cero hace falta `P <= umbral * (1 - ratio)`;
   *   - con el umbral en CERO eso da cero: el limitador no absorbe NADA por
   *     adelantado, y por tanto la entrada tiene que pagar la subida entera.
   *
   * ESO ES A PROPOSITO Y COSTO UNA MEDICION. Con el umbral en −1 esta cuenta
   * daba 19 dB de margen —mas de los 15 que se pueden pedir con los mandos—
   * y de ahi salia que la preamplificacion no hiciera falta nunca. Sobre
   * musica real la holgura no era de 19 dB sino de cero: el limitador estaba
   * trabajando el 100 % del tiempo, incluso con las cinco bandas a cero. Ver
   * el comentario de UMBRAL_DB en constants.js.
   *
   * SI ESTA PRUEBA SE PONE ROJA no hay que arreglarla: hay que mirar si el
   * cambio de constantes que la ha roto era intencionado.
   */
  const { Ecualizador, CONSTANTS } = eq();
  const { LIMITADOR } = CONSTANTS.EQUALIZER_LIMITS;

  /*
   * El margen se comprueba REHACIENDO LA CUENTA, no repitiendo la formula:
   * se pasa el margen por la curva del limitador y tiene que salir clavado en
   * cero. Un margen mas grande se escaparia por arriba; uno mas pequeño seria
   * preamplificar de mas. Sin esta linea, poner el margen en infinito —o sea
   * "el limitador lo aguanta todo"— pasaba desapercibido.
   */
  const alaSalida = (pico) => LIMITADOR.UMBRAL_DB + (pico - LIMITADOR.UMBRAL_DB) / LIMITADOR.RATIO;
  assert.strictEqual(alaSalida(Ecualizador.margenDelLimitador()), 0);
  assert.strictEqual(
    Ecualizador.margenDelLimitador(),
    0,
    "al limitador no se le fia nada por adelantado: es red, no volumen"
  );

  /*
   * Y entonces la preamplificacion es, exactamente, menos la subida del pico.
   * Se comprueba con los presets de verdad —que son los que la gente elige—
   * y contra `subidaDelPico`, que ya tiene su propia bateria de pruebas.
   */
  for (const preset of ["plano", "graves", "voz", "nocturno"]) {
    const pico = Ecualizador.subidaDelPico(Ecualizador.ganancias(preset));
    /*
     * Se dice como "una cancela a la otra" y no como `preamp === -pico`
     * porque con "plano" el pico es 0 y `-0` no es `0` para `Object.is`, que
     * es lo que usa strictEqual. Sumarlas dice la misma propiedad —que lo que
     * sube el pico es exactamente lo que baja la entrada— y ademas la dice
     * mejor: eso es lo que significa que acabe en el techo.
     */
    assert.strictEqual(
      Ecualizador.preamplificacion(preset) + pico,
      0,
      `en ${preset} la entrada no cancela lo que sube el pico`
    );
  }

  /*
   * Y los numeros a pelo, para que se vea el precio sin tener que derivarlo.
   *
   * "graves" costo -11, luego -7 y ahora -4, y las tres veces PORQUE CAMBIO
   * EL PRESET, no porque cambiara la cuenta. El ultimo, [0,4,-6,-2,1], lo
   * encontro el usuario a mano y es el mas barato de los tres que tocan algo
   * por un motivo que merece estar en una prueba: NO SUBE LOS GRAVES. Los
   * hace sonar bajando lo que competia con ellos, y bajar es gratis —
   * `subidaDelPico` solo mira lo que sube—. El pico lo pone el +4 de 250 Hz,
   * que ademas ya no tiene vecina subida y por eso tampoco paga solape.
   */
  assert.strictEqual(Ecualizador.preamplificacion("plano"), 0);
  assert.strictEqual(Ecualizador.preamplificacion("graves"), -4);
  assert.strictEqual(Ecualizador.preamplificacion("voz"), -7);
  assert.strictEqual(Ecualizador.preamplificacion("nocturno"), -3);
  assert.strictEqual(Ecualizador.preamplificacion("12,12,12,12,12"), -15);

  // Bajar bandas no cuesta nada: un ecualizador que solo quita no puede
  // recortar, y cobrarle seria castigar a quien uso "voz" o "nocturno".
  assert.strictEqual(Ecualizador.preamplificacion("-12,-12,-12,-12,-12"), 0);
});

test("SI ALGUIEN LE VUELVE A FIAR TRABAJO AL LIMITADOR, LA ENTRADA SE APARTA", () => {
  /*
   * ESTA PRUEBA MIRA EN LA DIRECCION CONTRARIA A LA QUE MIRABA, y el cambio
   * de direccion es en si el resultado de la medicion.
   *
   * Antes la preamplificacion valia cero en todos los ajustes que se podian
   * pedir con los mandos, asi que lo que ninguna prueba alcanzaba era la
   * DEFENSA: `entrada: 1` a pelo y darle la vuelta al signo daban el mismo
   * resultado en todas partes, y dos mutaciones sobrevivian por eso. Habia
   * que estropear el limitador para llegar a ella.
   *
   * Con el umbral en cero es al reves: la defensa esta viva en cuanto subes
   * una banda —cualquier preset la despierta— y lo inalcanzable es lo otro,
   * el caso en que se le fia trabajo al limitador y la entrada no se toca.
   * Asi que se estropea al reves: se le devuelve el umbral a −1, que le da
   * 19 dB de margen, y se exige que la preamplificacion se aparte.
   *
   * Cada `eq()` monta su propio jsdom, asi que esto no se le cuela a ninguna
   * otra prueba.
   *
   * NO ES UNA PRUEBA DE ADORNO. La rama que cubre es la que sostiene el
   * mensaje "la entrada no se toca" de la pagina de opciones, y es la unica
   * forma de que ese texto no se quede diciendo algo que ya no puede pasar.
   */
  const { Ecualizador, CONSTANTS } = eq();

  const entrada = Ecualizador.plan("graves").entrada;
  assert.ok(entrada < 1, `de partida la entrada tiene que bajar, y se quedo en ${entrada}`);
  assert.ok(entrada > 0, "y bajar no es enmudecer");
  // Y BAJA, no sube. Un signo del reves aqui es distorsion, no silencio.
  assert.strictEqual(Ecualizador.preamplificacion("graves") < 0, true);

  CONSTANTS.EQUALIZER_LIMITS.LIMITADOR.UMBRAL_DB = -1;

  assert.strictEqual(Ecualizador.margenDelLimitador(), 19, "rehacer la cuenta: -1 * (1 - 20)");
  assert.strictEqual(
    Ecualizador.plan("graves").entrada,
    1,
    "con 19 dB de margen la subida cabe y la entrada no tiene que pagar nada"
  );
});

test("factorDe: los decibelios se convierten a multiplicador de verdad", () => {
  const { Ecualizador } = eq();
  // 0 dB es "no toques nada", o sea multiplicar por uno.
  assert.strictEqual(Ecualizador.factorDe(0), 1);
  // -20 dB es exactamente una decima parte: es la definicion de la unidad.
  assert.ok(Math.abs(Ecualizador.factorDe(-20) - 0.1) < 1e-12);
  // -6 dB es aproximadamente la mitad, que es la regla que todo el mundo usa.
  assert.ok(Math.abs(Ecualizador.factorDe(-6) - 0.5) < 0.01);
  /*
   * El signo. Un `-` perdido aqui SUBIRIA el volumen justo cuando habia que
   * bajarlo, que es el fallo exacto que la preamplificacion viene a evitar,
   * y sonaria a distorsion sin que nada lo dijera.
   */
  assert.ok(Ecualizador.factorDe(-9) < 1);
  assert.ok(Ecualizador.factorDe(9) > 1);
});

/* ==================================================================
 * 4. El plan que se le entrega al grafo
 * ================================================================== */

test("plan: apagado no devuelve filtros que montar", () => {
  const { Ecualizador } = eq();
  /*
   * `null` y no una lista de cinco filtros a cero: una lista invitaria a
   * montarlos igual, o sea a cruzar la puerta de un solo sentido para no
   * hacer absolutamente nada.
   */
  assert.strictEqual(Ecualizador.plan(Ecualizador.APAGADO), null);
  assert.strictEqual(Ecualizador.plan("basura"), null);
  assert.notStrictEqual(Ecualizador.plan("plano"), null);
});

test("plan: una linea por banda, en el orden de las bandas", () => {
  const { Ecualizador, CONSTANTS } = eq();
  const plan = Ecualizador.plan("graves");
  const bandas = CONSTANTS.EQUALIZER_BANDS;
  assert.strictEqual(plan.filtros.length, bandas.length);
  for (let i = 0; i < bandas.length; i++) {
    assert.strictEqual(plan.filtros[i].id, bandas[i].id);
    assert.strictEqual(plan.filtros[i].hz, bandas[i].hz);
    assert.strictEqual(plan.filtros[i].tipo, bandas[i].tipo);
    assert.strictEqual(plan.filtros[i].db, CONSTANTS.EQUALIZER_PRESETS.graves[i]);
  }
});

test("plan: los shelf van sin Q y las campanas con la suya", () => {
  const { Ecualizador } = eq();
  const plan = Ecualizador.plan("plano");
  for (const filtro of plan.filtros) {
    if (filtro.tipo === "peaking") {
      assert.ok(typeof filtro.q === "number" && filtro.q > 0, `${filtro.id} deberia llevar Q`);
    } else {
      /*
       * En un shelf ese parametro no es el ancho de una campana: es la
       * resonancia del escalon, y cualquier valor distinto del de fabrica
       * mete un pico en la esquina. Se manda `null` para que quien monte el
       * nodo no lo toque.
       */
      assert.strictEqual(filtro.q, null, `${filtro.id} es un shelf y no deberia llevar Q`);
    }
  }
});

test("plan: la entrada es exactamente la preamplificacion convertida", () => {
  const { Ecualizador } = eq();
  for (const valor of ["graves", "voz", "plano", "nocturno", "12,12,12,12,12"]) {
    assert.strictEqual(
      Ecualizador.plan(valor).entrada,
      Ecualizador.factorDe(Ecualizador.preamplificacion(valor)),
      `con ${valor}`
    );
  }
  /*
   * La entrada NUNCA sube. Bajar es la defensa; subir seria el fallo del
   * signo perdido, que ademas sonaria a distorsion sin que nada lo dijera.
   *
   * Aqui habia un `assert.ok(plan("graves").entrada < 1)` con el comentario
   * «si esto sale >= 1 la musica recorta». Se ha ido con el peaje: hoy vale
   * exactamente 1 y no recorta nada, porque de los picos se encarga el
   * limitador. Esa prueba era la que fijaba el fallo de «apagado suena mas
   * fuerte», asi que queda anotada en vez de borrada a secas.
   */
  for (const valor of ["graves", "voz", "plano", "nocturno", "12,12,12,12,12"]) {
    assert.ok(Ecualizador.plan(valor).entrada <= 1, `la entrada subio con ${valor}`);
  }
  assert.strictEqual(Ecualizador.plan("plano").entrada, 1);
});

test("plan: el limitador viaja dentro, ya despiezado", () => {
  /*
   * audio-grafo.js no lee EQUALIZER_LIMITS: recibe estos cinco numeros y los
   * vuelca. Es la unica forma de que la decision quede de este lado, que es
   * el que tiene pruebas.
   */
  const { Ecualizador, CONSTANTS } = eq();
  const lim = CONSTANTS.EQUALIZER_LIMITS.LIMITADOR;

  for (const valor of ["graves", "plano", "12,0,0,0,0"]) {
    assert.deepStrictEqual(
      plano(Ecualizador.plan(valor).limitador),
      {
        umbralDb: lim.UMBRAL_DB,
        rodillaDb: lim.RODILLA_DB,
        ratio: lim.RATIO,
        ataqueS: lim.ATAQUE_S,
        relajacionS: lim.RELAJACION_S
      },
      `con ${valor}`
    );
  }

  // Apagado no hay plan, asi que tampoco hay limitador que montar.
  assert.strictEqual(Ecualizador.plan(Ecualizador.APAGADO), null);
});

/* ==================================================================
 * 5. Que las constantes no se contradigan entre si
 * ================================================================== */

test("los presets tienen una ganancia por banda y ninguna se pasa", () => {
  const { CONSTANTS } = eq();
  const n = CONSTANTS.EQUALIZER_BANDS.length;
  const { GAIN_MIN, GAIN_MAX } = CONSTANTS.EQUALIZER_LIMITS;
  for (const [nombre, ganancias] of Object.entries(CONSTANTS.EQUALIZER_PRESETS)) {
    assert.strictEqual(ganancias.length, n, `el preset "${nombre}" no tiene ${n} ganancias`);
    for (const g of ganancias) {
      assert.ok(
        Number.isInteger(g) && g >= GAIN_MIN && g <= GAIN_MAX,
        `el preset "${nombre}" pide ${g} dB, fuera de [${GAIN_MIN}, ${GAIN_MAX}]`
      );
    }
  }
});

test("las bandas van de grave a agudo, con los shelf en los extremos", () => {
  const { CONSTANTS } = eq();
  const bandas = CONSTANTS.EQUALIZER_BANDS;
  const ids = new Set(bandas.map((b) => b.id));
  assert.strictEqual(ids.size, bandas.length, "hay dos bandas con el mismo id");
  /*
   * El orden ascendente no es cosmetico: la interfaz pinta los deslizadores
   * recorriendo esta lista, y unos graves en medio de la fila serian un
   * ecualizador que nadie sabe leer.
   */
  for (let i = 1; i < bandas.length; i++) {
    assert.ok(bandas[i].hz > bandas[i - 1].hz, `la banda ${bandas[i].id} no sube en frecuencia`);
  }
  assert.strictEqual(bandas[0].tipo, "lowshelf");
  assert.strictEqual(bandas[bandas.length - 1].tipo, "highshelf");
  // Y en medio, campanas: un shelf ahi subiria tambien todo lo que hay al
  // otro lado, o sea las demas bandas.
  for (let i = 1; i < bandas.length - 1; i++) {
    assert.strictEqual(bandas[i].tipo, "peaking", `la banda ${bandas[i].id} deberia ser una campana`);
  }
});

test("existe el preset plano y es todo ceros", () => {
  const { CONSTANTS } = eq();
  /*
   * `ganancias` cae en `EQUALIZER_PRESETS.plano` cuando no hay nada mejor
   * que devolver, asi que borrarlo o cambiarlo por otra cosa dejaria el
   * ecualizador devolviendo `undefined` en los caminos de reserva.
   */
  assert.deepStrictEqual(
    plano(CONSTANTS.EQUALIZER_PRESETS.plano),
    new Array(CONSTANTS.EQUALIZER_BANDS.length).fill(0)
  );
});
