/*
 * EL RELEVO DEL CONTENT SCRIPT HUERFANO (tanda AI).
 *
 * De donde sale. Desde la tanda T, instalar o actualizar la extension
 * reinyecta los content scripts en las pestañas de musica abiertas. La
 * copia vieja no desaparece: queda huerfana (sin chrome.runtime) pero con
 * su MutationObserver y sus escuchas del <video> vivas, y la pagina paga
 * DOS lecturas del estado por latido para siempre (la medicion del
 * 2026-09-28 dio ~26 ms/s por copia). Nada la paraba porque nada le decia
 * que ya habia otra.
 *
 * La regla: el script que arranca avisa con un evento del DOM
 * ("ytmpip:relevo", que cruza los mundos aislados porque el DOM es
 * compartido). Quien lo oye y esta HUERFANO se retira... salvo que tenga su
 * ventana flotante abierta: esa ventana es suya, la nueva copia no puede
 * servirla, y congelarla seria peor que pagar el doble un rato. Se retira
 * en el primer latido despues de que la ventana se cierre.
 *
 * Una copia VIVA que oye el evento no hace nada: el relevo no es una orden,
 * es una noticia que solo le importa a quien ya no sirve.
 */
const test = require("node:test");
const assert = require("node:assert");
const { entornoPagina, pulso } = require("../helpers/entorno.js");

/*
 * La vista flotante de mentira: cuenta los repintados, que es la forma de
 * saber si el latido sigue vivo sin mirar dentro del content script.
 */
function conVistaFalsa(abierta) {
  const vista = {
    repintados: 0,
    abierta,
    onStateUpdate() {
      vista.repintados++;
    },
    estaAbierta: () => vista.abierta,
    ensureLauncher() {},
    setDegraded() {}
  };
  return {
    vista,
    antesDeCargar(win) {
      win.YTMPip = { PipView: vista };
    }
  };
}

function latido(e) {
  e.win.document.querySelector("video").dispatchEvent(new e.win.Event("timeupdate"));
  return pulso();
}

function relevo(e) {
  e.win.document.dispatchEvent(new e.win.Event("ytmpip:relevo"));
}

function dejarHuerfano(e) {
  e.win.chrome.runtime.id = undefined;
}

test("al arrancar, el content script anuncia el relevo en el DOM", () => {
  let oidos = 0;
  const e = entornoPagina("controles-completos.html", {
    antesDeCargar(win) {
      win.document.addEventListener("ytmpip:relevo", () => oidos++);
    }
  });
  assert.strictEqual(oidos, 1);
  assert.ok(e.YTMPip, "premisa: el entorno cargo");
});

test("el script que anuncia el relevo no se retira con su propio anuncio", async () => {
  const f = conVistaFalsa(false);
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  const antes = f.vista.repintados;
  await latido(e);
  assert.ok(f.vista.repintados > antes, "el latido deberia seguir repintando");
});

test("HUERFANO Y SIN VENTANA: oye el relevo y deja de leer la pagina", async () => {
  const f = conVistaFalsa(false);
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  dejarHuerfano(e);
  relevo(e);
  await latido(e);
  const tras = f.vista.repintados;

  await latido(e);
  e.win.document.body.setAttribute("class", "otra-cosa");
  await pulso();
  assert.strictEqual(f.vista.repintados, tras, "el huerfano sigue leyendo la pagina despues del relevo");
});

test("VIVO: oir un relevo no le hace nada (no es una orden)", async () => {
  const f = conVistaFalsa(false);
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  relevo(e);
  const antes = f.vista.repintados;
  await latido(e);
  assert.ok(f.vista.repintados > antes, "una copia viva dejo de latir por un relevo");
});

test("HUERFANO CON LA VENTANA ABIERTA: la sigue sirviendo, y se retira al cerrarse", async () => {
  const f = conVistaFalsa(true);
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  dejarHuerfano(e);
  relevo(e);

  const antes = f.vista.repintados;
  await latido(e);
  assert.ok(f.vista.repintados > antes, "la ventana del huerfano se congelo: es suya y nadie mas puede servirla");

  f.vista.abierta = false;
  await latido(e);
  const tras = f.vista.repintados;
  await latido(e);
  assert.strictEqual(f.vista.repintados, tras, "cerrada la ventana, el huerfano deberia haberse retirado");
});

test("retirado, el temporizador de apagado del huerfano deja de vigilar (podria pausar la musica)", async () => {
  /*
   * Las escuchas del <video> no solo repintan: cada timeupdate comprueba el
   * temporizador de apagado. Un huerfano que siguiera escuchando pausaria
   * la musica con un plazo que la copia nueva ya no conoce.
   */
  const f = conVistaFalsa(false);
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  let comprobaciones = 0;
  const original = e.YTMPip.TemporizadorApagado.comprobar;
  e.YTMPip.TemporizadorApagado.comprobar = function () {
    comprobaciones++;
    return original.apply(this, arguments);
  };
  dejarHuerfano(e);
  relevo(e);
  /*
   * Un cambio del DOM ANTES del latido: el observador, si siguiera puesto,
   * volveria a enganchar las escuchas del <video> (attachMediaListeners
   * corre en cada cambio). Sin esta linea la prueba no veia un observador
   * olvidado; lo enseño la mutacion de la tanda AI.
   */
  e.win.document.body.setAttribute("class", "otra-cosa");
  await pulso();
  comprobaciones = 0;
  await latido(e);
  assert.strictEqual(comprobaciones, 0, "el huerfano retirado sigue vigilando su temporizador");
});

test("retirado, suelta tambien las escuchas del <video> (no solo el observador)", async () => {
  const f = conVistaFalsa(false);
  let leidas = 0;
  const e = entornoPagina("controles-completos.html", { antesDeCargar: f.antesDeCargar });
  await pulso();
  const leerOriginal = e.YTMPip.MetadataReader.read;
  e.YTMPip.MetadataReader.read = function () {
    leidas++;
    return leerOriginal.apply(this, arguments);
  };
  dejarHuerfano(e);
  relevo(e);
  await latido(e);
  leidas = 0;
  await latido(e);
  await latido(e);
  assert.strictEqual(leidas, 0, "un timeupdate sigue haciendo leer el estado al huerfano retirado");
});
