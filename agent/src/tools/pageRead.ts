/**
 * `read_page` — fetches a web page and returns cleaned plain text for the model.
 */
import type { ToolDef, ToolResult } from '../types'
import { cleanText, htmlToText } from './html'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Hard cap on downloaded HTML so a giant page cannot blow up memory. */
const MAX_HTML_CHARS = 1_500_000

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export const pageRead: ToolDef = {
  name: 'read_page',
  description:
    'Fetch a web page and return its readable plain text (scripts/styles stripped). Use after web_search on the best results. خواندن متن صفحه وب.',
  permission: 'NETWORK',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to read.' },
      max_chars: { type: 'number', description: 'Maximum characters of text to return (default 6000).' },
    },
    required: ['url'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const rawUrl = typeof args?.url === 'string' ? args.url.trim() : ''
    if (!rawUrl) return { ok: false, summary: 'نشانی صفحه خالی است / Page URL is empty' }

    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return { ok: false, summary: `نشانی نامعتبر است: «${rawUrl.slice(0, 120)}» / Invalid URL` }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, summary: 'فقط نشانی‌های http/https پشتیبانی می‌شوند / Only http/https URLs are supported' }
    }

    const requested = typeof args?.max_chars === 'number' && Number.isFinite(args.max_chars) ? Math.floor(args.max_chars) : 6000
    const maxChars = clamp(requested, 500, 20000)

    ctx.emit({ type: 'activity', text: `خواندن صفحه: ${parsed.host}… / Reading page: ${parsed.host}…` })
    let res: Response
    try {
      res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en,fa;q=0.9' },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, summary: `دریافت صفحه ناموفق بود / Failed to fetch the page: ${msg}` }
    }
    if (!res.ok) {
      return { ok: false, summary: `صفحه پاسخ نداد (HTTP ${res.status}) / Page returned HTTP ${res.status}` }
    }

    const html = (await res.text()).slice(0, MAX_HTML_CHARS)
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    const title = titleMatch ? cleanText(titleMatch[1]) : ''
    let text = htmlToText(html)
    let truncated = false
    if (text.length > maxChars) {
      text = `${text.slice(0, maxChars)}…[truncated]`
      truncated = true
    }
    if (text.length === 0) {
      return { ok: false, summary: 'متن قابل استخراجی در صفحه نبود / No readable text could be extracted' }
    }

    const finalTitle = title || parsed.host
    return {
      ok: true,
      summary: `خوانده شد: ${finalTitle} (${text.length} نویسه) / Read: ${finalTitle} (${text.length} chars)`,
      data: { title, url: res.url || parsed.toString(), text, truncated },
      sources: [{ title: finalTitle, url: res.url || parsed.toString(), snippet: text.slice(0, 160) }],
    }
  },
}
