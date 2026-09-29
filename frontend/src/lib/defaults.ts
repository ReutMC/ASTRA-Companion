import type { Permission, Settings } from './types'

/**
 * Mirror of the desktop DEFAULT_SETTINGS (desktop/src/config.ts).
 * Used as the initial render snapshot and by the browser-dev mock.
 */
export const DEFAULT_SETTINGS: Settings = {
  ai: {
    type: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    maxTokens: 2048,
  },
  stt: {
    type: 'webspeech',
    endpoint: '',
    apiKey: '',
    model: '',
    language: 'fa-IR',
  },
  tts: {
    type: 'webspeech',
    endpoint: '',
    apiKey: '',
    model: '',
    voice: '',
  },
  companion: {
    size: 340,
    opacity: 1,
    alwaysOnTop: true,
    clickThrough: false,
    locked: false,
  },
  browser: {
    aiCursor: true,
    confirmActions: true,
  },
  permissions: {
    NETWORK: true,
    FILES: true,
    WINDOWS_APPS: false,
    BROWSER: true,
    MICROPHONE: true,
    CLIPBOARD: false,
    SCREEN_CAPTURE: false,
  },
  memory: {
    enabled: false,
  },
  shortcuts: {
    toggle: 'Ctrl+Space',
  },
  general: {
    language: 'fa-IR',
    launchOnStartup: true,
  },
}

export const PERMISSION_LABELS: Record<Permission, { fa: string; en: string; hint: string }> = {
  NETWORK: { fa: 'دسترسی شبکه', en: 'Network access', hint: 'Web search & page reading' },
  FILES: { fa: 'فایل‌ها', en: 'Files', hint: 'Sandboxed writes under Documents/ASTRA' },
  WINDOWS_APPS: { fa: 'برنامه‌های ویندوز', en: 'Windows apps', hint: 'Allow-listed app launching' },
  BROWSER: { fa: 'مرورگر', en: 'Browser', hint: 'Read & act in Chrome via bridge' },
  MICROPHONE: { fa: 'میکروفون', en: 'Microphone', hint: 'Voice input (STT)' },
  CLIPBOARD: { fa: 'کلیپ‌بورد', en: 'Clipboard', hint: 'Copy results to clipboard' },
  SCREEN_CAPTURE: { fa: 'ضبط صفحه', en: 'Screen capture', hint: 'Screenshots & recording' },
}
