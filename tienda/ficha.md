# Ficha de la Chrome Web Store — todo lo que se pega en el formulario

Esta carpeta **no viaja en el zip** (el empaquetador usa lista blanca: `manifest.json`,
`_locales`, `src`, `assets`). Es material para la consola de desarrollador:
https://chrome.google.com/webstore/devconsole

---

## 1. Datos básicos

| Campo | Valor |
| --- | --- |
| Nombre | Music PiP *(lo lee del manifiesto; no se escribe)* |
| Resumen (132 máx.) | *(lo lee del manifiesto: `extension_descripcion`, ya cabe y ya dice «no oficial»)* |
| Categoría | **Entretenimiento** (alternativa razonable: Herramientas) |
| Idioma principal | **English** (desde 2026-10-08; el español va como traducción) |

---

## 2. Descripción larga — ENGLISH (idioma principal)

Desde el 2026-10-08 el inglés es el idioma principal de la ficha y de la
extensión (`default_locale: "en"`), por decisión del autor: con el español
de principal, quien tenía Chrome en otro idioma (portugués, francés,
alemán…) veía la extensión y la ficha en español. En la consola: «Ficha de
Play Store» → idioma predeterminado **English**, y el español se añade
como traducción.

Al día con la 1.2.1 (2026-10-01): menú con ajustes rápidos, onda de serie,
cuatro temas, vinilo, acento propio, estado en el icono, copia de
preferencias y aviso de «el sitio cambió».


```
A floating window that stays on top while you work, showing whatever is playing
on YouTube Music, YouTube or Spotify.

WHAT IT DOES
• Artwork, title and artist of the current song, with controls: play, pause,
  next/previous, seek, volume and speed.
• Synced lyrics (karaoke) where the site offers them, with a clean stage mode
  that shows the lyrics big.
• 5-band equalizer with presets (bass, voice, night…) and per-song memory.
• Audio visualizer in three shapes: wave (default), bars or a ring around the
  artwork, in the theme color, your own color, rainbow, your palette or the
  color of what is playing.
• The artwork can show as a vinyl record spinning while music plays, and it
  crossfades into the next song's artwork.
• A light halo around the window edge: steady or beating with the music, in
  the theme color, your own color, or the artwork's color.
• Four themes: dark, light, automatic (follows your system) and "from the
  video or artwork", which tints the window with the color of what is playing.
  Plus an accent color of your choice.
• The Chrome toolbar icon shows whether music is playing or paused, or the
  minutes left on the sleep timer.
• On Spotify: the animated Canvas video can play as the window background.
• The browser's native floating video (🎬) where there is video.
• Configurable keyboard shortcuts and a sleep timer.
• The most-used settings are one click away in the icon's menu ("Settings"
  tab: halo, vinyl, lyrics, video, theme and bars shape), and everything else
  on the Options page, with a real preview that follows you as you choose.
  Your preferences can be exported to a file, imported on another computer,
  or reset to factory settings.
• If the music site changes and a control can no longer be found, the window
  tells you instead of going silent.

WHAT IT DOES NOT DO
• It collects no data: preferences are stored only in your browser, and the
  exported file stays wherever you save it.
• It touches nothing outside music.youtube.com, www.youtube.com and
  open.spotify.com.
• No ads, no playback tampering: it drives the controls the page already has.

HONEST LIMITS (measured, not assumed)
• Spotify's video is encrypted (DRM): it cannot be drawn inside the window;
  the 🎬 button opens the browser's native floating video instead.
• Spotify's audio never passes through the page: the equalizer and the
  visualizer only work on YouTube and YouTube Music.
• YouTube has no lyrics panel: karaoke lives on YouTube Music and Spotify.

Requires Chrome 116+ (it uses the Document Picture-in-Picture API).

Unofficial. Not affiliated with Google or Spotify. YouTube, YouTube Music and
Spotify are trademarks of their owners; this extension only works with their
websites.
```

## 3. Descripción larga — ESPAÑOL (traducción)


