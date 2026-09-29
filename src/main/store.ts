import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import type { Settings, ChatTurn, MemoryData, PermissionMap } from '../shared/types';

export const DEFAULT_PERMISSIONS: PermissionMap = {
  MICROPHONE: true,
  BROWSER: true,
  FILES: true,
  WINDOWS_APPS: true,
  NETWORK: true,
  SCREEN_CAPTURE: false,
  CLIPBOARD: true
};

export const DEFAULT_SETTINGS: Settings = {
  general: { startWithWindows: false },
  ai: {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    sttModel: 'whisper-1',
    temperature: 0.4,
    maxSteps: 8
  },
  voice: { autoSpeak: true, ttsProvider: 'system', ttsVoice: 'alloy', rate: 1 },
  browser: { port: 39001, extensionId: '', aiCursor: true, registerNativeHost: true },
  appearance: { size: 1, opacity: 1, animations: 1, theme: 'deep-space', alwaysOnTop: true, clickThrough: false },
  companion: { enabled: true, showStatusChip: true },
  memory: { enabled: true, storeConversations: true, storeSensitiveData: false },
  shortcuts: { enabled: true, wake: 'Control+Space' },
  permissions: { ...DEFAULT_PERMISSIONS }
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(patch)) return base;
  const out = (isObj(base) ? { ...(base as Record<string, unknown>) } : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out as T;
}

class Store {
  settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  memory: MemoryData = { facts: [], conversations: [] };
  history: ChatTurn[] = [];
  loaded = false;

  private settingsFile = '';
  private credFile = '';
  private memoryFile = '';
  private historyFile = '';

  init(): void {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    this.settingsFile = path.join(dir, 'settings.json');
    this.credFile = path.join(dir, 'credentials.bin');
    this.memoryFile = path.join(dir, 'memory.json');
    this.historyFile = path.join(dir, 'chat-history.json');
    try {
      this.settings = deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')));
    } catch {
      // first run
    }
    try {
      this.memory = JSON.parse(fs.readFileSync(this.memoryFile, 'utf8'));
    } catch {
      // first run
    }
    try {
      this.history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
    } catch {
      // first run
    }
    if (!this.settings.permissions) this.settings.permissions = { ...DEFAULT_PERMISSIONS };
    this.loaded = true;
    this.saveSettings();
  }

  saveSettings(): void {
    if (!this.settingsFile) return;
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
    } catch {
      // ignore write failures
    }
  }

  patchSettings(patch: unknown): Settings {
    this.settings = deepMerge(this.settings, patch);
    this.saveSettings();
    return this.settings;
  }

  // ---- Credentials (encrypted with Electron safeStorage when available) ----

  private readCreds(): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(this.credFile, 'utf8'));
    } catch {
      return {};
    }
  }

  setCred(key: string, value: string): void {
    const data = this.readCreds();
    if (safeStorage.isEncryptionAvailable()) {
      data[key] = safeStorage.encryptString(value).toString('base64');
    } else {
      data[key] = 'plain:' + value;
    }
    try {
      fs.writeFileSync(this.credFile, JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  getCred(key: string): string | null {
    const v = this.readCreds()[key];
    if (v == null) return null;
    if (v.startsWith('plain:')) return v.slice(6);
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(v, 'base64'));
      }
    } catch {
      return null;
    }
    return null;
  }

  hasCred(key: string): boolean {
    return !!this.readCreds()[key];
  }

  // ---- Memory ----

  saveMemory(): void {
    try {
      fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2));
    } catch {
      // ignore
    }
  }

  addFact(fact: string): void {
    this.memory.facts.unshift(fact);
    this.memory.facts = this.memory.facts.slice(0, 50);
    this.saveMemory();
  }

  addConversation(q: string, a: string): void {
    this.memory.conversations.unshift({ q, a, ts: Date.now() });
    this.memory.conversations = this.memory.conversations.slice(0, 100);
    this.saveMemory();
  }

  clearMemory(): void {
    this.memory = { facts: [], conversations: [] };
    this.saveMemory();
  }

  // ---- Chat history ----

  pushHistory(role: 'user' | 'assistant', content: string): void {
    this.history.push({ role, content, ts: Date.now() });
    if (this.history.length > 60) this.history = this.history.slice(-60);
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history));
    } catch {
      // ignore
    }
  }

  recentHistory(n: number): ChatTurn[] {
    return this.history.slice(-n);
  }

  clearHistory(): void {
    this.history = [];
    try {
      fs.writeFileSync(this.historyFile, '[]');
    } catch {
      // ignore
    }
  }
}

export const store = new Store();
