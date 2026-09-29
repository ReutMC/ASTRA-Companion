'use client'
/**
 * ASTRA — Animated Astronaut Character
 * ------------------------------------------------------------------
 * Single source of truth, shared verbatim by:
 *   - the Next.js interactive showcase  (src/components/astra/Astronaut.tsx)
 *   - the Electron desktop renderer     (astra/frontend/src/astronaut/Astronaut.tsx)
 *
 * Pure React + SVG + CSS keyframes + one RAF loop (gaze / blink / lids).
 * No external animation dependencies. Optimized for a transparent,
 * always-on-top desktop companion window.
 *
 * Eye states: idle | listening | thinking | searching | working |
 *             speaking | success | error | sleeping
 */

import React, { useEffect, useRef } from 'react'

export type AstraState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'searching'
  | 'working'
  | 'speaking'
  | 'success'
  | 'error'
  | 'sleeping'

export interface AstraStateMeta {
  color: string
  labelEn: string
  labelFa: string
}

export const ASTRA_STATES: Record<AstraState, AstraStateMeta> = {
  idle: { color: '#67e8f9', labelEn: 'Idle', labelFa: 'آماده' },
  listening: { color: '#7df3ff', labelEn: 'Listening', labelFa: 'در حال شنیدن' },
  thinking: { color: '#8ad8ff', labelEn: 'Thinking', labelFa: 'در حال فکر کردن' },
  searching: { color: '#22d3ee', labelEn: 'Searching', labelFa: 'در حال جستجو' },
  working: { color: '#5eead4', labelEn: 'Working', labelFa: 'در حال کار' },
  speaking: { color: '#7dd3fc', labelEn: 'Speaking', labelFa: 'در حال صحبت' },
  success: { color: '#6ee7b7', labelEn: 'Success', labelFa: 'انجام شد' },
  error: { color: '#fda4af', labelEn: 'Error', labelFa: 'خطا' },
  sleeping: { color: '#94a3b8', labelEn: 'Sleeping', labelFa: 'خواب' },
}

const EYE_CFG: Record<AstraState, { lid: number; pupil: number; blink: [number, number] }> = {
  idle: { lid: 0.03, pupil: 1.0, blink: [2600, 5200] },
  listening: { lid: 0.0, pupil: 1.08, blink: [3800, 6600] },
  thinking: { lid: 0.34, pupil: 0.95, blink: [4200, 7600] },
  searching: { lid: 0.08, pupil: 1.16, blink: [3000, 5600] },
  working: { lid: 0.16, pupil: 1.0, blink: [3200, 6000] },
  speaking: { lid: 0.05, pupil: 1.02, blink: [2400, 4600] },
  success: { lid: 0.0, pupil: 1.0, blink: [1e9, 1e9] },
  error: { lid: 0.12, pupil: 0.82, blink: [2600, 4800] },
  sleeping: { lid: 1.0, pupil: 1.0, blink: [1e9, 1e9] },
}

