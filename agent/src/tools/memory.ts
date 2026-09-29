/**
 * `remember` / `recall` — local memory tools backed by the file-based MemoryStore.
 * Memory is a local-data feature, so it sits behind the FILES permission.
 */
import type { ToolDef, ToolResult } from '../types'

export const rememberTool: ToolDef = {
  name: 'remember',
  description: 'Save a note to ASTRA local memory (persists on disk). Use when the user says "remember that…". ذخیره یادداشت در حافظه محلی.',
  permission: 'FILES',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The fact/note to remember, in the user’s words.' },
      kind: { type: 'string', description: 'Optional category, e.g. "preference", "fact", "todo".' },
    },
    required: ['text'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const text = (typeof args?.text === 'string' ? args.text : '').trim()
    if (!text) return { ok: false, summary: 'متن یادداشت خالی است / Note text is empty' }
    const kind = typeof args?.kind === 'string' && args.kind.trim() ? args.kind.trim() : 'note'
    try {
      ctx.memory.add({ text, kind })
    } catch (err) {
      return { ok: false, summary: `ذخیره در حافظه ناموفق بود / Failed to save to memory: ${err instanceof Error ? err.message : String(err)}` }
    }
    return { ok: true, summary: 'ذخیره شد در حافظه محلی / Saved to local memory', data: { text, kind } }
  },
}

export const recallTool: ToolDef = {
  name: 'recall',
  description: 'Search ASTRA local memory for past notes. جست‌وجو در حافظه محلی.',
  permission: 'FILES',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords to look for.' },
    },
    required: ['query'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const query = (typeof args?.query === 'string' ? args.query : '').trim()
    if (!query) return { ok: false, summary: 'عبارت جست‌وجو خالی است / Query is empty' }
    let hits
    try {
      hits = ctx.memory.search(query, 5)
    } catch (err) {
      return { ok: false, summary: `جست‌وجوی حافظه ناموفق بود / Memory search failed: ${err instanceof Error ? err.message : String(err)}` }
    }
    if (hits.length === 0) {
      return { ok: true, summary: 'چیزی در حافظه محلی پیدا نشد / Nothing found in local memory', data: { results: [] } }
    }
    return {
      ok: true,
      summary: `${hits.length} یادداشت پیدا شد:\n${hits.map((h) => `- ${h.text}`).join('\n')}`,
      data: { results: hits },
    }
  },
}
