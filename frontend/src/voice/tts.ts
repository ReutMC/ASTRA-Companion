/**
 * ASTRA renderer — text-to-speech.
 *  - webspeech: SpeechSynthesis with a fa/en voice matched to the text.
 *  - openai-http: POST {endpoint}/audio/speech → audio blob → <audio> playback.
 * `speak()` resolves when playback finishes; `stopSpeaking()` cuts it short.
 */
import type { Settings } from '../lib/types'

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    // synthesis unavailable
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
}

export function isSpeaking(): boolean {
  return (
    Boolean(window.speechSynthesis?.speaking) || (currentAudio !== null && !currentAudio.paused)
  )
}

function pickVoice(text: string): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis
  if (!synth) return null
  const voices = synth.getVoices()
  if (voices.length === 0) return null
  const persian = /[\u0600-\u06FF]/.test(text)
  const prefix = persian ? 'fa' : 'en'
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(prefix)) ??
    (persian ? null : voices.find((v) => v.lang.startsWith('en-US')) ?? null)
  )
}

function speakWebSpeech(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis
    if (!synth) {
      reject(new Error('Speech synthesis در این محیط پشتیبانی نمی‌شود'))
      return
    }
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(text)
    if (voice) utterance.voice = voice
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = () => resolve()
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') resolve()
      else reject(new Error(`TTS error: ${event.error}`))
    }
    synth.speak(utterance)
  })
}

async function speakOpenAIHttp(text: string, config: Settings['tts']): Promise<void> {
  if (!config.endpoint) {
    throw new Error('تنظیمات TTS ناقص است (Settings → Voice)')
  }
  const endpoint = `${config.endpoint.replace(/\/+$/, '')}/audio/speech`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model || 'tts-1',
      voice: config.voice || 'alloy',
      input: text,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    throw new Error(`TTS failed: HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  stopSpeaking()
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      reject(new Error('پخش صدای TTS ناموفق بود'))
    }
    void audio.play().catch((err: unknown) => {
      URL.revokeObjectURL(url)
      if (currentAudio === audio) currentAudio = null
      reject(err instanceof Error ? err : new Error('پخش صدا مسدود شد'))
    })
  })
}

/** Speak `text` with the configured engine; resolves when done. */
export function speak(text: string, config: Settings['tts']): Promise<void> {
  if (!text.trim()) return Promise.resolve()
  stopSpeaking()
  if (config.type === 'openai-http') {
    return speakOpenAIHttp(text, config)
  }
  return speakWebSpeech(text)
}
