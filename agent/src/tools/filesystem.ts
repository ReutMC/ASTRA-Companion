/**
 * Filesystem tools — writes are sandboxed to `Documents/ASTRA/{Generated,Research,Exports}`
 * per CONTRACTS.md §11: folder whitelist + filename checks + extension allowlist + 2 MB cap.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ToolDef, ToolResult } from '../types'

export const ASTRA_FOLDERS = ['Generated', 'Research', 'Exports'] as const
export type AstraFolder = (typeof ASTRA_FOLDERS)[number]

const ALLOWED_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'html', 'css', 'js', 'py']

/** Maximum write_file payload size (CONTRACTS §11). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Sandbox root: `<homeDir>/Documents/ASTRA`. */
export function astraRoot(homeDir: string): string {
  return path.join(homeDir, 'Documents', 'ASTRA')
}

export interface WriteValidation {
  ok: boolean
  /** Absolute target path (empty when invalid). */
  absPath: string
  /** Bilingual error message when invalid. */
  error?: string
}

/**
 * Pure validation for a sandboxed write — no filesystem access.
 * Rejects: unknown folders, path separators / `..` in the filename,
 * missing or disallowed extensions (txt, md, json, csv, html, css, js, py).
 */
export function validateWrite(folder: string, filename: string, homeDir: string): WriteValidation {
  if (!ASTRA_FOLDERS.includes(folder as AstraFolder)) {
    return {
      ok: false,
      absPath: '',
      error: `پوشه مجاز نیست: «${String(folder).slice(0, 60)}» — فقط Generated / Research / Exports / Folder not allowed — use Generated, Research or Exports`,
    }
  }
  const name = (filename ?? '').trim()
  if (!name) {
    return { ok: false, absPath: '', error: 'نام فایل خالی است / Filename is empty' }
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return { ok: false, absPath: '', error: 'نام فایل نباید شامل مسیر باشد / Filename must not contain a path' }
  }
  const ext = path.extname(name).toLowerCase().replace(/^\./, '')
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      absPath: '',
      error: `پسوند مجاز نیست: «.${ext}» — مجاز: ${ALLOWED_EXTENSIONS.join(', ')} / Extension not allowed: ".${ext}" — allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    }
  }
  return { ok: true, absPath: path.join(astraRoot(homeDir), folder, name) }
}

export const writeFileTool: ToolDef = {
  name: 'write_file',
  description:
    'Save a text file inside the user sandbox Documents/ASTRA/{Generated|Research|Exports}. The user is asked for confirmation automatically. ذخیره فایل در پوشه امن ASTRA.',
  permission: 'FILES',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', enum: ['Generated', 'Research', 'Exports'], description: 'Target sandbox folder.' },
      filename: { type: 'string', description: 'File name with an allowed extension (txt, md, json, csv, html, css, js, py). No paths.' },
      content: { type: 'string', description: 'Full text content to write (max 2 MB).' },
    },
    required: ['folder', 'filename', 'content'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const folder = typeof args?.folder === 'string' ? args.folder : ''
    const filename = typeof args?.filename === 'string' ? args.filename : ''
    const content = typeof args?.content === 'string' ? args.content : ''
    if (!content) return { ok: false, summary: 'محتوایی برای ذخیره نیست / There is nothing to save' }

    const v = validateWrite(folder, filename, ctx.homeDir)
    if (!v.ok) return { ok: false, summary: v.error ?? 'نوشته مجاز نیست / Write rejected' }
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      return { ok: false, summary: 'محتوا بزرگ‌تر از حد مجاز ۲ مگابایت است / Content exceeds the 2 MB limit' }
    }

    try {
      fs.mkdirSync(path.dirname(v.absPath), { recursive: true })
      fs.writeFileSync(v.absPath, content, 'utf8')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, summary: `ذخیره فایل ناموفق بود / Failed to write the file: ${msg}` }
    }
    const bytes = Buffer.byteLength(content, 'utf8')
    return {
      ok: true,
      summary: `ذخیره شد: ${v.absPath} (${bytes} بایت) / Saved: ${v.absPath} (${bytes} bytes)`,
      data: { path: v.absPath, bytes },
    }
  },
}

export const listAstraFiles: ToolDef = {
  name: 'list_astra_files',
  description: 'List files inside the ASTRA sandbox folder (Documents/ASTRA) with sizes. فهرست فایل‌های ASTRA.',
  permission: 'FILES',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    const root = astraRoot(ctx.homeDir)
    if (!fs.existsSync(root)) {
      return { ok: true, summary: 'پوشه ASTRA خالی است / The ASTRA folder is empty', data: { files: [] } }
    }
    const files: { path: string; size: number }[] = []
    const walk = (dir: string, rel: string, depth: number): void => {
      if (depth > 6 || files.length >= 500) return
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (files.length >= 500) return
        const relPath = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) {
          walk(path.join(dir, e.name), relPath, depth + 1)
        } else if (e.isFile()) {
          try {
            files.push({ path: relPath, size: fs.statSync(path.join(dir, e.name)).size })
          } catch {
            /* entry vanished — skip */
          }
        }
      }
    }
    walk(root, '', 0)
    files.sort((a, b) => a.path.localeCompare(b.path))
    return {
      ok: true,
      summary: `${files.length} فایل در Documents/ASTRA / ${files.length} files in Documents/ASTRA`,
      data: { files },
    }
  },
}
