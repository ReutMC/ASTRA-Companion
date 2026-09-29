/**
 * ASTRA — Companion mode (?mode=companion).
 * Transparent frameless orb: draggable backdrop, interactive glass panel on
 * click/wake, live controls (opacity/size/lock/click-through) and voice input.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Astronaut, { ASTRA_STATES } from '../astronaut/Astronaut'
import { getAstra, isMock } from '../lib/astra'
import { useAstra } from '../lib/useAstra'
import { isPersian } from '../lib/text'
import { playWakeChime } from '../lib/chime'
import { createSTT, type STTHandle } from '../voice/stt'
import { speak, stopSpeaking } from '../voice/tts'
import type { DeepPartial, Settings } from '../lib/types'

export default function CompanionMode() {
  const store = useAstra()
  const { settings, state, statusLabel } = store
  const [panelOpen, setPanelOpen] = useState(false)
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const sttRef = useRef<STTHandle | null>(null)
  const hoverRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const language = settings.general?.language ?? 'fa-IR'
  const faLabels = language === 'fa-IR'
  const locked = settings.companion.locked
  const stateMeta = ASTRA_STATES[state]

  /* wake event from the global shortcut → expand panel + chime */
  useEffect(() => {
    return store.onWake(() => {
      setPanelOpen(true)
      store.wake()
      playWakeChime()
      window.setTimeout(() => inputRef.current?.focus(), 120)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* click-through coordination: report interactive hover state to main */
  useEffect(() => {
    const api = getAstra()
    return () => {
      api.hoverInteractive(false)
    }
  }, [])

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    const interactive = target.closest('[data-interactive]') !== null
    if (interactive !== hoverRef.current) {
      hoverRef.current = interactive
      getAstra().hoverInteractive(interactive)
    }
  }, [])

  /* stop mic + TTS on unmount */
  useEffect(
    () => () => {
      sttRef.current?.stop()
      stopSpeaking()
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
      setVoiceError(
        settings.stt.type === 'whisper-http'
          ? 'ضبط صدا در این محیط پشتیبانی نمی‌شود'
          : 'Web Speech API پشتیبانی نمی‌شود — Whisper HTTP را در تنظیمات فعال کنید',
      )
      return
    }
    const handle = stt.start({
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        store.submit(text)
        setInput('')
      },
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
    setPanelOpen(true)
  }, [input, store])

  const patchCompanion = useCallback(
    (patch: DeepPartial<Settings['companion']>) => {
      void store.setSettings({ companion: patch })
    },
    [store],
  )

  const rtl = (text: string): { dir: 'rtl' | 'ltr'; className: string } =>
    isPersian(text) ? { dir: 'rtl', className: 'rtl' } : { dir: 'ltr', className: '' }

  const lastMsg = store.lastAssistantMessage
  const lastMsgDir = lastMsg ? rtl(lastMsg) : { dir: 'ltr' as const, className: '' }

  return (
    <div
      className={`companion-root ${locked ? '' : 'draggable'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (hoverRef.current) {
          hoverRef.current = false
          getAstra().hoverInteractive(false)
        }
      }}
    >
      <div className="companion-backdrop" />

      <div className="companion-status" data-interactive>
        <span
          className={`status-dot ${state === 'listening' || state === 'thinking' || state === 'searching' || state === 'working' ? 'pulse' : ''}`}
          style={{ ['--dot' as never]: stateMeta.color }}
        />
        <span dir={faLabels ? 'rtl' : 'ltr'}>
          {faLabels ? stateMeta.labelFa : stateMeta.labelEn}
          {statusLabel && state !== 'idle' && state !== 'sleeping' ? ` · ${statusLabel}` : ''}
        </span>
      </div>

      <div className="companion-controls" data-interactive>
        <button
          type="button"
          className={`icon-btn ${panelOpen ? 'active' : ''}`}
          title={faLabels ? 'گفتگو' : 'Chat'}
          onClick={() => setPanelOpen((v) => !v)}
        >
          💬
        </button>
        <button
          type="button"
          className="icon-btn"
          title={faLabels ? 'پنجره اصلی' : 'Open app'}
          onClick={() => void getAstra().setMode('app')}
        >
          ▤
        </button>
        <span className="divider" />
        <div className="ctl-group" title={faLabels ? 'شفافیت' : 'Opacity'}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>◍</span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={settings.companion.opacity}
            onChange={(e) => patchCompanion({ opacity: Number(e.target.value) })}
            aria-label={faLabels ? 'شفافیت' : 'Opacity'}
          />
        </div>
        <div className="ctl-group" title={faLabels ? 'اندازه' : 'Size'}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>⤢</span>
          <input
            type="range"
            min={240}
            max={520}
            step={10}
            value={settings.companion.size}
            onChange={(e) => patchCompanion({ size: Number(e.target.value) })}
            aria-label={faLabels ? 'اندازه' : 'Size'}
          />
        </div>
        <span className="divider" />
        <button
          type="button"
          className={`icon-btn ${settings.companion.locked ? 'active' : ''}`}
          title={faLabels ? (locked ? 'باز کردن جابه‌جایی' : 'قفل موقعیت') : locked ? 'Unlock position' : 'Lock position'}
          onClick={() => patchCompanion({ locked: !locked })}
        >
          {locked ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          className={`icon-btn ${settings.companion.clickThrough ? 'active' : ''}`}
          title={faLabels ? 'عبور کلیک' : 'Click-through'}
          onClick={() => patchCompanion({ clickThrough: !settings.companion.clickThrough })}
        >
          ⇢
        </button>
        <button
          type="button"
          className="icon-btn"
          title={faLabels ? 'مخفی (تری)' : 'Hide to tray'}
          onClick={() => void getAstra().windowOp('hide')}
        >
          ✕
        </button>
      </div>

      <div
        className="companion-astronaut"
        data-interactive
        onClick={() => {
          store.wake()
          setPanelOpen((v) => !v)
        }}
      >
        <Astronaut
          state={state}
          size={Math.round(settings.companion.size * 0.6)}
          interactive
          onClick={() => undefined}
          title={faLabels ? `ASTRA — ${stateMeta.labelFa}` : `ASTRA — ${stateMeta.labelEn}`}
        />
      </div>

      {panelOpen && (
        <div className="companion-panel" data-interactive>
          <p className={`last-msg ${lastMsg ? '' : 'empty'} ${lastMsgDir.className}`} dir={lastMsgDir.dir}>
            {lastMsg ||
              (faLabels ? 'روی فضانورد بزنید یا Ctrl+Space را فشار دهید…' : 'Click the astronaut or press Ctrl+Space…')}
          </p>
          <div className="input-row">
            <button
              type="button"
              className={`mini-btn ${listening ? 'listening' : ''}`}
              title={faLabels ? 'گفتار' : 'Voice input'}
              onClick={toggleMic}
            >
              {listening ? '◉' : '🎙'}
            </button>
            <input
              ref={inputRef}
              value={input}
              dir={input && isPersian(input) ? 'rtl' : 'auto'}
              placeholder={faLabels ? 'بپرس…' : 'Ask anything…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              aria-label={faLabels ? 'پیام' : 'Message'}
            />
            <button type="button" className="mini-btn send" title={faLabels ? 'ارسال' : 'Send'} onClick={send}>
              ➤
            </button>
          </div>
          <p className="interim">
            {voiceError
              ? voiceError
              : interim
                ? interim
                : listening
                  ? faLabels
                    ? 'در حال شنیدن…'
                    : 'Listening…'
                  : ''}
          </p>
        </div>
      )}

      <div className="companion-footer">
        <span>{isMock() ? 'MOCK · vite dev' : 'ASTRA v1.0.0'}</span>
        <span>·</span>
        <kbd style={{ fontFamily: 'var(--mono)', border: '1px solid var(--border)', padding: '0 5px', borderRadius: 4 }}>
          Ctrl+Space
        </kbd>
      </div>
    </div>
  )
}
