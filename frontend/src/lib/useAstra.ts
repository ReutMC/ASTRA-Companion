/**
 * ASTRA renderer — central React store.
 * Subscribes to every main→renderer stream (agent events, settings, browser
 * status, mode, wake) and owns the AstraState machine:
 *   submit → thinking | status events override | tool → working/searching |
 *   done → success (brief) | error → error (brief) | 90s idle → sleeping.
 * Voice (STT/TTS) overlays its state via setVoiceState().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAstra } from './astra'
import { DEFAULT_SETTINGS } from './defaults'
import { uid } from './text'
import { playErrorTone, playSendBlip, playSuccessBlip } from './chime'
import type { AgentEvent, AstraState, DeepPartial, Mode, Settings, SourceItem } from './types'

export type FeedItem =
  | { id: string; kind: 'user'; content: string; ts: number }
  | { id: string; kind: 'assistant'; content: string; ts: number }
  | { id: string; kind: 'tool'; name: string; argsSummary: string; resultSummary?: string; ok?: boolean; ts: number }
  | { id: string; kind: 'activity'; text: string; ts: number }

export interface ApprovalCard {
  id: string
  title: string
  detail: string
  ts: number
}

const IDLE_SLEEP_MS = 90_000

export interface AstraStore {
  ready: boolean
  settings: Settings
  mode: Mode
  state: AstraState
  statusLabel: string
  feed: FeedItem[]
  sources: SourceItem[]
  approvals: ApprovalCard[]
  browserConnected: boolean
  busy: boolean
  lastAssistantMessage: string
  submit(text: string): void
  cancel(): void
  resolveApproval(id: string, approved: boolean): void
  setSettings(patch: DeepPartial<Settings>): Promise<void>
  wake(): void
  sleep(): void
  setVoiceState(state: AstraState | null): void
  onWake(cb: () => void): () => void
}

export function useAstra(): AstraStore {
  const [ready, setReady] = useState(false)
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof location === 'undefined') return 'app'
    return new URLSearchParams(location.search).get('mode') === 'companion' ? 'companion' : 'app'
  })
  const [agentState, setAgentState] = useState<AstraState>('idle')
  const [statusLabel, setStatusLabel] = useState('آماده')
  const [voiceState, setVoiceState] = useState<AstraState | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [sources, setSources] = useState<SourceItem[]>([])
  const [approvals, setApprovals] = useState<ApprovalCard[]>([])
  const [browserConnected, setBrowserConnected] = useState(false)

  const lastActivityRef = useRef(Date.now())
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  const setTransient = useCallback(
    (state: AstraState, backTo: AstraState, ms: number) => {
      setAgentState(state)
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
      transientTimerRef.current = setTimeout(() => {
        setAgentState((current) => (current === state ? backTo : current))
      }, ms)
    },
    [],
  )

  const pushFeed = useCallback((item: FeedItem) => {
    setFeed((prev) => [...prev.slice(-199), item])
  }, [])

  /* -------------------------------------------------- initial bootstrap -- */
  useEffect(() => {
    const api = getAstra()
    let alive = true
    void api
      .getSettings()
      .then((loaded) => {
        if (!alive) return
        setSettingsState({ ...DEFAULT_SETTINGS, ...loaded })
        setReady(true)
      })
      .catch(() => setReady(true))
    void api.browserStatus().then((status) => {
      if (alive) setBrowserConnected(status.connected)
    }).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  /* ------------------------------------------------------ subscriptions -- */
  useEffect(() => {
    const api = getAstra()
    const offEvent = api.onAgentEvent((event: AgentEvent) => {
      touchActivity()
      switch (event.type) {
        case 'status':
          setAgentState(event.state)
          setStatusLabel(event.label)
          break
        case 'activity':
          pushFeed({ id: uid('act'), kind: 'activity', text: event.text, ts: Date.now() })
          break
        case 'sources':
          setSources((prev) => {
            const merged = [...prev]
            for (const src of event.sources) {
              if (!merged.some((s) => s.url === src.url)) merged.push(src)
            }
            return merged.slice(-60)
          })
          break
        case 'message':
          pushFeed({ id: uid('msg'), kind: 'assistant', content: event.content, ts: Date.now() })
          break
        case 'tool':
          pushFeed({
            id: uid('tool'),
            kind: 'tool',
            name: event.name,
            argsSummary: event.argsSummary,
            resultSummary: event.resultSummary,
            ok: event.ok,
            ts: Date.now(),
          })
          setAgentState(event.name.includes('search') ? 'searching' : 'working')
          break
        case 'approval_request':
          setApprovals((prev) => [
            ...prev,
            { id: event.id, title: event.title, detail: event.detail, ts: Date.now() },
          ])
          break
        case 'error':
          setTransient('error', 'idle', 4000)
          setStatusLabel(event.message)
          playErrorTone()
          break
        case 'done':
          setTransient('success', 'idle', 2500)
          playSuccessBlip()
          break
      }
    })
    const offSettings = api.onSettingsChanged((next) => {
      setSettingsState({ ...DEFAULT_SETTINGS, ...next })
    })
    const offStatus = api.onBrowserStatus((status) => setBrowserConnected(status.connected))
    const offMode = api.onMode((next) => setModeState(next))
    return () => {
      offEvent()
      offSettings()
      offStatus()
      offMode()
    }
  }, [pushFeed, setTransient, touchActivity])

  /* ------------------------------------------------------- sleep timer -- */
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_SLEEP_MS) {
        setAgentState((current) => (current === 'idle' ? 'sleeping' : current))
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(
    () => () => {
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
    },
    [],
  )

  /* ------------------------------------------------------------- actions -- */
  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      touchActivity()
      playSendBlip()
      pushFeed({ id: uid('user'), kind: 'user', content: trimmed, ts: Date.now() })
      setAgentState('thinking')
      setStatusLabel('در حال فکر کردن…')
      void getAstra().submit(trimmed).catch((err: unknown) => {
        setTransient('error', 'idle', 4000)
        setStatusLabel(err instanceof Error ? err.message : 'خطای ارسال')
      })
    },
    [pushFeed, setTransient, touchActivity],
  )

  const cancel = useCallback(() => {
    touchActivity()
    if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
    setAgentState('idle')
    setStatusLabel('متوقف شد')
    void getAstra().cancel().catch(() => undefined)
  }, [touchActivity])

  const resolveApproval = useCallback((id: string, approved: boolean) => {
    touchActivity()
    setApprovals((prev) => prev.filter((card) => card.id !== id))
    void getAstra().resolveApproval(id, approved).catch(() => undefined)
  }, [touchActivity])

  const setSettings = useCallback(async (patch: DeepPartial<Settings>) => {
    const next = await getAstra().setSettings(patch)
    setSettingsState({ ...DEFAULT_SETTINGS, ...next })
  }, [])

  const wake = useCallback(() => {
    touchActivity()
    setAgentState((current) => (current === 'sleeping' ? 'idle' : current))
  }, [touchActivity])

  const sleep = useCallback(() => {
    setAgentState((current) => (current === 'idle' ? 'sleeping' : current))
  }, [])

  const onWake = useCallback((cb: () => void) => getAstra().onWake(cb), [])

  const state: AstraState = voiceState ?? agentState

  const lastAssistantMessage = useMemo(() => {
    for (let i = feed.length - 1; i >= 0; i -= 1) {
      const item = feed[i]
      if (item.kind === 'assistant') return item.content
    }
    return ''
  }, [feed])

  const busy = state === 'thinking' || state === 'searching' || state === 'working'

  return {
    ready,
    settings,
    mode,
    state,
    statusLabel,
    feed,
    sources,
    approvals,
    browserConnected,
    busy,
    lastAssistantMessage,
    submit,
    cancel,
    resolveApproval,
    setSettings,
    wake,
    sleep,
    setVoiceState,
    onWake,
  }
}
