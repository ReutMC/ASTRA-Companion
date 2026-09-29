/**
 * The ASTRA agent loop.
 *
 * `createAgentRuntime` wires: settings → AI provider → tool registry → memory,
 * and exposes `submit` / `cancel` / `resolveApproval` for the Electron desktop shell.
 * Every user-visible step is emitted as an {@link AgentEvent} (fa-IR friendly labels).
 */
import { randomUUID } from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  AgentEvent,
  AgentRuntime,
  AiMessage,
  AIProvider,
  AstraState,
  ChatResponse,
  CreateAgentRuntimeOptions,
  MemoryStore,
  Source,
  ToolContext,
  ToolRegistry,
} from './types'
import { createAIProvider } from './providers/ai/factory'
import { createToolRegistry } from './toolRegistry'
import { createMemoryStore } from './memory/memory'
import { buildSystemPrompt } from './prompts'

const MAX_ITERATIONS = 8
const MAX_HISTORY = 40
const MAX_TOOL_DATA_CHARS = 4000
const MAX_ARGS_SUMMARY_CHARS = 120
const MAX_SOURCES = 12
const APPROVAL_TIMEOUT_MS = 120_000

/** Tools whose execution flips the UI state to `searching`. */
const WEB_TOOLS = new Set(['web_search', 'web_search_tavily', 'read_page'])

function statusEvent(state: AstraState, label: string): AgentEvent {
  return { type: 'status', state, label }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Appends the Settings → AI hint unless the message already contains one. */
function withHint(msg: string): string {
  if (/Settings|تنظیمات/i.test(msg)) return msg
  return `${msg} — تنظیمات هوش مصنوعی را بررسی کنید / check Settings → AI`
}

function argsSummary(args: unknown): string {
  try {
    const s = JSON.stringify(args ?? {})
    return s.length > MAX_ARGS_SUMMARY_CHARS ? `${s.slice(0, MAX_ARGS_SUMMARY_CHARS)}…` : s
  } catch {
    return '{}'
  }
}

/** Serializes tool result data for the model, truncating oversized payloads. */
function truncateForModel(data: unknown, max = MAX_TOOL_DATA_CHARS): string | null {
  if (data === undefined || data === null) return null
  try {
    const s = JSON.stringify(data)
    if (s === undefined) return null
    return s.length > max ? `${s.slice(0, max)}…[truncated]` : s
  } catch {
    return String(data).slice(0, max)
  }
}

/** Extracts unique markdown links `[title](http…)` from an assistant message. */
export function extractSources(text: string): Source[] {
  const out: Source[] = []
  const seen = new Set<string>()
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null && out.length < MAX_SOURCES) {
    const url = m[2]
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ title: m[1].trim(), url })
  }
  return out
}

/**
 * Creates the ASTRA agent runtime.
 *
 * Notes for the desktop integrator:
 * - Pass a **stable** `chromeBridge` object — its `connected()` is re-checked per tool call.
 * - Mutating the passed `settings` object between submits is supported (the AI provider
 *   is rebuilt whenever `settings.ai` JSON changes).
 * - Approvals can be resolved either through `runtime.resolveApproval(id, ok)` or through
 *   the `opts.confirm` callback — whichever answers first wins; silence after 120 s denies.
 */
