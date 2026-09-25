# Registro de cambios

Todas las novedades visibles de Music PiP, versión a versión. El número
es el mismo `version` del `manifest.json` y el mismo del zip que se sube
a la Chrome Web Store. Formato inspirado en [Keep a Changelog](https://keepachangelog.com/es/).

## [Sin publicar]

_Aquí se van anotando los cambios según se hacen; al publicar una
versión, esta sección se renombra con su número y su fecha._

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
