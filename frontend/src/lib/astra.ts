/**
 * ASTRA renderer — `window.astra` accessor.
 * Returns the Electron preload bridge when running inside the desktop shell,
 * otherwise a self-contained mock that emits demo agent events so the UI can
 * be developed with plain `vite dev` in a browser.
 */
import type {
  AgentEvent,
  AstraApi,
  DeepPartial,
  MemoryExport,
  Mode,
  Permission,
  Settings,
  SourceItem,
  WindowOp,
} from './types'
import { DEFAULT_SETTINGS } from './defaults'

type Listener<T> = (payload: T) => void

function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.astra !== 'undefined'
}

/* ------------------------------------------------------------------ mock ---- */

const MOCK_DEMO_EVENTS: Array<[number, AgentEvent]> = [
  [0, { type: 'status', state: 'thinking', label: 'در حال فکر کردن…' }],
  [500, { type: 'activity', text: 'درک درخواست کاربر' }],
  [1000, { type: 'tool', name: 'web_search', argsSummary: '«تلسکوپ جیمز وب»', ok: true }],
  [1700, {
    type: 'sources',
    sources: [
      { title: 'NASA Webb Telescope', url: 'https://webbtelescope.org', snippet: 'Latest discoveries from the James Webb Space Telescope.' },
      { title: 'ویکی‌پدیا — تلسکوپ جیمز وب', url: 'https://fa.wikipedia.org/wiki/جیمز_وب', snippet: 'تلسکوپ فضایی جیمز وب بزرگ‌ترین تلسکوپ فضایی است.' },
    ] as SourceItem[],
  }],
  [1900, { type: 'status', state: 'searching', label: 'در حال جستجو…' }],
  [2600, { type: 'tool', name: 'read_page', argsSummary: 'webbtelescope.org', resultSummary: '۳،۲۰۰ کلمه خوانده شد', ok: true }],
  [3300, {
    type: 'message',
    role: 'assistant',
    content:
      'تلسکوپ فضایی جیمز وب قوی‌ترین تلسکوپ فضایی پرتاب‌شده تاکنون است؛ با آینه‌ای ۶.۵ متری که نور مادون قرمز را از دورترین کهکشان‌ها جمع می‌کند. 🚀',
  }],
  [3400, { type: 'status', state: 'speaking', label: 'در حال صحبت…' }],
  [4100, { type: 'done' }],
]

class MockAstra implements AstraApi {
  private settings: Settings = DEFAULT_SETTINGS
  private agentListeners = new Set<Listener<AgentEvent>>()
  private settingsListeners = new Set<Listener<Settings>>()
  private statusListeners = new Set<Listener<{ connected: boolean }>>()
  private modeListeners = new Set<Listener<Mode>>()
  private wakeListeners = new Set<() => void>()
  private timers: ReturnType<typeof setTimeout>[] = []
  private connected = false

  constructor() {
    try {
      const raw = localStorage.getItem('astra.mock.settings')
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
    } catch {
      // first run — keep defaults
    }
    setTimeout(() => {
      this.connected = true
      this.statusListeners.forEach((cb) => cb({ connected: true }))
    }, 1500)
  }

  private persist(): void {
    try {
      localStorage.setItem('astra.mock.settings', JSON.stringify(this.settings))
    } catch {
      // storage unavailable — in-memory only
    }
  }

  private emit(event: AgentEvent): void {
    this.agentListeners.forEach((cb) => cb(event))
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  async submit(text: string): Promise<unknown> {
    this.clearTimers()
    this.emit({ type: 'status', state: 'thinking', label: 'در حال فکر کردن…' })
    for (const [delay, event] of MOCK_DEMO_EVENTS) {
      this.timers.push(
        setTimeout(() => {
          const payload: AgentEvent =
            event.type === 'status' && event.state === 'thinking'
              ? { ...event, label: `«${text.slice(0, 24)}» — در حال فکر کردن…` }
              : event
          this.emit(payload)
        }, delay),
      )
    }
    return { ok: true }
  }

  async cancel(): Promise<unknown> {
    this.clearTimers()
    this.emit({ type: 'status', state: 'idle', label: 'آماده' })
    return { ok: true }
  }

  async resolveApproval(): Promise<unknown> {
    return { ok: true }
  }

  async getSettings(): Promise<Settings> {
    return structuredClone(this.settings)
  }

  async setSettings(patch: DeepPartial<Settings>): Promise<Settings> {
    this.settings = deepMergeMock(this.settings, patch)
    this.persist()
    const snapshot = structuredClone(this.settings)
    this.settingsListeners.forEach((cb) => cb(snapshot))
    return snapshot
  }

  async setPermissions(patch: Partial<Record<Permission, boolean>>): Promise<Settings> {
    return this.setSettings({ permissions: patch } as DeepPartial<Settings>)
  }

  async clearMemory(): Promise<unknown> {
    return { ok: true }
  }

  async exportMemory(): Promise<MemoryExport> {
    return {
      path: '(mock) memory.json',
      exists: true,
      content: JSON.stringify({ items: [], exportedAt: new Date().toISOString() }, null, 2),
    }
  }

  async setCompanion(patch: DeepPartial<Settings['companion']>): Promise<Settings> {
    return this.setSettings({ companion: patch } as DeepPartial<Settings>)
  }

  async setMode(_mode: Mode): Promise<unknown> {
    return { ok: true }
  }

  hoverInteractive(_interactive: boolean): void {
    // no click-through in a plain browser
  }

  async browserStatus(): Promise<{ connected: boolean }> {
    return { connected: this.connected }
  }

  async openExternal(url: string): Promise<unknown> {
    window.open(url, '_blank', 'noopener')
    return { ok: true }
  }

  async windowOp(op: WindowOp): Promise<unknown> {
    console.info('[astra mock] windowOp', op)
    return { ok: true }
  }

  async speak(_text: string): Promise<void> {
    // renderer-side TTS handles this directly
  }

  async whisper(): Promise<{ text: string }> {
    await new Promise((r) => setTimeout(r, 800))
    return { text: '(mock) این یک پیام آزمایشی تبدیل گفتار به متن است.' }
  }

  onAgentEvent(cb: Listener<AgentEvent>): () => void {
    this.agentListeners.add(cb)
    return () => this.agentListeners.delete(cb)
  }

  onSettingsChanged(cb: Listener<Settings>): () => void {
    this.settingsListeners.add(cb)
    return () => this.settingsListeners.delete(cb)
  }

  onBrowserStatus(cb: Listener<{ connected: boolean }>): () => void {
    this.statusListeners.add(cb)
    cb({ connected: this.connected })
    return () => this.statusListeners.delete(cb)
  }

  onMode(cb: Listener<Mode>): () => void {
    this.modeListeners.add(cb)
    return () => this.modeListeners.delete(cb)
  }

  onWake(cb: () => void): () => void {
    this.wakeListeners.add(cb)
    return () => this.wakeListeners.delete(cb)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMergeMock<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) return patch as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMergeMock(current, value as DeepPartial<typeof current>)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as T
}

/* ----------------------------------------------------------------- export --- */

let real: AstraApi | null = null
let mock: MockAstra | null = null

/** Returns the live bridge, or the browser-dev mock singleton. */
export function getAstra(): AstraApi {
  if (isElectron()) {
    real ??= window.astra as AstraApi
    return real
  }
  mock ??= new MockAstra()
  return mock
}

export function isMock(): boolean {
  return !isElectron()
}
