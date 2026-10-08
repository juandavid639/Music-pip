/*
 * EL ARNES DE MUTACION, UNO SOLO (tanda AG).
 *
 * Cada tools/mutar/mutar-*.js estropea el codigo a proposito, una regla cada vez,
 * y comprueba que alguna prueba se entera. Hasta la tanda AG cada script
 * llevaba su propia copia de este bucle: veinticuatro copias en cinco
 * variantes, y solo las mas nuevas reintentaban al escribir. Eso importo de
 * verdad una vez: en la tanda Y, OneDrive bloqueo constants.js JUSTO al
 * restaurarlo, el script murio con el archivo mutado, y hubo que devolverlo
 * a mano (THEME_ACCENT_LUMINANCE se habia quedado en 0,4).
 *
 * Lo que garantiza este arnes, y ninguna copia vieja garantizaba entera:
 *   - ESCRIBIR CON REINTENTOS: un bloqueo momentaneo no es «la mutacion
 *     fallo», es «otra vez en un momento».
 *   - RESTAURAR PASE LO QUE PASE: tambien con Ctrl+C, con kill o con una
 *     excepcion, y COMPROBAR despues, leyendo el archivo, que quedo byte a
 *     byte como estaba. Si no, lo dice a gritos y sale con error.
 *   - AVISAR si el texto a mutar aparece mas de una vez (se muta la primera,
 *     que puede no ser la que se queria: paso en la tanda Y) y contar como
 *     superviviente el que ya no aparece (la mutacion no prueba nada).
 *   - COMPARAR con la prediccion si el mutante trae \`esperadas\`: el
 *     recuento exacto de pruebas que deben caer, fijado ANTES de correr.
 *
 * Y conserva lo que tenian algunas copias:
 *   - \`equivalente: true\`: un mutante que no cambia el comportamiento en
 *     ningun estado alcanzable. Se ejecuta igual; no cuenta como fallo, y si
 *     un dia MUERE avisa (el codigo cambio y su razonamiento ya no vale).
 *   - \`deliberada: true\`: una superviviente documentada; si una prueba la
 *     mata, avisa por lo mismo.
 *
 * Uso, desde cada script:
 *   require("./mutar-comun.js").mutar({ raiz: RAIZ, pruebas: PRUEBAS, mutaciones: MUTACIONES });
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function escribir(ruta, texto) {
  for (let intento = 1; ; intento++) {
    try {
      fs.writeFileSync(ruta, texto);
      return;
    } catch (err) {
      if (intento >= 40) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

function leer(ruta) {
  for (let intento = 1; ; intento++) {
    try {
      return fs.readFileSync(ruta, "utf8");
    } catch (err) {
      if (intento >= 40) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

/** Nombres de las pruebas que caen con los archivos como esten ahora. */
function pruebasQueFallan(raiz, pruebas) {
  try {
    execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...pruebas], {
      cwd: raiz,
      stdio: "pipe",
      encoding: "utf8"
    });
    return [];
  } catch (err) {
    const nombres = [];
    for (const linea of String(err.stdout || "").split(/\r?\n/)) {
      const m = /^\s*not ok \d+ - (.+?)\s*$/.exec(linea);
      // El TAP marca tambien el fichero entero como "not ok": ese no es una
      // prueba, es el contenedor.
      if (m && !m[1].endsWith(".test.js")) nombres.push(m[1]);
    }
    // Un fallo sin ninguna prueba nombrada (el archivo no carga) tambien es
    // caer: se cuenta con el nombre del error para que no pase por «vive».
    return nombres.length ? nombres : ["(el archivo de pruebas no llego a correr)"];
  }
}

/*
 * MODO «SOLO COMPROBAR» (MUTAR_SOLO_COMPROBAR=1): no muta ni corre pruebas;
 * solo mira que cada texto a mutar siga existiendo, y UNA sola vez. Existe
 * porque el script del manifiesto llevaba cinco mutaciones de diez buscando
 * textos que las versiones habian cambiado: no probaban nada y nadie lo vio.
 * Asi se revisan los veinticuatro scripts en segundos, y una prueba
 * (tests/unit/mutar-comun.test.js) lo vigila en cada npm test.
 */
function comprobar({ raiz, mutaciones }) {
  const problemas = [];
  for (const m of mutaciones) {
    const texto = leer(path.join(raiz, m.archivo));
    const veces = texto.split(m.de).length - 1;
    if (veces !== 1) problemas.push(`${m.etiqueta} (${m.archivo}): el texto aparece ${veces} veces`);
  }
  for (const p of problemas) console.error("  " + p);
  console.log(`${mutaciones.length - problemas.length} de ${mutaciones.length} textos a mutar en su sitio.`);
  process.exit(problemas.length ? 1 : 0);
}

/*
 * MUTAR_SOLO_ETIQUETAS=<expresion>: corre solo las mutaciones cuya etiqueta
 * case. Para verificar las que se acaban de reapuntar sin pagar las otras
 * cien (el script del espectro tarda mas de media hora entero). El
 * resumen lo dice, para que un recuento parcial no pase por uno completo.
 */
