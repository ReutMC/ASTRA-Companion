/**
 * AI provider factory — builds the right provider from the user's settings.
 */
import type { AIProvider, ProviderConfig } from '../../types'
import { GeminiProvider } from './gemini'
import { OpenAICompatibleProvider } from './openaiCompatible'

const DEFAULT_OPENAI_MODEL = 'llama-3.3-70b-versatile'
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash'

/**
 * Creates an {@link AIProvider} from a `ProviderConfig`.
 * Throws clean bilingual errors when the endpoint or API key is missing.
 */
export function createAIProvider(cfg: ProviderConfig): AIProvider {
  const type = cfg?.type
  if (type === 'openai-compatible') {
    const endpoint = (cfg.endpoint ?? '').trim()
    if (!endpoint) {
      throw new Error('ASTRA: نشانی سرویس هوش مصنوعی تنظیم نشده — Settings → AI را باز کنید / no endpoint configured — open Settings → AI')
    }
    const apiKey = (cfg.apiKey ?? '').trim()
    if (!apiKey) {
      throw new Error('ASTRA: کلید API تنظیم نشده — Settings → AI را باز کنید / no API key configured — open Settings → AI')
    }
    const model = (cfg.model ?? '').trim() || DEFAULT_OPENAI_MODEL
    return new OpenAICompatibleProvider(endpoint, apiKey, model)
  }
  if (type === 'gemini') {
    const apiKey = (cfg.apiKey ?? '').trim()
    if (!apiKey) {
      throw new Error('ASTRA: کلید API گوگل تنظیم نشده — Settings → AI را باز کنید / no API key configured — open Settings → AI')
    }
    const model = (cfg.model ?? '').trim() || DEFAULT_GEMINI_MODEL
    return new GeminiProvider(apiKey, model)
  }
  throw new Error(
    `ASTRA: نوع سرویس هوش مصنوعی ناشناخته است: «${String(type)}» — openai-compatible یا gemini / unknown AI provider type: "${String(type)}"`,
  )
}
