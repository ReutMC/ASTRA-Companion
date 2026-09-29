// ASTRA astronaut - original SVG character with 9 animated states.
/* global document, window */
(function () {
  'use strict';

  var SVG =
    '<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="suitGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#eef2fb"/><stop offset="1" stop-color="#c3cde3"/></linearGradient>' +
    '<linearGradient id="packGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#2a3352"/><stop offset="1" stop-color="#1a2138"/></linearGradient>' +
    '<radialGradient id="visorGrad" cx="0.5" cy="0.32" r="0.9">' +
    '<stop offset="0" stop-color="#18244c"/><stop offset="0.65" stop-color="#0c142e"/><stop offset="1" stop-color="#070d20"/></radialGradient>' +
    '<linearGradient id="eyeGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#bae6fd"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>' +
    '<clipPath id="visorClip"><circle cx="120" cy="92" r="44"/></clipPath>' +
    '</defs>' +

    '<ellipse class="shadow" cx="120" cy="288" rx="56" ry="7" fill="rgba(103,232,249,0.10)"/>' +

    '<g class="ast-body">' +
    // jetpack
    '<rect class="pack" x="66" y="118" width="108" height="96" rx="26" fill="url(#packGrad)"/>' +
    '<rect x="80" y="134" width="20" height="7" rx="3.5" fill="#3b4a72"/>' +
    '<rect x="140" y="134" width="20" height="7" rx="3.5" fill="#3b4a72"/>' +
    // arms
    '<rect class="arm arm-l" x="42" y="140" width="27" height="88" rx="13.5" fill="url(#suitGrad)"/>' +
    '<rect class="arm arm-r" x="171" y="140" width="27" height="88" rx="13.5" fill="url(#suitGrad)"/>' +
    '<circle cx="55.5" cy="228" r="10" fill="#aab6d3"/>' +
    '<circle cx="184.5" cy="228" r="10" fill="#aab6d3"/>' +
    // torso
    '<rect x="74" y="116" width="92" height="124" rx="40" fill="url(#suitGrad)"/>' +
    // chest panel + status lights
    '<rect x="99" y="176" width="42" height="28" rx="9" fill="#0b1226" stroke="rgba(125,211,252,0.35)" stroke-width="1.2"/>' +
    '<g class="chest-lights">' +
    '<circle cx="111" cy="190" r="3.4" fill="#67e8f9"/>' +
    '<circle cx="120" cy="190" r="3.4" fill="#6ee7b7"/>' +
    '<circle cx="129" cy="190" r="3.4" fill="#94a3b8"/>' +
    '</g>' +
    // helmet
    '<circle cx="120" cy="92" r="54" fill="#eef2fb"/>' +
    '<circle cx="120" cy="92" r="44" fill="url(#visorGrad)"/>' +
    '<g class="visor-group">' +
    '<g clip-path="url(#visorClip)">' +
    '<circle cx="98" cy="70" r="1.3" fill="rgba(255,255,255,0.55)"/>' +
    '<circle cx="140" cy="66" r="1.1" fill="rgba(255,255,255,0.4)"/>' +
    '<circle cx="130" cy="118" r="1.2" fill="rgba(255,255,255,0.35)"/>' +
    // eyes
    '<g class="eyes-normal">' +
    '<g class="eye"><ellipse class="eyeball" cx="102" cy="92" rx="9.5" ry="13.5" fill="url(#eyeGrad)"/><circle class="pupil" cx="102" cy="96" r="3.1" fill="#07203a"/></g>' +
    '<g class="eye"><ellipse class="eyeball" cx="138" cy="92" rx="9.5" ry="13.5" fill="url(#eyeGrad)"/><circle class="pupil" cx="138" cy="96" r="3.1" fill="#07203a"/></g>' +
    '</g>' +
    '<g class="eyes-happy" fill="none" stroke="#7dd3fc" stroke-width="5" stroke-linecap="round">' +
    '<path d="M92 94 Q102 84 112 94"/><path d="M128 94 Q138 84 148 94"/>' +
    '</g>' +
    '<g class="eyes-closed" fill="none" stroke="#7dd3fc" stroke-width="4.5" stroke-linecap="round">' +
    '<path d="M92 92 Q102 100 112 92"/><path d="M128 92 Q138 100 148 92"/>' +
    '</g>' +
    '<g class="eyes-error" fill="#f87171">' +
    '<rect x="91" y="88.5" width="22" height="5" rx="2.5"/>' +
    '<rect x="127" y="88.5" width="22" height="5" rx="2.5"/>' +
    '</g>' +
    // speaking grille
    '<g class="grille" fill="#67e8f9">' +
    '<rect x="103" y="116" width="4.6" height="10" rx="2.3"/>' +
    '<rect x="111.5" y="116" width="4.6" height="10" rx="2.3"/>' +
    '<rect x="120" y="116" width="4.6" height="10" rx="2.3"/>' +
    '<rect x="128.5" y="116" width="4.6" height="10" rx="2.3"/>' +
    '<rect x="137" y="116" width="4.6" height="10" rx="2.3"/>' +
    '</g>' +
    '</g>' +
    '</g>' +
    // visor shine + halo ring
    '<path d="M92 66 Q104 56 120 56" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="4" stroke-linecap="round"/>' +
    '<circle class="halo" cx="120" cy="92" r="60" fill="none" stroke="rgba(103,232,249,0.55)" stroke-width="2" stroke-dasharray="5 11"/>' +
    // antenna
    '<rect x="164" y="36" width="7" height="26" rx="3.5" fill="#dfe6f3" transform="rotate(18 167 49)"/>' +
    '<circle cx="172" cy="34" r="6" fill="#67e8f9" opacity="0.9"/>' +
    '</g>' +

    '<g class="zzz" fill="none">' +
    '<text x="168" y="52">z</text>' +
    '<text x="182" y="40">z</text>' +
    '<text x="194" y="28">z</text>' +
    '</g>' +
    '</svg>';

  function create(container) {
    container.innerHTML = SVG;
    var svg = container.querySelector('svg');
    var state = 'IDLE';

    function setState(s) {
      state = s;
      svg.setAttribute('class', 'ast st-' + s);
      container.dataset.state = s;
      document.body.dataset.state = s;
    }

    // Natural blinking
    setInterval(function () {
      if (state === 'SLEEPING' || state === 'SUCCESS' || state === 'ERROR' || state === 'SPEAKING') return;
      svg.classList.add('blink');
      setTimeout(function () { svg.classList.remove('blink'); }, 150);
    }, 3200 + Math.floor(Math.random() * 2600));

    // Occasional idle look-around
    setInterval(function () {
      if (state !== 'IDLE') return;
      var eyes = svg.querySelector('.eyes-normal');
      if (!eyes) return;
      var dir = Math.random() > 0.5 ? 6 : -6;
      eyes.style.transition = 'transform 0.4s ease';
      eyes.style.transform = 'translateX(' + dir + 'px)';
      setTimeout(function () {
        eyes.style.transform = 'translateX(0)';
      }, 900);
    }, 5200 + Math.floor(Math.random() * 3000));

    setState('IDLE');
    return { setState: setState, get state() { return state; } };
  }

  window.AstraAstronaut = { create: create };
})();
