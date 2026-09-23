# Ficha de la Chrome Web Store — todo lo que se pega en el formulario

Esta carpeta **no viaja en el zip** (el empaquetador usa lista blanca: `manifest.json`,
`src`, `assets`). Es material para la consola de desarrollador:
https://chrome.google.com/webstore/devconsole

---

## 1. Datos básicos

| Campo | Valor |
| --- | --- |
| Nombre | Music PiP *(lo lee del manifiesto; no se escribe)* |
| Resumen (132 máx.) | *(lo lee del manifiesto: `extension_descripcion`, ya cabe y ya dice «no oficial»)* |
| Categoría | **Entretenimiento** (alternativa razonable: Herramientas) |
| Idioma principal | Español |

---

## 2. Descripción larga — ESPAÑOL

```
Una ventana flotante que se queda encima de todo mientras trabajas, con la música
que suena en YouTube Music, YouTube o Spotify.

QUÉ HACE
• Portada, título y artista de la canción en curso, con controles: reproducir,
  pausar, saltar de canción, adelantar/atrasar, volumen y velocidad.
• Letra sincronizada (karaoke) donde el sitio la ofrece, con un modo escenario
  limpio que deja la letra en grande.
• Ecualizador de 5 bandas con presets (graves, voz, nocturno…) y memoria por
  canción, y barras de espectro que bailan con el audio.
• Halo de luz al borde de la ventana: fijo, latiendo con la música, del color
  del tema, de un color tuyo o del color de la carátula.
• En Spotify: el vídeo animado de fondo (Canvas) puede verse de fondo en la
  ventana.
• Vídeo flotante nativo del navegador (🎬) donde hay vídeo.
• Atajos de teclado configurables y apagado programado.
• Tema claro y oscuro; todo se configura en la página de Preferencias, con
  vista previa real incluida.

QUÉ NO HACE
• No recopila ningún dato: las preferencias se guardan solo en tu navegador.
• No toca nada fuera de music.youtube.com, www.youtube.com y open.spotify.com.
• No añade anuncios ni modifica la reproducción: manda sobre los controles que
  la propia página ya tiene.

LÍMITES HONESTOS (medidos, no supuestos)
• El vídeo de Spotify va cifrado (DRM): dentro de la ventana no puede pintarse;
  el botón 🎬 abre el vídeo flotante nativo del navegador.
• El sonido de Spotify no pasa por la página: el ecualizador y las barras solo
  funcionan en YouTube y YouTube Music.
• YouTube no tiene panel de letra: el karaoke vive en YouTube Music y Spotify.

Requiere Chrome 116 o superior (usa la API Document Picture-in-Picture).

No oficial. No afiliado a Google ni a Spotify. YouTube, YouTube Music y Spotify
son marcas de sus dueños; esta extensión solo funciona con sus sitios web.
```

## 3. Descripción larga — ENGLISH

```
A floating window that stays on top while you work, showing whatever is playing
on YouTube Music, YouTube or Spotify.

WHAT IT DOES
• Artwork, title and artist of the current song, with controls: play, pause,
  next/previous, seek, volume and speed.
• Synced lyrics (karaoke) where the site offers them, with a clean stage mode
  that shows the lyrics big.
• 5-band equalizer with presets (bass, voice, night…) and per-song memory,
  plus spectrum bars dancing with the audio.
• A light halo around the window edge: steady or beating with the music, in
  the theme color, your own color, or the artwork's color.
• On Spotify: the animated Canvas video can play as the window background.
• The browser's native floating video (🎬) where there is video.
• Configurable keyboard shortcuts and a sleep timer.
• Light and dark theme; everything is configured on the Options page, with a
  real embedded preview.

WHAT IT DOES NOT DO
• It collects no data: preferences are stored only in your browser.
• It touches nothing outside music.youtube.com, www.youtube.com and
  open.spotify.com.
• No ads, no playback tampering: it drives the controls the page already has.

HONEST LIMITS (measured, not assumed)
• Spotify's video is encrypted (DRM): it cannot be drawn inside the window;
  the 🎬 button opens the browser's native floating video instead.
• Spotify's audio never passes through the page: the equalizer and the
  spectrum bars only work on YouTube and YouTube Music.
• YouTube has no lyrics panel: karaoke lives on YouTube Music and Spotify.

Requires Chrome 116+ (it uses the Document Picture-in-Picture API).

Unofficial. Not affiliated with Google or Spotify. YouTube, YouTube Music and
Spotify are trademarks of their owners; this extension only works with their
websites.
```

