// Phone page: join with a name, then buzz. Replace with your game's phone UI.
(function () {
  'use strict';
  var $ = Game.$;

  // The key identifies this phone across reloads and reconnects. Keep it secret: it's the player.
  var key = Game.store.get('key');
  if (!key) { key = Game.randomKey(); Game.store.set('key', key); }
  var myId = null;
  var latest = null;

  function render() {
    var s = latest;
    var me = s && myId && s.players.filter(function (p) { return p.id === myId; })[0];
    $('#join').hidden = !!me;
    $('#play').hidden = !me;
    if (!me) return;

    $('#round').textContent = s.round;
    $('#me').textContent = me.name;
    var winner = s.buzzedBy && s.players.filter(function (p) { return p.id === s.buzzedBy; })[0];
    $('#buzz').disabled = !!s.buzzedBy;
    $('#result').textContent = !s.buzzedBy ? '' : s.buzzedBy === myId ? 'You buzzed first!' : (winner ? winner.name : 'Someone') + ' buzzed first';
  }

  function join(name) {
    return Game.act('join', { key: key, name: name }).then(function (out) {
      myId = out.id;
      Game.store.set('name', name);
      render();
    });
  }

  $('#join-form').addEventListener('submit', function (e) {
    e.preventDefault();
    $('#join-error').textContent = '';
    join($('#name').value).catch(function (err) { $('#join-error').textContent = err.message; });
  });

  $('#buzz').addEventListener('click', function () {
    Game.act('buzz', { key: key }).catch(function () {});
  });

  // Rejoin automatically after a reload, using the saved name.
  var savedName = Game.store.get('name');
  if (savedName) { $('#name').value = savedName; join(savedName).catch(function () {}); }

  Game.listen('?key=' + encodeURIComponent(key), function (s) { latest = s; render(); }, function (up) {
    $('#offline').hidden = up;
  });
  render();
})();
