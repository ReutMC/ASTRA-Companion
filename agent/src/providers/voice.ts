/**
 * STT / TTS abstractions for server-side voice engines.
 *
 * - Web Speech (STT + TTS) runs inside the Electron renderer, so `createSTT`/`createTTS`
 *   return `null` for `type: 'webspeech'` — that is the signal "handled in the UI layer".
 * - `whisper-http`  → OpenAI-compatible `POST {endpoint}/audio/transcriptions` (multipart).
 * - `openai-http`   → OpenAI-compatible `POST {endpoint}/audio/speech` (JSON, mp3 out).
 */
import type { Settings, STTProvider, TTSProvider } from '../types'
import { describeHttpError, networkErrorMessage, safeErrorBody } from './ai/http'

/** Whisper-compatible speech-to-text (multipart upload, JSON response). */
export class WhisperHttpSTT implements STTProvider {
  readonly id = 'whisper-http'

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async transcribe(audio: { base64: string; mimeType?: string }, opts?: { language?: string; signal?: AbortSignal }): Promise<string> {
    const url = `${this.endpoint.replace(/\/+$/, '')}/audio/transcriptions`
    const bytes = Buffer.from(audio.base64, 'base64')
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: audio.mimeType ?? 'audio/webm' }), 'audio.webm')
    form.append('model', this.model)
    if (opts?.language) form.append('language', opts.language.split('-')[0])
    form.append('response_format', 'json')

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        body: form,
        signal: opts?.signal,
      })
    } catch (err) {
      throw networkErrorMessage(err)
    }
    if (!res.ok) throw describeHttpError(res.status, await safeErrorBody(res))
    const json = (await res.json()) as { text?: string }
    return typeof json.text === 'string' ? json.text : ''
  }
}

/** OpenAI-compatible text-to-speech returning mp3 bytes. */
export class OpenAiHttpTTS implements TTSProvider {
  readonly id = 'openai-http'

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly voice: string,
  ) {}

  async synthesize(text: string, opts?: { voice?: string; signal?: AbortSignal }): Promise<Uint8Array> {
    const url = `${this.endpoint.replace(/\/+$/, '')}/audio/speech`
    const body = {
      model: this.model,
      input: text,
      voice: opts?.voice ?? this.voice,
      response_format: 'mp3',
    }
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: opts?.signal,
      })
    } catch (err) {
      throw networkErrorMessage(err)
    }
    if (!res.ok) throw describeHttpError(res.status, await safeErrorBody(res))
    return new Uint8Array(await res.arrayBuffer())
  }
}

/**
 * Builds an STT provider from settings.
 * Returns `null` for `webspeech` (handled by the renderer) and throws a clean
 * error when a server engine is selected without an endpoint.
 */
export function createSTT(cfg: Settings['stt']): STTProvider | null {
  if (!cfg || cfg.type === 'webspeech') return null
  if (cfg.type === 'whisper-http') {
    const endpoint = (cfg.endpoint ?? '').trim()
    if (!endpoint) {
      throw new Error('ASTRA: نشانی سرویس گفتار به متن تنظیم نشده — Settings → Voice / no STT endpoint configured — open Settings → Voice')
    }
    return new WhisperHttpSTT(endpoint, (cfg.apiKey ?? '').trim(), (cfg.model ?? '').trim() || 'whisper-1')
  }
  throw new Error(`ASTRA: نوع گفتار به متن ناشناخته است: «${String(cfg?.type)}» / unknown STT type: "${String(cfg?.type)}"`)
}

/**
 * Builds a TTS provider from settings.
 * Returns `null` for `webspeech` (handled by the renderer) and throws a clean
 * error when a server engine is selected without endpoint + key.
 */
export function createTTS(cfg: Settings['tts']): TTSProvider | null {
  if (!cfg || cfg.type === 'webspeech') return null
  if (cfg.type === 'openai-http') {
    const endpoint = (cfg.endpoint ?? '').trim()
    const apiKey = (cfg.apiKey ?? '').trim()
    if (!endpoint || !apiKey) {
      throw new Error('ASTRA: نشانی یا کلید سرویس متن به گفتار تنظیم نشده — Settings → Voice / TTS endpoint or API key missing — open Settings → Voice')
    }
    return new OpenAiHttpTTS(endpoint, apiKey, (cfg.model ?? '').trim() || 'tts-1', (cfg.voice ?? '').trim() || 'alloy')
  }
  throw new Error(`ASTRA: نوع متن به گفتار ناشناخته است: «${String(cfg?.type)}» / unknown TTS type: "${String(cfg?.type)}"`)
}