```
Una ventana flotante que se queda encima de todo mientras trabajas, con la música
que suena en YouTube Music, YouTube o Spotify.

QUÉ HACE
• Portada, título y artista de la canción en curso, con controles: reproducir,
  pausar, saltar de canción, adelantar/atrasar, volumen y velocidad.
• Letra sincronizada (karaoke) donde el sitio la ofrece, con un modo escenario
  limpio que deja la letra en grande.
• Ecualizador de 5 bandas con presets (graves, voz, nocturno…) y memoria por
  canción.
• Visualizador de audio en tres formas: onda (de serie), barras o un anillo
  alrededor de la carátula, del color del tema, de un color tuyo, en arcoíris,
  con tu paleta o del color de lo que suena.
• La carátula puede verse como un disco de vinilo que gira mientras suena, y
  al cambiar de canción se funde con la siguiente.
• Halo de luz al borde de la ventana: fijo o latiendo con la música, del color
  del tema, de un color tuyo o del color de la carátula.
• Cuatro temas: oscuro, claro, automático (sigue a tu sistema) y «del vídeo o
  la carátula», que tiñe la ventana con el color de lo que suena. Y el color de
  acento, a tu elección.
• El icono de la barra de Chrome dice si la música suena o está en pausa, o
  los minutos que le quedan al apagado programado.
• En Spotify: el vídeo animado de fondo (Canvas) puede verse de fondo en la
  ventana.
• Vídeo flotante nativo del navegador (🎬) donde hay vídeo.
• Atajos de teclado configurables y apagado programado.
• Lo más usado se cambia desde el menú del icono (pestaña «Ajustes»: halo,
  vinilo, letra, vídeo, tema y forma de las barras), y todo lo demás en
  Preferencias, con una vista previa real que te acompaña mientras eliges.
  Tus preferencias se pueden exportar a un archivo, importar en otro equipo
  o devolver a los valores de fábrica.
• Si el sitio de música cambia y algún mando deja de encontrarse, la ventana
  te lo dice en vez de quedarse muda.

QUÉ NO HACE
• No recopila ningún dato: las preferencias se guardan solo en tu navegador, y
  el archivo exportado lo guardas tú donde quieras.
• No toca nada fuera de music.youtube.com, www.youtube.com y open.spotify.com.
• No añade anuncios ni modifica la reproducción: manda sobre los controles que
  la propia página ya tiene.

LÍMITES HONESTOS (medidos, no supuestos)
• El vídeo de Spotify va cifrado (DRM): dentro de la ventana no puede pintarse;
  el botón 🎬 abre el vídeo flotante nativo del navegador.
• El sonido de Spotify no pasa por la página: el ecualizador y el visualizador
  solo funcionan en YouTube y YouTube Music.
• YouTube no tiene panel de letra: el karaoke vive en YouTube Music y Spotify.

Requiere Chrome 116 o superior (usa la API Document Picture-in-Picture).

No oficial. No afiliado a Google ni a Spotify. YouTube, YouTube Music y Spotify
son marcas de sus dueños; esta extensión solo funciona con sus sitios web.
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
funciona. Además, al instalar o actualizar la extensión, vuelve a cargar los
propios scripts del paquete en las pestañas de los tres sitios que ya estaban
abiertas, para que sigan funcionando sin recargarlas. No inyecta código remoto
ni corre en otros sitios.
```

```
When the user clicks the toolbar icon, the service worker runs a minimal call
in the music tab to open the floating window while preserving the user gesture
(the Document Picture-in-Picture API requires user activation). If it cannot
open, it is used to highlight the in-page button that does work. Also, when the
extension is installed or updated, it reloads the package's own scripts into
already-open tabs of the three sites so they keep working without a reload. It
injects no remote code and runs on no other sites.
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

**Permiso de host OPCIONAL (soundcloud.com)** — tanda AV. Va en
`optional_host_permissions`: no se concede al instalar ni al actualizar; lo
pide el usuario desde Preferencias («Más sitios»). Justificación:

```
Optional, requested only when the user turns SoundCloud on in the options
page. With it, the same content script reads the song metadata and drives the
player controls on soundcloud.com, exactly as on the other music sites. Without
it, the extension never runs there.
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
| Capturas (mín. 1, máx. 5) a 1280×800 | LISTO — `capturas-finales/captura-1..5.png` (las crudas quedan en `capturas-crudas/`, que no viaja al repo) |
| Mosaico promocional 440×280 | LISTO — `mosaico-440x280.png` (generado por `tools/generar-mosaico.js`) |
| Mosaico marquesina 1400×560 | OPCIONAL |

Ya en el orden de subida (la primera es la que más se ve):

1. `captura-1` — karaoke flotante sobre YouTube Music (la función estrella).
2. `captura-2` — barras de espectro sobre YouTube.
3. `captura-3` — Spotify en el escritorio con la ventana abierta.
4. `captura-4` — YouTube Music en el monitor con la ventana mini.
5. `captura-5` — la página de Preferencias con su vista previa.

Cómo se hicieron las finales: las dos fotos de monitor van con recorte
centrado a proporción 1.6 exacta (los bordes eran decorado); las tres
capturas de página completa van escaladas a lo ancho con bandas del
color del fondo de la propia página (recortarlas se comía interfaz).
Todas terminan en 1280×800 clavados con reescalado bicúbico.

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

## 10. Cómo publicar una actualización (PUBLICADA 1.0.0 el 2026-09-25)

1. Hacer los cambios con el ritual de siempre (pruebas, mutación, README).
2. Subir el número en `manifest.json` → `"version"` (la tienda solo acepta
   versiones mayores que la publicada). Criterio: tercer número para arreglos
   (1.0.1), segundo para funciones nuevas (1.1.0).
3. Anotar lo visible en `CHANGELOG.md` (raíz del repo): mover lo de
   «Sin publicar» a una sección con el número y la fecha.
4. Reempaquetar: `tools/empaquetar.ps1` + `tools/revisar-zip.js` — el zip
   sale con el número nuevo en el nombre.
   Antes de subirlo, `npm run humo` (tanda AX): carga la extensión en un
   Chromium limpio y la prueba contra YouTube real, ventana flotante incluida.
   Después, con la extensión desempaquetada de esa versión y una
   canción sonando, pegar `tools/diagnostico/diagnostico-publicacion.js` en la consola
   de cada sitio (contexto «Music PiP» en el desplegable de DevTools): si
   dice FALLO, no se publica sin mirarlo (tanda AL).
5. Consola → el elemento → **Package** → **Upload new package** → subir el
   zip → **Submit for review**.
6. Los usuarios se actualizan solos (Chrome busca cada pocas horas); no hay
   que avisar a nadie.
7. Commit + tag en el repo: `git tag v1.0.1` y `git push --tags`.

OJO: añadir permisos nuevos en el manifiesto dispara revisión profunda y
puede mostrar un aviso de «nuevos permisos» a los usuarios. No tocar
`permissions` ni `host_permissions` salvo necesidad real.
