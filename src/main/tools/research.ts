import { toolRegistry } from './index';
import { emitEvent } from '../state';
import type { ResearchSource } from '../../shared/types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, {
      ...(init || {}),
      signal: c.signal,
      headers: { 'User-Agent': UA, ...((init && init.headers) || {}) }
    });
  } finally {
    clearTimeout(t);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeDdgRedirect(u: string): string {
  try {
    if (u.includes('duckduckgo.com/l/') || u.includes('/l/?')) {
      const m = /[?&]uddg=([^&]+)/.exec(u);
      if (m) return decodeURIComponent(m[1]);
    }
  } catch {
    // fall through
  }
  return u;
}

export async function webSearch(query: string): Promise<ResearchSource[]> {
  const body = new URLSearchParams({ q: query });
  const res = await fetchWithTimeout('https://html.duckduckgo.com/html/', 14000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);
  const html = await res.text();

  const out: ResearchSource[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 8) {
    const url = decodeDdgRedirect(m[1]);
    const title = stripTags(m[2]);
    if (!/^https?:/i.test(url) || !title) continue;
    out.push({ title, url });
  }
  const sre = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let i = 0;
  let s: RegExpExecArray | null;
  while ((s = sre.exec(html)) !== null && i < out.length) {
    out[i].snippet = stripTags(s[1]).slice(0, 300);
    i++;
  }
  if (!out.length) throw new Error('No search results parsed (the search engine layout may have changed).');

  emitEvent({ type: 'research:sources', sources: out });
  return out;
}

export async function webRead(url: string): Promise<{ title: string; url: string; text: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are supported.');
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) throw new Error(`Failed to read page (HTTP ${res.status}).`);
  const html = await res.text();
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 160) : url;
  const text = stripTags(html).slice(0, 7000);
  if (!text) throw new Error('Page appears to be empty or requires JavaScript only.');
  return { title, url, text };
}

export function registerResearchTools(r: typeof toolRegistry): void {
  r.register({
    name: 'web_search',
    permission: 'NETWORK',
    state: 'SEARCHING',
    description: 'Search the web and return up to 8 results (title, url, snippet).',
    args: '{ "query": "best free AI APIs 2025" }',
    describe: (a) => `Searching the web for "${String(a.query || '').slice(0, 60)}"`,
    run: async (a) => {
      const results = await webSearch(String(a.query || ''));
      return { results };
    }
  });

  r.register({
    name: 'web_read',
    permission: 'NETWORK',
    state: 'SEARCHING',
    description: 'Read a web page and return its main text content (up to ~7000 characters).',
    args: '{ "url": "https://..." }',
    describe: (a) => `Reading page ${String(a.url || '').slice(0, 70)}`,
    run: async (a) => webRead(String(a.url || ''))
  });
}
