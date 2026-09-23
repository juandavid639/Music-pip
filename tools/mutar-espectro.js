/*
 * Verificacion por MUTACION de lo nuevo (espectro y solo caratula).
 *
 * Estropea el codigo a proposito, una regla cada vez, y comprueba que
 * alguna prueba se entera. Una mutacion que sobrevive es una prueba que
 * no existe, por mucho que la suite este en verde.
 *
 * Es de usar y tirar: se ejecuta a mano tras cada cambio grande y no
 * forma parte de `npm test`. Restaura siempre los archivos, incluso si
 * las pruebas revientan.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/pip-espectro.test.js",
  "tests/unit/pip-solo-caratula.test.js",
  // Las preferencias del espectro se normalizan en settings.js, asi que
  // sus pruebas entran aqui: mutar la normalizacion sin ejecutarlas seria
  // preguntar por una respuesta que nadie esta escuchando.
  "tests/unit/settings.test.js",
  // Y las tres de la ultima tanda: el atenuado tiene fichero propio y la
  // maquetacion de la letra en grande vive en las de densidad.
  "tests/unit/pip-atenuado.test.js",
  "tests/unit/pip-density.test.js",
  // Los atajos de teclado y el tamaño recordado.
  "tests/unit/pip-atajos.test.js",
  "tests/unit/pip-tamano-recordado.test.js"
];

const MUTACIONES = [
  {
    etiqueta: "puedeMedirse deja pasar el audio cifrado",
    archivo: "src/content/audio-spectrum.js",
    de: '!video.mediaKeys && typeof video.captureStream === "function"',
    a: 'typeof video.captureStream === "function"'
  },
  {
    etiqueta: "puedeMedirse no exige captureStream",
    archivo: "src/content/audio-spectrum.js",
    de: '!video.mediaKeys && typeof video.captureStream === "function"',
    a: "!video.mediaKeys"
  },
  {
    etiqueta: "el reparto de barras vuelve a ser lineal",
    archivo: "src/content/audio-spectrum.js",
    de: "Math.round(Math.pow(numBandas, i / barras))",
    a: "Math.round((numBandas * i) / barras)"
  },
  {
    etiqueta: "los cortes pueden repetirse (barras vacias)",
    archivo: "src/content/audio-spectrum.js",
    de: "Math.min(numBandas, Math.max(cortes[i - 1] + 1, logaritmico))",
    a: "Math.min(numBandas, logaritmico)"
  },
  {
    etiqueta: "cada barra pasa a ser el maximo de su grupo, no la media",
    archivo: "src/content/audio-spectrum.js",
    de: "salida.push(suma / (hasta - desde));",
    a: "salida.push(Math.max.apply(null, valores.slice(desde, hasta)));"
  },
  {
    etiqueta: "el suavizado deja de frenar la bajada",
    archivo: "src/content/audio-spectrum.js",
    de: "return Math.max(objetivo, anterior - caida);",
    a: "return objetivo;"
  },
  {
    etiqueta: "conectar se queda pegado al <video> anterior",
    archivo: "src/content/audio-spectrum.js",
    de: "if (video === elementoConectado && analizador && !pistaTerminada() && !fuenteCambio(video)) {",
    a: "if (analizador && !pistaTerminada() && !fuenteCambio(video)) {"
  },
  {
    etiqueta: "barrasParaAncho pierde el tope de arriba",
    archivo: "src/pip/pip.js",
    de: "Math.max(BARRAS_MIN, Math.min(BARRAS_MAX, Math.floor(ancho / ANCHO_POR_BARRA)))",
    a: "Math.max(BARRAS_MIN, Math.floor(ancho / ANCHO_POR_BARRA))"
  },
  {
    etiqueta: "barrasParaAncho pierde el tope de abajo",
    archivo: "src/pip/pip.js",
    de: "Math.max(BARRAS_MIN, Math.min(BARRAS_MAX, Math.floor(ancho / ANCHO_POR_BARRA)))",
    a: "Math.min(BARRAS_MAX, Math.floor(ancho / ANCHO_POR_BARRA))"
  },
  {
    etiqueta: "el espectro sigue encendido con la letra en grande",
    archivo: "src/pip/pip.js",
    de: "espectroPedido && !letraEnGrande && YTMPip.Espectro.conectar(media)",
    a: "espectroPedido && YTMPip.Espectro.conectar(media)"
  },
  {
    etiqueta: "el espectro se enciende sin conectar el analizador",
    archivo: "src/pip/pip.js",
    de: "espectroPedido && !letraEnGrande && YTMPip.Espectro.conectar(media)",
    a: "espectroPedido && !letraEnGrande"
  },
  {
    etiqueta: "apagar el espectro no suelta el AudioContext",
    archivo: "src/pip/pip.js",
    de: "if (!espectroPedido) YTMPip.Espectro.desconectar();",
    a: ";"
  },
  {
    etiqueta: "el boton del espectro se ofrece siempre",
    archivo: "src/pip/pip.js",
    de: "els.spectrumToggle.hidden = !espectroDisponible;",
    a: "els.spectrumToggle.hidden = false;"
  },
  {
    etiqueta: "la clase de solo caratula no se pone nunca",
    archivo: "src/pip/pip.js",
    de: 'els.root.classList.toggle("ytmpip-sin-texto", soloCaratula);',
    a: 'els.root.classList.toggle("ytmpip-sin-texto", false);'
  },
  {
    etiqueta: "el boton Aa mueve ademas la eleccion del escenario",
    archivo: "src/pip/pip.js",
    de: "soloCaratula = !soloCaratula;\n    if (lastState) render(lastState);",
    a: "soloCaratula = !soloCaratula;\n    coverPorPeticion = !coverPorPeticion;\n    if (lastState) render(lastState);"
  },
  {
    etiqueta: "solo caratula se reinicia con cada cancion",
    archivo: "src/pip/pip.js",
    de: 'els.root.classList.toggle("ytmpip-sin-texto", soloCaratula);',
    a: 'els.root.classList.toggle("ytmpip-sin-texto", soloCaratula);\n    soloCaratula = false;'
  },
  {
    etiqueta: "vuelve la guarda antigua: solo mira el elemento (el fallo reportado)",
    archivo: "src/content/audio-spectrum.js",
    de: "    if (video === elementoConectado && analizador && !pistaTerminada() && !fuenteCambio(video)) {",
    a: "    if (video === elementoConectado && analizador) {"
  },
  {
    etiqueta: "la pista capturada no se guarda: nunca consta que muera",
    archivo: "src/content/audio-spectrum.js",
    de: "      pistaConectada = stream.getAudioTracks()[0];",
    a: ""
  },
  {
    etiqueta: "pistaTerminada pregunta al reves: remonta el analizador cada fotograma",
    archivo: "src/content/audio-spectrum.js",
    de: '    return Boolean(pistaConectada) && pistaConectada.readyState === "ended";',
    a: '    return !(pistaConectada && pistaConectada.readyState === "live");'
  },
  {
    /*
     * SOBREVIVE a proposito, y se deja en la lista para que siga
     * diciendolo. La razon de que la linea se quede pese a no ser
     * observable esta escrita junto a la propia linea.
     */
    etiqueta: "desconectar olvida la pista (sobrevive a proposito, ver el comentario del codigo)",
    archivo: "src/content/audio-spectrum.js",
    de: "     */\n    pistaConectada = null;",
    a: "     */"
  },
  {
    etiqueta: "un contexto suspendido despues de montarlo ya no se reanuda",
    archivo: "src/content/audio-spectrum.js",
    de: '      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});\n      return true;',
    a: "      return true;"
  },

  /* ---------- Preferencias del espectro ---------- */

  {
    etiqueta: "entero deja de mirar el rango: cualquier numero vale",
    archivo: "src/shared/settings.js",
    de: "return redondeado >= min && redondeado <= max ? redondeado : fallback;",
    a: "return redondeado;"
  },
  {
    etiqueta: "entero rechaza los decimales en vez de redondearlos",
    archivo: "src/shared/settings.js",
    de: "const redondeado = Math.round(n);",
    a: "const redondeado = n;"
  },
  {
    /*
     * SOBREVIVE, y es la segunda vez que este proyecto se topa con una
     * linea asi. Quitarla no cambia nada HOY porque el valor por defecto
     * de spectrumBars es justo "auto": el camino largo (NaN -> fallback)
     * devuelve lo mismo que el corto. Se queda porque `normalizarBarras`
     * promete "auto o un numero valido", y hacer que eso dependa del valor
     * que casualmente tenga otra constante es apoyarse en una coincidencia.
     */
    etiqueta: 'normalizarBarras no aparta "auto" (sobrevive: coincide con el valor por defecto)',
    archivo: "src/shared/settings.js",
    de: '    if (value === "auto") return "auto";\n',
    a: ""
  },
  {
    etiqueta: "normalizarColor acepta la forma corta #abc, que fillStyle lee distinta",
    archivo: "src/shared/settings.js",
    de: "/^#[0-9a-fA-F]{6}$/.test(value)",
    a: "/^#[0-9a-fA-F]{3,6}$/.test(value)"
  },
  {
    etiqueta: "normalizarColor no normaliza a minusculas",
    archivo: "src/shared/settings.js",
    de: "return value.toLowerCase();",
    a: "return value;"
  },
  {
    etiqueta: "normalizarColor acepta cualquier cadena",
    archivo: "src/shared/settings.js",
    de: 'if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();',
    a: 'if (typeof value === "string") return value.toLowerCase();'
  },
  {
    etiqueta: "unirBarras deja de acotar: guarda lo que se escriba",
    archivo: "src/shared/settings.js",
    de: "return Math.min(SPECTRUM_LIMITS.BARS_MAX, Math.max(SPECTRUM_LIMITS.BARS_MIN, Math.round(n)));",
    a: "return Math.round(n);"
  },
  {
    etiqueta: "unirBarras vuelve a tratar la casilla vacia como un cero",
    archivo: "src/shared/settings.js",
    de: '    const texto = String(numero).trim();\n    const n = texto === "" ? NaN : Number(texto);',
    a: "    const n = Number(numero);"
  },
  {
    etiqueta: "unirBarras ignora el modo y siempre guarda un numero",
    archivo: "src/shared/settings.js",
    de: 'if (modo !== "fixed") return "auto";',
    a: ";"
  },
  {
    etiqueta: "unirColor ignora el modo y guarda siempre el color del cuentagotas",
    archivo: "src/shared/settings.js",
    de: 'return modo === "custom" ? color : modo;',
    a: "return color;"
  },
  {
    /*
     * La duplicacion que unirColor evita, ahora que hay tres modos: volver
     * a escribir "accent" a mano hace que elegir el arcoiris guarde el
     * color de siempre, o sea que la opcion nueva no se pueda seleccionar.
     */
    etiqueta: "unirColor vuelve a escribir accent a mano y se traga el modo rgb",
    archivo: "src/shared/settings.js",
    de: 'return modo === "custom" ? color : modo;',
    a: 'return modo === "custom" ? color : "accent";'
  },
  {
    etiqueta: "partirBarras deja la casilla vacia al elegir un numero fijo",
    archivo: "src/shared/settings.js",
    de: "? { modo: \"auto\", numero: SPECTRUM_LIMITS.BARS_SUGGESTED }",
    a: '? { modo: "auto", numero: "" }'
  },
  {
    etiqueta: "partirColor mete el nombre del modo dentro del cuentagotas",
    archivo: "src/shared/settings.js",
    de: "      : { modo: limpio, color: SPECTRUM_LIMITS.COLOR_SUGGESTED };",
    a: "      : { modo: limpio, color: limpio };"
  },
  {
    etiqueta: "partirColor decide el modo por el nombre y no por la forma del valor",
    archivo: "src/shared/settings.js",
    de: 'return limpio.charAt(0) === "#"',
    a: 'return limpio !== "accent"'
  },
  {
    etiqueta: "barrasParaAncho ignora el numero elegido en preferencias",
    archivo: "src/pip/pip.js",
    de: "    if (Number.isFinite(preferidas)) return preferidas;\n",
    a: ""
  },
  {
    etiqueta: "leerBarras ignora la velocidad y usa siempre la de fabrica",
    archivo: "src/content/audio-spectrum.js",
    de: "alturas[i] = suavizar(alturas[i], crudas[i], velocidad);",
    a: "alturas[i] = suavizar(alturas[i], crudas[i], CAIDA_POR_FOTOGRAMA);"
  },
  {
    etiqueta: "leerBarras sin velocidad se queda sin caida (barras clavadas arriba)",
    archivo: "src/content/audio-spectrum.js",
    de: "const velocidad = Number.isFinite(caida) ? caida : CAIDA_POR_FOTOGRAMA;",
    a: "const velocidad = caida;"
  },
  {
    etiqueta: "el bucle de dibujo no le pasa el numero de barras preferido",
    archivo: "src/pip/pip.js",
    de: "barrasParaAncho(caja.width, preferencias.spectrumBars),",
    a: "barrasParaAncho(caja.width),"
  },
  {
    etiqueta: "el bucle de dibujo no le pasa la velocidad preferida",
    archivo: "src/pip/pip.js",
    de: "      preferencias.spectrumFall\n",
    a: ""
  },
  {
    etiqueta: "el bucle de dibujo vuelve a leer el acento en vez del color del espectro",
    archivo: "src/pip/pip.js",
    de: 'getPropertyValue("--ytmpip-spectrum-color")',
    a: 'getPropertyValue("--ytmpip-accent")'
  },
  {
    etiqueta: "applySettings no escribe el alto del espectro",
    archivo: "src/pip/pip.js",
    de: '    els.root.style.setProperty("--ytmpip-spectrum-height", settings.spectrumHeight + "%");\n',
    a: ""
  },
  {
    etiqueta: "applySettings solo escribe el color cuando es propio (se queda pegado)",
    archivo: "src/pip/pip.js",
    de: '    els.root.style.setProperty(\n      "--ytmpip-spectrum-color",\n      YTMPip.Settings.partirColor(settings.spectrumColor).modo === "custom"\n        ? settings.spectrumColor\n        : "var(--ytmpip-accent)"\n    );',
    a: '    if (YTMPip.Settings.partirColor(settings.spectrumColor).modo === "custom") {\n      els.root.style.setProperty("--ytmpip-spectrum-color", settings.spectrumColor);\n    }'
  },
  {
    /*
     * La duplicacion que partirColor existe para evitar: enumerar aqui los
     * modos que NO son un color. Con esta mutacion, "rgb" se cuela en la
     * variable CSS como si fuera un color y el navegador tira la
     * declaracion entera.
     */
    etiqueta: "applySettings vuelve a enumerar los modos en vez de preguntarle a partirColor",
    archivo: "src/pip/pip.js",
    de: '      YTMPip.Settings.partirColor(settings.spectrumColor).modo === "custom"',
    a: '      settings.spectrumColor !== "accent"'
  },
  /*
   * El fallo reportado en su SEGUNDA forma: cambiar de cancion a mano. La
   * primera de estas cuatro es, literalmente, el codigo que tenia el fallo.
   */
  {
    etiqueta: "conectar deja de mirar la fuente (el fallo del cambio de cancion a mano)",
    archivo: "src/content/audio-spectrum.js",
    de: "!pistaTerminada() && !fuenteCambio(video)",
    a: "!pistaTerminada()"
  },
  {
    etiqueta: "el hueco sin fuente cuenta como fuente nueva (un AudioContext por refresco)",
    archivo: "src/content/audio-spectrum.js",
    de: "if (!actual || !fuenteConectada) return false;",
    a: "if (!fuenteConectada) return false;"
  },
  {
    etiqueta: "fuenteCambio compara al reves: se remonta cuando la fuente es la misma",
    archivo: "src/content/audio-spectrum.js",
    de: "return actual !== fuenteConectada;",
    a: "return actual === fuenteConectada;"
  },
  {
    etiqueta: "desconectar se queda con la fuente apuntada (sobrevive a proposito, como la pista)",
    archivo: "src/content/audio-spectrum.js",
    de: '    fuenteConectada = "";\n    alturas = [];',
    a: "    alturas = [];"
  },

  /* ---------- El arcoiris que gira ---------- */

  {
    etiqueta: "el arcoiris se queda quieto (solo reparto, sin giro)",
    archivo: "src/pip/pip.js",
    de: "const giro = ((ms % RGB_PERIODO_MS) / RGB_PERIODO_MS) * 360;",
    a: "const giro = 0;"
  },
  {
    etiqueta: "el espectro entero se pinta de un color liso (solo giro, sin reparto)",
    archivo: "src/pip/pip.js",
    de: "const reparto = total > 1 ? (indice / (total - 1)) * RGB_ARCO : 0;",
    a: "const reparto = 0;"
  },
  {
    etiqueta: "una sola barra divide por cero y sale sin pintar",
    archivo: "src/pip/pip.js",
    de: "const reparto = total > 1 ? (indice / (total - 1)) * RGB_ARCO : 0;",
    a: "const reparto = (indice / (total - 1)) * RGB_ARCO;"
  },
  {
    etiqueta: "el tono se sale de la rueda al cabo de un rato (sin cerrar la vuelta)",
    archivo: "src/pip/pip.js",
    de: "return (giro + reparto) % 360;",
    a: "return giro + reparto;"
  },
  {
    etiqueta: "el arco cierra la vuelta entera: los dos extremos del espectro coinciden",
    archivo: "src/pip/pip.js",
    de: "const RGB_ARCO = 300;",
    a: "const RGB_ARCO = 360;"
  },
  {
    etiqueta: "el modo rgb deja de pintar barra a barra (vuelve al color fijo)",
    archivo: "src/pip/pip.js",
    de: 'const ciclico = preferencias.spectrumColor === "rgb";',
    a: "const ciclico = false;"
  },
  {
    etiqueta: 'normalizarColor no conoce "rgb": el modo nuevo cae al de siempre',
    archivo: "src/shared/settings.js",
    de: 'if (value === "accent" || value === "rgb") return value;',
    a: 'if (value === "accent") return value;'
  },

  /* ---------- Atenuar la ventana mientras suena ---------- */

  {
    etiqueta: "la ventana se atenua tambien en pausa",
    archivo: "src/pip/pip.js",
    de: "if (!sonando || !(transparencia > 0)) return 1;",
    a: "if (!(transparencia > 0)) return 1;"
  },
  {
    etiqueta: "el porcentaje se lee al reves: 20 % pedido deja la ventana al 20 %",
    archivo: "src/pip/pip.js",
    de: "return (100 - transparencia) / 100;",
    a: "return transparencia / 100;"
  },
  {
    etiqueta: "vuelve la resta con coma flotante (0.19999999999999996 dentro del CSS)",
    archivo: "src/pip/pip.js",
    de: "return (100 - transparencia) / 100;",
    a: "return 1 - transparencia / 100;"
  },
  {
    etiqueta: "render deja de atenuar: la preferencia no se nota nunca",
    archivo: "src/pip/pip.js",
    de: "aplicarAtenuado(state.playing, YTMPip.Settings.get().pipTransparency);",
    a: ";"
  },
  {
    etiqueta: "render atenua siempre, sin mirar si suena",
    archivo: "src/pip/pip.js",
    de: "aplicarAtenuado(state.playing, YTMPip.Settings.get().pipTransparency);",
    a: "aplicarAtenuado(true, YTMPip.Settings.get().pipTransparency);"
  },
  {
    etiqueta: "cambiar el porcentaje en opciones no se nota hasta el estado siguiente",
    archivo: "src/pip/pip.js",
    de: "if (lastState) aplicarAtenuado(lastState.playing, settings.pipTransparency);",
    a: ";"
  },
  {
    etiqueta: "applySettings vuelve a la cache en vez de usar las preferencias que recibe",
    archivo: "src/pip/pip.js",
    de: "if (lastState) aplicarAtenuado(lastState.playing, settings.pipTransparency);",
    a: "if (lastState) aplicarAtenuado(lastState.playing, YTMPip.Settings.get().pipTransparency);"
  },
  {
    etiqueta: "el atenuado pierde su tope: se puede pedir la ventana entera invisible",
    archivo: "src/shared/settings.js",
    de: "        PIP_LIMITS.TRANSPARENCY_MAX,",
    a: "        100,"
  },

  /* ---------- La letra en grande superpone los mandos ---------- */

  {
    etiqueta: "la letra en grande deja de superponer (el sintoma reportado, tal cual)",
    archivo: "src/pip/pip.js",
    de: "const overlay = Boolean(letraEnGrande) || (mini && hasVideo);",
    a: "const overlay = mini && hasVideo;"
  },
  {
    etiqueta: "superponer la letra no apaga la fila compacta: dos familias de CSS a la vez",
    archivo: "src/pip/pip.js",
    de: "compact: mini && !hasVideo && !overlay,",
    a: "compact: mini && !hasVideo,"
  },
  {
    etiqueta: "superponer la letra no apaga la columna: dos familias de CSS a la vez",
    archivo: "src/pip/pip.js",
    de: "expanded: !mini && !hasVideo && !overlay,",
    a: "expanded: !mini && !hasVideo,"
  },
  {
    etiqueta: "el argumento nuevo se ignora: layoutFor vuelve a decidir sin la letra",
    archivo: "src/pip/pip.js",
    de: "const overlay = Boolean(letraEnGrande) || (mini && hasVideo);",
    a: "const overlay = Boolean(undefined) || (mini && hasVideo);"
  },
  {
    /*
     * SOBREVIVE, y hay que decir por que en vez de dejarlo como sorpresa:
     * applyDensity necesita una ventana flotante de verdad para medirse, y
     * eso jsdom no lo tiene. La linea que lee la clase es la union entre la
     * decision (probada) y el CSS (mirado en la vista previa), y no hay
     * ninguna prueba en medio. Se deja apuntada para que el dia que se
     * pueda montar esa ventana, ya este escrito lo que falta.
     */
    etiqueta: "applyDensity no lee la clase de la letra (sobrevive: hace falta una ventana PiP real)",
    archivo: "src/pip/pip.js",
    de: '      els.root.classList.contains("ytmpip-lyrics-stage")',
    a: "      false"
  },

  /* ---------- Atajos de teclado ---------- */

  {
    etiqueta: "los atajos se quedan con Ctrl+P y Alt+Flecha",
    archivo: "src/pip/pip.js",
    de: "if (pulsacion.ctrl || pulsacion.alt || pulsacion.meta) return null;",
    a: ";"
  },
  {
    etiqueta: "escribir en un campo de texto vuelve a pausar y silenciar",
    archivo: "src/pip/pip.js",
    de: "if (donde.etiqueta === \"input\" && TIPOS_QUE_NO_ESCRIBEN.indexOf(donde.tipo) === -1) return null;",
    a: ";"
  },
  {
    etiqueta: "la lista de tipos se lee al reves: solo hay atajos donde se escribe",
    archivo: "src/pip/pip.js",
    de: "TIPOS_QUE_NO_ESCRIBEN.indexOf(donde.tipo) === -1",
    a: "TIPOS_QUE_NO_ESCRIBEN.indexOf(donde.tipo) !== -1"
  },
  {
    etiqueta: "un div editable deja de contar como campo de texto",
    archivo: "src/pip/pip.js",
    de: "    if (donde.editable) return null;",
    a: "    ;"
  },
  {
    etiqueta: "el volumen se queda con las flechas de la barra de tiempo",
    archivo: "src/pip/pip.js",
    de: "if (deslizador && esFlecha) return null;",
    a: ";"
  },
  {
    etiqueta: "el espacio sobre un boton enfocado pausa en vez de pulsarlo",
    archivo: "src/pip/pip.js",
    de: 'if (esBoton && tecla === " ") return null;',
    a: ";"
  },
  {
    etiqueta: "solo cuentan los <button>: las lineas de la letra dejan de serlo",
    archivo: "src/pip/pip.js",
    de: 'const esBoton = donde.etiqueta === "button" || donde.rol === "button";',
    a: 'const esBoton = donde.etiqueta === "button";'
  },
  {
    etiqueta: "las mayusculas dejan de valer (con Bloq Mayus no hay atajos)",
    archivo: "src/pip/pip.js",
    de: "const tecla = pulsacion.key.length === 1 ? pulsacion.key.toLowerCase() : pulsacion.key;",
    a: "const tecla = pulsacion.key;"
  },
  {
    etiqueta: "se pasa TODO a minusculas: ArrowUp deja de existir",
    archivo: "src/pip/pip.js",
    de: "const tecla = pulsacion.key.length === 1 ? pulsacion.key.toLowerCase() : pulsacion.key;",
    a: "const tecla = pulsacion.key.toLowerCase();"
  },
  {
    etiqueta: "el mapa se consulta sin guardia: una tecla cualquiera devuelve basura",
    archivo: "src/pip/pip.js",
    de: "if (!Object.prototype.hasOwnProperty.call(ATAJOS, tecla)) return null;",
    a: ";"
  },
  {
    etiqueta: "mantener la 'n' pulsada salta treinta canciones",
    archivo: "src/pip/pip.js",
    de: "if (pulsacion.repetida && ADMITEN_REPETICION.indexOf(accion) === -1) return null;",
    a: ";"
  },
  {
    etiqueta: "ninguna accion admite repeticion: no se puede subir el volumen manteniendo la flecha",
    archivo: "src/pip/pip.js",
    de: 'const ADMITEN_REPETICION = ["adelantar", "retroceder", "subirVolumen", "bajarVolumen"];',
    a: "const ADMITEN_REPETICION = [];"
  },
  {
    etiqueta: "el atajo no corta el evento: el espacio pausa Y hace scroll",
    archivo: "src/pip/pip.js",
    de: "    event.preventDefault();\n    ACCIONES[accion]();",
    a: "    ACCIONES[accion]();"
  },
  {
    etiqueta: "el teclado no se cablea: los atajos no existen",
    archivo: "src/pip/pip.js",
    de: 'doc.addEventListener("keydown", manejarAtajo);',
    a: ";"
  },
  {
    etiqueta: "las flechas mueven el volumen de uno en uno",
    archivo: "src/pip/pip.js",
    de: "const PASO_VOLUMEN = 5;",
    a: "const PASO_VOLUMEN = 1;"
  },
  {
    etiqueta: "el volumen se sale del rango (se puede pedir un 105 %)",
    archivo: "src/pip/pip.js",
    de: "const nivel = Math.min(100, Math.max(0, Math.round(porcentaje)));",
    a: "const nivel = Math.round(porcentaje);"
  },
  {
    etiqueta: "la musica sube pero el deslizador se queda quieto",
    archivo: "src/pip/pip.js",
    de: "      els.volume.value = nivel;\n      paintSlider(els.volume);",
    a: "      paintSlider(els.volume);"
  },
  {
    etiqueta: "el arrastre del volumen se sale de mandarVolumen y vuelve a decidir por su cuenta",
    archivo: "src/pip/pip.js",
    de: "        mandarVolumen(Number(els.volume.value));",
    a: "        runCommand(COMMAND_TYPES.SET_VOLUME, { level: Number(els.volume.value) / 200 });"
  },
  {
    etiqueta: "adelantar deja de leer los segundos de las preferencias",
    archivo: "src/pip/pip.js",
    de: "  function adelantar() {\n    runCommand(COMMAND_TYPES.SEEK_FORWARD, { seconds: YTMPip.Settings.get().seekSeconds });",
    a: "  function adelantar() {\n    runCommand(COMMAND_TYPES.SEEK_FORWARD, { seconds: 10 });"
  },

  /* ---------- La ventana recuerda su tamaño ---------- */

  {
    etiqueta: "una anotacion diminuta abre una ventana sin borde que agarrar",
    archivo: "src/shared/settings.js",
    de: "      width: Math.min(PIP_LIMITS.WIDTH_MAX, Math.max(PIP_LIMITS.WIDTH_MIN, Math.round(w))),",
    a: "      width: Math.round(w),"
  },
  {
    etiqueta: "el alto anotado pierde sus topes",
    archivo: "src/shared/settings.js",
    de: "      height: Math.min(PIP_LIMITS.HEIGHT_MAX, Math.max(PIP_LIMITS.HEIGHT_MIN, Math.round(h)))",
    a: "      height: Math.round(h)"
  },
  {
    etiqueta: "un tamaño negativo o cero cuenta como tamaño",
    archivo: "src/shared/settings.js",
    de: "    if (w <= 0 || h <= 0) return null;",
    a: "    ;"
  },
  {
    etiqueta: "un NaN guardado en storage cuenta como tamaño",
    archivo: "src/shared/settings.js",
    de: "    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;",
    a: "    ;"
  },
  {
    etiqueta: "el tamaño guardado no pasa por la criba al cargarse",
    archivo: "src/shared/settings.js",
    de: "      pipLastSize: normalizarTamano(stored[STORAGE_KEYS.PIP_LAST_SIZE]),",
    a: "      pipLastSize: stored[STORAGE_KEYS.PIP_LAST_SIZE] || null,"
  },
  {
    etiqueta: "«el ultimo» sin ninguno anotado revienta al abrir la ventana",
    archivo: "src/pip/pip.js",
    de: 'if (pipSize === "last" && ultimo) {',
    a: 'if (pipSize === "last") {'
  },
  {
    etiqueta: "una ventana recordada grande nace sin ampliar: el boton ⤢ la encoge",
    archivo: "src/pip/pip.js",
    de: "        expandida: ultimo.height >= PIP_DIMENSIONS.EXPANDED.height",
    a: "        expandida: false"
  },
  {
    etiqueta: "el umbral de «ya esta ampliada» se corre un pixel",
    archivo: "src/pip/pip.js",
    de: "        expandida: ultimo.height >= PIP_DIMENSIONS.EXPANDED.height",
    a: "        expandida: ultimo.height > PIP_DIMENSIONS.EXPANDED.height"
  },
  {
    etiqueta: "«ya esta ampliada» se decide por el ancho, que no es lo que el boton enseña",
    archivo: "src/pip/pip.js",
    de: "        expandida: ultimo.height >= PIP_DIMENSIONS.EXPANDED.height",
    a: "        expandida: ultimo.width >= PIP_DIMENSIONS.EXPANDED.width"
  },
  {
    etiqueta: "«el ultimo» se impone a la preferencia elegida",
    archivo: "src/pip/pip.js",
    de: 'if (pipSize === "last" && ultimo) {',
    a: "if (ultimo) {"
  },
  {
    etiqueta: "anotar el tamaño no toca la cache: reabrir usa el de anteayer",
    archivo: "src/shared/settings.js",
    de: "    cache = Object.assign({}, cache, { pipLastSize: limpio });",
    a: "    ;"
  },
  {
    etiqueta: "anotar el tamaño no llega a storage: se olvida al recargar",
    archivo: "src/shared/settings.js",
    de: "      chrome.storage.local.set({ [STORAGE_KEYS.PIP_LAST_SIZE]: limpio });",
    a: "      ;"
  },
  {
    etiqueta: "una medida imposible borra la anotacion buena",
    archivo: "src/shared/settings.js",
    de: "    if (!limpio) return null;",
    a: "    ;"
  },
  {
    etiqueta: "mover el borde vuelve a repasar tema, espectro, atenuado y video",
    archivo: "src/shared/settings.js",
    de: "    (key) => key !== STORAGE_KEYS.PIP_LAST_SIZE",
    a: "    () => true"
  },
  {
    etiqueta: "la excepcion se lleva por delante TODOS los cambios en vivo",
    archivo: "src/shared/settings.js",
    de: "        const relevant = CLAVES_QUE_SE_APLICAN.some((key) => key in changes);",
    a: "        const relevant = false;"
  },
  {
    etiqueta: "se anota el hueco interior: la ventana encoge una sesion tras otra",
    archivo: "src/pip/pip.js",
    de: "    const width = pipWindow.outerWidth || pipWindow.innerWidth || 0;",
    a: "    const width = pipWindow.innerWidth || 0;"
  },
  {
    // La misma trampa que la de arriba, pero por el otro lado. Van en
    // pareja a proposito: la primera version de la prueba media el alto
    // y no el ancho, asi que la del ancho sobrevivio. Con las dos
    // mutaciones puestas, olvidarse de una dimension se nota.
    etiqueta: "el alto anotado sale del hueco interior",
    archivo: "src/pip/pip.js",
    de: "    const height = pipWindow.outerHeight || pipWindow.innerHeight || 0;",
    a: "    const height = pipWindow.innerHeight || 0;"
  },
  {
    etiqueta: "sin exterior no se anota nada en vez de caer al interior",
    archivo: "src/pip/pip.js",
    de: "    const height = pipWindow.outerHeight || pipWindow.innerHeight || 0;",
    a: "    const height = pipWindow.outerHeight || 0;"
  },
  {
    etiqueta: "redimensionar deja de anotar el tamaño",
    archivo: "src/pip/pip.js",
    de: "    applyDensity();\n    anotarTamanoPronto();",
    a: "    applyDensity();"
  },
  {
    etiqueta: "el vigilante no escucha el resize de la ventana",
    archivo: "src/pip/pip.js",
    de: 'pipWindow.addEventListener("resize", alRedimensionar);',
    a: ";"
  },
  {
    etiqueta: "se anota en cada tiron del borde, sin esperar a que suelte",
    archivo: "src/pip/pip.js",
    de: "    anotarTamanoTimer = pipWindow.setTimeout(anotarTamanoYa, ESPERA_ANOTAR_TAMANO_MS);",
    a: "    anotarTamanoYa();"
  },
  {
    /*
     * SOBREVIVE, y por el mismo motivo que la de applyDensity: el manejador
     * de "pagehide" se registra dentro de openPip, y openPip necesita
     * documentPictureInPicture.requestWindow(), que jsdom no tiene. El
     * banco de pruebas puede llamar a anotarTamanoYa —y lo hace, hay una
     * prueba— pero no puede comprobar que sea el CIERRE quien lo llama.
     *
     * Lo que se pierde si esta linea desaparece: quien mueve el borde y
     * cierra la ventana dentro del medio segundo del rebote se queda sin
     * anotar. No es catastrofico y por eso se deja apuntado en vez de
     * inventar un andamio para probarlo.
     */
    etiqueta: "cerrar recien movido el borde pierde el tamaño (sobrevive: pagehide vive en openPip)",
    archivo: "src/pip/pip.js",
    de: "      anotarTamanoYa();\n      // Devolver el video ANTES de soltar la ventana",
    a: "      // Devolver el video ANTES de soltar la ventana"
  }
];

