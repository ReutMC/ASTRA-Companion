/**
 * File-backed local memory (`memory.json` inside the userData dir).
 * Token-overlap search (Unicode-aware, works for Persian + English), capped at 200 entries.
 * When `enabled` is false every operation is a no-op.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { MemoryEntry, MemoryStore } from '../types'

const MAX_ENTRIES = 200

function isEntry(v: unknown): v is MemoryEntry {
  return typeof v === 'object' && v !== null && typeof (v as MemoryEntry).text === 'string' && typeof (v as MemoryEntry).ts === 'number'
}

/** Splits text into lowercase tokens, keeping Unicode letters/digits (Persian-friendly). */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length >= 2)
}

/**
 * Creates a MemoryStore persisted at `<userDataDir>/memory.json`.
 * `enabled === false` → all operations are no-ops returning empty results.
 */
export function createMemoryStore(userDataDir: string, enabled: boolean): MemoryStore {
  const file = path.join(userDataDir, 'memory.json')
  let cache: MemoryEntry[] | null = null

  const load = (): MemoryEntry[] => {
    if (cache) return cache
    cache = []
    if (enabled) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (Array.isArray(parsed)) cache = parsed.filter(isEntry).slice(-MAX_ENTRIES)
      } catch {
        /* missing or corrupt file → start empty */
      }
    }
    return cache
  }

  const persist = (): void => {
    if (!enabled) return
    try {
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(file, JSON.stringify(cache ?? [], null, 2), 'utf8')
    } catch {
      /* memory persistence is best-effort */
    }
  }

  return {
    add(entry: { text: string; kind?: string }): void {
      const text = (entry?.text ?? '').trim()
      if (!enabled || !text) return
      const list = load()
      list.push({ text, ts: Date.now(), kind: entry?.kind?.trim() || 'note' })
      if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES)
      persist()
    },

    search(query: string, limit = 5): MemoryEntry[] {
      if (!enabled) return []
      const tokens = tokenize(query)
      if (tokens.length === 0) return []
      const scored = load()
        .map((e) => {
          const hay = e.text.toLowerCase()
          let score = 0
          for (const t of tokens) if (hay.includes(t)) score++
          return { e, score }
        })
        .filter((x) => x.score > 0)
      scored.sort((a, b) => (b.score - a.score) || (b.e.ts - a.e.ts))
      return scored.slice(0, Math.max(1, limit)).map((x) => ({ ...x.e }))
    },

    all(): MemoryEntry[] {
      if (!enabled) return []
      return [...load()]
    },

    clear(): void {
      if (!enabled) return
      cache = []
      persist()
    },
  }
}
