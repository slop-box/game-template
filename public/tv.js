// TV page: join QR code, players, and who buzzed first. Replace with your game's TV UI.
(function () {
  'use strict';
  var $ = Game.$;
  var shownUrl = null;

  function render(s) {
    // Behind Slop Box this is https://<id>.<domain>/, the same address the TV opened.
    var joinUrl = (s.publicUrl || location.origin) + '/';
    if (joinUrl !== shownUrl) {
      shownUrl = joinUrl;
      $('#qr').src = '/qr.svg?u=' + encodeURIComponent(joinUrl);
      $('#join-url').textContent = joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }

    $('#round').textContent = s.round;
    var winner = s.buzzedBy && s.players.filter(function (p) { return p.id === s.buzzedBy; })[0];
    $('#status').textContent = winner ? winner.name + '!' : s.players.length ? 'Waiting for a buzz…' : 'Waiting for players…';
    $('#status').className = 'status' + (winner ? ' winner' : '');

    var list = $('#players');
    list.textContent = '';
    s.players.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = p.name;
      if (!p.connected) li.className = 'away';
      if (p.id === s.buzzedBy) li.className = 'buzzed';
      list.appendChild(li);
    });
  }

  function next() { Game.act('next').catch(function () {}); }
  $('#next').addEventListener('click', next);
  // TV remotes send Enter (keyCode 13) for OK.
  document.addEventListener('keydown', function (e) {
    if ((e.keyCode === 13 || e.key === 'Enter') && document.activeElement !== $('#next')) next();
  });

  Game.listen('', render, function (up) { $('#offline').hidden = up; });
})();
