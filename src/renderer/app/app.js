// ASTRA Console - full window app logic
/* global window, document */
(function () {
  'use strict';

  var A = window.astra;
  var settings = null;
  var lastAnswer = '';
  var lastSources = [];
  var busyStates = ['THINKING', 'SEARCHING', 'WORKING', 'SPEAKING'];
  var isBusy = false;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function md(src) {
    var s = esc(src);
    s = s.replace(/```([\s\S]*?)```/g, function (_, c) { return '<pre><code>' + c.replace(/^\n/, '') + '</code></pre>'; });
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    s = s.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    s = s.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\n{2,}/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return s;
  }

  function timeStr(ts) {
    var d = new Date(ts || Date.now());
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function getByPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj);
  }

  function setByPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  // ---------- navigation ----------
  var navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.view); });
  });

  function switchView(v) {
    navBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    document.querySelectorAll('.view').forEach(function (s) {
      s.classList.toggle('active', s.id === 'view-' + v);
    });
  }

  $('tb-min').addEventListener('click', function () { A.invoke('window:minimize'); });
  $('tb-close').addEventListener('click', function () { A.invoke('window:close'); });

  // ---------- chat ----------
  var chatMessages = $('chat-messages');

  function addMsg(role, text) {
    var div = document.createElement('div');
    div.className = 'msg ' + role;
    div.dir = 'auto';
    div.innerHTML =
      '<span class="who">' + (role === 'user' ? 'YOU' : 'ASTRA') + '</span>' + md(text);
    chatMessages.appendChild(div);
    var sc = $('chat-scroll');
    sc.scrollTop = sc.scrollHeight;
    return div;
  }

  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendChat(); });
  $('chat-stop').addEventListener('click', function () { A.invoke('chat:stop'); });

  function sendChat() {
    var t = $('chat-input').value.trim();
    if (!t) return;
    $('chat-input').value = '';
    A.invoke('chat:send', { text: t });
  }

  // ---------- research ----------
  $('research-run').addEventListener('click', function () {
    var t = $('research-input').value.trim();
    if (!t) return;
    $('research-steps').innerHTML = '';
    $('research-answer').innerHTML = '';
    $('research-sources').innerHTML = '';
    $('research-status').textContent = 'Researching... ASTRA is searching, reading and synthesizing sources.';
    A.invoke('chat:send', { text: t });
  });
  $('research-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('research-run').click(); });

  $('research-save').addEventListener('click', function () {
    if (!lastAnswer) { toast('Nothing to save yet.'); return; }
    var mdOut = '# ' + ($('research-input').value.trim() || 'ASTRA Research') + '\n\n' + lastAnswer + '\n';
    if (lastSources.length) {
      mdOut += '\n## Sources\n';
      lastSources.forEach(function (s, i) { mdOut += (i + 1) + '. [' + s.title + '](' + s.url + ')\n'; });
    }
    A.invoke('research:save', { title: $('research-input').value.trim() || 'ASTRA Report', markdown: mdOut })
      .then(function (r) {
        if (r && (r.ok || r.path)) toast('Saved: ' + (r.path || 'Documents/ASTRA/Research'));
        else toast((r && r.error) || 'Save failed.');
      });
  });

  function addSource(s) {
    var a = document.createElement('a');
    a.className = 'src';
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML =
      '<span class="src-title">' + esc(s.title || s.url) + '</span>' +
      '<span class="src-url">' + esc(s.url) + '</span>' +
      (s.snippet ? '<span class="src-snip">' + esc(s.snippet) + '</span>' : '');
    $('research-sources').appendChild(a);
  }

  function addStep(label, done) {
    var d = document.createElement('div');
    d.className = 'step' + (done ? ' done' : '');
    d.innerHTML = '<span class="s-dot"></span><span>' + esc(label) + '</span>';
    $('research-steps').appendChild(d);
    return d;
  }

  // ---------- activity ----------
  function addActivity(label, ts) {
    var d = document.createElement('div');
    d.className = 'act';
    d.innerHTML = '<span class="a-time">' + timeStr(ts) + '</span><span class="a-dot"></span><span dir="auto">' + esc(label) + '</span>';
    var list = $('activity-list');
    list.insertBefore(d, list.firstChild);
  }

  // ---------- settings ----------
  var PERMISSIONS = [
    ['MICROPHONE', 'Microphone for voice input'],
    ['BROWSER', 'Control Chrome through the ASTRA extension'],
    ['FILES', 'Find, open and create files (Documents/ASTRA)'],
    ['WINDOWS_APPS', 'Open whitelisted apps (Chrome, VS Code, Notepad, Explorer)'],
    ['NETWORK', 'Web search and page reading'],
    ['SCREEN_CAPTURE', 'Screen capture (reserved)'],
    ['CLIPBOARD', 'Copy to clipboard']
  ];

  function buildSettings() {
    if (!settings) return;
    var root = $('settings-root');
    root.innerHTML = '';

    function card(title) {
      var c = document.createElement('div');
      c.className = 'set-card';
      c.innerHTML = '<h3>' + esc(title) + '</h3>';
      root.appendChild(c);
      return c;
    }

    function row(c, labelText, hint) {
      var r = document.createElement('div');
      r.className = 'set-row';
      var l = document.createElement('label');
      l.innerHTML = esc(labelText) + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '');
      r.appendChild(l);
      c.appendChild(r);
      return r;
    }

    function toggle(c, path, labelText, hint) {
      var r = row(c, labelText, hint);
      var sw = document.createElement('label');
      sw.className = 'switch';
      sw.innerHTML = '<input type="checkbox" ' + (getByPath(settings, path) ? 'checked' : '') + ' /><span class="track"></span>';
      sw.querySelector('input').addEventListener('change', function (e) {
        var patch = {};
        setByPath(patch, path, e.target.checked);
        saveSettings(patch);
      });
      r.appendChild(sw);
    }

    function text(c, path, labelText, hint, isPassword) {
      var r = row(c, labelText, hint);
      var inp = document.createElement('input');
      inp.type = isPassword ? 'password' : 'text';
      inp.value = getByPath(settings, path) || '';
      inp.placeholder = isPassword && settings.__hasApiKey ? '(stored - type to replace)' : '';
      inp.addEventListener('change', function (e) {
        if (isPassword) {
          if (e.target.value) A.invoke('credentials:set', { key: 'aiApiKey', value: e.target.value });
        } else {
          var patch = {};
          setByPath(patch, path, e.target.value);
          saveSettings(patch);
        }
      });
      r.appendChild(inp);
      return r;
    }

    function select(c, path, labelText, options, hint) {
      var r = row(c, labelText, hint);
      var sel = document.createElement('select');
      options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o[0];
        op.textContent = o[1];
        sel.appendChild(op);
      });
      sel.value = getByPath(settings, path);
      sel.addEventListener('change', function (e) {
        var patch = {};
        setByPath(patch, path, e.target.value);
        if (path === 'ai.provider') patch.ai = patch.ai || {};
        saveSettings(patch);
      });
      r.appendChild(sel);
    }

    function slider(c, path, labelText, min, max, step) {
      var r = row(c, labelText);
      var inp = document.createElement('input');
      inp.type = 'range';
      inp.min = min; inp.max = max; inp.step = step;
      inp.value = Number(getByPath(settings, path) || 1);
      var val = document.createElement('span');
      val.className = 'perm-badge';
      val.textContent = inp.value;
      inp.addEventListener('input', function () { val.textContent = inp.value; });
      inp.addEventListener('change', function (e) {
        var patch = {};
        setByPath(patch, path, Number(e.target.value));
        saveSettings(patch);
      });
      var wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '8px';
      wrap.appendChild(inp);
      wrap.appendChild(val);
      r.appendChild(wrap);
    }

    function button(c, labelText, onClick) {
      var r = row(c, labelText);
      var b = document.createElement('button');
      b.className = 'primary-btn';
      b.textContent = 'Run';
      b.addEventListener('click', onClick);
      r.appendChild(b);
    }

    // General
    var g = card('General');
    toggle(g, 'general.startWithWindows', 'Start with Windows', 'Launch ASTRA automatically at login');

    // AI
    var ai = card('AI');
    select(ai, 'ai.provider', 'Provider', [
      ['openai-compatible', 'OpenAI-compatible (OpenAI)'],
      ['groq', 'Groq'],
      ['openrouter', 'OpenRouter'],
      ['gemini', 'Google Gemini']
    ]);
    text(ai, 'ai.baseUrl', 'Base URL', 'Leave empty to use the provider default');
    text(ai, 'ai.model', 'Model', 'e.g. gpt-4o-mini / llama-3.3-70b-versatile');
    text(ai, 'ai.sttModel', 'Speech-to-text model', 'Whisper-compatible, e.g. whisper-1');
    text(ai, '__apikey', 'API key', 'Stored encrypted with OS keychain (safeStorage)', true);
    button(ai, 'Test connection', function () {
      toast('Testing AI connection...');
      A.invoke('ai:test').then(function (r) {
        if (r && r.ok) toast('AI OK: ' + r.message);
        else toast((r && r.error) || 'AI test failed.');
      });
    });

    // Voice
    var v = card('Voice');
    toggle(v, 'voice.autoSpeak', 'Speak answers aloud', 'Uses provider TTS or the system voice (fa-IR when installed)');
    select(v, 'voice.ttsProvider', 'TTS provider', [['system', 'System voices'], ['openai', 'OpenAI-compatible /audio/speech']]);
    text(v, 'voice.ttsVoice', 'TTS voice', 'e.g. alloy / echo / nova');
    slider(v, 'voice.rate', 'Speech rate', 0.5, 2, 0.05);

    // Browser
    var br = card('Browser');
    text(br, 'browser.extensionId', 'Extension ID', 'Paste the ASTRA Browser Bridge extension ID from its popup');
    button(br, 'Register Native Messaging Host', function () {
      A.invoke('browser:reregister').then(function (r) {
        toast(r && r.ok ? 'Native host registered. Restart Chrome.' : (r && r.error) || 'Failed.');
      });
    });
    button(br, 'Check bridge status', function () {
      A.invoke('browser:status').then(function (r) {
        toast(r && r.connected ? 'Chrome bridge: CONNECTED (port ' + r.port + ')' : 'Chrome bridge: not connected. Open Chrome.');
      });
    });

    // Permissions
    var p = card('Permissions');
    PERMISSIONS.forEach(function (perm) {
      var r = row(p, perm[0], perm[1]);
      var badge = document.createElement('span');
      badge.className = 'perm-badge';
      badge.textContent = perm[0];
      r.insertBefore(badge, r.firstChild.nextSibling ? r.children[1] : null);
      var sw = document.createElement('label');
      sw.className = 'switch';
      sw.innerHTML = '<input type="checkbox" ' + (settings.permissions && settings.permissions[perm[0]] ? 'checked' : '') + ' /><span class="track"></span>';
      sw.querySelector('input').addEventListener('change', function (e) {
        A.invoke('permissions:set', { key: perm[0], value: e.target.checked }).then(function (res) {
          if (res && res.ok) toast(perm[0] + ' ' + (e.target.checked ? 'enabled' : 'disabled'));
        });
      });
      r.appendChild(sw);
    });

    // Appearance
    var ap = card('Appearance');
    select(ap, 'appearance.theme', 'Theme', [
      ['deep-space', 'Deep Space (cyan)'],
      ['obsidian', 'Obsidian (indigo)'],
      ['nebula', 'Nebula (violet)']
    ]);
    slider(ap, 'appearance.size', 'Astronaut size', 0.8, 1.4, 0.05);
    slider(ap, 'appearance.opacity', 'Window opacity', 0.4, 1, 0.05);
    slider(ap, 'appearance.animations', 'Animation intensity', 0.2, 2, 0.1);
    toggle(ap, 'appearance.alwaysOnTop', 'Always on top', 'Keep the companion above other windows');
    toggle(ap, 'appearance.clickThrough', 'Click-through when idle', 'Mouse passes through the companion when idle');

    // Companion
    var co = card('Companion');
    toggle(co, 'companion.enabled', 'Companion enabled', 'Show the floating astronaut on the desktop');
    toggle(co, 'companion.showStatusChip', 'Show status chip', 'Display the small state label');

    // Memory
    var m = card('Memory');
    toggle(m, 'memory.enabled', 'Memory enabled', 'Remember facts and preferences');
    toggle(m, 'memory.storeConversations', 'Store conversation summaries', 'Locally, never uploaded');
    toggle(m, 'memory.storeSensitiveData', 'Store sensitive data', 'OFF by default: passwords/tokens are never stored');
    button(m, 'Clear all memory', function () {
      A.invoke('memory:clear').then(function () { toast('Memory cleared.'); });
    });

    // Shortcuts
    var sh = card('Shortcuts');
    toggle(sh, 'shortcuts.enabled', 'Global shortcuts enabled', 'Wake ASTRA from anywhere');
    text(sh, 'shortcuts.wake', 'Wake shortcut', 'Default: Ctrl+Space (e.g. Alt+X)');

    // About
    var ab = card('About');
    A.invoke('app:info').then(function (i) {
      if (!i) return;
      ab.insertAdjacentHTML(
        'beforeend',
        '<div class="about-line"><span>ASTRA version</span><b>' + esc(i.version) + '</b></div>' +
        '<div class="about-line"><span>Electron</span><b>' + esc(i.electron) + '</b></div>' +
        '<div class="about-line"><span>Node</span><b>' + esc(i.node) + '</b></div>' +
        '<div class="about-line"><span>Platform</span><b>' + esc(i.platform) + '</b></div>'
      );
    });
  }

  function saveSettings(patch) {
    A.invoke('settings:set', patch).then(function (r) {
      if (r && r.ok && r.settings) {
        settings = r.settings;
        document.body.dataset.theme = (settings.appearance && settings.appearance.theme) || 'deep-space';
        toast('Settings saved.');
      }
    });
  }

  // ---------- events ----------
  var currentStep = null;

  A.onEvent(function (evt) {
    if (evt.type === 'view') {
      switchView(evt.view);
      if (evt.view === 'settings') buildSettings();
      return;
    }
    if (evt.type === 'chat:user') {
      addMsg('user', evt.text);
      currentStep = addStep('Working on: ' + String(evt.text).slice(0, 60));
      $('research-status').textContent = 'Running...';
      return;
    }
    if (evt.type === 'chat:assistant') {
      addMsg('assistant', evt.text);
      lastAnswer = evt.text;
      if (currentStep) { currentStep.classList.add('done'); currentStep = null; }
      $('research-answer').innerHTML = md(evt.text);
      $('research-status').textContent = 'Done. You can save the report as Markdown.';
      return;
    }
    if (evt.type === 'research:sources') {
      lastSources = evt.sources || [];
      lastSources.forEach(addSource);
      return;
    }
    if (evt.type === 'activity') {
      addActivity(evt.label, evt.ts);
      if (currentStep) {
        currentStep.querySelector('span:last-child').textContent = evt.label;
      }
      return;
    }
    if (evt.type === 'state') {
      isBusy = busyStates.indexOf(evt.state) >= 0;
      $('chat-send').disabled = isBusy;
      $('research-run').disabled = isBusy;
      return;
    }
    if (evt.type === 'error') {
      toast(evt.message || 'Error');
      $('research-status').textContent = evt.message || 'Error';
      return;
    }
    if (evt.type === 'toast') {
      toast(evt.message || '');
      return;
    }
    if (evt.type === 'chat:cleared') {
      chatMessages.innerHTML = '';
      return;
    }
    if (evt.type === 'settings-changed') {
      settings = evt.settings;
      document.body.dataset.theme = (settings.appearance && settings.appearance.theme) || 'deep-space';
    }
  });

  // ---------- init ----------
  A.invoke('chat:history').then(function (h) {
    (h || []).forEach(function (m) { addMsg(m.role, m.content); });
  });

  A.invoke('settings:get').then(function (s) {
    if (s && s.settings) {
      settings = s.settings;
      settings.__hasApiKey = s.hasApiKey;
      document.body.dataset.theme = (settings.appearance && settings.appearance.theme) || 'deep-space';
      buildSettings();
    }
  });

  A.invoke('state:get').then(function (st) {
    (st && st.activity ? st.activity : []).slice().reverse().forEach(function (a) {
      addActivity(a.label, a.ts);
    });
  });

  window.AstraAstronaut.create($('mini-astro'));
})();
