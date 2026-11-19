// Shared by the phone and TV pages. Plain ES2017 (no optional chaining or `??`) so older TV
// browsers like LG webOS 6 can run it.
var Game = (function () {
  'use strict';

  // Send an action to the server. Resolves with the server's reply; rejects with its error message.
  function act(type, data) {
    return fetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ type: type }, data || {})),
    })
      .then(function (r) { return r.json(); })
      .then(function (out) { if (!out.ok) throw new Error(out.error || 'Something went wrong'); return out; });
  }

  // Live updates. EventSource reconnects by itself after a dropped connection or a locked phone,
  // and the server sends the full state again on every connect.
  function listen(query, onState, onConnection) {
    var es = new EventSource('/events' + (query || ''));
    es.onmessage = function (e) { onState(JSON.parse(e.data)); };
    es.onopen = function () { if (onConnection) onConnection(true); };
    es.onerror = function () { if (onConnection) onConnection(false); };
    return es;
  }

  // localStorage can be missing or throw (private mode, some TV browsers), so never rely on it.
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } },
  };

  function randomKey() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function $(sel) { return document.querySelector(sel); }

  return { act: act, listen: listen, store: store, randomKey: randomKey, $: $ };
})();
