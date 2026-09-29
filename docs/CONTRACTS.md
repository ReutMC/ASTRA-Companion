# ASTRA — Engineering Contracts (MUST FOLLOW)

All ASTRA sub-teams build against this document. Do not rename anything here without updating this file.

## 1. Repository layout

```
astra/
├── package.json              # root orchestration scripts (npm --prefix)
├── tsconfig.base.json
├── LICENSE                   # MIT
├── README.md                 # full build/install instructions
├── desktop/                  # Electron main process + preload
│   ├── package.json          # deps: electron, electron-builder, esbuild, ws
│   ├── electron-builder.yml
│   └── src/  main.ts preload.ts windows.ts tray.ts shortcuts.ts ipc.ts config.ts nativeBridge.ts permissions.ts
├── frontend/                 # Electron renderer (Vite + React, TypeScript)
│   ├── package.json  vite.config.ts  index.html
│   └── src/  App.tsx main.tsx astronaut/Astronaut.tsx  modes/ components/ voice/ lib/
├── agent/                    # agent core (pure TypeScript, zero runtime deps, Node 20 global fetch)
│   ├── package.json  tsconfig.json
│   └── src/  index.ts types.ts agent.ts toolRegistry.ts prompts.ts
│             providers/ai/{openaiCompatible.ts,gemini.ts,factory.ts}
│             tools/{webSearch.ts,pageRead.ts,filesystem.ts,windowsApps.ts,chrome.ts,clipboard.ts}
│             memory/{memory.ts}  settings/{defaults.ts}
├── browser-extension/        # Chrome MV3 extension
│   ├── manifest.json  background.js  content.js  cursor.css  popup.html  popup.js  icons/
├── native-host/
│   ├── host.js  host.bat  com.astra.host.json (template)  install-host.ps1  install-host.bat  uninstall-host.bat
├── installer/installer.nsh   # NSIS custom macros (native host registration)
├── assets/icons/             # astra.png (512) — electron-builder converts to ICO
├── tests/                    # vitest unit tests (path sandbox, allowlist, search parser)
├── docs/ (CONTRACTS.md, INSTALL-EXTENSION.md, ARCHITECTURE.md)
└── .github/workflows/build-windows.yml
```

## 2. Versions

Electron `^31`, electron-builder `^25`, Vite `^5`, React `^18` (frontend), TypeScript `^5.5`, esbuild `^0.23`, ws `^8.18`, vitest `^2`. Node >= 20. Agent core has **zero** runtime npm dependencies (uses global `fetch`).

## 3. AstraState (UI + agent share)

`'idle' | 'listening' | 'thinking' | 'searching' | 'working' | 'speaking' | 'success' | 'error' | 'sleeping'`

## 4. Agent event stream (agent → main → renderer IPC `astra:agent:event`)

```ts
type AgentEvent =
  | { type: 'status';   state: AstraState; label: string }            // human-readable, fa-IR friendly
  | { type: 'activity'; text: string }                                // one human-readable step
  | { type: 'sources';  sources: { title: string; url: string; snippet?: string }[] }
  | { type: 'message';  role: 'assistant'; content: string }
  | { type: 'tool';     name: string; argsSummary: string; resultSummary?: string; ok?: boolean }
  | { type: 'approval_request'; id: string; title: string; detail: string }
  | { type: 'error';    message: string }
  | { type: 'done' }
```

Renderer → main: `astra:agent:submit { text }`, `astra:agent:cancel`, `astra:approval:resolve { id, approved }`.

## 5. AgentContext (passed to every tool execute)

```ts
interface ToolContext {
  emit(evt: AgentEvent): void
  confirm(title: string, detail: string): Promise<boolean>   // routes approval_request → renderer
  chrome: ChromeBridge | null                                 // null when native host disconnected
  settings: Settings
  memory: MemoryStore
  homeDir: string                                             // os.homedir()
}
```

## 6. Tool definition + registry

```ts
interface ToolResult { ok: boolean; summary: string; data?: unknown; sources?: Source[] }
interface ToolDef {
  name: string                      // snake_case, e.g. web_search
  description: string               // shown to the LLM
  permission: Permission            // must be enabled in settings
  requiresConfirm?: boolean         // asks user via ctx.confirm before executing
  parameters: object                // JSON Schema
  execute(args: any, ctx: ToolContext): Promise<ToolResult>
}
type Permission = 'MICROPHONE'|'BROWSER'|'FILES'|'WINDOWS_APPS'|'NETWORK'|'SCREEN_CAPTURE'|'CLIPBOARD'
```

Registry: `createToolRegistry(): ToolRegistry` with `list()`, `get(name)`, `schemas()` (OpenAI format), `hasPermission(name, permissions)`.

Required tools: `web_search`, `read_page`, `browser_context`, `browser_elements`, `browser_act`, `browser_screenshot`, `write_file`, `list_astra_files`, `open_app`, `open_path`, `create_folder`, `copy_to_clipboard`, `remember`, `recall`.

## 7. AI provider abstraction

```ts
interface AiMessage { role: 'system'|'user'|'assistant'|'tool'; content: string|null; tool_calls?: AiToolCall[]; tool_call_id?: string; name?: string }
interface AiToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
interface AiToolSchema { name: string; description: string; parameters: object }
interface ChatOptions { temperature?: number; maxTokens?: number; signal?: AbortSignal }
interface ChatResponse { content: string | null; toolCalls: AiToolCall[] }
interface AIProvider { id: string; chat(messages: AiMessage[], tools: AiToolSchema[], opts?: ChatOptions): Promise<ChatResponse> }
```

