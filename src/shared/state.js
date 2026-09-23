/*
 * Forma por defecto de PlayerState (seccion 10) y un emisor de eventos
 * minimo, reutilizado por content-script.js y pip.js.
 */
(function (root) {
  const YTMPip = root.YTMPip || (root.YTMPip = {});

  YTMPip.createDefaultPlayerState = function createDefaultPlayerState() {
    return {
      connected: false,
      playing: false,
      title: "",
      artist: "",
      album: undefined,
      artworkUrl: undefined,
      currentTime: 0,
      duration: 0,
      upNext: [],
      lyrics: {
        status: YTMPip.CONSTANTS.LYRICS_STATUS.UNAVAILABLE,
        text: undefined,
        source: "youtube-music"
      }
    };
  };

  YTMPip.EventEmitter = class EventEmitter {
    constructor() {
      this._listeners = new Map();
    }

    on(event, handler) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }

    off(event, handler) {
      const set = this._listeners.get(event);
      if (set) set.delete(handler);
    }

    emit(event, payload) {
      const set = this._listeners.get(event);
      if (!set) return;
      for (const handler of set) handler(payload);
    }
  };
})(typeof self !== "undefined" ? self : globalThis);
