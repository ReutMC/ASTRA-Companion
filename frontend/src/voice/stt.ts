/**
 * ASTRA renderer — speech-to-text factory.
 *  - webspeech: browser SpeechRecognition (Chrome / Electron), interim results.
 *  - whisper-http: MediaRecorder → base64 → main process → OpenAI-compatible
 *    /audio/transcriptions endpoint.
 */
import { getAstra } from '../lib/astra'
import type { Settings } from '../lib/types'

export interface STTCallbacks {
  onInterim(text: string): void
  onFinal(text: string): void
  onError(message: string): void
  onEnd(): void
}

export interface STTHandle {
  stop(): void
}

export interface STT {
  isSupported(): boolean
  start(callbacks: STTCallbacks): STTHandle | null
}

/* --------------------------------------------------------- web speech ------ */

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function createWebSpeechSTT(config: Settings['stt']): STT {
  return {
    isSupported: () => getSpeechRecognition() !== null,
    start(callbacks) {
      const Ctor = getSpeechRecognition()
      if (!Ctor) {
        callbacks.onError('Web Speech API در این محیط پشتیبانی نمی‌شود')
        return null
      }
      let stopped = false
      const recognition = new Ctor()
      recognition.lang = config.language || 'fa-IR'
      recognition.continuous = false
      recognition.interimResults = true

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          const transcript = result[0]?.transcript ?? ''
          if (result.isFinal) {
            const trimmed = transcript.trim()
            if (trimmed) callbacks.onFinal(trimmed)
          } else {
            interim += transcript
          }
        }
        if (interim) callbacks.onInterim(interim)
      }
      recognition.onerror = (event) => {
        const code = event.error ?? 'unknown'
        if (code === 'no-speech' || code === 'aborted') return
        callbacks.onError(
          code === 'not-allowed' ? 'دسترسی میکروفون داده نشد' : `خطای تشخیص گفتار: ${code}`,
        )
      }
      recognition.onend = () => {
        if (!stopped) callbacks.onEnd()
      }

      try {
        recognition.start()
      } catch (err) {
        callbacks.onError(err instanceof Error ? err.message : 'شروع تشخیص گفتار ناموفق بود')
        return null
      }

      return {
        stop() {
          stopped = true
          try {
            recognition.stop()
          } catch {
            // already stopped
          }
        },
      }
    },
  }
}

/* --------------------------------------------------------- whisper http ---- */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : '')
    }
    reader.onerror = () => reject(new Error('Failed to read audio blob'))
    reader.readAsDataURL(blob)
  })
}

function createWhisperSTT(): STT {
  return {
    isSupported: () =>
      typeof MediaRecorder !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    start(callbacks) {
      let stopped = false
      let recorder: MediaRecorder | null = null
      let stream: MediaStream | null = null
      const chunks: BlobPart[] = []

      const cleanup = (): void => {
        stream?.getTracks().forEach((track) => track.stop())
        stream = null
        recorder = null
      }

      const run = async (): Promise<void> => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          if (stopped) {
            cleanup()
            return
          }
          const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : ''
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data)
          }
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
            cleanup()
            if (stopped) return
            blobToBase64(blob)
              .then((base64) => getAstra().whisper(base64))
              .then((res) => {
                const text = (res.text ?? '').trim()
                if (text) callbacks.onFinal(text)
                callbacks.onEnd()
              })
              .catch((err: unknown) => {
                callbacks.onError(err instanceof Error ? err.message : 'خطای whisper')
                callbacks.onEnd()
              })
          }
          recorder.start()
        } catch (err) {
          cleanup()
          callbacks.onError(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'دسترسی میکروفون داده نشد'
              : 'میکروفون در دسترس نیست',
          )
          callbacks.onEnd()
        }
      }

      void run()

      return {
        stop() {
          stopped = true
          try {
            if (recorder && recorder.state !== 'inactive') recorder.stop()
            else cleanup()
          } catch {
            cleanup()
          }
        },
      }
    },
  }
}

/* -------------------------------------------------------------- factory ---- */

export function createSTT(config: Settings['stt']): STT {
  return config.type === 'whisper-http' ? createWhisperSTT() : createWebSpeechSTT(config)
}
