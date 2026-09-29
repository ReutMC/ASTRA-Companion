/**
 * ASTRA renderer — tiny WebAudio cues. No asset files: pure oscillator notes
 * with gain envelopes. Parity with the showcase sound design:
 * wake chime (two ascending sines) · send blip (triangle chirp) ·
 * success blip (two-note confirm) · error (minor-second drop + low buzz) ·
 * voice tick (soft STT metronome, barely audible on purpose).
 */

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface NoteOptions {
  freq: number
  startAt: number
  duration: number
  peak?: number
  type?: OscillatorType
}

function playNote(audio: AudioContext, opts: NoteOptions): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  const t0 = audio.currentTime + opts.startAt
  const peak = opts.peak ?? 0.08

  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.freq, t0)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)

  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.05)
}

/** Soft two-note wake chime (E5 → B5). */
export function playWakeChime(): void {
  const audio = audioContext()
  if (!audio) return
  playNote(audio, { freq: 659.25, startAt: 0, duration: 0.28, peak: 0.07 })
  playNote(audio, { freq: 987.77, startAt: 0.12, duration: 0.38, peak: 0.06 })
}

/** Short triangle chirp when a command is submitted. */
export function playSendBlip(): void {
  const audio = audioContext()
  if (!audio) return
  playNote(audio, { freq: 660, startAt: 0, duration: 0.09, peak: 0.05, type: 'triangle' })
}

/** Soft confirmation blip when a task finishes. */
export function playSuccessBlip(): void {
  const audio = audioContext()
  if (!audio) return
  playNote(audio, { freq: 880, startAt: 0, duration: 0.16, peak: 0.05 })
  playNote(audio, { freq: 1174.66, startAt: 0.09, duration: 0.22, peak: 0.045 })
}

/** Minor-second drop plus a short low buzz — unmistakable but never harsh. */
export function playErrorTone(): void {
  const audio = audioContext()
  if (!audio) return
  playNote(audio, { freq: 392, startAt: 0, duration: 0.22, peak: 0.05, type: 'triangle' })
  playNote(audio, { freq: 185, startAt: 0.1, duration: 0.24, peak: 0.026, type: 'sawtooth' })
}

/** Barely-audible metronome tick for streaming speech-to-text words. */
export function playVoiceTick(): void {
  const audio = audioContext()
  if (!audio) return
  playNote(audio, { freq: 1180, startAt: 0, duration: 0.035, peak: 0.016 })
}
