/**
 * ASTRA desktop — shared contract types (mirrors astra/docs/CONTRACTS.md).
 * Kept structural so the agent core implementation and this shell stay
 * decoupled at the type level while matching the contract exactly.
 */

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

export type Permission =
  | 'MICROPHONE'
  | 'BROWSER'
  | 'FILES'
  | 'WINDOWS_APPS'
  | 'NETWORK'
  | 'SCREEN_CAPTURE'
  | 'CLIPBOARD'

export type Mode = 'companion' | 'app'

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
  /**
   * Local desktop extension to the contract schema (UI language, launch
   * behavior). Optional so the agent core can consume the same object
   * without knowing about it.
   */
  general?: {
    language?: 'fa-IR' | 'en-US'
    launchOnStartup?: boolean
  }
}

/** Bridge to the Chrome extension via the native messaging host (CONTRACTS §10). */
export interface ChromeBridge {
  request(action: string, payload?: unknown, timeoutMs?: number): Promise<unknown>
  isConnected(): boolean
}

/** Runtime handle returned by the agent core's createAgentRuntime(). */
export interface AgentRuntime {
  submit(text: string): Promise<void>
  cancel(): void
  resolveApproval(id: string, approved: boolean): void
}
