# Registro de cambios

Todas las novedades visibles de Music PiP, versión a versión. El número
es el mismo `version` del `manifest.json` y el mismo del zip que se sube
a la Chrome Web Store. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es/).

## [1.3.0] — 2026-10-08

### Added / Añadido

- **A welcome page** opens right after installing: how to open the floating
  window (with the PiP button on the music page) and where the menu is.
- **Una página de bienvenida** se abre justo al instalar: cómo abrir la
  ventana flotante (con el botón PiP de la página de música) y dónde está el
  menú.
- **Your own equalizer settings**: save the band values under a name
  (up to 8) and come back to them in one click from the options page. The
  window's equalizer button says its name while it is playing.
- **Tus propios ajustes de ecualizador**: guarda los números de las bandas
  con un nombre (hasta 8) y vuelve a ellos con un clic desde Preferencias.
  El botón del ecualizador de la ventana dice su nombre mientras suena.
- **What you listened to** (off by default): if you turn it on, a page
  shows your most played songs and artists and your latest plays, for 7
  days, 30 days or everything. It stays on your computer and can be turned
  off and deleted at any time.
- **Lo que escuchaste** (apagado de serie): si lo enciendes, una página te
  enseña tus canciones y artistas más escuchados y lo último que sonó, de 7
  días, 30 días o todo. Se queda en tu equipo y lo puedes apagar y borrar
  cuando quieras.
