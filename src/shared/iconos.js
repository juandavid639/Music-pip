/*
 * Los iconos de la ventana flotante, en SVG.
 *
 * ANTES ERAN EMOJI, y el proyecto ya sabia que eso no daba la talla: el
 * boton de "solo caratula" dice "Aa" y no un emoji porque —esta escrito en
 * pip.html— "a 10 px un emoji a color queda en una mancha". Lo mismo valia
 * para ⤢ y ✕. Eran tres excepciones a una regla que nadie habia escrito;
 * esto es la regla.
 *
 * Tres cosas de los emoji que no se arreglan eligiendo otro emoji:
 *
 *  - LOS PINTA EL SISTEMA, no nosotros. El mismo ⏪ es gris y plano en
 *    Windows, azul y con volumen en Android y otra cosa en Linux. La
 *    ventana se ve distinta en cada maquina y no hay forma de igualarla.
 *  - VIENEN A COLOR, y el color es suyo. `color: var(--ytmpip-accent)` no
 *    tiñe un emoji, asi que el boton de "me gusta" encendido y apagado se
 *    distinguian solo por cambiar ♡ por ♥ —dos dibujos distintos— en vez
 *    de por el color, como el resto de la interfaz.
 *  - NO SON DEL MISMO JUEGO. ⏪ y 🔀 los dibujo gente distinta con criterios
 *    distintos: pesan distinto, ocupan distinto y no se alinean.
 *
 * COMO SE INTEGRAN SIN TOCAR LA MAQUETACION, que es la parte que importa.
 * El tamaño de los botones esta repartido por una docena de reglas de
 * `font-size` en pip.css, una por densidad (mini, ajustado, superpuesto...).
 * Reescribirlas todas para dar anchos en pixeles habria sido rehacer el
 * sistema de densidades entero. En vez de eso los iconos se miden en `em`
 * —el factor exacto esta en la regla `.ytmpip-ico` de pip.css, en un solo
 * sitio— asi que el `font-size` que ya estaba sigue mandando: la cascada no
 * se toca y cada densidad sigue decidiendo lo que decidia.
 *
 * Por lo mismo van con `fill: currentColor`: heredan el color del boton, y
 * las reglas de `:hover` y de `[aria-pressed="true"]` que ya existian pasan
 * a funcionar de verdad, que con los emoji no lo hacian.
 *
 * NO SE USA innerHTML para montarlos. Se construyen con createElementNS,
 * que ademas es lo unico que funciona: el SVG vive en su propio espacio de
 * nombres y un createElement("svg") a secas da un elemento HTML inerte que
 * no pinta nada.
 */
