// ASTRA companion window logic
/* global window, document, navigator, btoa, Audio, SpeechSynthesisUtterance, speechSynthesis */
(function () {
  'use strict';

  var A = window.astra;
  var astro = window.AstraAstronaut.create(document.getElementById('astro'));

  var chip = document.getElementById('chip');
  var chipText = document.getElementById('chip-text');
  var activityEl = document.getElementById('activity');
  var controls = document.getElementById('controls');
  var input = document.getElementById('input');
  var micBtn = document.getElementById('mic');
  var sendBtn = document.getElementById('send');

  var settings = { voice: { autoSpeak: true, rate: 1 }, companion: { showStatusChip: true }, appearance: {} };
  var mode = 'COMPANION';
  var hideTimer = null;
  var busyStates = ['THINKING', 'SEARCHING', 'WORKING', 'SPEAKING'];

  function reveal(temporary) {
    controls.classList.remove('hidden');
    if (hideTimer) clearTimeout(hideTimer);
    if (mode === 'COMPANION' || temporary) {
      hideTimer = setTimeout(function () {
        if (mode === 'COMPANION') controls.classList.add('hidden');
      }, temporary ? 2200 : 5000);
    }
  }

  function showActivity(text, isErr) {
    activityEl.textContent = text;
    activityEl.classList.add('show');
    activityEl.classList.toggle('err', !!isErr);
    setTimeout(function () { activityEl.classList.remove('show'); }, isErr ? 4500 : 3200);
  }

  function maybeSpeak(text, audioB64) {
    if (!document.hasFocus()) return;
    if (audioB64) {
      try { new Audio(audioB64).play(); return; } catch (e) { /* fall through */ }
    }
    if (!settings.voice || settings.voice.autoSpeak === false) return;
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text || '').slice(0, 1200));
      u.lang = /[\u0600-\u06FF]/.test(text) ? 'fa-IR' : 'en-US';
      u.rate = (settings.voice && settings.voice.rate) || 1;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  A.onEvent(function (evt) {
    if (evt.type === 'state') {
      astro.setState(evt.state);
      chipText.textContent = 'ASTRA \u00B7 ' + evt.state;
      sendBtn.disabled = busyStates.indexOf(evt.state) >= 0;
    } else if (evt.type === 'activity') {
      showActivity(evt.label || '');
    } else if (evt.type === 'mode') {
      mode = evt.mode;
      if (mode === 'COMPANION') reveal(true);
      else if (mode === 'INTERACTION') reveal(false);
      else controls.classList.add('hidden');
    } else if (evt.type === 'wake') {
      reveal(false);
      input.focus();
    } else if (evt.type === 'chat:assistant') {
      maybeSpeak(evt.text, evt.audioB64);
    } else if (evt.type === 'error') {
      showActivity(evt.message || 'Something went wrong.', true);
    } else if (evt.type === 'toast') {
      showActivity(evt.message || '');
    } else if (evt.type === 'settings-changed') {
      settings = evt.settings || settings;
      document.body.dataset.theme = (settings.appearance && settings.appearance.theme) || 'deep-space';
      chip.style.display = settings.companion && settings.companion.showStatusChip === false ? 'none' : 'flex';
    }
  });

  function send() {
    var t = input.value.trim();
    if (!t) return;
    input.value = '';
    A.invoke('chat:send', { text: t });
  }

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') send();
  });

  // ---- Voice input ----
  var recorder = null;
  var chunks = [];

  function startMic() {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showActivity('Microphone not available.', true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        var mime = 'audio/webm';
        try {
          recorder = new MediaRecorder(stream);
          mime = recorder.mimeType || mime;
        } catch (e) {
          showActivity('MediaRecorder unavailable.', true);
          stream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        chunks = [];
        recorder.ondataavailable = function (ev) {
          if (ev.data && ev.data.size) chunks.push(ev.data);
        };
        recorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          recorder = null;
          micBtn.classList.remove('rec');
          var blob = new Blob(chunks, { type: mime });
          blob.arrayBuffer().then(function (ab) {
            var buf = new Uint8Array(ab);
            var bin = '';
            for (var i = 0; i < buf.length; i += 8192) {
              bin += String.fromCharCode.apply(null, buf.subarray(i, Math.min(i + 8192, buf.length)));
            }
            A.invoke('voice:transcribe', { dataB64: btoa(bin), mime: mime }).then(function (r) {
              if (r && r.ok && r.text) {
                input.value = r.text;
                send();
              } else {
                showActivity((r && r.error) || 'Voice recognition failed.', true);
              }
            });
          });
        };
        recorder.start();
        micBtn.classList.add('rec');
        showActivity('Listening...');
      })
      .catch(function () {
        showActivity('Microphone permission denied.', true);
      });
  }

  micBtn.addEventListener('click', startMic);

  document.getElementById('open-console').addEventListener('click', function () {
    A.invoke('app:openFull', { view: 'chat' });
  });
  document.getElementById('open-research').addEventListener('click', function () {
    A.invoke('state:setMode', { mode: 'RESEARCH' });
  });

  document.getElementById('astro').addEventListener('click', function () {
    A.invoke('state:setMode', { mode: mode === 'COMPANION' ? 'INTERACTION' : 'COMPANION' });
  });

  window.addEventListener('mousemove', function () {
    if (mode === 'COMPANION') reveal(true);
  });

  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') A.invoke('state:setMode', { mode: 'COMPANION' });
  });

  A.invoke('settings:get').then(function (s) {
    if (s && s.settings) {
      settings = s.settings;
      document.body.dataset.theme = (settings.appearance && settings.appearance.theme) || 'deep-space';
      if (settings.companion && settings.companion.showStatusChip === false) chip.style.display = 'none';
    }
  });

  A.invoke('state:get').then(function (st) {
    if (st) {
      chipText.textContent = 'ASTRA \u00B7 ' + st.state;
      astro.setState(st.state);
    }
    reveal(true);
  });
})();