const CSS = `
.astra-root { --a-accent: #67e8f9; display: block; user-select: none; -webkit-user-drag: none; }
.astra-root svg { width: 100%; height: 100%; display: block; overflow: visible; }
.astra-root .a-float { animation: astraFloat 6s ease-in-out infinite; }
.astra-root .a-shadow { animation: astraShadow 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.astra-root .a-eye-content, .astra-root .a-eye-iris, .astra-root .a-eye-lid,
.astra-root .a-brow, .astra-root .a-eqb, .astra-root .a-star {
  transform-box: fill-box; transform-origin: center; }
.astra-root .a-eye-lid { transform-origin: 50% 0%; }
.astra-root .a-body { transform-box: fill-box; transform-origin: center; transition: transform .6s cubic-bezier(.4,0,.2,1); }
.astra-root[data-state="thinking"] .a-body { transform: rotate(-2.2deg); }
.astra-root[data-state="success"] .a-body { transform: rotate(1.8deg); }
.astra-root[data-state="error"] .a-body { transform: rotate(-1.2deg) translateY(2px); animation: astraErrorShake .48s ease-in-out 1 .12s; }
@keyframes astraErrorShake {
  0%, 100% { translate: 0 0; }
  20% { translate: -4px 0; }
  40% { translate: 4px 0; }
  60% { translate: -3px 0; }
  80% { translate: 2px 0; }
}
.astra-root .a-star { animation: astraTwinkle 3.4s ease-in-out infinite; }
.astra-root .a-star:nth-of-type(2n) { animation-delay: 1.1s; }
.astra-root .a-star:nth-of-type(3n) { animation-delay: 2.2s; }
.astra-root .a-led { animation: astraLed 2.6s ease-in-out infinite; }
.astra-root .a-core { animation: astraCore 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; fill: var(--a-accent); }
.astra-root .a-ringwrap, .a-root-hide { opacity: 0; transition: opacity .4s ease; }
.astra-root .a-ring { transform-box: fill-box; transform-origin: center; animation: astraRing 2.1s cubic-bezier(.2,.6,.4,1) infinite; }
.astra-root .a-ring2 { animation-delay: 1.05s; }
.astra-root .a-eye-happy, .astra-root .a-eye-closed, .astra-root .a-brow,
.astra-root .a-mouth-smile, .astra-root .a-mouth-frown, .astra-root .a-mouth-eq,
.astra-root .a-sparkles, .astra-root .a-zzz {
  opacity: 0; transition: opacity .35s ease; }
.astra-root .a-brow { transition: opacity .35s ease, transform .45s cubic-bezier(.4,0,.2,1); }
.astra-root[data-state="success"] .a-eye-content,
.astra-root[data-state="sleeping"] .a-eye-content { opacity: 0; }
.astra-root[data-state="success"] .a-eye-happy { opacity: 1; }
.astra-root[data-state="sleeping"] .a-eye-closed { opacity: 1; }
.astra-root[data-state="success"] .a-sparkles { opacity: 1; }
.astra-root[data-state="success"] .a-mouth-smile { opacity: 1; }
.astra-root[data-state="error"] .a-mouth-frown { opacity: 1; }
.astra-root[data-state="speaking"] .a-mouth-eq { opacity: 1; }
.astra-root[data-state="listening"] .a-ringwrap { opacity: 1; }
.astra-root[data-state="thinking"] .a-brow,
.astra-root[data-state="error"] .a-brow { opacity: 1; }
.astra-root[data-state="thinking"] .a-brow-l { transform: translate(-1px,-7px) rotate(-8deg); }
.astra-root[data-state="thinking"] .a-brow-r { transform: translate(1px,-7px) rotate(8deg); }
.astra-root[data-state="error"] .a-brow-l { transform: translate(0,1px) rotate(13deg); }
.astra-root[data-state="error"] .a-brow-r { transform: translate(0,1px) rotate(-13deg); }
.astra-root .a-eqb { animation: astraEq 1.05s ease-in-out infinite; transform-origin: 50% 100%; }
.astra-root .a-eqb:nth-of-type(2) { animation-delay: .18s; }
.astra-root .a-eqb:nth-of-type(3) { animation-delay: .36s; }
.astra-root .a-eqb:nth-of-type(4) { animation-delay: .54s; }
.astra-root .a-sparkle { animation: astraSpark 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; stroke: var(--a-accent); }
.astra-root .a-sparkle:nth-of-type(2) { animation-delay: .5s; }
.astra-root .a-sparkle:nth-of-type(3) { animation-delay: 1s; }
.astra-root .a-sparkle:nth-of-type(4) { animation-delay: 1.4s; }
.astra-root .a-zz1, .astra-root .a-zz2 { animation: astraTwinkle 2.6s ease-in-out infinite; fill: var(--a-accent); }
.astra-root .a-zz2 { animation-delay: 1.3s; }
@keyframes astraFloat { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-11px); } }
@keyframes astraShadow { 0%,100% { transform: scaleX(1); opacity:.55; } 50% { transform: scaleX(.88); opacity:.32; } }
@keyframes astraTwinkle { 0%,100% { opacity:.12; transform: scale(.75); } 50% { opacity:.85; transform: scale(1.2); } }
@keyframes astraRing { 0% { transform: scale(.82); opacity:.6; } 100% { transform: scale(1.3); opacity:0; } }
@keyframes astraLed { 0%,100% { opacity:.3; } 50% { opacity:1; } }
@keyframes astraCore { 0%,100% { transform: scale(1); opacity:.85; } 50% { transform: scale(1.22); opacity:1; } }
@keyframes astraEq { 0%,100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
@keyframes astraSpark { 0%,100% { opacity:0; transform: scale(.35) rotate(0deg); } 50% { opacity:1; transform: scale(1) rotate(90deg); } }
@media (prefers-reduced-motion: reduce) {
  .astra-root .a-float, .astra-root .a-star, .astra-root .a-ring,
  .astra-root .a-eqb, .astra-root .a-sparkle { animation: none; }
  .astra-root[data-state="error"] .a-body { animation: none; }
}
`

