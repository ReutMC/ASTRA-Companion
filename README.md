# ASTRA — Astronaut AI Companion for Windows

> A futuristic astronaut AI companion that lives on your desktop. Not a chatbot demo — a companion: a floating, animated astronaut with four modes, voice in Persian and English, agentic web research with real sources, whitelisted Windows tools, and Chrome control through an official extension + Native Messaging.

![Build ASTRA Installer](https://img.shields.io/github/actions/workflow/status/ReutMC/ASTRA-Companion/build.yml?branch=main&label=Windows%20Installer&logo=github)

---

## ✨ Features

- **Four modes**
  - `COMPANION` — a nearly-silent floating astronaut on your desktop (controls fade away)
  - `INTERACTION` — click the astronaut (or press `Ctrl+Space`) and a compact glass UI wraps around it
  - `RESEARCH` — a research workspace: steps, clickable sources, synthesized report
  - `FULL WINDOW` — the ASTRA Console: astronaut + chat + research + activity + settings
- **Original animated astronaut** — an SVG character with 9 animated states:
  `IDLE · LISTENING · THINKING · SEARCHING · WORKING · SPEAKING · SUCCESS · ERROR · SLEEPING`
  (blinks, looks around, scans while searching, equalizer grille while speaking, Zzz while sleeping)
- **Voice** — speech-to-text via any Whisper-compatible endpoint (OpenAI/Groq/OpenRouter), Persian (`fa-IR`) and English; answers spoken via provider TTS or system voices
- **Agentic core** — `USER → PLANNER (JSON) → TOOL → OBSERVATION → … → ANSWER` with a tool registry and permission checks
- **Real research with real sources** — web search + page reading + synthesis; every source clickable; uncertainty is marked, never invented
- **AI Cursor** — a separate futuristic blue cursor glides to targets and pulses before ASTRA acts (your real mouse is never touched)
- **Chrome control** — navigate / find / click / type / extract through the ASTRA Browser Bridge extension over Native Messaging (localhost + token, no public endpoints)
- **Whitelisted Windows tools only** — Chrome, VS Code, Notepad, Explorer, Downloads, Documents; file generation into `Documents/ASTRA/{Generated,Research,Exports}`; **the model can never run arbitrary shell commands**
- **Permission system** — `MICROPHONE, BROWSER, FILES, WINDOWS_APPS, NETWORK, SCREEN_CAPTURE, CLIPBOARD`
- **Tray** — Show/Hide, Enable/Disable Companion, Enable/Disable AI Cursor, Settings, Restart, Exit
- **Memory** — local facts and conversation summaries; sensitive data is never stored by default; API keys are encrypted with the OS keychain (Electron `safeStorage`)

---

## 🚀 Build & Run

```bash
npm install          # install dependencies
npm run dev          # run ASTRA in development
npm run build        # type-check + compile TypeScript
npm run installer    # build the Windows installer -> dist/ASTRA-Setup.exe
```

The installer is built automatically by **GitHub Actions** on every push to `main`
(see the workflow `.github/workflows/build.yml`):

- Run page → **Artifacts → `ASTRA-Setup`** → contains `ASTRA-Setup.exe`
- On a tag push (`v1.0.0`), the exe is also attached to a GitHub Release

## 📦 Install

1. Download / build `ASTRA-Setup.exe` and run it (per-user, no admin needed).
2. Start Menu + Desktop shortcuts are created; ASTRA starts in the tray.
3. The Native Messaging Host is registered automatically for Chrome & Edge (HKCU).

## 🌐 Chrome Extension (one-time, manual)

Chrome's security model does not allow installers to silently add extensions, so
ASTRA does this honestly and transparently:

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the `browser-extension/` folder (also shipped in the installed app folder)
3. Open the extension popup → **Copy** the **Extension ID**
4. In ASTRA: **Settings → Browser → paste Extension ID → "Register Native Messaging Host"**
5. Restart Chrome. The popup should show **CONNECTED**.

Details: [`docs/INSTALL-EXTENSION.md`](docs/INSTALL-EXTENSION.md)

## 🗣 Voice notes

- STT uses your provider's Whisper-compatible endpoint (`/audio/transcriptions`); set the model in Settings → AI.
- TTS: choose `system` (uses Windows voices — install a Persian voice for `fa-IR`) or `openai` (`/audio/speech`).

## 🔐 Security model

- No arbitrary shell execution, ever. Tools are whitelisted and declared.
- The browser bridge binds to `127.0.0.1` with a random token; the extension talks only through Chrome Native Messaging.
- API keys are stored encrypted (`safeStorage`); passwords/cookies/tokens are never sent to the model or stored (Memory → "store sensitive data" is OFF by default).
- Generated files are confined to `Documents/ASTRA` (absolute paths must stay inside the user profile).

## 🏗 Architecture

```
┌─────────────────────── ASTRA (Electron) ───────────────────────┐
│  Companion Window (transparent)   Full Window (Console)        │
│        ▲   ▲                            ▲   ▲                  │
│        └───┴──── preload bridge (IPC) ──┴───┘                  │
│  Main process:                                                 │
│   • Agent (JSON planner loop)  • Tool Registry + Permissions   │
│   • AI Providers (OpenAI-compat / Gemini / Groq / OpenRouter)  │
│   • Research (search + read)   • Files  • Apps  • Memory       │
│   • Browser Bridge (localhost TCP + NMH)  • Tray / Shortcuts   │
└──────────────┬─────────────────────────────────────────────────┘
               │ Native Messaging (stdio, length-prefixed JSON)
┌──────────────▼────────────┐      ┌──────────────────────────┐
│ astra-host (stdio bridge) │──────►  ASTRA Browser Bridge     │
└───────────────────────────┘      │  (extension: content.js, │
                                   │   AI cursor, actions)    │
                                   └──────────────────────────┘
```

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 🇮🇷 فارسی

**ASTRA** یک همراه هوشمند فضانورد روی دسکتاپ ویندوز شماست؛ نه یک چت‌بات ساده.

- با `Ctrl+Space` بیدارش کنید؛ فضانورد با حالت LISTENING به شما گوش می‌دهد.
- بپرسید: «کروم رو باز کن و توی یوتیوب Minecraft Live رو سرچ کن و اولین نتیجه رو باز کن» — ASTRA کروم را باز می‌کند، صفحه را می‌فهمد، با **موس مجازی آبی** هدف را نشان می‌دهد، تایپ و جست‌وجو می‌کند و نتیجه را با صدای فارسی گزارش می‌کند.
- بخواهید: «درباره بهترین API های رایگان AI تحقیق کن» — چند منبع را می‌خواند، مقایسه می‌کند و گزارش با **منابع قابل کلیک** می‌دهد؛ اطلاعات نامطمئن را صریح مشخص می‌کند.
- بگویید: «همین گزارش رو ذخیره کن» — در `Documents\ASTRA\Research` ذخیره می‌شود.

## 🗺 Roadmap

- DOCX/PDF export
- Optional local LLM fallback (llama.cpp)
- More whitelisted apps + scheduler
- Multi-monitor snap zones for the companion

## 📄 License

MIT — see [LICENSE](LICENSE).
