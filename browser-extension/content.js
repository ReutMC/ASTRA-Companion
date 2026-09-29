// ASTRA Browser Bridge - content script
// Page understanding, actions and the AI cursor. Isolated world, no page JS access.
/* global chrome, document, window, requestAnimationFrame */
(() => {
  if (window.__astraContent) return;
  window.__astraContent = true;

  // ---------- styles (AI cursor + flash) ----------
  function injectStyle() {
    if (document.getElementById('astra-style')) return;
    const st = document.createElement('style');
    st.id = 'astra-style';
    st.textContent = `
      #astra-ai-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .3s ease;}
      #astra-ai-cursor.on{opacity:1;}
      #astra-ai-cursor .cur-arrow{filter:drop-shadow(0 0 6px rgba(56,189,248,.85)) drop-shadow(0 0 14px rgba(56,189,248,.45));}
      #astra-ai-cursor .cur-ring{position:absolute;left:-14px;top:-14px;width:44px;height:44px;border-radius:50%;
        border:2px solid rgba(103,232,249,.9);box-shadow:0 0 12px rgba(103,232,249,.7),inset 0 0 8px rgba(103,232,249,.4);
        transform:scale(.4);opacity:0;}
      #astra-ai-cursor .cur-ring.pulse{animation:astraPulse .9s ease-out 2;}
      #astra-ai-cursor .cur-label{position:absolute;left:16px;top:-26px;padding:3px 10px;border-radius:999px;
        background:rgba(7,12,26,.92);border:1px solid rgba(103,232,249,.55);color:#a5f3fc;font:600 11px/1.5 'Segoe UI',sans-serif;
        letter-spacing:.08em;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.45);}
      @keyframes astraPulse{0%{transform:scale(.4);opacity:1;}100%{transform:scale(1.5);opacity:0;}}
      .astra-flash{outline:2px solid #67e8f9 !important;outline-offset:2px;border-radius:4px;transition:outline-color .5s ease !important;}
    `;
    document.documentElement.appendChild(st);
  }

  function ensureCursor() {
    if (window.__astraCursor) return window.__astraCursor;
    injectStyle();
    const c = document.createElement('div');
    c.id = 'astra-ai-cursor';
    c.innerHTML = `
      <div class="cur-ring"></div>
      <svg class="cur-arrow" width="22" height="22" viewBox="0 0 24 24">
        <path d="M4 2 L20 12 L12 13.5 L8.5 21 Z" fill="#67e8f9" stroke="#0c4a6e" stroke-width="1"/>
      </svg>
      <div class="cur-label" style="display:none"></div>`;
    document.documentElement.appendChild(c);
    window.__astraCursor = { el: c, x: innerWidth / 2, y: innerHeight / 2, raf: null };
    return window.__astraCursor;
  }

  function moveCursor(tx, ty, label) {
    const cur = ensureCursor();
    const el = cur.el;
    const lab = el.querySelector('.cur-label');
    if (label) {
      lab.textContent = String(label).slice(0, 32);
      lab.style.display = 'block';
    } else {
      lab.style.display = 'none';
    }
    el.classList.add('on');
    const sx = cur.x, sy = cur.y;
    const t0 = performance.now();
    const dur = 650;
    if (cur.raf) cancelAnimationFrame(cur.raf);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const x = sx + (tx - sx) * e;
      const y = sy + (ty - sy) * e;
      el.style.transform = `translate(${x}px, ${y}px)`;
      cur.x = x; cur.y = y;
      if (p < 1) {
        cur.raf = requestAnimationFrame(step);
      } else {
        const ring = el.querySelector('.cur-ring');
        ring.classList.remove('pulse');
        void ring.offsetWidth;
        ring.classList.add('pulse');
        setTimeout(() => { lab.style.display = 'none'; }, 1800);
      }
    };
    cur.raf = requestAnimationFrame(step);
  }

  // ---------- element helpers ----------
  const map = new Map();
  let seq = 0;

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (parseFloat(st.opacity || '1') < 0.05) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    return true;
  }

  function roleOf(el) {
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (t === 'textarea') return 'textbox';
    if (el.isContentEditable) return 'textbox';
    if (t === 'input') {
      const ty = (el.type || 'text').toLowerCase();
      if (['text', 'search', 'url', 'email', 'tel', 'number'].includes(ty)) return 'textbox';
      return 'input:' + ty;
    }
    if (t === 'select') return 'combobox';
    return t;
  }

  function labelOf(el) {
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80) ||
      el.getAttribute('name') ||
      el.id ||
      ''
    );
  }

  function collect(max) {
    map.clear();
    seq = 0;
    const els = [
      ...document.querySelectorAll(
        'a,button,input,textarea,select,[role="button"],[role="searchbox"],[role="combobox"],[contenteditable="true"]'
      )
    ];
    const out = [];
    for (const el of els) {
      if (!visible(el)) continue;
      const id = 'e' + ++seq;
      const r = el.getBoundingClientRect();
      map.set(id, el);
      out.push({
        ELEMENT_ID: id,
        ROLE: roleOf(el),
        TEXT: labelOf(el),
        ARIA_LABEL: el.getAttribute('aria-label') || '',
        X: Math.round(r.x),
        Y: Math.round(r.y),
        WIDTH: Math.round(r.width),
        HEIGHT: Math.round(r.height)
      });
      if (out.length >= max) break;
    }
    return out;
  }

  function byRef(p) {
    if (p.elementId && map.has(p.elementId)) return map.get(p.elementId);
    const t = String(p.text || '').toLowerCase().trim();
    if (!t) return null;
    const els = [
      ...document.querySelectorAll('a,button,input,textarea,[role="button"],[role="searchbox"],[contenteditable="true"]')
    ];
    return (
      els.find((el) => {
        if (!visible(el)) return false;
        const hay = (
          (el.getAttribute('aria-label') || '') + ' ' +
          (el.placeholder || '') + ' ' +
          (el.innerText || '') + ' ' +
          (el.value || '') + ' ' +
          (el.id || '') + ' ' +
          (el.name || '')
        ).toLowerCase();
        return hay.includes(t);
      }) || null
    );
  }

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }

  function flash(el) {
    el.classList.add('astra-flash');
    setTimeout(() => el.classList.remove('astra-flash'), 700);
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- actions ----------
  const actions = {
    ping() {
      return { ok: true, url: location.href, title: document.title };
    },
    elements(p) {
      return { ok: true, url: location.href, title: document.title, elements: collect(Number(p.max || 70)) };
    },
    find(p) {
      const all = collect(400);
      const t = String(p.text || '').toLowerCase().trim();
      const hits = all
        .filter((e) => (e.TEXT + ' ' + e.ARIA_LABEL).toLowerCase().includes(t))
        .slice(0, Number(p.max || 20));
      return { ok: true, matches: hits };
    },
    click(p) {
      const el = byRef(p);
      if (!el) return { ok: false, error: 'Element not found. Run browser_find first.' };
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      flash(el);
      const c = center(el);
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: c.x, clientY: c.y }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: c.x, clientY: c.y }));
        el.click();
      } catch (e) {
        return { ok: false, error: 'Click failed: ' + String((e && e.message) || e) };
      }
      return { ok: true, clicked: labelOf(el) };
    },
    type(p) {
      const el = byRef(p);
      if (!el) return { ok: false, error: 'Element not found. Run browser_find first.' };
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      flash(el);
      el.focus();
      if (el.isContentEditable) {
        el.textContent = String(p.text ?? '');
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        setNativeValue(el, String(p.text ?? ''));
      }
      if (p.submit === true) {
        const kb = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
        el.dispatchEvent(new KeyboardEvent('keydown', kb));
        el.dispatchEvent(new KeyboardEvent('keypress', kb));
        el.dispatchEvent(new KeyboardEvent('keyup', kb));
        const form = el.closest('form');
        if (form) {
          try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch (e) { /* ignore */ }
        }
      }
      return { ok: true, typed: String(p.text ?? '') };
    },
    extract() {
      const text = (document.body && document.body.innerText ? document.body.innerText : '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);
      return { ok: true, url: location.href, title: document.title, text, elements: collect(60) };
    },
    scroll(p) {
      const amount = Number(p.amount || 800);
      window.scrollBy({ top: p.direction === 'up' ? -amount : amount, behavior: 'smooth' });
      return { ok: true };
    },
    cursor(p) {
      let el = null;
      if (p.elementId && map.has(p.elementId)) el = map.get(p.elementId);
      else if (p.elementId || p.text) {
        el = byRef({ elementId: null, text: p.text || p.elementId });
      }
      if (!el) return { ok: false, error: 'Element not found for cursor.' };
      const c = center(el);
      moveCursor(c.x, c.y, p.label || 'ASTRA');
      return { ok: true, x: c.x, y: c.y };
    }
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      const fn = actions[msg && msg.action];
      if (!fn) {
        sendResponse({ ok: false, error: 'Unknown content action' });
        return;
      }
      const res = fn(msg || {});
      sendResponse(res);
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  });
})();