export interface AstronautProps {
  state?: AstraState
  size?: number
  className?: string
  interactive?: boolean
  onClick?: () => void
  title?: string
}

export default function Astronaut({
  state = 'idle',
  size = 320,
  className = '',
  interactive = true,
  onClick,
  title,
}: AstronautProps) {
  const meta = ASTRA_STATES[state]

  const irisL = useRef<SVGGElement | null>(null)
  const irisR = useRef<SVGGElement | null>(null)
  const lidL = useRef<SVGEllipseElement | null>(null)
  const lidR = useRef<SVGEllipseElement | null>(null)
  const contentL = useRef<SVGGElement | null>(null)
  const contentR = useRef<SVGGElement | null>(null)
  const stateRef = useRef<AstraState>(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let raf = 0
    const gaze = { x: 0, y: 0 }
    let pupil = 1
    let lidCur = 0.03
    let nextBlinkAt = performance.now() + 1800
    let blinkUntil = 0

    const loop = (ts: number) => {
      const st = stateRef.current
      const cfg = EYE_CFG[st]
      const t = ts / 1000

      // --- gaze target per state ---
      let tx = 0
      let ty = 0
      switch (st) {
        case 'idle': tx = Math.cos(t * 0.6) * 4; ty = Math.sin(t * 0.45) * 2.6; break
        case 'listening': tx = 0; ty = 5.2; break
        case 'thinking': tx = 6; ty = -6.2; break
        case 'searching': tx = Math.sin(t * 5.4) * 8; ty = -2; break
        case 'working': tx = 1; ty = 3.6; break
        case 'speaking': tx = Math.sin(t * 2.6) * 2.6; ty = Math.cos(t * 2) * 2; break
        case 'success': tx = 0; ty = -2; break
        case 'error': tx = 2; ty = 1.4; break
        case 'sleeping': tx = 0; ty = 0; break
      }
      gaze.x += (tx - gaze.x) * 0.085
      gaze.y += (ty - gaze.y) * 0.085

      // --- pupil scale lerp ---
      pupil += (cfg.pupil - pupil) * 0.1
      const irisT = `translate(${gaze.x.toFixed(2)} ${gaze.y.toFixed(2)}) scale(${pupil.toFixed(3)})`
      if (irisL.current) irisL.current.setAttribute('transform', irisT)
      if (irisR.current) irisR.current.setAttribute('transform', irisT)

      // --- blink scheduler ---
      const now = performance.now()
      if (ts > nextBlinkAt && blinkUntil === 0) {
        blinkUntil = ts + 140
        nextBlinkAt = ts + cfg.blink[0] + Math.random() * (cfg.blink[1] - cfg.blink[0])
      }
      let blinking = blinkUntil !== 0 && ts < blinkUntil
      if (blinkUntil !== 0 && ts >= blinkUntil) blinkUntil = 0

      // --- lid lerp (expression droop) ---
      const lidTarget = st === 'sleeping' ? 1 : cfg.lid
      lidCur += (lidTarget - lidCur) * 0.12
      const lidEff = Math.max(lidCur, blinking ? 1 : 0)
      const lidT = `scaleY(${lidEff.toFixed(3)})`
      if (lidL.current) lidL.current.style.transform = lidT
      if (lidR.current) lidR.current.style.transform = lidT

      // --- eye content blink squash ---
      const cs = blinking ? 0.08 : 1
      if (contentL.current) contentL.current.style.transform = `scaleY(${cs})`
      if (contentR.current) contentR.current.style.transform = `scaleY(${cs})`

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className={`astra-root ${className}`}
      data-state={state}
      style={{ width: size, height: size * (420 / 340), ['--a-accent' as never]: meta.color }}
      onClick={interactive ? onClick : undefined}
      role="img"
      aria-label={title ?? `ASTRA — ${meta.labelEn}`}
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 340 420" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="a-suit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F2F5FA" />
            <stop offset="1" stopColor="#C2CEDD" />
          </linearGradient>
          <linearGradient id="a-suitDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#D7DFEA" />
            <stop offset="1" stopColor="#A9B7C9" />
          </linearGradient>
          <linearGradient id="a-pack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#35485F" />
            <stop offset="1" stopColor="#20304676" />
          </linearGradient>
          <radialGradient id="a-visor" cx="0.42" cy="0.35" r="0.9">
            <stop offset="0" stopColor="#152A44" />
            <stop offset="0.62" stopColor="#0A1526" />
            <stop offset="1" stopColor="#050B14" />
          </radialGradient>
          <linearGradient id="a-glass" x1="0.15" y1="0.05" x2="0.5" y2="1">
            <stop offset="0" stopColor="#EAF7FF" stopOpacity="0.34" />
            <stop offset="0.4" stopColor="#BFEAFF" stopOpacity="0.08" />
            <stop offset="1" stopColor="#7FD4F5" stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id="a-iris" cx="0.4" cy="0.35" r="0.85">
            <stop offset="0" stopColor="#F0FEFF" />
            <stop offset="0.45" stopColor="#8BEFFF" />
            <stop offset="1" stopColor="#2FB4E8" />
          </radialGradient>
          <radialGradient id="a-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#67E8F9" stopOpacity="0.5" />
            <stop offset="1" stopColor="#67E8F9" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="a-aura" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#22D3EE" stopOpacity="0.16" />
            <stop offset="0.7" stopColor="#0EA5E9" stopOpacity="0.05" />
            <stop offset="1" stopColor="#0EA5E9" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="a-shadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#020617" stopOpacity="0.42" />
            <stop offset="1" stopColor="#020617" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ambient aura */}
        <circle cx="170" cy="200" r="165" fill="url(#a-aura)" />

        {/* background stars */}
        <circle className="a-star" cx="42" cy="92" r="2.2" fill="#BFEAFF" />
        <circle className="a-star" cx="302" cy="70" r="1.7" fill="#BFEAFF" />
        <circle className="a-star" cx="52" cy="298" r="1.6" fill="#BFEAFF" />
        <circle className="a-star" cx="294" cy="312" r="2.4" fill="#BFEAFF" />
        <circle className="a-star" cx="318" cy="188" r="1.5" fill="#BFEAFF" />
        <circle className="a-star" cx="24" cy="192" r="1.8" fill="#BFEAFF" />

        <g className="a-float">
          {/* listening rings */}
          <g className="a-ringwrap">
            <circle className="a-ring" cx="170" cy="128" r="86" stroke="var(--a-accent)" strokeOpacity="0.55" strokeWidth="1.6" />
            <circle className="a-ring a-ring2" cx="170" cy="128" r="86" stroke="var(--a-accent)" strokeOpacity="0.4" strokeWidth="1.2" />
          </g>

          {/* backpack */}
          <rect x="94" y="120" width="152" height="142" rx="26" fill="url(#a-pack)" stroke="#3D5370" strokeWidth="1.5" />
          <rect x="112" y="146" width="30" height="8" rx="4" fill="#4C6A8C" opacity="0.8" />
          <rect x="112" y="162" width="30" height="8" rx="4" fill="#4C6A8C" opacity="0.55" />
          <rect x="198" y="146" width="30" height="8" rx="4" fill="#4C6A8C" opacity="0.8" />
          <rect x="198" y="162" width="30" height="8" rx="4" fill="#4C6A8C" opacity="0.55" />

          <g className="a-body">
            {/* arms */}
            <g transform="rotate(14 98 232)">
              <rect x="82" y="218" width="33" height="90" rx="16.5" fill="url(#a-suitDark)" />
              <circle cx="98" cy="312" r="14" fill="#9FB2C6" />
            </g>
            <g transform="rotate(-14 242 232)">
              <rect x="225" y="218" width="33" height="90" rx="16.5" fill="url(#a-suitDark)" />
              <circle cx="242" cy="312" r="14" fill="#9FB2C6" />
            </g>

            {/* boots */}
            <rect x="134" y="332" width="32" height="26" rx="12" fill="#A9B7C9" />
            <rect x="174" y="332" width="32" height="26" rx="12" fill="#A9B7C9" />

            {/* torso */}
            <rect x="114" y="200" width="112" height="142" rx="46" fill="url(#a-suit)" />
            <rect x="114" y="200" width="112" height="142" rx="46" stroke="#94A6BC" strokeWidth="1.2" opacity="0.6" />
            {/* waist ring */}
            <rect x="126" y="314" width="88" height="15" rx="7.5" fill="#93A5BA" />
            {/* chest panel */}
            <rect x="137" y="236" width="66" height="58" rx="13" fill="#22334A" stroke="#3D5370" strokeWidth="1.4" />
            <circle className="a-core" cx="170" cy="258" r="11" />
            <rect x="148" y="276" width="14" height="6" rx="3" fill="#4C6A8C" />
            <rect x="168" y="276" width="14" height="6" rx="3" fill="#4C6A8C" />
            <rect x="188" y="276" width="6" height="6" rx="3" fill="#4C6A8C" />

            {/* collar */}
            <rect x="124" y="190" width="92" height="24" rx="12" fill="#93A5BA" />

            {/* antenna */}
            <line x1="212" y1="58" x2="222" y2="30" stroke="#93A5BA" strokeWidth="3" strokeLinecap="round" />
            <circle className="a-led" cx="223" cy="27" r="4.6" fill="var(--a-accent)" />

            {/* helmet */}
            <circle cx="170" cy="126" r="79" fill="#0D1B2E" opacity="0.35" />
            <circle cx="170" cy="126" r="78" fill="url(#a-visor)" stroke="#8FD9F7" strokeOpacity="0.85" strokeWidth="2.2" />
            <circle cx="170" cy="126" r="66" fill="url(#a-visor)" />

            {/* success sparkles */}
            <g className="a-sparkles">
              <path className="a-sparkle" d="M 96 62 L 96 74 M 90 68 L 102 68" strokeWidth="2.4" strokeLinecap="round" />
              <path className="a-sparkle" d="M 252 56 L 252 68 M 246 62 L 258 62" strokeWidth="2.4" strokeLinecap="round" />
              <path className="a-sparkle" d="M 78 150 L 78 160 M 73 155 L 83 155" strokeWidth="2" strokeLinecap="round" />
              <path className="a-sparkle" d="M 266 158 L 266 168 M 261 163 L 271 163" strokeWidth="2" strokeLinecap="round" />
            </g>

            {/* zzz (sleeping) */}
            <g className="a-zzz">
              <text className="a-zz1" x="222" y="88" fontSize="17" fontWeight="700">z</text>
              <text className="a-zz2" x="236" y="70" fontSize="12" fontWeight="700">z</text>
            </g>

            {/* face — left eye */}
            <g transform="translate(139 162)">
              <ellipse rx="23" ry="24" fill="url(#a-glow)" opacity="0.6" />
              <g ref={contentL}>
                <g ref={irisL}>
                  <circle r="12" fill="url(#a-iris)" />
                  <circle r="5.2" fill="#04222F" />
                  <circle cx="-3.6" cy="-4.4" r="2.6" fill="#FFFFFF" opacity="0.95" />
                </g>
              </g>
              <ellipse ref={lidL} rx="17" ry="27" cy="-15" fill="url(#a-visor)" />
              <path className="a-eye-happy" d="M -12 5 Q 0 -9 12 5" stroke="var(--a-accent)" strokeWidth="3.6" strokeLinecap="round" />
              <path className="a-eye-closed" d="M -11 1 Q 0 9 11 1" stroke="var(--a-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
              <path className="a-brow a-brow-l" d="M -14 -30 Q 0 -37 13 -29" stroke="#9DDCF4" strokeWidth="3" strokeLinecap="round" />
            </g>

            {/* face — right eye */}
            <g transform="translate(201 162)">
              <ellipse rx="23" ry="24" fill="url(#a-glow)" opacity="0.6" />
              <g ref={contentR}>
                <g ref={irisR}>
                  <circle r="12" fill="url(#a-iris)" />
                  <circle r="5.2" fill="#04222F" />
                  <circle cx="-3.6" cy="-4.4" r="2.6" fill="#FFFFFF" opacity="0.95" />
                </g>
              </g>
              <ellipse ref={lidR} rx="17" ry="27" cy="-15" fill="url(#a-visor)" />
              <path className="a-eye-happy" d="M -12 5 Q 0 -9 12 5" stroke="var(--a-accent)" strokeWidth="3.6" strokeLinecap="round" />
              <path className="a-eye-closed" d="M -11 1 Q 0 9 11 1" stroke="var(--a-accent)" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
              <path className="a-brow a-brow-r" d="M -13 -29 Q 0 -37 14 -30" stroke="#9DDCF4" strokeWidth="3" strokeLinecap="round" />
            </g>

            {/* mouth */}
            <g className="a-mouth-eq" fill="var(--a-accent)">
              <rect className="a-eqb" x="161" y="182" width="3.4" height="12" rx="1.7" />
              <rect className="a-eqb" x="167" y="182" width="3.4" height="12" rx="1.7" />
              <rect className="a-eqb" x="173" y="182" width="3.4" height="12" rx="1.7" />
              <rect className="a-eqb" x="179" y="182" width="3.4" height="12" rx="1.7" />
            </g>
            <path className="a-mouth-smile" d="M 160 184 Q 170 194 180 184" stroke="var(--a-accent)" strokeWidth="3" strokeLinecap="round" />
            <path className="a-mouth-frown" d="M 160 190 Q 170 181 180 190" stroke="#FDA4AF" strokeWidth="3" strokeLinecap="round" />

            {/* helmet glass highlight */}
            <circle cx="170" cy="126" r="78" fill="url(#a-glass)" />
            <path d="M 118 84 Q 136 60 168 54" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="6" strokeLinecap="round" />
            <path d="M 108 102 Q 112 92 120 84" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>

        {/* ground shadow */}
        <ellipse className="a-shadow" cx="170" cy="398" rx="72" ry="11" fill="url(#a-shadow)" />
      </svg>
    </div>
  )
}
