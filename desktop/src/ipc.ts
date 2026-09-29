/**
 * ASTRA desktop — IPC wiring (CONTRACTS §9).
 * Every renderer→main channel is implemented here; agent events flow
 * main→renderer as `astra:agent:event`. The agent runtime is created lazily
 * on first submit and rebuilt whenever settings.ai changes.
 */
import { app, ipcMain, shell } from 'electron'
import * as fs from 'node:fs'
// Bundled by esbuild straight from the agent core TypeScript sources.
import { createAgentRuntime } from '../../agent/src/index'
import * as windows from './windows'
import { getMemoryPath, getUserDir, loadSettings, saveSettings } from './config'
import type { NativeBridge } from './nativeBridge'
import type { ShortcutsHandle } from './shortcuts'
import type { AgentEvent, AgentRuntime, Settings } from './types'

interface IpcDeps {
  bridge: NativeBridge
  shortcuts: ShortcutsHandle
}

let runtime: AgentRuntime | null = null
let runtimeFingerprint = ''
/**
 * Resolvers for the desktop-side half of agent confirmations. The agent core
 * emits the `approval_request` event itself; our `confirm` callback just
 * waits for the renderer's answer (or for runtime.resolveApproval) without
 * emitting a duplicate card.
 */
const confirmWaiters: Array<{ resolve: (approved: boolean) => void; timer: NodeJS.Timeout }> = []

function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function emitEvent(event: AgentEvent): void {
  windows.broadcast('astra:agent:event', event)
}

function ensureRuntime(deps: IpcDeps): AgentRuntime {
  const settings = loadSettings()
  const fingerprint = JSON.stringify(settings.ai)
  if (runtime && fingerprint === runtimeFingerprint) return runtime

  try {
    runtime?.cancel()
  } catch {
    // previous runtime may already be dead
  }
  flushConfirmWaiters(false)

  runtime = createAgentRuntime({
    settings,
    // Adapter: the agent core polls `connected()`; the bridge exposes isConnected().
    chromeBridge: {
      connected: () => deps.bridge.isConnected(),
      request: (action: string, payload?: unknown, timeoutMs?: number) =>
        deps.bridge.request(action, payload, timeoutMs),
    },
    emit: emitEvent,
    confirm: () =>
      new Promise<boolean>((resolve) => {
        // Safety net: the agent core denies unanswered approvals after 120 s;
        // this slightly later timer guarantees our promise never leaks.
        const timer = setTimeout(() => {
          const index = confirmWaiters.findIndex((w) => w.resolve === resolve)
          if (index >= 0) confirmWaiters.splice(index, 1)
          resolve(false)
        }, 125_000)
        timer.unref?.()
        confirmWaiters.push({ resolve, timer })
      }),
    // memory.json lives next to settings.json in userData
    userDataDir: getUserDir(),
  })
  runtimeFingerprint = fingerprint
  return runtime
}

function flushConfirmWaiters(approved: boolean): void {
  const waiters = confirmWaiters.splice(0, confirmWaiters.length)
  for (const waiter of waiters) {
    clearTimeout(waiter.timer)
    waiter.resolve(approved)
  }
}

function applyLoginItem(settings: Settings): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.general?.launchOnStartup),
      args: ['--hidden'],
    })
  } catch (err) {
    console.error('[astra] failed to apply launch-on-startup:', err)
  }
}

/** Send the AI-cursor visibility to the extension (best effort). */
function syncCursor(bridge: NativeBridge, visible: boolean): void {
  void bridge.request('set_cursor', { visible }).catch(() => {})
}

