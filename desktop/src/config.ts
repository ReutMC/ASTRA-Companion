/**
 * ASTRA desktop — paths & settings persistence.
 * Everything lives under app.getPath('userData') (e.g. %APPDATA%\ASTRA on Windows).
 */
import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Permission, Settings } from './types'

export function getUserDir(): string {
  return app.getPath('userData')
}

export function getSettingsPath(): string {
  return path.join(getUserDir(), 'settings.json')
}

export function getMemoryPath(): string {
  return path.join(getUserDir(), 'memory.json')
}

export function getCompanionBoundsPath(): string {
  return path.join(getUserDir(), 'companion-bounds.json')
}

export function getNativeDir(): string {
  return path.join(getUserDir(), 'native')
}

export function getPortFile(): string {
  return path.join(getNativeDir(), 'port.json')
}

// Stable path helpers for modules that import them directly.
export const settingsPath = getSettingsPath()
export const memoryPath = getMemoryPath()
export const nativeDir = getNativeDir()
export const portFile = getPortFile()

export const PERMISSION_KEYS: Permission[] = [
  'NETWORK',
  'FILES',
  'WINDOWS_APPS',
  'BROWSER',
  'MICROPHONE',
  'CLIPBOARD',
  'SCREEN_CAPTURE',
]

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
    endpoint: '',
    apiKey: '',
    model: '',
    language: 'fa-IR',
  },
  tts: {
    type: 'webspeech',
    endpoint: '',
    apiKey: '',
    model: '',
    voice: '',
  },
  companion: {
    size: 340,
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
    NETWORK: true,
    FILES: true,
    WINDOWS_APPS: false,
    BROWSER: true,
    MICROPHONE: true,
    CLIPBOARD: false,
    SCREEN_CAPTURE: false,
  },
  memory: {
    enabled: false,
  },
  shortcuts: {
    toggle: 'Ctrl+Space',
  },
  general: {
    language: 'fa-IR',
    launchOnStartup: true,
  },
}

type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep-merge `patch` onto `base` without mutating either; arrays replace. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) {
    return (patch === undefined ? base : (patch as unknown as T))
  }
  const out: Plain = { ...(base as unknown as Plain) }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMerge(current, value)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as unknown as T
}

let cached: Settings | null = null

/** Load settings.json, deep-merged over DEFAULT_SETTINGS (cached). */
export function loadSettings(): Settings {
  if (cached) return cached
  let stored: unknown = {}
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    stored = {}
  }
  cached = deepMerge(DEFAULT_SETTINGS, stored)
  // Prune unknown permission keys and ensure every key exists.
  const perms = {} as Record<Permission, boolean>
  for (const key of PERMISSION_KEYS) {
    perms[key] = Boolean(cached.permissions?.[key])
  }
  cached.permissions = perms
  return cached
}

/** Deep-merge a patch into settings, persist it and refresh the cache. */
export function saveSettings(patch: unknown): Settings {
  const current = loadSettings()
  const next = deepMerge(current, patch)
  const perms = {} as Record<Permission, boolean>
  for (const key of PERMISSION_KEYS) {
    perms[key] = Boolean(next.permissions?.[key])
  }
  next.permissions = perms
  try {
    fs.mkdirSync(getUserDir(), { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    console.error('[astra] failed to persist settings:', err)
  }
  cached = next
  return next
}

export interface CompanionBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export function loadCompanionBounds(): CompanionBounds | null {
  try {
    const raw = JSON.parse(fs.readFileSync(getCompanionBoundsPath(), 'utf8')) as Partial<CompanionBounds>
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number') return null
    return {
      x: typeof raw.x === 'number' ? raw.x : undefined,
      y: typeof raw.y === 'number' ? raw.y : undefined,
      width: raw.width,
      height: raw.height,
    }
  } catch {
    return null
  }
}

export function saveCompanionBounds(bounds: CompanionBounds): void {
  try {
    fs.mkdirSync(getUserDir(), { recursive: true })
    fs.writeFileSync(getCompanionBoundsPath(), JSON.stringify(bounds, null, 2), 'utf8')
  } catch (err) {
    console.error('[astra] failed to persist companion bounds:', err)
  }
}

/** Used on quit so stale caches never leak across instances. */
export function resetSettingsCache(): void {
  cached = null
}