function filtrar(mutaciones) {
  const patron = process.env.MUTAR_SOLO_ETIQUETAS;
  if (!patron) return mutaciones;
  const re = new RegExp(patron, "i");
  const elegidas = mutaciones.filter((m) => re.test(m.etiqueta));
  console.log(`(Filtro MUTAR_SOLO_ETIQUETAS: ${elegidas.length} de ${mutaciones.length} mutaciones.)`);
  return elegidas;
}

function mutar({ raiz, pruebas, mutaciones: todas }) {
  if (process.env.MUTAR_SOLO_COMPROBAR) return comprobar({ raiz, mutaciones: todas });
  const mutaciones = filtrar(todas);
  // La mutacion en curso, para poder deshacerla pase lo que pase.
  let enCurso = null;
  const deshacer = () => {
    if (!enCurso) return;
    escribir(enCurso.ruta, enCurso.original);
    enCurso = null;
  };
  for (const senal of ["SIGINT", "SIGTERM"]) {
    process.on(senal, () => {
      deshacer();
      console.error(`\nInterrumpido (${senal}): el archivo mutado se ha restaurado.`);
      process.exit(130);
    });
  }
  process.on("uncaughtException", (err) => {
    deshacer();
    console.error("Error en el arnes (el archivo mutado se ha restaurado):", err);
    process.exit(1);
  });

  if (pruebasQueFallan(raiz, pruebas).length) {
    console.error("La suite no esta en verde SIN mutar. Arregla eso antes de mutar nada.");
    process.exit(1);
  }

  let muertas = 0;
  let sobreviven = 0;
  let equivalentes = 0;
  let deliberadas = 0;
  let conPrediccion = 0;
  let exactas = 0;

  for (const m of mutaciones) {
    const ruta = path.join(raiz, m.archivo);
    const original = leer(ruta);
    const veces = original.split(m.de).length - 1;
    if (veces === 0) {
      console.error(`  ??  ${m.etiqueta}\n      (el texto a mutar ya no existe: la mutacion no prueba nada)`);
      sobreviven++;
      continue;
    }
    if (veces > 1) {
      console.error(`  OJO  ${m.etiqueta}\n      (el texto aparece ${veces} veces: se muta SOLO la primera)`);
    }

    enCurso = { ruta, original };
    escribir(ruta, original.replace(m.de, () => m.a));
    let caidas;
    try {
      caidas = pruebasQueFallan(raiz, pruebas);
    } finally {
      deshacer();
      // Leer para comprobar: restaurar no basta con haberlo pedido.
      if (leer(ruta) !== original) {
        escribir(ruta, original);
        if (leer(ruta) !== original) {
          console.error(`\n!!! ${m.archivo} NO QUEDO COMO ESTABA tras restaurar. Revisalo con git diff.`);
          process.exit(2);
        }
      }
    }

    const lista = caidas.slice(0, 3).join(" | ") + (caidas.length > 3 ? " | …" : "");
    let nota = "";
    if (typeof m.esperadas === "number") {
      conPrediccion++;
      if (caidas.length === m.esperadas) {
        exactas++;
        nota = "  [exacto]";
      } else {
        nota = `  [DISTINTO: predije ${m.esperadas}]`;
      }
    }

    if (m.equivalente) {
      equivalentes++;
      if (caidas.length) {
        sobreviven++;
        console.error(
          `  OJO  ${m.etiqueta}\n      estaba marcada como EQUIVALENTE y ahora muere: el codigo cambio y ` +
            "el razonamiento de su comentario ya no vale. Quitale la marca."
        );
      } else {
        console.log(`  (equivalente, a proposito) ${m.etiqueta}`);
      }
      continue;
    }
    if (m.deliberada) {
      deliberadas++;
      if (caidas.length) {
        console.error(`  ??  ${m.etiqueta}\n      (se declaro inmatable y una prueba la mato: revisa el comentario)`);
        muertas++;
      } else {
        console.log(`  (vive) ${m.etiqueta}\n         superviviente documentada: no puede cambiar el comportamiento`);
      }
      continue;
    }
    if (!caidas.length) {
      sobreviven++;
      console.error(`  VIVE  ${m.etiqueta}${nota}`);
    } else {
      muertas++;
      console.log(`  muere ${m.etiqueta}  -> ${caidas.length}: ${lista}${nota}`);
    }
  }

  const enJuego = mutaciones.length - equivalentes - deliberadas;
  let resumen = `\n${muertas} de ${enJuego} mutaciones detectadas; ${sobreviven} sobreviven.`;
  if (equivalentes) resumen += ` (${equivalentes} equivalentes, a proposito.)`;
  if (deliberadas) resumen += ` (${deliberadas} mas viven a proposito y estan documentadas.)`;
  if (conPrediccion) resumen += `\nPrediccion: ${exactas} de ${conPrediccion} recuentos exactos.`;
  console.log(resumen);
  process.exit(sobreviven ? 1 : 0);
}

module.exports = { mutar, escribir, leer, pruebasQueFallan };
