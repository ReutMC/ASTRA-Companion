/**
 * ASTRA renderer — contract types (mirrors astra/docs/CONTRACTS.md).
 * AstraState comes from the shared astronaut component (single source of truth).
 */
import type { AstraState } from '../astronaut/Astronaut'

export type { AstraState } from '../astronaut/Astronaut'
export { ASTRA_STATES } from '../astronaut/Astronaut'

export type Permission =
  | 'MICROPHONE'
  | 'BROWSER'
  | 'FILES'
  | 'WINDOWS_APPS'
  | 'NETWORK'
  | 'SCREEN_CAPTURE'
  | 'CLIPBOARD'

export type Mode = 'companion' | 'app'
export type WindowOp = 'minimize' | 'maximize' | 'close' | 'hide'

export interface SourceItem {
  title: string
  url: string
  snippet?: string
}

export type AgentEvent =
  | { type: 'status'; state: AstraState; label: string }
  | { type: 'activity'; text: string }
  | { type: 'sources'; sources: SourceItem[] }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'tool'; name: string; argsSummary: string; resultSummary?: string; ok?: boolean }
  | { type: 'approval_request'; id: string; title: string; detail: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface ProviderConfig {
  type: 'openai-compatible' | 'gemini'
  endpoint: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface Settings {
  ai: ProviderConfig
  stt: {
    type: 'webspeech' | 'whisper-http'
    endpoint?: string
    apiKey?: string
    model?: string
    language: 'fa-IR' | 'en-US'
  }
  tts: {
    type: 'webspeech' | 'openai-http'
    endpoint?: string
    apiKey?: string
    model?: string
    voice?: string
  }
  companion: {
    size: number
    opacity: number
    alwaysOnTop: boolean
    clickThrough: boolean
    locked: boolean
  }
  browser: {
    aiCursor: boolean
    confirmActions: boolean
  }
  permissions: Record<Permission, boolean>
  memory: {
    enabled: boolean
  }
  shortcuts: {
    toggle: string
  }
  general?: {
    language?: 'fa-IR' | 'en-US'
    launchOnStartup?: boolean
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export interface MemoryExport {
  path?: string
  exists?: boolean
  content: string
}

export interface AstraApi {
  submit(text: string): Promise<unknown>
  cancel(): Promise<unknown>
  resolveApproval(id: string, approved: boolean): Promise<unknown>
  getSettings(): Promise<Settings>
  setSettings(patch: DeepPartial<Settings>): Promise<Settings>
  setPermissions(patch: Partial<Record<Permission, boolean>>): Promise<Settings>
  clearMemory(): Promise<unknown>
  exportMemory(): Promise<MemoryExport>
  setCompanion(patch: DeepPartial<Settings['companion']>): Promise<Settings>
  setMode(mode: Mode): Promise<unknown>
  hoverInteractive(interactive: boolean): void
  browserStatus(): Promise<{ connected: boolean }>
  openExternal(url: string): Promise<unknown>
  windowOp(op: WindowOp): Promise<unknown>
  speak(text: string): Promise<void>
  whisper(base64: string): Promise<{ text: string }>
  onAgentEvent(cb: (event: AgentEvent) => void): () => void
  onSettingsChanged(cb: (settings: Settings) => void): () => void
  onBrowserStatus(cb: (status: { connected: boolean }) => void): () => void
  onMode(cb: (mode: Mode) => void): () => void
  onWake(cb: () => void): () => void
}

declare global {
  interface Window {
    astra?: AstraApi
  }
}