---

## 4. Declaración de propósito único (la consola la pide)

```
Mostrar una ventana flotante siempre visible (Document Picture-in-Picture) con
la información y los controles de la música que suena en YouTube Music, YouTube
o Spotify.
```

```
Show an always-on-top floating window (Document Picture-in-Picture) with the
information and controls of the music playing on YouTube Music, YouTube or
Spotify.
```

## 5. Justificación de cada permiso (la consola exige una por permiso)

**storage**

```
Guarda las preferencias del usuario (tema, tamaño de la ventana, ecualizador,
halo, atajos…) en chrome.storage.local. Nada sale del navegador; no hay
sincronización ni servidores.
```

```
Stores the user's preferences (theme, window size, equalizer, halo, shortcuts…)
in chrome.storage.local. Nothing leaves the browser; no sync, no servers.
```

**scripting**

```
Cuando el usuario pulsa el icono de la barra, el service worker ejecuta una
llamada mínima en la pestaña musical para abrir la ventana flotante conservando
el gesto del usuario (la API Document Picture-in-Picture exige activación de
usuario). Si no puede abrirse, se usa para señalar el botón de la página que sí
funciona. No inyecta código remoto ni corre en otros sitios.
```

```
When the user clicks the toolbar icon, the service worker runs a minimal call
in the music tab to open the floating window while preserving the user gesture
(the Document Picture-in-Picture API requires user activation). If it cannot
open, it is used to highlight the in-page button that does work. It injects no
remote code and runs on no other sites.
```

**Permisos de host (music.youtube.com, www.youtube.com, open.spotify.com)**

```
El content script lee de la propia página los metadatos de la canción (título,
artista, portada, letra) y escribe sobre los controles que la página ya ofrece
(reproducir, saltar, volumen). Solo en esos tres sitios de música; la extensión
no funciona ni se carga en ningún otro.
```

```
The content script reads the song metadata (title, artist, artwork, lyrics)
from the page itself and drives the controls the page already offers (play,
skip, volume). Only on those three music sites; the extension does not load
anywhere else.
```

**¿Usa código remoto?** → **No.** Todo el código viaja en el paquete.

## 6. Declaración de datos (pestaña «Privacidad» de la consola)

- «¿Recopila o usa datos de usuario?» → marcar **NO** en todas las categorías
  (no se recopila nada: ni actividad, ni historial, ni identificadores).
- Certificaciones: se pueden marcar las tres (no se venden datos, no se usan
  para fines ajenos al propósito, no se usan para solvencia crediticia) —
  son ciertas por vacuidad: no hay datos.
- **URL de la política de privacidad**: obligatoria aunque no se recopile nada.
  El texto listo está en `politica-de-privacidad.html` (esta carpeta);
  ver el README de abajo para alojarla gratis.

## 7. Material gráfico

| Pieza | Estado |
| --- | --- |
| Icono de tienda 128×128 | LISTO — `assets/icons/icon128.png` (generado por código) |
| Capturas (mín. 1, máx. 5) a 1280×800 | PENDIENTE — receta en `capturas-receta.md` |
| Mosaico promocional 440×280 | PENDIENTE — se puede generar por código como el logo |
| Mosaico marquesina 1400×560 | OPCIONAL |

## 8. Alojar la política de privacidad — HECHO CON GITHUB PAGES

El proyecto entero vive en https://github.com/juandavid639/Music-pip
(licencia MIT; el correo de contacto ya está puesto en la política).
Con Pages encendido (Settings → Pages → Deploy from a branch → main →
/ (root) → Save), la URL que se pega en la consola de la tienda es:

```
https://juandavid639.github.io/Music-pip/tienda/politica-de-privacidad.html
```

Pages tarda 1-2 minutos en publicar tras cada push; comprobar que la URL
abre antes de pegarla en la consola.

## 9. Orden de faena en la consola

1. Pagar el registro de desarrollador ($5, tarifa única) — solo tú.
2. «New item» → subir `dist/music-pip-1.0.0.zip`.
3. Store listing: pegar descripción (ES como principal; añadir EN como idioma).
4. Subir capturas y mosaico.
5. Privacy: propósito único, justificaciones (sección 5), NO datos, URL de la
   política.
6. Distribución: pública, todos los países (o los que quieras).
7. Submit for review — la revisión tarda de horas a pocos días; los rechazos
   llegan por correo con el motivo.
