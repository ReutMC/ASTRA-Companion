/**
 * ASTRA — Settings dialog (full app window).
 * Sections: General / AI / Voice / Browser / Permissions / Companion /
 * Memory / Shortcuts / About. Everything is staged in a local draft and
 * applied on Save via setSettings (main deep-merges + broadcasts).
 */
import { useMemo, useState } from 'react'
import { getAstra } from '../lib/astra'
import { PERMISSION_LABELS } from '../lib/defaults'
import type { DeepPartial, Permission, Settings } from '../lib/types'

interface Props {
  settings: Settings
  onSave: (patch: DeepPartial<Settings>) => Promise<void>
  onClose: () => void
  onToast: (message: string) => void
}

type SectionId =
  | 'general'
  | 'ai'
  | 'voice'
  | 'browser'
  | 'permissions'
  | 'companion'
  | 'memory'
  | 'shortcuts'
  | 'about'

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'ai', label: 'AI' },
  { id: 'voice', label: 'Voice' },
  { id: 'browser', label: 'Browser' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'companion', label: 'Companion' },
  { id: 'memory', label: 'Memory' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export default function SettingsDialog({ settings, onSave, onClose, onToast }: Props) {
  const [draft, setDraft] = useState<Settings>(() => clone(settings))
  const [section, setSection] = useState<SectionId>('general')
  const [saving, setSaving] = useState(false)

  const perms = useMemo(
    () => Object.keys(PERMISSION_LABELS) as Permission[],
    [],
  )

  const update = (fn: (draft: Settings) => void): void => {
    setDraft((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft)
      onToast('Settings saved · تنظیمات ذخیره شد')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const clearMemory = async (): Promise<void> => {
    if (!window.confirm('Clear all stored memory? · حذف حافظه؟')) return
    await getAstra().clearMemory()
    onToast('Memory cleared · حافظه پاک شد')
  }

  const exportMemory = async (): Promise<void> => {
    const result = await getAstra().exportMemory()
    const blob = new Blob([result.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'astra-memory.json'
    link.click()
    URL.revokeObjectURL(url)
    onToast('Memory exported · خروجی گرفته شد')
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog glass-strong">
        <div className="dialog-head">
          <span
            aria-hidden
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              display: 'inline-block',
              background: 'radial-gradient(circle at 34% 30%, #eafcff 0%, #67e8f9 34%, #0e7490 78%)',
              boxShadow: '0 0 12px rgba(103, 232, 249, 0.55)',
            }}
          />
          <h2>Settings · تنظیمات</h2>
          <span style={{ flex: 1 }} />
          <button type="button" className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="dialog-body">
          <nav className="settings-nav">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? 'active' : ''}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === 'general' && (
              <div className="settings-section">
                <h3>General · عمومی</h3>
                <p className="desc">Language, launch behavior and window defaults.</p>
                <div className="group field">
                  <label htmlFor="set-lang">Language / زبان</label>
                  <select
                    id="set-lang"
                    className="select"
                    value={draft.general?.language ?? 'fa-IR'}
                    onChange={(e) => update((d) => { d.general = { ...d.general, language: e.target.value as 'fa-IR' | 'en-US' } })}
                  >
                    <option value="fa-IR">فارسی (fa-IR)</option>
                    <option value="en-US">English (en-US)</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <div className="label">Launch at startup · اجرای خودکار</div>
                    <div className="hint">Start ASTRA when Windows boots</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.general?.launchOnStartup ? 'on' : ''}`}
                    onClick={() => update((d) => { d.general = { ...d.general, launchOnStartup: !d.general?.launchOnStartup } })}
                    aria-label="Launch at startup"
                  />
                </div>
              </div>
            )}

            {section === 'ai' && (
              <div className="settings-section">
                <h3>AI Provider · هوش مصنوعی</h3>
                <p className="desc">OpenAI-compatible endpoints (Groq, OpenAI, OpenRouter…) or Gemini.</p>
                <div className="group field">
                  <label htmlFor="ai-type">Provider type</label>
                  <select
                    id="ai-type"
                    className="select"
                    value={draft.ai.type}
                    onChange={(e) => update((d) => { d.ai.type = e.target.value as Settings['ai']['type'] })}
                  >
                    <option value="openai-compatible">OpenAI-compatible</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ai-endpoint">Endpoint / Base URL</label>
                  <input
                    id="ai-endpoint"
                    className="text-input"
                    dir="ltr"
                    value={draft.ai.endpoint}
                    onChange={(e) => update((d) => { d.ai.endpoint = e.target.value })}
                    placeholder="https://api.groq.com/openai/v1"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-key">API key</label>
                  <input
                    id="ai-key"
                    className="text-input"
                    type="password"
                    dir="ltr"
                    autoComplete="off"
                    value={draft.ai.apiKey}
                    onChange={(e) => update((d) => { d.ai.apiKey = e.target.value })}
                    placeholder="gsk_…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-model">Model</label>
                  <input
                    id="ai-model"
                    className="text-input"
                    dir="ltr"
                    value={draft.ai.model}
                    onChange={(e) => update((d) => { d.ai.model = e.target.value })}
                    placeholder="llama-3.3-70b-versatile"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ai-temp">Temperature</label>
                  <div className="field-inline">
                    <input
                      id="ai-temp"
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={draft.ai.temperature ?? 0.4}
                      onChange={(e) => update((d) => { d.ai.temperature = Number(e.target.value) })}
                    />
                    <span className="value">{(draft.ai.temperature ?? 0.4).toFixed(2)}</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="ai-tokens">Max tokens</label>
                  <input
                    id="ai-tokens"
                    className="text-input"
                    dir="ltr"
                    type="number"
                    min={256}
                    max={32768}
                    value={draft.ai.maxTokens ?? 2048}
                    onChange={(e) => update((d) => { d.ai.maxTokens = Number(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {section === 'voice' && (
              <div className="settings-section">
                <h3>Voice · صدا</h3>
                <p className="desc">Speech-to-text and text-to-speech engines.</p>
                <div className="group field">
                  <label htmlFor="stt-type">STT engine</label>
                  <select
                    id="stt-type"
                    className="select"
                    value={draft.stt.type}
                    onChange={(e) => update((d) => { d.stt.type = e.target.value as Settings['stt']['type'] })}
                  >
                    <option value="webspeech">Web Speech (built-in)</option>
                    <option value="whisper-http">Whisper (HTTP)</option>
                  </select>
                </div>
                {draft.stt.type === 'whisper-http' && (
                  <>
                    <div className="field">
                      <label htmlFor="stt-endpoint">Whisper endpoint</label>
                      <input
                        id="stt-endpoint"
                        className="text-input"
                        dir="ltr"
                        value={draft.stt.endpoint ?? ''}
                        onChange={(e) => update((d) => { d.stt.endpoint = e.target.value })}
                        placeholder="https://api.groq.com/openai/v1"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="stt-key">Whisper API key</label>
                      <input
                        id="stt-key"
                        className="text-input"
                        type="password"
                        dir="ltr"
                        autoComplete="off"
                        value={draft.stt.apiKey ?? ''}
                        onChange={(e) => update((d) => { d.stt.apiKey = e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="stt-model">Whisper model</label>
                      <input
                        id="stt-model"
                        className="text-input"
                        dir="ltr"
                        value={draft.stt.model ?? ''}
                        onChange={(e) => update((d) => { d.stt.model = e.target.value })}
                        placeholder="whisper-large-v3"
                      />
                    </div>
                  </>
                )}
                <div className="field">
                  <label htmlFor="stt-lang">STT language</label>
                  <select
                    id="stt-lang"
                    className="select"
                    value={draft.stt.language}
                    onChange={(e) => update((d) => { d.stt.language = e.target.value as 'fa-IR' | 'en-US' })}
                  >
                    <option value="fa-IR">فارسی (fa-IR)</option>
                    <option value="en-US">English (en-US)</option>
                  </select>
                </div>
                <div className="group field">
                  <label htmlFor="tts-type">TTS engine</label>
                  <select
                    id="tts-type"
                    className="select"
                    value={draft.tts.type}
                    onChange={(e) => update((d) => { d.tts.type = e.target.value as Settings['tts']['type'] })}
                  >
                    <option value="webspeech">Web Speech (built-in)</option>
                    <option value="openai-http">OpenAI-compatible (HTTP)</option>
                  </select>
                </div>
                {draft.tts.type === 'openai-http' && (
                  <>
                    <div className="field">
                      <label htmlFor="tts-endpoint">TTS endpoint</label>
                      <input
                        id="tts-endpoint"
                        className="text-input"
                        dir="ltr"
                        value={draft.tts.endpoint ?? ''}
                        onChange={(e) => update((d) => { d.tts.endpoint = e.target.value })}
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="tts-key">TTS API key</label>
                      <input
                        id="tts-key"
                        className="text-input"
                        type="password"
                        dir="ltr"
                        autoComplete="off"
                        value={draft.tts.apiKey ?? ''}
                        onChange={(e) => update((d) => { d.tts.apiKey = e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="tts-voice">Voice</label>
                      <input
                        id="tts-voice"
                        className="text-input"
                        dir="ltr"
                        value={draft.tts.voice ?? ''}
                        onChange={(e) => update((d) => { d.tts.voice = e.target.value })}
                        placeholder="alloy"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {section === 'browser' && (
              <div className="settings-section">
                <h3>Browser · مرورگر</h3>
                <p className="desc">Chrome extension bridge behavior.</p>
                <div className="setting-row">
                  <div>
                    <div className="label">AI Cursor · نشانگر هوشمند</div>
                    <div className="hint">Animated cursor overlay in Chrome while ASTRA acts</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.browser.aiCursor ? 'on' : ''}`}
                    onClick={() => update((d) => { d.browser.aiCursor = !d.browser.aiCursor })}
                    aria-label="AI cursor"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <div className="label">Confirm actions · تایید عملیات</div>
                    <div className="hint">Ask before clicks, typing and navigation in Chrome</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.browser.confirmActions ? 'on' : ''}`}
                    onClick={() => update((d) => { d.browser.confirmActions = !d.browser.confirmActions })}
                    aria-label="Confirm actions"
                  />
                </div>
              </div>
            )}

            {section === 'permissions' && (
              <div className="settings-section">
                <h3>Permissions · دسترسی‌ها</h3>
                <p className="desc">Tool-level capabilities. Network &amp; files are on by default; screen capture stays off.</p>
                {perms.map((permission) => (
                  <div className="setting-row" key={permission}>
                    <div>
                      <div className="label">{PERMISSION_LABELS[permission].fa} — {PERMISSION_LABELS[permission].en}</div>
                      <div className="hint">{PERMISSION_LABELS[permission].hint}</div>
                    </div>
                    <button
                      type="button"
                      className={`switch ${draft.permissions[permission] ? 'on' : ''}`}
                      onClick={() => update((d) => { d.permissions[permission] = !d.permissions[permission] })}
                      aria-label={PERMISSION_LABELS[permission].en}
                    />
                  </div>
                ))}
              </div>
            )}

            {section === 'companion' && (
              <div className="settings-section">
                <h3>Companion · همراه</h3>
                <p className="desc">Orb window behavior. Changes apply on Save.</p>
                <div className="field">
                  <label htmlFor="cp-size">Size ({draft.companion.size}px)</label>
                  <input
                    id="cp-size"
                    type="range"
                    min={240}
                    max={520}
                    step={10}
                    value={draft.companion.size}
                    onChange={(e) => update((d) => { d.companion.size = Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cp-opacity">Opacity ({Math.round(draft.companion.opacity * 100)}%)</label>
                  <input
                    id="cp-opacity"
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={draft.companion.opacity}
                    onChange={(e) => update((d) => { d.companion.opacity = Number(e.target.value) })}
                  />
                </div>
                <div className="setting-row">
                  <div className="label">Always on top · همیشه رو</div>
                  <button
                    type="button"
                    className={`switch ${draft.companion.alwaysOnTop ? 'on' : ''}`}
                    onClick={() => update((d) => { d.companion.alwaysOnTop = !d.companion.alwaysOnTop })}
                    aria-label="Always on top"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <div className="label">Click-through · عبور کلیک</div>
                    <div className="hint">Mouse events pass through empty space</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.companion.clickThrough ? 'on' : ''}`}
                    onClick={() => update((d) => { d.companion.clickThrough = !d.companion.clickThrough })}
                    aria-label="Click through"
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <div className="label">Lock position · قفل موقعیت</div>
                    <div className="hint">Disable dragging the orb window</div>
                  </div>
                  <button
                    type="button"
                    className={`switch ${draft.companion.locked ? 'on' : ''}`}
                    onClick={() => update((d) => { d.companion.locked = !d.companion.locked })}
                    aria-label="Lock position"
                  />
                </div>
              </div>
            )}

            {section === 'memory' && (
              <div className="settings-section">
                <h3>Memory · حافظه</h3>
                <p className="desc">Long-term facts ASTRA remembers between sessions (remember / recall tools).</p>
                <div className="setting-row">
                  <div className="label">Enable memory · فعال‌سازی حافظه</div>
                  <button
                    type="button"
                    className={`switch ${draft.memory.enabled ? 'on' : ''}`}
                    onClick={() => update((d) => { d.memory.enabled = !d.memory.enabled })}
                    aria-label="Enable memory"
                  />
                </div>
                <div className="group" style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn" onClick={() => void exportMemory()}>⇩ Export JSON</button>
                  <button type="button" className="btn danger" onClick={() => void clearMemory()}>✕ Clear memory</button>
                </div>
              </div>
            )}

            {section === 'shortcuts' && (
              <div className="settings-section">
                <h3>Shortcuts · میان‌برها</h3>
                <p className="desc">Global accelerator, works system-wide.</p>
                <div className="field">
                  <label htmlFor="sc-toggle">Wake / toggle companion</label>
                  <input
                    id="sc-toggle"
                    className="text-input"
                    dir="ltr"
                    value={draft.shortcuts.toggle}
                    onChange={(e) => update((d) => { d.shortcuts.toggle = e.target.value })}
                    placeholder="Ctrl+Space"
                  />
                </div>
                <p className="desc" style={{ marginTop: 10 }}>
                  Format examples: <code style={{ fontFamily: 'var(--mono)' }}>Ctrl+Shift+A</code>,{' '}
                  <code style={{ fontFamily: 'var(--mono)' }}>Alt+Space</code>,{' '}
                  <code style={{ fontFamily: 'var(--mono)' }}>CommandOrControl+K</code>
                </p>
              </div>
            )}

            {section === 'about' && (
              <div className="settings-section about-block">
                <div className="brandline">
                  <span className="big-logo" />
                  <div>
                    <div style={{ fontWeight: 700, letterSpacing: 2, color: 'var(--text)' }}>ASTRA</div>
                    <div style={{ fontSize: 11 }}>v1.0.0 — Astronaut AI Desktop Companion</div>
                  </div>
                </div>
                <p>
                  A futuristic astronaut companion for Windows: voice-first AI with web research,
                  sandboxed file tools, Chrome control via native messaging, and an animated SVG character.
                </p>
                <p>
                  License: MIT · Character &amp; UI crafted for the ASTRA project.<br />
                  Built with Electron, React, Vite and an OpenAI-compatible agent core.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="dialog-foot">
          <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Changes are stored in userData/settings.json</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save · ذخیره'}
          </button>
        </div>
      </div>
    </div>
  )
}