/*
 * Devuelve QUE pruebas caen, no solo si cae alguna. El README pide un
 * recuento por mutacion, y contarlas a mano seria inventarselas: se leen
 * las lineas "not ok" del TAP que escribe `node --test`.
 */
function pruebasQueFallan() {
  let salida;
  try {
    // El reporter se pide a mano: Node 24 usa `spec` aunque la salida vaya a
    // una tuberia, y `spec` no da nombres que se puedan leer con una regla.
    salida = execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...PRUEBAS], {
      cwd: RAIZ,
      stdio: "pipe",
      encoding: "utf8"
    });
    return [];
  } catch (err) {
    salida = String(err.stdout || "");
  }
  const nombres = [];
  for (const linea of salida.split(/\r?\n/)) {
    const m = /^\s*not ok \d+ - (.+?)\s*$/.exec(linea);
    // El TAP marca tambien el fichero entero como "not ok"; esa no es una
    // prueba, es el contenedor.
    if (m && !m[1].endsWith(".test.js")) nombres.push(m[1]);
  }
  return nombres;
}

function pruebasPasan() {
  return pruebasQueFallan().length === 0;
}

let sobreviven = 0;
let muertas = 0;

if (!pruebasPasan()) {
  console.error("La suite no esta en verde SIN mutar. Arregla eso antes de mutar nada.");
  process.exit(1);
}

for (const m of MUTACIONES) {
  const ruta = path.join(RAIZ, m.archivo);
  const original = fs.readFileSync(ruta, "utf8");
  if (!original.includes(m.de)) {
    console.error(`  ??  ${m.etiqueta}\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);
    sobreviven++;
    continue;
  }
  fs.writeFileSync(ruta, original.replace(m.de, m.a));
  let caidas;
  try {
    caidas = pruebasQueFallan();
  } finally {
    fs.writeFileSync(ruta, original);
  }
  if (!caidas.length) {
    sobreviven++;
    console.error(`  VIVE  ${m.etiqueta}`);
  } else {
    muertas++;
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.join(" | ")}`);
  }
}

console.log(`\n${muertas} de ${MUTACIONES.length} mutaciones detectadas; ${sobreviven} sobreviven.`);
process.exit(sobreviven ? 1 : 0);