Implementations: `OpenAICompatibleProvider` (covers OpenAI/Groq/OpenRouter/custom baseURL), `GeminiProvider`. Factory: `createAIProvider(settings.ai)`.

## 8. Settings schema (stored in `app.getPath('userData')/settings.json`)

```ts
interface ProviderConfig { type: 'openai-compatible'|'gemini'; endpoint: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }
interface Settings {
  ai: ProviderConfig
  stt: { type: 'webspeech'|'whisper-http'; endpoint?: string; apiKey?: string; model?: string; language: 'fa-IR'|'en-US' }
  tts: { type: 'webspeech'|'openai-http'; endpoint?: string; apiKey?: string; model?: string; voice?: string }
  companion: { size: number; opacity: number; alwaysOnTop: boolean; clickThrough: boolean; locked: boolean }
  browser: { aiCursor: boolean; confirmActions: boolean }
  permissions: Record<Permission, boolean>   // NETWORK & FILES true by default; SCREEN_CAPTURE false
  memory: { enabled: boolean }
  shortcuts: { toggle: string }              // default 'Ctrl+Space'
}
```

## 9. IPC channels (preload contextBridge exposes `window.astra`)

Renderer→main (invoke): `astra:agent:submit`, `astra:agent:cancel`, `astra:approval:resolve`, `astra:settings:get`, `astra:settings:set`, `astra:permissions:set`, `astra:memory:clear`, `astra:memory:export`, `astra:companion:set { alwaysOnTop?, clickThrough?, opacity?, locked?, size? }`, `astra:companion:mode { mode: 'companion'|'app' }`, `astra:browser:status`, `astra:shell:openExternal { url }`, `astra:window { op: 'minimize'|'close'|'hide' }`, `astra:tts:speak { text }`, `astra:stt:whisper { base64 }`.
Main→renderer (send): `astra:agent:event`, `astra:settings:changed`, `astra:browser:status`, `astra:companion:mode`.

Preload API shape (`window.astra`): every invoke channel becomes a method `submit(text)`, `cancel()`, `resolveApproval(id, ok)`, `getSettings()`, `setSettings(patch)`, `setPermissions(patch)`, `clearMemory()`, `exportMemory()`, `setCompanion(patch)`, `setMode(mode)`, `browserStatus()`, `openExternal(url)`, `windowOp(op)`, `speak(text)`, `whisper(base64)`, plus `onAgentEvent(cb)`, `onSettingsChanged(cb)`, `onBrowserStatus(cb)`, `onMode(cb)`.

## 10. Native messaging bridge

- Name: `com.astra.host`. Chrome spawns `native-host/host.bat` → `node host.js`.
- host.js reads `%APPDATA%\ASTRA\native\port.json` = `{ "port": 8765, "token": "<32hex>" }` written by the desktop app at startup (userData dir = `%APPDATA%\ASTRA`).
- host.js connects to `ws://127.0.0.1:<port>/?token=<token>` and bridges Chrome native-messaging (4-byte LE length-prefixed JSON on stdio) to the WebSocket.
- Desktop side (`desktop/src/nativeBridge.ts`): ws server on 127.0.0.1, token auth, one native client; IPC event `astra:browser:status { connected: boolean }`.
- App↔extension request/response envelope: `{ id, action, payload }` → `{ id, ok, data | error }`.
- Actions: `ping`, `get_context`, `get_elements`, `element_at {x,y}`, `act { kind: 'click'|'type'|'scroll'|'navigate'|'key'|'select'|'hover', ... }`, `screenshot { format?: 'png' }`, `set_cursor { visible: boolean }`.
- Element registry format (content script): `{ id, role, text, ariaLabel, x, y, w, h, tag, placeholder, value }`.

## 11. Security rules

- Never execute arbitrary shell commands from the model. Windows app launching uses a fixed allowlist (chrome, code, notepad, explorer, calc, mspaint — no terminals).
- File writes sandboxed to `Documents/ASTRA/{Generated,Research,Exports}`; validate resolved path startsWith root + extension allowlist (txt,md,json,csv,html,css,js,py) + 2 MB cap.
- `open_path` limited to user profile subpaths, never `Windows/`, `System32/`, `Program Files*`.
- API keys only in settings.json (userData), never hard-coded, never sent to the LLM (system prompt must instruct model to never request secrets).
- Context isolation on, nodeIntegration off, sandbox true for renderer, preload only via contextBridge.

## 12. Renderer modes

One Vite app; `?mode=companion` → frameless transparent companion (astronaut + compact orb UI + status + input popover on click); `?mode=app` (default) → full window: left chat/activity, center astronaut, right sources/approvals; settings dialog; companion controls (opacity slider, click-through, lock, size). Both modes use the shared `Astronaut.tsx` unchanged.

## 13. Showcase (Next.js, task 2-a)

Route `/` only. Dark space theme, cyan accent family (no indigo/purple). Interactive simulated demo of the 4 modes + the Persian scenarios. Uses `src/components/astra/Astronaut.tsx` (verbatim copy). Sticky footer (`min-h-screen flex flex-col` + footer `mt-auto`).
