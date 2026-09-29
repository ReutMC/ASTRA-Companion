/**
 * ASTRA — App mode (?mode=app).
 * Full control-panel window: custom titlebar, conversation + composer,
 * astronaut stage with status ring, and a tabbed side panel
 * (Sources / Activity / Browser / Approvals). Settings dialog included.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Astronaut, { ASTRA_STATES } from '../astronaut/Astronaut'
import { getAstra, isMock } from '../lib/astra'
import { useAstra, type FeedItem } from '../lib/useAstra'
import { formatTime, isPersian } from '../lib/text'
import { playWakeChime } from '../lib/chime'
import { createSTT, type STTHandle } from '../voice/stt'
import { speak, stopSpeaking } from '../voice/tts'
import SettingsDialog from '../components/SettingsDialog'
import type { DeepPartial, Settings } from '../lib/types'

const EXAMPLE_PROMPTS = [
  'آخرین اخبار فضا رو خلاصه کن',
  'یک فایل یادداشت در Documents/ASTRA بساز',
  'تب فعال کروم رو بخون و خلاصه کن',
]

/* ------------------------------------------------------------------ */
/* Persisted last-run record — session restore (showcase parity).      */
/* The last COMPLETED command survives reloads; cancelled/error runs    */
/* are never recorded. Mirrors the showcase's LastRunChip.              */
/* ------------------------------------------------------------------ */
interface LastRunRecord {
  text: string
  at: number
}

const LAST_RUN_KEY = 'astra-desktop-last-run'

function loadLastRun(): LastRunRecord | null {
  try {
    const raw = localStorage.getItem(LAST_RUN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<LastRunRecord>
    if (typeof v.text !== 'string' || v.text.length === 0 || typeof v.at !== 'number') return null
    return { text: v.text, at: v.at }
  } catch {
    return null
  }
}

const TOOL_ICONS: Record<string, string> = {
  web_search: '⌕',
  read_page: '▤',
  browser_context: '◈',
  browser_elements: '⁙',
  browser_act: '➤',
  browser_screenshot: '◉',
  write_file: '✎',
  list_astra_files: '≡',
  open_app: '▸',
  open_path: '↗',
  create_folder: '⊕',
  copy_to_clipboard: '⧉',
  remember: '★',
  recall: '☆',
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === 'user' || item.kind === 'assistant') {
    const persian = isPersian(item.content)
    return (
      <div className={`bubble ${item.kind} ${persian ? 'rtl' : ''}`} dir={persian ? 'rtl' : 'ltr'}>
        {item.content}
        <span className="ts">{formatTime(item.ts)}</span>
      </div>
    )
  }
  if (item.kind === 'tool') {
    const icon = TOOL_ICONS[item.name] ?? '⚙'
    return (
      <div className="tool-row">
        <span className={`tool-icon ${item.ok === false ? 'bad' : ''}`}>{item.ok === false ? '✕' : icon}</span>
        <span className="tool-name">{item.name}</span>
        <span className="tool-summary" dir={isPersian(item.argsSummary) ? 'rtl' : 'ltr'}>{item.argsSummary}</span>
        {item.resultSummary && <span className="tool-result">{item.resultSummary}</span>}
      </div>
    )
  }
  return (
    <div className="activity-row" dir={isPersian(item.text) ? 'rtl' : 'ltr'}>
      <span>{item.text}</span>
    </div>
  )
}

