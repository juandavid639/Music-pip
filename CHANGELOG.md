# Registro de cambios

Todas las novedades visibles de Music PiP, versión a versión. El número
es el mismo `version` del `manifest.json` y el mismo del zip que se sube
a la Chrome Web Store. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es/).

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
