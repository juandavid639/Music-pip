/*
 * La pagina de bienvenida (tanda AR): solo pone los textos en el idioma del
 * navegador. No lee ni escribe nada: lo que hace la pagina lo dice el HTML,
 * y que se abra solo al instalar lo decide el service worker.
 */
(function () {
  if (self.YTMPip && self.YTMPip.Textos) self.YTMPip.Textos.aplicar(document);
})();
