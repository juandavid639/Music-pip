/*
 * Verificacion por MUTACION del grafo de audio.
 *
 * Estropea el cableado a proposito, una regla cada vez, y comprueba que alguna
 * prueba se entera. Una mutacion que sobrevive es una prueba que no existe,
 * por mucho que la suite este en verde.
 *
 * AQUI LA MUTACION QUE IMPORTA NO ES LA QUE SUENA MAL, ES LA QUE NO SUENA.
 * En src/shared/ecualizador.js lo peor que puede hacer una mutacion es
 * distorsionar. Aqui lo peor que puede hacer es dejar a alguien SIN AUDIO
 * hasta que recargue la pestaña, porque createMediaElementSource no se
 * deshace. Las cuatro reglas que protegen de eso —no cruzar sin permiso, no
 * cruzar dos veces, dar salida antes de nada, puentear en vez de deshacer—
 * van las primeras a proposito. Si alguna de esas sobrevive, no importa lo
 * verde que este todo lo demas.
 *
 * Y ninguna de las cuatro se nota probando a mano: con la cancion ya sonando
 * y el ecualizador ya encendido, un grafo mal cableado suena exactamente
 * igual que uno bien cableado hasta que cambia la cancion, se va la pestaña al
 * fondo o alguien le da al interruptor.
 *
 * Mismo arnes que tools/mutar-ecualizador.js: de usar y tirar, fuera de
 * `npm test`, y restaura los archivos pase lo que pase.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PRUEBAS = [
  "tests/unit/audio-grafo.test.js",
  "tests/unit/espectro-y-grafo.test.js",
  "tests/unit/ecualizador.test.js"
];
const GRAFO = "src/content/audio-grafo.js";
const ESPECTRO = "src/content/audio-spectrum.js";

const MUTACIONES = [
  /* ---------- las cuatro que dejan a alguien sin musica ---------- */
  {
    etiqueta: "PUERTA: apagado tambien cruza (el que no lo quiere se lo come igual)",
    archivo: GRAFO,
    de: "    if (!plan) {",
    a: "    if (!plan && false) {"
  },
  {
    etiqueta: "PUERTA: la fuente se queda sin salida al cruzar",
    archivo: GRAFO,
    de: "      nueva.connect(c.destination);",
    a: "      ;"
  },
  {
    etiqueta: "PUERTA: no se recuerda la fuente y se intenta cruzar dos veces",
    archivo: GRAFO,
    de: "    fuentes.set(video, nueva);",
    a: "    ;"
  },
  {
    etiqueta: "PUERTA: la fuente guardada no se reutiliza",
    archivo: GRAFO,
    de: "    const guardada = fuentes.get(video);\n    if (guardada) return guardada;",
    a: "    const guardada = fuentes.get(video);"
  },
  {
    etiqueta: "PUERTA: apagar deja la fuente colgando en vez de puentear",
    archivo: GRAFO,
    de: '      fuente.connect(c.destination);\n    } catch (err) {\n      console.warn("[YTMPip] No se pudo puentear',
    a: '      ;\n    } catch (err) {\n      console.warn("[YTMPip] No se pudo puentear'
  },
  {
    etiqueta: "PUERTA: apagar cierra el contexto (creyendo que eso deshace algo)",
    archivo: GRAFO,
    de: '      fuente.connect(c.destination);\n    } catch (err) {\n      console.warn("[YTMPip] No se pudo puentear',
    a: '      c.close();\n    } catch (err) {\n      console.warn("[YTMPip] No se pudo puentear'
  },
  {
    etiqueta: "PUERTA: al cambiar de cancion el elemento anterior se queda mudo",
    archivo: GRAFO,
    de: "      fuente.connect(ctx.destination);\n    } catch (err) {\n      // Un elemento",
    a: "      ;\n    } catch (err) {\n      // Un elemento"
  },
  {
    etiqueta: "PUERTA: una pista cifrada tambien cruza (y el navegador da silencio)",
    archivo: GRAFO,
    de: "    return Boolean(video) && !video.mediaKeys && hayWebAudio();",
    a: "    return Boolean(video) && hayWebAudio();"
  },

  /* ---------- las que dejan el contexto dormido ---------- */
  {
    etiqueta: "montar no levanta un contexto suspendido (silencio al volver a la pestaña)",
    archivo: GRAFO,
    de: "    aplicar(plan);\n    reanudar();",
    a: "    aplicar(plan);"
  },
  {
    etiqueta: "reanudar zarandea un contexto que ya estaba en marcha",
    archivo: GRAFO,
    de: '    if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {',
    a: '    if (ctx && typeof ctx.resume === "function") {'
  },

  /* ---------- las que estropean el cableado ---------- */
  {
    etiqueta: "los filtros se encadenan al reves (las bandas cambian de sitio)",
    archivo: GRAFO,
    de: "      for (let i = 0; i < filtros.length; i++) {\n        anterior.connect(filtros[i]);\n        anterior = filtros[i];\n      }",
    a: "      for (let i = filtros.length - 1; i >= 0; i--) {\n        anterior.connect(filtros[i]);\n        anterior = filtros[i];\n      }"
  },
  {
    etiqueta: "la toma no llega al limitador (la cadena entera no suena)",
    archivo: GRAFO,
    de: "        toma.connect(limitador);",
    a: "        ;"
  },
  {
    etiqueta: "el limitador no llega a destination (la cadena entera no suena)",
    archivo: GRAFO,
    de: "        limitador.connect(c.destination);",
    a: "        ;"
  },
  {
    etiqueta: "sin createDynamicsCompressor la cadena se queda MUDA en vez de sin red",
    archivo: GRAFO,
    de: "        toma.connect(c.destination);",
    a: "        ;"
  },
  {
    etiqueta: "la toma deja de ser transparente y amplifica",
    archivo: GRAFO,
    de: "      toma.gain.value = 1;",
    a: "      toma.gain.value = 2;"
  },
  {
    etiqueta: "la cadena se reconstruye en cada cambio (un grafo nuevo por cancion)",
    archivo: GRAFO,
    de: "    if (toma && filtros.length === numFiltros) return true;",
    a: "    ;"
  },
  {
    etiqueta: "la fuente se enchufa a los filtros sin soltar lo anterior (se oye dos veces)",
    archivo: GRAFO,
    de: "      fuente.disconnect();\n      fuente.connect(entrada);",
    a: "      fuente.connect(entrada);"
  },
  {
    etiqueta: "el nodo de analisis se ofrece aunque el ecualizador este apagado",
    archivo: GRAFO,
    de: "    return encendido ? toma : null;",
    a: "    return toma;"
  },

  /* ---------- las que mienten con un numero ---------- */
  {
    etiqueta: "la preamplificacion no llega al nodo (subir graves recorta)",
    archivo: GRAFO,
    de: "    ajustarSuave(entrada.gain, plan.entrada);",
    a: "    ;"
  },
  {
    etiqueta: "la frecuencia del plan se ignora (todos los filtros a 350 Hz)",
    archivo: GRAFO,
    de: "      ajustarYa(nodo.frequency, banda.hz);",
    a: "      ;"
  },
  {
    etiqueta: "a los shelf tambien se les escribe la Q (pico en la esquina)",
    archivo: GRAFO,
    de: '      if (typeof banda.q === "number") ajustarYa(nodo.Q, banda.q);',
    a: "      ajustarYa(nodo.Q, banda.q);"
  },
  {
    etiqueta: "la ganancia salta de golpe en vez de con rampa (chasquido en cada mando)",
    archivo: GRAFO,
    de: "      ajustarSuave(nodo.gain, banda.db);",
    a: "      ajustarYa(nodo.gain, banda.db);"
  },

  /* ----------------------------------------------------------------
   * EL LIMITADOR
   *
   * Es la red que permite que subir una banda se oiga como una subida y no
   * como bajar todas las demas. Si se monta pero se queda con los valores de
   * fabrica del navegador —umbral −24, ratio 12— empieza a aplastar musica
   * normal mucho antes de que haya nada que aplastar, y el sintoma es «suena
   * apagado», que no se parece en nada a su causa.
   *
   * Ninguna de estas se nota probando a mano. Todas suenan.
   * ---------------------------------------------------------------- */
  {
    etiqueta: "LIMITADOR: se monta pero se queda con los valores de fabrica",
    archivo: GRAFO,
    de: "    aplicarLimitador(plan.limitador);",
    a: "    ;"
  },
  {
    etiqueta: "LIMITADOR: se le escribe el umbral y nada mas",
    archivo: GRAFO,
    de: "    ajustarYa(limitador.ratio, ajustes.ratio);",
    a: "    ;"
  },
  {
    etiqueta: "LIMITADOR: umbral y ratio cambiados de sitio",
    archivo: GRAFO,
    de: "    ajustarYa(limitador.threshold, ajustes.umbralDb);\n    ajustarYa(limitador.knee, ajustes.rodillaDb);\n    ajustarYa(limitador.ratio, ajustes.ratio);",
    a: "    ajustarYa(limitador.threshold, ajustes.ratio);\n    ajustarYa(limitador.knee, ajustes.rodillaDb);\n    ajustarYa(limitador.ratio, ajustes.umbralDb);"
  },
  {
    etiqueta: "LIMITADOR: el ataque y la relajacion se quedan sin escribir",
    archivo: GRAFO,
    de: "    ajustarYa(limitador.attack, ajustes.ataqueS);\n    ajustarYa(limitador.release, ajustes.relajacionS);",
    a: "    ;"
  },
  {
    etiqueta: "LIMITADOR: no se comprueba que exista y el navegador que no lo tenga se queda mudo",
    archivo: GRAFO,
    de: "      if (typeof c.createDynamicsCompressor === \"function\") {",
    a: "      if (true) {"
  },
  {
    etiqueta: "LIMITADOR: al fallar la cadena se queda apuntado uno que ya no existe",
    archivo: GRAFO,
    de: "      toma = null;\n      limitador = null;\n      return false;",
    a: "      toma = null;\n      return false;",
    /*
     * EQUIVALENTE, y merece explicarse porque no lo parece.
     *
     * `limitador` solo se asigna al final del try, despues de la toma y de los
     * cinco filtros. Y en `construirCadena` no se vuelve a entrar mientras
     * haya toma. O sea: para llegar al catch con un limitador viejo apuntado
     * haria falta un montaje que fallara DESPUES de otro que salio bien, y
     * eso exige que la toma se haya puesto a null, cosa que solo pasa en este
     * mismo catch. No hay estado alcanzable en el que las dos versiones se
     * comporten distinto.
     *
     * La linea se queda igualmente: va con las otras tres del grupo, y el dia
     * que alguien mueva el montaje del limitador mas arriba —o añada un
     * segundo motivo para soltar la toma— deja de ser equivalente sin que
     * nadie se de cuenta. Cuesta una linea; olvidarla costaria un limitador
     * de un contexto muerto recibiendo escrituras.
     */
    equivalente: true
  },

  /* ---------- el enganche con el espectro ---------- */
  /*
   * Estas mutan audio-spectrum.js, no el grafo, pero son de esta ronda: es
   * codigo que solo existe porque ahora hay ecualizador, y las dos primeras
   * son otra vez "el usuario se queda sin musica" disfrazado de limpieza.
   */
  {
    etiqueta: "PUERTA: el espectro suelta la toma ENTERA al apagarse (corta la cancion)",
    archivo: ESPECTRO,
    de: "        if (fuente && analizador) fuente.disconnect(analizador);\n        if (fuente && analizadorGraves) fuente.disconnect(analizadorGraves);",
    a: "        if (fuente) fuente.disconnect();"
  },
  {
    etiqueta: "PUERTA: el espectro cierra el contexto del ecualizador al apagarse",
    archivo: ESPECTRO,
    de: "      if (prestado) {",
    a: "      if (false) {"
  },
  {
    etiqueta: "el espectro no se entera de que el ecualizador se ha encendido",
    archivo: ESPECTRO,
    de: "      Boolean(grafo) === prestado &&",
    a: "      true &&"
  },
  {
    etiqueta: "el espectro se cuelga de la toma aunque lleve el audio de OTRO video",
    archivo: ESPECTRO,
    de: "    if (!grafo.activo() || grafo.elementoActual() !== video) return null;",
    a: "    if (!grafo.activo()) return null;"
  },
  {
    etiqueta: "el espectro captura ademas de colgarse del grafo (los dos a la vez)",
    archivo: ESPECTRO,
    de: "    let stream = null;\n    if (!grafo) {",
    a: "    let stream = null;\n    if (true) {"
  },
  {
    etiqueta: "lo prestado se apunta como propio (y luego se cierra como propio)",
    archivo: ESPECTRO,
    de: "        prestado = true;",
    a: "        prestado = false;"
  },
  {
    etiqueta: "se le pide la pista a un stream que no existe cuando es prestado",
    archivo: ESPECTRO,
    de: "      pistaConectada = stream ? stream.getAudioTracks()[0] : null;",
    a: "      pistaConectada = stream.getAudioTracks()[0];"
  },
  {
    etiqueta: "con grafo se sigue exigiendo captureStream para poder medir",
    archivo: ESPECTRO,
    de: "    if (tomaDelGrafo(video)) return true;",
    a: "    ;"
  }
];