(function (root) {
  "use strict";

  const YTMPip = (root.YTMPip = root.YTMPip || {});
  const NS = "http://www.w3.org/2000/svg";

  /*
   * Todos en una rejilla de 24x24 y con el mismo peso visual, que es lo que
   * los emoji no podian dar. Cada entrada es la lista de trazos: casi todos
   * llevan uno, y los que llevan dos es porque el dibujo tiene dos piezas
   * sueltas (la barra y el triangulo de "anterior", por ejemplo).
   */
  const TRAZOS = {
    reproducir: ["M8 5v14l11-7z"],
    pausar: ["M6 5h4v14H6z", "M14 5h4v14h-4z"],
    anterior: ["M6 6h2v12H6z", "M9.5 12l8.5 6V6z"],
    siguiente: ["M6 18l8.5-6L6 6z", "M16 6h2v12h-2z"],
    /*
     * Retroceder y adelantar son el mismo arco reflejado. NO llevan el
     * numero de segundos dentro, aunque el icono clasico de YouTube lo
     * lleve: los botones de esta ventana bajan hasta 10 px de alto en modo
     * mini, y una cifra ahi dentro mediria unos cinco pixeles. Un numero
     * que no se puede leer es peor que no ponerlo, porque ocupa sitio y
     * ensucia el dibujo. Los segundos siguen estando donde si se leen: en
     * el `title` y en el `aria-label`, que ya se actualizan solos cuando se
     * cambia la preferencia.
     */
    retroceder: [
      "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
    ],
    adelantar: [
      "M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"
    ],
    /*
     * El corazon va en DOS versiones y no en una sola que se rellene con
     * CSS: el hueco del contorno es parte del trazo, no un relleno que se
     * pueda quitar. Que sean dos dibujos no reabre el problema de los
     * emoji, porque ademas el color lo pone la hoja de estilos.
     */
    corazon: [
      "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
    ],
    "corazon-lleno": [
      "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
    ],
    volumen: [
      "M3 9v6h4l5 5V4L7 9H3z",
      "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z",
      "M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
    ],
    "volumen-mudo": [
      "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63z",
      "M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z",
      "M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
    ],
    aleatorio: [
      "M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
    ],
    repetir: ["M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"],
    /*
     * Repetir UNA lleva el 1 dentro, y aqui si se lee: es un solo digito
     * grueso, no dos cifras finas. Es ademas la unica forma de distinguir
     * los dos estados sin cambiar de color, que ya significa otra cosa
     * (encendido / apagado).
     */
    "repetir-una": [
      "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
      "M13 15V9h-1l-2 1v1h1.5v4H13z"
    ],
    espectro: ["M5 9.2h3V19H5z", "M10.6 5h2.8v14h-2.8z", "M16.2 13H19v6h-2.8z"],
    /*
     * El ecualizador: tres carriles finos con su boton, o sea DESLIZADORES.
     *
     * El parecido con "espectro" es el peligro de este dibujo, y no es
     * casualidad: los dos hablan de bandas de frecuencia y los dos acaban en
     * tres barras verticales. Lo que los separa —y hay que respetarlo si
     * alguien los retoca— es que el espectro son barras MACIZAS que salen
     * del suelo a alturas distintas (miden algo), y esto son carriles
     * IGUALES de arriba abajo con una pieza que se mueve por ellos (se
     * ajusta algo). A 10 px lo que queda de cada uno es "bloques" contra
     * "lineas con nudos", que se distinguen; si el ecualizador llevara los
     * carriles a alturas distintas dejarian de distinguirse.
     *
     * Tres carriles y no cinco aunque las bandas sean cinco: a este tamaño
     * cinco lineas con sus botones se emborronan en una mancha rayada. El
     * icono dice "hay deslizadores", no cuantos.
     *
     * Los botones a tres alturas distintas —arriba, abajo, en medio— porque
     * tres a la misma altura se leen como una barra horizontal cruzando el
     * dibujo, que es otra cosa.
     */
    ecualizador: [
      "M5.25 3h1.5v18h-1.5z",
      "M3.4 6.4h5.2v2.6H3.4z",
      "M11.25 3h1.5v18h-1.5z",
      "M9.4 13.6h5.2v2.6H9.4z",
      "M17.25 3h1.5v18h-1.5z",
      "M15.4 9.4h5.2v2.6h-5.2z"
    ],
    /*
     * El pulso: anillos saliendo de un punto. NO un corazon, aunque el
     * nombre lo pida: el corazon ya es "me gusta" y dos botones con el mismo
     * dibujo y significados distintos es peor que un dibujo mediocre.
     * Tampoco la linea de electrocardiograma, que aqui habria que dibujarla
     * como el contorno relleno de una linea quebrada —estos trazos se
     * pintan con `fill`, no con `stroke`— y a 10 px se convierte en una
     * mancha.
     *
     * Cada anillo son dos arcos: el de fuera con `sweep 0` y el de dentro
     * con `sweep 1`, o sea girando al reves. Eso es lo que abre el hueco con
     * la regla de relleno normal, sin tener que pedir `fill-rule`.
     */
    pulso: [
      "M12 2a10 10 0 100 20 10 10 0 000-20zm0 1.7a8.3 8.3 0 110 16.6 8.3 8.3 0 010-16.6z",
      "M12 6.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zm0 1.7a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6z",
      "M12 9.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z"
    ],
    caratula: [
      "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
    ],
    /*
     * El fondo visual (el Canvas de Spotify detras de la ventana). Es el
     * "wallpaper" de Material —cuatro esquinas de marco con el paisaje
     * dentro— y no otra foto entera como "caratula": los dos hablan de
     * imagenes, pero la caratula es LA imagen y esto es PONERLA DE FONDO;
     * el marco abierto por los lados es lo que los separa a 10 px.
     */
    fondo: [
      "M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 10l-4 5h12l-3-4-2.03 2.71L10 14zm7-4.5c0-.83-.67-1.5-1.5-1.5S14 8.67 14 9.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z"
    ],
    /*
     * El halo de luz del borde. Es el "auto_awesome" de Material —un
     * destello grande con dos chispas—, el mismo dibujo que el ✨ de
     * reserva del boton, asi que el usuario ve lo mismo con y sin este
     * archivo cargado. NO es un anillo (los anillos ya son "pulso") ni un
     * marco de esquinas (que ya es "fondo"): dibujar literalmente "luz en
     * el borde" seria un marco con rayitas, y a 10 px las rayitas son
     * pelusa. El destello dice "brillo", que es lo que enciende el boton.
     */
    halo: [
      "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9z",
      "M11.5 9.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z",
      "M19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"
    ],
    video: ["M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"],
    /*
     * La ventanita: el dibujo clasico de picture-in-picture (marco con un
     * recuadro macizo en la esquina), que es exactamente lo que hace el
     * boton: pedirle al navegador SU ventana flotante de video. El marco
     * es un anillo de dos subtrazos girando al reves (mismo truco que los
     * del pulso) y el recuadro va macizo para que a 10 px se lea "una
     * ventana con algo dentro" y no dos rectangulos sueltos.
     */
    ventanita: [
      "M19 11h-8v6h8v-6z",
      "M23 19V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"
    ],
    /*
     * El microfono es "ver la letra en grande", que es lo que ofrece el
     * boton del escenario cuando la cancion NO trae video. Un microfono y
     * no unas comillas o un pentagrama porque es el simbolo que usan los
     * propios reproductores para la letra, incluido YouTube Music.
     */
    letra: [
      "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z",
      "M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
    ],
    /*
     * La luna es el temporizador de apagado APAGADO. El boton es hibrido
     * como ningun otro de la fila: con plazo puesto enseña los minutos que
     * quedan (texto, como la velocidad) y sin plazo enseña este dibujo. Un
     * creciente macizo y no una luna con zetas: a 10 px las zetas serian
     * tres motas, y el creciente solo ya dice "dormir" en cualquier
     * reproductor.
     */
    luna: [
      "M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"
    ],
    /*
     * La chincheta es "fijar este ecualizador a esta cancion". Una
     * chincheta y no un candado ni una estrella: el candado dice "no se
     * puede tocar" —y el ajuste se puede seguir tocando— y la estrella ya
     * significa favorito en media internet, que aqui seria pisarle el
     * terreno al corazon. Fijar/clavar es exactamente lo que hace el boton.
     * El dibujo es el push_pin de Material, que es el que usan Chrome y
     * media web para "fijar", asi que ya viene aprendido.
     */
    chincheta: [
      "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
    ],
    tamano: ["M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10z"],
    cerrar: [
      "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
    ]
  };

  /**
   * Un <svg> nuevo con el icono `nombre`, o `null` si no existe.
   *
   * Se devuelve `null` en vez de un icono de reserva a proposito: un nombre
   * mal escrito tiene que dejar el boton como estaba —con su texto, si lo
   * tenia— y avisar, no colar un dibujo cualquiera que pase por bueno.
   */
  function crear(doc, nombre) {
    const trazos = TRAZOS[nombre];
    if (!trazos) {
      console.warn("[YTMPip] icono desconocido: " + nombre);
      return null;
    }
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    // Decoracion pura: lo que el boton SIGNIFICA ya lo dice su aria-label,
    // que no se toca. Sin esto un lector de pantalla anunciaria el grafico
    // ademas de la etiqueta.
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "ytmpip-ico");
    for (let i = 0; i < trazos.length; i++) {
      const p = doc.createElementNS(NS, "path");
      p.setAttribute("d", trazos[i]);
      svg.appendChild(p);
    }
    return svg;
  }

  /**
   * Deja a `el` con ese icono dentro y nada mas.
   *
   * `replaceChildren` y no innerHTML: ademas de no montar cadenas de HTML a
   * mano, esto se lleva por delante el emoji que el boton pudiera tener
   * escrito en pip.html. Sin ese borrado el icono nuevo saldria al lado del
   * viejo.
   */
  function poner(el, nombre) {
    if (!el) return false;
    /*
     * SI YA ESTA PUESTO, NO SE VUELVE A CONSTRUIR. Los botones que cambian
     * de dibujo —reproducir/pausar, me gusta, volumen— se repintan desde
     * `render`, que pasa por aqui varias veces por segundo aunque no haya
     * cambiado nada. Sin esta salida, cada segundo se tiraban unos cuantos
     * <svg> a la basura para poner otros identicos.
     *
     * Se comprueba TAMBIEN que haya un elemento dentro, y no solo el
     * atributo: en pip.html el `data-ico` viene escrito de antemano, con el
     * emoji todavia de contenido. Mirando solo el atributo, ese primer
     * pintado —el que sustituye el emoji— seria justo el que se saltaria.
     */
    if (el.dataset && el.dataset.ico === nombre && el.firstElementChild) return true;
    const svg = crear(el.ownerDocument, nombre);
    if (!svg) return false;
    el.replaceChildren(svg);
    // Deja escrito cual quedo puesto: es lo que lee la comprobacion de
    // arriba, y de paso el nombre del dibujo se ve en el inspector.
    if (el.dataset) el.dataset.ico = nombre;
    return true;
  }

  /**
   * Pinta de una vez todos los botones del documento que pidan icono con
   * `data-ico`.
   *
   * Los nombres viven en el HTML y no en una lista aqui dentro porque el
   * HTML es quien sabe que botones hay; esta funcion solo sabe dibujar.
   */
  function pintarTodos(doc) {
    if (!doc || !doc.querySelectorAll) return 0;
    const nodos = doc.querySelectorAll("[data-ico]");
    let puestos = 0;
    for (let i = 0; i < nodos.length; i++) {
      if (poner(nodos[i], nodos[i].getAttribute("data-ico"))) puestos++;
    }
    return puestos;
  }

  YTMPip.Iconos = {
    crear,
    poner,
    pintarTodos,
    // Expuesta para que una prueba pueda comprobar que todo `data-ico` del
    // HTML tiene dibujo, sin tener que repetir la lista de nombres.
    NOMBRES: Object.keys(TRAZOS)
  };
})(typeof self !== "undefined" ? self : globalThis);