export function registerIpc(deps: IpcDeps): void {
  // ---------------------------------------------------------------- agent --
  ipcMain.handle('astra:agent:submit', (_event, args: { text?: string } | undefined) => {
    const text = String(args?.text ?? '').trim()
    if (!text) return { ok: false, error: 'Empty message' }
    try {
      const rt = ensureRuntime(deps)
      void Promise.resolve(rt.submit(text)).catch((err: unknown) => {
        emitEvent({ type: 'error', message: errText(err) })
      })
      return { ok: true }
    } catch (err) {
      emitEvent({ type: 'error', message: errText(err) })
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('astra:agent:cancel', () => {
    flushConfirmWaiters(false)
    try {
      runtime?.cancel()
    } catch (err) {
      console.error('[astra] agent cancel failed:', err)
    }
    return { ok: true }
  })

  ipcMain.handle(
    'astra:approval:resolve',
    (_event, args: { id?: string; approved?: boolean } | undefined) => {
      const id = String(args?.id ?? '')
      const approved = Boolean(args?.approved)
      // Approval ids come from the agent runtime's approval_request events.
      try {
        runtime?.resolveApproval(id, approved)
      } catch (err) {
        console.error('[astra] approval resolve failed:', err)
      }
      // Release any desktop-side confirm() promises waiting on this answer.
      flushConfirmWaiters(approved)
      return { ok: true }
    },
  )

  // -------------------------------------------------------------- settings --
  ipcMain.handle('astra:settings:get', () => loadSettings())

  ipcMain.handle('astra:settings:set', (_event, patch: unknown) => {
    const prev = loadSettings()
    const next = saveSettings(patch ?? {})
    windows.applyCompanionSettings(next)
    if (prev.shortcuts.toggle !== next.shortcuts.toggle) {
      deps.shortcuts.reregister(next)
    }
    if (prev.browser.aiCursor !== next.browser.aiCursor) {
      syncCursor(deps.bridge, next.browser.aiCursor)
    }
    // Permission changes are re-evaluated lazily by the session handler on
    // the next request; nothing else to apply here.
    applyLoginItem(next)
    windows.broadcast('astra:settings:changed', next)
    return next
  })

  ipcMain.handle('astra:permissions:set', (_event, patch: unknown) => {
    const next = saveSettings({ permissions: patch ?? {} })
    windows.broadcast('astra:settings:changed', next)
    return next
  })

  // ---------------------------------------------------------------- memory --
  ipcMain.handle('astra:memory:clear', () => {
    try {
      fs.rmSync(getMemoryPath(), { force: true })
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
    return { ok: true }
  })

  ipcMain.handle('astra:memory:export', () => {
    const memoryFile = getMemoryPath()
    let content = ''
    let exists = false
    try {
      content = fs.readFileSync(memoryFile, 'utf8')
      exists = true
    } catch {
      content = JSON.stringify({ items: [], exportedAt: new Date().toISOString() }, null, 2)
    }
    return { path: memoryFile, exists, content }
  })

  // ------------------------------------------------------------- companion --
  ipcMain.handle('astra:companion:set', (_event, patch: unknown) => {
    const next = saveSettings({ companion: patch ?? {} })
    windows.applyCompanionSettings(next)
    windows.broadcast('astra:settings:changed', next)
    return next
  })

  ipcMain.handle('astra:companion:mode', (_event, args: { mode?: string } | undefined) => {
    const mode = args?.mode === 'app' ? 'app' : 'companion'
    windows.showWindow(mode)
    return { ok: true }
  })

  // Click-through coordination: renderer reports pointer-over-UI state.
  ipcMain.on('astra:companion:hoverInteractive', (_event, interactive: unknown) => {
    windows.setCompanionHoverInteractive(Boolean(interactive))
  })

  // --------------------------------------------------------------- browser --
  ipcMain.handle('astra:browser:status', () => ({ connected: deps.bridge.isConnected() }))

  // ----------------------------------------------------------------- shell --
  ipcMain.handle('astra:shell:openExternal', (_event, args: { url?: string } | undefined) => {
    const url = String(args?.url ?? '')
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Only http(s) URLs may be opened externally' }
    }
    void shell.openExternal(url).catch((err) => {
      console.error('[astra] openExternal failed:', err)
    })
    return { ok: true }
  })

  // ---------------------------------------------------------------- window --
  ipcMain.handle('astra:window', (_event, args: { op?: string } | undefined) => {
    windows.windowOp(String(args?.op ?? 'hide'))
    return { ok: true }
  })

  // ------------------------------------------------------------ whisper stt --
  // Speech-to-text via an OpenAI-compatible /audio/transcriptions endpoint.
  // Runs in the main process (Node fetch + FormData + Blob).
  ipcMain.handle('astra:stt:whisper', async (_event, args: { base64?: string } | undefined) => {
    const base64 = String(args?.base64 ?? '')
    if (!base64) throw new Error('No audio payload')
    const settings = loadSettings()
    const stt = settings.stt
    if (stt.type !== 'whisper-http' || !stt.endpoint) {
      throw new Error('Whisper HTTP STT is not configured (see Settings → Voice)')
    }
    const endpoint = `${stt.endpoint.replace(/\/+$/, '')}/audio/transcriptions`
    const model = stt.model || 'whisper-large-v3'
    const audio = Buffer.from(base64, 'base64')

    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audio)]), 'audio.webm')
    form.append('model', model)
    form.append('response_format', 'json')
    if (stt.language) {
      form.append('language', stt.language.split('-')[0])
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: stt.apiKey ? { Authorization: `Bearer ${stt.apiKey}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      throw new Error(`Whisper STT failed: HTTP ${res.status}`)
    }
    const data = (await res.json()) as { text?: string }
    return { text: data.text ?? '' }
  })

  // NOTE: `astra:tts:speak` is intentionally NOT implemented in main —
  // text-to-speech runs entirely in the renderer (frontend/src/voice/tts.ts).
}
