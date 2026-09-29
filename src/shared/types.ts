// ASTRA shared types

export type AstraState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SEARCHING'
  | 'WORKING'
  | 'SPEAKING'
  | 'SUCCESS'
  | 'ERROR'
  | 'SLEEPING';

export type AstraMode = 'COMPANION' | 'INTERACTION' | 'RESEARCH' | 'FULL_WINDOW';

export type PermissionKey =
  | 'MICROPHONE'
  | 'BROWSER'
  | 'FILES'
  | 'WINDOWS_APPS'
  | 'NETWORK'
  | 'SCREEN_CAPTURE'
  | 'CLIPBOARD';

export type PermissionMap = Record<PermissionKey, boolean>;

export interface GeneralSettings {
  startWithWindows: boolean;
}

export interface AISettings {
  provider: 'openai-compatible' | 'gemini' | 'groq' | 'openrouter';
  baseUrl: string;
  model: string;
  sttModel: string;
  temperature: number;
  maxSteps: number;
}

export interface VoiceSettings {
  autoSpeak: boolean;
  ttsProvider: 'system' | 'openai';
  ttsVoice: string;
  rate: number;
}

export interface BrowserSettings {
  port: number;
  extensionId: string;
  aiCursor: boolean;
  registerNativeHost: boolean;
}

export interface AppearanceSettings {
  size: number;
  opacity: number;
  animations: number;
  theme: 'deep-space' | 'obsidian' | 'nebula';
  alwaysOnTop: boolean;
  clickThrough: boolean;
}

export interface CompanionSettings {
  enabled: boolean;
  showStatusChip: boolean;
}

export interface MemorySettings {
  enabled: boolean;
  storeConversations: boolean;
  storeSensitiveData: boolean;
}

export interface ShortcutSettings {
  enabled: boolean;
  wake: string;
}

export interface Settings {
  general: GeneralSettings;
  ai: AISettings;
  voice: VoiceSettings;
  browser: BrowserSettings;
  appearance: AppearanceSettings;
  companion: CompanionSettings;
  memory: MemorySettings;
  shortcuts: ShortcutSettings;
  permissions: PermissionMap;
}

export interface AstraEvent {
  type: string;
  [key: string]: unknown;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface MemoryData {
  facts: string[];
  conversations: { q: string; a: string; ts: number }[];
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface PageElement {
  ELEMENT_ID: string;
  ROLE: string;
  TEXT: string;
  ARIA_LABEL: string;
  X: number;
  Y: number;
  WIDTH: number;
  HEIGHT: number;
}
