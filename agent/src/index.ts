/**
 * @astra/agent — ASTRA agent core (zero runtime npm dependencies).
 *
 * Public surface: agent runtime, AI + voice providers, tool registry,
 * memory store, settings defaults, and pure helpers used by the tests.
 */
export * from './types'

export { DEFAULT_SETTINGS, deepMergeSettings, deepMerge } from './settings/defaults'
export type { DeepPartial } from './settings/defaults'

export { buildSystemPrompt } from './prompts'

export { createAIProvider } from './providers/ai/factory'
export { OpenAICompatibleProvider } from './providers/ai/openaiCompatible'
export { GeminiProvider, sanitizeGeminiSchema, dereferenceNullable } from './providers/ai/gemini'
export { createSTT, createTTS, WhisperHttpSTT, OpenAiHttpTTS } from './providers/voice'

export { createToolRegistry, describeConfirm } from './toolRegistry'
export { createAgentRuntime, extractSources } from './agent'
export { createMemoryStore } from './memory/memory'

// Pure helpers (used by tests + embedders)
export { parseDDG, parseDDGLite, normalizeDDGUrl, searchDuckDuckGo } from './tools/webSearch'
export type { DDGResult } from './tools/webSearch'
export { decodeEntities, stripTags, cleanText, htmlToText } from './tools/html'
export { astraRoot, validateWrite, ASTRA_FOLDERS, MAX_FILE_BYTES } from './tools/filesystem'
export type { AstraFolder, WriteValidation } from './tools/filesystem'
export { isAllowedPath, ALLOWED_APPS, APPS, sanitizeFolderName } from './tools/windowsApps'
