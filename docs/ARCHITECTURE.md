# ASTRA Architecture

## Process & windows

```
main.ts ── (--astra-native-host ? nativehost.ts stdio bridge : desktop app)
desktop app:
  ├── CompanionWindow  transparent / frameless / always-on-top / click-through option
  ├── FullWindow       frameless console with custom titlebar
  ├── Tray             show/hide, companion toggle, AI cursor toggle, settings, restart, exit
  └── GlobalShortcut   Ctrl+Space wake → LISTENING
```

## Agent loop (main process)

```
user text
   ▼
system prompt (tools + permissions + memory + language rule)
   ▼  ┌────────────────────────────────────────────┐
      │  LLM → STRICT JSON                         │
      │  {"thought","action":{"tool","args"}}      │
      │  {"thought","answer"}                      │
      ▼  └────────────────────────────────────────────┘
tool registry lookup → permission check → run tool
   ▼
OBSERVATION appended → loop (max N steps)
   ▼
final answer → history/memory → TTS → chat event
```

The planner protocol is plain JSON so **any** chat provider works
(OpenAI-compatible, Groq, OpenRouter, Gemini via its REST API).

## Tools (whitelist)

| Tool | Permission |
| --- | --- |
| web_search, web_read | NETWORK |
| browser_navigate / elements / find / click / type / extract / scroll, ai_cursor_move | BROWSER |
| open_app, show_downloads, open_folder | WINDOWS_APPS |
| clipboard_write | CLIPBOARD |
| generate_file, find_file, open_file, create_folder, list_dir | FILES |

No tool can spawn arbitrary processes or run shell commands from the model.

## Browser bridge

```
ASTRA main ── localhost TCP (127.0.0.1:39001, token auth, newline JSON)
   ▲
   │ stdin/stdout 4-byte LE length-prefixed JSON  (Chrome NMH protocol)
astra-host  (native messaging host: "<ASTRA exe>" --astra-native-host)
   ▲
   │ chrome.runtime.connectNative
ASTRA Browser Bridge extension (MV3 service worker)
   ▼ chrome.tabs.sendMessage
content.js  (elements map, click/type/extract, AI cursor)
```

- Token + port are written to `%APPDATA%/ASTRA/native-host/native-host-config.json`
- NMH manifest: `%APPDATA%/ASTRA/native-host/com.astra.browser_bridge.json`
  (registry keys for Chrome & Edge point to it — written by installer and app)
- `allowed_origins` is filled with the user's extension ID (Settings → Browser)

## Persistence

| File (userData) | Content |
| --- | --- |
| settings.json | all settings (non-secret) |
| credentials.bin | API keys encrypted via safeStorage |
| memory.json | facts + conversation summaries (sensitive data OFF by default) |
| chat-history.json | last 60 chat turns |
| companion-bounds.json | companion window position/size |
