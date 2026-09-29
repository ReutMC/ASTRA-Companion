/**
 * `web_search` — DuckDuckGo HTML search (no API key needed) with a lite-mode fallback,
 * plus an optional `web_search_tavily` tool (reads the `TAVILY_API_KEY` env var).
 */
import type { ToolDef, ToolResult } from '../types'
import { cleanText, decodeEntities } from './html'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** One parsed search hit. */
export interface DDGResult {
  title: string
  url: string
  snippet: string
}

/** Rewrites `//duckduckgo.com/l/?uddg=<encoded>&rut=…` hrefs into the real target URL. */
export function normalizeDDGUrl(href: string): string {
  let h = href.trim()
  if (h.startsWith('//')) h = `https:${h}`
  try {
    const u = new URL(h)
    const uddg = u.searchParams.get('uddg')
    return uddg && uddg.length > 0 ? uddg : u.toString()
  } catch {
    return h
  }
}

/**
 * Parses the DuckDuckGo HTML results page (`html.duckduckgo.com/html/?q=…`).
 * Result anchors carry `class="result__a"`, snippets `class="result__snippet"`.
 */
export function parseDDG(html: string, max = 10): DDGResult[] {
  const anchors: { url: string; title: string }[] = []
  const snippets: string[] = []
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const cls = /\bclass\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bclass\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? ''
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bhref\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? ''
    if (/\bresult__a\b/.test(cls) && href) {
      anchors.push({ url: normalizeDDGUrl(href), title: cleanText(inner) })
    } else if (/\bresult__snippet\b/.test(cls)) {
      snippets.push(cleanText(inner))
    }
  }
  const results: DDGResult[] = []
  for (let i = 0; i < anchors.length && results.length < max; i++) {
    const a = anchors[i]
    if (!a.title || !a.url) continue
    results.push({ title: a.title, url: a.url, snippet: snippets[i] ?? '' })
  }
  return results
}

/**
 * Parses the DuckDuckGo lite results page (`lite.duckduckgo.com/lite/?q=…`):
 * external hits are `<a rel="nofollow" href="…">Title</a>`, snippets live in
 * `<td class="result-snippet">…</td>`.
 */
export function parseDDGLite(html: string, max = 10): DDGResult[] {
  const anchors: string[] = []
  const titles: string[] = []
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1]
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /\bhref\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? ''
    if (!/\brel\s*=\s*["']?nofollow/i.test(attrs)) continue
    if (!/https?:\/\//i.test(href) || /duckduckgo\.com/i.test(href)) continue
    anchors.push(href)
    titles.push(cleanText(m[2]))
  }
  const snippets: string[] = []
  const snippetRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi
  while ((m = snippetRe.exec(html)) !== null) snippets.push(cleanText(m[1]))

  const results: DDGResult[] = []
  for (let i = 0; i < anchors.length && results.length < max; i++) {
    if (!titles[i]) continue
    results.push({ title: titles[i], url: anchors[i], snippet: snippets[i] ?? '' })
  }
  return results
}

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en,fa;q=0.9' },
      signal: signal ?? AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Searches DuckDuckGo (HTML first, lite fallback). Never throws — returns [] on failure. */
export async function searchDuckDuckGo(query: string, max = 6, signal?: AbortSignal): Promise<DDGResult[]> {
  const encoded = encodeURIComponent(query)
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encoded}`, signal)
  let results = html ? parseDDG(html, max) : []
  if (results.length === 0) {
    const lite = await fetchHtml(`https://lite.duckduckgo.com/lite/?q=${encoded}`, signal)
    if (lite) results = parseDDGLite(lite, max)
  }
  return results.slice(0, max)
}

export const webSearch: ToolDef = {
  name: 'web_search',
  description:
    'Search the web with DuckDuckGo. Returns a list of {title, url, snippet}. Use 2-4 of the best results with read_page before answering research questions. جست‌وجوی وب.',
  permission: 'NETWORK',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query — English queries usually find more technical results.' },
      max_results: { type: 'number', description: 'How many results to return (1-10, default 6).' },
    },
    required: ['query'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const query = typeof args?.query === 'string' ? args.query.trim() : ''
    if (!query) return { ok: false, summary: 'عبارت جست‌وجو خالی است / Search query is empty' }
    const requested = typeof args?.max_results === 'number' && Number.isFinite(args.max_results) ? Math.floor(args.max_results) : 6
    const max = Math.min(10, Math.max(1, requested))

    ctx.emit({ type: 'activity', text: `جست‌وجوی وب: «${query}»… / Web search: "${query}"…` })
    const results = await searchDuckDuckGo(query, max)
    if (results.length === 0) {
      return {
        ok: false,
        summary: `نتیجه‌ای برای «${query}» پیدا نشد — با عبارت دیگری دوباره تلاش کنید / No results found for "${query}" — try a different query`,
      }
    }
    return {
      ok: true,
      summary: `${results.length} نتیجه برای «${query}» / ${results.length} results for "${query}"`,
      data: { query, results },
      sources: results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet || undefined })),
    }
  },
}

/**
 * Optional Tavily search — only works when the `TAVILY_API_KEY` environment
 * variable is set (it is a separate, optional key; never stored in settings).
 */
export const webSearchTavily: ToolDef = {
  name: 'web_search_tavily',
  description:
    'Optional higher-quality web search via Tavily (used only when the TAVILY_API_KEY env var is configured). Returns {title, url, snippet} results.',
  permission: 'NETWORK',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query.' },
    },
    required: ['query'],
  },
  async execute(args): Promise<ToolResult> {
    const key = process.env['TAVILY_API_KEY']
    if (!key) {
      return {
        ok: false,
        summary:
          'کلید Tavily تنظیم نشده (اختیاری) — متغیر محیطی TAVILY_API_KEY را تنظیم کنید / Tavily key not configured (optional) — set the TAVILY_API_KEY environment variable',
      }
    }
    const query = typeof args?.query === 'string' ? args.query.trim() : ''
    if (!query) return { ok: false, summary: 'عبارت جست‌وجو خالی است / Search query is empty' }

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, max_results: 6, search_depth: 'basic' }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        return {
          ok: false,
          summary: `خطای Tavily (HTTP ${res.status}) / Tavily error (HTTP ${res.status}): ${(await res.text()).slice(0, 160)}`,
        }
      }
      const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] }
      const results = (json.results ?? [])
        .filter((r) => typeof r.url === 'string' && r.url)
        .map((r) => ({ title: cleanText(r.title ?? ''), url: r.url as string, snippet: decodeEntities(r.content ?? '').slice(0, 300) }))
      if (results.length === 0) {
        return { ok: false, summary: `نتیجه‌ای برای «${query}» پیدا نشد / No results found for "${query}"` }
      }
      return {
        ok: true,
        summary: `${results.length} نتیجه Tavily برای «${query}» / ${results.length} Tavily results for "${query}"`,
        data: { query, results },
        sources: results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet || undefined })),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, summary: `خطای شبکه در Tavily / Tavily network error: ${msg}` }
    }
  },
}
