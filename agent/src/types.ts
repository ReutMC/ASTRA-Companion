/**
 * ASTRA agent core — shared type contracts.
 *
 * Mirrors `astra/docs/CONTRACTS.md` §3–§8. Do NOT rename anything here:
 * the Electron desktop shell, the renderer and the tests all depend on these names.
 */

/** §3 — UI + agent shared state machine. */
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

/** A cited or referenced web source. */
export interface Source {
  title: string
  url: string
  snippet?: string
}

/** §4 — Agent → renderer event stream (IPC channel `astra:agent:event`). */
export type AgentEvent =
  | { type: 'status'; state: AstraState; label: string }
  | { type: 'activity'; text: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'message'; role: 'assistant'; content: string }
  | { type: 'tool'; name: string; argsSummary: string; resultSummary?: string; ok?: boolean }
  | { type: 'approval_request'; id: string; title: string; detail: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

/**
 * Bridge to the Chrome extension through the native-messaging host
 * (implemented by `desktop/src/nativeBridge.ts`; `null` when disconnected).
 */
export interface ChromeBridge {
  connected(): boolean
  /** Sends `{ id, action, payload }` and resolves `{ ok, data | error }`. */
  request(action: string, payload?: unknown, timeoutMs?: number): Promise<any>
}

/** A single local-memory entry (file-backed, capped at 200). */
export interface MemoryEntry {
  text: string
  ts: number
  kind?: string
}

/** Persistent local memory used by the `remember` / `recall` tools and the agent loop. */
export interface MemoryStore {
  add(entry: { text: string; kind?: string }): void
  search(query: string, limit?: number): MemoryEntry[]
  all(): MemoryEntry[]
  clear(): void
}

/** §6 — Tool permission gates. */
export type Permission =
  | 'MICROPHONE'
  | 'BROWSER'
  | 'FILES'
  | 'WINDOWS_APPS'
  | 'NETWORK'
  | 'SCREEN_CAPTURE'
  | 'CLIPBOARD'

/** §6 — Uniform tool result. */
export interface ToolResult {
  ok: boolean
  summary: string
  data?: unknown
  sources?: Source[]
}

/** §6 — Tool definition registered in the tool registry. */
export interface ToolDef {
  /** snake_case identifier, e.g. `web_search`. */
  name: string
  /** Shown to the LLM. */
  description: string
  /** Must be enabled in settings before the tool runs. */
  permission: Permission
  /** Asks the user via `ctx.confirm` before executing. */
  requiresConfirm?: boolean
  /** JSON Schema for the tool arguments. */
  parameters: object
  /** `args` is the parsed JSON produced by the model — validation happens inside. */
  execute(args: any, ctx: ToolContext): Promise<ToolResult>
}

/** §5 — Passed to every tool execution. */
export interface ToolContext {
  emit(evt: AgentEvent): void
  /** Routes an `approval_request` to the renderer and resolves with the user's answer. */
  confirm(title: string, detail: string): Promise<boolean>
  /** `null` when the native host is disconnected. */
  chrome: ChromeBridge | null
  settings: Settings
  memory: MemoryStore
  homeDir: string
}

/** §7 — Wire-format chat message (OpenAI-compatible shape). */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: AiToolCall[]
  tool_call_id?: string
  name?: string
}

/** §7 — A tool call produced by the model. */
export interface AiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** §7 — Tool schema handed to the provider. */
export interface AiToolSchema {
  name: string
  description: string
  parameters: object
}

/** §7 — Per-request chat options. */
export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

/** §7 — Provider reply: final text and/or tool calls. */
export interface ChatResponse {
  content: string | null
  toolCalls: AiToolCall[]
}

/** §7 — AI provider abstraction. */
export interface AIProvider {
  id: string
  chat(messages: AiMessage[], tools: AiToolSchema[], opts?: ChatOptions): Promise<ChatResponse>
}

/** §8 — AI provider configuration (stored in settings.json inside userData). */
export interface ProviderConfig {
  type: 'openai-compatible' | 'gemini'
  endpoint: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

/** §8 — Full settings schema. */
export interface Settings {
  ai: ProviderConfig
  stt: { type: 'webspeech' | 'whisper-http'; endpoint?: string; apiKey?: string; model?: string; language: 'fa-IR' | 'en-US' }
  tts: { type: 'webspeech' | 'openai-http'; endpoint?: string; apiKey?: string; model?: string; voice?: string }
  companion: { size: number; opacity: number; alwaysOnTop: boolean; clickThrough: boolean; locked: boolean }
  browser: { aiCursor: boolean; confirmActions: boolean }
  permissions: Record<Permission, boolean>
  memory: { enabled: boolean }
  shortcuts: { toggle: string }
}

/** Speech-to-text provider (server-side; Web Speech runs in the renderer instead). */
export interface STTProvider {
  id: string
  transcribe(audio: { base64: string; mimeType?: string }, opts?: { language?: string; signal?: AbortSignal }): Promise<string>
}

/** Text-to-speech provider (server-side; Web Speech runs in the renderer instead). */
export interface TTSProvider {
  id: string
  synthesize(text: string, opts?: { voice?: string; signal?: AbortSignal }): Promise<Uint8Array>
}

/** §6 — Tool registry. */
export interface ToolRegistry {
  register(tool: ToolDef): void
  list(): ToolDef[]
  get(name: string): ToolDef | undefined
  /** OpenAI function-calling format: `{ type: 'function', function: schema }`. */
  schemas(): AiToolSchema[]
  hasPermission(name: string, permissions: Record<Permission, boolean>): boolean
  run(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>
}

/** Options for {@link createAgentRuntime}. */
export interface CreateAgentRuntimeOptions {
  settings: Settings
  chromeBridge: ChromeBridge
  emit: (e: AgentEvent) => void
  confirm: (title: string, detail: string) => Promise<boolean>
  homeDir?: string
  userDataDir?: string
}

/** Agent runtime handle used by the desktop shell. */
export interface AgentRuntime {
  /** Runs a full agent turn; emits events through `opts.emit`. Rejects only on unexpected internal failures. */
  submit(text: string): Promise<void>
  /** Aborts the in-flight model request (if any) and returns the UI to idle. */
  cancel(): void
  /** Resolves a pending `approval_request` emitted by this runtime. */
  resolveApproval(id: string, approved: boolean): void
}

/** Factory signature for {@link createAgentRuntime}. */
export type CreateAgentRuntime = (opts: CreateAgentRuntimeOptions) => AgentRuntime
