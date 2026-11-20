// TV remote basics for a Slop Box TV page:
// - Full screen on the first OK, arrow press or click (browsers only allow it after a press).
// - Back doesn't drop out of a game by accident: the first press shows "Press Back again to leave",
//   and a second press within 3 seconds leaves.
//
// The same file is used by every Slop Box game. game-template has the source copy; copy it from there
// as-is. Plain ES5 so older TV browsers (LG webOS 6 is about Chrome 79) can run it.
//
// Use: <script src="/tv-remote.js"></script> on the TV page, then optionally
//   TvRemote.init({
//     onBack: function () { return closedSomething; }, // close a menu or zoom first; true keeps the page
//     toast: function (msg) { ... },                   // show messages in the game's own style
//   });
var TvRemote = (function () {
  'use strict';

  var LEAVE_WINDOW = 3000;
  // Keys that count as "the first press". Back and Escape don't: they mean the opposite.
  // 13 Enter/OK, 23 Android OK, 32 space, 37-40 arrows.
  var START_CODES = { 13: 1, 23: 1, 32: 1, 37: 1, 38: 1, 39: 1, 40: 1 };
  var START_KEYS = { Enter: 1, Select: 1, ' ': 1, ArrowLeft: 1, ArrowUp: 1, ArrowRight: 1, ArrowDown: 1 };

  var opts = {};
  var started = false;
  var guarded = false; // our spare history entry is on top
  var warnedAt = 0;

  // Full screen is a nice-to-have. Browsers refuse it, lack it, or use the old prefixed name,
  // so this never throws.
  function fullscreen() {
    var el = document.documentElement;
    var request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      var p = request.call(el);
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* fine */ }
  }

  // Many TV browsers treat Back as "go back a page" and never show it to the page as a key.
  // A spare history entry turns that press into a popstate event the page can handle.
  // It's added after a press, so newer Chrome doesn't skip over it.
  function guard() {
    if (guarded) return;
    guarded = true;
    try { history.pushState({ tvRemote: true }, ''); } catch (e) { guarded = false; }
  }

  function start() {
    if (started) return;
    started = true;
    fullscreen();
    guard();
  }

  var toastEl = null, toastTimer = null;
  function defaultToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:6vh;transform:translateX(-50%);z-index:2147483647;' +
        'padding:1.2vh 2.4vw;border-radius:1.2vh;background:rgba(0,0,0,.85);color:#fff;' +
        'font:600 3.2vh/1.3 system-ui,sans-serif;pointer-events:none;transition:opacity .2s;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, LEAVE_WINDOW - 300);
  }

  window.addEventListener('popstate', function () {
    if (!guarded) return; // not ours: Back before the first press, or the page's own history
    guarded = false;
    if (opts.onBack && opts.onBack()) { guard(); return; }
    if (warnedAt && Date.now() - warnedAt < LEAVE_WINDOW) {
      history.back();
      setTimeout(guard, 1000); // still here, e.g. the TV opened this page first: keep the guard
      return;
    }
    warnedAt = Date.now();
    (opts.toast || defaultToast)('Press Back again to leave');
    guard();
  });

  document.addEventListener('keydown', function (e) {
    if (START_CODES[e.keyCode] || START_KEYS[e.key]) start();
  }, true);
  document.addEventListener('click', start, true);

  return {
    init: function (o) { opts = o || {}; },
    fullscreen: fullscreen,
  };
})();
