/*
 * EL ARNES DE MUTACION Y SUS VEINTICUATRO CLIENTES (tanda AG).
 *
 * De donde sale. Al juntar los veinticuatro bucles de tools/mutar-*.js en
 * uno solo (tools/mutar-comun.js) se le añadio un modo que no muta nada y
 * solo mira que cada texto a mutar siga existiendo, una vez. La primera
 * pasada destapo 64 mutaciones —de 485— que buscaban un texto que el
 * codigo ya no tenia: el catalogo de idiomas, el halo y el modulo de
 * formas del espectro las habian ido dejando atras, y el arnes viejo las
 * contaba como «sobreviven» entre muchas lineas que nadie leia. Una
 * mutacion asi no prueba nada, y parece que si.
 *
 * Por eso dos cosas aqui:
 *   1. Cada script, en modo «solo comprobar», con todos sus textos en su
 *      sitio. Tocar una linea que vigila una mutacion obliga a reapuntarla
 *      en el mismo cambio, en vez de enterarse meses despues.
 *   2. El arnes mismo, contra un proyecto de juguete en una carpeta
 *      temporal: que distingue muerta de viva y de desaparecida, que compara
 *      la prediccion, y sobre todo que DEJA EL ARCHIVO COMO ESTABA.
 *
 * LO QUE NO: que las mutaciones mueran. Eso exige correr cada script entero
 * (minutos) y es el paso manual del cierre de cada tanda.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RAIZ = path.join(__dirname, "..", "..");
const TOOLS = path.join(RAIZ, "tools");
const ARNES = path.join(TOOLS, "mutar-comun.js");

/*
 * Sin NODE_TEST_CONTEXT: node --test se lo pone a los procesos que lanza, y
 * un `node --test` hijo que lo herede habla otro protocolo en vez de TAP, y
 * el arnes no sabria leer que pruebas cayeron.
 */