export default function AppMode() {
  const store = useAstra()
  const { settings, state, statusLabel } = store
  const [tab, setTab] = useState<'sources' | 'activity' | 'browser' | 'approvals'>('sources')
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [soundOn, setSoundOn] = useState(true)
  /* session-restore chip + source cross-highlight (showcase parity) */
  const [lastRun, setLastRun] = useState<LastRunRecord | null>(loadLastRun)
  const [hoverSource, setHoverSource] = useState<number | null>(null)
  const sttRef = useRef<STTHandle | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const spokenRef = useRef('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stateMeta = ASTRA_STATES[state]

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  /* auto-scroll the feed */
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [store.feed])

  /* record the last completed command when the agent reports done —
     the successRef guard limits recording to once per success episode */
  const successSeenRef = useRef(false)
  useEffect(() => {
    if (store.state !== 'success') {
      successSeenRef.current = false
      return
    }
    if (successSeenRef.current) return
    successSeenRef.current = true
    for (let i = store.feed.length - 1; i >= 0; i -= 1) {
      const item = store.feed[i]
      if (item.kind !== 'user') continue
      const record: LastRunRecord = { text: item.content, at: Date.now() }
      setLastRun((prev) => (prev && prev.text === record.text && Date.now() - prev.at < 60_000 ? prev : record))
      try {
        localStorage.setItem(LAST_RUN_KEY, JSON.stringify(record))
      } catch {
        /* private mode — chip still shows for this session */
      }
      break
    }
  }, [store.state, store.feed])

  /* speak assistant replies with the configured TTS engine */
  useEffect(() => {
    if (!soundOn || !store.lastAssistantMessage) return
    if (spokenRef.current === store.lastAssistantMessage) return
    spokenRef.current = store.lastAssistantMessage
    store.setVoiceState('speaking')
    speak(store.lastAssistantMessage, settings.tts)
      .catch(() => undefined)
      .finally(() => store.setVoiceState(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.lastAssistantMessage, soundOn])

  useEffect(
    () => () => {
      sttRef.current?.stop()
      stopSpeaking()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const toggleMic = useCallback(() => {
    setVoiceError('')
    if (listening) {
      sttRef.current?.stop()
      return
    }
    const stt = createSTT(settings.stt)
    if (!stt.isSupported()) {
      setVoiceError('تشخیص گفتار پشتیبانی نمی‌شود — Whisper HTTP را در تنظیمات فعال کنید')
      return
    }
    const handle = stt.start({
      onInterim: (text) => setInterim(text),
      onFinal: (text) => store.submit(text),
      onError: (message) => setVoiceError(message),
      onEnd: () => {
        setListening(false)
        setInterim('')
        store.setVoiceState(null)
        sttRef.current = null
      },
    })
    if (handle) {
      sttRef.current = handle
      setListening(true)
      store.setVoiceState('listening')
    }
  }, [listening, settings.stt, store])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text) return
    store.submit(text)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, store])

  const saveSettings = useCallback(
    async (patch: DeepPartial<Settings>) => {
      await store.setSettings(patch)
      showToast('تنظیمات ذخیره شد · Settings saved')
    },
    [store, showToast],
  )

  const busy = state === 'listening' || state === 'thinking' || state === 'searching' || state === 'working' || state === 'speaking'

  const rerunLast = useCallback(() => {
    if (store.busy || !lastRun) return
    store.submit(lastRun.text)
  }, [store, lastRun])

  const dismissLastRun = useCallback(() => {
    setLastRun(null)
    try {
      localStorage.removeItem(LAST_RUN_KEY)
    } catch {
      /* nothing to clean up */
    }
  }, [])

  return (
    <div className="app-root">
      {/* ------------------------------------------------------ titlebar */}
      <header className="titlebar">
        <div className="brand">
          <span className="logo" aria-hidden />
          <span>ASTRA</span>
          <span className="tag">{isMock() ? 'DEV' : 'v1.0.0'}</span>
        </div>
        <span className="status-chip no-drag" title={statusLabel}>
          <span
            className={`status-dot ${busy ? 'pulse' : ''}`}
            style={{ ['--dot' as never]: stateMeta.color }}
          />
          {stateMeta.labelEn} · {stateMeta.labelFa}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className={`icon-btn no-drag ${soundOn ? 'active' : ''}`}
          title={soundOn ? 'صدا روشن' : 'صدا خاموش'}
          onClick={() => {
            if (soundOn) stopSpeaking()
            setSoundOn((v) => !v)
          }}
        >
          {soundOn ? '♪' : '✖♪'}
        </button>
        <button type="button" className="icon-btn no-drag" title="Settings · تنظیمات" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
        <div className="window-controls no-drag">
          <button type="button" className="win-btn" title="Minimize" onClick={() => void getAstra().windowOp('minimize')}>
            ─
          </button>
          <button type="button" className="win-btn" title="Maximize" onClick={() => void getAstra().windowOp('maximize')}>
            ▢
          </button>
          <button type="button" className="win-btn close" title="Close" onClick={() => void getAstra().windowOp('close')}>
            ✕
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------ app body */}
      <div className="app-body">
        {/* conversation */}
        <section className="col panel">
          <div className="col-head">
            Conversation · گفتگو
            {store.feed.length > 0 && <span className="count">{store.feed.length}</span>}
          </div>
          <div className="feed" ref={feedRef}>
            {store.feed.length === 0 && (
              <div className="empty-hint">
                سلام! من ASTRA هستم 🚀
                <br />
                بپرس تا جستجو کنم، فایل بسازم یا مرورگرت را کنترل کنم.
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {EXAMPLE_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="btn"
                      style={{ justifyContent: 'center', fontSize: 12 }}
                      onClick={() => {
                        store.submit(prompt)
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {store.feed.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </div>
          <div className="composer">
            <div className="input-row">
              <button
                type="button"
                className={`mic-btn ${listening ? 'listening' : ''}`}
                title={listening ? 'توقف میکروفون' : 'ورودی صوتی'}
                onClick={toggleMic}
              >
                {listening ? '◉' : '🎙'}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                placeholder="از ASTRA بپرس… (Enter = ارسال · Shift+Enter = خط جدید)"
                rows={1}
                dir={input && isPersian(input) ? 'rtl' : 'auto'}
                onChange={(e) => {
                  setInput(e.target.value)
                  const el = e.target
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 130)}px`
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <button type="button" className="send-btn" title="Send" disabled={!input.trim()} onClick={send}>
                ➤
              </button>
            </div>
            <div className="hints">
              <span>
                <kbd>Ctrl</kbd>+<kbd>Space</kbd> بیدار‌سازی سراسری
              </span>
              {voiceError && <span style={{ color: 'var(--err)' }}>{voiceError}</span>}
              {interim && !voiceError && (
                <span style={{ color: 'var(--accent)' }} dir={isPersian(interim) ? 'rtl' : 'ltr'}>
                  {interim}
                </span>
              )}
            </div>
            {lastRun && (
              <div className="last-run">
                <span className="last-run-icon" aria-hidden>
                  ↺
                </span>
                <button
                  type="button"
                  className="last-run-btn"
                  onClick={rerunLast}
                  disabled={store.busy}
                  title={`اجرای دوباره: ${lastRun.text}`}
                  aria-label="اجرای دوباره‌ی آخرین دستور"
                >
                  <span className="last-run-label">آخرین دستور:</span>
                  <span className="last-run-text" dir={isPersian(lastRun.text) ? 'rtl' : 'ltr'}>
                    {lastRun.text}
                  </span>
                  <span className="last-run-time">{formatTime(lastRun.at)}</span>
                </button>
                <button
                  type="button"
                  className="last-run-x"
                  onClick={dismissLastRun}
                  aria-label="حذف یادگار آخرین دستور"
                  title="حذف از نوار آخرین دستور"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </section>

        {/* stage */}
        <section className="col stage stage-col">
          <div className="glow" aria-hidden />
          <div
            className="ring"
            aria-hidden
            style={{ ['--ring-color' as never]: `${stateMeta.color}66` }}
          />
          <div className="mock-banner">{isMock() ? 'MOCK BRIDGE — demo events' : ''}</div>
          <div className="astronaut-holder">
            <Astronaut state={state} size={Math.round(settings.companion.size * 0.55)} interactive={false} />
          </div>
          <div className="stage-label" dir={isPersian(statusLabel) || !statusLabel ? 'rtl' : 'ltr'}>
            {statusLabel || stateMeta.labelFa}
          </div>
          <div className="stage-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                store.wake()
                playWakeChime()
              }}
            >
              🔔 بیدار
            </button>
            <button type="button" className="btn" onClick={() => store.sleep()}>
              🌙 خواب
            </button>
            {store.busy && (
              <button type="button" className="btn danger" onClick={() => store.cancel()}>
                ✕ توقف
              </button>
            )}
          </div>
        </section>

        {/* side tabs */}
        <section className="col panel">
          <div className="tabs">
            <div className="tab-bar" role="tablist">
              {(
                [
                  ['sources', 'Sources', store.sources.length],
                  ['activity', 'Activity', 0],
                  ['browser', 'Browser', 0],
                  ['approvals', 'Approvals', store.approvals.length],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`tab-btn ${tab === id ? 'active' : ''}`}
                  onClick={() => setTab(id)}
                >
                  {count > 0 && <span className="badge">{count}</span>}
                  {label}
                </button>
              ))}
            </div>

            <div className="tab-body" role="tabpanel">
              {tab === 'sources' && (
                <>
                  {store.sources.length === 0 && (
                    <div className="empty-hint">
                      منابع وب اینجا ظاهر می‌شوند
                      <br />
                      Web sources from searches appear here.
                    </div>
                  )}
                  {store.sources.map((source, idx) => (
                    <button
                      key={source.url}
                      type="button"
                      className={`source-card ${
                        hoverSource === idx ? 'hl-active' : hoverSource !== null ? 'hl-dim' : ''
                      }`}
                      onMouseEnter={() => setHoverSource(idx)}
                      onMouseLeave={() => setHoverSource(null)}
                      onFocus={() => setHoverSource(idx)}
                      onBlur={() => setHoverSource(null)}
                      onClick={() => void getAstra().openExternal(source.url)}
                      title="Open in browser"
                    >
                      <span className="source-title">{source.title}</span>
                      <span className="source-url">{source.url}</span>
                      {source.snippet && <span className="source-snippet">{source.snippet}</span>}
                    </button>
                  ))}
                </>
              )}

              {tab === 'activity' && (
                <>
                  {store.feed.filter((item) => item.kind === 'activity' || item.kind === 'tool').length === 0 && (
                    <div className="empty-hint">گزارش فعالیت‌ها خالی است.</div>
                  )}
                  {store.feed
                    .filter((item) => item.kind === 'activity' || item.kind === 'tool')
                    .map((item) => (
                      <div className="log-line" key={item.id}>
                        <span className="ts">{formatTime(item.ts)}</span>
                        <span dir={isPersian(item.kind === 'activity' ? item.text : item.argsSummary) ? 'rtl' : 'ltr'}>
                          {item.kind === 'activity' ? item.text : `${item.name} → ${item.argsSummary}`}
                        </span>
                      </div>
                    ))}
                </>
              )}

              {tab === 'browser' && (
                <>
                  <div className="browser-card">
                    <div className="row">
                      <span
                        className={`status-dot ${store.browserConnected ? '' : 'pulse'}`}
                        style={{ ['--dot' as never]: store.browserConnected ? 'var(--ok)' : 'var(--err)' }}
                      />
                      <strong>{store.browserConnected ? 'Chrome متصل است' : 'Chrome متصل نیست'}</strong>
                    </div>
                    <div className="sub">
                      {store.browserConnected
                        ? 'پل native messaging فعال است؛ ASTRA می‌تواند تب‌ها را بخواند و عمل کند.'
                        : 'برای اتصال، افزونه کروم را نصب و Native Host را ثبت کن:'}
                    </div>
                    {!store.browserConnected && (
                      <code>
                        powershell -ExecutionPolicy Bypass -File
                        "&lt;install-dir&gt;\resources\native-host\install-host.ps1"
                      </code>
                    )}
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="label">AI Cursor · نشانگر هوشمند</div>
                      <div className="hint">نمایش مکان‌نمای متحرک هنگام عمل در کروم</div>
                    </div>
                    <button
                      type="button"
                      className={`switch ${settings.browser.aiCursor ? 'on' : ''}`}
                      onClick={() => {
                        void store.setSettings({ browser: { aiCursor: !settings.browser.aiCursor } })
                        showToast(settings.browser.aiCursor ? 'AI Cursor خاموش شد' : 'AI Cursor روشن شد')
                      }}
                      aria-label="AI cursor"
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <div className="label">Confirm actions · تایید عملیات</div>
                      <div className="hint">پرسش قبل از کلیک/تایپ/ناوبری در کروم</div>
                    </div>
                    <button
                      type="button"
                      className={`switch ${settings.browser.confirmActions ? 'on' : ''}`}
                      onClick={() => void store.setSettings({ browser: { confirmActions: !settings.browser.confirmActions } })}
                      aria-label="Confirm actions"
                    />
                  </div>
                </>
              )}

              {tab === 'approvals' && (
                <>
                  {store.approvals.length === 0 && (
                    <div className="empty-hint">
                      درخواست تاییدی در صف نیست
                      <br />
                      Pending approvals appear here.
                    </div>
                  )}
                  {store.approvals.map((card) => (
                    <div className="approval-card" key={card.id}>
                      <div className="title">⚠ {card.title}</div>
                      <div className="detail" dir={isPersian(card.detail) ? 'rtl' : 'ltr'}>{card.detail}</div>
                      <div className="actions">
                        <button type="button" className="btn primary" onClick={() => store.resolveApproval(card.id, true)}>
                          ✓ تایید
                        </button>
                        <button type="button" className="btn danger" onClick={() => store.resolveApproval(card.id, false)}>
                          ✕ رد
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onToast={showToast}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
