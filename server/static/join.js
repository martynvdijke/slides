/* join.js — resolve a short room code to an event and redirect. Vanilla JS. */
(function () {
  'use strict';

  var form = document.getElementById('join-form');
  var input = document.getElementById('room-code');
  var errEl = document.getElementById('join-error');
  var btn = form ? form.querySelector('button[type="submit"]') : null;
  if (!form || !input || !btn) return;

  function normalize(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function clearError() {
    if (errEl) errEl.hidden = true;
  }

  function join(code) {
    clearError();
    btn.disabled = true;
    btn.textContent = 'Joining…';
    fetch('/api/join/' + encodeURIComponent(code), { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(function (j) {
        if (!j || !j.code) throw new Error('bad payload');
        location.href = '/e/' + encodeURIComponent(j.code);
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Join room';
        showError('No room found for "' + code + '". Check the code and try again.');
        input.focus();
        input.select();
      });
  }

  input.addEventListener('input', function () {
    input.value = normalize(input.value);
    clearError();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = normalize(input.value);
    if (code.length < 4) {
      showError('Enter the room code shown on the slide.');
      input.focus();
      return;
    }
    join(code);
  });

  // Allow /join?room=AB2C3 to auto-submit (handy for links).
  var preset = new URLSearchParams(location.search).get('room');
  if (preset) {
    var code = normalize(preset);
    input.value = code;
    if (code.length >= 4) join(code);
  } else {
    input.focus();
  }
})();
