/*
 * Cargado como script clasico (no ES module) tanto en content scripts,
 * service worker (via importScripts) y paginas HTML (popup/pip/options),
 * para evitar cualquier paso de build. Todo se cuelga de self.YTMPip.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  YTMPip.CONSTANTS = {
    /*
     * Los sitios donde vive la extension, en UNA lista: el service worker
     * saca de aqui sus patrones de chrome.tabs.query y sus comprobaciones
     * de URL. Antes esto era YOUTUBE_MUSIC_URL_PATTERN (un solo sitio) mas
     * copias literales dentro del service worker; al abrirse a YouTube
     * normal, la copia repartida era el fallo esperando su dia.
     *
     * OJO: el manifest.json NO lee de aqui (es JSON inerte) — sus tres
     * listas (host_permissions, matches de content_scripts y de
     * web_accessible_resources) tienen que cambiar A LA VEZ que esta, y la
     * prueba del manifiesto vigila que las tres digan lo mismo.
     *
     * `prefijo` y no hostname: las comprobaciones del service worker son
     * sobre URLs completas (startsWith), y el patron de tabs.query no
     * sirve para eso. Solo www.youtube.com: Chrome redirige youtube.com
     * al www, y m.youtube.com es otro DOM que nadie ha mirado.
     */
    SITIOS_SOPORTADOS: [
      { id: "youtube-music", patron: "https://music.youtube.com/*", prefijo: "https://music.youtube.com/" },
      { id: "youtube", patron: "https://www.youtube.com/*", prefijo: "https://www.youtube.com/" },
      { id: "spotify", patron: "https://open.spotify.com/*", prefijo: "https://open.spotify.com/" }
    ],
    /* Donde se abre pestaña nueva si no hay ninguna: el sitio DE MUSICA. */
    URL_POR_DEFECTO: "https://music.youtube.com/",
    SELECTOR_SCHEMA_VERSION: 1,

    STORAGE_KEYS: {
      SEEK_SECONDS: "seekSeconds",
      THEME: "theme",
      PIP_SIZE: "pipSize",
      DEFAULT_SECTION: "defaultSection",
      LYRICS_PREFERENCE: "lyricsPreference",
      VIDEO_PREFERENCE: "videoPreference",
      CANVAS_PREFERENCE: "canvasPreference",
      /*
       * El halo de luz: DOS claves y no una con tres valores, a proposito.
       * El boton de la ventana solo sabe encender y apagar; con una clave
       * tri-estado, apagar desde ahi tendria que elegir a que modo volver
       * al reencender, y quien hubiera elegido "latido" en Preferencias lo
       * perderia al primer clic. Con dos, HALO_PREFERENCE dice SI SE VE y
       * HALO_MODE dice COMO SE VE, y apagar no borra la segunda respuesta.
       * Es el mismo reparto que EQUALIZER / EQUALIZER_LAST.
       */
      HALO_PREFERENCE: "haloPreference",
      HALO_MODE: "haloMode",
      /*
       * De que color brilla el halo. UNA clave con dos formas, como
       * SPECTRUM_COLOR: "accent" significa "el que diga el tema" y un
       * "#rrggbb" es un color elegido a mano. El modo se deduce de la
       * FORMA de lo guardado; dos claves (modo + color) podrian guardar
       * dos respuestas contradictorias a una pregunta que admite una.
       * A diferencia del espectro NO hay "rgb" ni "source" ni paletas:
       * el halo es una sola luz, no una fila de barras.
       */
      HALO_COLOR: "haloColor",
      SPECTRUM_BARS: "spectrumBars",
      SPECTRUM_FALL: "spectrumFall",
      SPECTRUM_HEIGHT: "spectrumHeight",
      SPECTRUM_COLOR: "spectrumColor",
      PIP_TRANSPARENCY: "pipTransparency",
      /*
       * UNA sola clave para el ecualizador, y lleva dentro tres respuestas
       * distintas: apagado, un preset, o las ganancias a mano. Es el mismo
       * reparto que `spectrumColor`, y por el mismo motivo: con una clave
       * para el modo y otra para las ganancias se pueden guardar dos
       * respuestas a la vez a una pregunta que solo admite una, y antes o
       * despues se contradicen. El modo se deduce de la FORMA de lo
       * guardado (ver normalizar en src/shared/ecualizador.js).
       */
      EQUALIZER: "equalizer",
      /*
       * A QUE AJUSTE VOLVER cuando se vuelva a encender.
       *
       * Es una anotacion, como PIP_LAST_SIZE, y no una segunda respuesta a la
       * pregunta de EQUALIZER. Las dos claves no pueden contradecirse porque
       * no contestan lo mismo: EQUALIZER dice COMO SUENA AHORA (y "off" es
       * una respuesta completa), esta dice QUE HABIA ANTES DE APAGARLO.
       *
       * Existe por el interruptor de la ventana flotante. Alli no cabe un
       * desplegable, asi que el boton solo puede encender y apagar; sin esta
       * clave, "encender" tendria que elegir un ajuste por su cuenta, y quien
       * hubiera dejado sus cinco numeros a mano en la pagina de opciones los
       * perderia al primer clic. Con ella, apagar y encender devuelve
       * exactamente lo que habia.
       *
       * NUNCA vale "off": eso convertiria el interruptor en un boton que no
       * hace nada. Lo garantiza `ultimoEcualizador` en settings.js.
       */
      EQUALIZER_LAST: "equalizerLast",
      /*
       * QUE AJUSTE QUIERE CADA CANCION CONCRETA. Otra anotacion, no una
       * tercera respuesta a la pregunta de EQUALIZER: esta clave dice "si
       * suena TAL cancion, pon TAL ajuste", y quien lo pone de verdad sigue
       * siendo EQUALIZER, escrita por el modulo de memoria por cancion en el
       * momento en que la cancion empieza. Asi la fuente de la verdad de
       * "como suena ahora" sigue siendo UNA, y todo lo que ya reacciona a
       * EQUALIZER (el grafo, el interruptor, la pagina de opciones) funciona
       * con las canciones fijadas sin enterarse de que existen.
       *
       * Se guarda como lista de pares [clave, valor] y no como objeto: el
       * ORDEN es informacion (la mas reciente al final), porque cuando la
       * lista se llena hay que decidir a quien echar, y se echa a la mas
       * antigua. Un objeto perderia ese orden en cuanto alguien lo
       * recorriera confiando en el.
       */
      EQUALIZER_BY_SONG: "equalizerBySong",
      /*
       * Esta NO es una preferencia: es una anotacion. Las demas claves las
       * escribe el usuario en la pagina de opciones; esta la escribe la
       * propia ventana cada vez que la redimensionan, y solo se lee al
       * abrirla. Se guarda junto a las otras porque hace falta leerla de
       * forma SINCRONA en openPip() —un await antes de requestWindow()
       * consume la activacion de usuario— y la cache de Settings es el
       * unico sitio de donde se puede leer asi.
       */
      PIP_LAST_SIZE: "pipLastSize",
      SELECTOR_SCHEMA_VERSION: "selectorSchemaVersion",
      LAST_KNOWN_STATE: "lastKnownState"
    },

    DEFAULT_SETTINGS: {
      seekSeconds: 10,
      theme: "dark",
      pipSize: "compact",
      defaultSection: "player",
      lyricsPreference: "shown",
      videoPreference: "shown",
      // El fondo Canvas de Spotify: "shown" de entrada porque el fondo es
      // la gracia de la funcion; el boton de la ventana lo apaga y la
      // eleccion se recuerda como las demas preferencias.
      canvasPreference: "shown",
      /*
       * El halo de luz: encendido y LATIENDO de serie. Decision del autor
       * tras publicar la 1.0.0 («que el halo aumente conforme la musica»);
       * antes era "fixed" por miedo a un estreno roto — el latido necesita
       * capturar audio y eso pide un clic —, pero la regla del gesto
       * (tanda J) ya resuelve eso sola: con "pulse" guardado el halo SALE
       * fijo y arranca a latir con el primer clic que toque audio. El
       * estreno no queda roto, queda quieto hasta el primer gesto. En
       * Spotify (sin captureStream) se queda fijo siempre.
       */
      haloPreference: "shown",
      haloMode: "pulse",
      // "source" = el color de lo que se este viendo (video o caratula),
      // pedido por el autor junto con el latido. Hasta que el muestreo
      // tenga un color, la variable CSS no existe y el halo cae al color
      // del tema — la ausencia ES el mecanismo (tandas K y M), asi que
      // el arranque en frio se ve exactamente como el "accent" de antes.
      haloColor: "source",
      /*
       * Preferencias del espectro. Numero, caida y alto siguen siendo
       * EXACTAMENTE lo que el espectro hacia antes de ser configurable,
       * para que quien no toque nada no note ningun cambio. El COLOR es
       * la excepcion desde la 1.0.1: "source" de serie, pedido por el
       * autor junto con el latido del halo («barras tambien con video»).
       *
       * `"auto"` no es un numero disfrazado: con un numero fijo el espectro
       * sale ridiculo en los dos extremos —en la ventana mini las barras se
       * solapan y en la ampliada quedan cuatro columnas gordas—, asi que el
       * reparto por ancho sigue siendo lo que se ofrece de entrada. Quien
       * quiera un numero concreto lo pone, y entonces manda el suyo.
       *
       * `"source"` tampoco es un color: es "el que mande en lo que se esta
       * viendo" —el video o la caratula—, que ni siquiera se puede saber
       * hasta que haya algo en pantalla; hasta entonces las barras usan el
       * color del tema, igual que con `"accent"` (= "el que diga el tema";
       * poner aqui un rojo fijo seria escribir el color de la marca por
       * segunda vez). El tercer valor, `"rgb"`, tampoco es un color: es
       * "ninguno fijo, ve girando". Y un "#rrggbb" o una lista de ellos
       * son el color propio o la paleta del usuario.
       */
      spectrumBars: "auto",
      spectrumFall: 12,
      spectrumHeight: 34,
      spectrumColor: "source",

      /*
       * Cuanto se atenua la ventana MIENTRAS SUENA la musica, en porcentaje.
       * Cero —lo de siempre— significa que no se atenua nunca, que es lo
       * unico que puede ser el valor por defecto: quien no ha pedido nada no
       * espera que la ventana se le desvanezca sola.
       */
      pipTransparency: 0,

      /*
       * APAGADO, y esto no es una preferencia de gusto: es la unica opcion
       * defendible.
       *
       * Ecualizar obliga a meter el audio del <video> en un AudioContext con
       * createMediaElementSource(), que es una puerta de un solo sentido: a
       * partir de esa llamada el sonido del elemento SOLO sale por el grafo,
       * y si el grafo falla no sale por ningun lado hasta recargar la
       * pestaña. El comentario de cabecera de src/content/audio-spectrum.js
       * cuenta por que el espectro se diseño entero para no cruzarla.
       *
       * Un valor por defecto distinto de "off" cruzaria esa puerta en la
       * maquina de alguien que solo queria una ventana flotante. El
       * ecualizador se enciende cuando alguien lo pide, y no antes.
       */
      equalizer: "off",

      /*
       * A DONDE VA EL INTERRUPTOR LA PRIMERA VEZ, cuando no consta ningun
       * ajuste anterior.
       *
       * "graves" y no "plano", y la diferencia es la de un boton que funciona
       * y uno que parece roto. "Plano" cruza la puerta, monta los cinco
       * filtros... y suena exactamente igual que antes, porque todas las
       * bandas estan a cero. Quien le da al interruptor por primera vez no
       * oiria NADA distinto y daria por hecho que no va.
       *
       * De los tres presets con efecto audible es el menos comprometido:
       * "voz" y "nocturno" recortan bandas —suenan a musica estropeada si no
       * es lo que buscabas— mientras que mas graves es lo que espera casi
       * todo el mundo al encender algo llamado ecualizador. Y siempre se
       * puede cambiar en la pagina de opciones, que es donde estan los cinco
       * mandos de verdad.
       */
      equalizerLast: "graves",

      /*
       * El ultimo tamaño con el que se vio la ventana. `null` significa "no
       * consta ninguno todavia", que es distinto de un tamaño concreto: la
       * primera vez hay que caer al tamaño compacto de siempre, no a un
       * numero inventado aqui.
       */
      pipLastSize: null
    },

    /*
     * Limites de las preferencias del espectro. Viven aqui y no en cada
     * archivo que los necesita porque los usan TRES sitios: la
     * normalizacion de settings.js, los `min`/`max` de la pagina de
     * opciones y las pruebas. Repetidos serian tres reglas distintas
     * esperando a separarse.
     */
    SPECTRUM_LIMITS: {
      BARS_MIN: 8,
      BARS_MAX: 40,
      // Cuanto baja una barra por fotograma, sobre 255. Mas alto = mas
      // rapido. Por debajo de 1 no bajaria nunca; por encima de 60 la
      // bajada es tan brusca que vuelve el parpadeo que `suavizar` evita.
      FALL_MIN: 1,
      FALL_MAX: 60,
      // Porcentaje del alto de la ventana. Menos de 10 no se ve; 100 es la
      // ventana entera, que es una opcion legitima con el modo limpio.
      HEIGHT_MIN: 10,
      HEIGHT_MAX: 100,
      /*
       * Lo que aparece en la casilla cuando alguien pasa de "automatico" a
       * "un numero fijo". Sin esto la casilla nace vacia, la normalizacion
       * la lee como NaN, la manda al valor por defecto —que es "auto"— y el
       * desplegable se vuelve solo a la posicion de la que el usuario
       * acababa de salir. Un punto medio del rango evita esa pelea.
       */
      BARS_SUGGESTED: 24,
      /*
       * Y lo mismo con el color: el selector RGB tiene que nacer con algo.
       * Es el mismo rojo que `--ytmpip-accent` en src/pip/pip.css (tema
       * oscuro), copiado a proposito y no leido: la pagina de opciones es
       * otro documento y no carga esa hoja de estilos. No es la fuente de
       * la verdad del acento —esa sigue siendo el CSS—, es solo por donde
       * empieza el cuentagotas.
       */
      COLOR_SUGGESTED: "#ff0000",
      /*
       * La paleta propia: un degradado a lo ANCHO, del color de la primera
       * barra al de la ultima, pasando por los de en medio.
       *
       * DOS es el minimo porque con un solo color no hay degradado que
       * hacer: eso ya existe y se llama "uno mio". Con menos de dos, lo
       * guardado no es una paleta.
       *
       * CINCO es el techo por una razon que se ve al mirar la ventana: con
       * ocho barras —el minimo— una paleta de cinco colores ya casi no
       * interpola nada, cada barra es practicamente un color de la lista.
       * Mas colores no darian mas degradado, darian una lista de colores
       * sueltos, y ademas cinco cuentagotas ya llenan la pagina de
       * opciones.
       */
      PALETTE_MIN: 2,
      PALETTE_MAX: 5,
      /*
       * Con la que nace la paleta la primera vez que alguien la destapa. Es
       * justo el ejemplo que se pidio —empezar en rojo, acabar en azul, con
       * un verde en medio—, porque una paleta que nace con tres grises
       * obligaria a elegir tres colores antes de ver que hace la funcion.
       *
       * El rojo es el mismo COLOR_SUGGESTED de arriba, y el verde y el azul
       * son sus hermanos: misma luz y misma saturacion, girando el tono. Asi
       * la paleta por defecto pega con el tema en vez de parecer tres
       * colores elegidos al azar.
       */
      PALETTE_SUGGESTED: ["#ff0000", "#00ff00", "#0000ff"],

      /*
       * ============ EL COLOR QUE SALE DEL VIDEO O DE LA CARATULA ============
       *
       * El cuarto modo del espectro: en vez de un color elegido, el que manda
       * en lo que se esta viendo. TODOS estos numeros salen de medir, no de
       * elegir, y las medidas estan en tools/diagnostico-color-video.js y
       * tools/diagnostico-color-portada.js. Quien los cambie deberia volver a
       * pasarlos.
       */
      SOURCE_COLOR: {
        /*
         * CADA CUANTO SE MIRA LA FUENTE. Leer un fotograma cuesta 4,467 ms
         * medidos (media de 30 lecturas sobre el video real), que es el 28 %
         * de un fotograma de 16 ms: hacerlo dentro del bucle de pintado seria
         * gastar mas de una cuarta parte del presupuesto de animacion en
         * mirar un color. Va en su propio temporizador y a 400 ms el coste
         * baja al 1,1 % del tiempo.
         *
         * No se baja mas porque no hace falta: el mismo diagnostico midio 4
         * grados de salto medio de tono entre lecturas separadas 250 ms
         * (13 el maximo). A ese ritmo, mirar mas a menudo no traeria mas
         * informacion, traeria la misma dos veces.
         */
        SAMPLE_MS: 400,
        /*
         * CUANTO TARDA EL COLOR EN LLEGAR AL NUEVO. Es una constante de
         * tiempo, no un porcentaje por fotograma: `pasoDeSuavizado` la
         * combina con los milisegundos que de verdad han pasado. Un
         * porcentaje fijo por fotograma haria que el mismo codigo suavizara
         * el doble en una pantalla de 120 Hz que en una de 60, y nadie se
         * enteraria salvo quien tuviera las dos.
         *
         * Por debajo del intervalo de muestreo a proposito: el color tiene
         * que haber terminado de llegar antes de que llegue el siguiente, o
         * el espectro iria siempre persiguiendo un objetivo viejo.
         */
        SMOOTH_MS: 220,
        /*
         * EL LIENZO DE MUESTRA, en pixeles de lado. Dieciseis, o sea 256
         * pixeles: es el tamaño con el que se midieron los 4,467 ms, y el
         * navegador hace el reescalado en la GPU, asi que una portada de
         * 544x544 y un video de 1280x720 cuestan lo mismo.
         *
         * No es "poca resolucion": para saber que color MANDA no hacen falta
         * los detalles, hace falta el promedio, y esto ya es un promedio
         * hecho por el que mejor sabe hacerlo.
         */
        EDGE: 16,
        /*
         * CUANTO DE LA IMAGEN TIENE QUE SER DE ESE COLOR PARA QUE CUENTE.
         *
         * Este numero existe por un error que casi entra: en la primera
         * carátula medida, el color dominante mandaba "sobre el 100 %" de los
         * pixeles con color... que eran 6 de 256, o sea el 2 % de la imagen.
         * Un color que representa al 2 % de una portada no es el color de esa
         * portada, es ruido con buena prensa.
         *
         * Por debajo de esta cuota no se inventa nada: se vuelve al acento del
         * tema, que es una respuesta honesta. La segunda carátula medida daba
         * 121 de 256 (25 %) y pasa de sobra.
         */
        MIN_SHARE: 0.1,
        /*
         * QUE PIXEL TIENE DERECHO A VOTAR. Un gris no tiene tono —su `h` vale
         * 0 por convenio, que resulta ser el rojo (ver rgbAHsl en paleta.js)—
         * asi que dejarlo votar seria dejar que las zonas neutras votaran
         * todas al rojo. Lo mismo por arriba y por abajo: en el casi-negro y
         * el casi-blanco el tono es ruido de redondeo.
         */
        SAT_MIN: 0.25,
        LIGHT_FLOOR: 0.12,
        LIGHT_CEIL: 0.92,
        /*
         * EN CUANTAS FRANJAS DE TONO SE REPARTEN LOS VOTOS. Veinticuatro son
         * 15 grados cada una, que es aproximadamente lo que hay que mover un
         * tono para que se vea que es otro color. Con menos franjas, un rojo y
         * un naranja votarian juntos; con muchas mas, dos rojos que solo se
         * distinguen con cuentagotas se repartirian el voto y ninguno de los
         * dos ganaria.
         */
        HUE_BUCKETS: 24,
        /*
         * ============ LA NORMALIZACION DE LA LUZ ============
         *
         * El tono se respeta; la luz NO. Y no es un capricho: las dos
         * carátulas medidas dieron 24 % y 30 % de luz, y el video 49 %. Pintar
         * las barras con el color TAL CUAL dejaria el espectro de las dos
         * primeras canciones casi invisible sobre el fondo oscuro de la
         * ventana, que es negro. El color seria fiel y no se veria.
         *
         * Fidelidad al TONO —que es lo que una persona reconoce como "el color
         * de la portada"— y suficiencia en la luz, que es lo que decide si hay
         * algo que mirar. La banda es estrecha a proposito: mas ancha dejaria
         * volver el problema por un extremo.
         */
        OUT_LIGHT_MIN: 0.45,
        OUT_LIGHT_MAX: 0.62,
        /*
         * Y un suelo de saturacion por el mismo motivo, con menos margen: la
         * primera carátula daba 37 %, que sobre negro tira a barro. Solo SUBE
         * —nunca baja— porque un color muy saturado no molesta y rebajarlo
         * seria quitarle a la fuente lo que si tenia.
         */
        OUT_SAT_MIN: 0.5
      }
    },

    /*
     * Limites de la ventana en si, no del espectro. De momento solo el
     * atenuado, pero vive aparte por lo mismo que SPECTRUM_LIMITS: lo leen
     * la normalizacion, el `max` de la pagina de opciones y las pruebas.
     */
    PIP_LIMITS: {
      TRANSPARENCY_MIN: 0,
      /*
       * El techo NO es 100 y no es una cifra redonda por casualidad: al 80 %
       * queda un quinto de opacidad, que sigue siendo una silueta con la que
       * apuntar el raton. Al 100 % la ventana seria invisible y no habria
       * forma de encontrarla para volver a enseñarla —el atenuado se
       * deshace pasando el cursor por encima, y no se puede pasar el cursor
       * por encima de lo que no se ve—.
       */
      TRANSPARENCY_MAX: 80,

      /*
       * Topes del tamaño recordado. No estan para llevarle la contraria al
       * usuario —el navegador ya acota lo que se le pide— sino para que una
       * anotacion corrupta o absurda no abra una ventana de 20x20 px: una
       * ventana asi no se puede agarrar por el borde para devolverla a su
       * sitio, y el usuario se quedaria sin forma de arreglarlo desde
       * dentro. Es el mismo motivo por el que el atenuado se queda en 80.
       *
       * El minimo va por debajo de los umbrales de PIP_BREAKPOINTS a
       * proposito: por debajo de 290 de ancho la maquetacion ya tiene una
       * respuesta (`narrow`, `mini`), asi que una ventana pequeña es fea
       * pero utilizable. Lo que no puede es ser inagarrable.
       */
      WIDTH_MIN: 240,
      WIDTH_MAX: 1600,
      HEIGHT_MIN: 160,
      HEIGHT_MAX: 1200
    },

    /*
     * ==================== ECUALIZADOR ====================
     *
     * LAS BANDAS. Cinco, y el orden de esta lista ES el orden de las
     * ganancias guardadas: la ganancia i-esima es de la banda i-esima. Se
     * recorre por indice en tres sitios (montar los filtros, pintar los
     * deslizadores, leer lo guardado), asi que REORDENAR ESTA LISTA CAMBIA
     * EL SIGNIFICADO DE LO QUE YA HAY EN STORAGE. Si algun dia hay que
     * tocarla, hay que migrar lo guardado; no es una lista decorativa.
     *
     * POR QUE ESTAS CINCO FRECUENCIAS. Estan repartidas a dos octavas una de
     * otra (60, 250, 1k, 4k, 12k es aproximadamente x4 cada vez), que es lo
     * que cubre el rango audible con cinco mandos sin dejar zonas mudas. Mas
     * bandas darian mas precision y una fila de deslizadores que no cabe en
     * la ventana flotante; menos dejarian de poder separar "el bombo" de "la
     * voz", que es justo lo que la gente quiere mover.
     *
     * POR QUE LOS EXTREMOS SON SHELF Y EL RESTO PEAKING. Un `peaking` a 60 Hz
     * sube una campana ALREDEDOR de 60 y deja lo de mas abajo como estaba, o
     * sea que no sube el sub-bajo: no es lo que nadie entiende por "mas
     * graves". Un `lowshelf` levanta TODO lo que hay de 60 para abajo, que si
     * lo es. Lo mismo arriba con `highshelf` y el aire. En medio si se quiere
     * una campana, porque ahi subir "todo lo que hay por encima" seria subir
     * tambien las otras bandas.
     *
     * POR QUE Q = 1. Es algo mas de una octava de ancho a cada lado. Con las
     * bandas separadas dos octavas, esa anchura hace que las campanas se
     * TOQUEN por los bordes: sin ese solape quedarian huecos entre 250 y 1k
     * donde mover los mandos no hace nada. Mas Q sonaria a filtro quirurgico
     * (un pitido, no un tono); menos Q y las tres campanas se pisarian tanto
     * que los tres mandos harian casi lo mismo.
     *
     * `q` no se usa en los shelf: en un shelf ese parametro controla la
     * pendiente del escalon y el valor por defecto (0,707, sin resonancia) es
     * el que no mete un pico en la esquina. Se deja fuera a proposito para
     * que nadie lo copie de una banda a otra.
     */
    EQUALIZER_BANDS: [
      { id: "graves", hz: 60, tipo: "lowshelf", etiqueta: "Graves" },
      { id: "cuerpo", hz: 250, tipo: "peaking", q: 1, etiqueta: "Cuerpo" },
      { id: "medios", hz: 1000, tipo: "peaking", q: 1, etiqueta: "Medios" },
      { id: "claridad", hz: 4000, tipo: "peaking", q: 1, etiqueta: "Claridad" },
      { id: "aire", hz: 12000, tipo: "highshelf", etiqueta: "Aire" }
    ],

    /*
     * LOS PRESETS. El orden de cada lista es el de EQUALIZER_BANDS.
     *
     * "plano" NO es lo mismo que apagado, y la diferencia importa: apagado
     * significa que el audio ni siquiera entra en el grafo (la puerta sigue
     * sin cruzar); plano significa que entra y sale sin tocarse. Suenan
     * igual, pero uno se puede deshacer y el otro no. Existe porque es el
     * sitio al que se vuelve cuando se ha estado trasteando, y porque tener
     * que poner cinco ceros a mano para "quitarlo" seria absurdo.
     *
     * "nocturno" es para escuchar bajito de noche: menos graves —que son los
     * que atraviesan la pared del vecino— y menos agudos —que son los que
     * cansan—, con los medios algo arriba para que a poco volumen se siga
     * entendiendo la letra. NO es un compresor: no toca el rango dinamico,
     * asi que un golpe fuerte sigue siendo un golpe fuerte. Llamarlo "modo
     * noche" y esperar que iguale el volumen seria prometer otra cosa.
     *
     * ------------------------------------------------------------------
     * UN PRESET TIENE DOS NUMEROS: LO QUE SUBE Y LO QUE CUESTA
     * ------------------------------------------------------------------
     *
     * Sobre material sin holgura, subir una banda obliga a bajar el resto
     * (ver UMBRAL_DB mas abajo). El precio de un preset es su `subidaDelPico`,
     * y elegir ganancias sin mirarlo es elegir a ciegas:
     *
     *   plano     +0  ->  no cuesta nada
     *   nocturno  +3  ->  −3 dB
     *   voz       +7  ->  −7 dB
     *   graves    +4  ->  −4 dB
     *
     * "graves" ERA [8, 3, 0, 0, 1] Y COSTABA −11 dB. El usuario lo probo y lo
     * dijo en una linea: «suena muy flojo con mas graves, los otros se
     * escuchan bien». Los otros costaban 7 y 3.
     *
     * Y al mirar de donde salian esos 11 se ve que casi la mitad no estaba
     * comprando graves. El +3 de 250 Hz es VECINO del shelf de 60 Hz, asi que
     * ademas de sus propios 3 dB se cobra el solape: 8 + 3 = 11. Pero "mas
     * graves" es profundidad, y la profundidad esta en 60 Hz, no en 250 —que
     * es cuerpo, otra cosa—. O sea que tres de los once decibelios de peaje
     * los pagaba todo el mundo por una banda que no era la que se venia a
     * buscar. Se afino a [7, 0, 0, 0, 1] y bajo a −7.
     *
     * ------------------------------------------------------------------
     * Y ENTONCES EL USUARIO ENCONTRO A MANO ALGO MEJOR QUE LAS DOS
     * ------------------------------------------------------------------
     *
     * [0, 4, -6, -2, 1]. LA BANDA DE 60 Hz ESTA EN CERO. El preset que se
     * llama "mas graves" no sube los graves NI UN DECIBELIO.
     *
     * No es una errata y por eso esta escrito aqui: se oyen mas graves porque
     * se ha quitado lo que competia con ellos. Los medios bajan 6 dB y la
     * claridad 2, asi que el grave —que sigue exactamente donde estaba— pasa a
     * ser lo mas alto que hay. Es sonoridad RELATIVA, no absoluta.
     *
     * Lo que lo hace barato es la otra cara de la misma moneda: BAJAR NO
     * CUESTA NADA. `subidaDelPico` solo mira lo que sube, asi que los −6 y
     * los −2 son gratis, y el pico lo pone el +4 de 250 Hz. Ademas ese +4 ya
     * no tiene vecina subida —60 Hz esta en cero y 1 kHz en −6—, asi que no
     * paga solape. Precio final: −4 dB, el mas barato de los tres presets que
     * tocan algo, y el unico que ha sonado bien de las tres versiones.
     *
     * LA MORALEJA, que vale para cualquier preset que se añada aqui: cuando
     * algo suena flojo, la reaccion es subir la banda que se quiere oir, y esa
     * es justo la cara. Bajar sus competidoras da un resultado parecido y sale
     * gratis. Los presets caros de esta lista lo son por subir de mas, no por
     * bajar de mas.
     *
     * (Queda una deuda honesta: el desplegable dice "Mas graves" y esto es
     * mas bien un escalonado. Suena a lo que promete, asi que el nombre se
     * queda, pero el nombre y las ganancias ya no dicen lo mismo.)
     */
    EQUALIZER_PRESETS: {
      plano: [0, 0, 0, 0, 0],
      graves: [0, 4, -6, -2, 1],
      voz: [-4, -2, 4, 3, 0],
      nocturno: [-6, 0, 3, 0, -4]
    },

    /*
     * EL NOMBRE QUE LEE UNA PERSONA, en un solo sitio.
     *
     * Estaba escrito dentro del <select> de options.html, y eso tenia una
     * consecuencia que no parecia importante hasta que lo fue: el boton del
     * ecualizador de la ventana flotante NO PODIA DECIR CUAL ESTABA PUESTO.
     * Lo unico que sabia decir era "encendido", porque para decir «Mas
     * graves» habria tenido que copiarse ese texto del HTML de otra pagina,
     * y entonces habria dos sitios donde renombrar un preset y uno de los
     * dos se quedaria atras. La limitacion estaba escrita en pip.js como una
     * decision de diseño; era, mirandola bien, una duplicacion evitada a
     * base de renunciar a algo.
     *
     * Con los nombres aqui no hay nada que copiar: options.js los escribe en
     * el desplegable y pip.js los lee para el boton. Renombrar un preset es
     * tocar una linea.
     *
     * SOLO ESTAN LOS PRESETS. "off" y "a mi gusto" no aparecen porque no son
     * presets —uno es no cruzar la puerta y el otro es la AUSENCIA de
     * preset—, y es la misma frontera que ya traza options.js al comprobar
     * que el desplegable cuadra. Sus textos siguen donde estaban.
     */
    EQUALIZER_PRESET_LABELS: {
      plano: "Plano",
      graves: "Más graves",
      voz: "Voz",
      nocturno: "Nocturno"
    },

    EQUALIZER_LIMITS: {
      /*
       * Doce decibelios arriba y abajo. El techo no es redondo por casualidad:
       * es lo que tools/diagnostico-ecualizador.js midio de verdad entregando
       * un lowshelf sobre el audio real de YouTube Music (+12,0 dB medidos en
       * 20-120 Hz, con 8,5 dB de separacion frente a la banda de control de
       * 2-6 kHz). Por encima de ahi no se gana volumen, se gana distorsion:
       * la musica ya viene masterizada casi al tope, y lo que sobra recorta.
       */
      GAIN_MIN: -12,
      GAIN_MAX: 12,
      /*
       * El paso de los deslizadores. Un decibelio es aproximadamente el
       * cambio mas pequeño que se oye; medios decibelios darian el doble de
       * posiciones para que la mitad no se distingan.
       */
      GAIN_STEP: 1,
      /*
       * Cuanto puede aportar LA BANDA DE AL LADO en el punto donde su campana
       * se cruza con la de la banda mas alta. Es un TECHO, no un peaje.
       *
       * Las campanas se solapan por los bordes a proposito (ver Q = 1 mas
       * arriba), asi que dos bandas contiguas subidas suman en el cruce algo
       * mas que cualquiera de las dos por separado, y ese algo tiene que
       * caber. Tres decibelios es lo mas que puede aportar la vecina.
       *
       * OJO CON COMO SE USA. Esto se cobraba SIEMPRE, hubiera vecina subida o
       * no, y sumado a la subida mas alta. El resultado era que la banda que
       * mas subias acababa siempre en −3 dB exactos —los dos «maximo» se
       * cancelaban— o sea que el ecualizador NO PODIA SUBIR NADA, solo bajar
       * lo demas. Lo encontro el usuario diciendo «apagado suena mas fuerte
       * que con esta configuracion». Ahora solo se cobra si de verdad hay una
       * banda contigua subida, y nunca mas de lo que esa vecina vale.
       */
      HEADROOM_DB: 3,

      /*
       * EL LIMITADOR, que es lo que permite que subir una banda se OIGA.
       *
       * Antes de esto, la unica defensa contra el recorte era bajar la entrada
       * tanto como se fuera a subir. Es una defensa que funciona y que se paga
       * entera por adelantado: se pierde volumen SIEMPRE, incluso en la
       * inmensa mayoria de momentos en que la cancion no esta ni cerca del
       * tope y no habria recortado nada.
       *
       * Un limitador cobra solo cuando hace falta: deja pasar todo hasta el
       * umbral y aplasta lo que asoma por encima, y solo mientras asoma.
       *
       * UMBRAL_DB ESTUVO EN −1 Y ERA UN ERROR MEDIBLE. La idea era «un
       * decibelio de margen para que el aplastado tenga donde empezar», y
       * suena razonable hasta que se mide sobre el material real:
       * tools/diagnostico-limitador.js encontro que con el umbral ahi el
       * limitador trabajaba entre el 85 % y el 100 % del tiempo en seis
       * pasadas de tres canciones y tres generos, recortando de 2 a 3 dB de
       * forma continua. Eso no es una red: es un control de volumen puesto
       * encima de todo, y se comia justo el realce que el usuario venia a
       * buscar («no diria que suena mas fuerte»).
       *
       * Y lo mas claro del hallazgo: CON LAS CINCO BANDAS A CERO tambien
       * trabajaba, el 63-99 % del tiempo. Ahi no hay realce ninguno que
       * absorber. Lo que despertaba al limitador no era el ecualizador, era
       * la propia cancion: en esta plataforma la musica ya viene pegada al
       * techo, asi que un umbral a −1 esta POR DEBAJO del material y elegir
       * «Plano» comprimia, que es lo contrario de lo que promete la palabra.
       *
       * El error de fondo fue usar la respuesta de una pregunta para otra.
       * `margenDelLimitador()` contesta «cuanto puede absorber sin que a la
       * SALIDA se le escape nada», y con −1 y ratio 20 daba 19 dB. Pero la
       * pregunta que decide el sonido es otra: «cuanto puede absorber SIN
       * PONERSE A TRABAJAR», y esa la contesta la holgura que traiga la
       * cancion, que aqui es cero.
       *
       * A CERO las dos preguntas vuelven a dar lo mismo: el margen pasa a ser
       * `0 * (1 - 20)` = 0, o sea que `preamplificacion` empieza a cobrar la
       * subida real del pico y el limitador solo se encuentra lo que de
       * verdad se saldria de escala. La red vuelve a ser una red.
       *
       * RATIO 20 es el maximo que acepta DynamicsCompressorNode y aqui se
       * quiere el maximo: esto no es un compresor para «darle cuerpo» a nada,
       * es una red para que no se rompa. De estos dos numeros sale ademas
       * CUANTO puede absorber, que es lo que mira `preamplificacion`.
       *
       * RODILLA_DB a cero por lo mismo: una rodilla blanda empieza a apretar
       * antes del umbral, o sea que tocaria el sonido en pasajes que no lo
       * necesitan. Aqui se quiere una esquina.
       *
       * ATAQUE_S muy corto porque un pico que no se atrapa a tiempo ya ha
       * recortado; RELAJACION_S bastante mas largo porque soltar de golpe se
       * oye como un bombeo del volumen entre golpe y golpe de bombo.
       */
      LIMITADOR: {
        UMBRAL_DB: 0,
        RODILLA_DB: 0,
        RATIO: 20,
        ATAQUE_S: 0.003,
        RELAJACION_S: 0.25
      }
    },

    /*
     * MEMORIA DEL ECUALIZADOR POR CANCION: cuantas canciones caben.
     *
     * Doscientas y no "todas" porque esta lista viaja entera en cada
     * lectura y escritura de storage, y porque una memoria sin techo crece
     * durante años sin que nadie la vea: no hay pagina que la liste. Con
     * doscientas entradas caben todas las canciones que alguien fija a
     * proposito —fijar es un clic deliberado, no algo que pase solo— y la
     * expulsion de la mas antigua, cuando llegue, echara una que no se
     * escuchaba hace cientos de fijados.
     *
     * Vive aqui y no en el modulo por lo mismo que SPECTRUM_LIMITS: lo
     * necesitan el modulo y las pruebas, y repetido serian dos reglas.
     */
    EQUALIZER_BY_SONG_LIMITS: { MAX_SONGS: 200 },

    /*
     * VELOCIDAD DE REPRODUCCION.
     *
     * Dos listas que parecen la misma y no lo son. `PLAYBACK_RATES` es lo
     * que OFRECE el boton al pulsarlo; `PLAYBACK_RATE_LIMITS` es lo que
     * ACEPTA el reproductor. La primera es comodidad de la interfaz, la
     * segunda es una defensa: un comando puede llegar de otro sitio con un
     * 40 dentro, y eso deja el <video> en un estado del que YouTube Music no
     * siempre se recupera. Un valor de la lista SIEMPRE cae dentro de los
     * limites, y hay una prueba que lo vigila.
     *
     * EL ORDEN ES EL CICLO, no una ordenacion. Se recorre tal cual esta
     * escrito, asi que empieza en 1 y vuelve a 1: pulsar acelera primero
     * —que es lo que espera quien pulsa— y quien no reconozca la velocidad
     * actual aterriza en la normal, no en la lenta. Ordenarla de menor a
     * mayor "por limpieza" cambiaria el comportamiento del boton.
     *
     * LOS CUATRO NUMEROS SON CUARTOS EXACTOS (3/4, 1, 5/4, 3/2), o sea que
     * se representan sin error en binario. El ciclo busca la velocidad
     * actual con `indexOf`, que compara con `===` sobre un decimal.
     *
     * Con cuidado de no exagerar la amenaza: mientras el numero viaje COPIADO
     * —de esta lista al <video>, y de vuelta por el estado— `indexOf` acierta
     * aunque el decimal sea feo, porque ni la asignacion ni JSON pierden un
     * solo bit. Lo que rompe el `===` es CALCULAR la velocidad en vez de
     * cogerla de aqui: un `1 + 0.25 * i` o un `rate * 1.1` producen un
     * numero que ya no esta en la lista, `indexOf` devuelve -1 y el boton
     * vuelve a 1 en vez de avanzar, sin que nada avise. Mantener la lista en
     * cuartos exactos hace que ese dia no llegue.
     *
     * Por debajo de 0,5 y por encima de 2 el navegador deja de corregir el
     * tono. Se permite hasta 4 porque quien mande el comando a mano sabra lo
     * que hace, pero el boton no lo ofrece.
     */
    PLAYBACK_RATES: [1, 1.25, 1.5, 0.75],
    PLAYBACK_RATE_LIMITS: { MIN: 0.25, MAX: 4 },
    PLAYBACK_RATE_NORMAL: 1,

    /*
     * TEMPORIZADOR DE APAGADO: la musica se pausa sola pasado este rato.
     *
     * Es el mismo reparto en dos listas que la velocidad, y por el mismo
     * motivo: `SLEEP_TIMER_MINUTES` es lo que OFRECE el boton al pulsarlo,
     * `SLEEP_TIMER_LIMITS` es lo que ACEPTA el temporizador de un comando
     * que puede venir de cualquier sitio.
     *
     * EL ORDEN ES EL CICLO: apagado -> 15 -> 30 -> 60 -> apagado. El
     * "apagado" no esta en la lista a proposito —es la AUSENCIA de
     * temporizador, igual que "off" no es un preset del ecualizador— y por
     * eso el ciclo lo escribe quien pulsa el boton, no esta lista.
     *
     * Quince, treinta y sesenta y no una escala mas fina porque esto se
     * maneja a clics de UN boton en una ventana de 340 px: cada valor
     * intermedio es un clic mas para llegar al que se quiere. Tres opciones
     * cubren "una siesta", "un rato" y "hasta dormirse"; quien necesite
     * 45 min exactos puede pulsar a mitad de cancion, que para eso el
     * tiempo corre desde el clic.
     *
     * EL TOPE SON 12 HORAS y no es un numero de compromiso: por encima de
     * unos 24,8 dias (2^31 ms) un setTimeout desborda y dispara AL MOMENTO,
     * o sea que un comando absurdo pausaria la musica al instante en vez de
     * nunca. Doce horas queda comodamente lejos del desborde y ya es mas
     * larga que cualquier sesion de escucha real. Se ACOTA en vez de
     * rechazar, como la velocidad: un 40000 que llega de un comando raro es
     * un error de quien lo manda, y pausar a las 12 horas es recuperable.
     */
    SLEEP_TIMER_MINUTES: [15, 30, 60],
    SLEEP_TIMER_LIMITS: { MAX_MINUTES: 720 },

    PIP_DIMENSIONS: {
      EXPANDED: { width: 380, height: 560 },
      COMPACT: { width: 340, height: 200 },
      // Modo video: proporcion pensada para que el 16:9 quepa entero
      // encima de los controles sin recortarse.
      VIDEO: { width: 420, height: 480 }
    },

    /*
     * Umbrales de autoajuste de la ventana flotante.
     *
     * El usuario puede redimensionar la ventana a mano en cualquier
     * momento, asi que la maquetacion NO puede depender de la preferencia
     * de tamaño: depende del alto y el ancho reales, medidos en vivo
     * (ver applyDensity() en pip.js).
     *
     * Los numeros salen de sumar las filas de altura fija: cabecera 26 +
     * barra 14 + controles 42 + extras 28 + acciones 30, mas huecos y
     * relleno (~190 px) y el bloque de texto (~50 px). Con todo visible
     * hacen falta unos 240 px ANTES de dejar sitio al video o la portada.
     */
    PIP_BREAKPOINTS: {
      // Por debajo de esto no cabe la fila de extras ni el album.
      HEIGHT_TIGHT: 400,
      // Por debajo de esto solo caben portada/video, texto y controles.
      HEIGHT_MINI: 310,
      // Las etiquetas de tiempo se comen el ancho util de la barra.
      WIDTH_NARROW: 290
    },

    OBSERVER_DEBOUNCE_MS: 150,

    /*
     * Cuantas canciones de la cola se enseñan en la ventana flotante.
     * Cinco y no "todas" porque la cola de YouTube Music puede traer
     * cientos de elementos y la ventana de 340 px no es el sitio para
     * recorrerla: es el sitio para saber que viene despues. Corta el
     * LECTOR, no la interfaz: asi el estado que viaja ya pesa poco y el
     * "cuantas" vive en un solo sitio.
     */
    QUEUE_MAX_ITEMS: 5,

    LYRICS_STATUS: {
      AVAILABLE: "available",
      UNAVAILABLE: "unavailable",
      LOADING: "loading",
      ERROR: "error"
    },

    /*
     * Estado del boton "me gusta" de YouTube Music. Se lee del atributo
     * `like-status` de <ytmusic-like-button-renderer>, que es independiente
     * del idioma de la interfaz (a diferencia de los aria-label).
     */
    LIKE_STATUS: {
      LIKE: "LIKE",
      DISLIKE: "DISLIKE",
      INDIFFERENT: "INDIFFERENT"
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
