/*
 * DIAGNOSTICO: ¿EXISTE LA COLA DONDE CREEMOS QUE EXISTE?
 *
 * No forma parte de la extension. Se pega en la consola de DevTools de la
 * pestaña de music.youtube.com CON UNA LISTA SONANDO (una cancion suelta
 * puede no tener cola que enseñar).
 *
 * Solo LEE el DOM: no pulsa nada, no cambia nada, se puede pegar sin miedo.
 *
 * ------------------------------------------------------------------
 * POR QUE EXISTE
 * ------------------------------------------------------------------
 * Los selectores de la cola en youtube-music-adapter.js son CONJETURAS:
 * se escribieron sin HTML real delante. Este proyecto ya pago ese pecado
 * una vez —los selectores de letras eran inventados y el panel decia
 * "no disponible" SIEMPRE— y la leccion fue esta: antes de fiarse de un
 * selector, mirarlo en la pagina de verdad.
 *
 * ------------------------------------------------------------------
 * LAS CUATRO PREGUNTAS
 * ------------------------------------------------------------------
 *
 *  1. ¿HAY ELEMENTOS DE COLA EN EL DOM? Y con cual de los tres selectores.
 *     Importa tambien saber si estan SIN abrir el panel lateral: si solo
 *     existen con el panel abierto, la ventana flotante enseñara la cola
 *     a ratos y hay que contarlo en el README.
 *
 *  2. ¿ALGUNO LLEVA `selected`? Es la referencia para saber cuales son
 *     "las siguientes". Sin el, el lector devuelve lista vacia a proposito.
 *
 *  3. ¿EL TITULO Y EL ARTISTA ESTAN DONDE SE BUSCAN? (.song-title y
 *     .byline dentro de cada elemento). Se enseñan los tres primeros para
 *     compararlos A OJO con lo que dice la pantalla.
 *
 *  4. ¿CUANTOS ELEMENTOS HAY EN TOTAL? Si YouTube Music virtualiza la
 *     lista (pinta solo lo visible), los "siguientes" podrian no estar
 *     todos en el DOM y el corte a 5 quedarse corto sin que sea culpa
 *     de nadie.
 */
(() => {
  const SELECTORES = [
    "ytmusic-player-queue ytmusic-player-queue-item",
    "#queue ytmusic-player-queue-item",
    "ytmusic-player-queue-item"
  ];

  console.log("=== DIAGNOSTICO DE LA COLA ===");

  let items = [];
  for (const sel of SELECTORES) {
    const encontrados = document.querySelectorAll(sel);
    console.log(`1. "${sel}" -> ${encontrados.length} elementos`);
    if (!items.length && encontrados.length) items = Array.from(encontrados);
  }
  if (!items.length) {
    console.log("   SIN COLA EN EL DOM. Prueba a abrir el panel del reproductor");
    console.log("   (la barra de abajo) y pega esto otra vez: si entonces si hay,");
    console.log("   la cola solo existe con el panel abierto y hay que contarlo.");
    return;
  }

  const seleccionado = items.findIndex((el) => el.hasAttribute("selected"));
  console.log(`2. elemento con [selected]: ${seleccionado === -1 ? "NINGUNO (mal asunto)" : "el " + seleccionado}`);
  if (seleccionado === -1) {
    console.log("   atributos del primer elemento, por si la marca se llama distinto:");
    console.log("  ", items[0].getAttributeNames().join(", "));
  }

  console.log("3. los tres primeros, como los leeria la extension:");
  items.slice(0, 3).forEach((el, i) => {
    const titulo = el.querySelector(".song-title, .title");
    const byline = el.querySelector(".byline, .song-info .byline");
    console.log(`   [${i}] titulo: ${titulo ? JSON.stringify(titulo.textContent.trim()) : "NO ENCONTRADO"}`);
    console.log(`       byline: ${byline ? JSON.stringify(byline.textContent.trim()) : "NO ENCONTRADO"}`);
  });

  console.log(`4. total en el DOM: ${items.length} (compara con lo que enseña el panel:`);
  console.log("   si el panel dice muchos mas, la lista esta virtualizada)");
})();