- **SoundCloud**, as an optional site: turn it on in the options page ("More
  sites") and Chrome asks for that site's permission only. Artwork, title,
  controls and seeking; no lyrics, equalizer or bars, because its audio does
  not go through the page.
- **SoundCloud**, como sitio opcional: actívalo en Preferencias («Más sitios»)
  y Chrome te pide permiso solo para ese sitio. Carátula, título, mandos y
  saltos; sin letra, ecualizador ni barras, porque su sonido no pasa por la
  página.

### Privacy / Privacidad

- Websites can no longer tell whether you have Music PiP installed by
  probing its files (from Chrome 130).
- Las páginas web ya no pueden saber si tienes Music PiP instalado
  preguntando por sus archivos (desde Chrome 130).

## [1.2.2] — 2026-10-08

### Changed / Cambiado

- **English is now the default language.** If your browser is in a language
  the extension does not speak yet (Portuguese, French, German…), you will
  see it in English instead of Spanish. With Chrome in Spanish, nothing
  changes.
- **El inglés es ahora el idioma por defecto.** Si tu navegador está en un
  idioma que la extensión aún no habla (portugués, francés, alemán…), la
  verás en inglés en vez de en español. Con Chrome en español, no cambia
  nada.

## [1.2.1] — 2026-10-01

### Añadido

- El menú del icono tiene pestañas, como el de Better Lyrics: **Ahora suena**
  (la canción y sus mandos), **Ajustes** (lo más usado a un clic: el halo y
  su latido, el disco de vinilo, la letra, el vídeo, el estado en el icono,
  el tema y la forma de las barras) y **Avanzada**, que abre todas las
  preferencias en detalle.

### Cambiado

- El icono de la barra de Chrome abre ahora ese menú. Para abrir la ventana
  flotante: el botón PiP de la página, «Abrir ventana flotante» en el menú
  o Alt+Shift+P.
- La forma de serie de las barras de sonido es ahora la **onda**. Las
  barras y el anillo siguen a un clic.

### Corregido

- El halo en modo «latiendo con la música» ya late con los graves en cuanto
  se abre la ventana. Antes salía quieto hasta pulsar el botón ✨ dos veces.

## [1.2.0] — 2026-09-29

### Añadido

- Preferencias tiene una tarjeta nueva, **Tus preferencias**: exportarlas a
  un archivo, importarlas de uno (por ejemplo, en otro equipo) y volver a
  los valores de fábrica. El archivo solo lleva las preferencias; las
  canciones con ecualizador fijado se conservan al restaurar.
- Si el sitio de música cambia y la extensión deja de encontrar el botón
  de reproducir, el de siguiente o el título mientras suena algo, la
  ventana lo dice («El sitio cambió: algunos mandos pueden no responder»)
  en vez de quedarse muda.

### Cambiado

- Un fallo en una parte de la ventana (la letra, la cola, las barras…) ya
  no se lleva por delante el resto: el título, la carátula y los botones
  siguen al día.
- Tras actualizar la extensión, la copia anterior que quedaba en las
  pestañas de música abiertas deja de trabajar en cuanto llega la nueva
  (a partir de la próxima actualización: la copia que se retira tiene que
  saber hacerlo).
- En un navegador sin ventana flotante nativa, abrir desde la ventana de
  respaldo enfoca la que ya hay en vez de abrir otra cada vez, y el menú
  dice por qué.

### Seguridad

- Las páginas de música ya no pueden pedir que se abra la ventana
  flotante con un evento propio (esa vía no la usaba la extensión).

## [1.1.1] — 2026-09-29

### Cambiado

- La vista previa de Preferencias enseña lo que eliges: el tema, el
  halo, el disco de vinilo y la forma, el color y la altura de las
  barras, y se actualiza al momento al cambiar una opción.
- La vista previa acompaña al bajar por la página: en pantallas anchas
  va en una columna a la derecha, siempre a la vista.

### Añadido

- Se puede elegir el **color de acento** (el de los botones encendidos,
  la barra de progreso y el botón grande) en vez del rojo de siempre.
  Preferencias avisa si el color elegido se lee mal sobre el tema.

## [1.1.0] — 2026-09-28

### Añadido

- Dos temas nuevos para la ventana: **Automático**, que sigue el claro u
  oscuro del sistema, y **Del vídeo o la carátula**, que tiñe la ventana
  entera con el color de lo que suena (manteniendo el texto legible con
  cualquier color).
- Las barras de sonido tienen dos formas nuevas: una **onda** y un
  **anillo** de rayos alrededor de la carátula. Se eligen en
  Preferencias y funcionan con todos los modos de color.
- La carátula puede verse como un **disco de vinilo** que gira mientras
  suena la música (sin girar si el sistema pide menos movimiento).
- Al cambiar de canción, la carátula se funde con la nueva en vez de
  cambiar de golpe (y sin quedarse un instante en blanco).
- El icono de la barra de Chrome enseña si la música suena (▶) o está
  en pausa (❚❚), o los minutos que le quedan al temporizador. Se puede
  apagar en Preferencias.

## [1.0.2] — 2026-09-28

### Corregido

- Tras actualizar la extensión, las pestañas de música que ya estaban
  abiertas siguen funcionando sin recargarlas: el botón PiP de la
  página, el icono y los atajos. Antes hacía falta un F5 que nadie
  sabía que había que dar.
- Los atajos de teclado van a la pestaña que estaba sonando, aunque
  lleve un rato en pausa y haya otras pestañas de YouTube abiertas.
- Abrir la ventana desde el menú, cuando Chrome no lo permite, dice
  dónde pulsar en vez de no hacer nada.
- La ventana ya no vuelve a aplicar todas las preferencias cada
  segundo mientras suena música.
- La barra de tiempo ya no se queda congelada al usar un atajo de
  teclado justo después de hacer clic en ella, ni al reabrir la ventana
  tras cerrarla a mitad de un arrastre (lo mismo con el volumen).
- Al reabrir la ventana, la cola se ve aunque no haya cambiado, y la
  canción que ya sonaba no se anuncia como si fuera nueva.
- Un doble clic en el botón PiP ya no deja la ventana con los controles
  duplicados.
- Los lectores de pantalla leen la ventana, el menú y Preferencias con
  la voz del idioma de sus textos, y la línea de letra en vivo se puede
  abrir con el teclado.
- Con Preferencias abierta, lo que se cambia desde la ventana flotante
  (halo, fondo, ecualizador) ya no se deshace al tocar otra opción.
- Fijar el ecualizador a una canción en una pestaña ya no borra lo
  fijado en otra.
- El ecualizador nunca intenta tocar el audio de un sitio que no lo
  admite (protección extra para el modo vídeo de Spotify).
- La vista previa de Preferencias sale en el idioma del navegador, usa
  una canción de ejemplo inventada y ya no atrapa el foco del teclado.
- Preferencias anuncia el «Guardado.» a los lectores de pantalla.
- La política de privacidad enumera lo que se guarda en el navegador
  y ya no promete un botón de restaurar que no existe.

## [1.0.1] — 2026-09-25

### Cambiado

- La ventana estrena con más vida de serie: el halo ahora **late con la
  música** (antes venía fijo), y tanto el halo como las barras del
  espectro toman **el color de lo que suena** (la carátula o el vídeo)
  en vez del color del tema. Nada cambia para quien ya tocó esos
  ajustes: solo son los valores de serie.
- Sin sorpresas en el estreno: hasta el primer clic que toque audio el
  halo sale fijo (el latido necesita ese gesto), y hasta que hay color
  muestreado se usa el del tema — la primera impresión es idéntica a
  la 1.0.0 y va cobrando vida sola.

## [1.0.0] — 2026-09-25

Primera versión pública en la Chrome Web Store.

### Añadido

- Ventana flotante siempre visible (Document Picture-in-Picture) con
  carátula, título y artista de la canción en curso, y controles:
  reproducir, pausar, saltar, adelantar/atrasar, volumen y velocidad.
- Funciona con YouTube Music, YouTube y Spotify (y con nada más).
- Letra sincronizada (karaoke) donde el sitio la ofrece, con modo
  escenario que deja la letra en grande y limpia.
- Ecualizador de 5 bandas con presets y memoria por canción, y barras
  de espectro que bailan con el audio (solo YouTube y YouTube Music:
  el sonido de Spotify no pasa por la página).
- Halo de luz por el borde interior de la ventana: fijo, latiendo con
  la música, del color del tema, de un color propio o del color de la
  carátula.
- Fondo con el vídeo animado de Spotify (Canvas) dentro de la ventana.
- Botón 🎬 para el vídeo flotante nativo del navegador donde hay vídeo
  (en Spotify es la única vía: su vídeo va cifrado con DRM).
- Atajos de teclado configurables y apagado programado.
- Tema claro y oscuro; página de Preferencias con vista previa real de
  la ventana incrustada.
- Sin recopilación de datos: las preferencias viven solo en
  `chrome.storage.local`.