function entornoLimpio(extra) {
  const env = Object.assign({}, process.env, extra);
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const SCRIPTS = fs
  .readdirSync(TOOLS)
  .filter((n) => /^mutar-.+\.js$/.test(n) && n !== "mutar-comun.js")
  .sort();

test("hay scripts de mutacion que revisar (si esto da cero, el filtro esta mal)", () => {
  assert.ok(SCRIPTS.length >= 20, "solo " + SCRIPTS.length + " scripts");
});

for (const nombre of SCRIPTS) {
  test(`${nombre}: todos sus textos a mutar siguen en el codigo, una vez`, () => {
    const r = spawnSync(process.execPath, [path.join(TOOLS, nombre)], {
      cwd: RAIZ,
      env: entornoLimpio({ MUTAR_SOLO_COMPROBAR: "1" }),
      encoding: "utf8"
    });
    assert.strictEqual(r.status, 0, (r.stderr || "") + (r.stdout || ""));
    assert.match(r.stdout, /(\d+) de \1 textos a mutar en su sitio/);
  });
}

test("cada script delega en el arnes comun (ningun bucle propio de vuelta)", () => {
  for (const nombre of SCRIPTS) {
    const texto = fs.readFileSync(path.join(TOOLS, nombre), "utf8");
    assert.match(texto, /require\("\.\/mutar-comun\.js"\)\.mutar\(/, nombre);
    assert.doesNotMatch(texto, /execFileSync|writeFileSync/, nombre + " escribe o ejecuta por su cuenta");
  }
});

/* ------------------------------------------------------------------ */
/* El arnes contra un proyecto de juguete                              */
/* ------------------------------------------------------------------ */

const CODIGO = "function doble(x) {\n  return x * 2;\n}\nmodule.exports = doble;\n";
const PRUEBA =
  'const test = require("node:test");\n' +
  'const assert = require("node:assert");\n' +
  'const doble = require("./doble.js");\n' +
  'test("dobla el dos", () => assert.strictEqual(doble(2), 4));\n' +
  'test("dobla el cero", () => assert.strictEqual(doble(0), 0));\n';

function proyecto(mutaciones, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mutar-comun-"));
  fs.writeFileSync(path.join(dir, "doble.js"), CODIGO);
  fs.writeFileSync(path.join(dir, "doble.test.js"), PRUEBA);
  fs.writeFileSync(
    path.join(dir, "mutar.js"),
    "require(" +
      JSON.stringify(ARNES) +
      ").mutar({ raiz: __dirname, pruebas: ['doble.test.js'], mutaciones: " +
      JSON.stringify(mutaciones) +
      " });\n"
  );
  const r = spawnSync(process.execPath, [path.join(dir, "mutar.js")], {
    cwd: dir,
    env: entornoLimpio(extraEnv),
    encoding: "utf8"
  });
  const despues = fs.readFileSync(path.join(dir, "doble.js"), "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: r.stdout, err: r.stderr, despues };
}

const MATA = { etiqueta: "triplica", archivo: "doble.js", de: "x * 2", a: "x * 3" };
const VIVE = { etiqueta: "punto y coma de mas", archivo: "doble.js", de: "module.exports = doble;", a: "module.exports = doble;;" };
const NO_ESTA = { etiqueta: "texto que ya no existe", archivo: "doble.js", de: "x * 7", a: "x * 8" };

test("todas muertas: sale con 0 y el archivo queda byte a byte como estaba", () => {
  const r = proyecto([MATA]);
  assert.strictEqual(r.status, 0, r.err);
  assert.match(r.out, /muere triplica {2}-> 1: dobla el dos/);
  assert.match(r.out, /1 de 1 mutaciones detectadas; 0 sobreviven/);
  assert.strictEqual(r.despues, CODIGO);
});

test("una viva o una desaparecida: sale con error y las nombra", () => {
  const r = proyecto([MATA, VIVE, NO_ESTA]);
  assert.strictEqual(r.status, 1);
  assert.match(r.err, /VIVE {2}punto y coma de mas/);
  assert.match(r.err, /\?\? {2}texto que ya no existe/);
  assert.match(r.out, /1 de 3 mutaciones detectadas; 2 sobreviven/);
  assert.strictEqual(r.despues, CODIGO);
});

test("la prediccion se compara por recuento exacto", () => {
  const r = proyecto([Object.assign({ esperadas: 1 }, MATA), Object.assign({}, MATA, { etiqueta: "otra", esperadas: 2 })]);
  assert.match(r.out, /muere triplica .*\[exacto\]/);
  assert.match(r.out, /muere otra .*\[DISTINTO: predije 2\]/);
  assert.match(r.out, /Prediccion: 1 de 2 recuentos exactos/);
});

test("equivalente y deliberada no cuentan como fallo mientras vivan", () => {
  const r = proyecto([
    MATA,
    Object.assign({ equivalente: true }, VIVE),
    Object.assign({}, VIVE, { etiqueta: "documentada", deliberada: true })
  ]);
  assert.strictEqual(r.status, 0, r.err);
  assert.match(r.out, /\(equivalente, a proposito\) punto y coma de mas/);
  assert.match(r.out, /\(vive\) documentada/);
});

test("una equivalente que muere avisa: su razonamiento ya no vale", () => {
  const r = proyecto([Object.assign({ equivalente: true }, MATA)]);
  assert.strictEqual(r.status, 1);
  assert.match(r.err, /estaba marcada como EQUIVALENTE y ahora muere/);
  assert.strictEqual(r.despues, CODIGO);
});

test("el filtro por etiqueta corre solo las elegidas y lo dice", () => {
  const r = proyecto([MATA, VIVE], { MUTAR_SOLO_ETIQUETAS: "^triplica$" });
  assert.strictEqual(r.status, 0, r.err);
  assert.match(r.out, /Filtro MUTAR_SOLO_ETIQUETAS: 1 de 2 mutaciones/);
  assert.doesNotMatch(r.err + r.out, /punto y coma/);
});

test("solo comprobar: no muta, y falla si un texto no esta o esta dos veces", () => {
  const bien = proyecto([MATA, VIVE], { MUTAR_SOLO_COMPROBAR: "1" });
  assert.strictEqual(bien.status, 0, bien.err);
  assert.match(bien.out, /2 de 2 textos a mutar en su sitio/);

  const mal = proyecto([MATA, NO_ESTA, Object.assign({}, MATA, { etiqueta: "doble", de: "doble" })], {
    MUTAR_SOLO_COMPROBAR: "1"
  });
  assert.strictEqual(mal.status, 1);
  assert.match(mal.err, /texto que ya no existe \(doble\.js\): el texto aparece 0 veces/);
  assert.match(mal.err, /doble \(doble\.js\): el texto aparece \d+ veces/);
  assert.strictEqual(mal.despues, CODIGO);
});