export function createAgentRuntime(opts: CreateAgentRuntimeOptions): AgentRuntime {
  const settings = opts.settings
  const emit = opts.emit
  const homeDir = opts.homeDir ?? os.homedir()
  const userDataDir = opts.userDataDir ?? path.join(os.homedir(), '.astra')

  const registry: ToolRegistry = createToolRegistry()
  const memory: MemoryStore = createMemoryStore(userDataDir, settings.memory?.enabled === true)
  const history: AiMessage[] = []
  const pendingApprovals = new Map<string, (ok: boolean) => void>()

  let busy = false
  let doneEmitted = false
  let current: AbortController | null = null
  let provider: AIProvider | null = null
  let providerKey = ''

  /** Rebuilds the provider when the settings.ai JSON changes between submits. */
  function getProvider(): AIProvider {
    const key = JSON.stringify(settings.ai ?? {})
    if (!provider || key !== providerKey) {
      provider = createAIProvider(settings.ai)
      providerKey = key
    }
    return provider
  }

  function pushHistory(msg: AiMessage): void {
    history.push(msg)
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
    // A trimmed history must never start with an orphan tool result.
    while (history.length > 0 && history[0].role === 'tool') history.shift()
  }

  /** Emits `done` once per submit, then returns the UI to idle. */
  function finish(): void {
    if (doneEmitted) return
    doneEmitted = true
    emit({ type: 'done' })
    emit(statusEvent('idle', 'آماده / Ready'))
  }

  /**
   * Confirmation gate shared by all tools: emits `approval_request` with a fresh id and
   * races (1) `runtime.resolveApproval`, (2) the desktop-provided `opts.confirm`,
   * (3) a 120 s timeout that denies by default.
   */
  async function confirmImpl(title: string, detail: string): Promise<boolean> {
    const id = randomUUID()
    emit({ type: 'approval_request', id, title, detail })
    const viaRuntime = new Promise<boolean>((resolve) => pendingApprovals.set(id, resolve))
    const viaDesktop = opts.confirm(title, detail).catch(() => false)
    const viaTimeout = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), APPROVAL_TIMEOUT_MS)
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) timer.unref()
    })
    let approved = false
    try {
      approved = await Promise.race([viaRuntime, viaDesktop, viaTimeout])
    } catch {
      approved = false
    }
    pendingApprovals.delete(id)
    return approved
  }

  const ctx: ToolContext = {
    emit,
    confirm: confirmImpl,
    chrome: opts.chromeBridge,
    settings,
    memory,
    homeDir,
  }

  /** One full agent turn: think → (tool loop) → answer. */
  async function runTurn(userText: string): Promise<void> {
    emit(statusEvent('thinking', 'درک درخواست… / Understanding…'))
    emit({ type: 'activity', text: 'درک درخواست… / Understanding the request…' })

    // Local memory: recall relevant past notes, then store the new user text.
    let memoryNotes: string | null = null
    if (settings.memory?.enabled === true) {
      try {
        const hits = memory.search(userText, 3)
        memory.add({ text: userText, kind: 'user' })
        if (hits.length > 0) memoryNotes = hits.map((h) => `- ${h.text}`).join('\n')
      } catch {
        /* memory is best-effort */
      }
    }

    pushHistory({ role: 'user', content: userText })

    const messages: AiMessage[] = [
      { role: 'system', content: buildSystemPrompt(new Date(), settings.stt?.language) },
    ]
    if (memoryNotes) messages.push({ role: 'system', content: `Memory notes:\n${memoryNotes}` })
    messages.push(...history)

    let agent: AIProvider
    try {
      agent = getProvider()
    } catch (err) {
      emit({ type: 'error', message: errMessage(err) })
      emit(statusEvent('error', 'خطا / Error'))
      return
    }

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const controller = new AbortController()
      current = controller
      let response: ChatResponse
      try {
        response = await agent.chat(messages, registry.schemas(), {
          temperature: settings.ai?.temperature,
          maxTokens: settings.ai?.maxTokens,
          signal: controller.signal,
        })
      } catch (err) {
        current = null
        if (controller.signal.aborted) {
          emit({ type: 'activity', text: 'لغو شد / Cancelled' })
          emit(statusEvent('idle', 'متوقف شد / Stopped'))
          return
        }
        emit({ type: 'error', message: withHint(errMessage(err)) })
        emit(statusEvent('error', 'خطا / Error'))
        return
      }
      current = null

      const assistant: AiMessage = response.toolCalls.length
        ? { role: 'assistant', content: response.content, tool_calls: response.toolCalls }
        : { role: 'assistant', content: response.content }
      pushHistory(assistant)
      messages.push(assistant)

      // ---- tool-calling round ----
      if (response.toolCalls.length > 0) {
        const web = response.toolCalls.some((c) => WEB_TOOLS.has(c.function.name))
        emit(statusEvent(web ? 'searching' : 'working', web ? 'در حال جست‌وجو… / Searching…' : 'در حال اجرا… / Working…'))
        for (const call of response.toolCalls) {
          const name = call.function.name
          let args: unknown = {}
          try {
            args = call.function.arguments ? (JSON.parse(call.function.arguments) as unknown) : {}
          } catch {
            args = {}
          }
          emit({ type: 'tool', name, argsSummary: argsSummary(args) })
          const result = await registry.run(name, args, ctx)
          emit({ type: 'tool', name, argsSummary: argsSummary(args), resultSummary: result.summary, ok: result.ok })
          const payload = { ok: result.ok, summary: result.summary, data: truncateForModel(result.data) }
          const toolMsg: AiMessage = {
            role: 'tool',
            content: JSON.stringify(payload),
            name,
            tool_call_id: call.id,
          }
          pushHistory(toolMsg)
          messages.push(toolMsg)
        }
        continue // next model round with the tool results
      }

      // ---- final answer ----
      if (response.content && response.content.trim().length > 0) {
        emit({ type: 'message', role: 'assistant', content: response.content })
        const sources = extractSources(response.content)
        if (sources.length > 0) emit({ type: 'sources', sources })
        emit(statusEvent('success', 'پاسخ آماده شد / Answer ready'))
        emit(statusEvent('speaking', 'پاسخ آماده پخش است — پخش صوتی توسط رابط کاربری مدیریت می‌شود / Ready for speech — playback is paced by the UI'))
        return
      }

      emit({
        type: 'error',
        message: 'مدل پاسخ خالی برگرداند — دوباره تلاش کنید یا مدل را در Settings → AI عوض کنید / The model returned an empty response — try again or switch models in Settings → AI',
      })
      emit(statusEvent('error', 'خطا / Error'))
      return
    }

    emit({
      type: 'error',
      message: `به حداکثر ${MAX_ITERATIONS} گام رسیدم — درخواست را ساده‌تر کنید / Reached the maximum of ${MAX_ITERATIONS} tool steps — try a simpler request`,
    })
    emit(statusEvent('error', 'توقف / Stopped'))
  }

  return {
    async submit(text: string): Promise<void> {
      const userText = (text ?? '').trim()
      if (!userText) {
        emit({ type: 'error', message: 'پیام خالی است / Empty message' })
        return
      }
      if (busy) {
        emit({ type: 'error', message: 'ASTRA در حال کار است — لطفاً پاسخ قبلی تمام شود / ASTRA is busy — please wait for the current answer' })
        return
      }
      busy = true
      doneEmitted = false
      try {
        await runTurn(userText)
      } catch (err) {
        emit({ type: 'error', message: withHint(errMessage(err)) })
        emit(statusEvent('error', 'خطا / Error'))
      } finally {
        busy = false
        finish()
      }
    },

    cancel(): void {
      if (current) {
        current.abort()
        current = null
      }
      emit(statusEvent('idle', 'متوقف شد / Stopped'))
    },

    resolveApproval(id: string, approved: boolean): void {
      const resolve = pendingApprovals.get(id)
      if (resolve) {
        pendingApprovals.delete(id)
        resolve(approved)
      }
    },
  }
}
