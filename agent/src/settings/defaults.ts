/**
 * Default settings for ASTRA — exactly per CONTRACTS.md §8.
 */
import type { Settings } from '../types'

/** Factory defaults. The AI `apiKey` is intentionally empty — users enter it in Settings → AI. */
export const DEFAULT_SETTINGS: Settings = {
  ai: {
    type: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    maxTokens: 2048,
  },
  stt: {
    type: 'webspeech',
    language: 'fa-IR',
  },
  tts: {
    type: 'webspeech',
  },
  companion: {
    size: 380,
    opacity: 1,
    alwaysOnTop: true,
    clickThrough: false,
    locked: false,
  },
  browser: {
    aiCursor: true,
    confirmActions: true,
  },
  permissions: {
    MICROPHONE: true,
    BROWSER: true,
    FILES: true,
    WINDOWS_APPS: false,
    NETWORK: true,
    SCREEN_CAPTURE: false,
    CLIPBOARD: false,
  },
  memory: {
    enabled: false,
  },
  shortcuts: {
    toggle: 'Ctrl+Space',
  },
}

/** Recursive partial — used for settings patches coming from the UI. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Recursively merges `patch` into `base` and returns a new object.
 * Arrays and primitives are replaced (never merged element-wise).
 * Neither `base` nor `patch` are mutated.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(patch)) {
    out[key] = deepMerge((base as Record<string, unknown>)[key], (patch as Record<string, unknown>)[key])
  }
  return out as T
}

/** Merge a (possibly partial) settings patch over a base settings object. */
export function deepMergeSettings(base: Settings, patch: DeepPartial<Settings>): Settings {
  return deepMerge(base, patch)
}