function pruebasQueFallan() {
  let salida;
  try {
    execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...PRUEBAS], {
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
    if (m && !m[1].endsWith(".test.js")) nombres.push(m[1]);
  }
  return nombres;
}

let sobreviven = 0;
let muertas = 0;
/*
 * Las marcadas `equivalente` se cuentan aparte y NO tumban el proceso.
 *
 * Una mutacion equivalente es la que produce un programa que se comporta
 * igual en todo estado alcanzable: no hay prueba que pueda distinguirla, asi
 * que contarla como "prueba que falta" es mentir sobre la cobertura, y
 * borrar el codigo para que muera es dejar el programa peor por complacer a
 * una herramienta. El motivo de cada una esta en su comentario.
 *
 * Se sigue ejecutando, y si alguna vez MUERE hay que venir aqui: significa
 * que el codigo cambio y el razonamiento de su comentario ya no vale.
 */
let equivalentes = 0;

if (pruebasQueFallan().length) {
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
  if (m.equivalente) {
    equivalentes++;
    if (caidas.length) {
      sobreviven++;
      console.error(
        `  OJO  ${m.etiqueta}\n` +
          "      Estaba marcada como equivalente y ahora MUERE: el codigo ha cambiado\n" +
          "      y el razonamiento de su comentario ya no vale. Quitale la marca."
      );
    } else {
      console.log(`  (equivalente, a proposito) ${m.etiqueta}`);
    }
    continue;
  }
  if (!caidas.length) {
    sobreviven++;
    console.error(`  VIVE  ${m.etiqueta}`);
  } else {
    muertas++;
    console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${caidas.slice(0, 3).join(" | ")}`);
  }
}

console.log(
  `\n${muertas} de ${MUTACIONES.length - equivalentes} mutaciones detectadas; ` +
    `${sobreviven} sobreviven` +
    (equivalentes ? `; ${equivalentes} equivalente(s) aparte.` : ".")
);
process.exit(sobreviven ? 1 : 0);
