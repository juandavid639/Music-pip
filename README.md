# Music PiP

Extensión de Chrome (Manifest V3, no oficial, no afiliada a Google/YouTube) que abre una
ventana flotante (Document Picture-in-Picture) para controlar YouTube Music: portada,
título, artista, progreso, controles de reproducción y letras (solo las que la propia
página ya muestra en pantalla, sean de YouTube Music o de Better Lyrics).

*(Se llamaba «YouTube Music PiP». El nombre se acortó al preparar la publicación,
por dos motivos: llevar una marca ajena en el nombre es la causa de rechazo más
previsible que tenía el paquete, y el plan es ampliarlo más allá de YouTube Music.
La marca sigue apareciendo en la descripción, que es donde describe con qué
funciona y no qué es. El cambio tocó seis archivos; abajo está por qué eso no se
puede arreglar y sí se puede sujetar.)*

## Estado actual

Prototipo funcional (Fase 1 del documento de arquitectura), en JavaScript plano sin
paso de build. Implementa el backlog de prioridad crítica:

- Manifest V3, permisos mínimos de verdad (`storage`, `scripting`, host permission
  solo para `music.youtube.com`).

  *(Aquí ponía además `activeTab`. Se pedía y no se usaba en ninguna línea de
  código: aparecía solo en el manifiesto. Todo el acceso a pestañas pasa por
  `chrome.tabs.query({ url: … })` filtrando por `music.youtube.com`, que lo cubre
  el permiso de host. Un permiso que sobra no rompe nada —por eso llevaba ahí
  desde el primer día— pero en la ficha de la tienda hay que justificar cada uno
  por escrito, y no hay forma de justificar el que no se usa.)*
- Detección de la pestaña de YouTube Music desde el service worker.
- Lectura de metadatos (título, artista, álbum, portada, tiempo/duración) vía
  `youtube-music-adapter.js`, con selectores por prioridad (accesibilidad → rol →
  elemento nativo → atributo estable → clase CSS).
- Apertura de la ventana Document PiP con fallback a una ventana emergente normal
  cuando la API no está disponible.
- Reproducir/pausar, anterior/siguiente, adelantar/retroceder 10s.
- Sincronización automática al cambiar de canción vía `MutationObserver` (debounced).
- Manejo básico de desconexión (cierre/pérdida de la pestaña).
- Preferencias efectivas: todas las opciones de `src/options/` se aplican de
  verdad en la ventana PiP (segundos de seek, tema claro/oscuro, tamaño inicial,
  sección abierta por defecto, mostrar/ocultar letras, mostrar/ocultar vídeo,
  transparencia mientras suena, ecualizador, y las cuatro del espectro: número
  de barras, velocidad de caída, altura y color) y se propagan en vivo vía
  `chrome.storage.onChanged`, sin reabrir la ventana.

  *(Aquí ponía «las once opciones». Eran doce cuando alguien se molestó en
  contarlas. Un número en la prosa envejece en cuanto se añade una preferencia
  y nadie vuelve a leer esta línea, así que se ha quitado el número en lugar de
  corregirlo.)*
- Vídeo real en la ventana flotante, barra de progreso arrastrable, y controles de
  volumen, "me gusta", repetir y aleatorio.
- Botón para alternar entre el vídeo y la carátula sin tocar la música ni las
  preferencias guardadas; en canciones sin vídeo, ese mismo botón cambia entre
  la carátula y la letra a pantalla completa sobre la portada difuminada.
- Letra sincronizada e interactiva cuando la página da los tiempos (Better
  Lyrics): línea actual resaltada, adelanto de los versos siguientes,
  autodesplazamiento, clic para saltar, y modo karaoke (carátula + letra) cuando
  la canción no tiene vídeo.
- Modo «sólo carátula» (botón `Aa`): quita el título y el artista y la imagen se
  queda con el hueco que dejan.
- Espectro de la música sacado del audio real con `captureStream()`, sin tocar la
  reproducción. El botón sólo aparece si la pista se puede medir.
- **Iconos propios en SVG** en lugar de emoji, en la ventana flotante y en el
  menú de la barra: mismo trazo para todos, medidos en `em` (así el sistema de
  densidades sigue mandando) y pintados con `currentColor`, que es lo que hace
  que `:hover` y los estados encendidos por fin se vean.
- **Velocidad de reproducción** en la fila de extras: 1× → 1,25× → 1,5× → 0,75×
  y vuelta a empezar, con corrección de tono. El botón enseña la velocidad que
  de verdad tiene el `<video>`, no la última que se pidió.
- **Temporizador de apagado** (botón con luna): la música se pausa sola pasado
  el plazo —15, 30 o 60 minutos, y el cuarto clic lo quita—. Mientras está
  puesto, el botón deja la luna y enseña los minutos que quedan («29′»). El
  plazo es de reloj de pared: pausar a mano no lo congela, y muere con la
  pestaña, que es justo lo que significa «apaga *esta* música».
- Con la letra a pantalla completa, los controles se superponen y se apartan
  solos igual que sobre el vídeo, y el espectro se queda abajo del todo: la letra
  ocupa la ventana entera y nada le come sitio en reposo.
- Espectro en modo **RGB**: el arcoíris repartido por las barras y girando
  despacio, como los ventiladores de un ordenador gamer.
- Espectro con **paleta propia**: de 2 a 5 colores elegidos a mano, repartidos a
  lo ancho del primero al último e interpolados en HSL, con vista previa en la
  página de opciones pintada por la misma función que pinta las barras.
- El espectro arranca **desde el fondo de la ventana**, no desde el fondo del
  cuerpo, así que la altura en % significa por fin lo que dice.
- **Los mandos se apagan solos** a los tres segundos sin actividad —botones y
  barra de progreso, en todas las vistas— y vuelven con el ratón o con el
  teclado.
- Atenuación de la ventana **mientras suena la música** (0–80 %), configurable, y
  que se deshace sola al pausar.
- **Atajos de teclado** en la ventana flotante: espacio o `K` pausan, flechas
  izquierda/derecha (o `J`/`L`) mueven la canción los segundos configurados,
  flechas arriba/abajo suben y bajan el volumen de cinco en cinco, `N` y `P`
  cambian de canción y `M` silencia. Ninguno le quita la tecla a quien ya la
  tenía: si el foco está en un campo de texto, en un deslizador o en un botón,
  manda el navegador.
- **Ecualizador de cinco bandas** (60 Hz, 250 Hz, 1 kHz, 4 kHz, 12 kHz), con
  cuatro ajustes hechos —«Plano», «Más graves», «Voz», «Nocturno»— y los cinco
  mandos a mano en Preferencias. Viene **apagado**, y eso no es timidez:
  encenderlo cruza `createMediaElementSource()`, que es una puerta de un solo
  sentido, y nadie que sólo quería una ventana flotante debería cruzarla sin
  pedirlo. El botón 🎛 de la ventana enciende y apaga, y su etiqueta dice cuál
  está puesto («Ecualizador: Más graves»), no sólo que está encendido.
- **Y se ve la forma del ajuste**: al lado del botón, cinco barritas con una
  raya en el cero —las que suben salen de la raya, las que bajan cuelgan de
  ella— y los decibelios exactos al pasar el ratón. Hace falta porque el nombre
  puede contar lo contrario de lo que hace: «Más graves» tiene los 60 Hz a cero.
- **El ecualizador no revienta la señal.** Subir bandas satura, así que la
  entrada se baja antes de entrar al filtro, en la cantidad exacta que va a
  subir el pico. Medido, no supuesto: con el arreglo puesto, el preset «Más
  graves» activa el limitador el **0 %** del tiempo; sin preamplificar, el
  **99 %**. La cifra sale de `tools/diagnostico-limitador.js`.
- **El ecualizador se puede fijar a una canción** (botón con chincheta junto a
  las barritas): fija el ajuste que suena a la canción actual y, cada vez que
  esa canción vuelva, se pone solo; al llegar la siguiente sin fijar se
  devuelve el que había. Si en medio el usuario toca el ecualizador, manda él:
  la máquina sólo deshace lo que consta que puso ella. Recuerda hasta 200
  canciones y sobrevive a cerrar la pestaña.
- **La imagen late con los graves** (botón propio, junto al del espectro): crece
  un pelín cuando el bombo pega, y sólo cuando pega. Se mide contra una
  referencia que se mueve, así que una canción masterizada baja late igual que
  una alta. Vale para la carátula **y para el vídeo**, con la misma medida y la
  misma curva; el vídeo late menos porque se ve entero y el mismo porcentaje le
  recortaría cara y subtítulos.
- **El menú de la barra no es una caja gris.** Lleva la carátula difuminada de
  fondo con su velo, así que cambia con la música; el botón de reproducir es el
  grande y de color y los de anterior/siguiente acompañan; y un punto verde junto
  a la frase de estado contesta de un vistazo la primera pregunta, *¿me está
  viendo YouTube Music?*. Sin pestaña se apagan **los cuatro** botones, y se ve
  que están apagados.
- **La ventana recuerda su tamaño**: el desplegable "Tamaño al abrirla" de las
  opciones tiene una tercera respuesta, «Como la dejé la última vez». El tamaño se
  anota siempre al soltar el borde y al cerrar, se elija o no esa opción.
- **Las Preferencias están escritas para quien usa la extensión**, no para quien
  la escribió: tarjetas por tema en vez de una columna de veintitantas filas
  iguales, cada ajuste con una línea que dice para qué sirve, y los nombres en
  palabras de quien oye música («Cómo bajan las barras», no «Velocidad de caída
  (1 lenta — 60 brusca)»). El rojo es el mismo que el del menú y el de la ventana,
  que antes eran dos.

### Los controles se apartan solos

En modo superpuesto (ventana pequeña **y** con vídeo) la ventana *es* el vídeo, y
una barra de transporte permanente encima tapa justo lo que se ha venido a ver.
Los controles se desvanecen cuando el cursor no está encima y vuelven al entrar.

Tres salvaguardas, ninguna opcional:

- **`@media (hover: hover)`**. En una pantalla táctil no existe "pasar el cursor
  por encima": los controles se esconderían y no habría forma de recuperarlos.
- **`:focus-within`**. Quien navega con teclado tabula hasta el botón de play sin
  tocar el ratón; sin esto tendría el foco en un control invisible, que es peor
  que no tenerlo.
- **No se tocan `visibility` ni `pointer-events`**, solo la opacidad. Con
  `pointer-events: none` se perdería el primer clic, que es precisamente el que
  el usuario quería dar.

Verificado en el banco de pruebas, no de memoria: los 3 tamaños superpuestos dan
opacidad 0 en reposo y los otros 7 se quedan intactos; al enfocar vuelven a 1 y
al soltar el foco bajan a 0; y `elementFromPoint` confirma que **los 8 controles
siguen siendo clicables con opacidad 0**, que es lo que hace cierto lo del primer
clic. La primera medición dio "el foco no los devuelve": era la transición de 180
ms, que aún no había terminado cuando medí.

#### …y también sin vídeo: los mandos se apagan a los tres segundos

Petición de uso: *"los botónes se deberían ocultar automáticamente, lo mismo con
esta otra vista"*. Lo anterior sólo actuaba en modo superpuesto y sólo dependía
del cursor; esto vale en **todas** las vistas y depende del tiempo.

Cuatro respuestas suyas fijaron el comportamiento, y las cuatro apuntan a la misma
idea:

- **Siempre**, no sólo mientras suena la música. Preguntado explícitamente.
- **La barra de progreso también** — *"la barra también, o sea se pone tenue y se
  oculta"*. Es lo que más sitio ocupa; dejarla puesta habría dejado la mitad del
  trabajo hecha.
- **Tres segundos.**
- **Ratón y teclado**, las dos cosas: *"sería absurdo que subieras el volumen y no
  vieras moverse el control"*.

Esa última frase es la que decide el detalle que costaría más encontrar a mano:
**los oyentes van en fase de CAPTURA**.

```js
doc.addEventListener(SENALES_DE_VIDA[i], despertarMandos, true);
```

Los atajos de teclado de esta ventana llaman a `preventDefault` y
`stopPropagation` — tienen que hacerlo, media docena de teclas ya tenían dueño.
Un oyente registrado en la fase de burbuja **nunca se enteraría** de esas
pulsaciones, así que manejar la ventana sólo con el teclado la habría ido
apagando mientras se usaba: exactamente el absurdo que él describió. Hay una
prueba que corta el evento en el primer elemento que lo toca y exige que la
ventana despierte igual.

El panel de letra queda **fuera** del desvanecido a propósito: quien lo abre lo
ha abierto para leerlo, y estar leyendo no es estar quieto. `:focus-within`
también rescata todo el grupo, por la misma razón que en el modo superpuesto.

### Letras: dos fuentes, ninguna petición de red

La regla no ha cambiado: **solo se lee lo que ya está en la página**. No se
consulta ninguna API externa, no se hace scraping de terceros y no se almacena
el texto. Lo que sí ha cambiado es que en esa página puede haber **dos** paneles
de letras, y se miran en este orden:

1. **Better Lyrics**, si el usuario tiene esa extensión instalada.
2. El panel nativo de YouTube Music (LyricFind).

El orden no es un capricho. Better Lyrics **oculta** el panel nativo (le pone la
clase `blyrics-hidden`) y planta el suyo encima. Con el orden inverso pasaba
esto: la canción no tenía letra en LyricFind, `isLyricsTabDisabled()` cortaba en
seco y devolvíamos "no disponible"… mientras el usuario tenía la letra delante,
puesta por Better Lyrics. Y lo peor no era fallar, sino que estábamos
contestando sobre un panel que ya nadie ve.

#### El fixture inventado, y lo que costó

Este apartado estuvo mal escrito, y merece contarse porque el error fue de
método, no de código.

El fixture de Better Lyrics decía estar *"copiado de la fuente de Better Lyrics
(`injectLyrics.ts`)"*. **No lo estaba.** Estaba inventado a partir de lo que
parecía razonable. Y como el lector se escribió contra ese fixture, las pruebas
pasaban en verde mientras en la página real la letra salía así:

```
Walkingdownthestreettonight
I'vecometosharebadintentions
```

Dos suposiciones falsas, las dos plausibles:

- Que el texto vivía en un `.blyrics-line-main`. **Ese elemento no existe** en la
  versión publicada de Better Lyrics; es de una reescritura que todavía no han
  lanzado. El selector fallaba siempre y se caía a la rama de reserva.
- Que entre los `<span>` de cada palabra había espacio. **Nunca lo hay**: Better
  Lyrics descarta los trozos en blanco al construir el DOM y pinta el hueco con
  CSS (`margin-right` sobre los que llevan `blyrics--has-trailing-space`). Los
  espacios no se perdían por el camino — no existían, y `textContent` no podía
  inventarlos.

Lo grave es que el fixture inventado llevaba saltos de línea entre los `<span>`.
El HTML los convierte en nodos de texto en blanco, así que `textContent`
devolvía las palabras separadas. **El fixture no sólo no cazaba el defecto: lo
tapaba**, y encima generó un "arreglo" (colapsar espacios) para un problema que
sólo existía en él. Un fixture inventado es peor que no tener fixture, porque da
confianza en lugar de quitarla.

Ahora está contrastado contra el código real del repositorio
`better-lyrics/better-lyrics`, y hay **dos** fixtures: el de la versión publicada
y el de la reescritura sin publicar, que llegará sola a los navegadores sin que
nosotros toquemos nada. El lector distingue las dos y da el mismo resultado.

De paso salió un tercer defecto que nadie había notado: los coros de fondo se
colaban en la letra. Se filtraba `.blyrics-background-line`, que es el nombre de
la versión **no publicada**; en la instalada se llama `.blyrics-background-lyric`
y no lo quitaba nadie.

Lo que sí sigue siendo cierto: no se lee el `textContent` de la línea entera,
porque cada línea lleva colgadas la traducción, la romanización y los coros, y
concatenarlas da un renglón ilegible. Es la misma trampa del `.footer` con
"Fuente: LyricFind", con otro disfraz.

Un detalle contraintuitivo: el espacio se pone **sólo** donde Better Lyrics dice
que lo hay, nunca entre todas las palabras. Separarlas todas es la solución
ingenua y rompe con las palabras largas, que la extensión trocea en varios
`<span>` para poder cortar de línea: "intentions" saldría como "inten tions".

Si Better Lyrics marca `data-no-lyrics="true"` (tampoco la ha encontrado ella),
se cede el turno a la ruta nativa en vez de pisarla. Mirar primero no significa
ganar siempre: significa ganar cuando se tiene algo que ofrecer.

La atribución se conserva: la fuente se muestra como `LRCLIB (Better Lyrics)`,
con el proveedor real que Better Lyrics declara en su pie.

#### La letra deja de ser un bloque: sincronizada e interactiva

Petición directa de uso real: *"si la canción no tiene vídeo, que aparezca la
carátula y la letra recorriendo; y la letra sería mejor interactiva y no
estática"*.

La materia prima ya estaba en la página: cada línea de Better Lyrics lleva un
`data-time` con el segundo en que empieza a cantarse (es lo que la propia
extensión usa para su animación). El lector ahora entrega la letra **partida en
líneas, cada una con su tiempo**, además del texto plano de siempre — que sigue
existiendo porque es la firma con la que se detecta que la letra cambió y el
formato que entienden el popup y la ventana de respaldo.

Con tiempos, la ventana flotante hace tres cosas:

- **Resalta la línea que suena** y desplaza la lista hasta ella. La decisión de
  *cuál* suena es una función pura (`activeLyricAt`), probada como `timelineFor`:
  la de mayor tiempo de inicio que ya haya empezado, sin asumir que las líneas
  vengan ordenadas. La trampa que vigila su prueba más importante: `null <= 30`
  es `true` en JavaScript, así que sin filtrar los `time` null una letra sin
  tiempos entera "empezaría" en el segundo 0.
- **Saltar con un clic** (o Enter/espacio: cada línea con tiempo es un botón
  para el teclado) a ese momento de la canción.
- **Modo karaoke sin vídeo**: si la canción no tiene vídeo y hay letra, el panel
  se abre solo — sin redimensionar la ventana, porque agrandar la ventana que el
  usuario dejó pequeña es decidir por él. Si el panel no cabe (ventana
  compacta), lo que aparece es **la línea que se está cantando bajo el título**,
  y un clic sobre ella despliega la letra completa.

Esa línea bajo el título nació como un subtítulo: 12px, cursiva, un solo renglón
con puntos suspensivos. El uso real la puso en su sitio — *"Sin ti ya no podre
escu…"* — la mitad de cada verso se perdía. Ahora es la protagonista de la
ventana pequeña: más grande y en negrita que el artista, con **dos renglones**
antes de recortar (un verso casi nunca necesita más), y el título y el artista
se comprimen para dejarle sitio, que fue justo lo que sugirió el usuario
(*"puede ser subiendo el titulo y el artista"*). La compresión sólo ocurre
cuando la línea está de verdad a la vista (modo karaoke con el panel oculto por
tamaño): en una ventana grande con panel propio, el título no cede nada.

##### Lo que viene después

Segunda petición sobre la misma línea: *"puede mostrar que viene después, más
pequeño y no en negrita pero que se sepa que sigue esa frase siguiente; si está
la ventana más grande que permita ver más letra"*. Debajo de la línea que suena
van hasta tres versos apagados, cada uno un poco más que el anterior, para que se
lean como una cola y no como cuatro frases del mismo rango.

Las dos decisiones que tiene esto:

- **Cuáles.** Las siguientes con texto, saltándose los separadores de estrofa —
  que en la letra vienen como líneas en blanco. De adelanto no dicen nada: la
  pregunta que responde esto es «qué frase viene», no «cuánto falta para la
  próxima estrofa». Un hueco donde se esperaba una frase parecería un fallo.
- **Cuántas.** Se preparan **tres siempre** en JavaScript y las recorta el CSS de
  densidad por altura: tres en ventana grande, dos en `tight`, una en `mini`.
  Podría haberse decidido en JS leyendo el alto, y sería la misma regla escrita
  en dos sitios — el error que este proyecto ya ha pagado cinco veces. El «cuántas
  caben» vive donde ya viven las reglas que esconden el álbum, los extras y las
  acciones. Por eso las pruebas cubren *cuáles* y no *cuántas*: comprobar el
  recorte desde JavaScript significaría escribir esos umbrales por segunda vez.

La línea que suena y su adelanto se esconden **siempre juntos**, desde una única
función (`ocultarLineaEnVivo`). Un adelanto suelto, sin la frase actual encima,
es letra sin contexto en mitad de la ventana; había tres sitios distintos
ocultando la línea y ahora los tres llaman a esa función. Los párrafos se
reconstruyen sólo cuando cambia el texto (se compara una firma): `updateNowLine`
corre varias veces por segundo y rehacerlos en cada pasada haría parpadear la
letra.

Tres renuncias deliberadas:

- La letra nativa (LyricFind) **no trae tiempos y no se inventan**: se pinta por
  líneas pero sin resaltar ni saltar. `time: null` significa "no sé cuándo
  empieza", nunca 0, que afirmaría "empieza al principio".
- El autodesplazamiento **se aparta 4 segundos** cuando el usuario hace scroll
  en el panel: está leyendo otra parte de la letra y arrancarle el scroll de las
  manos cada 300 ms dejaría el panel inusable. Saltar a una línea lo reactiva.
- Cerrar el panel a mano es una orden: el modo karaoke **no vuelve a abrirlo**
  en esa ventana.

El resalte va por temporizador propio de la ventana flotante (los timers de
`pipWindow` mueren con ella, no puede quedar un tick huérfano) leyendo
`currentTime` directamente del `<video>`, en vez de esperar al siguiente
mensaje de estado.

##### La cabecera que desaparecía: `scrollIntoView` desplaza de más

Dos síntomas reportados que parecían no tener nada que ver — *"al cambiar la
ventana de tamaño aparece el error visual en la parte inferior"* y *"se oculta la
opción de poner vídeo"* — eran el mismo fallo, y ninguno de los dos lo conseguí
reproducir en `tools/vista-previa.html`. A los tamaños exactos del pantallazo la
vista previa pintaba todo en su sitio. Así que en vez de arreglar a ciegas
escribí `tools/diagnostico-ventana.js`, que se pega en la consola de la pestaña y
alcanza la ventana flotante por `documentPictureInPicture.window`. La respuesta
fueron dos líneas:

```
body.scrollTop: 43.63
cabecera   y=-36..-10   → FUERA de la ventana
```

El documento entero estaba desplazado 43 px hacia arriba. La cabecera se salía
por arriba llevándose el botón de vídeo dentro (síntoma 2), y por abajo quedaba
el hueco que dejaba (síntoma 1). Un solo fallo con dos caras.

Lo provocaba el autodesplazamiento de la letra. `scrollIntoView` no desplaza el
contenedor con scroll: desplaza **todos los antepasados** hasta dejar el elemento
a la vista, y el `<body>` es uno de ellos. Y aquí está lo que no es evidente y
por eso el CSS parecía correcto: `html, body { overflow: hidden }` **ya estaba
puesto** y no protege de nada. `overflow: hidden` prohíbe el scroll del usuario,
no el programático; un contenedor así se sigue pudiendo desplazar desde
JavaScript. La vista previa no lo reproducía porque allí no corre el temporizador
de la letra: no era un fallo de maquetación, era la maquetación siendo movida.

El arreglo es dejar de pedirle al navegador que centre y calcularlo: se desplaza
el panel y nada más. La cuenta está aparte (`centrarEnElPanel`), es pura y se
mide con rectángulos y no con `offsetTop`, que se mide contra el antepasado
*posicionado* — el día que alguien le ponga `position: relative` a un contenedor
intermedio, la letra se iría a otro sitio sin que nada más cambiara. Las pruebas
no comprueban que la línea quede centrada (eso necesita maquetación, y jsdom no
la tiene) sino **quién se desplaza**, que es exactamente lo que falló.

Honestidad sobre cobertura: lo automatizable sin una ventana PiP real es
`activeLyricAt`, la extracción de líneas con tiempo y la elección del adelanto
(probadas y verificadas por mutación). El temporizador, el autodesplazamiento y
el recorte del adelanto por altura están verificados leyendo el código, en la
vista previa y usándolo, no por pruebas.

##### "El Conectado sobre el PiP": qué cede cuando el texto no cabe

Reportado con un pantallazo de una ventana de 385×160 en modo karaoke: *"aparece
el conectado sobre el pip y los controles también"*. Esta vez la vista previa sí
lo reprodujo, y midiéndola salió el número que lo explica todo: el bloque de
texto pedía **69 px** de alto y el hueco que le quedaba era de **53**.

Los 16 px que sobraban no desaparecían: el cuerpo centra su contenido con
`align-items: center`, así que se repartían **a los dos lados**. Por arriba el
título subía hasta meterse debajo del "Conectado" de la cabecera; por abajo el
adelanto se plantaba encima de la barra de progreso. Dos quejas, un solo
desbordamiento partido por la mitad.

La tentación era restar píxeles hasta que cuadrara. No lo hice porque un
presupuesto ajustado a mano se rompe con la primera línea larga, con la primera
canción de título kilométrico o con el primer idioma que ocupe más. Un número
exacto no es una regla: es una coincidencia con fecha de caducidad. Lo que había
que decidir era **qué cede**, y de eso este archivo ya tenía doctrina escrita
(primero el álbum, luego los extras, luego las acciones de texto). Faltaba
continuarla dentro del bloque de la letra:

- el bloque se **estira** al hueco (`align-self: stretch`) en vez de crecer fuera
  de él, y lo que no quepa se recorta **dentro**, nunca sobre el vecino;
- el **adelanto** es lo único que se encoge (`min-height: 0`), que es justo lo más
  subordinado que hay en pantalla: ya está apagado, sin negrita y en gris;
- título, artista y línea actual llevan `flex-shrink: 0`.

Ese último punto lo añadí después de medir, no antes, y es el error que estuve a
punto de dejar pasar. Con sólo las dos primeras reglas, flex reparte el
encogimiento entre **todos** los hijos: a 385×130 el título quedaba en 8 px de
alto con las letras cortadas por la mitad. Ceden porque llevan `overflow: hidden`
para los puntos suspensivos, y ese `overflow` anula el mínimo automático de flex
sin que se note absolutamente nada hasta el día en que falta sitio.

El centrado lleva `justify-content: safe center`: centra mientras cabe y se pega
al principio en cuanto no cabe. Sin el `safe`, el propio centrado empuja el
título por encima del borde superior y lo recorta por arriba, que es volver al
mismo síntoma por otro camino.

Y lo que se pidió explícitamente —*"si los puedes poner más pequeños y
opacidad"*—: en `mini` la cabecera baja a botones de 22 px y el transporte a 24
(30 el de reproducir), y cabecera, estado y controles se quedan al **70 %** de
opacidad, volviendo al 100 % con el ratón encima o con `:focus-within`, que es lo
que evita dejar al teclado navegando a ciegas por unos botones a medio ver. Se
atenúan, no se esconden: en una ventana de bolsillo lo que se mira es la canción,
pero los mandos siguen ahí y siguen pulsándose. Con `prefers-reduced-motion` se
conserva la atenuación y se quita el fundido — es contraste, no movimiento.

Sin pruebas nuevas: aquí no hay una sola decisión en JavaScript, es CSS de punta
a punta, y la regla acordada es probar donde hay lógica y mirar el resto en
`tools/vista-previa.html`. Se comprobó midiendo cajas reales en seis tamaños; los
dos del caso reportado (385×160 y 385×130) quedan en la rejilla para que no haya
que volver a montarlos a mano.

Dónde está el suelo, dicho sin maquillaje: a 385×160 entran título, artista,
línea actual y una línea de adelanto, con 5 px de aire por arriba y por abajo. Por
debajo de unos 145 px de alto el adelanto ya vale 0 y la línea actual empieza a
recortarse **dentro de su caja**. Sigue siendo un recorte, no un solape: se pierde
texto, pero nada se pinta encima de nada.

### El contador y la barra nunca se contradicen

Reportado desde el uso real: al encadenar automáticamente la siguiente canción,
"el contador sigue ejecutándose y se suma el tiempo a la barra".

Nuestro código no tiene un solo temporizador ni una sola suma — los números salen
tal cual del `<video>`. Lo que sí tenía era esto: la barra se acotaba con
`Math.min(tiempo, duración)` y el contador de texto pintaba el tiempo **crudo**.
Las dos mitades de la misma información se calculaban por separado, así que en
cuanto el reproductor daba un tiempo mayor que la duración, los dígitos subían
mientras la barra estaba clavada en el tope.

Ahora los dos salen del mismo número (`timelineFor`, función pura y probada). Si
la duración es desconocida —`0`, `NaN` o `Infinity`, que es lo que devuelve un
`MediaSource` al que aún no le han fijado la duración— no se arrastra el tiempo
de la pista anterior: se muestra `0:00`. Preferimos decir "todavía no lo sé" a
mentir con seguridad.

Un tiempo *absurdo* (negativo, `NaN`, `Infinity`) también cae a 0. Escribí el
test esperando que `Infinity` se acotara a la duración y falló; repasándolo, el
código tenía razón y el test no: dejar la barra en el tope es afirmar que la
canción ha terminado, y eso no lo sabemos.

### El vídeo abandonado: por qué "siguiente canción" lo arreglaba

Lo anterior arreglaba lo que se *pintaba*, pero no explicaba lo que se estaba
*leyendo*. La captura que llegó después fue la prueba decisiva: la barra
flotante **llena del todo** mientras la página marcaba `0:16 / 3:29`.

Como el tiempo y la duración salen los dos del **mismo** elemento (ver
`MetadataReader.read`), una barra llena no puede significar "vamos retrasados".
Sólo puede significar que estábamos leyendo el último fotograma de la canción
anterior, congelado.

La causa: al encadenar, YouTube Music **se fabrica un `<video>` nuevo** y
abandona el anterior sin avisar. El nuestro seguía siendo el prestado a la
ventana flotante, y `getMediaElement()` lo daba por bueno comprobando
`borrowedMedia.isConnected`. Esa comprobación llevaba un comentario diciendo que
servía para descartar un vídeo destruido, y no servía para nada: el elemento
prestado vive en el documento de la ventana flotante, donde `isConnected` es
**siempre** `true`. No podía ser falsa mientras el préstamo estuviera vigente.
La prueba que la "cubría" pasaba porque usaba un `<video>` creado y nunca
insertado, una situación que no se da.

El elemento abandonado ya no emite `timeupdate`, y con él se paraba el bucle
entero. Eso explica el síntoma más raro del informe —*"si le doy siguiente
canción ahí se vuelve a reiniciar"*—: `handleCommand` fuerza un
`scheduleUpdate()` a mano, así que ese botón concreto era lo único que revivía
la ventana.

Dos arreglos:

- Lo que delata el préstamo caducado ya no es `isConnected`, sino que la página
  vuelva a tener un `<video>` propio: sólo puede ser uno nuevo, porque el suyo
  nos lo habíamos llevado.
- `attachMediaListeners()` se **muda** al elemento nuevo en vez de acumularse.
  Antes se suscribía con una flecha anónima creada dentro del bucle, lo que hace
  la suscripción irreversible: `removeEventListener` necesita la misma
  referencia y esa referencia se perdía. Cada cambio de canción dejaba otro
  juego de cinco suscripciones sobre un elemento muerto.

Esto se prueba en `tests/integration/encadenado.test.js`, con el content script
realmente en marcha: no llama a ninguna función directamente, sino que monta la
situación (vídeo viejo prestado y terminado, vídeo nuevo en la página) y observa
los mensajes que emite el bucle, que es justo lo que se rompía.

#### …y aun así seguía congelado: el cadáver ganaba el selector

Con todo lo anterior arreglado, el fallo **seguía apareciendo**. Detectar el
relevo no bastaba, y la razón es incómoda:

`syncVideoMode()` detectaba el vídeo nuevo y llamaba a `returnVideo()`, que
devuelve el prestado a su **posición original** — que está *antes* del nuevo en
el orden del documento. Nuestro propio selector (`ytmusic-player video`) se queda
con el primero que encuentra. Así que acto seguido `borrowVideo()` **volvía a
prestarse el cadáver** y la ventana quedaba exactamente igual de congelada. El
arreglo se deshacía a sí mismo en la misma pasada. Y de propina, la página
acumulaba un `<video>` huérfano por cada canción encadenada.

Ahora, cuando YouTube Music ya se ha fabricado otro, el prestado **se tira**
(`discardVideo()`) en vez de devolverse. Devolverlo sólo tiene sentido cuando
sigue siendo el suyo.

Al separar las dos salidas apareció una trampa que conviene dejar señalada:
`returnVideo` estaba registrado *directamente* como manejador de `pagehide`. Si
se le hubiera añadido un parámetro `descartar`, habría recibido el `Event` — que
siempre es *truthy* — y **una simple recarga de pestaña habría dejado a YouTube
Music sin reproductor**. Por eso son dos funciones con nombre y no un booleano, y
por eso el `addEventListener` lleva una flecha que la llama sin argumentos.

Honestidad sobre la cobertura: el hecho que obligaba a tirarlo estaba fijado en
una prueba propia — *"un `<video>` muerto reinsertado gana el selector"* — cuya
afirmación se ha **invertido** desde entonces (ver la siguiente sección). El
cableado de `discardVideo()` dentro de `syncVideoMode()` **no** tiene prueba
automática, porque necesitaría una ventana Document PiP real, que jsdom no
tiene. Esa parte está verificada leyendo el código, no ejecutándola.

Dos cosas que la verificación por mutación corrigió sobre la marcha:

- La prueba de "no se re-suscribe si el vídeo no ha cambiado" **no fallaba** al
  quitar la guarda. Contaba suscripciones vivas, y la baja y el alta se compensan
  en el mismo tick: medir el saldo no distingue "no se hizo nada" de "se deshizo
  y se rehizo". Ahora cuenta movimientos.
- Se había añadido un `scheduleUpdate()` al mudarse de elemento. Quitarlo no
  rompía ninguna prueba, así que se fue a mirar por qué: los dos únicos sitios
  que llaman a esa función ya lo hacen justo después. Era código que parecía
  prudente y no hacía nada; se quitó en vez de dejarlo.

#### Tercera aparición: el cadáver que YouTube Music deja en su propia página

El fallo volvió una tercera vez — *"se sigue presentando el problema de que se
junta el tiempo entre canciones, pensé que ya se habia arreglado"* — y la
captura traía el dato que faltaba: el **título ya era el de la canción nueva**
con la barra clavada casi llena, mientras la página marcaba `0:18 / 3:51`. El
título actualizado descarta que el bucle esté parado (eso era el fallo
anterior): el render corre, pero **lee el tiempo de otro elemento**.

Los dos arreglos anteriores compartían un supuesto: que el cadáver era *el
nuestro* — el vídeo que la ventana flotante tenía prestado. Por eso no cubrían
el modo carátula, donde no hay préstamo ninguno: el `<video>` nunca sale de la
página. Al encadenar pistas, YouTube Music a veces **abandona el elemento de la
canción anterior en su propio DOM**, delante del nuevo, y nuestro adaptador se
quedaba con el primero que encontrara el selector. `discardVideo()` no podía
ayudar: sólo tira cadáveres fabricados por nosotros, y éste es de YouTube Music.

El arreglo cambia la pregunta del adaptador: ya no "¿cuál es el primer `<video>`
de la página?" sino "¿**cuál de todos** está vivo?" (`elegirVideoVivo`). Se
recogen todos los candidatos —respetando la prioridad entre selectores, para que
el `video` a secas del final no cuele un elemento de otra parte de la página— y
se elige por este orden:

1. Uno que esté **reproduciendo** (ni pausado ni terminado) gana siempre.
2. Si no, uno que **no haya llegado al final**: pausado a mitad de canción es el
   usuario con la pausa puesta; parado al final (con medio segundo de margen,
   porque los reproductores casi nunca llegan al último milisegundo) es un resto
   de la pista anterior.
3. En empate, el **último en orden de documento**: YouTube Music añade los
   elementos nuevos después de abandonar los viejos.

Un vídeo recién creado sin metadatos (`duration` aún `NaN`) **no** cuenta como
terminado: está empezando, no acabando, y declararlo cadáver sería devolver al
muerto justo en el peor momento.

Esto invirtió la afirmación de una prueba existente: *"un `<video>` muerto
reinsertado gana el selector"* pasó a *"YA NO gana"*. `discardVideo()` se queda
de todas formas — evita acumular un `<video>` huérfano por canción encadenada, y
no obligar al adaptador a adivinar es una defensa más.

#### Cuarta aparición, y por fin la pregunta correcta: por qué la letra nunca se congeló

Tampoco bastó. Volvió, y esta vez también **con vídeo**. Dos capturas: la página
por `2:13 / 3:10` y por `0:11 / 5:00`, la barra flotante casi llena en las dos, y
—el dato que lo cambió todo— **la carátula de la ventana ya era la de la canción
nueva**. El render corre. La barra no.

Llegados a la cuarta vez, la pregunta útil dejó de ser "¿qué eslabón se rompió
esta vez?" y pasó a ser otra: **¿por qué la letra sincronizada nunca se congela?**
El propio usuario lo había dicho sin darle importancia: *"va sincronizado
perfecto"*. Misma ventana, mismo `<video>`, mismo instante — y una de las dos
cosas siempre funciona.

La respuesta estaba en el código, en la asimetría entre dos funciones a 100
líneas de distancia:

- El resalte de la letra lee `currentTime` **directamente del `<video>` cada
  300 ms**. Un eslabón.
- La barra se alimentaba **sólo de los mensajes del content script**. Cuatro
  eslabones: acertar con el `<video>` vivo → tener los listeners puestos en *ese*
  elemento → que el mensaje se envíe → que llegue.

Los tres arreglos anteriores fueron, cada uno, un parche a un eslabón distinto de
esa cadena de cuatro. Todos correctos, todos insuficientes por el mismo motivo:
mientras la barra dependa de que los cuatro aguanten, **siempre habrá una quinta
forma de romperla**.

Así que la barra ahora tiene el mismo latido que la letra: cada 300 ms lee el
`<video>` que suena y se repinta. Deja de importar cuál de los cuatro eslabones
falle — la barra se repara sola en 300 ms. El estado por mensajes sigue existiendo
para lo que sí necesita (título, carátula, "me gusta", letra), que no se puede
leer de un `<video>`.

Un solo temporizador para las dos cosas, y un solo sitio que pinta barra y
contador (`paintTimeline`), porque la invariante *"el contador y la barra nunca se
contradicen"* no sobrevive a dos copias del mismo cálculo — que es exactamente
como se rompió la primera vez.

De paso cayó una trampa con el mismo síntoma: `change` en un `<input type=range>`
**sólo se dispara si el valor cambia**. Un clic sobre el pulgar donde ya estaba
dejaba la bandera `seeking` en `true`, y con esa bandera colgada el render deja de
tocar la barra *y el contador* — barra congelada durante el resto de la canción,
por un camino completamente distinto. Ahora `pointerup` y `pointercancel` también
terminan el arrastre.

**Y esta vez hay pruebas.** Lo que permitió que el fallo volviera tres veces es
que nada dentro de la ventana flotante estaba probado: abrir una de verdad exige
`documentPictureInPicture`, que jsdom no tiene, así que cada arreglo se
"verificaba" leyéndolo. `tests/unit/pip-latido.test.js` monta los elementos sobre
un documento normal y ejercita el latido, incluida la reproducción exacta de la
captura: se le entrega a la ventana un estado con el final de la pista anterior,
se comprueba que la barra queda casi llena, y se exige que un solo tick la
devuelva a `0:11 / 5:00`.

La verificación por mutación encontró aquí un hueco que yo no había visto:
cambiar `getMediaElement()` por `getPageMediaElement()` en el latido **no rompía
ninguna prueba**, y era precisamente el caso del último reporte — en modo vídeo el
elemento vive en el documento de la ventana flotante y desde la página no se ve.
Esa prueba existe ahora porque la mutación sobrevivió, no porque se me ocurriera.

#### Quinta aparición: la que provoqué yo

Volvió. Y la captura descartaba de entrada todo lo anterior: la ventana marcaba
**`7:46 / 9:00`** y YouTube Music iba por **`0:35 / 3:40`**. Fijarse en la
**duración**, no en el tiempo. Una barra congelada conserva la duración de su
canción; que estuviera mal significa que el número no venía de una barra parada
sino de **otro `<video>`, leído en vivo**. El latido funcionaba. Le estaba
preguntando al elemento equivocado.

El culpable era una regla que había escrito yo en el tercer arreglo:

> si la página tiene un `<video>` distinto del prestado, el prestado ya no vale

Sonaba impecable —el nuestro nos lo llevamos a la ventana, luego cualquier otro
tiene que ser el nuevo— y le faltaba un caso: **el `<video>` que queda cuando el
usuario se salta una canción por la mitad**. Ése ni es el nuestro ni es el que
suena, y como no había llegado a su final, ninguna comprobación lo rechazaba.

El error de fondo es una asimetría que había puesto al revés. *"Terminado"* hay
que exigírselo **al nuestro para soltarlo**, no al de la página para descartarlo:
«el de la página no ha terminado, luego está vivo» da por bueno cualquier cadáver
que se quedó a la mitad. Ahora abandonar el préstamo exige una prueba de verdad —
que el candidato de la página esté **sonando**, o que nuestra pista haya
**terminado**.

Y había una segunda mitad, más cara, que explica el recuadro negro de la captura:
esa misma regla estaba escrita **dos veces**, una en el adaptador y otra dentro de
`syncVideoMode()`. La copia de `pip.js` no se limitaba a leer mal el tiempo:
llamaba a `discardVideo()`, que no devuelve el elemento sino que lo **borra**. Es
decir, tirábamos el `<video>` que estaba sonando para quedarnos con el cadáver, y
el cadáver no tenía fotogramas que enseñar. Hoy hay una sola regla
(`Adapter.getReplacementFor`) y `pip.js` la consulta en vez de reimplementarla.

La lección, que es la misma de la primera aparición con otro disfraz: **una regla
duplicada en dos archivos no es una regla, son dos** — y aquí la que leía y la que
borraba discrepaban. `tests/unit/pip-video.test.js` existe para eso: prueba la
mitad de `pip.js`, que hasta ahora no ejercitaba nadie. Al mutarla para devolverle
su copia privada de la regla, la única prueba que la mata es una de ese archivo
nuevo.

#### Sexta aparición: la respuesta estaba en el primer mensaje

Volvió otra vez, y esta vez el usuario no se limitó a reportarlo: lo **diagnosticó**.

> «Lo que yo entiendo es que se están sumando los tiempos, o sea el vídeo anterior
> duraba 3:36 y este nuevo vídeo dura 3:18 entonces la barra se va sumando.»

Tenía razón, y la captura lo demuestra con aritmética de una línea. La ventana
marcaba **`5:12 / 6:54`** mientras YouTube Music iba por **`1:35 / 3:18`**, y la
canción anterior duraba **`3:36`**:

```
3:36 + 3:18 = 6:54     la duración era la SUMA de las dos
5:12 - 1:35 = 3:37     el tiempo llevaba dentro la pista anterior
```

No era el `<video>` equivocado. **YouTube Music reutiliza el mismo `<video>` y le
va añadiendo las pistas a la misma línea de tiempo** — así consigue el encadenado
sin cortes. `currentTime` y `duration` son acumulados **de toda la cola**. Su
propia barra muestra 3:18 porque le resta el desplazamiento de lo ya sonado.

Es decir: los cinco arreglos anteriores discutieron **a cuál** de los `<video>`
preguntar. Ninguno comprobó si la pregunta tenía sentido. Y no tenerlo era
comprobable desde el primer día: bastaba sumar los dos números de una captura.

Lo que más incomoda de esta es que el usuario lo había dicho literalmente en su
primer mensaje —*«se junta el tiempo entre canciones»*— y yo lo leí como *«se
congela»* durante cinco iteraciones. Se juntaba. Ésa era la palabra exacta.

El arreglo es `src/content/track-timeline.js`, la única fuente de tiempo del
proyecto a partir de ahora:

- La **duración** de la pista sale siempre de la interfaz de YouTube Music
  (`aria-valuemax` del deslizador, y el texto `1:35 / 3:18` como respaldo), que es
  la única que la sabe.
- El **transcurrido** se calcula como `currentTime - desplazamiento`, no leyendo
  la página directamente: la página publica segundos enteros y la barra iría a
  saltos de un segundo.
- El **desplazamiento se guarda** y sólo se recalcula cuando cambia de verdad
  (cambio de pista o salto del usuario). Recalcularlo en cada lectura haría que el
  redondeo de la página lo moviese y el contador **temblaría hacia atrás**.
- Sirve en las dos direcciones: para saltar al minuto 2 de la canción hay que
  escribir `desplazamiento + 120` en el `<video>`, no 120. Y el acotado del salto
  es contra la **duración de la pista**, porque acotar contra la del `<video>`
  dejaba que un salto adelante cerca del final aterrizase en la canción siguiente.

Si Google se lleva por delante las dos fuentes de la página, se cae al `<video>` a
secas: incorrecto a partir de la segunda canción de la cola, exacto en una cola de
una sola, y en todo caso mejor que un `0:00` congelado.

**Los selectores, esta vez, sí están verificados.** Todo esto depende de leer
`#progress-bar` y `.time-info` de la página, y en la primera versión eran
conjeturas mías validadas sólo contra un fixture que también había escrito yo — es
decir, exactamente el error que costó los cinco intentos anteriores. Si los dos
fallan, `getPageTrackTime()` devuelve `null` y la extensión se cae **en silencio**
a los números acumulados. Así que antes de dar nada por bueno se ejecutó
`tools/diagnostico-tiempo.js` (se pega en la consola de DevTools con música
sonando) sobre `music.youtube.com` real:

```
progressBar  #progress-bar            -> aria-valuenow=133  aria-valuemax=520
timeInfo     .time-info               -> "\n    2:13 / 8:40\n  "
```

Existen, y las dos fuentes coinciden entre sí (`133 s` = `2:13`, `520 s` = `8:40`).
De paso salió algo que mi fixture no contemplaba: el texto real viene **envuelto
en saltos de línea y sangría**, no como el `1:35 / 3:18` limpio que yo había
supuesto. Se parseaba bien por el `trim()` de `aSegundos`, pero era casualidad, no
diseño, así que hay una prueba con la cadena literal que devolvió la página.

Y hay un detalle de la verificación por mutación que merece decirse porque
contradice lo que yo esperaba: al mutar el cálculo para leer el `<video>` a pelo
—**el fallo original, literalmente**— la prueba del caso reportado **no** falla. La
mata sólo la de suavidad. El motivo es que el `read()` tiene una red de seguridad
(«si el cálculo se sale de la pista, manda la página») que absorbe la mutación y
devuelve el número correcto, sólo que a saltos. Es tranquilizador para producción
y engañoso para las pruebas: sin el test de suavidad, esa regresión pasaría
desapercibida.

### Vídeo: se toma prestado, no se copia

Cuando la pista trae imagen, la ventana flotante **mueve** el `<video>` de YouTube
Music a su propio documento (es el patrón previsto por Document PiP: `appendChild`
entre documentos adopta el nodo y la reproducción continúa). No se duplica el
stream ni se abre una segunda conexión.

Eso obliga a dos cosas. La primera: al cerrar hay que devolver el elemento a su
sitio exacto, con su `style` original, o YouTube Music se queda sin reproductor.
La segunda: en cuanto el `<video>` sale de la página, `document.querySelector` deja
de encontrarlo, y **todo** pasa por `getMediaElement()` (play, pausa, tiempo,
volumen). Por eso el adaptador guarda la referencia prestada y la prioriza mientras
siga siendo la buena. Para saber si lo sigue siendo se mira si la página ha vuelto
a tener un `<video>` propio (ver más arriba: `isConnected` no vale para esto y
durante un tiempo creímos que sí).

Detalle que no es obvio: en modo "canción" YouTube Music reproduce **solo audio**,
pero el `<video>` existe igualmente con tamaño 0x0. Si bastara con que el elemento
existiera, la ventana mostraría un rectángulo negro en todas las canciones; por eso
la detección mira `videoWidth`/`videoHeight` y no la mera presencia del elemento.

#### Alternar entre vídeo y carátula

Petición de uso: poder ver la portada aunque la canción traiga vídeo. El botón
🖼 / 🎬 de la cabecera hace exactamente eso, y las cuatro decisiones que lo
rodean merecen explicación porque ninguna es la obvia.

**Por qué en la cabecera y no en la fila de extras.** La fila de extras
(`.ytmpip-extras`, donde viven ♡, volumen, aleatorio y repetir) es
`display: none` en compacto, ajustado y mini — que son justo los tamaños en los
que se ve vídeo. Un botón para alternar vídeo que desaparece cuando hay vídeo
no sirve de nada. La cabecera sobrevive en todas las densidades, incluida la
superpuesta, donde se desvanece junto con el resto de los controles y vuelve al
mover el ratón. Nace `hidden`: sin vídeo no hay nada que alternar, y un botón
que se pulsa y no hace nada parece una ventana rota.

**Por qué no se guarda en preferencias.** Existe ya un ajuste `videoPreference`
en el almacenamiento, y la tentación era escribir ahí. Sería responder una
pregunta con otra: `videoPreference` significa «quiero vídeo en general», y
pisarla desde este botón convertiría el capricho de una canción en un ajuste
permanente que el usuario no recordaría haber tocado. La elección vive en una
variable de la ventana y dura lo que dure la ventana. En sentido contrario, sí
manda: si el ajuste dice «sin vídeo», el botón ni se ofrece — si no, habría dos
sitios distintos decidiendo lo mismo, que es la forma exacta en que este
proyecto se ha roto antes.

**Por qué aguanta el cambio de canción.** Si la elección se reiniciara con cada
pista, la siguiente canción con vídeo se lo plantaría otra vez en la cara y
habría que volver a pulsar. Mismo criterio que `lyricsClosedByUser`.

**`returnVideo()` y no `discardVideo()`.** No es un matiz de nombres:
`discardVideo()` llama a `remove()`, y la especificación dice que sacar un
elemento multimedia de su documento lo **pausa**. Si alternar a carátula tirase
el `<video>`, pedir la portada pararía la música. Hay una prueba dedicada a eso
(`el video se DEVUELVE a YouTube Music, no se tira`) porque el fallo sería
silencioso: la portada aparecería, que es lo que se pidió, y el usuario tardaría
un segundo en darse cuenta de que se ha quedado sin sonido.

Y una nota sobre cómo está escrito, porque es la lección de la quinta aparición
del error del tiempo aplicada a propósito. El botón **no calcula** si hay que
enseñarse: `syncVideoMode()` ya resuelve «¿hay vídeo?» y «¿lo permite el
ajuste?» para decidir el préstamo, y el botón se pinta con esa misma respuesta.
Al escribir el banco de pruebas caí en la trampa una vez más: puse un
`pulsarAlternarVideo()` que repetía el cuerpo del manejador del clic. Eso es
literalmente lo que causó el recuadro negro de la quinta aparición — una regla
en dos sitios no es una regla, son dos. Está extraído en `alternarEscenario()`,
y tanto el `addEventListener` como el banco apuntan a esa única función.

Del tamaño del emoji no supuse nada: en la vista previa se veía a 11px como una
mancha junto a los glifos geométricos `⤢` y `✕`, así que sube a 14px. El estado
pulsado se marca solo con fondo, sin `color`, porque un emoji a color se pinta
con su propia paleta y la regla de color no llegaba a verse; el peso de la señal
lo lleva el propio emoji, que pasa de cuadro a claqueta.

#### El mismo botón, segundo papel: la letra a pantalla completa

Petición de uso: *"si el usuario solo elije ver la letra sin cover de la canción
utiliza el cover como de fondo de pantalla borroso y la letra sobre el cover"*.

No hace falta un botón nuevo. El de la cabecera ya responde a una pregunta —
**qué ocupa el escenario** — y en una canción sin vídeo esa pregunta tiene otras
dos respuestas posibles: la portada o la letra. Así que el botón cambia de papel
según lo que ofrezca la canción (🖼/🎬 con videoclip, 🎤/🖼 sin él) en vez de
añadir un cuarto icono a una cabecera que en `narrow` ya va justa. La portada no
se pierde: pasa a ser el fondo difuminado que **ya se pintaba con esa misma
imagen**, así que no hay ninguna descarga nueva; sólo sube de opacidad, porque
deja de competir con la miniatura.

Lo interesante es cómo está repartida la decisión, y es otra vez la lección de
siempre:

- `syncVideoMode()` sigue siendo la **única** dueña de la regla del vídeo, pero
  ya no pinta el botón: **devuelve** su respuesta.
- `render()` es dueño de la del karaoke.
- `pintarBotonDeEscenario()` recibe las dos respuestas ya calculadas, decide el
  papel y lo anota.
- El manejador del clic **lee** ese papel; no lo vuelve a deducir. Si lo
  dedujera, el caso «hay videoclip pero el usuario está viendo la portada» lo
  rompería: ahí la ventana está en modo karaoke y el botón sigue siendo el del
  vídeo. Hay una prueba dedicada a eso.
- Y los dos papeles guardan la elección en **variables distintas**. Un solo flag
  sería más corto y estaría mal: quien pidió portada en un videoclip no ha dicho
  nada sobre qué quiere ver en la siguiente canción, que a lo mejor ni trae
  vídeo.

Pedir la letra en grande implica el panel abierto — sin él, quitar la portada
dejaría la ventana vacía — y esa apertura pasa por encima del «lo cerré yo», que
es una orden anterior y menos específica. Aquí la verificación por mutación se
ganó el sueldo: la regla estaba escrita **dos veces**, en `render()` y en el
manejador del clic, y romper la del manejador no hacía fallar ninguna prueba
porque la otra copia tapaba el agujero. Se quedó una sola, en `render()`.

En CSS el modo es una clase (`.ytmpip-lyrics-stage`) con cuatro reglas: se oculta
el escenario, sube el fondo, el cuerpo deja de ser elástico y el panel se queda
con todo el hueco sin la línea que lo separaba del reproductor (ya no separa
nada: es el contenido principal). Van al final del archivo a propósito, porque
empatan en peso de selector con las reglas de densidad que esconden el panel en
`mini` y en `compact` y tienen que ganarlas: si el usuario ha pedido la letra, el
tamaño de la ventana ya no decide por él. Comprobado en la vista previa a
380×480 y a 425×268 (`?letra=1&escenario=1`): el panel se ve en los dos y no
sobra un solo píxel por abajo.

#### Y la letra acabó llevándose la ventana entera

Petición de uso, después de usarlo un rato: *"para esta opción quiero que
tambien se proveche la visual, por que la barra cubre la letra entonces coloca
el menu de la aplicación (botones de play etc) sobre el contendio igual que lo
hacemos como video y la barra de sonido en la parte inferior"*.

Lo importante está en cuatro palabras: **«la barra cubre la letra»**. No es una
queja de estilo ni una metáfora — este proyecto ya pagó cinco arreglos fallidos
por leer los reportes del usuario como metáforas. Es literal: la fila de
transporte se colocaba *encima* de las líneas, y lo que se tapaba era justo lo
que se había venido a leer.

**No hay modo nuevo.** `layoutFor` ya sabía hacer exactamente esto: es el modo
superpuesto que se inventó para el vídeo en ventana pequeña, donde la ventana
*es* el contenido y los mandos flotan encima desvaneciéndose. La letra a
pantalla completa es el mismo caso con otro contenido, así que lo único que
cambia es que ahora hay **dos** motivos para pedir el mismo modo:

```js
const overlay = Boolean(letraEnGrande) || (mini && hasVideo);
```

Y ahí hay una decisión que casi tomo mal. Mi primer impulso fue meterle un
umbral de alto, como el que ya lleva `mini`: superponer sólo en ventanas
pequeñas, donde «no cabe». Está mal porque el problema **no era la falta de
sitio**. En una ventana grande la fila de mandos tapa exactamente igual —y esas
son precisamente las ventanas en las que uno se pone a leer la letra. Un umbral
habría arreglado el caso menos molesto y dejado intacto el que se reportó.

El argumento entra en `layoutFor` en vez de que la función mire el DOM por su
cuenta, y en `render()` la clase `.ytmpip-lyrics-stage` se pone **antes** de
llamar a `applyDensity()`, porque es de ahí de donde `applyDensity` lee la
respuesta. Al revés se leería el render anterior y el modo llegaría siempre con
una canción de retraso.

En CSS los mandos flotan y las líneas se apartan de ellos con dos huecos con
nombre (`--ytmpip-mandos-arriba: 86px`, `--ytmpip-mandos-abajo: 148px`) en vez
de dos números sueltos repartidos por el archivo. El espectro se va abajo del
todo, que es la otra mitad de lo que se pidió («la barra de sonido en la parte
inferior»).

**Lo que rompí sin enterarme, y cómo apareció.** La atribución de la licencia
(«Fuente: LyricFind») no está flotando: viaja al final de `.ytmpip-lyrics-lines`,
detrás del aire de centrado que ese contenedor lleva como `padding-bottom: 40%`.
Y el relleno en porcentaje se resuelve **siempre contra el ancho**, nunca contra
el alto — así que en una ventana apaisada ese «40 %» es mucho más de lo que
parece. Resultado medido, no supuesto: en 380×480 la atribución caía en
y=341..354 con la barra de progreso empezando en 350, o sea partida por la
mitad; y en la ventana mini se iba a y=335 dentro de una ventana de 268 px, es
decir, **fuera de la ventana**.

La tentación era ponerle un `bottom: 160px` y seguir. Eso habría sido un cuarto
número suelto que hay que acordarse de mover cada vez que cambien los mandos —
una regla en dos sitios, otra vez. Va anclada a la **misma** variable que la
banda de mandos:

```css
bottom: calc(var(--ytmpip-mandos-abajo) - var(--ytmpip-atribucion));
```

`--ytmpip-atribucion` no es un número nuevo: el hueco de abajo ya la incluía sin
saberlo (los mandos de verdad ocupan 130 px de los 148, y 78 de los 96 en mini),
así que la variable sólo le pone nombre al sobrante y lo hace utilizable.
Vuelto a medir: 335..348 contra la barra en 350, y 175..188 contra 190.

Y una nota sobre cómo se verificó, porque no fue mirando una captura. Se
barrieron los **29 casos** de la vista previa preguntándole al DOM por la
geometría de cada pieza: 29/29 cargan, nada se sale de ninguna ventana, y los 15
solapes que salieron marcados son los del modo superpuesto, que son a propósito.
Un JPEG no habría cazado la atribución partida por la mitad; un `getBoundingClientRect`
sí. (Además el `preview_screenshot` se caía por tiempo una y otra vez, así que
tampoco había JPEG que mirar — pero medir era la opción más estricta de todos
modos.)

**Un superviviente de mutación más, y este no se puede matar desde aquí.** Si se
le quita a `applyDensity` la lectura de la clase de la letra, no falla ninguna
prueba. No es que falte la prueba: `applyDensity` mide la ventana **viva**
(`innerWidth`/`innerHeight` de la ventana flotante de verdad), y jsdom no tiene
ninguna que medir. Lo que sí está probado, y con dos mutaciones, es la decisión
—`layoutFor`, que es pura— y que las tres maquetaciones sean excluyentes. Lo que
queda sin cubrir es el cable entre la clase y la llamada, y ése se comprueba en
la vista previa, que sí tiene ventanas de verdad. Queda anotado en vez de
disimulado.

#### Sólo carátula: el botón «Aa»

Petición de uso: *"que sea uno de solo ver carátula sin nombre ni artista"*.

Aquí sí propuse ahorrarme el botón: activarlo con un clic sobre la portada, para
no meter un cuarto icono en una cabecera que en `narrow` ya iba justa. El usuario
lo descartó — *"usemos un botón pues ya tenemos los otros botones"* — y tenía
razón por un motivo que yo no había pesado bien: un gesto oculto no se descubre,
y la cabecera **no iba tan justa como yo suponía**. Lo medí después, que es lo
que debí hacer antes de recomendar nada: cinco botones de 26 px caben en una
ventana de 260 px de ancho sin que `.ytmpip-header-actions` desborde un solo
píxel, porque quien cede primero es el «Conectado», que en `narrow` ya se
encogía a cero. La suposición me habría costado una función escondida.

La decisión va en su **propia** variable (`soloCaratula`), no compartida con las
otras dos que ya vivían en la cabecera. Es la misma razón de siempre: «qué ocupa
el escenario» y «se ve el texto» son preguntas distintas, y hay una prueba que
comprueba que una pulsación no mueve las dos.

En CSS son dos reglas y ninguna toca la altura de nada:

```css
#ytmpip-root.ytmpip-sin-texto .ytmpip-info  { display: none; }
#ytmpip-root.ytmpip-sin-texto .ytmpip-stage { flex: 1 1 auto; max-height: none; aspect-ratio: auto; }
```

La segunda va **al final del archivo**, por lo mismo que el bloque de la letra en
grande: empata en peso de selector con `#ytmpip-root.compact .ytmpip-stage`, que
clava la portada en 96 px cuadrados, y sin ganarle por orden de documento el modo
no haría nada visible en ventana pequeña. Casi lo escribo a mitad de archivo;
medirlo en la vista previa fue lo que lo destapó. Comprobado a 340×360 y a
340×200 (`?limpio=1`): el escenario pasa de 320×152 a 320×197 en el primero y de
96×96 a 324×109 en el segundo.

Una cosa que decidí **no** hacer: una excepción para que con la letra en grande
se conservara el título. El botón promete quitar el título y el artista; hacerlo
a veces sí y a veces no obliga a explicar cuándo, y nadie ha pedido esa
combinación.

#### Los emoji se van: cada botón pasa a llevar su dibujo

Petición de uso: *"podemos cambiar los iconos usados por ejemplo de adelantar 10
segundos etc, que se vea más profesional y limpio"*.

El proyecto ya sabía que los emoji no daban la talla, pero lo sabía **de tres en
tres**. El botón de arriba dice «Aa» y no un emoji porque —está escrito en
`pip.html`— *"a 10 px un emoji a color queda en una mancha"*; lo mismo valía para
`⤢` y `✕`. Eran tres excepciones a una regla que nadie había escrito. Esto es la
regla.

Tres cosas de los emoji que no se arreglan eligiendo otro emoji:

- **Los pinta el sistema, no nosotros.** El mismo `⏪` es gris y plano en Windows,
  azul y con volumen en Android y otra cosa en Linux. La ventana se veía distinta
  en cada máquina y no había forma de igualarla.
- **Vienen a color, y el color es suyo.** `color: var(--ytmpip-accent)` no tiñe un
  emoji. Esto no era teórico: `#ytmpip-video-toggle[aria-pressed="true"]` llevaba
  el comentario *"solo fondo, sin `color`: el glifo es un emoji a color […] así
  que la regla de color no llegaba a verse"*. Y «me gusta» encendido y apagado se
  distinguían **cambiando de dibujo** (`♡` por `♥`) en vez de por el color, como
  todo lo demás de la interfaz.
- **No son del mismo juego.** `⏪` y `🔀` los dibujó gente distinta con criterios
  distintos: pesan distinto, ocupan distinto y no se alinean.

**Cómo entran sin rehacer la maquetación**, que era la parte con riesgo. El tamaño
de los botones está repartido por una docena de reglas de `font-size` en
`pip.css`, una por densidad (`mini`, `tight`, `overlay`…). Reescribirlas todas
para dar anchos en píxeles habría sido rehacer el sistema de densidades entero.
En vez de eso los dibujos se miden en `em`:

```css
.ytmpip-ico { width: 1.25em; height: 1.25em; fill: currentColor; }
```

Así el `font-size` que ya estaba sigue mandando y **no se tocó ni una** de esas
reglas. El `1.25` es lo único que da tamaño y está en un solo sitio: un emoji
ocupa casi toda su caja y un SVG de 24×24 gasta unas dos unidades de margen por
lado, así que a `1em` todos los botones habrían encogido de golpe.

Y `fill: currentColor` arregla de paso lo de arriba: `:hover` y
`[aria-pressed="true"]` **por fin se ven**, después de llevar ahí desde el
principio sin hacer nada. Dos reglas que existían dejaron de ser decorativas, y
el botón de vídeo perdió las dos excepciones de `font-size` que sólo estaban para
compensar que su emoji quedaba en una mancha.

Dos decisiones que conviene dejar escritas:

- **El emoji se queda en el HTML**, detrás de cada `data-ico`. No es un resto: es
  lo que se ve si `iconos.js` no llega a cargar. Para que eso no fuera una
  promesa falsa, `pip.js` resuelve el módulo contra un doble inerte que avisa por
  consola — sin esa red, la primera llamada reventaría `cacheElements` y no
  habría ventana en la que ver el emoji. Un dibujo es decoración y no debe
  impedir que la ventana abra.
- **Los segundos no van dentro del icono.** El icono clásico de saltar lleva el
  número escrito en el arco. Aquí no: estos botones bajan a 24 px en `mini` y la
  cifra saldría a unos cinco píxeles. Un número que no se puede leer es peor que
  ninguno. Siguen en el `aria-label` y el `title`, que además son los de verdad —
  los reescribe `applySettings` cuando se cambia la preferencia, cosa que un «10»
  pintado dentro no podría hacer.

La lista de qué botón lleva qué dibujo vive en los `data-ico` del HTML y no en
`iconos.js`: el HTML es quien sabe qué botones hay, el módulo sólo sabe dibujar.
Añadir un botón con su icono es añadir un atributo.

**Una prueba que había dejado de mirar nada.** `pip-repetir.test.js` comprobaba
que repetir-una y repetir-lista se distinguen comparando el `textContent` del
botón. Con un `<svg>` dentro, ese valor es `""` para los dos: el assert habría
seguido pasando —`"" === ""`— sin volver a comprobar nada nunca. Ahora compara
`data-ico`, que es el nombre del dibujo que el módulo deja escrito al pintarlo.

El menú de la barra (`popup.html`) usa los mismos tres dibujos y del mismo
módulo. No es simetría por gusto: el menú y la ventana se abren desde el mismo
sitio y se ven casi seguidos, así que dejar emoji ahí habría devuelto justo el
problema —dos juegos distintos para el mismo botón.

#### Velocidad de reproducción, y un botón que no puede mentir

Un botón más en la fila de extras que recorre **1× → 1,25× → 1,5× → 0,75×** y
vuelve a empezar. Es `video.playbackRate`, una propiedad normal: no toca el grafo
de audio, no cruza ninguna puerta de un solo sentido y no puede dejar la música
muda. Se pide `preservesPitch` explícitamente aunque hoy sea el valor por defecto
en Chrome —sin corrección de tono, 1,25× no suena «un poco más rápido», suena
medio tono más arriba, y ése es un fallo que sólo se detecta escuchando.

**Es el único botón de la fila que lleva texto y no dibujo**, por la misma razón
que «Aa»: hay que enseñar un número y no existe un icono que diga «1,25×». Lleva
ancho automático y `tabular-nums` para que la fila no dé un salto cada vez que se
pulsa.

**La decisión que sostiene todo lo demás: el botón enseña lo que dice el
`<video>`, no lo último que se pidió.** Por especificación, `playbackRate` vuelve
a su valor por defecto cada vez que el elemento hace `load()`, y YouTube Music
recarga la pista por su cuenta sin avisar. Un botón que recordase el 1,5× que
mandó seguiría enseñándolo con la música ya a velocidad normal, y un mando que no
coincide con lo que se oye es peor que no tener mando. Por eso el ciclo tampoco
lleva un índice propio: busca la velocidad actual en la lista cada vez, así que
siempre avanza desde donde está la música de verdad.

Lo que **no** se ha hecho: reaplicar la velocidad al empezar cada canción. Sería
fácil e inventaría una política —«la velocidad es pegajosa»— que nadie ha pedido.
Antes hay que saber si YouTube Music la resetea de verdad, y eso no se responde
leyendo la especificación: `tools/diagnostico-velocidad.js`.

##### Dos listas que parecen la misma

`PLAYBACK_RATES` es lo que **ofrece** el botón; `PLAYBACK_RATE_LIMITS` es lo que
**acepta** el reproductor. Están separadas porque contestan preguntas distintas,
pero no son independientes: ofrecer algo que el controlador va a acotar sería un
botón que enseña 3× y suena a 2×. Una prueba las cose. Y el **orden de la lista
es el ciclo**, no una ordenación: empieza en 1 y vuelve a 1, de modo que quien no
reconozca la velocidad actual aterrice en la normal y no en la lenta.

##### La prueba que afirmaba proteger algo que no protegía

La mutación encontró tres huecos, y el tercero era el interesante. Había escrito
un test que comprobaba que las velocidades sobrevivían a
`JSON.parse(JSON.stringify(...))`, con un comentario muy convincente sobre el
viaje por `chrome.runtime.sendMessage`. **JSON transporta cualquier `double` sin
perder un bit**, incluido `0,1 + 0,2`: aquel test pasaba siempre, con cualquier
lista, y no protegía nada. Lo destapó una mutación que metía un decimal inexacto
y sobrevivió tan tranquila.

El peligro real no era la serialización, era la **aritmética**. Mientras la
velocidad viaje copiada tal cual, `indexOf` acierta aunque el decimal sea feo; se
rompe el día que alguien la *calcule*. La prueba ahora fija lo que de verdad hace
falta: que las cuatro sean cuartos exactos.

Los otros dos supervivientes eran del lector de estado: cambiarlo para que
publicara **siempre** velocidad normal no ponía en rojo ni un test, porque las
pruebas del botón le pasan el estado a mano y ninguna miraba de dónde sale ese
número. Es exactamente el fallo que el diseño quería evitar, y no estaba
defendido. Con los tres tapados: **15 de 15 mutaciones detectadas, 0 sobreviven.**

#### Temporizador de apagado: dos relojes para un solo plazo

Un botón más en la fila de extras. Apagado enseña una luna; cada clic recorre
**15 → 30 → 60 minutos** y el cuarto clic apaga, exactamente el patrón del botón
de velocidad: el orden de la lista *es* el ciclo, «apagado» no está en la lista
porque es la ausencia de plazo, y una prueba cose lo que el botón ofrece con lo
que el temporizador acepta. Mientras hay plazo, el botón deja la luna y enseña
los minutos que quedan —«29′», con la prima de los minutos y la misma tipografía
tabular que «1,5×»— y nunca dice «0′»: el último minuto se enseña como «1′»,
porque un contador en cero con la música sonando sería un mando que miente.

**El plazo vive en el content script, y es una decisión, no una comodidad.**
Habría sido natural ponerlo en el service worker con `chrome.alarms`, pero eso
cuesta un permiso más en la revisión de la Chrome Web Store, y sobre todo cambia
el significado: un temporizador que sobrevive a la pestaña se despertaría sin
nada que pausar. «Apaga esta música en 30 minutos» muere con la pestaña, y quien
tiene el `<video>` es esa página: pausar desde allí es una llamada, no un
mensaje que puede no llegar. El comando `SET_SLEEP_TIMER` viaja por el reenvío
genérico que ya existía —**cero cambios en el service worker**— y lo despacha
`PlayerController`, para que la pregunta «cómo se pausa» siga teniendo una sola
respuesta.

**Dos relojes para un solo plazo, y cada uno cubre el hueco del otro.** El
principal es el latido: mientras suena la música, `timeupdate` llega unas cuatro
veces por segundo y `comprobar()` atrapa el vencimiento con un cuarto de segundo
de error como mucho. Pero el latido tiene un punto ciego: pausada la música no
hay eventos, y un plazo vencido se quedaría armado esperando… al «play» de
mañana, que pausaría la música nada más arrancarla. Ese caso lo cubre un
`setTimeout` de respaldo que vence un pelín después de la hora, consume el plazo
y pausa —y pausar lo ya pausado no hace nada—. Consumir es tan importante como
pausar: un plazo vencido que se quedara puesto sería una trampa armada.

**El plazo es de pared, no de música**: pausar a mano no lo congela, como en los
temporizadores de dormir de toda la vida. «En 30 minutos» significa a las 23:30,
no «tras 30 minutos de reproducción».

**El tope de las 12 horas no es una manía.** `setTimeout` guarda el retraso en
32 bits: por encima de ~24,8 días dispara *al momento*, así que un pedido
absurdo, sin tope, pausaría la música al instante en vez de nunca. Se acota en
vez de rechazarse, y una prueba vigila el número exacto
(`MAX_MINUTES × 60000 + 250 < 2³¹`).

**El clic pregunta al módulo, no al último estado recibido.** El resto de
botones ciclan sobre `lastState`, pero aquí ese estado tiene dos agujeros: dos
clics seguidos caen dentro del debounce de 150 ms y ciclarían 15 → 15, y con la
música pausada no hay latido, así que el estado puede tener días. La ventana y
el temporizador comparten página y realm: el módulo *es* la verdad, y el botón
se repinta en el acto sin esperar un latido que pausado no llega. La firma del
estado, eso sí, cuenta el restante en **minutos**, no en milisegundos: si no,
ningún estado se parecería al anterior y saldrían cuatro envíos por segundo
hacia el service worker para contar una cifra que cambia una vez por minuto.

**Los errores de esta tanda, que también se cuentan.** Primero, los objetos
cruzados de realm: `deepStrictEqual` compara prototipos y un objeto nacido en la
ventana de jsdom no es «igual» a uno de Node aunque tenga lo mismo dentro — la
misma trampa que ya habían pagado los arrays de la cola, ahora con objetos
planos. Y segundo, el arreglo del primer error se hizo mal: se escribió un
`plano()` local en el archivo de pruebas **sin mirar que el arnés ya exportaba
uno**, recursivo y mejor. Una regla duplicada en dos sitios no es una regla, son
dos; el archivo quedó refactorizado para usar el del arnés y el comentario que
dejó la limpieza cuenta la historia.

**Lo que ninguna de estas pruebas puede ver**: el contador del botón se congela
mientras la música está pausada (sin latido no hay repintado) hasta el próximo
evento o clic — se asume, porque el plazo de verdad lo llevan los dos relojes,
no el dibujo—; y el `setTimeout` de respaldo con sus 15 minutos reales sólo se
puede ver vencer en la página de verdad con un reloj de pared.

##### La superviviente anunciada que no lo era

Al planear la mutación se anunció una superviviente: borrar el término del
temporizador de la firma del estado no pondría nada en rojo, porque el primer
envío pasa igual —otros campos ya difieren—. La predicción **estaba mal**, y por
un mecanismo mejor que el previsto: el orquestador ya había enviado un estado
durante su arranque, así que con el término borrado, fijar el plazo no cambia la
firma, **no sale ningún envío nuevo** y la prueba del latido —que se añadió
después de aquella predicción, justo para ejercitar la costura con el
orquestador de verdad— lo caza: el último estado enviado se queda sin
`sleepTimer`. La mutación se corrió igualmente para comprobar la confesión antes
de escribirla, y lo que había que confesar era lo contrario: **8 de 8
mutaciones detectadas, 0 sobreviven**, incluida la que iba a vivir.

#### Ecualizador por canción: una chincheta y ninguna verdad duplicada

Un botón más junto a las barritas del ecualizador: una chincheta. Pulsarla fija
**lo que suena ahora mismo** a la canción actual —no elige ajustes, congela el
que hay— y desde entonces, cada vez que esa canción vuelva a sonar, su ajuste se
pone solo. El segundo clic la suelta, y soltar no toca el sonido: quitar la
chincheta significa «no lo pongas la próxima vez», no «quítalo ya». La etiqueta
dice **qué** quedó fijado («Fijado a esta canción: Nocturno»), por lo mismo que
la del ecualizador dice cuál está puesto: el usuario puede tocar el ecualizador
después de fijar, y un botón que sólo dijera «fijado» invitaría a creer que fijó
lo de ahora.

**La decisión que sostiene todo: la memoria no tiene camino propio hacia el
audio.** Cuando una canción fijada empieza, el módulo *escribe* el ajuste
guardado con `Settings.guardarEcualizador`, exactamente igual que si el usuario
lo hubiera elegido en Preferencias. Todo lo demás pasa solo: el grafo se remonta
porque ya está suscrito a Settings, el interruptor de la ventana se repinta
porque ya se repinta con cada cambio, y Preferencias enseña el ajuste real
porque lee la clave de siempre. La alternativa —un «ecualizador efectivo»
calculado aparte, con la preferencia global intacta debajo— parecía más
respetuosa y era una mentira estructural: habría **dos** respuestas a «cómo
suena ahora» y cada mando de la extensión tendría que saber cuál de las dos
enseñar. El comentario de `EQUALIZER` en `constants.js` dice que esa clave
significa *cómo suena ahora*; si la canción fijada suena con su ajuste, eso es
lo que la clave tiene que decir. Un mando que enseña la preferencia global
mientras suena otra cosa es un mando que miente.

**El precio de esa honestidad es devolver.** Al acabar la canción fijada hay que
reponer lo que sonaba antes, y sólo si el usuario no tocó el ecualizador en
medio. De eso se ocupa `pendiente = { anterior, aplicado }`: `aplicado` es la
prueba del delito —la máquina sólo deshace lo que consta que puso ella—. Si al
llegar una canción sin fijar el valor global ya no es `aplicado`, lo último lo
escribió el usuario, y devolverle «lo de antes» sería pelearle el volante. Las
cadenas de canciones fijadas conservan el `anterior` **original**: al salir de
la cadena se vuelve a lo de antes de la cadena, no al eslabón previo.

**El error encontrado derivando a mano, antes de la primera prueba.** Al
escribir los casos sobre papel apareció uno que la primera versión hacía mal:
fijar una canción **justo después de una devolución**. `alEmpezar` («lo que
sonaba cuando empezó esta canción») se apuntaba al entrar en `alSonar`, *antes*
de devolver, así que decía el ajuste de la canción fijada anterior; si el
usuario fijaba entonces, ese ajuste retirado se colaba de `anterior` y
**reaparecía dos canciones más tarde**. El arreglo es una línea —corregir
`alEmpezar` después de devolver— y tiene su prueba de regresión con el hallazgo
contado en el nombre.

**El mutante que sobrevivió, y la prueba que le costó.** En la mutación a mano,
quitar el retorno temprano de «misma canción» en `alSonar` dejó las 22 pruebas
en verde. El hueco estaba en un cruce que ninguna miraba: canción **fijada**
sonando, el usuario cambia el ajuste, y el siguiente latido trae **la misma**
canción. Sin ese retorno, `alSonar` la trata como recién llegada y le vuelve a
plantar el ajuste fijado encima de la elección del usuario, cada pocos segundos,
hasta que la canción acabe. «El usuario toma el mando» no lo veía porque
cambiaba de canción justo después de tocar, y «cero escrituras» repetía el
latido con una canción *sin* fijar, donde repetir el trabajo no escribe nada.
La prueba nueva («latido repetido sobre la fijada») reproduce el cruce y ahora
el mutante muere; la lección es la de siempre: los huecos viven donde dos
propiedades probadas por separado se cruzan.

**Lo guardado se criba con la propia normalización.** Los valores válidos son
los **puntos fijos** de `Ecualizador.normalizar` (normalizar un valor canónico
lo devuelve tal cual). Lo corrupto se **tira**, no se normaliza: normalizar aquí
convertiría basura en «off», y un «off» fijado a una canción es una orden real
(«esta canción, sin ecualizar»), no el residuo de un dato roto. La memoria
persiste como **lista de pares** `[clave, valor]` donde el orden es la edad:
caben 200 canciones y la expulsión come por el principio, con recolocación al
final en cada fijado (lo recién usado es lo más reciente). La clave es
`título + "\n" + artista` y **no** reutiliza el `songKeyOf` del orquestador
aunque los dos peguen título y artista: aquél compara dos lecturas separadas por
milisegundos para descartar una carrera y le da igual el separador; ésta
identifica una canción a través de días y sesiones, y su separador («||») puede
aparecer en un título real, cosa que un salto de línea no sobrevive al DOM.
Mismo aspecto, contratos distintos; una sola función con dos contratos acaba
rompiendo uno de los dos.

**La carga es una carrera y se corre a propósito.** `cargar()` es asíncrona;
hasta que el storage contesta, la memoria está vacía y el latido no fija nada
—el mismo trato que recibe cualquier preferencia antes de `Settings.load()`—.
Pero la canción que **ya sonaba** al abrir la página habría pasado por el latido
antes de que la memoria supiera que estaba fijada, así que al terminar la carga
se olvida la canción actual (`actual = null`) y el siguiente latido vuelve a
decidir con la memoria puesta. La prueba reproduce la carrera entera: latido
síncrono antes de los microtasks (nada se fija), la carga llega, y el mismo
latido repetido enciende el ajuste.

**Lo que ninguna de estas pruebas puede ver**: el `chrome.storage.local` de
verdad entre sesiones (el arnés lo dobla; que lo fijado sobreviva a cerrar
Chrome se comprueba en el navegador real) y la puerta de un solo sentido del
grafo de audio cruzándose sola al empezar una canción fijada con el ecualizador
global apagado — el remontado lo dispara la misma suscripción de Settings de
siempre, pero verlo cruzar con música sonando es cosa de la página real.

#### Espectro de la música

Petición de uso: *"me gustaría un espectro de la música ¿es posible?"*. Sí, pero
la respuesta honesta necesitaba comprobarlo antes, y comprobarlo tenía un riesgo
que conviene explicar.

**Por qué no `createMediaElementSource()`.** Es el camino de manual para analizar
el audio de un `<video>`, y es una puerta de un solo sentido: desde esa llamada
el sonido deja de salir por su ruta normal y sale por el `AudioContext`. Si el
contexto se queda suspendido —y se suspende solo, por política de
autorreproducción o al pasar la pestaña a segundo plano— la música se calla y no
se arregla sin recargar la página. No hay deshacer. En una extensión cuyo único
propósito es escuchar música, ese riesgo no se corre ni para hacer una prueba.

`captureStream()` entrega una **copia** del audio y deja el elemento sonando por
donde sonaba. Si este módulo entero falla, lo peor que pasa es que no hay
espectro. Por lo mismo la cadena termina en el analizador y **nunca** se conecta
a `ctx.destination`: eso sonaría una segunda vez, con eco.

Con eso escribí `tools/diagnostico-espectro.js` para pegarlo en la consola de
`music.youtube.com` y contestar la pregunta con datos en vez de con una
suposición. Lo ejecutó el usuario sobre su sesión real:

```
DRM: no
pistas de audio: 1 (live)
movimiento: 35 de 35
banda mas alta vista: 255 de 255
seguia sonando: si (524.1 → 526.1)
VEREDICTO: hay señal. El espectro se puede hacer sin tocar la reproduccion.
```

Si algún día YouTube Music sirviera la música cifrada, `video.mediaKeys` existiría
y el botón **no se ofrecería**. No se inventa un espectro a partir del tiempo de
la canción: sería una animación disfrazada de dato.

**El reparto de barras es la única parte que decide cómo se ve, y es pura.** El
analizador entrega bandas lineales en frecuencia: con 128 bandas hasta ~22 kHz, la
primera mitad del espectro cubre de 0 a 11 kHz, donde no hay casi nada de música.
Repartidas a partes iguales, tres cuartas partes de las barras se quedan clavadas
a cero y el resultado parece roto. El oído percibe la frecuencia de forma
logarítmica, así que los cortes se reparten igual. Las barras suben de golpe y
bajan con freno: un golpe de batería dura menos que un fotograma, y con bajada
inmediata la barra estaría abajo antes de que el ojo la viera.

**Dónde vive el canvas.** Dentro del escenario y en `position: absolute`, así que
no ocupa ni una fila de alto. Reservarle sitio propio habría sido repetir el error
que este archivo ya ha corregido dos veces —cualquier altura fija acaba empujando
los controles fuera de la ventana— y en `mini` ni siquiera cabría. Medido: con el
espectro encendido, el hueco entre el canvas y el botón de reproducir sigue siendo
de 75 px a 340×360 y de 31 px a 340×200; en modo superpuesto se solapan 28 px a
propósito, y ahí `elementFromPoint` confirma que quien pinta encima es el botón y
que el canvas lleva `pointer-events: none`.

**Lo que la verificación por mutación me corrigió.** Dos mutaciones sobrevivieron
en la primera vuelta, y ninguna de las dos era una prueba que faltase: eran dos
trozos de código míos que no hacían nada.

1. En `cortesDeBarras` había un `cortes[barras] = numBandas` con el comentario
   «si el redondeo se quedó corto, se estira». No puede quedarse corto: en la
   última vuelta el exponente es `i / barras === 1` exacto y `Math.pow(n, 1)`
   devuelve `n`. Una red que no puede atrapar nada sólo hace creer que hay red.
   Borrada.
2. `sincronizarEspectro()` comprobaba `espectroDisponible` antes de encender…
   pero `conectar()` ya se lo pregunta a `puedeMedirse()` por dentro. La misma
   regla escrita dos veces, otra vez, y esta vez la pilló la mutación y no yo.
   Se quedó una sola; arriba sigue haciendo falta, porque enseñar el botón no
   pasa por `conectar`.

Segunda vuelta: **16 de 16 mutaciones detectadas, 0 supervivientes**
(`node tools/mutar-espectro.js`). Con el arreglo del apartado siguiente son
**20 de 21**, y el superviviente que queda es deliberado; se explica ahí. Con todo
lo que vino después —las preferencias del espectro y el tercer intento contra el
congelado— ese mismo mutador va por **42 de 45, con 3 supervivientes**, los tres
deliberados y los tres explicados en su sitio.

#### El espectro se moría al cambiar de canción

> «cuando cambia de canción y tengo el espectro activado y se cambia de canción
> deja de servir el espectro y toca oprimir nuevamente»

El «toca oprimir nuevamente» es el dato: apagar y encender lo arreglaba. Es decir,
lo único que hacía falta era **volver a capturar**, y nadie lo estaba haciendo.

Este módulo ya se protegía del relevo de `<video>` —YouTube Music crea un elemento
nuevo al encadenar canciones, un fallo que este proyecto ha visto tres veces— con
una comparación de identidad:

```js
if (video === elementoConectado && analizador) return true;
```

Esa guarda vigila **el elemento**, y hay dos cosas que pueden caducar:

1. **El elemento**, cuando YouTube Music crea uno nuevo. Cubierto.
2. **La pista capturada**. `captureStream()` entrega una copia del audio de *ese
   momento*; cuando el elemento cambia de fuente, esa copia se termina aunque el
   elemento siga siendo **el mismo objeto**. El analizador sigue montado,
   `conectado()` sigue diciendo que sí, y lo que se lee son ceros.

Comparar el elemento no puede cubrir el caso 2, porque en el caso 2 el elemento no
ha cambiado. Son dos preguntas distintas y hacían falta las dos:

```js
if (video === elementoConectado && analizador && !pistaTerminada()) {
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return true;
}
```

De paso, la segunda línea tapa otra forma de leer ceros con todo aparentemente
montado: la política de autoreproducción puede suspender el `AudioContext`
**después** de crearlo (al mandar la pestaña al fondo, por ejemplo). Se reanudaba
sólo al montarlo, y ahí ya nadie volvía a mirar.

**Por qué la pregunta está escrita al revés.** `pistaTerminada()` comprueba
`readyState === "ended"`, no `!== "live"`, y no es un detalle de estilo. Una
`MediaStreamTrack` real siempre dice una de las dos; pero si alguna vez no dijera
nada, «no consta que esté viva» obligaría a remontar el analizador en **cada
refresco**: un `AudioContext` nuevo varias veces por segundo. Sólo se remonta ante
una señal positiva de muerte. Hay una prueba para eso, porque la mutación que
invierte la pregunta sobrevivió a la primera vuelta: era invisible mientras todas
las pistas de las pruebas supieran decir cómo estaban.

**Otro fixture que no podía fallar.** El doble de pista de las pruebas era
`{ stop() {} }`, sin `readyState`. Una pista que no puede morir no puede reproducir
el caso en el que muere, así que el fallo reportado era literalmente intestable
mientras ese doble siguiera ahí. Es el mismo error que el botón de repetir
inventado, cometido en otro archivo el mismo mes.

**El superviviente que se queda.** `desconectar()` pone `pistaConectada = null`, y
esa línea sobrevive a la mutación: no puede cambiar el comportamiento, porque
`pistaConectada` sólo se lee dentro de una guarda que exige
`video === elementoConectado`, y eso ya es imposible con el elemento a `null`. No se
borra —a diferencia del `cortes[barras] = numBandas` de más arriba— porque no es
una red que no atrapa nada: `desconectar()` promete soltarlo **todo**, y quedarse
agarrado a una pista muerta mientras se sueltan las otras cinco cosas sería una
promesa a medias. Queda en la lista del mutador, marcada, para que siga diciéndolo
en voz alta.

**Lo que estaba razonado y no observado — y salió mal.** La causa de arriba (que
lo que caduca es la pista) está deducida de cómo funciona `captureStream()`, no
medida: el bloque `--- VEREDICTO DEL ESPECTRO ---` del diagnóstico no llegó a
pegarse. El arreglo no es incorrecto, pero **no era el fallo**, y el espectro
siguió muriéndose. La historia de cómo se midió de verdad está tres apartados más
abajo, en «El espectro se moría al cambiar de canción, tercer intento».

**Lo que estas pruebas no cubren, dicho claro.** Que las barras se vean bien es
cosa de mirar la ventana: jsdom devuelve `null` en `canvas.getContext("2d")` y no
tiene `AudioContext`. El `AudioContext` de las pruebas está fingido a propósito y
sólo sirve para comprobar **cuándo** se monta y **cuándo** se suelta, que es donde
están los fallos caros (uno acumulado por cada apertura de la ventana, o un
analizador clavado a un `<video>` muerto tras encadenar canciones — el fallo que
este proyecto ya ha visto tres veces por otros motivos). Fingir sus números no
probaría nada que no fuera mi propia invención.

#### El espectro medía una cosa u otra según lo que sonara

Aquí decía, como limitación asumida, que en ventana pequeña *con* texto el
espectro era un rectángulo de 96×33 «pequeño pero honrado», y que la salida era
pulsar «Aa». El reporte fue que eso no vale:

> «así es la visual de vídeo, pero la de carátula […] me gustaría que también se
> aprovechara el espacio para que aparezca igual que en la de vídeo»

Y tenía razón, porque la causa no era una limitación de sitio: era **de quién
colgaba el canvas**. Estaba dentro de `.ytmpip-stage`, y un elemento en
`position: absolute` mide contra su ancestro posicionado. El escenario mide la
ventana entera cuando hay vídeo y 96 px cuando hay carátula, así que el mismo
espectro salía de 420×102 o de 96×33 según lo que estuviera sonando. No había
ninguna regla que dijera «con carátula, más pequeño»; salía de rebote.

El canvas pasa a colgar de `.ytmpip-body`, que mide lo mismo en los dos casos.
Medido en `tools/vista-previa.html` antes y después:

| Caso | Antes | Después |
| --- | --- | --- |
| Espectro, mini (340×200) | 96×33 | **324×37** |
| Espectro (340×360) | 320×52 | **320×67** |
| Sólo carátula + espectro | 320×67 | 320×67 |
| Espectro sobre vídeo (420×300) | 420×102 | 420×102 |

El modo vídeo no se mueve ni un píxel —era el que estaba bien— y los controles
siguen sin recibir ningún empujón: quedan 8 px de aire en las ventanas normales y
5 px en `mini`, y el solape del modo superpuesto sigue siendo el de siempre, que
es a propósito.

**El efecto colateral que sí hubo que arreglar.** Al salir del escenario, el
canvas quedaba *después* del texto en el HTML y pasó a pintarse **encima** del
título. Se arregla levantando el texto un piso (`.ytmpip-info` con `z-index: 1`),
no bajando el canvas: si se hundiera el canvas acabaría también por debajo de la
carátula, que es opaca, y las barras desaparecerían justo en la mitad que se
quería aprovechar. Comprobado con `elementFromPoint` en el centro del título en
los seis casos con espectro: manda `ytmpip-title`, no el canvas.

#### Cuatro cosas del espectro que ahora se eligen

El espectro tenía cuatro números escritos a mano en el código: cuántas barras,
cuánto tardan en caer, qué alto ocupan y de qué color son. La petición fue clara:

> «me gusta las opciones que dices, numero de barras, velocidad, altura y color,
> coloca opción también color rgb»

Y antes de eso, dónde ponerlas:

> «las que son de gusto y se tocan una vez […] a la página de opciones, que es la
> que está infrautilizada; el popup se queda para lo de un clic»

Así que van a `src/options/`, en una sección **Espectro** nueva. Dos de las cuatro
son de dos campos, porque llevan dentro dos preguntas: las barras son
«automático» **o** un número, y el color es «el del tema» **o** un `#rrggbb` de un
`<input type="color">`. El segundo campo sólo aparece cuando hace falta.

**Los valores por defecto no son valores nuevos.** Son exactamente lo que hacía el
programa antes: `auto`, caída 12, alto 34 %, color del tema. Quien no abra las
opciones no debe notar que existen. Eso no es una intención, es una prueba: las
del cable comparan lo que llega al bucle de dibujo con lo que llegaba antes.

**El vacío que parecía un cero.** Al escribir la prueba de «borro la casilla del
número de barras», salió 8 en vez del número sugerido. `Number("")` es `0`, no
`NaN`: la casilla recién borrada pasaba el filtro de «esto es un número finito» y
se acotaba al mínimo. Borrar la casilla daba ocho barras en silencio. Vacía
significa «no he puesto nada», no «ocho», y ahora se aparta a mano antes de mirar
si es finito. Lo encontró una prueba mía, no el usuario, que es de las pocas veces
que puedo decirlo en este documento.

**La misma cifra, dos intenciones.** Hay dos funciones que parecen la misma y no
lo son. Al **leer** de `chrome.storage`, un 5 significa «esto viene corrupto» y lo
seguro es volver al valor por defecto. Al **escribirlo a mano** en la casilla, un
5 significa «quiero pocas», y mandar el desplegable de vuelta a «automático» sería
deshacerle al usuario lo que acaba de elegir. Por eso `normalizarBarras` rechaza y
`unirBarras` acota, y por eso lo acotado se devuelve a la casilla: para que no
guarde 8 mientras enseña 3.

**Un superviviente de mutación más, y a propósito.** Quitar la línea que aparta
`"auto"` en `normalizarBarras` no rompe ninguna prueba, porque el valor por
defecto *casualmente* es `"auto"`: sin esa línea, `"auto"` se convierte en `NaN`,
cae al `fallback` y vuelve a salir `"auto"`. Acertar por accidente. Se queda la
línea, igual que se quedó la de `desconectar`, porque enuncia lo que promete la
función; distinto de la red de `cortesDeBarras`, que se borró porque no podía
atrapar nada. Cuando cambie el valor por defecto, el accidente deja de acertar.

**Lo que costó no duplicar el 34 %.** El alto ahora es
`height: var(--ytmpip-spectrum-height)` **sin valor de reserva**, a propósito: el
valor por defecto vive en `DEFAULT_SETTINGS` y repetirlo en el CSS sería tenerlo
en dos sitios. El precio es que el marco de vista previa (hoy
`src/options/vista-previa.html`) ya no hereda nada
gratis, porque ahí no corre `pip.js`. Escribe las dos variables él mismo leyendo
las mismas constantes — que además es más honesto, porque ahora la vista previa
comprueba el valor por defecto de verdad y no una copia suya en el CSS.

Medido en `tools/vista-previa.html`, en la ventana de 340×360:

| Alto elegido | Canvas |
| --- | --- |
| 10 % (el mínimo) | 320×20 |
| 34 % (por defecto) | 320×67 |
| 100 % (el máximo) | 320×197 |

Los seis casos que ya existían miden lo mismo que antes, hasta el píxel. Y al
100 %, que es donde cabría esperar que el espectro tapara algo,
`elementFromPoint` sigue devolviendo `ytmpip-title` sobre el título y
`ytmpip-play-pause` sobre el botón de reproducir.

#### El arcoíris del ordenador gamer

Petición de uso: *"Agrega colores o combinación de colores , RGB decia algo asi
como los computadores gamer , que cambian de color constante, digamso para
hacerlo visualmente más atractivo"*.

Esa frase pide **dos cosas a la vez**, y hace falta darse cuenta o sale a medias:

- **El reparto.** Cada barra con un tono distinto — si no, no es una combinación
  de colores, es un color.
- **El giro.** Que todo eso se mueva — si no, es un arcoíris de foto.

Cualquiera de las dos sola parece razonable y no es lo que se pidió: sólo
reparto da un arcoíris clavado, y sólo giro da el espectro entero de un color
liso que va cambiando. Hay una mutación para cada mitad, precisamente porque las
dos «casi» funcionan.

La cuenta entera cabe en una función pura:

```js
matizRgb(ahora, indice, total)   // -> [0, 360)
```

Tres decisiones dentro, y ninguna es obvia:

**El arco es de 300 grados, no de 360.** Con la rueda entera, el tono de la
primera barra y el de la última serían **el mismo**, y el arcoíris se vería con
una costura justo donde se cierra. Hay una prueba que afirma exactamente lo
contrario de lo que uno escribiría por inercia: que los dos extremos **no**
coinciden.

**El módulo sí cierra la vuelta.** El giro se saca del reloj (`RGB_PERIODO_MS =
6000`), así que sin un `% 360` el tono se saldría de la rueda al cabo de un rato.
Comprobado en el punto que importa y no en uno cómodo: el tono a los 0 ms, a los
6 000 ms y a los 600 000 ms es el mismo.

**Una sola barra no divide por cero.** El reparto va sobre `total - 1`, que con
una barra es 0. Sale `NaN`, `hsl(NaN, ...)` no es un color, y el espectro
desaparecería sin decir nada. Apartado y con prueba.

Y un aviso sobre el nombre, porque la coincidencia es de las que confunden a
quien lea el código dentro de seis meses: el modo se llama `"rgb"` porque así lo
llamó quien lo pidió, y **no tiene nada que ver** con la función CSS `rgb(...)`,
que en este archivo sigue estando prohibida (`normalizarColor` sólo admite
`#rrggbb` en su forma larga, porque un color que el navegador no entienda deja el
espectro invisible sin avisar).

Lo que sí hubo que cuidar es que `"rgb"` **no es un color**: es un modo, y no
puede acabar dentro de `fillStyle` ni dentro de la variable CSS del acento. Hay
una prueba dedicada a eso, y `applySettings` ya no enumera los modos a mano — le
pregunta a `partirColor` por la **forma** del valor. Enumerarlos era lo que
obligaba a acordarse de este archivo cada vez que se añade un modo; y ya se
añadió uno.

#### Una paleta propia, y la etiqueta que no decía nada

Dos peticiones en la misma frase, y la segunda es un informe de fallo disfrazado:

> *"en la configuración de espectro en el color una opción dice el del tema, pero
> nada cambia, no sé a qué se refiere, y uno mío sería muy bueno poder seleccionar
> o tener una paleta, para agregar colores que uno quiera, por ejemplo iniciar con
> un rojo y terminar con un azul, con un verde en el medio"*

**Empiezo por la parte en la que me equivoqué**, porque es la que enseña algo. De
*"el del tema… nada cambia"* deduje que el color no llegaba a pintarse, y monté la
hipótesis de que `getComputedStyle` devolvía el literal `var(--ytmpip-accent)` y
que el canvas lo rechazaba en silencio. Un `tools/diagnostico-*.js` en la ventana
real la tumbó en una línea:

```
guardado: var(--ytmpip-accent)   resuelto: #f15a5a
```

`getComputedStyle` **sí** sustituye la variable. El color funcionaba desde el
primer día. El defecto era el otro que él había reportado en la misma frase y que
yo había leído como un adorno: **"no sé a qué se refiere"**. Era una etiqueta
ciega. Con «Un color mío» el color se ve en el cuentagotas; con ésta había que
elegirla, guardar y abrir la ventana flotante para averiguar de qué se estaba
hablando. La corrección es una muestra de color al lado de la etiqueta.

**De dónde sale el color de esa muestra**, que es la parte delicada. El acento
**no es el mismo en los dos temas** (`#f15a5a` en oscuro, `#d32f2f` en claro) y
vive en `src/pip/pip.css`. Copiar los dos hexadecimales en `options.js` habría
sido la trampa de siempre: coincidirían hoy, y el día que alguien retoque el CSS
la muestra enseñaría un color y la ventana pintaría otro — peor que no enseñar
nada, porque la primera versión sí acierta y nadie vuelve a mirar. Así que la
página de opciones **lee el CSS de verdad**, y lo busca **por selector** y no por
orden de aparición:

```js
const SELECTOR_POR_TEMA = { dark: ":root", light: "html.ytmpip-theme-light" };
```

Mover el bloque del tema claro dentro del archivo no debe intercambiar los
colores de la muestra. Si el selector cambia de nombre, avisa por consola en vez
de callarse.

**La paleta.** Va a lo **ancho**: el primer color en la barra de la izquierda, el
último en la de la derecha, los de en medio repartidos por igual, y entre dos
contiguos se interpola. De 2 a 5 colores.

Está **quieta**, a diferencia del arcoíris de arriba, y esa decisión la tomó su
propia petición sin querer: pidió *"iniciar con un rojo y terminar con un azul"*.
Si el degradado avanzara con el reloj, el rojo no estaría *al iniciar* más que un
instante de cada seis segundos. **Girar y "empezar en" son incompatibles**, y aquí
manda el segundo.

**Se interpola en HSL, no en RGB**, y la diferencia se ve a simple vista: el punto
medio de `#ff0000` y `#00ff00` en RGB es `(128,128,0)`, un verde oliva sucio que
no está en ninguno de los dos extremos; en HSL el tono cruza de 0 a 120 grados por
el camino corto y en el medio hay un amarillo limpio. Un degradado entre dos
colores vivos con un barrizal en mitad parece un fallo. Hay una prueba que exige
ese amarillo, y existe para que el día que alguien "simplifique" a RGB se entere.

El caso que se escapa si no se mira: **un extremo sin saturación** —blanco, negro
o gris— no tiene tono, y su `h` vale 0 por convenio… que resulta ser el rojo.
Interpolando negro con azul a pelo, ese cero de mentira arrastraría el tono desde
el rojo y el degradado cruzaría por morados que nadie eligió. Cuando uno de los
dos es gris se usa el tono del **otro** y sólo se mueven la luz y la saturación.

**Dónde vive la regla, y por qué no donde parecía.** `colorDePaleta` nació en
`pip.js`, al lado del arcoíris. Duró hasta escribir la vista previa de la página
de opciones: `options.html` **no carga `pip.js`** —es otro documento, con su
propia lista de scripts—, así que la única forma de tener el degradado allí era
copiarlo. Una vista previa que interpola distinto que el espectro no es una vista
previa, es un dibujo que se le parece. Se sacó a `src/shared/paleta.js`, que es el
mismo movimiento que ya se hizo con las constantes y por el mismo motivo: **una
regla duplicada en dos archivos no es una regla, son dos.**

La alternativa cómoda para la vista previa era un `linear-gradient` de CSS, que es
una línea de código. No vale: **CSS interpola en otro espacio de color** y el
resultado no es el de `colorDePaleta`. La mentira sería la misma, sólo que más
difícil de ver. La vista previa se pinta columna a columna llamando a la misma
función que pinta las barras.

Dos cosas que aparecieron al integrar y que ninguna prueba habría cazado sola:

- `paleta.js` leía `YTMPip.Constants` y el módulo se exporta como
  `YTMPip.CONSTANTS`. Eso no rompe la paleta: **revienta al cargar la extensión
  entera**, porque el `content_scripts` se evalúa en orden.
- En `options.html`, `.ytmpip-pista { display: flex }` pesa lo mismo que
  `[hidden]` (0-1-0) y va escrita después, así que ganaba el empate: el aviso de
  «El del tema» se habría visto **siempre**, también con la paleta elegida. De ahí
  el único `!important` del archivo, con el porqué al lado.

La paleta se guarda en la **misma** clave que el color suelto (`spectrumColor`),
como texto con comas, y el modo se deduce de la **forma** de lo guardado. Tener
además un `spectrumPalette` sería poder almacenar dos respuestas a la vez a una
pregunta que sólo admite una, y antes o después se contradicen.

Y una corrección a un alarde que había en `settings.js`: decía que añadir un
cuarto modo de color no obliga a tocar `unirColor`. **Era verdad a medias.** El
truco sólo funciona con los modos que **son** su propio valor guardado
(`"accent"`, `"rgb"`); los que **llevan un dato dentro** —`"custom"` con su color,
`"palette"` con su lista— hay que nombrarlos por fuerza, porque alguien tiene que
decir de dónde sale el dato. Son dos familias y sólo una era gratis.

#### El espectro empieza abajo del todo

Petición de uso: *"el espectro debería comenzar desde abajo"*.

El `<canvas>` ha vivido en **tres** sitios y los dos primeros estaban mal por
motivos distintos:

1. **Dentro del escenario.** Ahí heredaba su tamaño: con vídeo el escenario es la
   ventana entera y el espectro salía ancho, pero con carátula es una miniatura de
   96 px y el espectro salía de 96×33.
2. **Dentro del cuerpo.** Arreglaba lo anterior, pero el cuerpo termina donde
   empieza la barra de progreso, así que el espectro **tocaba fondo a media
   ventana** y se veía flotando encima de los controles. Eso es exactamente lo que
   se reportó.
3. **Hermano del cuerpo y de los controles.** Como `.ytmpip-content` no está
   posicionado, el `position: absolute` del canvas se resuelve contra
   `#ytmpip-root`, o sea contra la ventana entera.

Lo que hizo falta borrar fue un `position: relative` en `.ytmpip-body` cuyo propio
comentario decía que estaba puesto para que el canvas *"no tapara también los
controles"*. Ese comentario describía el bug: era el bloque contenedor que ataba
el espectro a media ventana. Antes de quitarlo se comprobó que el espectro era el
único descendiente del cuerpo posicionado en absoluto.

Efecto secundario que conviene saber: la preferencia **"altura del espectro"**
significa por fin lo que su comentario en `constants.js` decía desde el primer
día —*"porcentaje del alto de la VENTANA, 100 es la ventana entera"*—. Con el
canvas colgando del cuerpo, ese 100 % era el 100 % de un trozo. **El mismo número
guardado se ve ahora más alto**, y eso no es un fallo nuevo: es que antes mentía.

#### La ventana se atenúa mientras suena

Petición de uso: *"Quisiera una opción para colocar transparente el pip mientras
se reproduce la música"*.

**Empiezo por lo que esto NO hace**, porque es la parte honesta. Lo implementado
baja la opacidad del **contenido** (`#ytmpip-root`), así que por debajo asoma el
fondo de la propia ventana flotante — no el escritorio. Se ve, y se ve bien, pero
no es una ventana traslúcida de verdad.

¿Puede una ventana Document PiP llegar a ser traslúcida? **No lo sé, y no pienso
afirmarlo sin medirlo.** Depende del compositor del sistema y de lo que Chrome
decida para este tipo de ventana, y ninguna de las dos cosas se puede preguntar
desde JavaScript. Por eso existe `tools/diagnostico-transparencia.js`: deja la
ventana en el estado en el que **sería** traslúcida si el navegador lo
permitiera —quita los tres fondos opacos y esconde el difuminado de la portada— y
le dice a la persona qué mirar. Si se ve el escritorio, la transparencia real es
posible y se puede ofrecer. Si se ve blanco o negro liso, lo que ya está hecho es
todo lo que se puede dar. Esa pregunta la contesta el usuario mirando, no yo
suponiendo.

La regla es una función pura de dos líneas y aun así me equivoqué **dos veces**
en ella.

**Error mío nº 1: la coma flotante.** La escribí como `1 - transparencia / 100`,
que es la forma natural. Con un 80 eso da `0.19999999999999996`, y ese número
—los diecisiete dígitos— habría acabado tal cual dentro de una variable CSS. Lo
cazó una prueba mía, no el usuario. Se escribe `(100 - transparencia) / 100`, que
es exacta para enteros, y hay una mutación que devuelve la resta antigua para que
nadie la «simplifique» de vuelta.

**Error mío nº 2, que es la lección de siempre.** `aplicarAtenuado` leía el
porcentaje por dentro, de `YTMPip.Settings.get()`. En producción funcionaba: los
dos sitios que la llaman lo hacen siempre con la caché ya cargada. Pero eso la
convertía en una **segunda fuente** de la misma preferencia, y en el momento en
que dos pruebas le pasaron un objeto de preferencias sintético a `applySettings`,
la función se dio media vuelta y leyó la caché. *Una regla duplicada en dos
archivos no es una regla, son dos* — y esta vez la duplicación ni siquiera
cruzaba de archivo, estaba a veinte líneas de distancia. Ahora el porcentaje
entra por argumento en las dos llamadas, que ya lo tenían a mano.

Dos detalles más, los dos con prueba:

- **En pausa no se atenúa nunca.** Se pidió «mientras se reproduce la música», y
  una ventana que se queda medio borrada con la música parada parece una ventana
  rota. Pausar lo deshace solo.
- **El tope es 80 %, no 100 %.** Al 100 la ventana sería invisible, y una ventana
  invisible no se puede volver a encontrar para pulsarle nada. Al 80 queda una
  silueta. Hay una mutación que le quita el tope.

Y una regla de CSS que no estaba pedida pero sin la cual esto sería una trampa:
**acercarse la devuelve entera** (`#ytmpip-root:hover, :focus-within`). Si no,
los botones estarían medio borrados justo en el momento en que se van a usar. A
diferencia de los mandos superpuestos, esto **no** va dentro de
`@media (hover: hover)`: allí el autoocultado lo decide la extensión y sin ratón
no habría forma de recuperar los controles, mientras que aquí el desvanecimiento
lo ha pedido el usuario a propósito — y además queda el `:focus-within`, que en
una pantalla táctil salta al tocar cualquier botón.

Y el porcentaje es **lo que se quita, no lo que queda**: pedir 20 % de
transparencia deja la ventana al 80 % de opacidad. Suena a perogrullada hasta que
se escribe al revés, cosa que hace una mutación.

#### El espectro se moría al cambiar de canción, tercer intento

Los dos arreglos anteriores no valieron. El reporte volvió:

> «El espectro se vuelve a pausar si se cambia de canción»

y más tarde llegó la frase que lo resolvió todo:

> «La gráfica funciona bien si la canción se cambia automáticamente, pero si el
> usuario decide cambiar la canción con el siguiente ahí es donde deja de
> funcionar»

**Mi primer diagnóstico no podía contestar la pregunta.** Separaba «congelado» de
«plano» mirando si el canvas estaba vacío. Pero `pip.js` pinta cada barra con
`Math.max(1, ...)`, así que con las barras a cero sigue dejando una raya de un
píxel: el canvas **nunca** queda vacío. Un bucle vivo leyendo silencio se
informaba como `CONGELADO`, que es exactamente la causa contraria. Las dos
posibilidades daban la misma respuesta, y una respuesta que no distingue no es una
respuesta. El usuario me mandó un log lleno de `CONGELADO` y yo estuve a punto de
irme a `pip.js` a buscar un bucle que estaba perfectamente vivo.

**El segundo diagnóstico que escribí también estaba mal, y por la misma trampa de
siempre.** Iba a contar fotogramas parcheando `HTMLCanvasElement.prototype.getContext`
desde la consola. No funciona: los mundos aislados tienen **sus propios
prototipos**, y un parche puesto en el mundo de la página no lo ve el content
script. Habría contado cero fotogramas pasara lo que pasara y me habría
«confirmado» que el bucle estaba muerto aunque fuera a sesenta por segundo. Se
tiró antes de mandárselo al usuario. Es la tercera vez que la separación de mundos
me tumba algo en este proyecto.

**Lo que sí cruza entre mundos es el estado del DOM.** Los prototipos son de cada
mundo, pero el nodo es uno solo, así que `canvas.width` sirve de sonda: se le pone
un valor absurdo, se esperan 150 ms y se mira si alguien lo reescribió. Si volvió,
`pip.js` está dibujando. Eso es `tools/diagnostico-espectro-bucle.js`, y su
veredicto fue inequívoco:

```
[diag2] ===== CAMBIO: "South" -> "All of My Problems…" |
        elemento video#1 -> video#1 (EL MISMO, solo cambio la fuente) =====
[diag2]        fuente nueva: blob:https://music.youtube.com/56e3b52b-…
[diag2 10s] BUCLE VIVO PERO MUDO (barra mas alta 1 px) -> la causa esta en la CAPTURA DE AUDIO
```

**La tercera cosa que puede caducar.** Al pulsar «siguiente» a mano, YouTube Music
reutiliza el **mismo** `<video>` y sólo le cambia el blob, y la pista capturada se
queda en `live` **sin llevar audio**. Ni la identidad del elemento ni la muerte de
la pista se enteran de nada. Por eso el salto automático sí funcionaba: allí la
pista sí llega a terminarse, y el arreglo anterior la cazaba. Son tres preguntas y
ninguna implica a las otras:

```js
if (video === elementoConectado && analizador && !pistaTerminada() && !fuenteCambio(video)) {
```

La fuente **vacía** no cuenta como fuente nueva. Entre dos canciones el elemento
pasa varios segundos sin `currentSrc` —en el diagnóstico se ven, con el vídeo en
pausa a `t=0.0`— y tratar eso como «otra fuente» montaría un `AudioContext` en cada
refresco de todo ese hueco. Vacía significa «todavía no sé», no «otra».

**Y otro fixture que encerraba una suposición mía.** El doble decía
`matarPistaCapturada`: ponía `readyState = "ended"` porque **yo di por hecho** que
eso hacía el navegador al cambiar de fuente. El diagnóstico dice que no. La prueba
pasaba, y pasaba sobre una invención mía. Ahora el doble se llama
`cambiarFuenteSinMatarPista` y su gracia es lo que **no** hace: no mata la pista,
igual que el navegador de verdad. Es el mismo error que el botón de repetir
inventado y que el `{ stop() {} }` sin `readyState`, cometido por tercera vez en el
mismo archivo.

**Una prueba escrita y borrada el mismo día.** Añadí «`desconectar` olvida la
fuente» y en el comentario del código escribí que esa línea «sí cambia el
comportamiento, y hay una prueba que lo dice». Las dos cosas eran mentira:
`fuenteConectada` sólo se lee tras comprobar `video === elementoConectado`, y
`desconectar()` deja el elemento a `null`. La prueba pasaba por otra razón, y la
mutación «`desconectar` se queda con la fuente apuntada» **sobrevivió con la prueba
en verde**. La línea se queda —soltar seis de siete cosas es una promesa a
medias— y ahora es el tercer superviviente deliberado. La prueba se borró, con una
nota en su hueco: una prueba que da sensación de cobertura sin darla es peor que
no tenerla.

**Y una lección sobre el propio mutador.** Al cambiar esa guarda, dos mutaciones
viejas dejaron de encontrar su texto y el script las marcó `??` — «el texto a
mutar ya no existe: la mutación no prueba nada». Sin ese aviso habrían pasado por
supervivientes silenciosos. Se reapuntaron, y las dos vuelven a matar.

#### Antes de escribir el ecualizador: preguntar si se puede

> Este apartado se escribió cuando el ecualizador **no existía**, y se ha dejado
> tal cual porque es la mitad honesta de la historia: el permiso para intentarlo.
> Lo que pasó al construirlo de verdad —tres versiones de una atenuación mal
> puesta, un preset afinado tres veces y un instrumento que se rompió él solo—
> está en los apartados siguientes.

El espectro sólo *mira* el sonido. Un ecualizador de verdad —subir graves, elegir
un preajuste— tendría que *tocarlo*, y eso obliga a pasar el audio por
`createMediaElementSource`, que es **una puerta de un solo sentido**: una vez que
un `<video>` se enchufa a un `AudioContext`, su sonido ya no sale por los altavoces
salvo a través del grafo. Si el grafo se rompe, el usuario se queda en silencio en
la página de YouTube Music, sin ninguna pista de que fuimos nosotros.

Por eso no se escribió el ecualizador: se escribió `tools/diagnostico-ecualizador.js`
para preguntar antes. La respuesta, medida en la página real, es que **sí se puede**:
el filtro `lowshelf` entrega exactamente los **+12,0 dB** que se le piden en la banda
de 20–120 Hz, la banda de control de 2–6 kHz apenas se mueve en comparación
(**8,5 dB de selectividad**), no hay DRM que corte el audio al cruzar la puerta, y
`ctx.resume()` devuelve el sonido después de un `suspend()` deliberado —confirmado
de oído, no sólo por consola—.

**Lo que cuesta contar es que el instrumento mintió dos veces, y las dos veces el
error era mío.**

La primera versión medía con `getByteFrequencyData` y exigía una subida del 15 %.
Eso es un error de categoría: esos bytes **no son volumen, son decibelios**. La
escala reparte el rango `[-100, -30] dB` en 256 pasos, o sea **0,2745 dB por paso**,
y todo lo que supere -30 dB se aplasta contra el 255. La medición partía de 224
bytes ≈ **-38,5 dB**, así que quedaban **8,5 dB** hasta el techo… y mi umbral del
15 % de 224 pedía 33,6 bytes, es decir **+9,2 dB**. Le estaba exigiendo al filtro
más margen del que la propia regla permitía representar: era imposible aprobar.
El filtro funcionaba y el instrumento decía que no.

Arreglado eso —`getFloatFrequencyData`, que da decibelios reales sin techo;
`smoothingTimeConstant = 0`, porque el 0,8 por defecto arrastra cada lectura hacia
la anterior y eso sirve para dibujar barras pero no para medir un cambio; y la banda
de graves movida a 20–120 Hz, donde un `lowshelf` con esquina en 200 Hz entrega
todo su refuerzo en vez de la mitad— **el veredicto siguió siendo falso**. Con unos
números perfectos (+12,0 dB clavados en los graves) devolvía «no concluyente»,
porque la banda de control se había movido +3,5 dB y yo había puesto un límite
absoluto de 3 dB.

El fallo: la banda de control estaba en **-71,9 dB**, prácticamente el ruido de
fondo, donde tres decibelios arriba o abajo son lo normal; la de graves estaba en
**-38,2 dB**, unas 2500 veces más energía. Comparar las dos con el mismo listón
absoluto no tiene sentido. Lo que hay que mirar es la **diferencia entre bandas**
(`graves − control ≥ 6 dB`), que es justo lo que cancela cualquier subida general
del volumen —y era exactamente para eso para lo que yo había puesto la banda de
control—. La había construido bien y la estaba usando mal.

Las dos equivocaciones están escritas en comentarios permanentes dentro del
diagnóstico, con la aritmética entera. Un instrumento que ya se ha roto dos veces
merece llevar encima el registro de cómo.

#### El ecualizador, ya construido: cinco bandas y una puerta

Cinco filtros en serie —`lowshelf` a 60 Hz, tres `peaking` a 250 Hz, 1 kHz y
4 kHz, `highshelf` a 12 kHz—, de ±12 dB, con cuatro preajustes y la posibilidad
de dejar los cinco números a mano. Se elige en Preferencias, donde están los
deslizadores, y se enciende y apaga desde el botón 🎛 de la ventana flotante.

La puerta de un solo sentido sigue ahí y manda sobre el diseño entero:

- **El valor de fábrica es «Apagado»**, y apagado significa que el audio *no*
  entra en el grafo. Nadie cruza esa puerta sin pedirlo.
- **«Plano» no es «Apagado»**, por mucho que suenen igual. Plano cruza la puerta
  y deja las cinco bandas a cero. Existe porque es el sitio al que se vuelve
  después de trastear, y porque poner cinco ceros a mano sería absurdo.
- **Apagar no deshace el cruce**: puentea. La fuente se suelta de los filtros y
  se conecta directa a la salida. Cerrar el `AudioContext` sería la reacción
  intuitiva y es la peor posible —deja al usuario sin audio hasta que recargue—.
- **Con el ecualizador apagado los deslizadores ni se ven.** Moverlos sin querer
  cruzaría la puerta.

#### La atenuación: la misma mentira contada de tres formas

Esta es la parte que costó tres versiones, y las tres veces el fallo lo encontró
el usuario **escuchando**, no una prueba.

El problema real es de la plataforma: **YouTube Music entrega la música sin
ninguna holgura**, pegada al techo digital. Sobre material así, subir una banda
no cabe: hay que hacerle sitio bajando la entrada. Eso es física, no una opción.
Lo que se puede elegir mal —tres veces— es *cuánto* se baja y *qué se le cuenta
al usuario*.

**Versión 1: cobrar de más y llamarlo normal.** La preamplificación valía
`-(subida + 3)`. Ese `+3` era un colchón «por si acaso», y su consecuencia es que
la banda más alta acababa **siempre 3 dB por debajo** de donde estaba con el
ecualizador apagado, hiciera lo que hiciera el usuario. El ecualizador no podía
subir nada: sólo bajar el resto. Y el aviso de la página lo *justificaba* —«subir
los graves baja el volumen general»—, que es por lo que aguantó tanto: el texto
estaba defendiendo el fallo en vez de delatarlo. Lo tumbó una frase:

> «me parece curioso que apagado suena más fuerte que con esta configuración,
> ¿es normal?»

**Versión 2: no cobrar nada y esconder el peaje.** Se quitó la preamplificación
entera y se le fió el trabajo a un `DynamicsCompressorNode` con el umbral en
−1 dB, contándolo como un limitador que «sólo actúa cuando hace falta». Sonaba
mejor. El usuario volvió a decir lo mismo con otras palabras: *«no diría que
suena más fuerte particularmente»*.

Aquí ya no valía discutir de oído, así que se escribió
`tools/diagnostico-limitador.js`, que mide `DynamicsCompressorNode.reduction`
sobre la canción real. Tres canciones, tres géneros, seis vueltas. El resultado
fue unánime:

| fase | el limitador trabaja | cuánto recorta |
|---|---|---|
| «Más graves» | **85–100 %** del tiempo | 2,3–3,2 dB |
| «Plano», las cinco bandas a CERO | **63–99 %** del tiempo | — |

Las dos filas duelen, pero la segunda es peor: **«Plano» estaba comprimiendo**.
Con el umbral por debajo del propio material, un ajuste que promete no tocar nada
estaba aplastando la música todo el rato.

La conclusión fue que **no habíamos quitado la atenuación: la habíamos
escondido**. Los 3 dB fijos y visibles de la versión 1 se habían cambiado por
2–3 dB dinámicos, invisibles y con bombeo. El peaje viejo era peor de tamaño y
mejor de forma: al menos estaba escrito en la pantalla.

**El error, nombrado con precisión:** yo estaba usando la respuesta de una
pregunta para contestar otra. `margenDelLimitador()` contesta a *«¿cuánto puede
absorber sin que se escape nada por la salida?»* → 19 dB. La pregunta que decide
**cómo suena** es *«¿cuánto puede absorber sin empezar a trabajar?»*, y ésa la
contesta la holgura de la canción, que es **cero**.

**Versión 3: cobrar lo justo y decirlo.** El arreglo resultó ser un solo número.
Como `margenDelLimitador() = UMBRAL_DB × (1 − RATIO)`, poner el umbral en **0**
hace que el margen sea 0, y entonces `preamplificacion` pasa a cobrar la subida
del pico **entera y exacta**, sin tocarle una línea al cuerpo de la función. Las
dos correcciones que parecían distintas —«preamplificar de verdad» y «subir el
umbral para que el limitador vuelva a ser una red»— eran literalmente el mismo
cambio.

Medido después, en la página real:

| fase | el limitador trabaja |
|---|---|
| «Más graves» | **0 %** |
| lo mismo, pero sin preamplificar | **99 %** |

El limitador volvió a ser lo que tenía que ser: una red que está ahí y no toca
nada. (Dato honesto que salió de paso: «Plano» **todavía** recorta el 43 % del
tiempo, aunque sólo −0,6 dB de media. La música de esta plataforma llega tan al
tope que ni con el umbral en 0 dBFS se libra. A ese nivel es inaudible, pero no
es cero y no conviene decir que lo es.)

**Y el texto de la interfaz, que cambió con el arreglo.** No puede prometer
volumen. Sólo puede decir lo que cuesta:

> Todo el sonido baja 4 dB para dejar sitio a lo que has subido: eso es lo que
> cuesta. Un ecualizador reparte el sonido, no lo sube; para subir el volumen, el
> control del sistema.

*(Ésa es ya la cuarta redacción, y la única que no cambió por mentir: las tres
primeras hablaban de «la entrada», que es como se llama esto por dentro. Está
contado en «Los textos estaban escritos para el que los escribió».)*

#### El `-0` que rompe pruebas de forma desconcertante

Con el umbral a cero, `margenDelLimitador()` calcula `0 * (1 - 20)`, y eso en
coma flotante no da `0`: da **`-0`**. `Object.is(-0, 0)` es `false`, y
`assert.strictEqual` usa `Object.is`. Una prueba que comparaba contra cero
empezó a fallar enseñando `0 !== 0`.

Se arregló en los dos sitios, y de dos formas distintas a propósito:

- En `ecualizador.js`, un `+ 0` al final de la cuenta —con **su propia mutación**
  que lo borra, para que nadie lo quite pensando que es un adorno—.
- En la prueba, comprobando `preamplificacion(preset) + pico === 0` en vez de
  `preamp === -pico`. Esquiva el `-0` y, de paso, **dice mejor la propiedad**:
  que lo que sube el pico es exactamente lo que baja la entrada.

#### Un preset tiene dos números: lo que sube y lo que cuesta

«Más graves» se afinó tres veces, y las tres las pidió el oído del usuario.

| versión | ganancias | precio |
|---|---|---|
| 1.ª | `[8, 3, 0, 0, 1]` | **−11 dB** |
| 2.ª | `[7, 0, 0, 0, 1]` | **−7 dB** |
| 3.ª | `[0, 4, -6, -2, 1]` | **−4 dB** |

De la primera a la segunda: *«suena muy flojo con más graves, los otros se
escuchan bien»*. Los otros costaban 7 y 3, así que 7 era el presupuesto conocido.
Y al mirar de dónde salían esos 11 se veía que casi la mitad **no estaba
comprando graves**: el `+3` de 250 Hz es vecino del estante de 60 Hz, así que
además de sus 3 dB propios pagaba el solape. Tres de los once decibelios los
pagaba todo el mundo por una banda que no era la que se venía a buscar.

**La tercera la encontró el usuario a mano, y es mejor que las dos mías.** Su
curva tiene la banda de graves **en cero**: el preajuste que se llama «Más
graves» no sube los graves ni un decibelio. Se oyen más porque ha bajado lo que
competía con ellos —6 dB en medios, 2 en claridad—, y el grave, que sigue
exactamente donde estaba, pasa a ser lo más alto que hay.

Y por eso es el más barato: **bajar no cuesta nada.** El precio lo pone
`subidaDelPico`, que sólo mira lo que sube. Los −6 y los −2 son gratis; el pico
lo pone el +4 de 250 Hz, que además ya no tiene vecina subida y tampoco paga
solape.

> La moraleja, que vale para cualquier preajuste que se añada: cuando algo suena
> flojo, la reacción es subir la banda que se quiere oír, y ésa es justo la cara.
> Bajar sus competidoras da un resultado parecido y sale gratis.

Queda una deuda anotada en el código: el desplegable dice «Más graves» y esto es
más bien un escalonado. Suena a lo que promete, así que el nombre se queda, pero
el nombre y las ganancias ya no dicen lo mismo.

#### El instrumento también se rompió, y tres veces

`tools/diagnostico-limitador.js` es el que dio el veredicto, pero antes falló él.
Merece la pena porque los tres fallos son de familias distintas:

**1. `%c` sólo se interpreta en el primer argumento.** El ayudante `log()` ya
gastaba su `%c` en pintar la etiqueta `[limitador]`, así que cualquier `%c`
posterior salía **impreso como texto**. Las líneas escritas para destacar eran
las menos legibles de la consola. Se descubrió sólo porque el usuario pegó la
salida en crudo:

```
[limitador] %cLA PUERTA YA ESTABA CRUZADA. color:#f15a5a;font-weight:bold
```

**2. El `AudioContext` que se quedaba abierto.** Al chocar contra
`InvalidStateError` —el `<video>` ya estaba dentro de otro contexto—, el contexto
recién creado se quedaba huérfano. Chrome los limita por página, así que a la
sexta intentona el error habría cambiado y **habría dejado de mencionar la
puerta**, que era justo el dato. Un `ctx.close()` en la rama de error.

Y con él, la trampa que hizo perder el primer intento entero: para medir hay que
tener el ecualizador **apagado**, y en la lista de opciones «Apagado» y «Plano»
son vecinos. **«Plano» también cruza la puerta.** Ahora el propio error lo avisa.

**3. El peor: mi guarda invalidó tres mediciones buenas.** El resumen comparaba
las dos vueltas y, si el **nivel** se movía más de la cuenta, declaraba «LA
MEDIDA NO VALE». El usuario corrió el diagnóstico tres veces, con tres canciones
y tres géneros, y las tres se lo tiró.

Las tres eran válidas. El veredicto no se apoyaba en el nivel, se apoyaba en el
**porcentaje de tiempo activo** — y ése era estable (85–100 % en las seis
vueltas) mientras el nivel derivaba hasta 9 dB con la canción. Estaba guardando
una conclusión con el ruido de un número que no era el suyo.

> **Cada conclusión hay que guardarla con la dispersión del número en que se
> apoya.** Ahora se calculan dos, y cada afirmación mira la suya.

Fue un defecto de mi instrumento y costó tres vueltas del usuario. Está escrito
dentro del diagnóstico, con el mismo criterio que las dos mentiras de su
antecesor.

#### Las pruebas que se pusieron rojas por buenos motivos, y las que casi se quedan verdes por malos

Cambiar el umbral a 0 tumbó **cinco pruebas de golpe**, todas por la misma razón
estructural: la rama alcanzable se invirtió. Antes la preamplificación valía cero
en todo ajuste pedible con los mandos, así que las pruebas perturbaban `RATIO`
para *llegar* a la defensa; ahora la defensa está siempre viva y lo inalcanzable
es lo contrario, así que perturban `UMBRAL_DB`.

Dos archivos **no** se cayeron —`audio-grafo.test.js` y
`ecualizador-cable.test.js`— porque comparan contra `plan(...)` en vez de contra
números escritos a mano. Ese diseño se pagó solo ese día.

Lo interesante vino con el tercer preset. La curva del usuario deja la banda de
60 Hz en **cero**, y había dos pruebas de integración mirando **exactamente esa
banda**:

- Una comprobaba que las ganancias que llegan a los nodos «son las del preset, no
  ceros». Con `graves[0] === 0` habría comparado cero contra cero: **verde,
  comprobando la nada**, y ciega precisamente al fallo que existe para cazar.
- La otra comprobaba que cambiar de preajuste se oye sin esperar a la canción
  siguiente, midiendo el «antes» y el «después» de esa misma banda. Los dos
  valían 0: **verde aunque guardar no moviera nada**.

Las dos miran ahora las cinco bandas, y además afirman **por separado** la
premisa —que el preajuste toca algo, que el después es distinto del antes—. Una
comparación y su premisa son dos afirmaciones distintas y hacen falta las dos.

**Y una tercera, más tonta y más instructiva:** `deepStrictEqual` falló con el
mensaje *«same structure but are not reference-equal»* enseñando dos listas
idénticas una encima de otra. El preajuste vive dentro de la ventana de jsdom, o
sea que es un `Array` con **otro prototipo**. Se arregla con `Array.from`.

La lección general, que ya tiene nombre en este proyecto —*una regla duplicada en
dos archivos no es una regla, son dos*— se aplicó aquí a los **datos de prueba**:
cada número del preajuste escrito a mano en una prueba es una copia esperando a
quedarse atrás. Se cambiaron todos por lecturas de `EQUALIZER_PRESETS`.

#### Renunciar a algo para no duplicar suele significar que el dato está mal colocado

El botón 🎛 de la ventana flotante decía sólo «Ecualizador: encendido», nunca
cuál. Y estaba **razonado** en el código: los nombres que lee una persona
—«Más graves», «Voz»— vivían escritos en el desplegable de `options.html`, así
que copiarlos al PiP sería tenerlos en dos sitios.

El razonamiento era correcto y la conclusión estaba mal. Lo que había que
arreglar no era el botón: era que el **nombre de un preajuste viviera dentro del
HTML de una página**. Movido a `EQUALIZER_PRESET_LABELS`, no queda nada que
copiar — `options.js` lo escribe en el desplegable y `pip.js` lo lee para el
botón, que ahora dice «Ecualizador: Más graves».

Sigue siendo un **interruptor**, no una rueda: enciende y apaga, y al encender
vuelve al último ajuste. Pasar de preajuste en preajuste desde una ventana de
340 px le borraría los cinco números a quien los tenga puestos a mano, sin forma
de recuperarlos. Lo que ha cambiado no es lo que el botón hace, es lo que cuenta
de sí mismo.

Los cinco números a mano no tienen nombre que dar, y ahí el PiP sí escribe uno
propio —«ajuste propio»—. No es la copia de ninguna etiqueta: el desplegable lo
llama «A mi gusto» porque allí es una opción que se elige, y aquí es lo que hay
puesto.

#### Las barritas: cuando el nombre de un preajuste cuenta lo contrario

El botón ya decía **cómo se llama** lo que hay puesto. Petición siguiente:
*"algo más visible en la ventana, unas barritas o la curva"*. Y tenía más razón
de la que parece, porque el nombre de este preajuste en concreto **miente sin
querer**: «Más graves» tiene los 60 Hz **en cero**. No sube ningún grave; baja
lo que compite con ellos. Quien lea el nombre entiende una cosa y quien mire el
dibujo entiende la que es. Para unos números puestos a mano, además, no hay
nombre que dar: ahí el dibujo es lo único que puede contar qué hay.

**Barritas y no curva**, y no es una preferencia estética: hay **cinco** bandas,
no una respuesta continua. Una curva suave tendría que inventarse qué pasa entre
60 Hz y 250 Hz, y lo que hay entre esas dos frecuencias no es un dato del
programa, es una interpolación bonita. Las barras son exactamente lo que existe.
La raya del cero es la misma que se le puso a cada deslizador en Preferencias, a
propósito: dos superficies que enseñan lo mismo conviene que se parezcan.

Tres decisiones, y las tres son la misma clase de decisión —qué significa cada
cosa que se ve—:

- **Las barras las crea `pip.js`, no el HTML.** Escribir cinco `<span>` a mano
  sería escribir el número de bandas por segunda vez. (En `options.html` sí
  están a mano, y allí hay un motivo que aquí no existe: cada `<label>` necesita
  apuntar al `id` de su deslizador.)
- **Apagado no dibuja plano: se esconde.** Cinco barras a cero y ninguna barra
  se ven casi igual y significan lo contrario — «plano» cruza la puerta de
  `createMediaElementSource` y «off» no la cruza.
- **Una banda a cero sigue teniendo barra**, pegada a la raya. Es el caso del
  preajuste de fábrica: sin eso se vería con cuatro barras y un agujero, y un
  agujero se lee como «aquí no hay banda», que no es «esta banda está plana».

Y una trampa que no da ningún error. El atributo `hidden` esconde porque la hoja
del navegador trae `[hidden] { display: none }`, pero **cualquier regla de autor
con el mismo peso le gana por venir después** — y `.ytmpip-eq-bandas { display:
flex }` lo tiene. Sin una regla que lo desactive a mano, `caja.hidden = true`
pondría el atributo, la prueba que mira el atributo seguiría verde, y las barras
se quedarían a la vista con el ecualizador apagado.

**Aquí me equivoqué, y la corrección es más interesante que el acierto.** Al
añadir las barritas escribí una regla nueva, `.ytmpip-eq-bandas[hidden] { display:
none }`, con un comentario al lado explicando por qué hacía falta. Era **código
muerto**: `pip.css` ya trae, desde mucho antes, un `[hidden] { display: none
!important }` global que cubre todo el archivo con `!important`, y el `!important`
es justo lo que hace que gane. Mi regla no cambiaba nada y su comentario afirmaba
lo contrario de lo que ocurría en el archivo.

Peor: la mutación que yo había escrito para «proteger» esa regla **moría**, lo cual
la daba por buena. Moría contra una prueba que lee el CSS como **texto**, así que
lo único que demostraba era que el texto seguía ahí — y el texto no hacía nada.
Ésa es la lección que quedó escrita en `tools/mutar-mandos.js`: *una mutación que
muere contra una prueba de texto sólo demuestra que el texto sigue ahí*. Ahora la
regla borrada, el `[hidden]` global documentado, la prueba apuntando a él y la
mutación quitándole el `!important`, que es la mitad que de verdad sostiene el
peso. Sigue siendo una prueba de texto, y también está dicho.

Lo que no se prueba, y no por olvido: que **quepa**. Es lo primero que ensancha
la fila de extras desde que entró el botón del ecualizador, hay `flex-wrap`
puesto, y jsdom no maqueta. Eso se mira en `tools/vista-previa.html`. Y en los
tamaños compacto, *tight* y mini la fila entera está en `display: none`, así que
allí no hay barritas — ni botón: el ecualizador vive entero en esa fila.

Una prueba de aquí es rara y merece explicarse: **comprueba un comentario**. El
código mira el *número* de barras ya dibujadas, no si hay alguna, y el comentario
promete que por eso una sexta banda reconstruiría el dibujo. Escrito y nada más,
ese `!==` se podía cambiar por un `=== 0` sin que se enterara nadie, porque hoy
se comportan igual. Una promesa que ninguna prueba sostiene se rompe justo el día
que hace falta, que es el día en que nadie está mirando ese archivo.

#### El panel de Preferencias: lo que se pliega y lo que no

La sección del ecualizador acumulaba once líneas de letra pequeña **antes** del
primer mando, y el efecto de eso no es que se lean: es que se deje de leer
también el único aviso que cambia, el del precio, que está abajo del todo.

- **Arriba, sin plegar, una sola línea**: la que avisa de algo irreversible.
  Es la única que no se puede permitir que nadie se salte.
- **Lo demás, dentro de un `<details>` cerrado**, titulado con la pregunta que la
  gente se hace de verdad: *«¿Por qué al subir una banda suena más flojo?»*.
  Plegado, no borrado: lo que sobra no es la información, es que ocupe media
  sección para siempre.
- **Una raya vertical en el centro de cada deslizador.** Los mandos van de −12 a
  +12 y el cero está en el centro exacto, pero el control nativo no lo marca: con
  las cinco bandas puestas se veían cinco puntos a alturas distintas sin ninguna
  referencia. La forma del conjunto —qué sube y qué baja— *es* el dato de un
  ecualizador, y sin la línea del cero esa forma no se lee.
- **El aviso del precio, fuera del gris.** Era un `.pista` más, con el mismo
  aspecto que los párrafos fijos que nadie relee, y es lo único de la página que
  se mueve al tocar un mando. Ahora lleva fondo propio y una barra de color a la
  izquierda, que es lo que significa: consecuencia de lo de arriba.

Lo único de la maquetación que se puede comprobar gratis —y que falla en
silencio— es una regla de CSS escrita para una clase que la página no usa:
`.ytmpip-banda` frente a `.ytmpip-bandas` es una `s`, y equivocarse no da ningún
error, sólo deja los mandos con el aspecto de fábrica. Esa prueba existe, y con
estos cambios **tuvo dos falsos positivos** que se arreglaron en el guardián y no
bajando la guardia: `querySelectorAll(".x::before")` devuelve cero *siempre*
—un pseudoelemento no es un nodo—, y `[open]` no casaba con nada porque el
`<details>` nace cerrado. Ahora se le quita el `::loquesea` al selector y se
abren todos los `<details>` antes de comprobar, en vez de perdonar los dos
selectores por su nombre —que dejaría pasar un `[opne]` mal escrito—.

#### Dos avisos del mutador que no eran del ecualizador

Al pasar `tools/mutar-mandos.js` sobre todo esto salieron dos cosas, y ninguna
tenía que ver con el rediseño.

**Una mutación viva.** El bucle que escribe los nombres en el desplegable
termina en `etiqueta || opcion.value`: si algún día un preajuste se queda sin
nombre, la lista enseña su clave —«nocturno», feo pero elegible— en vez de una
fila en blanco, que es un preajuste imposible de nombrar al pedir ayuda. Ese
`|| opcion.value` se podía **borrar entero sin poner roja ni una prueba**, y con
razón: hoy no falta ningún nombre. Probarlo pedía una rendija en el banco de
pruebas —cargar las constantes, quitarle un nombre, y sólo entonces cargar
`options.js`— y ahora hay dos pruebas ahí: una dice que cada opción se lee con
lo que dice `constants.js` *y que no sale muda* (sin esa segunda mitad la
comparación sería entre dos vacíos), y la otra quita un nombre a propósito.

**Y una mutación que había dejado de ser equivalente.** Estaba marcada a mano
como imposible de matar, con su párrafo explicando por qué: `clavesEcualizador`
normaliza el valor antes de guardarlo, y los dos únicos caminos que llegaban
allí —el desplegable y los deslizadores— traían el valor ya canónico. Era
cierto **cuando se escribió**. Lo que abrió un tercer camino fue el interruptor
del PiP: ese botón se pulsa con lo que hubiera en storage, incluida basura de
una versión vieja, y ahí el valor llega sin normalizar.

Es la lectura que se le suele dar del revés a una mutación equivalente. No dice
«aquí sobra código»: dice **«aquí todavía no hay ningún camino que lo
ejercite»**. La línea llevaba meses siendo una garantía sin uso, y en cuanto
apareció el uso pasó a ser lo único que impide guardar una cosa y oír otra.

#### La carátula late con los graves

Petición aprobada de la lista: que la portada *palpite* con el bombo. Parecía la
más barata de las cuatro pendientes —el espectro ya captura el audio, así que
sólo había que leerlo distinto— y en lo grande lo fue. Lo que no era barato es
que **el analizador que ya existía no puede ver los graves.**

La aritmética no deja margen: el espectro usa `fftSize = 256`, o sea 128 bandas
repartidas entre 0 y 22.050 Hz. Eso son **172 Hz por banda**. El rango de graves
entero (20–120 Hz) cabe dentro de la **banda 0**… que es además la componente
continua, el valor medio de la señal, que no es sonido. Pedirle el bombo a ese
analizador es pedirle un número que no tiene.

La salida fácil era subirle el `fftSize` al analizador de las barras, y está
descartada a propósito: el reparto logarítmico de las barras se calcula sobre
cuántas bandas haya, así que cambiar ese número **reagrupa todas las barras** y
cambia un dibujo que nadie pidió tocar. En su lugar hay un **segundo
`AnalyserNode` colgado del mismo `MediaStreamSource`**, con `fftSize = 2048`:
1024 bandas, **21,5 Hz cada una**, y los graves caen en las bandas 1–6. Un
analizador más sobre la misma fuente no cuesta una captura nueva ni toca la
reproducción; los dos efectos comparten un único grafo y el `AudioContext` sólo
se suelta cuando **ninguno** de los dos lo quiere.

Dos detalles heredados del diagnóstico del ecualizador, y por los mismos motivos:

- **`getFloatFrequencyData`, no `getByte…`**. Los bytes reparten `[-100, -30] dB`
  en 256 pasos y **aplastan contra el 255 todo lo que supere -30 dB**. Los graves
  de una canción masterizada viven por encima de ese techo: con bytes, justo las
  canciones que más pegan darían una línea plana.
- **`smoothingTimeConstant = 0`** en el analizador de graves (el de las barras se
  queda en 0,5). Suavizar mezcla cada lectura con la anterior, que es lo que hace
  bonito un dibujo y lo que **borra** un golpe cuando lo que se quiere medir es
  precisamente el cambio.

**Un golpe es algo relativo.** No hay un nivel de decibelios que signifique
"bombo": lo hay en una canción y no en la siguiente. Lo que se mide es *estar por
encima de lo que se ha estado últimamente*, contra una referencia que persigue al
nivel actual con constante de **1,5 s**; `GOLPE_DB = 9` dB por encima de esa
referencia es un pulso entero. Subir es inmediato (un golpe no espera a que caiga
el anterior) y bajar tarda **250 ms**, que es lo que separa un latido de un
parpadeo. La adaptación se mide **en milisegundos reales, no en fotogramas**
(`alfaPara(ms, msAdaptacion)`), o una pantalla de 120 Hz latiría al doble de
velocidad que una de 60. Y ese alfa se acota a 1: tras un parón largo la
referencia **salta** al presente en vez de inventarse un golpe al volver.

**El JS mide, el CSS decide cuánto se nota.** Lo único que publica el código es
`--ytmpip-pulse`, un número de 0 a 1; el tamaño vive en `--ytmpip-pulse-strength:
0.06` dentro de `pip.css`, y `prefers-reduced-motion` lo pone a cero **sin que el
JavaScript se entere**. El crecimiento es `transform: scale()`, no `width`: así no
hay reflujo y la portada puede cambiar de tamaño 60 veces por segundo sin mover
el título, los controles ni la letra.

Un detalle de nombres que costó una corrección: **«latido» ya estaba cogido**. Es
como se llama desde hace tiempo el tic de 300 ms que repara la barra de progreso
(`pip-latido.test.js`). Esta función se llama **«pulso»** en todo el código por
eso. El renombrado por expresión regular alcanzó de rebote seis comentarios sobre
el tic de la barra y los convirtió en «pulso» —justo la ambigüedad que el nombre
venía a evitar—; están restaurados a mano.

**Lo que la verificación por mutación encontró no fue un fallo del código, fueron
dos redes de más y un doble falso.** El doble falso: el analizador de mentira de
las pruebas rellenaba **todas** las bandas con el mismo número e ignoraba el
suavizado, así que subir el `fftSize`, mover la banda de graves o suavizar antes
de medir eran cambios *invisibles* para el banco —tres mutaciones vivas—. Con un
doble que sabe a qué frecuencia corresponde cada banda y mezcla con el fotograma
anterior, las tres mueren. Las dos redes:

- `Math.min(valores.length - 1, …)` al elegir la última banda: **no puede cambiar
  el resultado** (leer fuera de un `Float32Array` da `undefined`, que el filtro de
  abajo descarta igual). Se queda porque acota **el bucle**, y está marcada como
  superviviente deliberada en `tools/mutar-pulso.js` en vez de fingir una prueba
  que la proteja.
- `Math.max(0, ahora - msUltimo)`: esa era la **misma regla escrita por tercera
  vez**. Los dos únicos sitios que usan ese hueco ya preguntan si es mayor que
  cero, porque tienen que tratar el primer fotograma de todas formas. **Se
  borró**, y en su lugar hay dos mutaciones contra las guardas que sí sostienen
  algo. Una regla duplicada en dos archivos no es una regla, son dos.

Y una equivocación mía en las pruebas que merece quedar escrita: varias empezaban
en `ms = 0`, y como el hueco anterior se guarda inicializado a 0, la **segunda**
lectura también veía "cero tiempo" y la referencia saltaba entera. Estaban pasando
por un camino degenerado al que un reloj de `requestAnimationFrame` real —que
cuenta desde que se cargó la página— no llega nunca. Ahora todas arrancan en un
`T0` que no es cero.

Lo que ningún número dice es si **queda bien**. Para eso está
`tools/diagnostico-pulso.js`, que hay que correr en `music.youtube.com` con una
canción de graves; el veredicto final es mirarlo.

##### El diagnóstico rompía lo que estaba midiendo

Primera medición real, una salsa con el bombo marcado. El veredicto: «los números
dan un pulso usable», tres preguntas contestadas que sí. El usuario, mirándolo:
*"funciona, no se ve tan bien pero sí funciona"*.

En el informe había un número que decía la verdad y que nadie miró:

```
fotogramas: 483 (312 en silencio)
```

**Dos de cada tres fotogramas no traían dato.** Y eso no es "suena bajito":
`getFloatFrequencyData` sólo devuelve `-Infinity` cuando la magnitud es cero, o
sea con el búfer entero a ceros mientras la canción suena. Eran agujeros.

Ahí se explicaba también el reparto que parecía un pulso flojo —76 % del tiempo
por debajo de 0,2—: casi todo ese 76 % **eran los agujeros**, no un efecto tímido.
Cada racha muda le resta al pulso 1 por cada 250 ms, así que se lo lleva por
delante. El arreglo intuitivo —bajar `GOLPE_DB`— habría sido subirle el volumen a
una señal que lo que tenía eran cortes.

La causa resultó ser **el propio instrumento**. El diagnóstico abre su propia
`captureStream()` del mismo `<video>` que ya estaba capturando la extensión, y las
dos se estorban. Apagando el pulso y el espectro en la ventana flotante y
repitiendo la medida:

| | con la extensión midiendo | con la extensión apagada |
|---|---|---|
| fotogramas sin dato | 312 de 483 (**64,6 %**) | 6 de 476 (**1,3 %**) |
| reparto del pulso | 76 % pegado a cero | 30/21/23/15/11 % |
| golpes por minuto | 45 | 142 |

Los 6 fotogramas que quedan son una sola racha al arrancar, mientras el FFT llena
sus 2048 muestras. **La medición estaba sana; el que la rompía era el que la
tomaba.**

Esta es la tercera vez que un diagnóstico de este proyecto miente, y las tres
veces por un motivo distinto: primero un umbral imposible de aprobar (la regla del
15 % sobre bytes), después un listón absoluto donde hacía falta comparar dos
bandas, y ahora **un instrumento que perturba lo que mide**. Las dos primeras eran
errores de aritmética; ésta es de método, y no se ve leyendo el código: sólo
aparece cambiando una condición del experimento.

El archivo lleva ahora las dos defensas que le faltaban. Cuenta los huecos como
resultado de primera clase —cuántos, en cuántas rachas, la más larga—, imprime el
reparto **dos veces** (sobre todos los fotogramas y sólo sobre los que traen dato,
que es lo que separa "pulso flojo" de "medida rota") y, si falta más del 10 %,
**se niega a dictaminar** y explica cómo descartar que el culpable sea él mismo.
De paso, el listón de «el pulso casi no despega» estaba en el 95 %: por eso dejó
pasar como bueno un 76 %. Ahora está en el 85 % y se mide sobre los fotogramas con
dato.

##### Lo que de verdad se veía mal: era la forma, no el tamaño

Con la medida limpia, el reparto es éste:

```
0,0-0,2: 30,5 %   0,2-0,4: 20,6 %   0,4-0,6: 22,7 %
0,6-0,8: 15,1 %   0,8-1,0: 11,1 %      valor medio: 0,41
```

Sano para medir, y sin embargo ahí está la respuesta al *"no se ve tan bien"*: la
carátula pasaba **el 70 % del tiempo por encima de 0,2**. No descansaba nunca,
siempre a un tamaño intermedio. Eso no se ve como un latido, se ve como una
vibración continua. Y subirle la amplitud —que era el arreglo que yo tenía
preparado— sólo habría dado un temblor más grande.

Lo que le faltaba no era tamaño, era **forma**. El número se multiplica ahora por
sí mismo en `pip.css`, con la fuerza subida al 10 %: la parte baja del recorrido
se aplasta y la alta se queda entera. Medido en la vista previa, sobre una
carátula de 191 px:

| pulso | escala | crecimiento |
|---|---|---|
| 0,2 | 1,004 | 0,8 px — reposo invisible |
| 0,4 | 1,016 | 3 px |
| 0,6 | 1,036 | 7 px |
| 0,8 | 1,064 | 12 px |
| 1,0 | 1,100 | 19 px — golpe inconfundible |

Con el reparto de arriba, la mitad del tiempo queda por debajo del 2 % —que es lo
que debe ser el reposo— y el 11 % de los fotogramas conserva el golpe entero.

Va en la hoja de estilos y no en el analizador por lo de siempre: el módulo de
audio contesta *cuánto golpe hay* y esa respuesta es verdad tal cual; **cómo de
brusca se quiere la respuesta es una decisión de aspecto**. Eso obligó a comprobar
una cosa más, porque el cambio creaba un riesgo que antes no existía: hasta ahora
`prefers-reduced-motion` ponía la fuerza a cero contra un *valor por defecto*, y
ahora tiene que ganarle a una declaración real con la misma especificidad. Lo
decide el orden en el archivo, así que está verificado leyendo el CSSOM (regla 25
frente a regla 26: gana la de movimiento reducido), y no de memoria.

Verificado también en las **18 configuraciones** de la vista previa que el
crecimiento no rompe ninguna maquetación: el `overflow: hidden` del escenario lo
contiene en todas, desde 4 px en la ventana más pequeña hasta 32 px en la mayor.
Crece hacia dentro, no empuja.

##### El pulso también late con el vídeo

Preguntado si el pulso podía valer también para el vídeo. Sí, y **casi gratis**,
que es la parte que merece explicarse: el número ya estaba publicado en
`#ytmpip-root` como `--ytmpip-pulse`, así que cualquier descendiente puede leerlo.
No hay un segundo analizador, ni una segunda FFT, ni un `AudioContext` más. La
medida es la misma; lo único que cambia es **quién la lee**.

Lo que había en `pip.js` era esto, con su motivo escrito al lado:

```js
pulsoActivo = conectado && pulsoPedido && !videoMode;
// "el pulso solo tiene sentido sobre una PORTADA; en modo video la caratula
//  esta en display:none, asi que escalarla no se ve"
```

La primera mitad era una **suposición** y la segunda era verdad. Cierto que
escalar una carátula escondida detrás del vídeo no se ve; falso que no hubiera
nada que hacer latir: en modo vídeo el escenario está ocupado por el vídeo, y
escalar **ese** sí se ve. El arreglo no añade nada a esta línea, le quita la
condición.

Tres decisiones que no son obvias:

- **Se escala `.ytmpip-video-slot`, no el `<video>`.** El `<video>` es el elemento
  real de YouTube Music tomado prestado, con estilos en línea que hay que
  devolverle tal cual estaban. Al hueco —un `<div>` nuestro— se le puede hacer lo
  que se quiera. `transform: scale()` además no reflowea, cosa que importa más con
  vídeo que con una imagen.
- **Una sola regla para los dos**, con la única diferencia metida en una variable
  (`--ytmpip-pulse-strength`). La curva es una: si el `calc` se copiara a un
  segundo selector, afinarla más adelante significaría acordarse de dos sitios, y
  ésa es la regla que este proyecto persigue desde el principio.
- **El vídeo late menos: 0,06 contra 0,1.** La carátula entra con `object-fit:
  cover` —ya viene recortada—, así que crecer un 10 % se come borde de portada. El
  vídeo entra con `contain`, o sea que se ve **entero**, y en modo superpuesto
  ocupa la ventana de lado a lado: ahí el mismo 10 % recorta cara, letra
  sobreimpresa o créditos. **Esto es un juicio, no una medición**, y conviene
  decirlo: el 0,1 de la carátula salió del reparto que midió
  `tools/diagnostico-pulso.js`, pero eso midió la *señal*, que es idéntica para
  los dos. Cuánto recorte tolera un vídeo no lo mide esa herramienta ni ninguna
  otra de aquí. Si al usarlo se queda corto o largo, el número a mover es ése y
  sólo ése.

Lo que **sigue** apagando el pulso es la letra en grande, y por un motivo distinto:
con la letra ocupando el escenario no hay ni carátula ni vídeo a la vista, y ahí la
FFT por fotograma sí sería para nadie. Esa condición vive en `alguienQuiere`, no en
`pulsoActivo`, y tiene mutación propia para que no se borre de paso.

De rebote, la etiqueta del botón: decía **«Pulso de la carátula»** mientras hacía
latir un videoclip. Ahora dice «la imagen». Se descartó la salida fácil —cambiar el
texto según `videoMode`, que está ahí mismo y salía gratis— porque el botón pasaría
a decir dos cosas distintas según la canción, y lo que hace es una. **Vago y cierto
antes que preciso y cambiante.** Hay una prueba que lo comprueba en los dos estados
y en el HTML, porque una etiqueta que cuenta lo contrario de lo que pasa es peor que
una vaga, y quien va con lector de pantalla no tiene otra cosa que leer.

**Lo que no se puede verificar aquí**: si 0,06 es la cantidad correcta. jsdom no
maqueta, así que las pruebas comprueban que la regla existe, que el hueco del vídeo
está dentro, y que su fuerza es **menor** que la de la carátula —el sentido de la
decisión— pero no el número. Se ve o no se ve mirándolo.

### El menú estaba plano, y el motivo no era el color

El menú de la barra (el *popup*) llevaba desde el principio sin tocar y sin una
sola prueba. La queja fue *"se ve muy plano, nada atractivo"*, y la tentación
inmediata es subirle contrastes y redondear esquinas. El diagnóstico de fondo era
otro: **el menú no tenía nada de la canción salvo dos líneas de texto de 12 px**.
Una carátula de 48 px, un título y un artista del mismo peso, y tres botones
cuadrados idénticos. No es que estuviera mal pintado; es que no había nada que
pintar.

Lo que se le puso:

- **La carátula difuminada de fondo**, la misma idea que en la ventana flotante,
  con su velo degradado encima. Hace dos cosas a la vez: da profundidad —hay algo
  detrás, así que las superficies se ven como superficies— y hace que **el menú
  cambie con la música**, que es de lo que va la extensión. Sin canción se queda
  vacío y vuelve al color plano, que es lo correcto: no hay nada que enseñar.
- **Jerarquía en los tres botones.** Eran tres cuadrados grises del mismo tamaño,
  o sea una jerarquía plana: el menú no decía cuál es el botón que se viene a
  pulsar. Reproducir/pausar es redondo, más grande y del color de acento; anterior
  y siguiente se quedan de acompañamiento.
- **Un punto de estado** junto a la frase de «Conectado a YouTube Music». La frase
  contesta la primera pregunta del menú —*¿me está viendo YouTube Music?*— y era la
  línea que menos se veía, en gris de 11 px. Un color se lee antes que una palabra.
  Va en **verde y no en el rojo de acento**: el acento marca lo *pulsable* en toda
  la extensión, y darle además el significado de «conectado» le pondría dos
  sentidos al mismo color. Y no va solo: al lado sigue la frase, porque un estado
  contado únicamente con color no lo lee quien no distingue ese color, y el punto
  mide 8 px. Por eso mismo el punto es `aria-hidden`: duplicaría lo que ya se dice.

#### Dos fallos que llevaban ahí desde el principio

Ninguno de los dos se ve en una captura, ninguno lanza un error en consola, y los
dos salieron al escribirle las primeras pruebas:

1. **`els.artwork.src = state.artworkUrl || ""`.** La cadena vacía no significa
   «sin imagen»: un `src` vacío **se resuelve contra la URL de la página**, así que
   el navegador se pedía `popup.html` a sí mismo como si fuera un PNG y pintaba el
   icono de imagen rota. Se ve justo cuando el menú se abre sin canción, que es la
   primera vez que se abre. Ahora se pone la misma carátula de reserva que usa la
   ventana flotante, y **antes** del primer estado además: el `<img>` nacía sin
   `src` y hasta que contestaba la pestaña se veía el icono roto. Es un parpadeo
   corto, pero es el primer fotograma del menú **cada vez** que se abre.
2. **`disabled` en un botón de cuatro, y sin ninguna regla en la hoja.** Sin
   YouTube Music abierto se apagaba sólo «Abrir ventana flotante». Los tres del
   transporte seguían encendidos, respondían al clic y mandaban un comando a
   ninguna parte: el usuario pulsa «siguiente», no pasa nada, y no hay forma de
   saber si ha fallado él, la extensión o la canción. Y aun apagándolos, en
   `popup.css` **no había ninguna regla para `:disabled`**: el navegador sí impide
   el clic, lo que faltaba era *contarlo*. Un botón que ignora los clics con la
   misma pinta que uno que los atiende es peor que no tener botón. Ahora hay
   opacidad, `cursor: not-allowed` —la opacidad sola se confunde con «todavía está
   cargando»— y los `:hover` llevan `:not(:disabled)`, porque iluminar un botón
   muerto al pasar por encima es la señal contraria a la que se acaba de dar.

#### Por qué `popup.css` se parece tanto a `pip.css`

Los nombres y los valores son los mismos a propósito: el menú y la ventana flotante
se abren desde el mismo icono y se ven casi seguidos, así que si uno usara gris
opaco y el otro blanco translúcido parecerían dos programas.

**Esta copia no es la regla duplicada que este proyecto persigue**, y conviene
decirlo porque la frase se parece mucho a la excusa que suele preceder a una: son
dos **documentos** distintos, con dos hojas de estilo, y no hay forma de que el menú
cargue la de la ventana flotante —ni siquiera importándola, porque `pip.css` da por
hecho un `#ytmpip-root` a pantalla completa con escenario, letra y mandos, nada de
lo cual existe allí—. Lo que sí sería duplicar de verdad, y no se hace, es el
**dibujo** de los iconos: salen los dos de `shared/iconos.js`.

Lo que no se ha traído: **el tema claro**. La ventana flotante lo cambia porque lo
guardan las preferencias; el menú no lee preferencias, y hacérselas leer por un
color significaría un `chrome.storage` asíncrono y el menú parpadeando de blanco a
negro al abrirse. Se queda oscuro.

**Queda a ojo**: si con una carátula muy clara el velo degradado basta para que el
texto blanco siga legible. Se eligió el degradado precisamente por eso —media
discografía tiene la portada blanca— pero jsdom no resuelve la cascada y ninguna
prueba de aquí puede contestarlo.

### La página de Preferencias: el mismo negro, el mismo orden

El rediseño del menú se hizo leyendo *"la visual del menú"* como el *popup* de la
barra. Lo era, en parte —el propio `popup.html` se llama a sí mismo «el menú» en su
comentario—, pero la queja apuntaba **también** a la página de Preferencias:
*"lo único que vi que no cambiaste fue la visual de la extensión, sigue siendo negra
y el mismo orden"*. Con la captura delante no había ambigüedad. Es la tercera vez
que este proyecto anota lo mismo: **la descripción del usuario era literal y la
interpretación la puso el que leía.**

Lo que había era una **columna de 420 px**: `label` en bloque, `input` y `select` al
100 % de ancho, todo apilado, `<h2>` separados por una raya. Veintitantas filas
idénticas sin jerarquía, en las que buscar «el tamaño de la ventana» costaba lo
mismo que leerlas todas. Lo que se cambió:

- **Tarjetas por tema y un orden nuevo.** *La ventana flotante* (tamaño, colores,
  qué muestra al abrirse, difuminado), *Mientras suena la música* (vídeo, letra,
  salto de los botones), *Ecualizador* y *Barras de sonido*. Antes lo primero de la
  página eran los segundos de salto y el tamaño de la ventana estaba suelto entre
  ellos.
- **Cada ajuste es una fila**: nombre y explicación a la izquierda, mando a la
  derecha. Los desplegables llevan todos el mismo ancho, así que caen en una
  columna: se ve cuántas decisiones hay sin leer ninguna.
- **El acento pasa de `#ff0033` a `#f15a5a`**, que es el del menú y el de la
  ventana. Eran **dos rojos distintos a un clic de distancia**, cada uno escrito en
  su archivo. Es la regla duplicada de siempre en forma de color, y como los tres
  documentos no pueden compartir hoja, lo que se ha puesto es una prueba de texto
  que compara el `--accent` de la página con el `--ytmpip-accent` de `pip.css`: la
  copia se queda, lo que no se queda es que pueda separarse en silencio.
- **El aviso de que el ecualizador no se deshace** ya no es letra gris entre letra
  gris: lleva marco de color. Es lo único de la página que conviene leer *antes* de
  tocar el mando que tiene debajo.
- **El «Guardado.» flota abajo.** Era un párrafo al final de la página, o sea el
  peor sitio posible: los ajustes se guardan solos y el aviso dura segundo y medio,
  así que quien cambiaba el tamaño de la ventana —arriba del todo— **no llegaba a
  verlo nunca**. Confirmar algo fuera de la pantalla es no confirmarlo. No hizo
  falta tocar `options.js`: se apaga solo con `#status:empty`.
- **Las unidades salen fuera del nombre** (`seg`, `%`). «Altura, en % de la ventana»
  era un nombre con una nota a pie metida dentro.

#### Dos filas que son una etiqueta, y por qué

«Cuántas barras» y «Tu color» aparecen y desaparecen según lo que se elija arriba, y
`options.js` los esconde por su id: pone `hidden` en la etiqueta y en el campo, que
son los dos únicos elementos que conoce. Mientras la página fue una columna de
mandos sueltos eso bastaba. Con las filas ya no: si la etiqueta y el campo viven
**dentro** de un contenedor de fila, esconderlos deja la fila puesta —su raya, su
relleno y su hueco separando nada—. No es un error de nadie y no sale por consola.

La solución no fue enseñarle a `options.js` un tercer id, sino que **la fila sea la
etiqueta**: un `<label>` puede contener su propio campo. Hay una prueba que lo fija,
porque es justo lo que un futuro *«voy a dejar todas las filas iguales»* desharía
sin enterarse.

#### Los textos estaban escritos para el que los escribió

La otra mitad de la queja: *"la descripción que pusiste la dejaste como para verla
yo, que soy el editor; ajústalo para público, más para usuario que para
desarrollador"*. Y era verdad de arriba abajo. «Velocidad de caída (1 lenta — 60
brusca)» es el nombre de un parámetro; «Cómo bajan las barras · con 1 caen despacio
y se ven suaves, con 60 se desploman a cada golpe» es lo que hace. «Se enciende con
el botón 📊 de la ventana flotante; aquí sólo se decide cómo se ve» describe el
reparto de responsabilidades entre dos archivos.

El caso más claro es el aviso del ecualizador, que ya había cambiado dos veces por
mentir y ahora ha cambiado una tercera **sin mentir**: decía *«La entrada baja 11
dB…»*. «La entrada» es como se llama esto por dentro; no es algo que exista para
quien está oyendo música. Ahora dice *«Todo el sonido baja 11 dB para dejar sitio a
lo que has subido»*. Lo que se cuenta es lo mismo —el precio, con su número, sin
prometer volumen—; lo que cambia es quién lo entiende.

Eso obligó a aflojar dos comprobaciones que citaban las frases enteras, y conviene
decirlo porque aflojar una prueba es sospechoso por defecto: ahora se comprueba lo
que el aviso tiene que **contestar** (cuánto cuesta, sin signo, y dónde está el
volumen de verdad) en vez de las palabras con las que hoy lo contesta. Lo que sí se
sigue citando entero es lo que **no puede volver a decir** —«volumen general», «sólo
actúa cuando hace falta»—, porque ahí la palabra exacta era el fallo.

**Queda a ojo**: si las tarjetas de 620 px se leen bien en la ventana de
preferencias de Chrome, que no es una pestaña completa. jsdom no maqueta y ninguna
prueba de aquí puede contestarlo.

### Autoajuste: la maquetación depende del tamaño real, no de la preferencia

La ventana la puede redimensionar el usuario en cualquier momento, así que decidir
la maquetación a partir de la preferencia de tamaño (`compact` / `expanded`) estaba
mal de raíz: arrastrar la esquina no cambiaba nada y el contenido acababa saliéndose.
Ahora un `ResizeObserver` mide el alto y el ancho **reales** y `applyDensity()`
traduce esa medida a tres niveles (`PIP_BREAKPOINTS` en `src/shared/constants.js`):

| Nivel    | Cuándo             | Qué desaparece                                     |
| -------- | ------------------ | -------------------------------------------------- |
| `tight`  | alto < 400 px      | álbum y fila de extras                             |
| `mini`   | alto < 310 px      | lo anterior + acciones secundarias y panel de letras |
| `narrow` | ancho < 290 px     | etiquetas de tiempo y texto de estado              |

El orden no es arbitrario: primero lo que repite información que ya está en pantalla
(el álbum), luego lo accesorio, y **nunca** portada/vídeo, título, barra de progreso
y transporte, que son la razón de ser de la ventana. Ancho y alto se deciden por
separado, para que una ventana estrecha pero alta no pierda los extras.

Con vídeo el orden se invierte: **manda la imagen**. En un videoclip el título es
información que el propio vídeo ya está dando, así que al escasear el alto lo que
cede es el texto (primero el álbum, luego el artista, y el título se queda en una
línea). Por debajo del nivel `mini` se pasa a **controles superpuestos**: el vídeo
ocupa la ventana entera y la barra y el transporte flotan encima sobre un degradado.
Repartir 300 px de alto entre texto y vídeo deja las dos cosas inservibles;
apilarlos deja el vídeo útil y los controles a mano.

Debajo de eso hay una regla más simple que resultó ser la importante: **lo que cede
sitio es siempre la imagen, nunca los controles**. Los dos fallos de maquetación que
ha habido eran el mismo error en dos sitios distintos — algo con altura rígida
empujando la fila de controles fuera de un `body` con `overflow: hidden`. En columna
era un `aspect-ratio` que hacía que el alto lo dictase el ancho; en la fila compacta,
una portada clavada a 56 px con el cuerpo en `flex: 0 0 auto`. Ambas piezas son ahora
elásticas (`flex: 1 1 0` + `min-height: 0`), así que no hay altura mínima por debajo
de la cual se corte nada.

La ventana solo se redimensiona **sola** una vez, al aparecer el primer vídeo. A
partir de ahí manda el tamaño que haya elegido el usuario y lo único que se adapta es
el contenido.

Es maquetación, y eso no lo cubren las pruebas unitarias. Lo que sí está aislado y
probado son las dos decisiones puras: `densityFor()` (umbrales, exclusividad de
`mini`/`tight`, límites exactos) y `layoutFor()` (que nunca se activen dos
maquetaciones a la vez, y que con vídeo no se caiga en la miniatura de 56 px). Que
nada se salga por abajo se comprobó rindiendo el CSS real a **520 tamaños** distintos
con y sin vídeo, de 110×220 a 620×560, verificando además con `elementFromPoint` que
el degradado superpuesto no le roba los clics a ningún botón (ver `tools/`).

### Estado que se muestra y estado que no

"Me gusta" se lee del atributo `like-status` del renderer (`LIKE` / `DISLIKE` /
`INDIFFERENT`): es independiente del idioma, así que se refleja con confianza.

**Aleatorio** no tiene equivalente: nadie expone su estado. El adaptador devuelve
`undefined` y la ventana flotante se abstiene de pintar el botón como activo. Es una
decisión deliberada: preferimos no mostrar estado a mostrar uno inventado que además
no cambiaría al pulsar.

**Repetir** sí se puede saber, pero no donde lo estábamos buscando. Ver más abajo.

#### El botón de repetir que nunca se encendía (y el fixture que yo mismo inventé)

El reporte fue exacto, como siempre:

> «se oprime el botón de repetir pero no sé si está activo o no, el de aleatorio sí
> porque cambia de canción»

Es decir: la orden llegaba —la canción se repetía— pero el botón no lo contaba. Y el
usuario supo separar las dos cosas: de aleatorio no se queja de que no se vea, se
conforma con deducirlo del cambio de canción.

Este proyecto tenía escrito, en esta misma sección, que el estado de repetir **no se
podía saber**. Era mentira, y llevaba meses ahí. La escribí yo, y encima la
"comprobé": en `tests/fixtures/controles-completos.html` el botón de repetir era

```html
<button class="repeat" aria-label="Repetir uno" aria-pressed="true"></button>
```

Ese HTML **nunca existió en YouTube Music**. Me lo inventé al escribir el fixture, con
la forma que me pareció razonable, y a partir de ahí las pruebas daban por buena una
lectura del estado que en el navegador no funcionaba jamás. Un fixture inventado no es
una prueba: es la misma suposición escrita dos veces, una en el código y otra en el
test, dándose la razón mutuamente.

`tools/diagnostico-relevo.js`, ejecutado en la página real con música sonando, lo
zanjó en tres líneas:

```
boton de repetir: yt-icon-button | atributos: {class: 'repeat style-scope ytmusic-player-bar', title: 'Repetir una', label: 'Repetir una'}
aria-pressed: null
cambio 1 en repetir: en el BOTON: {title: '"Repetir una" -> "No repetir"'} en la BARRA: {repeat-mode: '"ONE" -> "NONE"'}
```

Tres hallazgos de golpe:

1. No es un `<button>`, es un `yt-icon-button`.
2. Su `aria-pressed` es `null` **siempre**. La ventana flotante hacía exactamente lo
   correcto con lo que le llegaba —abstenerse—, y por eso el botón no se encendía
   nunca. El defecto no estaba en la ventana, estaba en la lectura.
3. El estado real vive en `ytmusic-player-bar[repeat-mode]`, y **no está traducido**.
   El `title` del botón sí lo está (`"Repetir una"`, `"No repetir"`), que es justo por
   lo que se había descartado como fuente.

Siguiendo el ciclo completo del observador: `"ONE" -> "NONE" -> "ALL" -> "ONE"`.

#### Repetir no es un interruptor, son tres posiciones

Ese ciclo obliga a un cambio de fondo. `repeatOn: true/false` no puede representar
tres estados: con un booleano, «repetir toda la lista» y «repetir esta canción» son el
mismo *encendido*, y el usuario sigue sin saber qué va a pasar cuando acabe la
canción — que es exactamente la pregunta que hacía al pulsar.

Así que el estado publica las dos cosas:

```js
const repeatMode = Adapter.getRepeatMode();   // "NONE" | "ALL" | "ONE" | undefined
...
repeatMode,
repeatOn: repeatMode === undefined ? undefined : repeatMode !== "NONE",
```

Una sola lectura para los dos campos, a propósito: leer dos veces permite que el modo
cambie entre medias y que el estado se contradiga a sí mismo (`repeatMode: "ALL"` con
`repeatOn: false`). `repeatOn` se conserva porque es lo que ya consumía el resto del
código, pero es un resumen derivado, nunca una fuente.

En la ventana, cada posición se pinta distinta —glifo, `title` y `aria-label`—:

| `repeat-mode` | Glifo | Texto | `aria-pressed` |
| --- | --- | --- | --- |
| `NONE` | 🔁 | Repetir: desactivado | `false` |
| `ALL` | 🔁 | Repetir: toda la lista | `true` |
| `ONE` | 🔂 | Repetir: esta canción | `true` |
| desconocido | 🔁 | Repetir | *(sin atributo)* |

El `aria-label` acompaña siempre al `title`: quien no distinga 🔁 de 🔂 necesita que su
lector de pantalla se lo diga. Y la última fila es la regla que ya tenía el proyecto y
que **no** se pierde con el cambio: si YouTube Music deja de exponer el modo, mejor un
botón sin estado que un botón afirmando «apagado» sin haberlo comprobado. El color de
acento lo pone el CSS con `.ytmpip-icon-button[aria-pressed="true"]`, y eso se mira en
`tools/vista-previa.html`, no en las pruebas.

### Preferencias: por qué hay una caché síncrona

`src/shared/settings.js` mantiene las preferencias en memoria y las precarga al
inyectar el content script. Es obligatorio: `openPip()` **no puede hacer `await`
antes de `documentPictureInPicture.requestWindow()`**, porque cualquier `await`
previo consume la activación de usuario del clic y la llamada falla con
`NotAllowedError`. Por eso el tamaño inicial de la ventana se lee de la caché de
forma síncrona y el resto de ajustes se aplican ya con la ventana creada.

El módulo normaliza todo lo que lee de storage (valores fuera de la lista
permitida, `seekSeconds` fuera de [1, 60] o no numérico) en vez de confiar en el
contenido, que puede venir de una versión anterior del esquema.

Aquí viven también las funciones que **parten y unen** los dos valores que llevan
dentro dos preguntas: `spectrumBars` es `"auto"` **o** un número, `spectrumColor`
es `"accent"` **o** un `#rrggbb`, y la página de opciones los pregunta por
separado. Partir y unir están junto a la normalización, y no en `options.js`,
porque los tres hablan de la misma forma del dato: separados, cambiar el formato
guardado obligaría a acordarse de dos archivos.

### Atajos de teclado: casi todas las teclas ya tienen dueño

La parte fácil de un atajo es decidir qué hace la tecla. La difícil es acordarse
de que la tecla **ya era de alguien**, y que quitársela rompe algo que funcionaba.

En la ventana flotante hay campos donde se escribe, un deslizador de volumen, una
barra de progreso arrastrable y una docena de botones. El navegador ya reparte las
teclas entre ellos, y ese reparto no es un detalle de accesibilidad: es la única
forma que tiene de usarse la ventana sin ratón. La lista de dueños previos:

| Quién tiene el foco | Teclas que son suyas |
| --- | --- |
| Un `<button>` (o cualquier cosa con `role="button"`) | La barra espaciadora, que lo pulsa |
| Un `<input type="range">` | Las cuatro flechas, que lo mueven |
| Un `<select>` | Las cuatro flechas, que cambian de opción |
| Un campo de texto o un `contenteditable` | **Todas** las letras, porque se está escribiendo |
| El navegador o el sistema | Cualquier combinación con Ctrl, Alt o Cmd |

`atajoPara(pulsacion, foco)` es una función pura que devuelve el nombre de la
acción o `null`, y todas esas reglas son cláusulas suyas. Está separada del
manejador porque una regla que sólo se puede probar despachando un `KeyboardEvent`
de verdad en una ventana de verdad acaba sin probarse. Y cada regla que **quita**
una tecla tiene al lado una prueba que demuestra que se la **devuelve** en cuanto
el foco cambia: si no, la próxima persona que lea el código no sabrá si la
exclusión era intencionada o un accidente que nadie notó.

Dos detalles que no se ven a simple vista:

- **Las líneas de la letra son botones sin ser `<button>`.** Son
  `<div role="button" tabindex="0">`, porque hacen falta como cajas de texto que se
  pueden pulsar para saltar a ese verso. Una comprobación por etiqueta las habría
  dejado fuera: al enfocar un verso, el espacio habría pausado la música en vez de
  saltar a él. La comprobación mira el rol, no la etiqueta.
- **La lista de tipos de `<input>` está escrita al revés a propósito.**
  `TIPOS_QUE_NO_ESCRIBEN` enumera los que **no** son campos de texto (`button`,
  `checkbox`, `color`, `file`, `hidden`, `image`, `radio`, `range`, `reset`,
  `submit`) y todo lo demás cuenta como escritura. La lista contraria —enumerar los
  que sí son texto— crece con cada versión de HTML, y olvidarse de uno significa
  comerse lo que el usuario está escribiendo. Olvidarse de uno en esta lista sólo
  significa que un atajo no funciona en un sitio raro. Los dos errores no cuestan
  lo mismo.

Mantener pulsada una tecla merece regla propia. `event.repeat` llega decenas de
veces por segundo: mantener la flecha arriba para subir el volumen es razonable, y
mantener la `N` para saltar treinta canciones no lo es. `ADMITEN_REPETICION`
contiene sólo lo que se puede deshacer moviéndose en la dirección contraria
—adelantar, retroceder, subir y bajar el volumen—; pausar, silenciar y cambiar de
canción se ignoran mientras la tecla siga hundida.

El volumen se movió a `mandarVolumen(porcentaje)`, que acota a `[0, 100]`, mueve el
deslizador y manda la orden. El arrastre del deslizador y las flechas entran por
esa misma puerta, porque **una regla duplicada en dos archivos no es una regla, son
dos**: si el acotado sólo viviera en el manejador del arrastre, subir el volumen con
la flecha desde el 98 % pediría un 103 %. Lo que **no** hace falta es el guardián
`changingVolume`: esa bandera significa "el dedo del usuario está sobre el
deslizador", y `setVolume` en `player-controller.js` es síncrono (`media.volume = …`),
así que no hay carrera que ganar.

**Dos errores míos, por si sirven.** El primero: `wireEvents` cableaba el teclado
sobre `pipWindow.document`, que es lo correcto en producción y `null` en el banco
de pruebas, donde la interfaz se monta en un `createHTMLDocument` aparte. La prueba
que comparaba "la tecla manda lo mismo que el botón" falló, y la tentación era
tocar la prueba. Se cambió el código a `els.root.ownerDocument`, que es cierto en
los dos sitios y además es la pregunta correcta: *dónde vive esta interfaz*, no
*qué ventana hay abierta*. El segundo, peor: para arreglarlo añadí al banco una
segunda puerta, `cablearTodo`, junto a la que ya había, `montar`. Llamar a las dos
—que es exactamente lo que iba a pasar— habría registrado `wireSeekBar` dos veces,
y un solo arrastre habría mandado dos `SEEK_TO`. La solución fue quitar la puerta
nueva y que `montar` llame a `wireEvents`: al banco se entra por un sitio.

### La ventana recuerda su tamaño: el interior y el exterior no miden igual

«Como la dejé la última vez» es un valor más del desplegable **Tamaño al abrirla**,
no una casilla aparte. Tres respuestas excluyentes a una sola pregunta —pequeña,
grande, como la dejé— caben en un desplegable; una casilla al lado plantearía la
pregunta de qué pasa si se marca *y* se elige "pequeña", que es una pregunta sin
respuesta buena. El tamaño se anota siempre, se haya elegido esa opción o no: anotarlo es
barato y así elegirla surte efecto desde el primer momento, en vez de tener que
mover el borde una vez para "estrenarla".

**El fallo que esto podría haber tenido, y que no se ve el primer día.** Una
ventana tiene dos medidas: el hueco donde se pinta (`innerWidth`/`innerHeight`) y
la ventana entera con su marco (`outerWidth`/`outerHeight`). Si se anota una y se
pide la otra, la ventana **encoge el grosor del marco en cada sesión**: 700, 660,
620… hasta pegarse al mínimo. El día uno no se nota nada. El día diez el usuario
tiene una ventana diminuta y ninguna forma de relacionarlo con nada. Se anota el
exterior (`outerWidth || innerWidth || 0`, con el interior de reserva por si el
navegador no da el exterior) y se escribió `tools/diagnostico-tamano-ventana.js`
para comprobar en Chrome de verdad sobre cuál de las dos actúa `resizeTo`, en vez
de suponerlo: jsdom no puede responder a eso.

Medido en Chrome, y por poco: una ventana flotante de **342×278** por fuera mide
**296×215** por dentro. El margen del navegador es de **46 px de ancho y 63 px de
alto** — no es un detalle de un par de píxeles. Confundirlas habría encogido la
ventana 46×63 en cada apertura: 342, 296, 250… clavada en el mínimo en cuatro o
cinco sesiones, y sin ninguna forma de que el usuario relacionara el síntoma con
la causa. El diagnóstico confirmó además que `resizeTo()` pide el **exterior**,
que es lo que se anota, así que el tamaño se conserva exacto.

Anotar el tamaño **no** pasa por el camino de las preferencias en vivo.
`CLAVES_QUE_SE_APLICAN` excluye `pipLastSize` de la lista que dispara
`chrome.storage.onChanged`, porque si no, arrastrar un borde relanzaría
`applySettings` —tema, alto del espectro, atenuado, `syncVideoMode`— decenas de
veces seguidas por un dato que a la ventana abierta no le importa. Hay una prueba
de cada lado: que mover el borde no repasa nada, y que cambiar el tema sí lo
repasa. Un filtro sin la segunda prueba es un filtro que algún día se lo traga todo.

Cuándo anotar tiene la misma forma que el resto del proyecto: `resize` con un
rebote de medio segundo (arrastrar un borde dispara decenas de eventos y escribir
en cada uno sería absurdo), más un volcado inmediato en `pagehide` para que cerrar
justo después de mover el borde no pierda el último tamaño. Los dos eventos no son
una suposición: `applyDensity` ya dependía del primero y `returnVideo` del segundo,
así que están comprobados en uso real. El volcado va **dentro** del manejador de
`pagehide` que ya existía, en su primera línea, y no como un segundo oyente: ese
manejador termina poniendo `pipWindow = null`, y el orden importa.

**El error que cazó la mutación.** La prueba «se anota la ventana ENTERA, no el
hueco donde se pinta» estaba escrita con un exterior de 700×500 y un interior de
700×460: distinto alto, **mismo ancho**. Pasaba en verde, y la mutación que hacía
que el ancho se leyera del interior sobrevivió tan campante. La prueba sólo
vigilaba la mitad de la regla que decía vigilar. Ahora el interior es 684×460 —más
estrecho *y* más bajo, como en un navegador de verdad— y se comprueban las dos
dimensiones; y hay una mutación por cada una, en pareja, para que olvidarse de un
lado vuelva a notarse.

## Cargar en modo desarrollador

1. Abrir `chrome://extensions`.
2. Activar "Modo de desarrollador".
3. "Cargar descomprimida" y seleccionar esta carpeta.
4. Abrir `music.youtube.com`, reproducir algo, y usar el icono de la extensión.

## Decisión técnica importante: cómo se abre el PiP (activación de usuario)

Al probar en Chrome real (Fase 0) se confirmó que con `default_popup` configurado,
`chrome.action.onClicked` nunca se dispara, y el clic dentro del popup solo activa
*ese* contexto — no viaja hasta la pestaña de YouTube Music. `documentPictureInPicture.requestWindow()`
exige activación de usuario en el mismo contexto y fallaba en silencio.

Solución: se quitó `default_popup` del manifest. El icono de la extensión ahora
dispara `chrome.action.onClicked` directamente sobre la pestaña activa, y el
service worker inyecta (`chrome.scripting.executeScript`, mundo `ISOLATED`) una
llamada directa a `self.YTMPip.PipView.open()` en esa misma pestaña, preservando
la activación. `src/popup/popup.html` se conserva solo como interfaz de la
ventana de respaldo cuando `documentPictureInPicture` no está disponible.

Segunda prueba en Chrome real: incluso vía `chrome.action.onClicked` +
`executeScript`, `requestWindow()` sigue fallando — la activación de usuario NO se
transfiere desde el contexto del navegador hasta el documento de la pestaña.

**Conclusión (Fase 0):** el único disparador confiable es un clic real dentro del
propio documento de YouTube Music. Por eso `pip.js` inyecta un botón flotante
"PiP" en la página (abajo a la derecha, sobre la barra del reproductor); su
handler de clic llama a `requestWindow()` con activación garantizada. El clic en
el icono de la extensión se conserva como disparador secundario/best-effort.

#### El error reportado: `NotAllowedError` señalando una línea inocente

Lo que el usuario vio en `chrome://extensions`:

```
Uncaught (in promise) NotAllowedError: Failed to execute 'requestWindow' on
'DocumentPictureInPicture': Document PiP requires user activation

Contexto: https://music.youtube.com/search?q=metal+rock
Seguimiento de la pila: src/pip/pip.js:792 (función anónima)
```

La línea 792 es `const max = Number(els.seek.max) || 0;`, dentro de
`showSeekPreview()`: **la vista previa de la barra de progreso, que no tiene nada
que ver con abrir la ventana**. Perseguir esa línea habría sido perder la tarde.
Un rechazo de promesa que nadie atiende no tiene pila propia, así que Chrome lo
cuelga del fotograma que pilla; el número de línea era ruido y el mensaje era el
dato.

El mensaje decía dos cosas a la vez:

1. **La ventana no se abrió.** Ya sabíamos desde la Fase 0 que el icono no puede
   abrirla; esto es lo esperado, no la novedad.
2. **Nadie recogió el fallo.** Eso sí era un defecto, y estaba en el service
   worker:

```js
// Antes
func: () => {
  if (self.YTMPip && self.YTMPip.PipView) {
    self.YTMPip.PipView.open();   // async, y sin nadie detrás
    return "opened";              // mentira: aún no se sabe
  }
  ...
}
```

`open()` es `async`. Devolver `"opened"` sin esperarla rompía dos cosas de golpe:
el rechazo se escapaba —el error que veía el usuario— y la rama de aviso del
propio `chrome.action.onClicked` (`if (result !== "opened")`) **no podía saltar
nunca**, porque el resultado siempre era `"opened"`. Un aviso que no puede
dispararse es un aviso que no existe.

Ahora la promesa se devuelve, con su rechazo atendido **dentro de la página**:

```js
return self.YTMPip.PipView.open().then(
  () => "opened",
  (err) => (err && err.name) || "error"
);
```

El `.then(ok, err)` va dentro del `func:` inyectado a propósito, y no en un
`await` del service worker: así el rechazo queda atendido en la pestaña aunque
`executeScript` no esperase la promesa devuelta. Que la espere solo sirve para
enterarse del motivo.

**Y una contradicción que llevaba tiempo escrita.** El comentario de
`chrome.action.onClicked` afirmaba que el clic en el icono *sí* daba la activación
de usuario; el comentario del botón inyectado en `pip.js` afirmaba lo contrario,
que es lo que este mismo README ya había concluido en la Fase 0. Dos comentarios
opuestos en el mismo repositorio: uno se escribió desde la evidencia y el otro
desde la esperanza. Lo zanjó el error del usuario, no una relectura del código.
El comentario equivocado ya no está.

**Qué hace ahora el icono cuando no puede abrir la ventana.** Antes: nada visible,
más un error rojo. Ahora reconoce `NotAllowedError` como lo que es —no un fallo
reintentable, sino una API diciendo que le falta un gesto en la propia página— y
llama la atención sobre el botón «PiP», que sí es ese gesto: `destacarLanzador()`
lo crea si no está y lo hace parpadear tres veces.

El parpadeo usa la API de animaciones (`Element.animate`) y no unos `@keyframes`:
meter CSS propio en `music.youtube.com` es dejar rastro en una página que no es
nuestra, y esto dura tres segundos. La guarda `typeof btn.animate !== "function"`
no es decorativa —jsdom no la implementa— y su hermana `if (!btn) return false`
tampoco: sin `<body>` no hay botón que crear, y sin esa guarda el adorno tumbaría
el aviso con un `TypeError`.

Esa segunda guarda **sobrevivió a la primera ronda de mutación**: cambiar su
`false` por `true` no rompía ninguna prueba, porque el valor devuelto no lo
comprobaba nadie —ni el test ni el service worker, que lo tiraba a la basura—.
No se borró, porque no es código muerto: es la única rama que evita el
`TypeError`. Se hizo lo contrario, darle un trabajo de verdad; ahora el service
worker distingue los dos casos y dice cuál es:

```
[YTMPip] ... se ha destacado el botón PiP de la página.
[YTMPip] ... y tampoco hay botón PiP en la página; recarga la pestaña (F5).
```

## Nota de desarrollo: recargar la extensión invalida el content script

Al pulsar "Recargar" en `chrome://extensions`, los content scripts ya inyectados
quedan huérfanos: `chrome.runtime` sigue existiendo pero `chrome.runtime.id` es
`undefined` y `sendMessage()` lanza `Extension context invalidated` **de forma
síncrona** — un `.catch()` no lo atrapa y el error rompe el handler completo (por
eso fallaban a la vez el envío de estado y el botón "volver a la pestaña").

`YTMPip.sendMessageSafe()` y `YTMPip.getURLSafe()` (en `src/shared/messages.js`)
envuelven las llamadas en try/catch y nunca lanzan.

**Modo degradado.** Al detectar el contexto huérfano NO se apaga el observer.
El bucle `MutationObserver → buildState → PipView.onStateUpdate` es puramente
local (lee el DOM de la página, escribe en el `document` de la ventana PiP) y no
necesita `chrome.runtime` para nada; lo único que se desactiva es el envío de
estado al service worker, que solo alimenta al popup / ventana de respaldo. La
ventana PiP sigue actualizando carátula, título y progreso, y muestra
"Extensión recargada · pulsa F5 en la pestaña" en la barra de estado.

**Siempre recarga la pestaña de `music.youtube.com` con F5 después de recargar la
extensión.**

## Decisión técnica importante: dónde vive `pip.js`

La API `documentPictureInPicture` crea una ventana nueva cuyo `document` se puebla
manipulando el DOM desde el contexto que la abrió. Un `<script src="...">` cargado
**dentro** de esa ventana correría en un realm sin acceso a `chrome.runtime`. Por eso
`src/pip/pip.js` se inyecta como content script más en `music.youtube.com` (mismo
mundo aislado que `content-script.js`) y construye/actualiza el `document` de la
ventana PiP directamente vía DOM, cargando `pip.html`/`pip.css` como recursos web
accesibles (`fetch` + `<link>`).

## Pruebas

```bash
npm install   # solo la primera vez (jsdom es la única dependencia)
npm test
```

806 pruebas con el runner nativo de Node (`node --test`) y jsdom. **La extensión
sigue sin paso de compilación**: el arnés de `tests/helpers/entorno.js` evalúa los
archivos de `src/` tal cual, sin transformarlos. Funciona porque todos los módulos
son `(function (root) { ... })(self ?? globalThis)`, así que dentro de jsdom
`self` es la ventana y `YTMPip` se construye igual que en un content script real.

> **El número de arriba es medido, no sumado.** Aquí hubo durante meses una
> suma manual: cada tanda corría solo sus archivos nuevos y sumaba sus pruebas al
> total anterior, y esa aritmética se fue quedando corta sin que nadie la
> cotejara (llegó a decir 463 cuando había 645). Al cerrar la función de la cola
> se corrió por fin la suite ENTERA (`npm test`, todo en verde), el runner contó
> 645, y desde entonces la regla es correrla completa al cierre de cada función:
> el 665 lo contó el runner al cerrar el temporizador de apagado, el 688 al
> cerrar el ecualizador por canción, el 697 al cerrar la localización, el 704
> al cerrar la accesibilidad, el 707 al cerrar el velo de la cabecera, el 709
> al cerrar la fase 0, el 715 al cerrar el contrato del adaptador y el 722 al
> cerrar el adaptador de YouTube normal; desde entonces cada tanda deja su
> recuento en su propia sección (el último: 806 al cerrar la letra en fase).
> Aquella primera
> corrida completa destapó además una avería real que llevaba tandas escondida
> precisamente porque nadie lo corría todo; está contada en «La avería que
> destapó correrlo todo», más abajo.

> **Qué se corrió en la tanda del adaptador de YouTube normal**: primero el
> archivo nuevo, `adaptador-youtube.test.js` (**7 de 7 a la primera**), junto
> con el del contrato, que cambió UNA aserción (los ids registrados de serie
> ahora son dos, porque el entorno carga ambos adaptadores como el manifest).
> La confesión de esta tanda no fue de código sino de andamio: el fixture
> original ponía TODOS los señuelos detrás del elemento bueno, así que
> des-anclar el selector del título habría seguido acertando por puro orden
> de documento y el guardia estaba en verde de adorno. Se descubrió al
> predecir la mutación M2, y el fixture pasó a poner señuelos DELANTE a
> propósito (el diagnóstico midió cuántos hay, no en qué orden están). Al
> cierre, la suite ENTERA: **722 de 722**, el total medido de arriba (715 + 7).
>
> **Mutación dirigida, a mano** (cinco mutaciones aplicadas y restauradas una
> a una, verificando cada restauración con la corrida en verde). **5 de 5
> detectadas, 0 sobreviven, 7 fallos provocados en total — y los siete
> predichos con su prueba exacta ANTES de ejecutar**: hacer que
> `getPageTrackTime` lea la barra helada (1 — la prueba estrella contesta 16
> en vez de 40.3), des-anclar el título a `#title` (2 — el señuelo previo
> gana), des-anclar el like a su selector suelto (1 — `closest` delata al
> señuelo), quitarle a `mediaElement` el selector del reproductor (2 — gana
> la precarga y el tiempo sale del video equivocado) y mentir con la
> capacidad `letras: true` (1 — las capacidades se recorren por la lista del
> contrato). La historia está en «El adaptador de YouTube normal».

> **Qué se corrió en la tanda del contrato del adaptador**: primero el archivo
> nuevo solo, `contrato-adaptador.test.js` (**5 de 6 a la primera**; el sexto
> fallo era del andamio y no del código: `registradosIds()` devuelve un Array
> del reino de jsdom y `deepStrictEqual` también compara prototipos — se cruza
> con `Array.from` y quedó **6 de 6**), y al cierre la suite ENTERA: **715 de
> 715**, que es el total medido de arriba (709 + 6). Las 709 de antes pasaron
> SIN tocar una aserción, que era la promesa de la tanda: cimentación invisible.
>
> **Mutación dirigida, a mano** (cinco mutaciones aplicadas y restauradas una a
> una, verificando la restauración con la corrida en verde y con un grep de
> `MUTACION` que volvió vacío). **5 de 5 detectadas, 0 sobreviven, 6 fallos
> provocados en total**: la elección ignora el hostname y devuelve siempre el
> primero (1 — el falso de Spotify deja de encontrarse), apagar la validación
> de métodos (1 — el adaptador sin `getRepeatMode` firma sin morir), tolerar
> la capacidad desconocida (1 — el «aletorio» del error de tecleo vive),
> publicar una COPIA del adaptador en vez del objeto (2 — las dos pruebas de
> identidad lo cazan: la copia rompería `setBorrowedMedia`, que vive en el
> clausurado del original) y romper la red de seguridad del primer registrado
> (1 — el hostname que nadie declara se queda sin adaptador). La historia está
> en «El contrato del adaptador».

> **Qué se corrió en la tanda de la fase 0 (la pestaña de letras por texto)**:
> primero el archivo tocado, `lyrics-reader.test.js` (**30 de 30 a la
> primera** — la prueba consagrada de «la segunda cabecera» reescrita para
> contar la verdad nueva: por texto primero, y con tres pestañas texto y
> posición deben coincidir; el mundo temido de las cuatro pestañas con la
> intrusa «LETRAS DEL MOMENTO» en la posición [1] y `read()` sobreviviendo
> con AVAILABLE; y el francés `SUIVANT · PAROLES · SIMILAIRES`, donde ningún
> texto se reconoce y manda la posición), y al cierre la suite ENTERA:
> **709 de 709**, que es el total medido de arriba (707 + 2).
>
> **Mutación dirigida, a mano** (cuatro mutaciones aplicadas y restauradas una
> a una, verificando cada restauración con la corrida en verde). **4 de 4
> detectadas, 0 sobreviven, 4 fallos provocados en total**: volver a la
> posición pura de ayer (1 — el mundo temido la mata), desanclar la regex
> (1 — el señuelo «LETRAS DEL MOMENTO» existe exactamente para eso), quitarle
> la `/i` (1 — el «LETRA» en mayúsculas del fixture deja de reconocerse y se
> cae en la intrusa) y torcer el último recurso a `headers[0]` (1 — la
> francesa vigila al último recurso en persona). La historia está en «La fase
> 0: el sitio real, por fin delante».

> **Qué se corrió en la tanda del velo de la cabecera**: primero el archivo de
> accesibilidad con sus tres pruebas nuevas, `accesibilidad.test.js` (**10 de
> 10 a la primera** — el velo existe en los dos temas, llega a los bordes
> restando las variables del relleno y no roba clics; el estado y el acento de
> «Sin conexión» pasan AA en los ocho peores casos, con la superficie compuesta
> capa a capa; y el degradado muere antes del título, con la cola y el desborde
> midiendo lo mismo), y al cierre la suite ENTERA: **707 de 707**, que es el
> total medido de arriba (704 + 3).
>
> **Mutación dirigida, a mano** (nueve mutaciones aplicadas y restauradas una a
> una, verificando cada restauración con la corrida en verde). **9 de 9
> detectadas, 0 sobreviven, 11 fallos provocados en total**: debilitar el velo
> oscuro a 0.4 (1 — el mensaje dice «sin conexión» = 3.84 < 4.5: el acento es
> el primero en caer, como predijo la maqueta), borrar el velo del tema claro
> (3 — y una de las cuentas enseña el desastre de heredar en silencio: el velo
> oscuro compuesto sobre el tema claro deja el estado en 1.65), `z-index: 1` en
> vez de −1 (1), quitar `pointer-events: none` (1), volver el relleno del
> contenido un número suelto (1), última parada del degradado opaca a 0.3 (1),
> desborde de abajo a −24px con la cola del degradado en 12 (1), borrar la
> excepción del superpuesto (1) y quitarle a mini sus variables de relleno (1).
> La historia está en la sección del velo de la cabecera.
>
> **Qué se corrió en la tanda de la accesibilidad**: primero el archivo nuevo
> solo, `accesibilidad.test.js` (**7 de 7 a la primera** — la región aria-live
> cosida y vacía en el HTML, la clase que oculta sin silenciar, el anuncio del
> cambio de canción con sus tres negativas —la primera no, el repintado no, la
> nada no—, la animación que sobrevivió a la mudanza, y el contraste WCAG de los
> dos temas con las cuentas hechas), y al cierre la suite ENTERA: **704 de
> 704**, que es el total medido de arriba (697 + 7).
>
> **Mutación dirigida, a mano** (diez mutaciones aplicadas y restauradas una a
> una, verificando cada restauración con la corrida en verde). **10 de 10
> detectadas, 0 sobreviven, 15 fallos provocados en total**: anunciar también
> la primera canción (2 — la del anuncio y la premisa de la animación),
> anunciar sin título (1), usar siempre la clave larga y leer la coma huérfana
> (1), quitarle la memoria al detector de cambios (4 — sin `lastSongKey`
> escrito, «primera» no deja de serlo nunca y no se anuncia ni se anima nada),
> quitarle el `role="status"` a la región (1), darle texto de fábrica (2 — la
> estática y la de comportamiento, que esperaba la región vacía tras la primera
> canción), `display:none` en la clase oculta (1), aclarar el texto tenue del
> tema claro a `#9e9e9e` (1 — el mensaje dice 2.68 < 4.5, el mismo número de la
> cuenta a mano), borrar la redefinición de `--ytmpip-text` en el tema claro
> (1) y debilitar el tramo inferior del velo oscuro a 0.2 (1 — 3.88 < 4.5). La
> historia está en la sección de la accesibilidad.
>
> **Qué se corrió en la tanda de la localización**: primero el archivo nuevo
> solo, `localizacion.test.js` (**9 de 9 a la primera** — paridad de claves entre
> catálogos, el español del HTML contra el del catálogo byte a byte, toda clave
> usada existe en los dos idiomas, los huecos `$1` coinciden, el catálogo dice lo
> mismo que las constantes de respaldo, `_locales` viaja en el paquete, y el
> comportamiento de `textos.js`: clave pelada sin catálogo, `aplicar()` que no
> toca lo que no resuelve, y la caché como paracaídas), y al cierre la suite
> ENTERA: **697 de 697**, que es el total medido de arriba (688 + 9).
>
> **Mutación dirigida, a mano** (nueve mutaciones aplicadas y restauradas una a
> una, verificando cada restauración con la corrida en verde). **9 de 9
> detectadas, 0 sobreviven, 11 fallos provocados en total**: quitar el
> `cache.set` del paracaídas (1), hacer que `t()` devuelva `""` en vez de la
> clave pelada (2 — también mata la del paracaídas, porque su tercera aserción
> exige la clave para lo nunca resuelto), hacer que `aplicar()` escriba siempre y
> vacíe el nodo sin clave (1), escribir `aria` en vez de `aria-label` (1),
> desincronizar «La ventana flotante» del catálogo respecto del HTML (1), borrar
> `guardado` del catálogo inglés (2 — la paridad de claves y la de claves
> usadas), quitarle el `$1` a `adelantar_segundos` en inglés (1), cambiar el
> respaldo `voz: "Voz"` por `"Vocal"` (1) y sacar `_locales` de la lista blanca
> del empaquetador (1). La historia está en la sección de la localización.
>
> **Qué se corrió en la tanda del ecualizador por canción**: primero el archivo
> nuevo solo, `ecualizador-por-cancion.test.js` (**22 de 22 a la primera** —la
> clave y la criba, la máquina de devoluciones, la chincheta con el `pip.js` de
> verdad, la carrera de la carga y el latido con el orquestador entero— y
> **23 de 23** tras la prueba que dejó el mutante superviviente), y al cierre la
> suite ENTERA: **688 de 688**, que es el total medido de arriba (665 + 23).
>
> **Mutación dirigida, a mano otra vez** (ocho mutaciones aplicadas y
> restauradas una a una, verificando cada restauración con la corrida en
> verde). **7 de 8 detectadas a la primera, con 9 fallos provocados**: `cargar()`
> deja de olvidar la canción actual (1), se pierde la corrección de «lo que
> sonaba al empezar» tras una devolución (2, incluida la regresión derivada a
> mano), la prueba del delito vuelta `true` (1), la criba de punto fijo
> desaparece (2), la expulsión come por el final (1), el orquestador pierde la
> llamada del latido (1) y el clic de la chincheta deja de repintar (1). La
> octava —quitar el retorno temprano de «misma canción»— **SOBREVIVIÓ a las 22**
> y destapó un agujero real: el latido repetido sobre una canción fijada le
> volvería a quitar el mando al usuario. Ganó su prueba, se volvió a aplicar el
> mutante para verla fallar (1 fallo, exactamente ella), y con ella son **8 de 8
> y 10 fallos**. La historia está en la sección del ecualizador por canción.
>
> **Qué se corrió en la tanda del temporizador de apagado**: primero el archivo
> nuevo solo, `temporizador-apagado.test.js` (**20 de 20** — la lista, el módulo
> con el reloj inyectado, el botón con la luna, y dos con el orquestador de
> verdad en marcha), y al cierre la suite ENTERA: **665 de 665**, que es el
> total medido de arriba (645 + 20, y por una vez la suma y la medida
> coinciden).
>
> **Mutación dirigida, esta vez a mano** (ocho mutaciones puntuales aplicadas y
> restauradas una a una, sin escribir un mutador: ninguno de los existentes toca
> estos archivos y ocho ediciones no ameritan una herramienta). **8 de 8
> detectadas, 0 sobreviven, 13 fallos provocados en total**: quitar la criba de
> basura en `fijar` (1), no consumir el plazo al vencer (3), quitar el tope de
> las 12 horas (1), quitar la salida del ciclo del botón (2), quitar el suelo de
> «1′» (1), quitar el repintado inmediato del clic (1), quitar el caso
> `SET_SLEEP_TIMER` de `PlayerController` (3) y borrar el término del
> temporizador de la firma del estado (1 — la que estaba anunciada como
> superviviente y no lo era; la historia está en la sección del temporizador).
> Tras cada mutación se restauró y se verificó con `node --check` y la corrida
> en verde.
>
> **Qué se corrió en la tanda de la preparación para publicar en la Chrome Web
> Store**: los **cuatro archivos afectados**, y solo ésos. **70 de 70**:
> `manifiesto-tienda.test.js` (**8, nuevo** — el manifiesto no tenía ninguna),
> `popup.test.js`, `opciones-ecualizador.test.js` y `pip-lanzador.test.js`, los
> tres últimos porque el renombrado tocó sus archivos. El total de entonces, 454,
> sumaba las 8 nuevas a las 446 que había — una de las sumas manuales que el
> recuento medido de arriba dejó atrás. Las restantes no se tocaron y no se
> volvieron a correr en aquella tanda.
>
> **Mutación dirigida**: `tools/mutar-manifiesto.js` (**nuevo**), **10 de 10**.
> Ninguno de los otros nueve mutadores toca el manifiesto ni el empaquetador, así
> que no se corrieron.
>
> **Las dos mutaciones que valen el archivo entero** son las que no rompen nada:
> «vuelve la descripción de 137 caracteres» y «vuelve `activeTab`». Con las dos
> aplicadas la extensión se instala, suena y se ve exactamente igual. Lo único
> que pasa es que no se puede publicar. Está contado en «Publicar es otro
> programa», más abajo.
>
> *(Las tandas de abajo se llamaban «la anterior», «dos tandas atrás». Se han
> renombrado por lo que fueron. Un ordinal relativo en un registro que crece por
> arriba caduca **cada vez que se añade una entrada**, y al añadir ésta había ya
> dos «la tanda anterior» distintas seguidas. Es el mismo error que la sangría
> de `mutar-mandos.js`: escribir una referencia que depende de algo que se mueve.)*
>
> **Qué se corrió en la tanda del rediseño de Preferencias y sus textos**: los
> **dos archivos afectados**, y solo ésos. **58 de 58**:
> `opciones-ecualizador.test.js` (38, **2 nuevas**) y
> `pip-tamano-recordado.test.js` (20, que lee el desplegable del tamaño en
> crudo). El 446 de arriba suma las 2 nuevas a las 444 que había. Las ~388
> restantes no se tocaron y no se volvieron a correr.
>
> **No a la primera, y merece decirse**: la primera pasada dejó tres reglas
> denunciadas como huérfanas —`select:focus-visible` y compañía— por un fallo
> de la propia prueba, no del CSS. Está contado en «Tres formas de tener un
> arnés de mutación roto y en verde», más abajo.
>
> **Mutación dirigida**: sólo `tools/mutar-mandos.js`, que es el único de los
> cinco que toca esta página. **41 de 41**, y esa cuenta vale además como
> comprobante de otra cosa: una de sus mutaciones dependía de la sangría del
> HTML y hubo que repuntarla al partir la página en tarjetas. Si la nueva
> cadena no existiera, el arnés la habría contado como superviviente.
>
> **Qué se corrió en la tanda del pulso sobre el vídeo y el rediseño del menú**:
> los **cinco archivos afectados**, y solo ésos. **145 de 145**:
> `popup.test.js` (**18, nuevo** — el menú no tenía ninguna),
> `pip-pulso.test.js` (43), `interruptor-ecualizador.test.js`, `iconos.test.js`
> y `pip-espectro.test.js`. El 444 de arriba suma los 18 nuevos a los 426 que
> había. Los ~299 restantes no se tocaron y no se volvieron a correr.
>
> **Mutación dirigida, en serie** (no se pueden lanzar a la vez: reescriben el
> mismo árbol de fuentes). `tools/mutar-pulso.js` **37 de 37**,
> `tools/mutar-menu.js` **15 de 15** (nuevo), `tools/mutar-mandos.js` **41 de
> 41** y `tools/mutar-interruptor.js` **28 de 28**. Cero supervivientes no
> previstos, pero **no a la primera**: la historia de las dos que fallaron está
> justo debajo de la tabla, y las dos son fallos del arnés, no del código.
>
> **La tanda del ajuste del pulso no añadió pruebas, y hay que decir por qué.** El ajuste del
> pulso tras mirarlo en la ventana real tocó `pip.css` (la curva y la fuerza) y
> `tools/diagnostico-pulso.js`, que no se empaqueta. Ningún archivo de `src/`
> con lógica cambió: se corrió `pip-pulso.test.js` (**38 de 38**) por ser el de
> la funcionalidad, y nada más. Lo que sí se verificó, porque jsdom no maqueta y
> ninguna prueba unitaria puede verlo, fue **en el servidor de vista previa**: que
> el `calc` computa en vez de quedarse en `none`, la curva entera de 0 a 1, que
> `prefers-reduced-motion` sigue ganando el orden del CSSOM ahora que compite
> contra una declaración real, y que el crecimiento no desborda en ninguna de las
> 18 configuraciones. Está contado arriba.
>
> **Qué se corrió de verdad en la tanda del pulso de la carátula**: los
> **archivos afectados**, y solo esos. **125 de 125**: `pip-pulso.test.js` (38,
> nuevo), `pip-espectro.test.js` (38, porque `audio-spectrum.js` cambió debajo),
> `iconos.test.js`, `pip-latido.test.js`, `pip-video.test.js` y
> `pip-solo-caratula.test.js`. El 426 de arriba suma los 38 nuevos a los 388 que
> había; los ~301 restantes (letras, opciones, service worker, vídeo prestado,
> velocidad) no se tocaron y no se volvieron a correr.
>
> **Mutación dirigida**: `node tools/mutar-pulso.js`, **33 de 33 detectadas, 0
> sobreviven**, más **1 que vive a propósito y está documentada** (el acotado de
> `mediaDb`, que no puede cambiar el resultado; la historia entera está arriba).
> A la primera pasada sobrevivieron siete: tres porque el analizador de mentira
> era demasiado complaciente, dos por pruebas que faltaban, una por ser
> inmatable y una porque el código tenía una guarda de más, que se borró. Esas
> 33 mutaciones son de esta funcionalidad; las 109 del banco general no se
> corrieron.
>
> La tanda anterior (la velocidad) fueron seis archivos, **90 de 90**, con
> `node tools/mutar-velocidad.js` en **15 de 15**; y la de antes (los iconos),
> los 16 archivos que cargan `pip.js`, **207 de 207**.
>
> Correr las 426 y las 109 mutaciones en cada mejora cuesta tiempo y no aporta
> información sobre lo que se acaba de tocar; se hace cuando hay motivo, y el
> motivo se acuerda antes.

### Por qué existen estas pruebas

Los selectores de letras estuvieron rotos desde la primera versión y **fallaron en
silencio**: un `querySelector` que devolvía `null` se traducía a "esta canción no
tiene letra". El usuario veía un mensaje perfectamente plausible y nadie sospechaba
del selector. Un test con HTML de fixture lo habría cazado en el primer minuto.

Los fixtures de `tests/fixtures/` reproducen la estructura **real** de YouTube
Music, incluidos el `.header` ("Letra") y el `.footer` ("Fuente: LyricFind") que
rodean al texto: son exactamente la trampa en la que cayó el primer lector, que
devolvía los tres concatenados.

Eso de "real" es la condición que hace que un fixture valga para algo, y no es
gratis: el botón de repetir de `controles-completos.html` estuvo inventado durante
meses y sostuvo una lectura del estado que en el navegador no funcionó nunca (la
historia entera, más arriba). Un fixture escrito de memoria no prueba el código,
prueba que uno se acuerda de lo que supuso. De ahí que cada afirmación sobre el DOM
de YouTube Music se compruebe antes con un script de `tools/diagnostico-*.js` en la
página de verdad.

El caso más importante es `letras-panel-cerrado.html`: la canción **sí** tiene
letra, pero el panel aún no se ha renderizado. Eso debe dar `LOADING`, no
`UNAVAILABLE`. Confundir ambos era el fallo original.

`letras-better-lyrics.html` es el segundo caso reportado desde el uso real, y
está construido para reproducirlo entero: pestaña nativa `disabled`, panel nativo
con `blyrics-hidden`, y el panel de Better Lyrics con una traducción, una
romanización, un coro de fondo y un interludio sin texto. Las trampas van a
propósito: si el lector se relaja, el fixture lo dice.

### Verificado por mutación

Un suite en verde no demuestra nada hasta que se comprueba que sabe ponerse en
rojo. Se rompió a propósito cada invariante y se comprobó que fallan justo las
pruebas que le corresponden:

| Mutación | Pruebas que fallan |
|---|---|
| Selectores de letras vueltos a las conjeturas originales (`.lyrics`, `#contents`) | 3 (las de "canción CON letra") |
| `LOADING` colapsado en `UNAVAILABLE` | 2 (panel cerrado, página sin reproductor) |
| `try/catch` síncrono quitado de `sendMessageSafe` | 1 (la marcada como `REGRESION`) |
| `hasVideo` devuelve `true` con cualquier `<video>` | 1 (pista de solo audio) |
| `isToggleActive` devuelve `false` en vez de `undefined` | 2 (estado inventado de aleatorio) |
| `getMediaElement` ignora el vídeo prestado | 2 (adaptador y `SEEK_TO` sobre el prestado) |
| Acotado numérico vuelto a `Number()` + `isFinite` | 1 (`SEEK_TO` con valor basura) |
| `densityFor` deja que `mini` y `tight` sean ciertos a la vez | 2 (exclusividad, ventana diminuta) |
| `densityFor` mide el ancho mirando el alto | 2 (límites exactos, ancho y alto por separado) |
| `layoutFor` superpone los controles aunque no haya vídeo | 3 (las tres de maquetación) |
| Better Lyrics se consulta **después** de la ruta nativa | 9 (todas las de Better Lyrics con letra) |
| Se lee el `textContent` crudo de la línea (el fallo original) | 4 (los dos casos reportados, orden, palabra partida) |
| Se separan **todas** las palabras con espacio | 2 (palabra larga partida, orden) |
| No se filtran los coros de fondo | 2 (coro colado, orden) |
| No se quita el clon de animación de la maquetación nueva | 1 (`streetstreet`) |
| `data-no-lyrics` ignorado | 1 (no se inventa una letra) |
| El contador vuelve a pintarse sin acotar | 3 (las tres de `timelineFor`) |
| Vuelve el `isConnected` muerto en `getMediaElement` | 5 (préstamo caducado + las 4 de encadenado) |
| `attachMediaListeners` no se desengancha del vídeo viejo | 2 (suscripciones acumuladas, latido en el muerto) |
| Quitada la guarda de "es el mismo elemento" | 1 (movimientos de suscripción) |
| `activeLyricAt`: `<=` vuelto `<` | 1 (el instante exacto de inicio ya suena) |
| `activeLyricAt`: las líneas con `time` null entran a la comparación | 1 (letra sin tiempos nunca tiene línea activa) |
| `activeLyricAt`: "la última del recorrido" en vez de "la de mayor tiempo" | 1 (no se asume orden) |
| Un `data-time` con basura se queda en `NaN` en vez de caer a null | 1 (basura → null, no 0) |
| El `data-time` deja de leerse | 2 (los tiempos de las dos maquetaciones de Better Lyrics) |
| La ruta nativa deja de emitir líneas | 2 (líneas sin tiempo, unir las líneas reconstruye el texto) |
| El adaptador vuelve a quedarse con el **primer** `<video>` de la página | 4 (cadáver abandonado, reinsertado, empate, sin metadatos) |
| El filtro de "está sonando" acepta cualquier vídeo | 2 (los dos en pausa, sonando contra pausado) |
| El filtro de "está sonando" desaparece | 1 (uno sonando le gana a uno pausado a medias) |
| Los vídeos terminados vuelven a contar como candidatos | 1 (con los dos en pausa gana el que va a medias) |
| Se pierde el medio segundo de margen del final de pista | 1 (el cadáver parado en 222.7 de 223) |
| En empate gana el primero del documento en vez del último | 1 (empate total: gana el más reciente) |
| El latido de la barra desaparece (vuelve a depender sólo de los mensajes) | 6 (todas las del latido) |
| El latido lee el último estado recibido en vez del `<video>` | 6 (todas las del latido) |
| El latido pregunta por la página en vez de por el vídeo prestado | 1 (modo vídeo) — **la mutación sobrevivió primero: faltaba la prueba** |
| El latido pisa la barra mientras el usuario la arrastra | 1 (arrastre) |
| Soltar el pulgar deja de terminar el arrastre | 1 (soltar sin mover) |
| Vuelve la regla antigua: cualquier `<video>` de la página releva al prestado | 2 (el cadáver a medias, en el adaptador y en `pip.js`) |
| El préstamo no se suelta ni ante un `<video>` de la página que **suena** | 2 (relevo legítimo, adaptador y `pip.js`) |
| El préstamo no se suelta aunque nuestra pista haya **terminado** | 5 (todo el encadenado) |
| Se quita la guarda del prestado suelto, sin documento | 1 (vídeo prestado sin documento) |
| **La asimetría, invertida**: se le exige "terminado" al de la página en vez de al nuestro | 2 (el cadáver a medias) |
| `pip.js` recupera su copia privada de la regla en `syncVideoMode` | 1 (tirábamos el vídeo que sonaba) |
| El tiempo se lee del `<video>` a pelo (**el fallo original**) | 1 (suavidad) — la red de seguridad de `read()` absorbe el resto |
| El desplazamiento se recalcula en cada lectura | 1 (el contador tiembla hacia atrás) |
| `MARGEN` a 0: cualquier redondeo mueve el desplazamiento | 1 (misma) |
| La duración vuelve a ser la de la cola | 6 (el caso reportado, en `TrackTimeline`, en el estado y en el latido) |
| `toMediaTime` olvida el desplazamiento | 2 (las dos de traducción de tiempos) |
| `toMediaTime` acota contra el `<video>` y no contra la pista | 2 (salto fuera de la canción, `SEEK_TO` al final) |
| Se cae el respaldo del texto `1:35 / 3:18` | 1 (deslizador ilegible) |
| Un deslizador sin valores se da por bueno | 17 (medio suite: se envenena todo lector de tiempo) |
| El latido vuelve a leer el `<video>` a pelo | 1 (la barra pinta la cola entera) |
| El estado publicado vuelve a leer el `<video>` a pelo | 9 (`MetadataReader` entero) |
| Alternar a carátula **tira** el vídeo en vez de devolverlo (pararía la música) | 3 (se devuelve, vuelve a su sitio, aguanta el cambio de canción) |
| El botón de alternar no consulta la elección: siempre pide vídeo | 2 (el caso pedido, y volver a pulsar) |
| La elección se reinicia con cada canción | 1 (aguanta el cambio de canción) |
| El botón se enseña siempre, haya vídeo o no | 2 (sin vídeo, y con el ajuste en "sin vídeo") |
| El botón ignora `videoPreference` y se ofrece con el vídeo desactivado | 1 (ajuste en "sin vídeo") |
| El botón no anuncia su estado (`aria-pressed` fijo) | 2 (aparece y anuncia, volver a pulsar) |
| Pulsar cambia la variable pero no vuelve a pintar | 1 (el caso pedido) |
| El adelanto empieza en la línea que suena en vez de en la siguiente | 2 (qué viene después, cerca del final) |
| Los separadores de estrofa se cuelan como adelanto | 1 (la línea en blanco) |
| El adelanto no tiene tope de tres | 1 (nunca más de tres) |
| El adelanto lee más allá de la última línea | 1 (cerca del final) |
| La línea que suena se esconde sin su adelanto | 1 (aparecen y desaparecen juntos) |
| Los párrafos del adelanto se rehacen en cada latido | 1 (repintar no reconstruye) |
| El papel del escenario: todo lo alternable se trata como vídeo | 3 (sin vídeo pero con letra, el caso pedido, volver a pulsar) |
| El botón sólo se ofrece con vídeo (comportamiento anterior) | 1 (sin vídeo pero con letra) |
| El estado pulsado se lee siempre del flag del vídeo | 2 (sin vídeo con letra, el caso pedido) |
| Un solo flag para los dos papeles del botón | 2 (una pulsación no mueve las dos decisiones, el caso pedido) |
| La letra en grande no reabre el panel que el usuario cerró | 1 (pedirla en grande lo reabre) |
| La letra en grande no comprueba que no haya vídeo | 1 (en un videoclip, pedir la portada da la portada) |
| Vuelve `scrollIntoView` (**el fallo reportado**: arrastra al `<body>`) | 1 (no se desplaza nada fuera del panel) |
| Se desplaza el documento en vez del panel | 1 (misma) |
| El centrado olvida dónde está ya el panel | 1 (cuenta desde donde está) |
| El centrado alinea arriba en vez de al medio | 2 (centrada, ya centrada) |
| El centrado mide la línea contra la ventana y no contra el panel | 1 (ya centrada) |
| El centrado ignora el alto de la propia línea | 2 (centrada, ya centrada) |
| `puedeMedirse` deja pasar el audio cifrado | 3 (rechaza lo no medible, el botón ni se ofrece, el botón deja de mentir) |
| `puedeMedirse` no exige `captureStream` | 1 (rechaza lo no medible) |
| El reparto de barras vuelve a ser lineal | 1 (el reparto es logarítmico) |
| Los cortes pueden repetirse, y quedan barras vacías | 1 (ninguna barra se queda vacía) |
| Cada barra pasa a ser el **máximo** de su grupo, no la media | 1 (cada barra es la media) |
| El suavizado deja de frenar la bajada | 4 (sube de golpe y baja con freno, y las tres de la velocidad configurable) |
| `conectar` se queda pegado al `<video>` anterior | 2 (`REGRESION` del relevo, el botón deja de mentir) |
| `barrasParaAncho` pierde el tope de arriba | 1 (topes en los dos extremos) |
| `barrasParaAncho` pierde el tope de abajo | 1 (la misma) |
| El espectro sigue encendido con la letra en grande | 1 (se apaga pero la petición se guarda) |
| El espectro se enciende **sin** conectar el analizador | 16 (todas las de ciclo de vida) |
| Apagar el espectro no suelta el `AudioContext` | 1 (apagar suelta el contexto) |
| El botón del espectro se ofrece siempre | 2 (con audio cifrado ni se ofrece, el botón deja de mentir) |
| La clase de sólo carátula no se pone nunca | 3 (el caso pedido, aguanta el cambio de canción, con la letra en grande) |
| El botón «Aa» mueve además la elección del escenario | 1 (quitar el texto no toca el escenario) |
| Sólo carátula se reinicia con cada canción | 4 (el caso pedido, volver a pulsar, cambio de canción, independencia) |
| `destacarLanzador` no crea el botón si no está | 4 (todas las que necesitan botón) |
| `destacarLanzador` dice que sí aunque no haya botón | 1 (sin `<body>`) — **sobrevivió primero: el valor devuelto no lo miraba nadie** |
| Se cae la guarda de `animate` (revienta sin Web Animations) | 4 (todas las que necesitan botón) |
| El parpadeo ocurre una sola vez y se pierde de vista | 1 (cuando el navegador sabe animar) |
| La animación se queda con un solo fotograma | 1 (la misma) |
| El lanzador se duplica en cada aviso | 1 (destacar dos veces no deja dos botones) |
| `PipView` deja de exponer `destacarLanzador` al service worker | 5 (todas menos la forma de `open`) |
| `open()` deja de ser `async` (**el `.then` del service worker revienta**) | 6 (todas) |
| El adaptador vuelve a leer el estado del botón, que es `null` (**el fallo original**) | 3 (las tres posiciones, el modo en el estado, el resumen) |
| `getRepeatMode` se traga cualquier valor sin validarlo | 1 (un modo desconocido se trata como desconocido) |
| Sin barra, el adaptador se inventa que no hay repetición | 2 (sin barra no hay modo, no se inventa estado de los toggles) |
| `repeatOn` deja de distinguir `NONE` del resto | 2 (el resumen, y sin barra) |
| El modo deja de viajar en el estado (sólo llega el resumen) | 2 (el modo viaja, el resumen no se lo traga) |
| Sin modo conocido, la ventana se inventa "apagado" | 1 (`REGRESION`: no se inventa un estado) |
| Repetir una canción se pinta igual que repetir la lista | 1 (no se confunden) |
| Las tres posiciones comparten el mismo texto | 3 (el síntoma reportado, no se confunden, se anuncia) |
| El botón se enciende también con `NONE` | 1 (sin repetir, el botón se apaga) |
| El botón **nunca** se enciende (el síntoma reportado, tal cual) | 2 (el síntoma reportado, no se confunden) |
| El estado se ve pero no se anuncia a quien no ve el glifo | 1 (se anuncia con `aria-label`) |
| `render` deja de pintar el modo | 4 (las cuatro que miran el botón) |
| Vuelve la guarda antigua: sólo mira el elemento (**el fallo reportado**) | 2 (los dos síntomas: cambio automático y cambio a mano) |
| La pista capturada no se guarda: nunca consta que muera | 1 (la misma) |
| `pistaTerminada` pregunta al revés: remonta el analizador cada refresco | 1 (una pista que no dice si vive) — **sobrevivió primero: todos los dobles sabían decirlo** |
| `desconectar` olvida la pista | **sobrevive a propósito** (ver arriba) |
| `conectar` deja de mirar la fuente (**el fallo del cambio de canción a mano**) | 1 (el síntoma reportado, segunda parte) |
| El hueco sin fuente cuenta como fuente nueva (un `AudioContext` por refresco) | 1 (el hueco entre dos canciones) |
| `fuenteCambio` compara al revés: se remonta cuando la fuente es la misma | 5 (todas las que cuentan analizadores) |
| `desconectar` se queda con la fuente apuntada | **sobrevive a propósito** (igual que la pista, ver arriba) |
| Un contexto suspendido después de montarlo ya no se reanuda | 1 (se reanuda en el refresco) |
| `entero` deja de mirar el rango: cualquier número vale | 4 (fuera de rango, preferencia corrupta, acotar contra rechazar, el tope del atenuado) |
| `entero` rechaza los decimales en vez de redondearlos | 1 (los decimales se redondean) |
| `normalizarBarras` no aparta `"auto"` | **sobrevive a propósito** (acierta por accidente: ver arriba) |
| `normalizarColor` acepta la forma corta `#abc`, que `fillStyle` lee distinta | 1 (sólo `#rrggbb` en minúsculas) |
| `normalizarColor` no normaliza a minúsculas | 1 (la misma) |
| `normalizarColor` acepta cualquier cadena | 3 (la misma, preferencia corrupta, `"RGB"` en mayúsculas no cuela) |
| `unirBarras` deja de acotar: guarda lo que se escriba | 1 (acota donde `normalizarBarras` rechaza) |
| `unirBarras` vuelve a tratar la casilla vacía como un cero (**el fallo real**) | 1 (vaciarla no manda el desplegable a "automático") |
| `unirBarras` ignora el modo y siempre guarda un número | 2 (el modo automático manda, partir y unir son inversas) |
| `unirColor` ignora el modo y guarda siempre el color del cuentagotas | 2 (el modo del tema manda, partir y unir son inversas) |
| `partirBarras` deja la casilla vacía al elegir un número fijo | 2 (reparte el valor, con `auto` la casilla no nace vacía) |
| `partirColor` mete el nombre del modo dentro del cuentagotas | 3 (el cuentagotas nace con algo, con un `#rrggbb` que acepta, y `"rgb"` no lo abre) |
| `barrasParaAncho` ignora el número elegido en preferencias | 2 (el número preferido manda sobre el ancho, y el cable) |
| `leerBarras` ignora la velocidad y usa siempre la de fábrica | 1 (más velocidad baja más en el mismo fotograma) |
| `leerBarras` sin velocidad se queda sin caída (barras clavadas arriba) | 1 (sin velocidad se usa la de siempre, no cero) |
| El bucle de dibujo no le pasa el número de barras preferido | 1 (el cable) |
| El bucle de dibujo no le pasa la velocidad preferida | 1 (el cable) |
| El bucle de dibujo vuelve a leer el acento en vez del color del espectro | 1 (el cable) |
| `applySettings` no escribe el alto del espectro | 1 (alto y color se traducen a variables CSS) |
| `applySettings` sólo escribe el color cuando es propio (se queda pegado) | 3 (la misma, volver al tema no deja pegado el anterior, `"rgb"` no acaba en la variable CSS) |
| `unirColor` vuelve a escribir `accent` a mano y se traga el modo `rgb` | 1 (partir y unir son inversas) |
| `partirColor` decide el modo por el nombre y no por la forma del valor | 2 (`"rgb"` en la variable CSS, `"rgb"` no abre el cuentagotas) |
| `applySettings` vuelve a enumerar los modos en vez de preguntarle a `partirColor` | 1 (`"rgb"` no acaba en la variable CSS como si fuera un color) |
| **El arcoíris se queda quieto** (sólo reparto, sin giro) | 2 (el giro, y con una sola barra sigue habiendo color) |
| **El espectro entero se pinta de un color liso** (sólo giro, sin reparto) | 3 (el reparto, los dos extremos distintos, el cable) |
| Una sola barra divide por cero y sale sin pintar | 2 (el tono cae dentro de la rueda, con una sola barra sigue habiendo color) |
| El tono se sale de la rueda al cabo de un rato (sin cerrar la vuelta) | 1 (el tono siempre dentro de `[0, 360)`) |
| El arco cierra la vuelta entera: los dos extremos del espectro coinciden | 2 (el reparto, los dos extremos no acaban del mismo color) |
| El modo `rgb` deja de pintar barra a barra (vuelve al color fijo) | 1 (el cable: cada barra con su color) |
| `normalizarColor` no conoce `"rgb"`: el modo nuevo cae al de siempre | 4 (el cable, partir/unir, se guarda tal cual, no abre el cuentagotas) |
| La ventana se atenúa **también en pausa** | 3 (en pausa nunca, el caso pedido, subir el porcentaje en pausa) |
| El porcentaje se lee al revés: pedir 20 % deja la ventana al 20 % | 5 (medio bloque del atenuado) |
| Vuelve la resta con coma flotante (`0.19999999999999996` dentro del CSS) | 2 (el tope del rango, y el cambio en opciones) |
| `render` deja de atenuar: la preferencia no se nota nunca | 4 (todas las de extremo a extremo) |
| `render` atenúa siempre, sin mirar si suena | 1 (el caso pedido) |
| Cambiar el porcentaje en opciones no se nota hasta el estado siguiente | 2 (se nota sin esperar, volver a cero lo deshace) |
| `applySettings` vuelve a la caché en vez de usar las preferencias que recibe | 2 (las mismas) — **el defecto real: una segunda fuente de la misma preferencia** |
| El atenuado pierde su tope: se puede pedir la ventana entera invisible | 1 (fuera de `[0, 80]` se vuelve al cero) |
| **La letra en grande deja de superponer** (el síntoma reportado, tal cual) | 2 (los mandos flotan sea cual sea el tamaño, y las otras dos maquetaciones se apagan) |
| Superponer la letra no apaga la fila compacta: dos familias de CSS a la vez | 1 (las tres maquetaciones son excluyentes) |
| Superponer la letra no apaga la columna: dos familias de CSS a la vez | 1 (la misma) |
| El argumento nuevo se ignora: `layoutFor` vuelve a decidir sin la letra | 2 (las dos de superposición) |
| `applyDensity` no lee la clase de la letra | **sobrevive a propósito** (hace falta una ventana PiP real: ver arriba) |
| Los atajos se quedan con Ctrl+P y Alt+Flecha | 2 (la combinación es del navegador, y el atajo corta el evento) |
| Escribir en un campo de texto vuelve a pausar y silenciar | 2 (en un campo de texto se escribe; escribir no manda ninguna orden) |
| La lista de tipos de `<input>` se lee al revés: sólo hay atajos donde se escribe | 4 (campo de texto, casilla y botón, deslizador, escribir no manda nada) |
| Un `<div contenteditable>` deja de contar como campo de texto | 1 (en un campo de texto se escribe) |
| El deslizador de volumen pierde las flechas (se las come el atajo) | 1 (un deslizador enfocado se queda con las flechas) |
| El espacio sobre un botón enfocado pausa en vez de pulsarlo | 2 (el botón se queda con el espacio, y las líneas de la letra son botones) |
| Sólo cuentan los `<button>`: las líneas de la letra dejan de serlo | 1 (`role="button"` también es un botón) |
| Las mayúsculas dejan de valer (con Bloq Mayús no hay atajos) | 1 (con mayúsculas hace lo mismo) |
| Se pasa **todo** a minúsculas: `ArrowUp` deja de existir | 4 (el mapa, la repetición, los pasos de volumen, el acotado) |
| El mapa se consulta sin guardia: una tecla cualquiera devuelve basura | 1 (una tecla que no es de nadie no hace nada) |
| Mantener la `N` pulsada salta treinta canciones | 1 (sólo se repite lo que se puede deshacer) |
| Ninguna acción admite repetición: no se puede subir el volumen manteniendo la flecha | 1 (la misma, por el otro lado) |
| El atajo no corta el evento: el espacio pausa **y** hace scroll | 1 (el atajo corta el evento; una tecla ajena lo deja pasar) |
| El teclado no se cablea: los atajos no existen | 6 (todo el bloque de extremo a extremo) |
| Las flechas mueven el volumen de uno en uno | 2 (los pasos de cinco, y el acotado) |
| El volumen se sale del rango (se puede pedir un 105 %) | 1 (no se sale del cero ni del cien) |
| La música sube pero el deslizador se queda quieto | 2 (el deslizador acompaña, y el acotado) |
| El arrastre del volumen se sale de `mandarVolumen` y vuelve a decidir por su cuenta | 1 (arrastrar manda lo mismo que las flechas) — **la regla duplicada, otra vez** |
| Adelantar deja de leer los segundos de las preferencias | 1 (el teclado usa los segundos configurados) |
| Una anotación diminuta abre una ventana sin borde que agarrar | 2 (el acotado al abrir, y la criba al cargar de storage) |
| El alto anotado pierde sus topes | 2 (las mismas) |
| Un tamaño negativo o cero cuenta como tamaño | 2 (media anotación no es una anotación; no se anota nada) |
| Un `NaN` guardado en storage cuenta como tamaño | 3 (no consta ninguno ≠ uno pequeño; y las dos anteriores) |
| El tamaño guardado no pasa por la criba al cargarse | 1 (lo de storage pasa por la misma criba) |
| «El último» sin ninguno anotado revienta al abrir la ventana | 1 (la primera vez se abre compacta) |
| Una ventana recordada grande nace sin ampliar: el botón ⤢ la encoge | 1 (cuenta como ampliada) |
| El umbral de «ya está ampliada» se corre un píxel | 1 (la misma) |
| «Ya está ampliada» se decide por el ancho, que no es lo que el botón enseña | 2 (el caso pedido, y el umbral) |
| «El último» se impone a la preferencia elegida | 1 (no le quita el sitio a la elegida) |
| Anotar el tamaño no toca la caché: reabrir usa el de anteayer | 2 (caché y storage en la misma llamada) |
| Anotar el tamaño no llega a storage: se olvida al recargar | 6 (todo el bloque del cable) |
| Una medida imposible borra la anotación buena | 1 (no se anota en ningún sitio) |
| Mover el borde vuelve a repasar tema, espectro, atenuado y vídeo | 1 (mover el borde NO repasa las preferencias) |
| La excepción se lleva por delante **todos** los cambios en vivo | 1 (cambiar una preferencia de verdad sí repasa) |
| **Se anota el ancho del hueco interior**: la ventana encoge una sesión tras otra | 1 (se anota la ventana entera) |
| **Se anota el alto del hueco interior** | 1 (la misma) — la pareja de la anterior |
| Sin exterior no se anota nada, en vez de caer al interior | 1 (el interior es mejor que nada) |
| Redimensionar deja de anotar el tamaño | 2 (soltar el borde anota; varios tirones anotan una vez) |
| El vigilante no escucha el `resize` de la ventana | 2 (las mismas) |
| Se anota en cada tirón del borde, sin esperar a que suelte | 2 (las mismas) |
| Cerrar recién movido el borde pierde el tamaño | **sobrevive a propósito** (el volcado vive en `pagehide`, dentro de `openPip`, y jsdom no puede montar una ventana PiP real) |
| El vídeo vuelve a no latir (`&& !videoMode`, el comportamiento anterior) | 3 (el caso pedido, volver a una canción sin vídeo, y la regresión del cero) |
| La letra en grande deja de parar el pulso (se mide para nadie) | 3 (las dos de la letra en grande, y la regresión) |
| **CSS**: la regla del pulso vuelve a ser sólo de la carátula | 1 (el hueco del vídeo también crece) |
| **CSS**: el vídeo se queda sin fuerza propia y crece como la carátula | 1 (la misma) — **sobrevivió primero: la prueba miraba la regla equivocada** |
| **CSS**: `prefers-reduced-motion` se lo pierde salvo en los videoclips | 1 (quien pide menos movimiento tampoco quiere el vídeo latiendo) |
| El botón vuelve a prometer «carátula» mientras hace latir un vídeo | 1 (el botón no promete una carátula) |
| **MENÚ**: vuelve el `src` vacío (el navegador se pide `popup.html` como PNG) | 2 (el dibujo de reserva, y que no se difumine) |
| **MENÚ**: el `<img>` nace sin `src` (icono de imagen rota al abrir) | 1 (la reserva está puesta antes de que conteste la pestaña) |
| **MENÚ**: el fondo se queda con la carátula de la canción anterior | 1 (sin portada el fondo se vacía) |
| **MENÚ**: se difumina el dibujo de reserva (un blur para enseñar gris) | 2 (el fondo se vacía, y no se difumina la reserva) |
| **MENÚ**: la clase del fondo no se quita nunca (rectángulo oscuro sin portada) | 1 (sin portada el fondo se vacía) |
| **MENÚ/CSS**: el fondo con portada se queda sin opacidad | 1 (cuánto se ve lo decide la hoja) |
| **MENÚ**: vuelve a apagarse un botón de cuatro (el fallo original) | 3 (los cuatro se apagan, se vuelven a encender, un botón apagado no manda comando) |
| **MENÚ**: los botones se apagan pero no se vuelven a encender | 1 (vuelven al aparecer la pestaña) |
| **MENÚ/CSS**: el botón apagado vuelve a tener la pinta del encendido | 1 (un botón apagado se ve apagado) |
| **MENÚ/CSS**: el `:hover` se enciende también en los botones apagados | 1 (el hover no se enciende apagado) |
| **MENÚ**: el punto se enciende y ya no se apaga | 1 (se enciende con la pestaña y se apaga sin ella) |
| **MENÚ/CSS**: el punto de «conectado» se pinta con el color de lo pulsable | 1 (el verde no es el rojo de acento) |
| **MENÚ/HTML**: el punto deja de esconderse del lector de pantalla | 1 (el color no va solo) |
| **MENÚ**: el título de la canción deja de llegar a su sitio | 1 (título y artista llegan) |
| **MENÚ**: el botón grande deja de cambiar de dibujo | 1 (cambia de dibujo y de etiqueta) |
| **TEMPORIZADOR**: `fijar` pierde la criba de basura (`null <= 0` es cierto: un campo perdido APAGA el plazo) | 1 (basura no apaga un plazo en marcha) |
| **TEMPORIZADOR**: `comprobar` pausa pero no consume el plazo (la trampa para el próximo «play») | 3 (se consume, no se pausa dos veces, y el latido con el orquestador de verdad) |
| **TEMPORIZADOR**: se cae el tope de las 12 horas (un pedido enorme desborda `setTimeout` y pausa al instante) | 1 (lo absurdo se acota) |
| **TEMPORIZADOR**: el ciclo del botón pierde la salida (un temporizador que no se puede quitar) | 2 (el cuarto clic apaga, y la reacción al clic) |
| **TEMPORIZADOR**: el botón pierde el suelo del minuto (diría «0′» con la música sonando) | 1 (nunca 0′) |
| **TEMPORIZADOR**: el clic deja de repintar en el acto (pausado, el botón no cambiaría hasta el próximo latido) | 1 (reacciona al clic) |
| **TEMPORIZADOR**: `PlayerController` pierde el caso `SET_SLEEP_TIMER` (el comando muere en silencio) | 3 (el cable del comando y las dos del ciclo del botón) |
| **TEMPORIZADOR**: la firma del estado pierde el término del plazo | 1 (el plazo viaja con el estado) — **anunciada como superviviente y no lo era**: el arranque ya envió un estado, sin cambio de firma no sale otro, y la del latido lo caza |
| **ECUALIZADOR POR CANCIÓN**: `cargar()` deja de olvidar la canción actual (la que ya sonaba se quedaría sin su ajuste hasta la siguiente) | 1 (la carrera de la carga) |
| **ECUALIZADOR POR CANCIÓN**: se pierde la corrección de «lo que sonaba al empezar» tras una devolución (el ajuste retirado reaparecería dos canciones después) | 2 (la cadena, y la regresión derivada a mano) |
| **ECUALIZADOR POR CANCIÓN**: la prueba del delito vuelta `true` (se devolvería por encima de la elección del usuario) | 1 (el usuario toma el mando) |
| **ECUALIZADOR POR CANCIÓN**: se pierde el retorno temprano de «misma canción» en `alSonar` | **sobrevivió a las 22** — el cruce «fijada + usuario tocó + latido repetido» no estaba mirado; ganó su prueba y ahora 1 (latido repetido sobre la fijada) |
| **ECUALIZADOR POR CANCIÓN**: la criba de punto fijo desaparece (lo corrupto entra a la memoria) | 2 (entrada corrupta que se tira, y la criba de `cargar()`) |
| **ECUALIZADOR POR CANCIÓN**: la expulsión come por el final (se echaría lo recién fijado) | 1 (se echa a las más antiguas) |
| **ECUALIZADOR POR CANCIÓN**: el orquestador pierde la llamada del latido (la memoria queda sorda) | 1 (el cable entero) |
| **ECUALIZADOR POR CANCIÓN**: el clic de la chincheta deja de repintar en el acto | 1 (la chincheta al clic) |

Recuento de la última pasada de `tools/mutar-espectro.js`: **104 de 109 mutaciones
detectadas, 5 supervivientes**, y los cinco son los marcados arriba como
intencionados. Los otros dos mutadores siguen en **8 de 8** (`mutar-lanzador.js`)
y **12 de 12** (`mutar-repetir.js`), ambos sin supervivientes.

#### Tres formas de tener un arnés de mutación roto y en verde

La tanda del pulso sobre vídeo dio dos casos a la vez y el rediseño de las
Preferencias añadió el tercero. Ninguno es un defecto del código de la extensión:
son defectos **de las pruebas y del arnés**, que es exactamente lo que la mutación
existe para encontrar.

**Una prueba que miraba la regla equivocada.** Para comprobar que el vídeo tiene su
propia fuerza de pulso se había escrito esto:

```js
assert.match(hoja, /\.ytmpip-video-slot\s*\{\s*--ytmpip-pulse-strength:/);
```

Parece que busca la regla propia del vídeo. Encaja con la **compartida**: el
selector de arriba es `.ytmpip-artwork,\n.ytmpip-video-slot {` —o sea que también
termina en `.ytmpip-video-slot {`— y lo primero que lleva dentro es
`--ytmpip-pulse-strength: 0.1`. La comprobación se cumplía sola con la regla que ya
estaba comprobada tres líneas antes, y **borrar entera la fuerza propia del vídeo la
dejaba en verde**. No lo vio ninguna relectura; lo enseñó la mutación al sobrevivir.
Lo de ahora parte la hoja en reglas y busca una cuyo selector sea *exactamente*
`.ytmpip-video-slot`, y además comprueba que su fuerza sea **menor** que la de la
carátula —el sentido de la decisión— sin clavar el 0,06, que es un juicio y se
afina a ojo.

**Una mutación que apuntaba al vacío.** `tools/mutar-interruptor.js` tenía una
mutación cuyo texto era `!YTMPip.Ecualizador.estaApagado(valor)`. El día que
`pintarEcualizador` se guardó el módulo en un `const Eq` de una línea —un
renombrado de los que no cambian nada— ese texto dejó de existir, y desde entonces
la mutación no protegía ninguna prueba. Se caza porque el arnés **cuenta como
superviviente lo que no encuentra**, en vez de saltárselo en silencio; si se
limitara a no aplicarla, el informe seguiría diciendo «0 sobreviven» con una
comprobación menos.

**Una prueba que preguntaba por algo que no puede pasar.** La que comprueba que
ninguna regla del `<style>` de las Preferencias apunta a una clase inexistente
contaba los elementos que casan con cada selector y denunciaba los que daban cero.
Con el rediseño aparecieron los primeros `:hover` y `:focus-visible` de esa hoja, y
los denunció todos: **en un documento que nadie está tocando no hay nada
enfocado ni nada bajo el ratón**, así que el cero no significaba «esta clase no
existe» sino «esto no se puede preguntar así». Era el mismo error que ya se había
arreglado una vez con los `::before` —un pseudoelemento tampoco es un nodo del
documento—, cometido otra vez con la familia de al lado. Ahora se le quita el
estado al selector y se comprueba el elemento que lo lleva, que es lo único que
esta prueba sabe hacer y sigue cazando la errata de la `s` para la que se escribió.
Lo que **no** se toca son `:first-of-type`, `:last-child` o `:empty`: ésos sí casan
en un documento quieto, y ahí la pregunta seguía teniendo sentido.

Y un detalle que costó una pasada: en `/:(hover|active|focus|focus-visible|...)/`,
la alternancia de una expresión regular coge la **primera** que encaja, no la más
larga, así que `focus` se comía `:focus-visible` y lo dejaba en `-visible`. Las
largas van primero.

**Una mutación repuntada a tiempo, esta vez.** `tools/mutar-mandos.js` borra la
línea del preset «nocturno» del desplegable, con su sangría y su salto, para no
dejar un hueco en blanco. Al partir la página en tarjetas ese `<option>` bajó dos
niveles: de seis espacios a doce. La cadena vieja dejó de existir y la mutación se
habría contado como superviviente. **Se fue a buscar antes de tocar el archivo**,
precisamente por lo que había pasado con `mutar-interruptor.js` un día antes, y
está escrito en el propio mutador para que la próxima también se vaya a buscar.

La moraleja de las tres juntas: un banco de mutaciones **también se pudre**, y se
pudre callado. Vale lo mismo que un suite en verde que nadie ha intentado poner en
rojo.

Las dos filas del hueco interior van **en pareja**, una por dimensión, y esa
pareja es la moraleja de esta tanda. La primera versión de la prueba usaba un
exterior de 700×500 y un interior de 700×460: distinto alto, **mismo ancho**.
Estaba en verde y no vigilaba más que la mitad de la regla que decía vigilar; la
mutación del ancho sobrevivió sin despeinarse y fue el único superviviente no
previsto de la pasada anterior (102 de 108). Una prueba que sólo comprueba una de
las dos mitades de una regla es una prueba que miente sobre lo que cubre, y no hay
forma de saberlo mirándola: hace falta romper el código a propósito por los dos
lados.

La tercera cubre el fallo que apareció tres veces en uso real: al recargar la
extensión, `chrome.runtime.sendMessage` lanza de forma **síncrona**, y un
`.catch()` no atrapa un throw síncrono.

Dos filas —la del vídeo prestado y la del acotado numérico— no son hipotéticas;
salieron de encontrar el defecto con la prueba puesta:

- Las pruebas del vídeo prestado **pasaban con el código roto** en su primera
  versión, porque movían el `<video>` a otro `<div>` de la misma página y el
  adaptador lo seguía encontrando con su selector de reserva. Ahora el elemento se
  traslada a un `document` aparte (`createHTMLDocument`), que es lo que ocurre de
  verdad, y cada prueba afirma primero su propia premisa: que desde la página ya no
  se ve ningún `<video>`.
- El acotado numérico era un defecto real que encontró el test: `Number(null)` vale
  `0`, que es finito, así que un `SEEK_TO` al que se le hubiera perdido el campo por
  el camino pasaba el filtro y **saltaba al principio de la canción**. Peor que no
  hacer nada, porque parece intencionado. Lo mismo habría silenciado la música con
  `SET_VOLUME`.

> Nota para quien toque el arnés: `crearEntorno` **debe** pasar
> `runScripts: "outside-only"` a jsdom. Sin esa opción, `window.eval` existe, no
> lanza y **no hace nada**; los módulos parecen cargarse y `win.YTMPip` queda
> `undefined`. `cargar()` lleva una comprobación explícita para que eso reviente
> con un mensaje claro en vez de repetir el mismo fallo silencioso que estas
> pruebas existen para evitar.

## Empaquetado

```bash
npm run empaquetar   # -> dist/music-pip-1.0.0.zip
```

`tools/empaquetar.ps1` copia solo `manifest.json`, `src/` y `assets/` mediante
lista blanca, y aborta si detecta `better-lyrics-master`, `tools`, `tests`,
`node_modules` o `.git`. No usa `Compress-Archive`: en Windows PowerShell 5.1
escribe las rutas internas con barra invertida y la especificación ZIP exige barra
normal.

## Publicar en la Chrome Web Store

### Publicar es otro programa

Todo lo que hay en este README hasta aquí trata de que la extensión **funcione**.
Publicarla resultó ser un problema de otra clase, y el día que se preparó el
paquete salieron dos defectos que lo dejan claro:

- la descripción del manifiesto tenía **137 caracteres** y la ficha admite **132**;
- se pedía **`activeTab`** y no aparece en ninguna línea de código, solo en el
  manifiesto.

Con los dos defectos puestos, la extensión se instala, suena, se ve bien y pasa
las 446 pruebas que había. No rompen nada. Lo único que hacen es impedir que se
publique, y la forma de enterarse es subir el ZIP, esperar, y leer un mensaje en
una pantalla de Google que no dice cuál de las quince cosas está mal.

Esa asimetría —defectos invisibles desde dentro, caros desde fuera— es la razón
de `tests/unit/manifiesto-tienda.test.js`. Las reglas de la tienda vivían donde
peor pueden vivir unas reglas: **en la documentación de otra empresa y en un
formulario web**, o sea, en ningún sitio que se ejecute. La prueba baja aquí las
que se pueden comprobar sin cuenta y sin red:

| Lo que sujeta | Por qué duele si se rompe |
| --- | --- |
| La descripción cabe en 132 | El ZIP se rechaza al subirlo, no al instalarlo |
| Y sigue diciendo «no oficial» | Es lo primero que sobra cuando recortas para que quepa |
| El nombre del manifiesto es el que lee el usuario | La tienda anunciaría un nombre y el producto enseñaría otro |
| Ningún permiso sin justificación, ninguna justificación caducada | En la ficha hay que explicar cada permiso por escrito |
| El dominio, igual en los tres sitios | Un content script que entra donde no tiene permiso de host falla en silencio |
| Todo archivo nombrado existe | Un `src` mal escrito no lo ve nadie hasta instalar |
| Todo archivo nombrado **viaja en el paquete** | Ver abajo: es el caro |
| La versión no se cuenta dos veces | `package.json` y el manifiesto se separan solos |

**La fila cara es la del paquete.** El empaquetador usa lista blanca:
`manifest.json`, `src`, `assets`. El día que alguien meta en `content_scripts` un
`vendor/algo.js`, el ZIP se construirá sin protestar, pesará lo de siempre, se
subirá bien, pasará la revisión, y la extensión estará rota en cuanto se instale,
porque ese archivo no va dentro. El manifiesto seguiría siendo correcto; lo
incorrecto sería el sobre. La prueba **lee la lista blanca del propio `.ps1`** en
vez de copiarla: si se copiara, seguiría en verde después de cambiarla allí.

### El nombre estaba escrito a mano en seis sitios

Al renombrar de «YouTube Music PiP» a «Music PiP» apareció otra vez la lección de
siempre. El nombre vivía en el manifiesto, en el título del menú, en el título y
en el encabezado de Preferencias, y en las dos etiquetas del botón que se inyecta
en la página. Seis copias de una cosa que se cambia entera o no se cambia.

No se puede dejar de repetirlo —son tres documentos sin nada compartido, igual
que el rojo del acento— pero sí se puede exigir que las copias coincidan, y eso
es lo que hace `EL NOMBRE DEL MANIFIESTO ES EL QUE LEE EL USUARIO`. La mutación
que lo comprueba deja el manifiesto con un nombre y el producto con otro: es
justo el detalle que un revisor lee como «esto no es lo que dice ser».

### Lo que ninguna prueba de aquí puede decir

Si el paquete se acepta. La mitad de las reglas las aplica **una persona
leyendo**, y contra eso no hay arnés. En concreto, tres cosas quedan fuera del
alcance de este repositorio y son de quien publica:

1. **La cuenta de desarrollador y la tarifa única de registro.** La
   documentación oficial no publica el importe; lo dice el panel al pagar.
2. **El material gráfico que no existe aquí**: capturas (mínimo 1, máximo 5, a
   1280×800) y el mosaico promocional de 440×280. El icono de tienda de 128×128
   sí está, en `assets/icons/`.
3. **Las declaraciones de privacidad.** Google exige política de privacidad
   **aunque los datos solo se guarden en local**, y las preferencias de esta
   extensión se guardan en local. Hace falta una URL donde alojarla.

Y una advertencia que conviene no perder: aunque el nombre ya no lleve la marca,
la descripción sí la nombra. Eso es uso descriptivo —dice con qué funciona, no
qué es— y por eso el descargo «no oficial, no afiliado a Google» está sujeto por
una prueba. No es una garantía: es lo único que se puede sujetar desde aquí.

## Ver la ventana flotante sin abrir la extensión

```bash
node tools/servidor-vista-previa.js   # -> http://127.0.0.1:8347/
```

Una rejilla con la **misma** ventana flotante a varios tamaños a la vez. Carga el
`pip.css` y el `pip.html` de verdad y solo cambia el origen de los datos, así que lo
que se ve ahí es lo que se verá en la ventana real; dentro de cada iframe
`innerWidth`/`innerHeight` valen lo que mide el recuadro, que es justo la señal que
usa `applyDensity()`.

Cada recuadro es un `src/options/vista-previa.html` con parámetros (el marco vive
en `src/options/` porque la página de Preferencias lo incrusta), y se pueden abrir
sueltos para mirar un estado concreto a un tamaño cualquiera:

| Parámetro | Estado que pinta |
|---|---|
| `?video=1` | pista con imagen: el `<video>` ocupa el escenario |
| `?letra=1` | karaoke: la línea que suena bajo el artista, con su adelanto |
| `?letra=1&escenario=1` | la letra se lleva el escenario entero (panel completo) |
| `?limpio=1` | sólo carátula: sin título ni artista, como con el botón «Aa» |
| `?espectro=1` | el canvas del espectro, con barras inventadas a propósito |

Las barras del espectro son de mentira **a propósito**: lo único que hay que poder
mirar aquí es dónde cae el canvas y cuánto tapa, y para eso da igual de dónde
salgan los números. Copiar `barrasParaAncho` sería tener la misma regla en dos
sitios, que es el error que este proyecto ya ha pagado tres veces; la vista previa
sólo carga con una copia, la de densidad, y al menos lee los mismos umbrales de
`constants.js`.

Existe porque los dos fallos de maquetación se entregaron sin haberlos mirado nunca:
eran puramente visuales y ninguna prueba unitaria los podía ver. El servidor es un
estático de treinta líneas sin dependencias (hace falta uno porque el marco usa
`fetch()` sobre `pip.html`, y `fetch()` no funciona en `file://`). Nada de `tools/`
se empaqueta.

## La auditoría que se equivocó cinco veces de seis (y el catch mudo del menú)

Se pidió una revisión total del proyecto. La auditoría volvió con **seis hallazgos
técnicos** que sonaban graves: fuga del `MutationObserver`, condición de carrera en
las letras, catch silenciosos en el espectro, acumulación de temporizadores en la
ventana flotante, validación numérica duplicada y normalización del ecualizador en
dos sitios.

**Cinco eran falsos positivos.** Y no por matices: cada uno estaba ya resuelto a
propósito, con su razón escrita en un comentario justo en el sitio que la auditoría
señalaba como fallo:

- El observer que "fugaba" es el **modo degradado** (este mismo README, más
  arriba): apagarlo fue un error que ya se pagó y se documentó.
- La carrera de las letras ya se descarta comparando `songKey` antes y después de
  leer (`content-script.js`, `buildState`).
- Los catch del espectro dicen en su comentario por qué callan: si `resume()`
  falla se leen ceros y quien pinta decide; **la música no depende de eso**.
- Los temporizadores de la ventana cuelgan de `pipWindow` y mueren con ella; las
  variables se reinician al abrir precisamente para el caso "cerrar y abrir
  rápido" que la auditoría daba por roto.
- `toFiniteNumber` y `entero` **no son la misma regla** (uno parsea sin recortar,
  el otro redondea y acota con fallback), y `normalizar()` en `ecualizador.js` es
  la única autoridad sobre el ecualizador; lo de `options.js` hace otra cosa
  (recordar qué sonaba al apagar).

La lección no es nueva en este proyecto pero conviene dejarla contada: **una
herramienta que lee el código sin leer sus comentarios acusa exactamente las
decisiones más pensadas**, porque son las que a primera vista parecen descuidos. La
defensa fue el propio README y los comentarios: cada falso positivo se desmontó en
minutos porque la razón estaba escrita al lado del código.

**El hallazgo real: los dos últimos `.catch(() => {})` del menú.** En
`src/popup/popup.js`, `sendCommand` y el botón de abrir la ventana se tragaban el
fallo entero: el usuario pulsaba, la promesa rechazaba y no pasaba **nada** — ni
aviso en consola ni cambio en pantalla. El mismo fallo mudo que las pruebas del
menú ya perseguían, solo que en el camino de ida. Curiosamente `refreshState`, tres
líneas más arriba, sí reaccionaba (`render({ connected: false })`): la regla
existía y estos dos caminos no la seguían.

El arreglo usa esa misma regla — fallo → pintarse desconectado (botones apagados,
frase honesta) — más un `console.warn` con el tipo de comando, porque el menú tiene
su propia consola y sin él el fallo es invisible también para quien va a mirarla.

**Pruebas: 4 nuevas en `popup.test.js` (22 de 22 en verde; solo se corrió ese
archivo).** Tres del camino malo (la frase y los botones, el aviso único con el
nombre del comando, el botón de abrir) y una del bueno, para que el arreglo no se
pase de frenada: un catch que se disparara con la promesa resuelta apagaría el menú
en cada pulsación. El arnés ganó `fallanComandos` (la consulta inicial contesta y
todo lo demás rechaza, que es como falla de verdad) y ahora recoge los
`console.warn` en vez de dejarlos ensuciar la salida.

**Mutación dirigida: 4 de 4 muertas, y cada una por exactamente una prueba.** Se
quitó el `render()` y el `warn` de cada uno de los dos catch por separado,
restaurando el archivo entre mutación y mutación (verificado con `diff` contra la
copia). Que cada mutación la mate una sola prueba es la señal de que ninguna
aserción sobra: cada línea del arreglo tiene exactamente un vigilante.

Queda propuesto y **sin hacer** el troceo de `render()` en `pip.js` (~400 líneas):
pip.js no tiene pruebas y refactorizar a ciegas lo que funciona es comprar riesgo
sin síntoma.

## Los atajos de teclado del navegador (y el botón que la maqueta no tenía)

Primera mejora de funcionalidad tras los arreglos: cuatro atajos declarados en el
manifiesto (`commands`) que funcionan **sin tener la pestaña de YouTube Music
delante** — y, si el usuario los marca como «Globales» en
`chrome://extensions/shortcuts`, sin tener Chrome delante.

- `Alt+Shift+P` — abrir la ventana flotante
- `Alt+Shift+K` — reproducir o pausar
- `Alt+Shift+L` — canción siguiente
- `Alt+Shift+J` — canción anterior

J/K/L no es capricho: es la convención del propio YouTube (retroceder / pausar /
avanzar), así que las manos que ya la conocen no aprenden nada nuevo.

**Tres decisiones que merecen explicación:**

1. **`abrir-ventana` comparte el camino del icono, con su misma limitación.** La
   Fase 0 demostró que la activación de usuario **no viaja** del contexto del
   navegador al documento de la página: `requestWindow()` lanza `NotAllowedError`
   tanto desde el clic en el icono como desde un atajo. El atajo reutiliza
   `abrirPipDesdeElNavegador()` (el cuerpo del clic del icono, ahora extraído y
   parametrizado): intenta abrir y, si Chrome lo niega, **destaca el botón PiP de
   la página** para que el clic real lo dé el usuario. La descripción del comando
   en el manifiesto lo avisa, para no prometer lo que la plataforma no da.

2. **Nació `TOGGLE_PLAY`, un comando nuevo, en vez de reutilizar `PLAY`/`PAUSE`.**
   Quien pulsa el atajo no está mirando la pestaña: no sabe si suena o no. El
   service worker tampoco lo sabe *seguro* — solo tiene una caché del último
   estado, que puede mentir. El único que lo sabe es el `<video>`, así que la
   decisión viaja hasta él: `togglePlay()` le pregunta `paused` y delega en
   `play()`/`pause()` existentes. Sin `<video>`, pulsa el botón de la página, que
   ya es un alternador.

3. **Sin pestaña de YouTube Music, los atajos de reproducción no hacen nada**
   (salvo un `console.info`). La alternativa —crear la pestaña— sería absurda:
   nadie quiere que «pausar» abra una página. `abrir-ventana` sí la crea, porque
   ahí la intención es exactamente ésa, igual que con el icono.

**El error honesto de esta tanda:** la prueba «TOGGLE_PLAY sin `<video>` pulsa el
botón» reventó a la primera con `Cannot read properties of null` — la maqueta
`controles-completos.html` **no tiene** ningún botón que los selectores del
adaptador reconozcan como play/pause. La prueba ahora crea el botón ella misma
(`id="play-pause-button"`, el selector primario) y **asevera la premisa** antes de
actuar (`el adaptador no ve el boton`): si un día la maqueta gana ese botón o el
adaptador cambia de selector, la prueba dirá exactamente qué supuesto se rompió en
vez de fallar con un null críptico.

**Pruebas: 5 nuevas (31 de 31 en verde; solo se corrieron los dos archivos
afectados).** Cuatro de `togglePlay` en `player-controller.test.js` (sonando →
pausa, pausado → reproduce, sin `<video>` → botón, y que el comando llega por
`execute`) con espías sobre `play`/`pause` y `paused` redefinido con
`defineProperty`. La quinta, en `manifiesto-tienda.test.js`, es un puente textual
**en los dos sentidos**: cada atajo del manifiesto debe aparecer citado en el
service worker, y cada atajo que el service worker escucha debe estar declarado en
el manifiesto. Una regla en dos archivos no es una regla, son dos; esta prueba las
vuelve a atar.

**Mutación dirigida: 5 de 5 muertas.** Invertir la decisión de `togglePlay` → 2 en
rojo; quitar la rama sin media → 1; quitar el `case TOGGLE_PLAY` → 3; renombrar un
atajo **solo** en el service worker → 1; renombrarlo **solo** en el manifiesto → 1.
Las dos últimas son el puente haciendo su trabajo: cualquiera de los dos lados que
se mueva sin el otro, se enciende. Archivos restaurados y verificados con `diff`.

**Lo que ninguna prueba de este proyecto puede verificar:** que Chrome dispare de
verdad los atajos y que `Alt+Shift+J/K/L/P` no choquen con otra extensión o con el
sistema. Eso solo se comprueba en un Chrome real, en
`chrome://extensions/shortcuts`. Queda anotado en la validación manual pendiente.

## La cola de reproducción (y los selectores que aún son conjeturas)

La ventana flotante ganó un botón «Siguientes» que enseña las próximas cinco
canciones de la cola de YouTube Music: título y artista, en el orden en que van a
sonar. Los datos salen del mismo latido de estado que todo lo demás: el lector
(`readUpNext` en `metadata-reader.js`) busca en el DOM los elementos
`ytmusic-player-queue-item`, localiza el que lleva la marca `selected` (la canción
que suena) y se queda con las cinco siguientes.

**Las decisiones, y por qué:**

1. **Corta el lector, no la interfaz.** `QUEUE_MAX_ITEMS = 5` vive en
   `constants.js` y el corte se hace en el lector, antes de que el estado viaje al
   service worker. La cola real puede traer cientos de elementos; recorrerlos y
   enviarlos todos en cada actualización para que la ventana enseñe cinco sería
   pagar el trabajo grande para usar el resultado pequeño.

2. **El corte va ANTES que el filtro de filas vacías, a propósito.** Una fila sin
   título (un separador, o una fila a medio pintar por el scroll virtual) consume
   su hueco: quedan cuatro y la sexta no sube a ocupar el quinto puesto. Cortar
   después sería recorrer la cola entera buscando cinco títulos válidos, y es
   exactamente el recorrido que el punto anterior quería evitar. Hay una prueba
   cuyo único trabajo es que este orden no cambie en silencio.

3. **Sin la marca `selected` no se adivina: lista vacía.** Es la misma política
   que repetir y aleatorio: preferimos no enseñar cola a enseñar una inventada,
   porque sin la marca no hay forma de distinguir lo que viene de lo que ya sonó.

4. **Los selectores de la cola son conjeturas, y está escrito en el código.** Se
   escribieron sin HTML real de la página delante, que es el mismo pecado que
   costó el bug de las letras («no disponible» siempre, sin un solo error en
   consola). Esta vez la deuda quedó declarada: el adaptador lleva un aviso, y
   `tools/diagnostico-cola.js` existe para pegarlo en la consola de la página real
   y responder cuatro preguntas: si hay elementos de cola en el DOM (y si existen
   sin abrir el panel lateral), si alguno lleva `selected`, si el título y el
   artista están donde se buscan, y cuántos hay en total (por si la lista está
   virtualizada y «las siguientes» ni siquiera están todas en el DOM).

5. **Un solo hueco elástico: letra y cola no conviven.** Los dos paneles comparten
   el mismo espacio flexible de la ventana; abiertos a la vez, ninguno diría nada.
   Abrir uno cierra el otro, en ambos sentidos. Y la mitad delicada: cuando la
   cola desplaza a la letra, se anota como decisión del usuario, porque si no el
   modo karaoke —que abre el panel de letra por su cuenta en cada estado con letra
   disponible— la reabriría encima de la cola y el clic en «Siguientes» duraría
   exactamente un estado. El render, además, comprueba explícitamente que la cola
   no esté abierta antes de auto-abrir la letra.

6. **La firma del estado lleva los títulos, no el tamaño.** La deduplicación de
   envíos compara títulos concatenados: al pasar a la siguiente canción, la cola
   rota manteniendo el tamaño (sale una, entra otra), y una firma que solo contara
   elementos dormiría la actualización.

**El error honesto de esta tanda:** las primeras cuatro pruebas del lector
fallaron con un mensaje desconcertante: «Values have same structure but are not
reference-equal», comparando dos arrays idénticos a la vista. La causa no estaba
en el lector sino en el arnés: los arrays del lector nacen en la ventana de jsdom,
y `deepStrictEqual` distingue el `Array` de un *realm* del `Array` de otro (mismo
contenido, prototipos distintos). El arreglo fue de las pruebas, no del código:
`Array.from` para «nacionalizar» los arrays al realm de la prueba antes de
compararlos. El resto de suites no había pisado esta mina porque comparan valores
sueltos, no estructuras que cruzan la frontera.

**Pruebas: 12 nuevas, 12 de 12** (y después, por primera vez en varias tandas, la
suite completa: 645 de 645 — lo que eso destapó tiene su propia sección más
abajo). Seis del lector
(`cola.test.js`, con el fixture `cola.html`: la canción sonando en medio, una
anterior y seis por venir —una más que el máximo, para que el corte tenga algo que
cortar—) y seis de la ventana (`pip-cola.test.js`: pintado, mensaje de vacío,
botón con `aria-expanded`, exclusión mutua en los dos sentidos y el karaoke
respetando la cola abierta, con su control: sin cola abierta, ese mismo estado SÍ
abre la letra).

**Mutación dirigida: 7 de 7 muertas.** Empezar el corte EN `selected` en vez de
después (la que suena se cuela) → 4 en rojo; quitar la guarda de `selected`
ausente → 1; quitar el corte a `QUEUE_MAX_ITEMS` → 3; quitar el filtro de filas
sin título → 1; abrir la letra sin cerrar la cola → 1; abrir la cola sin cerrar la
letra → 1; el karaoke ignorando la cola abierta → 1. Archivos restaurados y
verificados volviendo a correr las 12 en verde.

**Lo que ninguna prueba de este proyecto puede verificar:** que los selectores de
la cola existan en la página real, que la marca se llame `selected` de verdad, y
que la cola esté en el DOM sin abrir el panel lateral del reproductor. El fixture
es la estructura que el adaptador ESPERA, no una copiada de Google. Eso se
comprueba en un Chrome real con `tools/diagnostico-cola.js`; queda anotado en la
validación manual pendiente.

## La avería que destapó correrlo todo

Al cerrar la función de la cola se corrió la suite completa para cotejar el total,
y la suite **no terminaba nunca**: el runner se quedaba esperando para siempre a
`pip-color-fuente.test.js`. Primero se sospechó de la cola (era lo recién tocado),
así que se desactivaron temporalmente sus dos costuras en `render()` y se volvió a
correr: fallaba igual. La avería era anterior, y llevaba tandas escondida
precisamente porque cada tanda corría solo sus archivos nuevos. Eran tres cosas
trenzadas:

1. **`pararMuestreoFuente` olvidaba el color aunque no hubiera muestreo en
   marcha.** La función corre en cada render con el espectro escondido, y el
   olvido incondicional borraba un color recién fijado antes de que nadie llegara
   a pintarlo: el espectro en modo «el de la portada» se pintaba con el acento.
   Su propio comentario describe el olvido como cosa de la transición
   encendido→apagado, así que el arreglo fue alinear el código con su comentario:
   sin nada en marcha, no hay nada que parar ni que olvidar. Tres pruebas del
   archivo fallaban por esto; ahora explican por qué la guarda existe.

2. **Una prueba pedía el camino largo del círculo de tonos.** Al suavizar de 0 a
   200 grados esperaba pasar por el 100, pero 200 grados es más de media vuelta y
   `mezclarHsl` va por el camino corto a propósito (su comentario lo dice: «de
   350 a 10 grados hay 20, no 340»), así que el color retrocede por el 360 y el
   intermedio legítimo es un 348, no un 50. Aquí el arreglo fue **de la prueba**,
   no del código: el código hacía exactamente lo que su comentario prometía. Es
   la lección de las auditorías otra vez, en dirección contraria: antes de
   arreglar lo raro, leer el comentario de al lado.

3. **El colgadero en sí: intervalos de verdad sin ventana que cerrar.** Las
   pruebas del muestreo encienden un `setInterval` real en la ventana de jsdom y
   nadie lo apagaba al terminar, así que el proceso del archivo no moría nunca y
   `node --test` esperaba eternamente (de ahí venían también dos procesos `node`
   zombis de días anteriores, uno con horas de CPU quemadas). El archivo ahora
   apunta sus ventanas y las cierra al final; con eso la suite completa terminó
   por primera vez: **645 de 645, en 45 segundos**. (Los 45 segundos también son
   noticia: mientras los zombis vivían, la misma suite tardaba minutos en llegar
   a la mitad.)

La moraleja quedó arriba, en «Pruebas»: el total del README ya no es una suma
manual sino el número que imprime el runner, y la suite completa merece correrse
al cerrar cada función, no solo los archivos nuevos — es exactamente el tipo de
avería que «correr solo lo tocado» no puede ver.

## Hablar el idioma del navegador (la localización)

La extensión nació hablando español y así se queda por dentro: el español es el
`default_locale` y el inglés es la traducción, no al revés. Los catálogos viven
en `_locales/es/messages.json` y `_locales/en/messages.json` (178 claves cada
uno) y el navegador elige el idioma solo — no hay selector propio porque Chrome
ya tiene uno y duplicarlo sería mantener dos respuestas a la misma pregunta.

El módulo `src/shared/textos.js` es la única puerta hacia `chrome.i18n`, con dos
caminos para dos clases de texto:

- **`t(clave, sustituciones)`** para lo que JavaScript escribe en caliente
  («Pausar»/«Reproducir», «Adelantar 10 segundos»). Si nadie contesta, devuelve
  la **clave pelada**, no un texto vacío: una clave a la vista es un fallo que se
  ve y se arregla; un `""` es un botón mudo que nadie reporta.
- **`aplicar(doc)`** para lo que ya está escrito en el HTML, marcado con
  `data-t` (contenido), `data-t-title`, `data-t-aria` y `data-t-alt`. El español
  **se queda escrito dentro del HTML a propósito**, con el mismo criterio que los
  emoji detrás de los SVG: es lo que se ve si esto no llega a correr. Y como toda
  redundancia se desincroniza en silencio, una prueba recorre los tres HTML y
  exige que cada texto inline y su entrada del catálogo español sean **el mismo
  texto** — el catálogo español se generó desde el propio HTML precisamente para
  arrancar con esa igualdad byte a byte.

La caché de `textos.js` no es una optimización: es el **paracaídas del contexto
invalidado**. Cuando la extensión se recarga con la ventana abierta,
`chrome.i18n.getMessage` deja de contestar (o revienta); sin caché, cada
repintado iría borrando las etiquetas que el usuario ya tenía delante. Con ella,
el último texto bien resuelto se sigue sirviendo, cacheado por clave **y**
sustituciones, porque «Adelantar 10 segundos» y «Adelantar 30 segundos» son
respuestas distintas de la misma clave.

Lo que **no** se traduce, a propósito: la marca «Music PiP» (un nombre propio),
los mensajes de consola (hablan con quien depura, no con quien oye música) y las
claves internas de presets o comandos (identificadores, no frases). Los nombres
de presets y de bandas del ecualizador van por **catálogo con respaldo**: se
pide `preset_voz` al catálogo y, si no contesta, se cae a
`EQUALIZER_PRESET_LABELS.voz` — y una prueba exige que catálogo y respaldo digan
lo mismo, para que el texto no dependa de quién contestó.

La ficha de la tienda también se localizó: la descripción del manifiesto es
`__MSG_extension_descripcion__` y las pruebas de la tienda ahora resuelven el
`__MSG__` **por cada idioma** — el tope de 132 caracteres y el descargo de «no
oficial» se comprueban en español y en inglés con expresiones propias por
idioma, y un idioma nuevo sin descargo registrado falla a propósito.

**Los errores de esta tanda, para que consten:**

1. **Tres pruebas del interruptor del ecualizador amanecieron con claves peladas
   en los `aria-label`** («ecualizador_estado» donde debía decir el estado). La
   causa no estaba en el interruptor: ese archivo de pruebas construye su propio
   `win.chrome` a mano (para su doble de storage con memoria) y ese objeto
   **reemplaza entero** al del arnés, así que quedó sin `i18n` aunque
   `textos.js` sí estaba cargado — `mensaje()` devolvía `null` y `t()` hacía
   exactamente lo prometido: enseñar la clave. El arreglo fue darle al chrome
   artesanal el mismo `i18nFalso` del arnés. La lección es vieja: un doble que
   reemplaza en vez de extender hereda la obligación de reponer lo que quitó.
2. **La prueba «un preset sin nombre enseña su clave» habría pasado a mentir**:
   con el catálogo puesto, silenciar solo la constante ya no deja al preset sin
   nombre, porque el catálogo contesta por él. El sabotaje ahora silencia **las
   dos fuentes**, que es lo que de verdad le pasaría a un preset recién nacido
   sin bautizar. Se detectó al razonar la tanda, no corriéndola — pero por poco.
3. **Un error de dedo propio**: en un comentario quedó escrito `&#47;` (la
   entidad HTML) donde iba una barra `/`, herencia de generar texto pensando en
   HTML mientras se escribía JavaScript. Sin consecuencia funcional; corregido.

El arnés ganó `i18nFalso(opciones)`: un `chrome.i18n.getMessage` de mentira que
lee el **catálogo español real**, para que las pruebas de etiquetas afirmen lo
que el usuario ve (si el catálogo se desvía, las pruebas lo sienten), y que con
`contextoValido: false` **revienta** igual que el Chrome de verdad, que es lo
que ejercita el paracaídas.

## La ventana que anuncia el cambio de canción (y el contraste con las cuentas hechas)

La mitad de la accesibilidad de esta ventana ya existía sin llamarse así: los
atajos de teclado, los `aria-label` que cambian con el estado, el
`:focus-within` que no le esconde los mandos a quien navega con tabulador. Lo
que faltaba era lo contrario de todo eso: algo para el momento en que **nadie
está mirando la ventana** y la música avanza sola. Eso es el anuncio.

**Una región `aria-live` cosida en el HTML desde el montaje.** Los lectores de
pantalla solo vigilan regiones que ya existían al montarse el documento;
crearla en caliente es hablarle al vacío. Por eso `#ytmpip-anuncio` vive en
`pip.html` con `role="status"`, `aria-live="polite"` y `aria-atomic="true"`
—`role="status"` ya implica los otros dos, pero escritos son la parte que las
pruebas pueden leer sin adivinar qué implica qué en cada lector— y pip.js solo
le escribe el texto. Es además el **único nodo del HTML que nace vacío a
propósito**, sin español de reserva ni marcas `data-t`: un texto de fábrica se
anunciaría al montar como si sonara una canción que no existe. La regla de «el
español queda escrito en el HTML como plan B» tiene aquí su primera excepción
deliberada, y una prueba vigila que siga siendo excepción.

**Quién decide cuándo anunciar: la misma pregunta que ya se contestaba.** La
animación del cambio de canción ya tenía la única pieza que importa —¿esto que
llegó es OTRA canción?— guardada en `lastSongKey`. El anuncio no duplica esa
memoria: la función se renombró (`maybeAnimateSongChange` →
`alCambiarDeCancion`) y ahora hace las dos caras de la misma noticia, animar
para quien mira y anunciar para quien no. Tres negativas deliberadas:

- **La primera canción no se anuncia**: no es un cambio, es el estado con el
  que la ventana nace, y quien acaba de abrirla tiene el título delante.
- **El repintado no se anuncia**: `render()` corre con cada latido, muchas
  veces por canción; reescribir la región en cada uno haría que el lector
  repitiera la noticia sin parar — el anuncio se volvería la razón para
  silenciar al lector.
- **La nada no se anuncia**: al acabarse la cola cambia la firma de la
  canción, pero «Ahora suena» sin canción es ruido para quien no puede
  ignorarlo con la vista.

Y un detalle de dicción: sin artista se usa la clave corta («Ahora suena X»),
porque la larga con el hueco vacío sería leer la costura en voz alta («Ahora
suena X, de»).

**La clase que oculta sin silenciar.** `.ytmpip-solo-lector` es la receta
clásica del *visually hidden* (1×1, `clip-path`, absoluto) y NO puede ser
`display:none` ni `visibility:hidden`: los dos sacan el nodo del árbol de
accesibilidad, que sería ocultar la región exactamente para su único público.
Una prueba textual lo vigila, y comprueba también que la receta de verdad
oculte — un bloque vacío pasaría el «no silencia» sin hacer nada.

**El contraste, calculado y no prometido.** La otra mitad del pendiente de
fase 3 era «contraste en ambos temas», y la respuesta es una prueba que hace
las cuentas oficiales de WCAG (luminancia relativa, composición alfa) sobre
las variables reales de `pip.css`: texto y texto tenue sobre el fondo de cada
tema ≥ 4.5 (AA), el acento como tinta de componentes ≥ 3, el blanco fijo del
botón de reproducir sobre el acento ≥ 3 (leído del CSS, no copiado), y la
promesa del velo —«garantiza contraste del texto sea cual sea la imagen», dice
pip.html— puesta a prueba en su extremo inferior con el peor disco posible:
portada blanca pura contra el tema oscuro, negra pura contra el claro. Todos
los pares pasan hoy; la prueba existe para que el próximo que toque un color
se entere en el acto y no en una queja.

**Lo que la excavación destapó, para que conste.** Al modelar el velo salió
una verdad incómoda que el plan aprobado no cubría y que se deja escrita en
vez de barrida: el degradado del velo protege el texto del cuerpo (abajo,
0.88 de opacidad) pero la **cabecera vive bajo el tramo débil** (0.55). Con
una portada blanca pura en tema oscuro, el texto tenue del estado («Conectado
a YouTube Music», 11 px) queda en ≈ **4.2:1**, un pelo por debajo del 4.5 de
AA; y con la letra en grande (`--ytmpip-fondo: 0.8`, la portada como único
dibujo) baja hasta ≈ **2.8:1**. No es teórico del todo —hay discos blancos—
pero tampoco es el caso común, y arreglarlo tiene un conflicto de diseño de
verdad: subir el velo a lo que pide la cuenta (≈ 0.72 arriba) mataría
exactamente lo que «la letra en grande» quiere, que es ver la portada. Queda
en Pendiente como decisión de diseño abierta (¿velo local para la cabecera?,
¿tinta plena para el estado?), no como descuido: las cuentas están hechas y
los números son estos. *(Una tanda después la decisión se tomó con una maqueta
delante y ganó el velo local: la historia sigue en la sección siguiente.)*

## El velo local de la cabecera (la decisión abierta, cerrada con la maqueta delante)

La decisión no se tomó discutiendo sino mirando: antes de tocar producción se
construyó una maqueta (`tools/comparacion-cabecera.html`, servida por el
servidor de vista previa de siempre) que **lee las variables del `pip.css`
real por `fetch`** —sin copias que se desincronicen—, compone el peor caso
exacto capa a capa (fondo del tema ← portada extrema a la opacidad del modo ←
parada débil del velo general) y pinta las tres cabeceras lado a lado —hoy,
velo local, tinta plena— con el contraste calculado debajo de cada celda.

**Lo que la maqueta enseñó que las cuentas a mano no habían dicho:**

- **El tema claro también fallaba.** El hallazgo original estaba documentado
  con números del tema oscuro; la maqueta mostró que con portada negra pura y
  la letra en grande el estado del tema claro quedaba en **3.97:1**. El
  problema era de los dos temas.
- **La tinta plena no arregla «Sin conexión».** La opción B dejaba el estado
  normal con nota alta (hasta 13.4:1) y tenía precedente en el propio CSS
  (los botones de la cabecera sobre el video ya usan `--ytmpip-text`), pero el
  estado desconectado usa la tinta de acento —no puede pasarse a tinta plena
  sin perder su señal de error— y se quedaba en **1.75:1** en el peor caso, en
  las ocho casillas. Y es justamente el estado que más necesita leerse.
- **La opción A ya existía sin nombre.** El modo superpuesto (video pequeño)
  tenía desde antes su propia banda de 42 px detrás de la cabecera (el
  `::before` de `.ytmpip-content`): el velo local no es un invento nuevo sino
  la misma respuesta que el proyecto ya se había dado para el video, ahora
  para el resto de modos. Por eso en el superpuesto el velo local **se apaga**
  (`display: none`): banda sobre banda no vela más, solo tapa más.

**Cómo está hecho.** Una variable por tema (`--ytmpip-velo-cabecera`: 0.78 en
oscuro, 0.85 en claro, que parte con menos contraste y pide más velo), pintada
por un `::before` de la cabecera con `z-index: -1` y `pointer-events: none`.
Tres decisiones con intención:

- **Sólido mientras hay texto, desvanecido solo en la cola.** El degradado
  mantiene el alfa entero hasta `calc(100% - 12px)` y muere en los 12 px que
  asoman por debajo de la cabecera (`bottom: -12px` — una prueba vigila que
  cola y desborde midan lo mismo). Así las cuentas del contraste valen con el
  alfa entero, y el pacto con «la letra en grande» se cumple: la portada se
  sigue viendo del título hacia abajo.
- **El relleno del contenido pasó a variables** (`--ytmpip-relleno-arriba/lado`)
  porque el velo las **resta** para llegar a los bordes de la ventana, y mini
  las redefine (5/8 px) en un solo sitio. Escrito como número suelto, cambiar
  el relleno dejaría una tira sin velo en el borde — la lección que ya había
  enseñado `--ytmpip-fondo`.
- **El atenuado lo hereda gratis.** Por vivir dentro de `.ytmpip-content`, el
  velo baja y vuelve con el mismo `opacity` que el texto que protege: nunca
  queda la banda sin texto ni el texto sin banda.

**Los números después** (los ocho peores casos, calculados por la prueba, no
prometidos): tema oscuro con portada blanca pura, estado **8.12:1** en reposo
y **7.59:1** con la letra en grande, «Sin conexión» **5.15:1** y **4.81:1**;
tema claro con portada negra pura, estado **6.46:1** y **6.31:1**, «Sin
conexión» **4.73:1** y **4.62:1**. Todo ≥ 4.5 (AA para el texto de 11 px).

**Para que conste, lo que no salió redondo.** La captura de la rejilla real
con el velo puesto nunca llegó: los espectros animados de los 29 marcos no
dejan reposar al renderizador y la foto expiraba una y otra vez. La
verificación se hizo leyendo los estilos computados de los 29 marcos (velo con
relleno 8/10 en modos normales, 5/8 en mini, apagado en todos los superpuestos)
más la maqueta, que para eso se construyó primero. Y las tres pruebas nuevas
pasaron a la primera con las nueve mutaciones cazadas — el detalle de los
recuentos está arriba, en la tanda del velo de la cabecera.

## El anuncio, oído por un lector de pantalla de verdad

El pendiente decía «que jsdom no puede oír», y era literal: las siete pruebas
del anuncio verifican el texto de la región `aria-live`, pero ninguna puede
jurar que un lector real lo **pronuncia** cuando cambia la canción y **calla**
cuando debe callar. Se validó con NVDA 2026.2 en Windows, y la evidencia no es
«lo escuché» sino un registro escrito de cada frase que NVDA dijo.

**El montaje.** Un banco nuevo (`tools/validacion-anuncio.html`, servido por el
servidor de vista previa de siempre) monta la ventana flotante **real** —
`pip.html` + `pip.css` + `pip.js`, sin copias — dentro de un iframe cuyo
documento se escribe **de una pieza al nacer**: la región `aria-live` existe al
montarse el documento, que es la condición que los lectores exigen. Lo único
fingido es `chrome.*`, un remedo mínimo cuyo `chrome.i18n` lee el catálogo
español real de `_locales`. Con `?auto` el guion corre solo en bucle (numera
las canciones en cada vuelta para que «otra canción» siga siendo otra). NVDA
se instaló portátil, sin permisos de administrador, con el **sintetizador de
silencio** y el registro de depuración a nivel entrada/salida: cada frase que
NVDA pronuncia queda escrita como `Speaking [...]` con marca de tiempo. La
evidencia se lee, no se recuerda.

**El veredicto, con las líneas del registro delante:**

| Comportamiento | Esperado | El registro de NVDA |
|---|---|---|
| Primera canción | CALLAR | «Vals de medianoche 1»: **0 apariciones** |
| Cambio de canción | ANUNCIAR | `15:23:52 Speaking ['Ahora suena Luna llena 1, de Trío Nocturno']` (y las vueltas 2 y 4) |
| La misma repintada | CALLAR | 0 duplicados en la captura limpia |
| Sin artista | corto, sin coma huérfana | `15:24:44 Speaking ['Ahora suena Sola 2 ']` |
| Cola vacía | CALLAR | 0 anuncios vacíos |

**Para que conste: hicieron falta tres capturas, y las dos sucias enseñaron
más que la limpia.** La primera trajo frases que el guion numerado no podía
producir y una «Luna llena 1» repetida que el paso 3 prohíbe; en vez de cantar
victoria se leyó el registro con lupa. Los contaminantes fueron dos: la
ventana de vista previa de la prueba de humo seguía abierta con el mismo banco
(un segundo documento con la misma región viva) y, peor, una **pestaña
fantasma de Edge con una versión vieja del arnés** —sus frases iban sin
número, esa fue la huella que la delató— llevaba media hora en bucle. La
segunda captura destapó otra regla que conviene saber: con Edge en segundo
plano el registro se llenó de Zoom y Outlook y **ni un solo anuncio**, porque
NVDA solo anuncia regiones vivas de la aplicación en primer plano (y los
temporizadores de las pestañas de fondo se estrangulan). No es un defecto del
código: es cómo funcionan los lectores, y significa que el anuncio del PiP
suena solo cuando la ventana flotante —o quien la contenga— tiene el foco.
La tercera captura, con una sola pestaña viva, dio la tabla de arriba; los
anuncios que faltan en ella («Sola 1», «Vals 2», la vuelta 3 entera) coinciden
al segundo con recordatorios de Outlook y ventanas de Zoom robando el primer
plano en una máquina de trabajo real — el mismo comportamiento, visto del
otro lado.

**Lo que queda honestamente fuera.** VoiceOver pide un Mac y esta máquina es
Windows: queda pendiente, dicho sin adorno. El banco no se empaqueta
(`tools/` está fuera de la lista blanca del empaquetador) y no tocó ni una
línea de producción: la validación confirmó lo que las pruebas ya vigilaban,
que es exactamente lo que una validación debe hacer.

## La fase 0: el sitio real, por fin delante

Toda la extensión se había construido contra fixtures que imitaban a YouTube
Music; la fase 0 era ponerla delante del original. Se hizo con la extensión
cargada de verdad en Chrome, música sonando de verdad, y el DOM vivo
interrogado selector por selector.

**El mapa de selectores, confrontado entero.** De las 24 claves del
adaptador, 22 atinan con su selector de máxima prioridad en el DOM de hoy.
Las dos fuentes de tiempo coinciden entre sí y con el `<video>` (`1:52/3:53`
= deslizador `112/233` = `currentTime` 113). **Repetir y aleatorio, los que
llevaban el aviso de «SIN VERIFICAR contra HTML real», quedan saldados**:
`.repeat` y `.shuffle` existen tal cual. Y la cola respondió las cuatro
preguntas de `diagnostico-cola.js`: 78 elementos en el DOM **con el panel
cerrado** (la cola vive siempre, no a ratos), el `[selected]` presente y
coincidiendo exacto con la barra, y título y byline legibles donde se buscan.
`like-status="INDIFFERENT"` confirmó en vivo la señal sin idioma.

**La ventana flotante real, sobre el sitio real.** El clic del usuario en el
popup la abrió (la activación de usuario vía `chrome.scripting.executeScript`
funciona). Desde dentro se verificó lo que jsdom solo pudo fingir: el velo
local con sus números de producción (mini redefiniendo el relleno a −5/−8,
`z-index: −1`, degradado 0.78 — y el veredicto a ojo del usuario: «se ve
bien»); la región `aria-live` **vacía al abrir** (la canción que ya sonaba es
«la primera» y calló como debe); y el circuito entero de los mandos: el clic
en «siguiente» **de la ventana** movió la página real, la cola pasó su
`[selected]` del 6 al 7, y la región anunció «Ahora suena Ganjah en mi
habitación, de Zona Ganjah» — el anuncio validado con NVDA en el banco,
ahora visto en producción. Repetir cerró su ciclo completo desde la ventana
(`NONE → ALL → ONE → NONE`, el atributo `repeat-mode` de la barra real
respondiendo a cada clic) y quedó exactamente como estaba.

**El préstamo del `<video>`, la prueba que jsdom jamás pudo montar.** Con un
videoclip de verdad (`OMV_PREFERRED`): el `<video>` apareció dentro de la
ventana en su `ytmpip-video-slot`, reproduciendo, y **ausente de la página**;
al cerrar la ventana volvió a su padre original (`html5-video-container`, no
al contenedor de último recurso), sonando sin corte (segundo 82 al cerrar →
87 en la página), sin congelarse y pintado a tamaño completo.

**El hallazgo que pedía arreglo: las pestañas ya son cuatro.** «A
continuación · Letra · **Comentarios** · Relacionado» — y «Comentarios» entró
DESPUÉS de la de letras, así que la vieja lógica posicional (`headers[1]`)
seguía funcionando **de pura suerte**. Peor: ninguna cabecera lleva
`aria-label`, o sea que el «refuerzo» documentado estaba muerto (0 de 4
selectores de `lyricsTab` encuentran nada). El arreglo: `getLyricsTab()`
ahora busca por TEXTO («Letra»/«Lyrics», regex anclada y sin distinguir
mayúsculas) entre las `.tab-header` de la página del reproductor —texto
siempre atado a estructura, nunca suelto, como manda la regla de la casa— y
solo cae a la posición cuando el idioma no se reconoce. Confrontado con el
DOM vivo antes de fiarse: elige «Letra», el mismo elemento que la ruta
vieja, o sea que hoy nada cambia y el día del reordenamiento nada muere.
Los recuentos de su tanda están arriba.

**Lo que queda honestamente fuera.** El mensaje de «letra no disponible»
(`lyricsMessage`) sigue sin verse en vivo: no sonó ninguna canción sin letra.
Y **aleatorio no se pulsó a propósito**: existe, está en la ventana y su
selector es el mismo patrón que el de repetir (que sí cerró su ciclo), pero
pulsarlo reordena la cola del usuario y eso no se deshace — validar no es
excusa para desordenarle la música a nadie.

## El contrato del adaptador (la cimentación multi-sitio)

La petición, literal: «podemos adaptar la extensión a youtube normal y a
spotify». Antes de escribir el segundo adaptador había que nombrar la
interfaz que el primero cumplía sin decirlo. El plan son tres tandas —el
contrato, YouTube normal, Spotify— y esta es la primera: **sin cambio
visible**, pura cimentación.

**Los 36 métodos, contados de verdad.** La interfaz «de unos ~30 métodos»
resultó tener 36 al contarla sobre el adaptador real. El módulo nuevo,
`src/content/adapter-registry.js` (`YTMPip.Adaptadores`), guarda la lista
como `METODOS_DEL_CONTRATO` y `registrar()` la exige entera: un adaptador a
medio escribir muere al cargar la extensión, con un `Error` que nombra el
método que falta, no en el latido número mil cuando el orquestador llame al
que no existe. Y la lista no puede quedarse atrás en silencio: una prueba
recorre los métodos públicos del adaptador de YouTube Music y exige que
todos estén en ella — si mañana un consumidor nuevo empieza a llamar un
método 37, o entra al contrato o la suite lo delata.

**Las siete capacidades: qué TIENE el sitio, no qué devuelve el DOM.**
`letras, cola, repetir, aleatorio, meGusta, videoPrestable, audioGrafo`,
todas obligatorias y booleanas. La distinción importa: `getRepeatButton()`
puede devolver `null` un instante porque la barra aún no pintó, pero
YouTube Music TIENE repetir. Y al revés, hay ausencias que el DOM jamás
confesará: en Spotify el audio viaja con DRM (Widevine), y conectar un
`<video>` con EME a `createMediaElementSource` no falla — **silencia el
sonido**. Ese es el porqué de `audioGrafo`: el día de Spotify, el espectro
y el ecualizador se apagarán por capacidad declarada, no por un error que
nunca llega. La validación también mata la capacidad inventada («aletorio»
en vez de «aleatorio» sería una mentira muda en un rincón que nadie lee) y
el id duplicado.

**La elección por hostname, con red.** Al registrarse cada adaptador se
relee `location.hostname`: gana el primero registrado que lo declare, y si
ninguno coincide, el primero registrado a secas — así los entornos de
prueba y cualquier contexto raro nunca se quedan sin adaptador. El elegido
se publica como `YTMPip.Adapter` (el nombre que todos los consumidores ya
usaban, que por eso no cambió) y sus capacidades como `YTMPip.Capacidades`.
Se publica **el mismo objeto**, no una copia: la mutación que probó a
publicar una copia cayó ante dos pruebas, y con razón de fondo — el
préstamo del `<video>` (`setBorrowedMedia`) vive en la clausura del
original, y una copia partiría ese mecanismo en dos mitades que no se
hablan.

**El cableado, mecánico y confesado.** El registro carga justo antes del
adaptador en el `manifest.json`, en los dos entornos de `tests/helpers/entorno.js`
y en las 25 pruebas que cargan el adaptador con lista propia (27 inserciones:
dos archivos tienen dos listas; hechas con un guion desechable que respetó
sangría y fin de línea de cada archivo y se borró después). Las 709 pruebas
de antes pasaron sin tocar una aserción.

**Lo que queda honestamente fuera.** Nadie CONSUME `YTMPip.Capacidades`
todavía: `pip.js` sigue ocultando botones por `null` (su mecanismo implícito
de siempre) y el interruptor `audioGrafo` espera a la tanda de Spotify.
(Saldado después: ver «El interruptor de capacidades».) Los
adaptadores de YouTube normal y Spotify no existen aún: el falso
«spotify-falso» de las pruebas es un clon del de YTM y solo ejercita el
registro, no sabe nada del sitio real. Y la lección de la fase 0 sigue en
pie para las tandas 2 y 3: los selectores se escriben DESPUÉS de mirar el
DOM vivo, no antes.

## El adaptador de YouTube normal (la tanda 2: el mismo contrato con el sitio al revés)

La tanda 2 de «podemos adaptar la extensión a youtube normal y a spotify»:
`src/content/youtube-adapter.js`, los mismos 36 métodos del contrato,
firmados para `www.youtube.com`.

**El camino al DOM vivo fue el plan B.** La lección de la fase 0 exige mirar
el DOM real antes de escribir un selector, pero el navegador instrumentado se
negó a entrar en youtube.com («Navigation to this domain is not allowed»,
incluso con el permiso concedido dos veces). El plan B: un guion de solo
lectura, `tools/diagnostico-youtube.js`, que el usuario pegó en la consola de
DevTools y cuya salida pegó de vuelta — dos pasadas (un video suelto y un Mix
con 25 elementos en la cola) más un mini-guion para la pregunta de la cola.
Ningún selector del adaptador es una conjetura: cada uno lleva al lado su
evidencia medida, con fecha.

**Lo que midió el diagnóstico** (y cómo lo esquiva el adaptador):

- **La barra de progreso MIENTE con los controles ocultos**: decía
  `aria-valuenow=16` mientras el `<video>` iba por 40.3. Y `video.duration`
  (1318.6 s = 21:58) coincide exactamente con la duración de la pista: en
  YouTube normal no existe la línea de tiempo acumulada de YouTube Music.
  De ahí la decisión más importante del adaptador: `getPageTrackTime()`
  devuelve `null` A PROPÓSITO, con lo que `TrackTimeline` contesta con el
  `<video>` a secas — exactamente al revés que en YTM, donde el `<video>` es
  el que miente y la interfaz la que sabe. La prueba estrella reproduce la
  mentira medida y cae si alguien «arregla» el `null` haciéndolo leer la
  barra.
- **Hay DOS `<video>`** a la vez: el del reproductor y una precarga pausada
  suelta en el body. `#movie_player video` encuentra solo el vivo (medido),
  y la lógica de `elegirVideoVivo` queda de paracaídas.
- **`#title` casa OCHO veces** en la página y `like-button-view-model`
  TRES: título y me gusta van anclados a `ytd-watch-metadata`, y el fixture
  cuenta los señuelos para que nadie pueda recortarlos sin que una prueba
  proteste.
- **Siguiente/anterior son `<a>`, no `<button>`, y están OCULTOS en un
  video suelto** (visibles dentro de una lista, medido en el Mix). Se
  devuelven igual: quien los pulsa es `clickIfPresent` y quien decide qué
  hacer es el reproductor.
- **Me gusta es MEJOR que en YTM**: los dos botones llevan `aria-pressed`
  de verdad (medido «true»/«false» en la página real), así que
  `getLikeStatus()` se compone de ellos en el mismo vocabulario
  LIKE/DISLIKE/INDIFFERENT de siempre — sin necesitar el atributo
  `like-status` del renderer de YTM.
- **La cola, verificada con evidencia y no de chiripa**: el panel
  `ytd-playlist-panel-renderer` EXISTE hasta en un video suelto, pero con 0
  items (primera pasada); dentro del Mix trae los 25, con `selected` en el
  que suena y `#video-title`/`#byline` por dentro (segunda pasada, pedida a
  propósito porque sin ella la capacidad `cola` habría sido una conjetura
  como las de las letras de la fase 0).
- **No hay carátula que leer**: ninguna `<img>` con la portada. Pero
  `ytd-watch-flexy` lleva el atributo `video-id` (medido) y la miniatura
  vive en `i.ytimg.com/vi/<id>/hqdefault.jpg` — `hqdefault` y no
  `maxresdefault`, que devuelve 404 en muchos videos y una carátula rota es
  peor que una modesta. El truco, confesado: el adaptador fabrica UNA
  `<img>` desconectada que hace de portadora de `.src`, para que
  `metadata-reader` siga sin saber nada del sitio. No se inserta en ningún
  DOM y se reutiliza siempre la misma (el lector consulta varias veces por
  segundo).

**Las capacidades, con su evidencia**: `letras: false` (0 cabeceras de
pestañas, ningún panel), `repetir: false` y `aleatorio: false` (0 botones en
la página), `cola: true` (los 25 del Mix), `meGusta: true` (`aria-pressed`
real), `videoPrestable: true` (`#movie_player video` único, padre
`.html5-video-container`) y `audioGrafo: true` (mismo servido por MSE sin
DRM que YTM).

**El desacople multi-sitio que lo sostiene** (hecho en esta misma tanda,
antes del adaptador): `constants.js` ganó `SITIOS_SOPORTADOS` (patrón y
prefijo por sitio) y el service worker perdió sus cuatro literales de
`music.youtube.com` — `chrome.tabs.query` acepta una lista de patrones y
`esUrlSoportada()` pregunta por prefijo. El `manifest.json` es JSON inerte y
no puede leer constantes: sus TRES listas (`host_permissions`,
`content_scripts.matches`, `web_accessible_resources.matches`) se cambiaron
a mano y la prueba del manifiesto las vigila en bloque. `URL_POR_DEFECTO`
sigue siendo YouTube Music a propósito: quien pulsa el icono de Music PiP
sin pestaña abierta quiere música.

**El entorno de pruebas ahora dice la verdad de producción**: los content
scripts cargan AMBOS adaptadores en ambos sitios (la lista del manifest es
una sola) y es el registro quien elige por hostname, así que
`tests/helpers/entorno.js` también carga los dos. Las 715 pruebas de antes
pasaron a vigilar gratis que registrar YouTube no destrona a YTM ni revienta
la carga, y la única aserción que cambió fue la de los ids registrados de
serie (`["youtube-music", "youtube"]`). La URL del JSDOM se volvió opcional
para que las pruebas nuevas vivan en `www.youtube.com`.

**Lo que queda honestamente fuera.**

- Solo `www.youtube.com`: Chrome redirige el dominio pelado, y
  `m.youtube.com` es OTRO DOM que nadie auditó — reclamarlo sería volver a
  los selectores imaginados.
- En páginas que no son de visionado (la portada, con sus previsualizaciones
  al pasar el ratón) el selector de reserva `video` podría engancharse a un
  preview. No está auditado; se confiesa en vez de esconderse.
- Nadie consume `YTMPip.Capacidades` todavía: en youtube.com la ventana
  esconde letras/repetir/aleatorio por la vía del `null` de siempre, no por
  capacidad declarada. El interruptor por capacidad llegará cuando haga
  falta de verdad (Spotify y su `audioGrafo: false`). (Llegó: ver «El
  interruptor de capacidades». El escondido por `null` sigue vivo para lo
  momentáneo, tal como se predijo aquí.)
- `elegirVideoVivo`/`relevoEnPagina` están DUPLICADAS del adaptador de YTM
  a propósito: cada adaptador es autónomo, y una telaraña de dependencias
  entre adaptadores sería peor que sesenta líneas repetidas. La historia de
  por qué existen vive en el de YTM.
- La confesión de andamio de la tanda: el fixture original ponía todos los
  señuelos DETRÁS del elemento bueno, y el guardia contra selectores
  des-anclados estaba en verde de adorno. Se descubrió al predecir la
  mutación M2, se movieron señuelos delante (el peor caso a propósito: el
  diagnóstico midió cuántos hay, no en qué orden) y de paso se corrigió un
  comentario del adaptador que afirmaba ese orden sin evidencia.

## El adaptador de Spotify (la tanda 3: el sitio donde el audio no está en la página)

La tanda 3 y última del plan multi-sitio: `src/content/spotify-adapter.js`,
el tercer firmante del contrato, para `open.spotify.com`. La evidencia:
CUATRO guiones de solo lectura (`tools/diagnostico-spotify.js` a `-4.js`)
que el usuario pegó en la consola sobre páginas reales, más DOS experimentos
de clic pedidos a propósito (los tres estados de repetir, los dos del
aleatorio). Ningún selector es una conjetura.

**El hallazgo que define el adaptador: el audio NO ESTÁ en el DOM.** Con
música sonando, dos pasadas midieron CERO elementos `<video>`/`<audio>` en
toda la página; la tercera encontró uno solo, y era el «Canvas» (un bucle
visual de 6,9 s, silenciado, en el panel lateral). Spotify reproduce el
audio fuera del árbol del documento. De ahí cae todo lo demás:
`getMediaElement()` devuelve `null` SIEMPRE (devolver el Canvas sería
mentir: está mudo, dura 7 segundos y no sabe nada de la canción),
`audioGrafo: false` (no hay elemento del que colgar un grafo, y con DRM
además saldría silencio), `videoPrestable: false` (lo único prestable sería
el bucle mudo), y el tiempo y el estado de reproducción salen de LA PÁGINA
o no salen.

**El método 37 del contrato nació aquí**: `isPagePlaying()`. En YTM y en
YouTube el `<video>` dice si suena; en Spotify lo dice el DIBUJO del botón
de play/pausa (el `aria-label` viene traducido, el path del SVG no): el
icono de pausa a la vista significa que suena, el de play que está pausado,
y un dibujo desconocido es `undefined`, nunca una mentira. Los otros dos
adaptadores lo firman devolviendo `undefined` a propósito —su `<video>` es
la verdad— y `metadata-reader` solo pregunta a la página cuando no hay
medio, convirtiendo el `undefined` en `false` con `=== true`.

**Lo que midió el diagnóstico** (y cómo lo esquiva el adaptador):

- **El tiempo es la TERCERA variante de la misma pregunta**: en YTM el
  `<video>` miente (acumula la cola) y la interfaz sabe; en YouTube el
  `<video>` sabe y la barra miente; en Spotify NO HAY `<video>` y la barra
  inferior es lo único que lo sabe. El transcurrido sale del TEXTO
  (`0:19` → 19, avanza de 1 en 1 s, medido) y nunca del `value` del
  `<input>`, que va cuantizado a saltos de 5000 ms (medido: texto «0:19»
  con `value=20000`). La duración sale del `max` del `<input>`, que está
  en milisegundos exactos (`max=161983` para la canción de 2:41), con el
  texto de reserva. `TrackTimeline` sin medio publica el tiempo de la
  página tal cual.
- **El aleatorio FANTASMA**: el botón existe, se ve y se clica, pero es el
  único de la zona de controles SIN `data-testid` (medido: 5 botones, 4
  con nombre) — se caza por esa ausencia, que es lo único estable que
  tiene. Y no lleva `aria-checked` ni `aria-pressed` en NINGUNO de los dos
  estados (medido con los dos clics del usuario): botón clicable, estado
  honestamente ilegible, `shuffleOn: undefined`.
- **Repetir, medido a tres clics**: `aria-checked` habla sin idioma y da
  `"false"` → NONE, `"true"` → ALL, `"mixed"` → ONE. La trampa esquivada:
  el `aria-label` describe el SIGUIENTE clic, no el estado («Repetir una
  canción» corresponde a ALL).
- **El `data-testid` del me gusta es TRAICIONERO**: `add-button` casó con
  el botón de guardar del álbum en una pasada y con ninguno en otra. La
  señal fiable es otra: el ÚNICO botón con `aria-checked` dentro de la
  ficha de «sonando ahora» (medido: 1). Sin «no me gusta» en el
  reproductor (medido), el estado solo tiene dos posiciones honestas:
  LIKE o INDIFFERENT.
- **La cola se separa por ESTRUCTURA, no por idioma**: el panel derecho
  trae DOS `<ul>` (medido: «Estás escuchando» con 1 fila y lo que viene
  con 12), pero esos rótulos llegan traducidos y las filas no llevan
  `selected` ni `aria-current` (medido: `null` en todas). «Seleccionada»
  es pertenecer al primer `<ul>`. El título va por su clase encore medida
  (`e-10860-line-clamp`, que rotará) con búsqueda estructural de reserva,
  y el envoltorio de artistas es el PADRE del primer enlace de la fila:
  su `textContent` ya trae «Nico Hernández, Banda Los Recoditos» con las
  comas puestas.
- **Las letras son una RUTA, no un panel**: 33 `lyrics-line` medidas con
  la vista `/lyrics` abierta, 0 con ella cerrada. Viven en divs sueltos y
  el lector nativo espera UN elemento con `\n`, así que el adaptador
  fabrica un portador sintético desconectado y reutilizado (el mismo truco
  que la carátula derivada de YouTube normal). El botón de letras lleva
  `aria-pressed` de verdad (medido «true» con la vista abierta), y esa es
  la tercera señal que ganó `isPanelOpen()` en el lector.
- **El Canvas LE ROBA el hueco a la carátula**: una pasada entera del
  diagnóstico sin ningún `cover-art-image` en la barra porque el bucle
  mudo ocupaba su sitio. En ese caso no hay elemento que devolver y la
  ventana cae a su carátula de reserva, que es la respuesta honesta.

**Las capacidades, con su evidencia**: `letras: true` (33 líneas medidas,
botón con `aria-pressed`), `cola: true` (2 `<ul>` medidos, 1 + 12 filas),
`repetir: true` (los tres estados a tres clics), `aleatorio: true` (existe
y se clica; su ESTADO es ilegible y así se publica), `meGusta: true` (botón
único con `aria-checked`), `videoPrestable: false` (en modo audio solo el
Canvas mudo; en modo video hay un `<video>` real pero con DRM medido — ver
el párrafo siguiente) y `audioGrafo: false` (el audio no está en el DOM:
no hay de dónde colgar un grafo).

**El modo video, medido después (2026-09-16).** Probando el temporizador
sobre un video musical («Cambiar a audio» visible), el usuario notó que la
ventana no mostraba el video, y se midió en vivo lo que las cuatro pasadas
originales —todas con música normal— no habían visto: en modo video SÍ hay
un `<video>` en el DOM, y no es el Canvas. Tres pasadas de consola: `blob:`,
2560×1080, sin silenciar, duración 164,36 s (la pista entera de 2:44),
colgado de `data-testid='video-player-npv'`… y con `mediaKeys` presente:
DRM (EME). Adoptar un `<video>` cifrado en otro documento rompe la sesión
de claves, así que el préstamo daría negro o parada: `videoPrestable`
sigue `false`, ahora POR CIFRADO MEDIDO y no por ausencia, y la carátula
en la ventana es lo declarado, no una regresión. La misma sesión dejó dos
verificaciones de regalo: en modo audio volvió a medirse CERO medios (la
evidencia original sigue vigente), y `isPagePlaying()` leyó bien el dibujo
del botón EN MODO VIDEO en ambos estados (sonando → prefijo de pausa,
pausado → prefijo de play): el botón de la barra inferior es el mismo en
los dos modos, y la regla nueva del clic ciego funciona también ahí. Lo
que se dejó a propósito sin hacer: devolver ese video desde
`getMediaElement()` encendería `medioEscribible` en modo video (saltos y
volumen directos, que el DRM no bloquea), pero las capacidades hoy son
fijas por adaptador y no por modo — es una tanda futura, no un arreglo de
pasada. (La tanda llegó: ver «El medio por modos».)

**El entorno de pruebas, tercera silla en la mesa**: el manifest carga los
TRES adaptadores en todos los sitios y elige el registro, así que
`tests/helpers/entorno.js` también carga los tres. El fixture
`spotify-sonando.html` reproduce el estado medido (canción sonando, cola
abierta, vista de letras abierta) con los señuelos delante del elemento
bueno y las letras de RELLENO (las reales no se copian). Once pruebas
nuevas, tres arreglos en la prueba del contrato (37 métodos, el adaptador
falso mudado a `musica.falsa.example` porque `open.spotify.com` ya tiene
dueño real, tres ids de serie) y siete mutaciones con los recuentos
clavados: 733 en verde.

**Lo que queda honestamente fuera.**

- **Los mandos que escriben sobre el medio están MUERTOS**: volumen,
  silencio, velocidad y arrastrar la barra escriben sobre un `<video>` que
  no existe. La ventana los sigue enseñando porque nadie consume
  `YTMPip.Capacidades` todavía — es el mismo suelto confesado en la tanda
  2, ahora con su primer caso real. Se confiesa en vez de esconderlo tras
  un arreglo no pedido. (Pedido y saldado después: ver «El interruptor de
  capacidades» y su capacidad octava, `medioEscribible`.)
- Sin espectro, sin ecualizador, sin velocidad: `audioGrafo: false` existe
  exactamente para esto, y esto es lo que declara.
- Una canción SIN letra se queda en «cargando» en vez de «no disponible»:
  la señal de Spotify es el `aria-label` traducido del botón («Parece que
  no tenemos la letra...»), y antes que leer español, no se sabe.
- Las líneas de letra van sin tiempos (`time: null`): la vista de Spotify
  no los expone al DOM, así que ni resaltado sincronizado ni saltar con un
  clic — igual que la ruta nativa de LyricFind en YTM.
- La confesión de andamio de la tanda: el guardia contra des-anclar el
  selector del me gusta estaba en verde de adorno (ningún `aria-checked`
  antes de la ficha en el fixture). Se descubrió al predecir la mutación
  M2 y se reforzó el fixture con el señuelo MEDIDO (el `add-button` de la
  página de álbum, con `aria-checked="true"`) antes de ejecutar ninguna
  mutación.

## El interruptor de capacidades (los mandos muertos se esconden)

El suelto que las tres tandas confesaron en fila, saldado: la ventana ya
consume `YTMPip.Capacidades`. En Spotify, volumen, silencio, velocidad y
los dos saltos escribían sobre un `<video>` que no existe (medido: cero
`<video>`/`<audio>` con música sonando); no fallaban con estrépito —cada
escritura moría en el `if (!media) return` del controlador— y ese silencio
era la mentira: un mando a la vista que no hace nada.

**Primero le faltaba una palabra al contrato.** Ninguna de las siete
capacidades decía si esos cuatro mandos tienen sobre qué escribir:
`audioGrafo` habla de Web Audio y `videoPrestable` del préstamo visual. De
ahí la octava, `medioEscribible` («hay `<video>`/`<audio>` sobre el que
escribir volumen/velocidad/saltos»): `true` en YouTube Music y YouTube,
`false` en Spotify. Las dos pruebas de adaptador cayeron solas al añadirla
—`capacidad medioEscribible`, exactamente las dos predichas— porque
recorren la lista DEL CONTRATO contra sus `esperadas`: es el mecanismo
funcionando, una capacidad nueva no puede entrar sin que cada adaptador la
decida por escrito.

**El consumidor, con cada regla en su dueño.** `pip.js` es el primer (y
único) consumidor, y el interruptor son tres piezas, no una:

- **Los cinco mandos, al montar** (`aplicarCapacidades`, llamada desde
  `cacheElements` igual que los iconos): con `medioEscribible: false` se
  esconden de una sola vez, porque las capacidades son estáticas — el
  hostname no se muda en una SPA. Esto es distinto del escondido por
  `null` de siempre (repetir/aleatorio en `renderExtras`), que sigue
  existiendo para lo momentáneo: la capacidad dice qué TIENE el sitio, el
  `null` dice qué falta ahora mismo.
- **La barra de tiempo, en su único pintor** (`paintTimeline`): visible a
  propósito —el progreso sí funciona, sale de los textos de la página—
  pero con el arrastre deshabilitado. Dos motivos para deshabilitar, cada
  uno con su dueño: sin duración no hay dónde saltar (lo dice
  `timelineFor`) y sin medio el salto no tiene sobre qué escribir.
- **El ecualizador, en su único pintor** (`pintarEcualizador`, con
  `audioGrafo`): botón, chincheta y barritas se esconden en CADA
  repintado, no al montar, porque la preferencia del ecualizador es
  GLOBAL — encendida en YouTube Music, un escondido de una sola vez se
  desharía en el siguiente `applySettings` y Spotify luciría un botón
  activo sobre una música a la que el grafo no toca (con DRM ni podría:
  silenciaría). La preferencia NO se toca: en el sitio que sí puede,
  sigue sonando como estaba.

**Lo que a propósito NO hace.** Los atajos de teclado equivalentes no se
desactivan: la regla «sin medio no se escribe» ya vive en
`PlayerController` y repetirla en la ventana sería la misma regla en dos
archivos esperando a discrepar (la clase de error que la mutación ya ha
castigado antes). El espectro y el pulso tampoco necesitan nada: ya
preguntan con `puedeMedirse()`, que sin medio contesta que no. Y solo el
`false` DECLARADO esconde: sin registro publicado (un banco de pruebas
montado a pelo, un contexto raro) todo queda como antes.

**Las pruebas** (`tests/unit/interruptor-capacidades.test.js`, siete):
cada prueba de esconder tiene su gemela de MOSTRAR sobre YouTube Music,
porque un interruptor que esconde de más es tan mentiroso como uno que
esconde de menos y sin la gemela un `hidden = true` incondicional pasaría
toda la batería. Se montan las dos ventanas con los TRES adaptadores
cargados, como el manifest de verdad, y decide el hostname. Cinco
mutaciones con los recuentos clavados: el interruptor que nunca esconde
(1), la red de seguridad al revés (1), el arrastre sin capacidad (1), el
trío del ecualizador siempre a la vista (1) y la mentira en el propio
adaptador — `medioEscribible: true` en Spotify — que tumba tres pruebas
en dos archivos (3).

**Lo que quedó honestamente fuera, y ya está saldado.** Esta sección
confesaba que `PlayerController.pause()` sin medio hacía un clic CIEGO
sobre el botón alternador de la página — en Spotify «pausar lo ya
pausado» arrancaría la música, y el temporizador de apagado manda PAUSE
al expirar. El arreglo pasaba por `isPagePlaying()` (el método 37) y
era un cambio del controlador, no de la ventana, así que se dejó
pendiente de decisión en vez de esconderlo tras un arreglo no pedido.
La decisión llegó y el clic ciego ya no existe (ver «El clic ciego»).

## El clic ciego (el alternador solo se pulsa sabiendo)

**El peligro que quedó confesado.** `PlayerController.pause()` sin medio
hacía un clic ciego sobre el botón de reproducción de la página. Ese
botón es un ALTERNADOR: pulsarlo sin conocer el estado hace lo contrario
de lo pedido la mitad de las veces. En Spotify —donde el medio es `null`
SIEMPRE, medido en vivo— esa mitad era real: «pausar lo ya pausado»
ARRANCABA la música. Y el temporizador de apagado manda PAUSE al
expirar: música sonando de madrugada por haber pedido silencio.

**La regla nueva.** Un alternador solo se pulsa sabiendo que el estado
actual es EL CONTRARIO del pedido. Quien lo sabe es `isPagePlaying()`,
el método 37 del contrato, que existe exactamente para esto: en Spotify
lee el dibujo del botón (el icono de pausa significa «sonando», el de
play significa «pausado»); en YouTube Music y YouTube contesta
`undefined`, porque ahí la verdad es el `<video>` y las ramas sin medio
casi no existen. Con `undefined` el controlador SE ABSTIENE, por la
asimetría de los fallos: no obedecer deja las cosas como estaban;
pulsar a ciegas puede hacer lo contrario. Es la misma regla que el
botón de repetir con el modo ilegible: mejor no inventar. `TOGGLE_PLAY`
no necesita nada de esto — alternar es lo único que un alternador hace
bien a ciegas.

**Los dos errores que se cancelaban.** Al revisar quién manda PLAY y
PAUSE apareció que el botón de la ventana flotante
(`alternarReproduccion` en `pip.js`) calculaba el comando leyendo el
medio: una SEGUNDA COPIA de la decisión que el controlador ya toma
delante del `<video>`. En Spotify la copia además mentía —sin medio
elegía PLAY siempre, sonara o no— y solo funcionaba porque el clic
ciego del controlador degeneraba en alternador: dos errores
cancelándose. Arreglar solo el controlador habría ROTO el botón de la
ventana en Spotify. Ahora la ventana pide `TOGGLE_PLAY` (el botón ES un
alternador; pide alternar y quien sabe decide) y el popup se queda como
estaba a propósito: manda PLAY o PAUSE explícitos desde su estado
cacheado, que es lo correcto para un mando a distancia, y el
controlador ya verifica el estado fresco al ejecutar.

**Las pruebas** (cinco en `tests/unit/player-controller.test.js`, más el
CASO PEDIDO de `pip-atajos` que ahora espera `TOGGLE_PLAY` del espacio y
del botón por igual): un banco de Spotify con los TRES adaptadores
cargados como en el manifest, donde el estado de la página se cambia
escribiendo el dibujo del svg del botón — exactamente lo que
`isPagePlaying()` lee en vivo. PAUSE con Spotify ya pausado no pulsa
(el peligro reportado), PAUSE sonando pulsa una vez, PLAY sonando no
corta por accidente, PLAY pausado pulsa, y sin poder saber (YouTube
Music sin vídeo) PLAY y PAUSE se abstienen mientras `TOGGLE_PLAY` sí
pulsa.

**Las mutaciones, con confesión de recuentos.** Cinco mutantes, cinco
muertos: quitar la condición de `pause()` (2 fallos), quitar la de
`play()` (2 fallos), invertir el sentido en `pause()` (2 fallos,
clavados), devolver `alternarReproduccion` al cálculo viejo (1 fallo,
clavado) y `!== false` en `pause()`, que pulsa también con `undefined`
(1 fallo, clavado: solo la prueba de abstención distingue `=== true` de
`!== false`). Los dos primeros recuentos se predijeron en 1 y salieron
2: quitar la condición ENTERA muere por dos flancos, el peligro
reportado y además la abstención, porque sin condición también se pulsa
con `undefined`. El mutante murió de más, no de menos, y por eso se
anota en vez de esconderse.

**Verificado en vivo después**: probando el temporizador sobre un video
musical de Spotify, `isPagePlaying()` leyó bien el dibujo del botón
también en MODO VIDEO, en ambos estados (ver «El modo video, medido
después» en la sección del adaptador de Spotify). La regla del estado
contrario funciona en el modo que las mediciones originales no cubrían.
Y la validación de punta a punta llegó el mismo día: el usuario dejó el
temporizador de 15 minutos corriendo sobre Spotify real y al expirar la
música SE PAUSÓ — el escenario exacto que motivó la tanda, el que antes
podía arrancar la música de madrugada, observado funcionando en vivo.

## El medio por modos (`medioEscribible` deja de ser un veto)

**El suelto que motivó la tanda.** En el modo video de Spotify hay un
`<video>` real, medido en vivo (ver «El modo video, medido después»):
`blob:`, la pista entera, colgado de `data-testid='video-player-npv'`, con
DRM. El adaptador seguía contestando `null` en `getMediaElement()` y la
ventana escondía volumen, silencio, velocidad y saltos — mandos que en ese
modo SÍ podrían funcionar, porque el DRM protege los bytes, no las
propiedades: escribir `currentTime`, `volume` o llamar a `pause()` sobre
un elemento cifrado funciona; lo que rompe es ADOPTARLO en otro documento
(la sesión de claves muere y la pantalla queda negra).

**La decisión, en dos piezas.**

- **El adaptador** (`spotify-adapter.js`): `getMediaElement()` devuelve el
  `<video>` anclado a `video-player-npv` cuando existe, y `null` en modo
  audio, que sigue siendo la verdad medida (cero medios). El ancla no es
  adorno: un `querySelector('video')` a secas devolvería el Canvas, el
  bucle mudo que este adaptador lleva prohibido entregar desde su primera
  medición. El préstamo NO cambia: `getPageMediaElement()` y
  `getReplacementFor()` siguen en `null` (`videoPrestable: false`, por
  cifrado medido), y las puertas de Web Audio no necesitan enterarse
  porque espectro y grafo ya exigen `!mediaKeys` por su cuenta.
- **La ventana** (`pip.js`): `medioEscribible: false` pasa de VETO a «SIN
  GARANTÍA, compruébalo». `medioEscribibleAhora()` pregunta en orden:
  capacidad declarada `true` → `true` SIN mirar el DOM (la promesa
  anti-parpadeo de YouTube Music, donde el `<video>` puede faltar un
  instante en cada cambio de pista); declarada `false` → se pregunta por
  el medio VIVO. Y se re-consulta en el latido de 300 ms de la línea de
  tiempo, porque en Spotify el medio va y viene POR PISTA: a un video
  musical le puede seguir una canción de audio, y unos mandos escondidos
  de una sola vez al montar se quedarían mintiendo al primer cambio.

**Las pruebas** (ocho, una de ellas ya existente): el fixture nuevo
`spotify-video.html` calca el de siempre más el bloque `npv`, con el
Canvas señuelo PRIMERO en orden de documento para que el ancla tenga algo
que ganar. En el adaptador, el medio de modo video es el anclado y no el
Canvas (y el préstamo sigue en `null`); el modo audio lo vigila la prueba
que ya existía. En el controlador, `SET_VOLUME` escribe sobre el medio
real y no sobre el Canvas, `PAUSE` pausa el medio SIN tocar el alternador
(la otra mitad de la regla del clic ciego) y `SEEK_TO` escribe
`currentTime` directo (desplazamiento ≈ 0: el `<video>` lleva la pista
entera, no la cola encadenada de YouTube Music). En la ventana, el modo
video muestra los cinco mandos y habilita el arrastre de la barra; quitar
el bloque `npv` y dar un latido los re-esconde; y la gemela anti-parpadeo:
YouTube Music sin `<video>` ni un instante NO esconde nada, porque la
capacidad declarada `true` es la promesa de que vuelve.

**Las mutaciones, con confesión de recuentos.** Cinco mutantes, cinco
muertos, y los recuentos comprometidos en la propuesta (5/2/1/1/1) se
quedaron CORTOS: se recalcularon sobre la batería ya escrita —la prueba
del latido lleva una premisa de arranque que también muere, y la suite
vieja del modo audio y del clic ciego vigila el mismo selector— y
salieron clavados los cinco: `getMediaElement()` devolviendo `null`
siempre, 6 fallos; el selector SIN ancla, 11 fallos (el Canvas envenena
hasta las pruebas del clic ciego: `isPagePlaying` decía «sonando» mientras
el falso medio decía «pausado»); `medioEscribibleAhora` sin la rama viva,
2; el orden invertido (mirar el DOM siempre), 1 — solo el anti-parpadeo lo
distingue; y quitar `aplicarCapacidades()` del latido, 1. Que la
predicción vieja fallara y la recalculada no se anota entero: los
recuentos se predicen sobre pruebas escritas, no sobre pruebas imaginadas.

**Lo que la tanda NO hace**: prestar el video (DRM), encender
`videoPrestable` o `audioGrafo`, ni tocar `TrackTimeline`, que ya era
genérico (con desplazamiento ≈ 0 en Spotify las cuentas salen solas). La
ventana sigue mostrando la carátula en modo video: lo declarado, no una
regresión.

**La regresión que la tanda SÍ trajo, vista por el usuario.** Tras
recargar, el usuario mandó una captura con el botón 🖼 de la cabecera
rodeado en rojo: «modo video sigue sin funcionar». El botón era el
fallo: `hasVideo` se calcula mirando `videoWidth` del medio, y al
devolver `getMediaElement()` el video del modo video, pasó a `true` — y
`syncVideoMode` ofreció el conmutador carátula/vídeo de un video que el
préstamo jamás podrá adoptar (`getPageMediaElement()` es `null` por DRM:
adoptar rompería la sesión de claves). Un botón a la vista que no puede
hacer lo que ofrece es la mentira exacta que el interruptor de
capacidades prohíbe, con agravante: el rol «letra en grande» del mismo
botón desaparecía por darle prioridad al video imposible. El arreglo es
una puerta en la única dueña de la regla: `syncVideoMode` exige ahora
`hasVideo` Y `capacidad("videoPrestable")` — `hasVideo` dice la verdad
de la PÁGINA (la pista trae imagen), `videoPrestable` la de la VENTANA
(ese video se puede adoptar aquí), y desde esta tanda en Spotify
discrepan. Tres pruebas nuevas: Spotify modo video no ofrece el
conmutador, la gemela de YouTube Music con el mismo `hasVideo` sí lo
ofrece, y la red de seguridad (sin capacidades publicadas la puerta no
cierra: solo veta el `false` declarado). Tres mutantes, tres muertos con
los recuentos clavados: quitar la puerta, 1 fallo; invertirla, 3; acceso
directo estricto saltándose `capacidad()`, 1 — solo la red de seguridad
distingue «no publicado» de «true». Y la respuesta honesta al reporte
original queda escrita: la IMAGEN del video no va a verse en la ventana,
ni con este arreglo ni con ninguno — es el DRM medido, no un pendiente.

## La letra que sincroniza la página (Spotify sin tiempos)

**El suelto.** La letra de Spotify llegaba a la ventana pero como bloque
estático: sus líneas no traen tiempos (`time: null` desde el portador
sintético) y toda la sincronía de la ventana —resalte, autodesplazamiento,
letra en grande— colgaba del reloj del `<video>` contra los `data-time` de
Better Lyrics. Sin tiempos, nada se encendía. La petición era la letra
como la pinta Spotify: grande, la línea que suena encendida, el resto
apagado, siguiendo la canción.

**La medición (2026-09-16, dos pasadas con el guion espejo en la pestaña
del usuario).** Las líneas son `[data-testid='lyrics-line']` y no llevan
NINGÚN atributo estructural que diga cuál suena: solo `dir`, `class` y
`data-testid`. La señal está en las clases: la línea que se canta lleva
una clase que ninguna otra repite, y esa marca SE MUEVE con la canción
(diez fotos en veinte segundos: índices 3→4→4→5→5→6→7→7→8→8). Dos cosas
más que gobiernan el diseño: las clases vienen minificadas y ROTAN entre
despliegues (cazar un nombre moriría en el siguiente build de Spotify), y
la jerarquía visual es SOLO color — activa `rgb(255,255,255)`, vecinas
`rgb(189,208,226)`, ambas con `font-weight` 700 clavado.

**La decisión, en cuatro piezas.**

- **El contrato crece a 38**: `getActiveLyricsLineIndex()` — «qué línea se
  canta, según la propia página». En YouTube Music y YouTube devuelve
  `undefined` y es la verdad, no una carencia: allí la sincronía va por
  tiempos o no existe.
- **El adaptador de Spotify CALCULA, no busca**: cuenta en cuántas líneas
  aparece cada clase y gana la línea que tenga una de recuento uno. Sin
  marca, o con DOS líneas marcadas (un DOM a medio mutar, un rediseño),
  abstención: `undefined`, nunca un verso al azar. Dos clases únicas en la
  MISMA línea cuentan como una sola marca — es la forma medida (el `class`
  de la activa traía dos clases y no se midió cuál comparten las vecinas).
- **El índice viaja con el estado**: el lector publica
  `lyrics.activeLine` (solo la ruta nativa; `Number.isInteger`, porque el
  índice 0 es tan válido como cualquiera y un truthy se lo comería, con
  cota contra el desfase del `trim()`). No hace falta latido nuevo: el
  `MutationObserver` ya vigila `class` en todo el subtree, así que cada
  mudanza de la marca dispara el estado. Y `activeLine` NO entra en la
  firma del service worker a propósito: su único consumidor es la ventana
  local, que recibe `onStateUpdate` siempre — mismo criterio que el minuto
  del temporizador.
- **La regla de qué fuente manda vive en el latido (`tickLyrics`), en un
  solo sitio**: con tiempos manda el reloj (late cada 300 ms y permite
  saltar con un clic); sin tiempos manda la página; sin ninguna de las
  dos, bloque estático, como siempre fue. La rama de la página no exige
  medio: en Spotify modo audio no hay `<video>` que consultar, y la puerta
  vieja («sin medio no se decide») habría dejado el resalte muerto justo
  donde esta tanda lo enciende. La línea en vivo (letra en grande) acepta
  la sincronía de la página igual que la del reloj; el salto con clic NO:
  saltar necesita un tiempo al que ir, y sigue sin haberlo.

**El CSS copia lo medido**: el énfasis pasa a ser SOLO color — el peso
(600) lo llevan ahora todas las líneas por igual y la activa solo cambia
de color. Antes la activa engordaba a 650, y con el mismo peso en todas,
mover el resalte ya no puede mover ni un píxel la maquetación.

**Las pruebas (once nuevas más el contrato actualizado a 38).** El
fixture calca la estructura medida, no los nombres: clase base común a
las tres líneas y marca en la segunda, con guardias que cuentan (si la
base no fuera de todas, «tener clase» ya distinguiría a la marcada y la
prueba vigilaría un cálculo más tonto que el real). En el adaptador: el
singleton señala la línea, el cálculo sobrevive al renombre completo de
clases (y el 0 viaja como 0 hasta el estado), abstención sin marca y con
dos marcas, y dos clases únicas en la misma línea son una sola marca. En
la ventana, con el latido de verdad: el resalte obedece al índice sin
tiempos y ninguna línea sale clicable, la marca se muda con cada estado
SIN reconstruir el DOM (misma firma), la regresión gemela (LyricFind:
sin tiempos y sin índice, nada se resalta), la abstención y el índice
fuera de rango apagan en vez de dejarse el resalte clavado, con tiempos
manda el reloj aunque el estado traiga un índice contradictorio, y la
línea en vivo se enciende con la letra de la página y se apaga sin ella.

**Las mutaciones, con confesión.** Siete mutantes, siete muertos, seis
con el recuento clavado: toda clase es marca (`>= 1`), 4 fallos; sin la
puerta de ambigüedad, 2; el lector no pregunta, 2; la rama de página no
hace nada, 4; siempre el reloj, 4; la puerta vieja de la línea en vivo,
1. La confesión es el sexto: «la abstención conserva el índice viejo»
prometía 1 fallo y cayeron 2 — la segunda mitad de la prueba de la línea
en vivo también pasa por la abstención (un estado sin `activeLine` debe
apagarla) y no la conté. Ambas caídas son la misma vía; el mutante estaba
igual de muerto, pero el recuento se predijo mirando los títulos de las
pruebas y no sus cuerpos.

**Lo que la tanda NO hace**: inventar tiempos para las líneas de Spotify
(el clic-para-saltar sigue siendo de Better Lyrics), leer nombres de
clases minificadas, mandar `activeLine` al service worker, ni tocar la
ruta de Better Lyrics, que queda exactamente como estaba — con la prueba
del reloj contradicho vigilando que siga mandando.

### El desfase que enseñó la segunda medición: las vacías del frente

La tanda funcionó en vivo… dos versos corrida. El reporte fue literal —
«está desfasada la sincronización»— y la captura lo mostraba: la página
cantaba «I finally took a break» y el PiP resaltaba «They tried to kill
me once». El guion de consola de siempre (pegado por el usuario en SU
pestaña) dio los números exactos: **68 `lyrics-line` en el DOM, 65
líneas emitidas**. Spotify pinta líneas VACÍAS — dos al frente (la
intro), separadores de estrofa por dentro y una de cierre — y el
portador sintético del adaptador, al unir los textos, remata con un
`trim()` que se come las de los bordes (las interiores sobreviven: son
los separadores). El método 38 devolvía el índice contando TODO el DOM,
el PiP contaba solo la letra emitida, y la diferencia era exactamente
las 2 vacías del frente: el desfase medido.

**El arreglo vive en un solo sitio**: `getActiveLyricsLineIndex()`
ahora devuelve el índice **en el espacio de la letra emitida** — cuenta
las vacías del frente y las resta. Es el adaptador quien conoce cómo su
propio portador recorta el texto (misma casa, mismo archivo), así que ni
el lector ni el PiP cambian. Los dos bordes se reparten: marca sobre una
vacía del frente → el índice mapeado sería negativo y el adaptador se
abstiene él mismo; marca sobre la vacía del final → el índice queda
fuera de rango y lo caza la cota que el lector ya tenía (`activa <
lineas.length`), escrita en su día «por si acaso» y que aquí demostró
por qué existe.

**Los fixtures copian la forma medida**: 2 vacías al frente + 3 con
texto + 1 interior + 1 al final. Con eso, las pruebas viejas que
esperaban índice 1 siguen esperando 1 — pero ahora en el espacio
emitido, con lo que se volvieron regresión del desfase sin tocarles la
expectativa. Tres pruebas nuevas fijan los bordes: las interiores no se
restan (restar todas volvería a desfasar justo después de cada estrofa),
la marca en una vacía del frente abstiene al adaptador, y la marca en la
vacía del final documenta el reparto (el adaptador mapea sin juzgar la
cola; la cota del lector convierte el fuera-de-rango en abstención).

**Las mutaciones, esta vez sin confesión.** Cuatro mutantes, cuatro
muertos, cuatro recuentos clavados: no restar (el desfase renace), 7
fallos; restar TODAS las vacías anteriores, 3; sin la puerta del
negativo, 1; sin la cota del lector, 1. Restaurado todo, la batería
volvió a 57/57.

## El vídeo flotante del navegador (el botón 🎬 y el DRM que no se toca)

La pregunta que abrió esta tanda fue directa: «¿del vídeo entonces no es
posible?». La respuesta honesta es que los cuadros del vídeo de Spotify
no se pueden tener: van cifrados (Widevine) y los descifra el módulo del
navegador sin enseñárselos jamás a JavaScript. Adoptar el elemento rompe
la sesión de claves (por eso `videoPrestable` es `false` en ese
adaptador), y `captureStream` o un canvas devuelven negro. Ningún
permiso local cambia eso: el DRM protege los bytes.

Pero no protege la ventana. El navegador tiene su propio vídeo flotante
(`requestPictureInPicture`), que él mismo compone sin entregar cuadros a
nadie, y la medición en vivo (2026-09-16, guion de consola pegado por el
usuario en su pestaña) dijo que la puerta está abierta: en el vídeo de
Spotify `disablePictureInPicture` es `false`, el documento lo permite, y
la llamada **abrió la ventanita nativa con el vídeo cifrado dentro,
293x165**. Esta ventana no puede CONTENER ese vídeo, pero sí puede
INVOCAR la del navegador.

Eso es todo lo que hace el botón 🎬:

- **La señal la decide el estado** (`nativePipAvailable`, en
  `metadata-reader.js`): pista con imagen de verdad (la misma vara que el
  modo vídeo: en modo canción el `<video>` de YTM mide 0x0 y no hay nada
  que flotar), la API presente, sin veto de la página y con permiso del
  documento. Es estructural, no un caso especial de Spotify. No viaja en
  la firma del estado, con el mismo criterio que `lyrics.activeLine`:
  solo la consume esta ventana.
- **La ventana solo pinta y alterna**: el botón aparece únicamente con la
  señal, el clic pide la ventanita al vídeo del adaptador (la misma vía
  local que ya usa el latido de la letra) y el segundo clic la recoge
  con `exitPictureInPicture`. `aria-pressed` cuenta si flota.
- **El rechazo se dice en voz alta**: `requestPictureInPicture` exige
  activación de usuario, y el clic ocurre en ESTA ventana, no en la
  página dueña del vídeo. Si Chrome no propaga el gesto entre las dos,
  cae `NotAllowedError`: el anuncio `aria-live` lo cuenta («El navegador
  pidió un clic en la página para abrir su vídeo flotante») y la consola
  dice el porqué, en vez de reventar en silencio o fingir que se abrió.

**Lo que ninguna prueba de aquí puede medir**: si el gesto se propaga
desde la ventana PiP hasta la página. La medición de hoy se hizo desde
la consola de la propia pestaña de Spotify, donde el gesto es local. El
primer clic real sobre 🎬 ES esa medición: si abre la ventanita, la
puerta funciona entera; si cae `NotAllowedError`, el mensaje del anuncio
es la confesión y habrá que buscar un plan B (probablemente reenviar el
clic a la página por mensaje). Este README se corregirá con lo que diga
ese clic.

**Las mutaciones, otra vez sin confesión.** Cinco mutantes, cinco
muertos, cinco recuentos clavados: la señal sin exigir imagen real (el
0x0 flotaría), 1 fallo; sin la puerta del veto, 1; el botón que nunca se
esconde, 2; el clic que nunca recoge la ventanita, 1; el rechazo que se
calla, 1. Restaurado todo, 30/30 en verde (la batería de 7 más las del
lector de metadatos).

## El fondo Canvas (el botón 🌌 y el bucle visual de Spotify)

Spotify acompaña muchas canciones con un «Canvas»: un bucle visual
vertical de unos segundos que gira en el panel lateral. Esta tanda lo
pone de fondo de la ventana flotante. Tres mediciones en vivo
(2026-09-16, guiones de consola pegados por el usuario en su pestaña)
decidieron todo el diseño:

- **El elemento**: un `<video>` vertical 321x574, `muted`, `loop` y —la
  medición que abre la puerta— `mediaKeys` en `null`: el Canvas **no
  lleva DRM**, a diferencia del vídeo de pista. Su ancla estable más
  cercana es el `data-testid` `NPV_Panel_OpenDiv` (las clases minificadas
  rotan).
- **La vía A, muerta**: su `src` es un `blob:` ya revocado; reutilizar la
  URL en otro `<video>` da `ERR_FILE_NOT_FOUND`. No se puede «copiar el
  enlace».
- **La vía B, viva**: `captureStream()` sobre el elemento de la página
  entregó un chorro real (1080x1920, una pista de vídeo, y el `<video>`
  receptor reprodujo). Es la única vía, y funciona porque el Canvas no
  está cifrado; con el vídeo de pista daría cuadros negros.

Cómo quedó repartido, con la misma frontera de siempre:

- **El adaptador entrega el elemento** (`getCanvasVideo()`, método 39 del
  contrato): busca bajo el ancla y filtra por las señas medidas del bucle
  —no ser el vídeo de pista, `loop`, `muted`, sin `mediaKeys`— porque el
  selector del ancla también ve el vídeo DRM cuando lo hay; eligen las
  guardas, no el orden del documento (la batería lo fija desordenando el
  panel). YouTube Music y YouTube normal devuelven `null`: su único vídeo
  ES la pista. Panel cerrado, `null`: degradación honesta al fondo
  difuminado de siempre.
- **El estado lleva un booleano** (`canvasAvailable`, en
  `metadata-reader.js`): un elemento no cabe en un mensaje, así que la
  ventana se lo vuelve a pedir al adaptador en el momento de capturar.
  Fuera de la firma del estado, como `nativePipAvailable`: es una señal
  local, no un cambio de pista.
- **La ventana captura y pinta**: un `<video>` de fondo hermano posterior
  del fondo difuminado y en su misma capa (el orden del documento lo pone
  encima sin números nuevos), con el velo de siempre garantizando la
  legibilidad y `object-fit: cover` porque el bucle es vertical y la
  ventana apaisada. `autoplay muted playsinline` y ningún `play()`: a un
  chorro silencioso Chrome lo deja arrancar solo.
- **El botón 🌌 aparece solo con la señal** y guarda la preferencia
  (`canvasPreference`, `"shown"` de serie): quien no quiera fondo no
  tiene que apagarlo en cada canción. Apagarlo, perder la señal, cerrar
  la ventana (`pagehide`: el chorro corre en la PÁGINA y no muere con la
  ventana) o reabrirla **sueltan las pistas** con `stop()` — un chorro
  vivo seguiría copiando cuadros para nadie. Canción nueva es Canvas
  nuevo: se suelta el viejo y se recaptura; el mismo elemento no se
  recaptura en cada latido.

De propina, la tanda arregló un rótulo que mentía: la ventana decía
«Volver a YouTube Music» encima de Spotify. Ahora cada adaptador declara
su `nombre` al registrarse (`validar()` lo exige) y la ventana compone
«Volver a $1» desde el catálogo; el español escrito en la plantilla queda
de reserva.

**Un hueco de jsdom confesado en la batería**: jsdom no inicializa la
propiedad `muted` desde el atributo (`<video muted>` da `muted: false`);
Chrome sí, por spec. Las pruebas reponen la propiedad a mano, igual que
ya simulan dimensiones y tiempos.

**Lo que no está medido**: si el Canvas existe en el DOM con el panel
lateral CERRADO (todas las pasadas se hicieron con la Fila de
reproducción abierta). Si no existe, la señal se apaga y el fondo se
recoge solo — la degradación ya es la honesta. Tampoco está medido el
throttling: si Chrome congela el `<video>` de la página al perder el
foco, el fondo se quedaría en el último cuadro. El primer uso real lo
dirá, y este README se corregirá con lo que se vea.

**Las mutaciones, sin confesión.** Seis mutantes, seis muertos, seis
recuentos clavados: las guardas anti-pista quitadas de `getCanvasVideo`
(con el panel desordenado devolvería el vídeo DRM), 1 fallo; la señal
siempre apagada, 1; el botón que nunca se esconde, 1; el `stop()` que no
se llama, 3; la recaptura en cada latido, 1; el rótulo que no se compone,
1. Restaurado todo, 10/10 la batería y 786/786 la suite.

## Saltos y volumen en Spotify (la tanda E: escribir donde solo se leía)

Hasta esta tanda, en el modo audio de Spotify la ventana era de solo
lectura para el tiempo y el volumen: sin `<video>` en el DOM no había
`currentTime` ni `volume` que escribir, y la barra, los ±10 s y el
deslizador se escondían o quedaban muertos. La medición del 16-09-2026
(`tools/diagnostico-seek-volumen.js`, pegado por el usuario en su
pestaña real) cambió el mapa: **los deslizadores de la propia página
aceptan la escritura sintética**. Escribiendo el `value` por el setter
del prototipo (`HTMLInputElement.prototype.value`, el truco que React no
puede interceptar por instancia) y despachando `input` y `change`
burbujeando, el salto de +5 s **se oyó** y el texto de posición lo
siguió; el volumen subió de forma audible y volvió al restaurarlo.

Lo medido que manda sobre el código:

- **El censo son CUATRO ranges**, y dos son señuelos: los tiradores de
  ancho de los paneles (`LayoutResizer__resize-bar`, min=72 max=420 y
  min=280 max=362) son `input[type=range]` de verdad y van antes y
  después de los buenos en orden de documento. Todo selector de esta
  tanda ancla por `data-testid` (`playback-progressbar`, `volume-bar`);
  uno genérico movería un panel creyendo mover la canción. Los fixtures
  traen los cuatro y las pruebas cuentan el censo como premisa.
- **La barra de progreso habla en MILISEGUNDOS** (max=161983 para la
  canción de 2:41) y va cuantizada a `step=5000`; el contrato habla en
  segundos, así que la conversión ×1000 vive en el adaptador de Spotify
  y en ningún otro sitio.
- **El volumen es 0..1 con `step=0.1`**: la página cuantiza a décimas.
  Se escribe el valor pedido tal cual y Spotify asienta el suyo (0.85 →
  0.9); no imitamos la cuantización, la leemos de vuelta.

**Los métodos del contrato son TRES, no los dos aprobados** — la
confesión de diseño de esta tanda. `seekPageTo(segundos)` y
`setPageVolume(0..1)` eran el plan; `getPageVolume()` apareció al
escribir el lector de metadatos: el deslizador de la ventana pinta
`state.volume`, y sin medio ese número se inventaba en 1 — el mando
marcaría 100 % con la página al 40 % y saltaría de vuelta tras cada
arrastre. Sin lector, los dos escritores producían una ventana mentirosa.
Los tres son del adaptador de Spotify; YTM y YouTube contestan
`false`/`null` (su escritura va por el `<video>`; la vía de página no
está medida allí y ofrecerla sería un embuste).

Las decisiones con su porqué:

- **La sonda es el escritor llamado sin número**: `seekPageTo()` a secas
  contesta «¿hay dónde escribir?» sin tocar nada. Es la pregunta que la
  ventana hace antes de destapar cada mando, en vivo y por mando (los
  dos ranges son elementos distintos y ninguno está garantizado), con el
  cortocircuito de siempre: capacidad declarada `true` no mira ningún
  DOM.
- **El controlador enruta medio primero, página después**: la conducta
  de YTM/YouTube queda byte a byte; la vía nueva solo se pisa sin medio.
  La regla «subir volumen des-silencia» NO se replica en la vía de
  página: el botón de mute de Spotify no está medido y el deslizador
  real tampoco la aplica por nosotros.
- **En la ventana ya no caen los cinco mandos juntos**: silencio y
  velocidad siguen cayendo con el medio (no tienen segunda vía);
  adelantar/retroceder caen con la sonda de saltos y el volumen con la
  suya. La barra se habilita por la misma sonda en cada pintado: si
  Spotify quita el range, vuelve a solo lectura en el mismo latido.
  Cuatro pruebas viejas codificaban la conducta anterior («los cinco
  escondidos», «la barra no se arrastra», volumen inventado en 1) y se
  actualizaron con su historia escrita en el comentario.
- **En el adaptador NO hay cotas numéricas a propósito**: la cota de
  pista ([0, duración]) y la de volumen ([0, 1]) son del controlador, y
  el recorte final a [min, max] lo hace el propio range por spec
  (sanitización de `value`, comprobada también en jsdom: 999999999 →
  «161983»). Una tercera copia de la misma regla sería un mutante
  inmortal: código que ninguna prueba puede ver fallar.

**La cuantización, confesada**: la página puede asentar el salto en el
múltiplo de 5 s más cercano y el volumen en décimas. No es pérdida
nuestra sino resolución de Spotify, y el ciclo es honesto: se escribe
0.85, la página asienta 0.9, `getPageVolume()` publica 0.9 y el mando
pinta 90 %.

**El veredicto mentiroso del diagnóstico, arreglado**: en la pasada real
el guion imprimió «la página lo REVIRTIÓ» mientras el volumen SE OYÓ
subir. Era la cuantización en el borde del umbral: se escribió 0.85, la
página asentó 0.9 y `|0.9 − 0.85| = 0.05` fallaba el `< max*0.05` justo
en el límite. El guion compara ahora contra el objetivo cuantizado al
`step` del range, que es lo máximo que la página puede asentar.

**El riesgo residual, confesado**: la medición fue desde la consola de
la pestaña (mundo de la página); la extensión escribe desde el mundo
aislado del content script. El `value` y los eventos viajan por el DOM
compartido y el listener delegado de React debería recibirlos igual,
pero *debería* no es *medido*: el primer arrastre real de la barra sobre
Spotify es esa medición. Si no mueve la música, este README se corrige.

**Las mutaciones, con una confesión.** Ocho mutantes, ocho muertos, un
recuento fallado a la primera:

1. El ancla del testid cambiada por un selector genérico de range (caería
   en el señuelo): predije 6 y la primera pasada dio **5**. La prueba de
   los eventos usaba `deepStrictEqual` sobre nodos del DOM, y dos nodos
   jsdom distintos comparan «iguales» en profundidad (sin propiedades
   propias enumerables): un evento salido del SEÑUELO pasaba por bueno.
   Arreglada la aserción a identidad estricta, la repetición con el
   mutante puesto dio los 6 prometidos. La mutación hizo su trabajo dos
   veces: mató al mutante y destapó una aserción floja.
2. Sin el ×1000 (segundos donde van milisegundos): 4, clavado.
3. La sonda que escribe (guard borrado): 1, clavado.
4. Sin el despacho de `input` (la mitad del truco que React escucha): 1,
   clavado.
5. El controlador olvida la ruta de página en `SET_VOLUME`: 1, clavado.
6. `getPageVolume()` siempre `null`: 2, clavado (la batería nueva y el
   estado completo de la batería de Spotify).
7. `aplicarCapacidades` vuelve a apagar los cinco en bloque: 3, clavado.
8. El `disabled` de la barra ignora la sonda: 2, clavado.

Restaurado todo: 10/10 la batería nueva y **796/796** la suite.

## La letra en contrafase (la tanda F: el botón que «no hacía nada»)

El reporte, en palabras del usuario: «solo aparece la letra en nuestra
extensión si se pulsa el botón en Spotify; si nosotros la presionamos
desde nuestra extensión no pasa nada». Y la trampa del diagnóstico es
que la función *ya existía*: `OPEN_LYRICS` pulsaba el botón de letras
de la página desde la primera tanda de Spotify. Lo que no hacía nada no
era el comando: era la **contrafase**.

La ventana mandaba `OPEN_LYRICS` al abrir su panel **y también al
cerrarlo**. En YouTube Music eso era inofensivo (re-pulsar la pestaña ya
seleccionada no hace nada), pero el botón de letras de Spotify es un
**alternador**: el comando del cierre cerraba la vista de la página. A
la siguiente apertura la vista amanecía cerrada, el comando la abría, el
siguiente cierre la volvía a cerrar... panel y página vivían
permanentemente al revés, y como el usuario miraba la ventana (donde el
panel sí alternaba), lo único visible era que la letra nunca llegaba:
«el botón no hace nada».

El arreglo son dos guardas, cada una con su porqué:

- **La ventana solo manda `OPEN_LYRICS` al ABRIR** (`pip.js`). Cerrar
  nuestro panel ya no toca la página a propósito: no se le cierra al
  usuario lo que él dejó abierto en su pestaña. Es una decisión, no una
  omisión — la alternativa (mandar un «cerrar» simétrico) haría de
  nuestra ventana la dueña de la vista de la página, y la página es del
  usuario.
- **El controlador no pulsa el alternador a ciegas**
  (`player-controller.js`): `openLyrics()` consulta
  `LyricsReader.isPanelOpen()` y con la vista ya abierta se abstiene. Es
  la misma regla del clic ciego de play/pause: un alternador solo se
  pulsa sabiendo que el estado actual es el contrario del pedido. La
  guarda es un `&&`, no una dependencia: en contextos sin lector de
  letras el clic sale igual.

Las dos guardas se solapan adrede (defensa en profundidad): con la
vista abierta, aunque un comando de cierre se escapara, el controlador
se abstendría. La mutación lo confirmó tal cual se predijo: al mutante
que manda `OPEN_LYRICS` también al cerrar solo lo mata la prueba con la
vista *cerrada*, porque con la vista abierta la guarda del controlador
lo enmascara.

**Lo no medido, confesado**: `isPanelOpen()` sobre Spotify sí está
medido en vivo (el `aria-pressed` del botón), pero el **clic sintético**
sobre ese botón concreto desde el mundo aislado del content script no
se ha visto ejecutar todavía — la vista siempre se abrió a mano en las
mediciones. Es el mismo riesgo residual (y la misma física: un `click()`
sobre el DOM compartido) que el arrastre de la tanda E. El primer pulso
real del botón 🎤 sobre Spotify es esa medición; si no abre la vista,
este README se corrige.

### Las bandas del modo escenario, medidas en vez de fijas

El otro síntoma del reporte («se ve un poco desordenada»): en la letra
en grande, las líneas asomaban entre la barra de tiempo y el transporte
y la atribución de la licencia quedaba en medio de los botones. Los
86/148 px fijos del CSS eran la pila de mandos medida a 380 px de
ancho, y ahí son verdad; pero la fila de extras hace `flex-wrap`, y la
medición en la vista previa enseñó que al partirse en dos líneas (a
~300 px de ancho) la pila de abajo pasa de 131 a **165 px** — más que
la banda reservada, y todo lo anclado a la banda quedaba corto. El
punto de quiebre además depende de **qué botones estén visibles** (en
Spotify `sinMedio` esconde silencio y velocidad, así que la fila se
parte más tarde que en YTM): ningún número escrito a mano vale para
todos los sitios a la vez.

La regla pasó a ser una sola: **la banda mide lo que miden los
mandos**. `ajustarBandasDeMandos()` (llamado al final de
`applyDensity`, después de poner las clases de densidad, porque de
ellas depende qué filas hay) mide con `getBoundingClientRect` la pila
de arriba (cabecera + título) y la de abajo (barra, transporte, extras,
acciones), le suma la franja de la atribución **leída del propio CSS**
(`--ytmpip-atribucion`, no repetida en JS) y escribe
`--ytmpip-mandos-arriba/abajo` en línea. Es el mismo patrón de
`--ytmpip-spectrum-height` y `--ytmpip-played`: pip.js escribe, el CSS
consume. No hay bucle medida-escritura-medida porque la variable solo
mueve el relleno del panel, los degradados y el ancla de la atribución
— nada que cambie la altura de las filas medidas.

Las abstenciones, que son la mitad del diseño:

- **Sin medida no se escribe**: con las filas midiendo 0 (documento aún
  sin maquetar) o sin `--ytmpip-atribucion` legible (la hoja no cargó),
  no se inventa nada y mandan los valores del CSS, que se quedan como
  reserva honesta — mejor un número aproximado que uno fabricado con
  ceros.
- **Al salir del escenario las variables escritas se limpian** con
  `removeProperty`, para que el CSS recupere el mando y una banda vieja
  no se quede pegada a la vuelta.

La aritmética se validó **en vivo en la vista previa** ejecutando el
algoritmo exacto sobre cinco tamaños (380×560, 340×560, 300×560 —el
caso roto del pantallazo—, y los dos minis): en todos, la atribución
quedó exactamente sobre la primera fila de mandos (holgura 0) y la
letra dejó de asomar. Y una confesión de herramienta: la vista previa
(`src/options/vista-previa.html`) **no ejecuta pip.js**, así que allí solo se
ve la reserva del CSS; las bandas medidas solo actúan en la ventana
real.

Sobre jsdom, dos hechos que las pruebas explotan: no maqueta (todo mide
0, perfecto para probar la abstención) pero **sí resuelve variables CSS
en línea** vía `getComputedStyle` (verificado antes de apostar la
prueba a ello), así que la lectura de `--ytmpip-atribucion` se prueba
de verdad y las cajas se suplantan con los números medidos en la vista
previa: lo que se vigila es la aritmética y las abstenciones, no el
motor de layout, que ahí no existe.

**Las mutaciones: siete mutantes, siete muertos, recuentos exactos y
sin confesiones.**

1. `OPEN_LYRICS` también al cerrar (la contrafase resucitada): 1,
   clavado — y la prueba superviviente fue la predicha (ver la
   defensa en profundidad de arriba).
2. La guarda del controlador borrada (pulsar siempre): 3, clavado.
3. El `&&` de tolerancia borrado (`LyricsReader` obligatorio): 1,
   clavado (TypeError donde el lector no está cargado).
4. `applyDensity` olvida llamar a `ajustarBandasDeMandos`: 2, clavado.
5. Sin el `+ atribución` en la banda de abajo: 2, clavado.
6. Sin la limpieza al salir del escenario: 1, clavado.
7. Sin la guarda `Number.isFinite` (escribiría «NaNpx»): 1, clavado.

Restaurado todo: 10/10 la batería nueva (`letras-en-fase.test.js`) y
**806/806** la suite.

## Cada sitio con su nombre (la tanda G: Preferencias y menú dejan de decir «YouTube Music» en todas partes)

La extensión empezó siendo de YouTube Music y los textos se quedaron
ahí: el menú de la barra decía «Conectado a YouTube Music» también
sobre una pestaña de Spotify, y la página de Preferencias ofrecía
ajustes de vídeo y ecualizador sin avisar de que en Spotify no
funcionan (no por pereza: el DRM y la ausencia de `<audio>`/`<video>`
en su DOM están medidos y documentados en las tandas anteriores). Nada
de esto daba error; simplemente mentía en voz baja.

**El menú.** El estado ahora viaja con `siteName`: el lector de
metadatos le pregunta al registro de adaptadores
(`YTMPip.Adaptadores.activo().nombre`), que ya obligaba a cada
adaptador a declarar su nombre humano desde la tanda D (fue lo que
arregló el «Volver a YouTube Music» sobre Spotify). El campo va
**fuera de `stateSignature`** a propósito, como `nativePipAvailable`:
el sitio no cambia en la vida de una página, no hay nada que
«detectar». Sin nombre (un estado viejo, un registro sin exponer) el
menú cae a «Conectado» a secas: genérico antes que inventado. Las
claves `buscando_ytm`, `conectado_a_ytm` y `ytm_no_encontrado` se
renombraron a sus versiones sin sitio (`buscando_musica`,
`conectado_a_sitio` con `$1`, `musica_no_encontrada`) en ambos
catálogos.

**Las Preferencias.** Tres piezas:

- **Chips de sitio** («YouTube · YouTube Music» en Vídeo, EQ y Barras;
  «YouTube Music · Spotify» en Letra). Son nombres propios y por eso
  **no llevan `data-t`**: solo se traduce el tooltip
  (`donde_funciona`). Debajo de EQ y Barras va la razón medida
  (`nota_sin_audio`): en Spotify el sonido no está al alcance de la
  página, así que no hay nada que tocar ni medir.
- **La tarjeta «Sólo en Spotify»**: le pone cara a `canvasPreference`
  (el fondo Canvas del botón 🌌, que hasta ahora solo se alternaba
  desde la ventana; la clave y su saneado ya existían en settings.js) y
  cuenta lo del PiP nativo 🎬 (`nota_pip_nativo`): el vídeo cifrado no
  se puede pintar en la ventana, pero el vídeo flotante del navegador
  sí puede con él.
- **Textos viejos corregidos**: la ayuda de Letra ya no promete la
  pestaña solo «cuando YouTube Music tiene la letra», el aviso del EQ
  dice «la pestaña de la música» y el vacío de la cola de la ventana
  dice «la página» en vez del sitio concreto.

De propina se arregló un selector muerto que la propia batería de la
página cazó (`ninguna regla del <style> apunta a una clase que no
existe`): la regla `.ytmpip-sitios + .ytmpip-fila` no casaba con nada
porque los chips de tarjeta llevan SIEMPRE su nota debajo; se quitó esa
mitad y quedó solo `.ytmpip-nota-sitio + .ytmpip-fila`.

**Las pruebas nuevas (8).** Dos del menú (la frase con el sitio de
verdad, comprobada con `strictEqual` contra el catálogo real para que
un «Conectado a Spotify undefined» no pase; y el respaldo genérico sin
nombre), tres del lector (`siteName` con fixture de YTM, con fixture de
Spotify y su URL, y `undefined` sin registro, sin que reviente el resto
de la lectura), y tres de la página de opciones: el viaje de ida y
vuelta de `canvasPreference` (con «hidden» al abrir, que no es el de
serie: solo el que no es de fábrica demuestra que se lee el storage), el
arranque en el valor de serie, y **los chips cotejados contra los
`nombre` que declaran los tres adaptadores** leyendo sus fuentes, para
que la errata «Youtube Music» no viva en silencio.

**Las mutaciones: siete mutantes, siete muertos, recuentos exactos y
sin confesiones.**

1. `readSiteName` devuelve siempre `undefined`: 2, clavado (la prueba
   del «sin registro» sobrevive a propósito: espera `undefined`).
2. `siteName` fuera del estado: 2, clavado.
3. El menú sin la rama del sitio (siempre «Conectado»): 1, clavado.
4. El menú sin el respaldo genérico (siempre `conectado_a_sitio`): 1,
   clavado — y la prueba vieja de `/Conectado/i` sobrevivió como
   estaba predicho, porque «Conectado a » también le casa.
5. `canvasPreference` sin cargar del storage: 1, clavado.
6. `canvasPreference` sin guardar: 1, clavado.
7. La errata «Youtube Music» en un chip del HTML: 1, clavado.

Restaurado todo: **814/814** la suite.

## El micrófono de emergencia (la tanda H: la letra vuelve a tener puerta en la ventana bajita)

**El síntoma, con las palabras del usuario:** «encontré un error en la
aplicación desde Spotify, y es que no aparece la opción de activar la
letra y la canción sí tenía la letra». Venía con dos pantallazos: una
ventana bajita sin rastro del botón «Letras», y la misma ventana con la
línea karaoke fluyendo — la letra existía, lo que faltaba era la puerta.

**El diagnóstico, por partes.** El botón «Letras» vive en la fila de
extras, y la densidad mini (ventana de menos de 310 px de alto,
`PIP_BREAKPOINTS.HEIGHT_MINI`) esconde esa fila entera con
`display:none` — en todos los sitios, no sólo en Spotify. En YouTube
Music eso no dejaba huérfano a nadie: la línea karaoke bajo el título
seguía siendo una entrada visible. Pero en Spotify con la vista de
letras de la página **cerrada** el lector se queda en `LOADING` (cero
`lyrics-line` que leer, y `isLyricsTabDisabled` confiesa que no puede
distinguir «no hay letra» de «no está abierta»), así que tampoco hay
karaoke. Resultado: **cero entradas a la letra** en una ventana baja.
El «Aa» que el usuario rodeó en el pantallazo era Sólo carátula, no
letras: hasta el botón equivocado parecía el candidato, porque el
bueno no estaba.

**El arreglo: un botón 🎤 en la cabecera**, que sobrevive a todas las
densidades. No tiene política propia: su clic es **el mismo manejador**
que «Letras» (`alternarPanelDeLetra`), con la regla de la tanda F
incluida (OPEN_LYRICS sólo al abrir; cerrar lo nuestro no toca la vista
del usuario). Y como abrir el panel en una ventana baja ya agranda la
ventana (regla existente de `setLyricsVisible`), pulsar 🎤 en mini hace
crecer la ventana y enseña el panel de verdad — el mismo
comportamiento que habría tenido «Letras» si se hubiera visto.

**Cuándo se enseña: sólo cuando no hay otra entrada a la vista.** Las
tres condiciones viven en `sincronizarMicDeCabecera`:

- **en mini**: con la ventana alta la fila «Letras» ya se ve y este
  botón sería el mismo dos veces;
- **sin el botón de escenario ofreciendo ya el micrófono**: con letra
  disponible y sin vídeo, aquel botón pinta el mismo dibujo para otra
  cosa (la letra en grande), y dos dibujos iguales con significados
  distintos es justo el fallo contra el que avisa iconos.js;
- **con las letras permitidas en Preferencias** — la misma llave que
  esconde «Letras», y leída del `hidden` que esa llave ya escribió en
  aquel botón, no de `Settings.get()`: el manejador de preferencias
  corre también como suscriptor de storage, o sea antes de que lo nuevo
  esté en la caché, y leer la caché ahí sería leer lo viejo.

La función se repasa en tres costuras: `applyDensity` (acaba de poner o
quitar `ytmpip-mini`), `pintarBotonDeEscenario` (el rol acaba de
cambiar, y antes del `return` temprano a propósito) y el manejador de
preferencias (la llave acaba de girar). El `aria-expanded` del 🎤 se
espeja en `setLyricsVisible` junto al de «Letras»: dos mandos del mismo
panel, o dicen lo mismo o uno miente. El dibujo es el `letra` que ya
existía en iconos.js, y las claves de catálogo son las de «Letras»
(`mostrar_ocultar_letras`, `letras`): ni icono nuevo ni texto nuevo,
sólo una puerta nueva a lo mismo.

**Lo que sigue sin medir** (heredado de la tanda F y anotado allí): el
`click()` sintético sobre el `lyrics-button` de Spotify desde el mundo
aislado de la extensión. El primer pulso real del 🎤 con la vista de la
página cerrada es esa medición.

**Las pruebas (6 nuevas, `tests/unit/mic-de-cabecera.test.js`):** el
síntoma entero (en mini el 🎤 aparece), la ventana alta lo esconde, el
rol «letra» del escenario lo esconde (y el rol «vídeo» no), la llave de
preferencias lo apaga al momento, el clic es el manejador de verdad
(abre el panel, pulsa la página una sola vez y al cerrar no la toca) y
los dos mandos del panel anuncian lo mismo.

**Las mutaciones: ocho mutantes, ocho muertos, recuentos exactos y sin
confesiones.**

1. La visibilidad ignora `mini` (siempre «sí»): 1, clavado.
2. La visibilidad ignora el rol del escenario: 1, clavado.
3. La visibilidad ignora la llave de preferencias: 1, clavado.
4. `pintarBotonDeEscenario` sin el repaso del mic: 1, clavado.
5. `applyDensity` sin el repaso del mic: 4, clavado (caen el síntoma,
   la ventana alta y las dos premisas de mini de rol y preferencias).
6. El manejador de preferencias sin el repaso del mic: 1, clavado.
7. El clic del 🎤 sin cablear: 1, clavado.
8. `setLyricsVisible` sin espejar el `aria-expanded`: 2, clavado.

Restaurado todo: **820/820** la suite.

## La ficha dice la verdad (la mini-tanda I: la descripción nombra los tres sitios)

El pendiente que la tanda G dejó señalado por escrito: la clave
`extension_descripcion` de ambos catálogos —el texto que la tienda
enseña como ficha— seguía diciendo solo «YouTube Music», cuando la
extensión funciona en tres sitios y hasta el menú ya lo dice bien.
La ficha era el último rincón donde la extensión mentía sobre sí misma.

**Los textos.** En español pasa de «Ventana flotante para YouTube Music…»
a:

> «Ventana flotante para YouTube Music, YouTube y Spotify: portada,
> letra, ecualizador y atajos. No oficial ni afiliado.»

y en inglés a:

> «Floating window for YouTube Music, YouTube and Spotify: artwork,
> lyrics, equalizer and shortcuts. Unofficial, not affiliated.»

El descargo quedó genérico («No oficial ni afiliado», sin nombrar a
Google ni a Spotify) por el presupuesto: la ficha admite **132
caracteres** y nombrar a las dos empresas lo reventaba —el primer
borrador con «no afiliado a Google ni a Spotify» ya pasaba del tope, y
fue la propia regla de la batería de la tienda (la que nació cuando la
descripción de 137 caracteres iba a hacer rechazar el ZIP) la que
marcó el límite del diseño antes de escribirlo. Los descargos por
idioma (`no oficial|sin relaci` / `unofficial|not affiliated`) siguen
casando con los textos nuevos.

**La prueba nueva** (`manifiesto-tienda.test.js`): «LA DESCRIPCION
NOMBRA LOS TRES SITIOS DONDE FUNCIONA, EN CADA IDIOMA». No escribe los
nombres a mano: los **lee de las fuentes de los tres adaptadores**
(el `nombre: "..."` que el registro obliga a declarar desde la tanda
D), igual que la prueba de chips de la tanda G — si un adaptador se
renombra, la prueba exige que la ficha lo siga. Límite confesado en el
propio comentario: «YouTube» es subcadena de «YouTube Music», así que
`includes()` no distingue una descripción que solo dijera «YouTube
Music» de una que nombrara a los dos; el orden «YouTube Music, YouTube
y Spotify» del texto real sí los separa, pero la prueba por sí sola no
lo vigila.

**Las mutaciones: cuatro mutantes, cuatro muertos, recuentos exactos y
sin confesiones.**

1. El catálogo español vuelve al texto viejo (solo YouTube Music): 1,
   clavado.
2. El catálogo inglés vuelve al texto viejo: 1, clavado.
3. El descargo español desaparece de la descripción: 1, clavado (la
   regla del descargo, que ya existía, lo caza).
4. El descargo inglés desaparece: 1, clavado.

Restaurado todo: **821/821** la suite. La ficha ya no requiere
recargar nada en la pestaña: la descripción solo vive en el manifiesto
y en la tienda.

## El halo de luz (la tanda J: el borde que puede latir con la música)

La idea llegó en una imagen: el usuario enseñó un arte generado por IA
con la ventana rodeada de un resplandor y preguntó si ese efecto se
podía tener. La respuesta corta es «por dentro sí, por fuera no»: la
ventana del Document Picture-in-Picture es un **rectángulo opaco del
sistema operativo** — fuera de su borde no hay lienzo donde pintar, así
que el resplandor exterior de la imagen es físicamente imposible. Lo
que sí se puede es un **halo interior**: una capa fija pegada al borde
con una sombra `inset` del color de acento del tema, que baña la
cabecera y los mandos como haría un marco de verdad.

**Tres respuestas, dos claves.** El usuario pidió «personalizado, por
defecto fijo, y desde la ventana también». La página de Preferencias
ofrece un desplegable de tres: *Apagado / Fijo (una luz quieta) /
Latiendo con la música*. Pero en storage son **dos claves** —
`haloPreference` (si se ve; `shown` de serie) y `haloMode` (cómo se ve;
`fixed` de serie) — porque el botón ✨ de la ventana solo enciende y
apaga, y si apagar borrara el modo, quien eligió «latiendo» y apaga un
rato recibiría otra cosa al volver a encender. Es el mismo reparto que
`equalizer`/`equalizerLast`. En Preferencias, elegir «Apagado» escribe
solo el interruptor y el modo dormita debajo, intacto.

**El tercer cliente del analizador.** El latido reutiliza `leerPulso`
—la medición de graves del 💓, con su misma justificación medida— pero
escribe una variable CSS **propia**, `--ytmpip-halo-golpe`: si
escribiera `--ytmpip-pulse`, encender el halo en modo latido pondría a
bailar la carátula con el 💓 apagado. En el fotograma la FFT se lee
**una sola vez** y sirve a los dos. En `pip.css` el golpe va **al
cuadrado** en la opacidad, por la misma medición que el pulso de la
carátula: la señal pasa el 70 % del tiempo por encima de 0.2, y en
lineal eso es un parpadeo nervioso, no un latido.

**La regla del gesto, que es lo único de verdad nuevo.** El halo es el
primer cliente cuyo latido es una *preferencia guardada* en vez de un
clic de la sesión, y ahí choca con la regla del `AudioContext`: sin un
gesto del usuario nace suspendido, y conectarse al abrir daría un
latido clavado en cero que parece roto. La solución es la bandera de
sesión `gestoEnSesion`: un latido guardado **sale fijo** y arranca con
el primer clic que toque audio (✨, 💓 o 📊 — cualquiera vale, porque
cualquiera despierta el mismo contexto). El gesto no se hereda entre
ventanas ni se persiste. Y con la letra en grande el halo queda fijo
(mantener la conexión enseñaría el canvas del espectro debajo de la
letra, la regresión documentada), pero el contexto **no se suelta**:
cuenta el *deseo* (`haloQuiereLatir`), no el hecho (`haloLate`), porque
soltar el contexto gastaría un gesto que el usuario ya pagó. En
Spotify, sin `captureStream`, el latido guardado no puede cumplirse y
el halo se queda fijo sin desaparecer: fijo es exactamente lo que allí
se puede prometer.

**La trampa que cazó la primera pasada de la batería.** Cuatro pruebas
rojas de estreno, y el culpable era el arnés, no el código: aplicaba el
modo latido llamando a `applySettings` directamente, pero la caché de
Settings nunca lo aprendía — y `guardarPreferenciaHalo` notifica **con
la caché**, así que el primer clic del ✨ repintaba «fixed» encima de un
latido que solo existía en el aire. Es la misma trampa ya documentada
en la tanda H (la suscripción corre antes que la caché) vista desde el
otro lado. El arreglo fue de fidelidad: el banco ahora **siembra el
almacén y pasa por `Settings.load()`**, que es como el modo llega en la
ventana de verdad.

**El cero enmascarado.** Al preparar los mutantes apareció un hueco: el
cero que apaga la luz al desactivar el halo vive en dos sitios
(`sincronizarEspectro` y la cortesía de `pararAnimacion`), y en todas
las pruebas el apagado también paraba la animación — un mutante que
borrara el cero de `sincronizarEspectro` sobreviviría. La prueba
«apagar el halo CON LA CARÁTULA LATIENDO» cierra el hueco: el 💓
mantiene viva la animación, `pararAnimacion` no corre, y el único cero
posible es el del apagado en sí.

**Las pruebas.** `pip-halo.test.js` (15): la preferencia y el botón, la
regla del gesto entera (guardado sin clic = fijo; el propio ✨ como
gesto; el 📊 desbloquea y comparten UN analizador), variables separadas
en ambos sentidos, los apagados (a mitad de golpe, con la carátula
latiendo, con la letra en grande, en Spotify), la decisión visual leída
de `pip.css` (sombra interior de acento, opacidad con el golpe, sin
robar clics, y el bloque de menos movimiento que anula la fuerza), y el
icono propio. En `opciones-ecualizador.test.js` (+2, junto a los
vecinos de sitios): la traducción tres-respuestas↔dos-claves de la
página, con el «off» que no borra el modo. Y el viaje de ida y vuelta
de `settings.test.js` aprendió las dos claves nuevas, lejos de su valor
de serie a propósito.

**Las mutaciones: once mutantes, once muertos, dos confesiones.**

1. `haloQuiereLatir` sin `gestoEnSesion`: predije 3, cayeron 3, las
   tres exactas (la regla del gesto, el caso pedido por el recuento de
   contextos, la letra en grande por el contexto cerrado).
2. `alguienQuiere` sin `!letraEnGrande`: 1, clavado.
3. `haloLate` sin `conectado`: 3, clavados (gesto, letra, Spotify).
4. Sin el cero del apagado en `sincronizarEspectro`: **confesión —
   predije 1 y cayeron 2**. «Y al revés» también murió, porque su
   «0.000» solo lo escribía la línea mutada: en ese flujo la animación
   nunca se para y la cortesía de `pararAnimacion` jamás corre. Mejor
   cobertura de la que supe predecir.
5. El halo escribe `--ytmpip-pulse`: 6, los seis exactos.
6. `desconectar` ignorando el deseo del halo: 1, clavado.
7. El ✨ sin `gestoEnSesion = true`: 4, los cuatro exactos.
8. `guardarPreferenciaHalo` sin `notify()`: **confesión — predije 2 y
   cayeron 3**. «Con la carátula latiendo» murió por la misma vía que
   «apagar a mitad»: sin aviso el apagado nunca llega a
   `sincronizarHalo` y el borde sigue latiendo.
9. Opciones, guardar «off» por la rama de encendido: 1, clavado (y
   habría escrito `haloMode: "off"`, un modo que no existe).
10. Opciones, cargar ignorando el apagado guardado: 1, clavado.
11. El bloque de menos movimiento borrado de `pip.css`: 1, clavado.

Restaurado todo: **838/838** la suite (821 + 15 del halo + 2 de
opciones) y el ZIP reempaquetado. Queda **sin medir en vivo** el primer
encendido del latido en la ventana real: la regla del gesto está
razonada sobre la especificación del `AudioContext` y el patrón ya
medido del 💓/📊, pero el primer clic real del ✨ en modo latido es esa
medición.

## El color del halo (la tanda K: «accent» o un hex, decidido por la forma)

Con el halo ya en la ventana, el usuario pidió lo único que le faltaba:
elegir **de qué color** brilla. Un solo color para todo el halo —base y
latido—, que fue exactamente lo acordado: se propuso también un color
aparte para el golpe y se descartó.

**Una clave con dos formas, no dos claves.** `haloColor` guarda o la
palabra `"accent"` (el color del tema, lo de siempre) o un `"#rrggbb"`
elegido a mano. Es el mismo patrón que `spectrumColor`: el modo se
deduce de la FORMA de lo guardado, porque una clave para el modo y otra
para el color podrían guardar dos respuestas contradictorias a una
pregunta que solo admite una. A diferencia del espectro, aquí **no hay
`"rgb"`, ni `"source"`, ni paletas**: el halo es una sola luz, no una
fila de barras. Por eso el saneador es propio (`normalizarColorDeHalo`:
`"accent"`, o un hex a minúsculas, o el valor de serie) y **no**
reutiliza `normalizarColor` — el del espectro habría dejado pasar un
`"rgb"` guardado a mano y la variable CSS habría acabado valiendo la
palabra «rgb», que no pinta nada. Ese caso venenoso tiene su prueba.

**La ausencia es el mecanismo.** El CSS del halo pasó de
`var(--ytmpip-accent)` a `var(--ytmpip-halo-color, var(--ytmpip-accent))`,
y `sincronizarHalo` hace una sola cosa nueva: si el color guardado
empieza por `#`, lo escribe en línea sobre la capa; si es `"accent"`,
**quita** la variable en vez de escribir el hex del tema. Copiar el
valor del tema habría sido escribirlo por segunda vez y dejar de
seguirlo al cambiar de tema; sin la variable, la cadena cae sola al
acento. La prueba del CSS se endureció de paso: buscaba
`var(--ytmpip-accent)` y eso es **subcadena del respaldo**, así que
habría pasado igual con la cadena rota; ahora exige la cadena completa.

**Preferencias, con el patrón del espectro.** Bajo el desplegable del
halo hay ahora «Color del halo» con dos respuestas —«El del tema» y «Un
color mío», las MISMAS claves de catálogo que usa el espectro, porque es
la misma pregunta y debe sonar igual en toda la página— y un cuentagotas
que solo aparece con «Un color mío». El cuentagotas escondido nace con
el rojo sugerido (`COLOR_SUGGESTED`, el mismo estreno que el del
espectro) para que abrirlo no enseñe un negro que nadie eligió. Dos
decisiones con motivo: la fila **se ve también con el halo apagado** (el
color es «a qué volver al encender», como el modo), y al guardar «El del
tema» se escribe la palabra `"accent"`, no el hex resuelto. La página
deduce el desplegable de lo guardado con el MISMO `normalizarColorDeHalo`
exportado de settings.js, no con una copia de la regla escrita allí. La
ayuda del halo dejó de decir «del color del tema», que ya no es verdad
siempre.

**Las pruebas** (3 nuevas en `pip-halo`, 2 en opciones, 1 en settings,
más el round-trip de settings que aprende la clave sin ser prueba
nueva):
de serie la capa NO lleva la variable en línea; un color propio la
escribe y volver al tema la QUITA; el camino completo
storage→saneador→capa baja mayúsculas a minúsculas sin pedir gesto
ninguno; opciones carga/guarda en las dos direcciones y estrena el
cuentagotas con el rojo sugerido; el round-trip de settings aprende
`haloColor` (con un hex, lejos del valor de serie) y la basura —incluido
el `"rgb"` venenoso— cae al tema.

**Las mutaciones: 10 mutantes, recuentos comprometidos antes, y por
primera vez en varias tandas SIN CONFESIONES** — los diez cayeron con
los números exactos:

1. El saneador devuelve el crudo en vez del valor de serie: 3, clavados
   (storage vacío, la basura, opciones sin color guardado).
2. Sin `toLowerCase()`: 2, clavados.
3. `normalize()` ignora lo guardado (siempre `"accent"`): 3, clavados.
4. `sincronizarHalo` nunca escribe la variable: 2, clavados.
5. Siempre la escribe (con `"accent"` de valor): 2, clavados.
6. La variable mal escrita (`--ytmpip-halo-colo`): 2, clavados.
7. El CSS sin el respaldo: 1, clavado (gracias a la regex endurecida;
   la vieja no lo habría visto).
8. Opciones guarda siempre `"accent"`: 1, clavado.
9. Opciones nunca deduce «Un color mío» al cargar: 1, clavado.
10. Las líneas de visibilidad del cuentagotas borradas: 1, clavado.

Restaurado todo: **844/844** la suite (838 + 3 de pip-halo + 2 de
opciones + 1 de settings) y el ZIP reempaquetado. Sin medición viva
pendiente propia: el mecanismo es una variable CSS en línea, el mismo
que `--ytmpip-halo-golpe` ya validado en vivo en la tanda J.

## El escenario limpio (la tanda L: «o lees, o mandas»)

**El síntoma, con pantallazo y palabras del usuario:** «se ve muy feo,
hay muchas cosas en pantalla... parece como un error de diseño», junto a
la captura de otra extensión con la vista que sí quería: la línea que
suena grande y entera, las vecinas apagadas, y casi nada más en
pantalla. El diagnóstico importó: el estado en REPOSO del modo letra ya
era así de limpio (todos los mandos se desvanecen solos desde la tanda
F); lo feo era el estado CON EL CURSOR DENTRO, cuando volvían las cinco
filas flotantes de golpe encima de la letra entera, con el texto pasando
por detrás del deslizador. No había que copiar a nadie: había que
decidir qué pasa cuando los mandos y la letra piden el mismo píxel.

Tres decisiones, las tres en `pip.css` (la tanda no toca ni una línea de
JS ejecutable):

**1. «O lees, o mandas».** Cuando los mandos entran (cursor o foco
dentro de la ventana), la letra se aparta a `opacity: 0.25` — presente
para no desorientar, sin competir. La excepción es el cursor sobre la
PROPIA letra: las líneas son pulsables (saltan a su verso) y atenuar lo
que se está apuntando sería esconder el blanco. El reparto lo hace la
prueba del impacto: los mandos flotan por encima (z 2) y no son hijos
del panel, así que el cursor sobre un botón no enciende el `:hover` del
panel, y en el centro de la ventana —donde solo hay letra— sí. Las dos
reglas empatan en peso (1,5,0) y gana la que va después: **el orden
atenuar→devolver es comportamiento**, y hay una prueba que vigila
exactamente eso. Todo vive dentro de `@media (hover: hover)` con el
resto del autoocultado: en táctil no hay cursor que acercar y un
`:focus-within` tras cualquier toque dejaría la letra al 25 % sin forma
de recuperarla (también con su prueba, anclada a la llave de apertura
del bloque porque el texto del media vive además en dos comentarios).

**2. La fila secundaria fuera del escenario, a todos los tamaños.** En
mini ya faltaba, y el motivo de mini valía en realidad para todos: al
acercar el cursor se acumulaban cinco filas flotantes y apenas quedaba
letra a la vista. Ninguna de sus tres acciones queda sin salida:
«Letras» tiene su gemelo en el botón de escenario de la cabecera, y
«Siguientes» y «Volver a…» se alcanzan saliendo del modo letra, que es
un clic. La fila de extras con el volumen SÍ se queda: se pidió a
propósito en su día. Y la banda de abajo no hay que retocarla: desde la
tanda F `pip.js` la MIDE con `getBoundingClientRect`, y una fila con
`display: none` mide cero — la lista de candidatas de
`ajustarBandasDeMandos` conserva la fila a propósito (la visibilidad
decide, no la lista), con su comentario para que nadie la «limpie». El
banco de las bandas ahora suplanta esa caja con 0, que es lo que mide de
verdad.

**3. La jerarquía del escenario.** La regla base del karaoke —énfasis
solo por color, sin reflujo, medida en Spotify— sigue intacta en el
panel pequeño, y el escenario pasa a ser su excepción DELIBERADA, con el
porqué escrito en ambos carteles: aquí la letra es el único dibujo de la
ventana y a 13 px heredados todas las líneas se leían del mismo rango; y
el reflujo que la regla base evita aquí no duele, porque el
desplazamiento automático vuelve a centrar la línea activa con cada
verso — el mismo movimiento que causa el pelo lo corrige. Las líneas
suben a 16 px con `opacity: 0.5`; la activa, a 19 px y entera. El
apagado va por opacidad y no oscureciendo el color: el fondo es la
portada difuminada, que cambia con cada canción, y la opacidad se apoya
en el color del tema, que ya resolvió ese contraste. La activa NO
redeclara su color: la regla base de la activa ya se lo da, y una copia
aquí habría sido un mutante inmortal.

La letra chica de la accesibilidad: el bloque de `prefers-reduced-motion`
ganó dos entradas con el PESO COMPLETO de los selectores nuevos (llevan
el id, y las clases sueltas de la lista vieja perderían el empate contra
ellos): el apagado y el tamaño se conservan —son contraste, no
movimiento—, el fundido se quita.

**Las pruebas (6 nuevas en `letras-en-fase.test.js`, sección 4):** jsdom
ni maqueta ni resuelve `:hover`, así que vigilan que las decisiones
estén TOMADAS en la hoja, leyéndola como texto (las mismas armas que
pip-halo): la fila secundaria con `display: none` y sin el posicionado
viejo; el atenuado al 0.25 y la vuelta bajo el propio cursor; el ORDEN
de esas dos reglas; que vivan dentro del `@media (hover: hover)`; la
jerarquía comparando tamaños entre sí (los píxeles exactos son un juicio
estético; la relación es la decisión); y las entradas del movimiento
reducido con su peso completo. Además el banco de bandas modela la fila
escondida midiendo 0.

**Las mutaciones: 11 mutantes, recuentos comprometidos antes, y otra vez
SIN CONFESIONES** — los once cayeron con los números exactos:

1. La regla de la fila secundaria vaciada: 1, clavado.
2. La regla vieja de la fila (posicionado sin `display: none`): 1,
   clavado.
3. El atenuado a `opacity: 1`: 1, clavado.
4. La regla de devolver borrada: 2, clavados (la mitad «vuelve» y la
   premisa de la prueba del orden).
5. Atenuar y devolver intercambiadas: 1, clavado (solo la del orden: el
   empate de peso lo decide quién va después).
6. Las tres reglas fuera del `@media (hover: hover)`: 1, clavado.
7. La activa al tamaño de las vecinas: 1, clavado.
8. Las vecinas sin apagar: 1, clavado.
9. El movimiento reducido sin las entradas del escenario: 1, clavado.
10. Las entradas sin el id (perderían el empate de peso): 1, clavado.
11. Las líneas del escenario sin crecer (13 px heredados): 1, clavado.

Restaurado todo (verificado byte a byte contra el respaldo):
**850/850** la suite (844 + 6 de letras-en-fase) y el ZIP
reempaquetado.

**Lo NO medido de esta tanda:** el reparto del `:hover` entre panel y
mandos se razonó sobre la prueba del impacto (los mandos no son hijos
del panel), pero jsdom no hace hit-testing y la vista previa no ejecuta
`pip.js`: la primera pasada del cursor real por el escenario ES esa
medición. Si fallara, el síntoma sería la letra quedándose al 25 %
también con el cursor sobre las líneas. Queda ofrecida y NO aprobada la
segunda idea del pantallazo de referencia: la portada en columna junto a
la letra en ventanas anchas.

## El rojo 255 (la tanda N: un solo rojo, y vigilado)

El usuario pidió, con sus palabras, *«cambiar el color defecto de la app a
un rojo 255»*, y al aprobar el arranque añadió la segunda mitad de la
decisión: *«tema claro rojo oscuro»*. Así que el acento del tema oscuro pasa
de `#f15a5a` a **`#ff0000`** y el del tema claro **no se toca**: sigue en su
`#d32f2f`, porque el rojo 255 puro sobre fondo blanco pierde contraste (el
comentario nuevo de `pip.css` lo deja escrito al lado del valor).

**El cambio en sí es trivial; lo que tiene miga es el censo.** El rojo de
acento vive copiado en seis sitios del producto, y las copias son
deliberadas —cada una tiene su motivo documentado, casi todas de tandas
anteriores—: son documentos que no pueden leerse entre sí mientras se
pintan.

1. `src/pip/pip.css` — la fuente de la verdad (tema oscuro).
2. `src/pip/pip.css` — el tema claro, que es OTRO valor a propósito.
3. `src/popup/popup.css` — el menú es su propia página.
4. `src/options/options.html` — ídem las Preferencias.
5. `src/shared/constants.js`, `COLOR_SUGGESTED` — donde nace el
   cuentagotas de «Un color mío».
6. `src/pip/pip.js` — el botón flotante de rescate que se pinta SOBRE la
   página del sitio, con su color en un `cssText`: la copia más fácil de
   olvidar, porque no hay ningún archivo `.css` que abrir.

Y de propina `PALETTE_SUGGESTED`, cuyo invariante («hermanos del primero,
misma luz y misma saturación, girando el tono») el rojo puro conserva de la
manera más limpia posible: `#ff0000/#00ff00/#0000ff` son rotaciones puras de
canales. Quedan FUERA a propósito los `#f15a5a` de los `tools/diagnostico-*`
(tinte cosmético de consola, no viajan a la tienda) y las menciones
históricas de esta crónica y de los comentarios, que describen la época en
que ese era el rojo.

**Lo que la tanda deja además del color son cinco pruebas**, en
`opciones-ecualizador.test.js`, junto a la que ya ataba la página de
opciones a la ventana (la de «EL ROJO DE ESTA PAGINA…», de la tanda del
`#ff0033`). Cuatro son de coherencia — menú↔ventana, botón
flotante↔ventana, cuentagotas↔ventana, y paleta (arranca en el cuentagotas
y los hermanos giran canales, comprobado sin trigonometría: mismo
multiconjunto `{r,g,b}`) — y pasarían con cualquier color mientras las
copias coincidan. La quinta es distinta: **fija la decisión** (oscuro
`#ff0000`, claro `#d32f2f`, con las palabras del usuario citadas en el
comentario), para que un retoque estético futuro no la deshaga sin
enterarse. El acento del claro se busca DENTRO del bloque
`html.ytmpip-theme-light`, no «el segundo del archivo», para que reordenar
temas no deje a la prueba mirando otra cosa.

La quinta prueba (la del botón de rescate) nació del propio ritual: al
comprometer la lista de mutantes quedó claro que revertir el hex del
`cssText` no lo mataba nadie — un inmortal anunciado se cubre antes de
correr, no se confiesa después.

**La suite completa cazó lo que el censo no podía ver.** Con las siete
mutaciones ya muertas y la batería local en verde, la pasada completa se
puso roja en «EL ESTADO BAJO EL VELO LOCAL PASA AA EN LOS OCHO PEORES
CASOS»: el alfa `0.78` del velo de la cabecera era el MÍNIMO calculado
para que el acento viejo pasara AA (su comentario lo decía), y el rojo 255
es más oscuro — con él, el peor caso caía a 3.98:1. Las cuentas dieron
además un techo que merece quedar escrito: el `#ff0000` sobre el fondo
oscuro, con el velo opaco del todo, no pasa de **4.79:1** — este rojo pasa
AA, pero nunca con lujo. El velo sube a `0.94` (4.60 en el peor caso;
pedir «el margen de antes» es pedir lo imposible) y su comentario cuenta
la historia entera. Ese es el séptimo sitio del censo, el que ninguna
búsqueda de `#f15a5a` iba a encontrar: una CONSECUENCIA del color, no una
copia. La prueba AA ya lo vigilaba sola —hace las cuentas con los valores
leídos del CSS—, así que no hace falta prueba nueva; el mutante M8 lo
demuestra.

Los ocho mutantes, con las muertes comprometidas por escrito antes de
correr (batería: opciones + settings + paleta; M8 sobre accesibilidad):

1. El oscuro de `pip.css` de vuelta a `#f15a5a`: 5, clavado (las cuatro
   coherencias + la decisión fijada).
2. El `--accent` del menú de vuelta: 1, clavado.
3. El `--accent` de las Preferencias de vuelta: 1, clavado (lo mató la
   prueba vieja, que sigue haciendo su trabajo).
4. El `background:#…` del botón de rescate de vuelta: 1, clavado.
5. `COLOR_SUGGESTED` de vuelta: 2, clavado (cuentagotas + el arranque de
   la paleta).
6. Un hermano de la paleta desteñido (`#00ff00`→`#00cc00`): 1, clavado.
7. El tema claro copiando el `#ff0000`: 1, clavado (la rama del claro de
   la decisión fijada).
8. El velo de la cabecera de vuelta a `0.78`: 1, clavado (la prueba AA,
   sin tocarla).

Sin confesiones en los recuentos. Restaurado todo (verificado byte a
byte), **855/855** la suite (850 + 5) y el ZIP reempaquetado. Nada de esta
tanda necesita medición viva: son valores de hojas y constantes,
mecanismos ya validados; basta recargar y mirar el rojo — y de paso la
cabecera, que ahora lleva un velo algo más sólido y ese cambio sí se ve.

## El halo según la carátula (la tanda M: el borde con el color de lo que suena)

Lo pedido: «el modo de color del halo según la carátula también». El
muestreo del color de la fuente ya existía entero para el espectro
(`color-fuente.js`, medido en vivo en su día); la tanda no inventa un
muestreo nuevo, convierte al halo en su **segundo cliente**.

**El saneador aprende «source».** `normalizarColorDeHalo` acepta ahora
`"accent"`, `"source"` o un hex. «source» estuvo en la lista de
rechazados a propósito (al nacer la clave, el halo no sabía resolverlo);
ese motivo ya no existe y la prueba de settings lo dice con esas
palabras. **«rgb» sigue siendo veneno**: es un modo válido del espectro
que en el halo dejaría la variable CSS valiendo la palabra «rgb».

**La puerta del muestreo tiene dos clientes.** `sincronizarColorFuente`
recibe ahora los settings enteros y calcula
`alguienQuiere = (espectro visible && spectrumColor "source") || (halo
encendido && haloColor "source")`. El deseo del halo se lee de los
SETTINGS y no de `els.halo.hidden` a propósito: en `applySettings` la
puerta corre ANTES que `sincronizarHalo`, o sea antes de que el `hidden`
diga la verdad nueva. Y no lleva `visible` porque el halo no necesita
medio, solo la portada.

**El halo no tiene bucle de fotogramas, y no se le pone uno.** El
suavizado del espectro (`colorDeLaFuente`) acerca el color un paso por
llamada y vive del rAF; con el halo fijo ese bucle no corre, y
arrancarlo solo para acercar un color sería un rAF eterno trabajando
para nadie. `pintarColorFuenteEnHalo` escribe el OBJETIVO tal cual en
`--ytmpip-halo-color` y el suavizado lo pone la hoja: `transition:
box-shadow 600ms ease` sobre `#ytmpip-halo`. Sin color muestreado
(portada en blanco y negro, o muestreo recién parado) la variable SE
QUITA y el CSS cae solo a `var(--ytmpip-accent)` — la misma promesa del
modo fuente del espectro, con el mismo mecanismo con el que «accent»
funciona desde la tanda K.

**El olvido limpia también el halo, y la limpieza vive donde toca.**
`pararMuestreoFuente` llama al pintor con el objetivo ya en null: sin
esa llamada, el borde se quedaría brillando con el color de la canción
que sonaba al apagar. El pintor se abstiene si el halo no sigue a la
fuente (un hex propio no se toca porque el ESPECTRO apague su muestreo).
La prueba que vigila esta limpieza la llama DIRECTO, como hace
`render()`: en el camino de `applySettings` el repintado posterior de
`sincronizarHalo` la enmascararía — está contado en la propia prueba.

**Preferencias: tres respuestas.** El desplegable del color del halo
gana «Del vídeo o la carátula» (reusa `opcion_color_fuente`: misma
pregunta, mismo sonido que en el espectro) con una pista propia nueva
(`pista_halo_fuente`, en ambos catálogos) que avisa de que una imagen
sin color claro vuelve al tema. La deducción del modo ya no es un charAt
de dos caminos: «accent» y «source» son modos con nombre y lo demás es
«custom»; guardar escribe la palabra tal cual. El cuentagotas queda
escondido en este modo, pero conserva su color: es «a qué volver».

Los doce mutantes, con las muertes comprometidas por escrito antes de
correr:

1. El saneador sin `|| "source"`: 5, clavado (settings + 3 del halo + la
   página de opciones — el camino entero desde storage).
2. La puerta sin la mitad del halo: 3, clavado (el segundo cliente + los
   dos olvidos).
3. La puerta con `=== "hidden"` (el deseo al revés): predije 4, **cayeron
   3 — confesión**: la prueba del olvido por `applySettings` pasa
   legítimamente porque `syncVideoMode` dispara un `render()` que vuelve
   a pasar por la puerta con la caché y limpia igual; lo verifiqué con un
   repro paso a paso antes de contarlo como cobertura fantasma.
4. El pintor sin la guarda de `haloSigueLaFuente`: 1, clavado (el hex
   propio arrancado por el apagado del espectro).
5. El pintor sin el `removeProperty`: 3, clavado.
6. `haloSigueLaFuente = false` en `sincronizarHalo`: 3, clavado.
7. `sincronizarHalo` sin la rama de «source»: 3, clavado.
8. `pararMuestreoFuente` sin su llamada al pintor: 1, clavado — y es
   exactamente la prueba de la limpieza directa, nacida de anunciar este
   inmortal ANTES de correr, como manda el ritual.
9. La hoja sin la `transition`: 1, clavado.
10. La página sin la línea que enseña la pista: 1, clavado.
11. Guardar siempre el hex del cuentagotas: 2, clavado (la prueba nueva
    y la vieja de «accent», que sigue haciendo su trabajo).
12. Cargar sin distinguir «source» de un hex: 1, clavado.

**Lo que jsdom no puede matar, confesado:** las llamadas al pintor
dentro de `muestrearFuente` y de la sonda de la portada (el color que
llega DURANTE la reproducción) son el camino del vídeo en vivo —
píxeles y `onload` de imágenes que jsdom no tiene. Es el mismo camino ya
validado en vivo para el espectro con `tools/diagnostico-color-video.js`
y `diagnostico-color-portada.js`; la ventana solo añade una variable CSS
en línea, el mecanismo ya validado del golpe del halo. La primera
canción con el modo puesto es la medición.

Restaurado todo (verificado byte a byte), **864/864** la suite (855 + 9:
2 del segundo cliente, 6 del halo, 1 de opciones) y el ZIP
reempaquetado. Para verlo: recargar la extensión, Preferencias → El halo
de luz → Su color → «Del vídeo o la carátula».

## El logo es código (la tanda O: los tres PNG salen de un generador)

La petición: «el logo de la app cambiarlo», con una imagen de referencia
(ventana oscura con una tarjeta roja redondeada y una nota musical
blanca), y después «genera el logo por código SI PUEDES». Se pudo, y esa
decisión es la tanda entera: los tres PNG de `assets/icons/` ya no son
binarios sueltos sino la salida determinista de
`tools/generar-iconos.js`, sin ninguna dependencia. Para cambiar el logo
se edita ese archivo y se vuelve a correr `node tools/generar-iconos.js`.

**El dibujo.** En 128 y 48 el icono cuenta la historia de la extensión
en un cuadro: la ventana grande oscura es la página de música, dos
barras grises arriba a la izquierda sugieren su contenido, y la tarjeta
roja con la nota blanca —abajo a la derecha, porque ahí viven las
ventanas PiP— ES la ventanita flotante. En 16 queda solo la tarjeta con
la nota: la ventana de atrás sería un borde de un píxel ilegible. La
nota es una corchea doble de ejes rectos a propósito (círculos y
rectángulos): una corchea suelta pide banderola inclinada, que a 16
píxeles es una mancha. El rojo de la tarjeta es el `#ff0000` de la casa
—otra copia deliberada del censo de la tanda N, vigilada por prueba de
texto contra el acento oscuro de `pip.css`—. El gris de la ventana NO es
el `#0f0f0f` del fondo real, a propósito: es `#202124`, un punto más
claro, porque contra la barra de herramientas oscura de Chrome el fondo
real no dibuja silueta y sin silueta no hay historia.

**La técnica.** Formas por campos de distancia (rectángulos redondeados
y círculos), supermuestreo 8×8 por píxel, y el promedio de submuestras
EN PREMULTIPLICADO: promediar el RGBA recto cuenta lo transparente como
negro y los bordes contra el vacío salen con un cerco oscuro, el fallo
clásico de los antialiasing caseros. El PNG se codifica en el propio
generador: firma, IHDR (RGBA de 8 bits), un solo IDAT (deflate de
`node:zlib` sobre filas con filtro 0) e IEND, con el CRC32 de la
especificación implementado a mano.

**Lo que un logo generado permite probar** (`iconos-generados.test.js`,
9 pruebas). La central: los tres PNG comprometidos en el repo son byte a
byte lo que el generador produce hoy — un icono retocado a mano, o un
generador cambiado sin regenerar, caen al instante. Alrededor: el CRC32
propio contra el vector conocido de la especificación (`"123456789"` →
`0xcbf43926`, sin él verificar los CRC de los chunks con la misma
función sería circular); la estructura del PNG leída con un lector a
mano independiente y el IDAT descomprimido por `inflateSync` (el inverso
independiente); el censo de tamaños cotejado contra las DOS
declaraciones del manifiesto (`icons` y `action.default_icon`); un píxel
de muestra por capa en el 128, elegido por geometría; que el 16 no tenga
ni un píxel del gris de la ventana; que todo borde con alfa parcial del
16 sea rojo PURO (el síntoma del premultiplicado, no su fórmula); y la
coherencia del rojo con `pip.css`.

**La mutación**: 9 mutantes, todos muertos con los recuentos exactos
comprometidos antes de correr, sin confesión — 2/2/1/2/2/2/3/2/2
(tarjeta al coral viejo, nota borrada, radio de la ventana a cero,
filtro a 1, `crc32` a cero, colortype a RGB, el 16 con escena completa,
promedio recto, archivo renombrado). Dos debilidades ANUNCIADAS antes de
correr y confirmadas: los píxeles de muestra comparan contra `COLORES`
(autorreferentes: documentan la capa; el VALOR lo guardan el cotejo byte
a byte y la prueba del rojo), y el retoque fino del radio solo lo caza
el cotejo global — que para eso existe. La prueba de CRCs de chunks pasó
autoconsistente bajo el mutante del `crc32` a cero, exactamente como
estaba anunciado: el vector conocido es quien vigila esa puerta.

**873/873** la suite (864 + 9) y el ZIP reempaquetado — los iconos
viajan dentro. Para verlo: recargar la extensión (Chrome puede tardar en
refrescar el icono de la barra; a veces pide reiniciar el navegador).

## La piel del segundo rediseño (la tanda P: Preferencias a la manera de la maqueta)

La petición, con tres pantallazos de una maqueta generada en Google AI
Studio: «edita el html de edición de la pagina principal de la aplicación
por algo muy parecido a lo siguiente. Me gustan las barras que usan en el
ejemplo». Y el alcance aprobado: «dale, incluye la matriz y la vista
previa incrustada también». La maqueta era React 19 con Tailwind; lo que
se tomó de ella es el **lenguaje visual** —píldoras en vez de
desplegables, deslizadores con su valor vivo y sus marcas, cabecera
pegajosa con logo y ancla por sección— reescrito en el CSS de la casa,
sin ninguna dependencia nueva.

**La decisión que sostiene la tanda: los `<select>` no se van, se
esconden.** Cada grupo de píldoras declara en `data-para` el id de su
select; los botones escriben el `value`, repintan la piel y disparan el
`change` de siempre. Las píldoras **no guardan, empujan**: `save()` y
`load()` siguen hablando solo con los selects, así que ni una prueba
vieja de guardado tuvo que cambiar de mecánica (dos sí de ancla: rascaban
`<select id="...">` con el `>` pegado y ahora el select lleva
`class="ytmpip-select-real"`). El estado visible es `aria-pressed`, no
una clase: lo que se ve y lo que oye un lector de pantalla son el mismo
atributo. Un censo al arrancar compara píldoras contra opciones —mismos
valores, mismo orden— y protesta por consola: una píldora de menos sería
una respuesta que existe pero no se puede elegir, sin ningún error.

**Los deslizadores de la maqueta.** Los cinco numéricos
(atenuado, salto, barras, caída, alto del espectro) son ahora
`input[type=range]` con el valor vivo al lado, el carril lleno hasta el
valor (`--lleno`, el patrón de `--ytmpip-played`) y tres marcas debajo:
mínimo, «valor · recomendado» y máximo. Las marcas se escriben desde el
propio input y desde `DEFAULT_SETTINGS` —en el HTML serían una copia
silenciosa— y la de en medio solo existe si hay valor de fábrica propio
estrictamente entre los extremos: el atenuado nace en 0 (ya es el
extremo) y el número de barras no tiene valor propio (la clave de serie
es la conjunta `spectrumBars`).

**La vista previa incrustada es la ventana de verdad.** El marco de la
rejilla de `tools/` se mudó a `src/options/vista-previa.html` (+ su
`.js`, porque la CSP de Manifest V3 ignora los `<script>` en línea) y
ahora **viaja en el paquete**: carga el `pip.html` y el `pip.css` reales
con una canción de mentira, y los dos botones lo ponen a los dos tamaños
de apertura leyendo `PIP_DIMENSIONS` — las mismas medidas que usa
`openPip`. La rejilla de desarrollo apunta al marco en su sitio nuevo.

**La matriz de sitios** dice lo medido, no lo deseado: siete funciones ×
tres sitios, con la leyenda de por qué falta lo que falta (el vídeo de
Spotify va cifrado, su sonido no pasa por la página, YouTube no tiene
panel de letra). Las columnas reusan `.ytmpip-sitio` a propósito: la
prueba que coteja los chips contra los `nombre` de los adaptadores vigila
también las cabeceras de la tabla.

**El catálogo**: `opciones_lema` murió (su segunda mitad es ahora el chip
«Los cambios se guardan solos») y nacieron 10 claves en ambos idiomas
(`opciones_sublema`, `cambios_se_guardan`, `marca_recomendado`, las
cuatro de la matriz y las dos de la vista previa).

**Las pruebas** (12 nuevas en `opciones-ecualizador.test.js`, sección 9):
el censo píldoras/opciones con sabotaje que verifica la denuncia; una
encendida por grupo y **el HTML estático ya la trae** (comparado contra
el DOM sin ejecutar nada: el instante antes de que arranque options.js);
pulsar guarda exactamente una vez y repetir sobre la encendida no
escribe; lo guardado enciende su píldora; las píldoras de presets copian
su nombre de la opción; mover una banda enciende «A mi gusto» **sin
soltar**; el carril 0 %/100 % en los extremos; las marcas leídas de
constants; la matriz fijada celda a celda; cada ancla de la cabecera
lleva a una tarjeta; y la vista previa existe en `src/`, nace pequeña de
verdad y alterna.

**La mutación**: 12 mutantes, todos muertos, recuentos comprometidos
antes de correr — 2/3/1/1/4/1/1/1/1/1/1/1, con una confesión y un
superviviente cazado. La confesión (M2, el censo con `===`): predije 2 y
cayeron 3, porque el aviso del censo cita las listas de valores y una de
ellas contiene «nocturno» — lo mató el recuento exacto de una prueba
vieja del preset sin nombre. El superviviente (M7, quitar el repintado
del listener de banda): la primera versión de la prueba soltaba el ratón,
y `save()` repinta la piel por su propio camino enmascarando justo la
llamada vigilada; endurecida a mirar **en mitad del arrastre** (rojo con
el mutante, verde al restaurar).

**885/885** la suite (873 + 12) y el ZIP reempaquetado con los dos
archivos nuevos del marco. Para verlo: recargar la extensión y abrir
Preferencias.

## El material de la tienda y el mosaico por código (la tanda Q)

Con el rediseño confirmado en vivo, el usuario pidió «seguir con la
publicación». La mitad de eso es papeleo que ninguna prueba puede sujetar
y vive en la carpeta **`tienda/`** —fuera de la lista blanca del
empaquetador a propósito: es material para la consola de desarrollador,
no para el paquete—: `ficha.md` (descripciones larga en dos idiomas,
declaración de propósito único, justificación por escrito de cada
permiso, respuestas de privacidad y el orden de faena en la consola),
`politica-de-privacidad.html` (bilingüe, lista para alojar; Google la
exige aunque todo viva en `chrome.storage.local`, y decir exactamente eso
es toda la política) y `capturas-receta.md` (el reparto: el usuario
captura pantalla completa, aquí se recorta a los 1280×800 exactos).

La otra mitad sí es código: **el mosaico promocional de 440×280 sale de
`tools/generar-mosaico.js`**, hermano panorámico del generador de
iconos. Para eso el generador de la tanda O se generalizó primero:
`pintarEscena(ancho, alto, escena)` pinta rectángulos y habla **en
píxeles** (con un lienzo no cuadrado las coordenadas normalizadas
estiran los círculos a elipses), `pintarIcono` queda como el caso
cuadrado de siempre, y `codificarPng` escribe `ancho`/`alto` de verdad
en el IHDR — antes escribía `tamano` dos veces, y un mosaico cuadrado de
440×440 habría pasado todo menos la tienda. El refactor se validó por la
vía más corta: regenerar los iconos y cotejar las huellas SHA256 de
antes — **byte a byte idénticos**, la prueba central de la tanda O de
red. El respaldo «si no hay ancho, usa tamano» en el codificador **no
existe a propósito**: nadie lo usaría y sería el mutante inmortal
clásico, anunciado antes de escribirlo.

El dibujo reusa las formas exportadas del generador de iconos (reusar,
no copiar): la ventana oscura llena el lienzo entero —los mosaicos de la
ficha van a sangre; un PNG con agujeros se ve roto sobre el fondo blanco
de la tienda—, las dos barras grises, y la tarjeta roja con la corchea
abajo a la derecha. Lo único nuevo es el **halo**: un resplandor rojo
alrededor de la tarjeta que cae **al cuadrado** con la distancia, la
misma curva que el golpe del halo real de la tanda J — el guiño a la
función estrella, y el único degradado del dibujo (vive en el mosaico y
no en los iconos porque a 16 píxeles un degradado es barro). Las barras
se pintan **por encima** del halo a propósito: la punta de la primera
entra en su zona y no debe teñirse.

**Las pruebas** (5 nuevas en `iconos-generados.test.js`, sección 5;
14/14 la batería): la central es el mismo cotejo byte a byte
disco-contra-generador de los iconos —un binario que se publica merece
las mismas pruebas que uno que se instala—; el PNG bien formado con el
lector independiente y **440×280 en el IHDR** (el motivo del refactor,
dicho en un assert); ni un píxel transparente; las capas por geometría
(esquina gris pura, barras grises puras, tarjeta roja, cabeza de la
nota blanca); y el halo que existe, es rojo de verdad (el canal rojo
manda sobre el verde) y **cae con la distancia** comparando dos puntos
del mismo eje.

**La mutación**: 9 mutantes, todos muertos, recuentos comprometidos
antes de correr y clavados — **2/2/2/3/2/1/1/2/5, sin confesión**. Los
dos de un punto (caída lineal en vez de cuadrática, halo pintado antes
que las barras) se anunciaron así: la curva exacta y el orden de capas
solo los sujeta el cotejo global, como el radio de las esquinas en la
tanda O. El del promedio recto confirmó el razonamiento inverso: mató
las dos de los iconos y **ninguna** del mosaico, porque a sangre la
cobertura siempre es plena y `r/a` y `r/64` son el mismo número.
Debilidad anunciada que sigue viva: la muestra de la nota usa
`TARJETA.cx/cy` del propio módulo (autorreferente — documenta la capa;
la posición la sujeta el cotejo).

Quedan del lado del usuario: la cuenta de desarrollador, alojar la
política (con su correo puesto donde dice `[CORREO-DE-CONTACTO]`), las
capturas crudas y subir el zip. El mosaico no exige recarga: no viaja
en el paquete.

## Pendiente (ver documento de arquitectura completo)

- Fase 0: **validada sobre `music.youtube.com` real** (ver «La fase 0: el
  sitio real, por fin delante»): selectores confrontados con el DOM vivo
  —incluidos repetir y aleatorio, y las cuatro preguntas de la cola—, la
  activación de usuario del popup, el velo a ojo, el anuncio en producción y
  el préstamo y devolución del `<video>` en un videoclip. Sueltos quedan solo
  el mensaje de «letra no disponible» (no sonó ninguna canción sin letra) y
  el clic real sobre aleatorio, que no se pulsó a propósito porque reordena
  la cola del usuario.
- Fase 3: el anuncio `aria-live` del cambio de canción, la verificación de
  contraste de ambos temas y el velo local de la cabecera ya están (ver «La
  ventana que anuncia el cambio de canción» y «El velo local de la cabecera»;
  la decisión de diseño que estuvo abierta aquí se cerró con la maqueta de
  `tools/comparacion-cabecera.html`). El anuncio ya se validó con NVDA real
  sobre la ventana real y quedó registro escrito (ver «El anuncio, oído por un
  lector de pantalla de verdad»); queda VoiceOver, que pide un Mac que aquí no
  hay, y mirar el velo con los ojos sobre `music.youtube.com` real, que es
  parte de la validación manual de fase 0.
- Fase 5: Chrome Web Store (política de privacidad, capturas, descripción,
  versionado). Nota nueva: cada sitio que se sume (YouTube normal, Spotify)
  añade `host_permissions`, y más permisos es revisión más estricta.
- Multi-sitio: las tres tandas están — el contrato (tanda 1, ver «El
  contrato del adaptador»), el adaptador de YouTube normal con su manifest
  y service worker multi-sitio (tanda 2, ver «El adaptador de YouTube
  normal») y el de Spotify con sus recortes confesados (tanda 3, ver «El
  adaptador de Spotify»: sin espectro, sin ecualizador, sin velocidad —
  `audioGrafo: false` declara exactamente eso). El suelto que dejaban las
  tres —nadie consumía `YTMPip.Capacidades`— está saldado: la ventana
  esconde los mandos muertos por capacidad declarada (ver «El interruptor
  de capacidades»). El clic ciego de `PlayerController.pause()` sin
  medio, confesado allí, también está saldado: el alternador solo se
  pulsa sabiendo el estado contrario (ver «El clic ciego»). Y el suelto
  del modo video de Spotify —un `<video>` real (con DRM: no prestable)
  que `getMediaElement()` no devolvía— también está saldado:
  `medioEscribible: false` ya se lee como «sin garantía» y los mandos
  siguen al medio vivo por pista (ver «El medio por modos»). Y el último
  recorte grande del modo audio —ni saltos ni volumen— cayó con la
  escritura sintética sobre los deslizadores de la página (ver «Saltos y
  volumen en Spotify»); del trío original de Spotify quedan fuera solo
  espectro, ecualizador y velocidad, que sí piden el audio en el grafo.

## Estructura

Ver `manifest.json` y la carpeta `src/` (background, content, pip, popup, shared,
options). La lógica específica de cada sitio está encapsulada en su adaptador
—`src/content/youtube-music-adapter.js`, `src/content/youtube-adapter.js` y
`src/content/spotify-adapter.js`—, para poder actualizarla sin tocar el resto;
los tres firman el contrato de `src/content/adapter-registry.js` y es el
registro quien publica `YTMPip.Adapter` según el `hostname`.
