/**
 * Windows app launcher tools — fixed allowlist, no terminals (CONTRACTS.md §11).
 */
import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ToolDef, ToolResult } from '../types'
import { astraRoot } from './filesystem'

export const ALLOWED_APPS = ['chrome', 'code', 'notepad', 'explorer', 'calc', 'mspaint'] as const
export type AllowedApp = (typeof ALLOWED_APPS)[number]

/** Explicitly forbidden — the model must never be able to launch these. */
const FORBIDDEN_APPS = new Set(['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'wsl', 'regedit', 'taskmgr', 'tasklist'])

/** Launch strategy per allowed app. */
export const APPS: Record<AllowedApp, { strategy: 'chrome' | 'where' | 'direct'; direct?: string }> = {
  chrome: { strategy: 'chrome' },
  code: { strategy: 'where' },
  notepad: { strategy: 'direct', direct: 'notepad' },
  explorer: { strategy: 'direct', direct: 'explorer' },
  calc: { strategy: 'direct', direct: 'calc' },
  mspaint: { strategy: 'direct', direct: 'mspaint' },
}

const WIN_ONLY = 'این قابلیت فقط در ویندوز کار می‌کند / This feature works on Windows only'

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Pure security check: the resolved path must be inside the user profile and never hit system folders. */
export function isAllowedPath(resolved: string, homeDir: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
  const r = norm(resolved)
  const h = norm(homeDir)
  if (!h) return false
  if (r.toLowerCase() === h.toLowerCase()) return true
  if (!r.toLowerCase().startsWith(`${h.toLowerCase()}/`)) return false
  const rel = r.slice(h.length)
  if (/(^|\/)\.\.(\/|$)/.test(rel)) return false
  if (/(^|\/)(windows|system32|program files|program files \(x86\))(\/|$)/i.test(rel)) return false
  return true
}

function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

function chromeCandidates(): string[] {
  const bases = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LocalAppData']].filter(
    (b): b is string => !!b,
  )
  return bases.map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'))
}

function launchChrome(): void {
  for (const candidate of chromeCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        spawnDetached(candidate, [])
        return
      }
    } catch {
      /* try next candidate */
    }
  }
  spawnDetached('cmd', ['/c', 'start', 'chrome'])
}

function launchCode(): void {
  const where = spawnSync('where', ['code'], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
  const first =
    where.status === 0 && typeof where.stdout === 'string'
      ? where.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      : undefined
  if (!first) throw new Error('VS Code (code) در PATH پیدا نشد / VS Code was not found in PATH')
  spawnDetached(first, [])
}

export const openApp: ToolDef = {
  name: 'open_app',
  description: `Launch an allowed Windows application: ${ALLOWED_APPS.join(', ')}. Terminals are never allowed. اجرای برنامه‌های مجاز ویندوز.`,
  permission: 'WINDOWS_APPS',
  parameters: {
    type: 'object',
    properties: {
      app: { type: 'string', enum: [...ALLOWED_APPS], description: 'Application key.' },
    },
    required: ['app'],
  },
  async execute(args): Promise<ToolResult> {
    if (process.platform !== 'win32') return { ok: false, summary: WIN_ONLY }
    const app = (typeof args?.app === 'string' ? args.app : '').trim().toLowerCase()
    if (!app) return { ok: false, summary: 'نام برنامه خالی است / App name is empty' }
    if (FORBIDDEN_APPS.has(app)) {
      return { ok: false, summary: 'اجرای ترمینال‌ها و ابزار سیستمی مجاز نیست / Launching terminals and system tools is not allowed' }
    }
    if (!ALLOWED_APPS.includes(app as AllowedApp)) {
      return {
        ok: false,
        summary: `برنامه مجاز نیست — مجازها: ${ALLOWED_APPS.join(', ')} / App not allowed — allowed: ${ALLOWED_APPS.join(', ')}`,
      }
    }
    try {
      const def = APPS[app as AllowedApp]
      if (def.strategy === 'chrome') launchChrome()
      else if (def.strategy === 'where') launchCode()
      else spawnDetached(def.direct ?? app, [])
    } catch (err) {
      return { ok: false, summary: `اجرای برنامه ناموفق بود / Failed to launch the app: ${errMessage(err)}` }
    }
    return { ok: true, summary: `«${app}» اجرا شد / Launched ${app}` }
  },
}

export const openPath: ToolDef = {
  name: 'open_path',
  description:
    'Open a file or folder in Windows Explorer (restricted to the user profile; never Windows/System32/Program Files). باز کردن مسیر در اکسپلورر.',
  permission: 'WINDOWS_APPS',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path, or relative to the user home (~/ allowed).' },
    },
    required: ['path'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    if (process.platform !== 'win32') return { ok: false, summary: WIN_ONLY }
    let p = (typeof args?.path === 'string' ? args.path : '').trim()
    if (!p) return { ok: false, summary: 'مسیر خالی است / Path is empty' }
    if (p === '~') p = ctx.homeDir
    else if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(ctx.homeDir, p.slice(2))

    const resolved = path.isAbsolute(p) ? p : path.join(ctx.homeDir, p)
    if (!isAllowedPath(resolved, ctx.homeDir)) {
      return {
        ok: false,
        summary:
          'این مسیر مجاز نیست — فقط زیرمسیرهای پروفایل کاربر (بدون Windows/System32/Program Files) / Path not allowed — only user-profile subpaths (never Windows/System32/Program Files)',
      }
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(resolved)
    } catch {
      return { ok: false, summary: `مسیر وجود ندارد: ${resolved} / Path does not exist: ${resolved}` }
    }
    try {
      if (stat.isDirectory()) {
        spawnDetached('explorer.exe', [resolved])
        return { ok: true, summary: `پوشه باز شد: ${resolved} / Opened folder: ${resolved}`, data: { path: resolved, kind: 'directory' } }
      }
      spawnDetached('explorer.exe', ['/select,', resolved])
      return { ok: true, summary: `فایل در اکسپلورر انتخاب شد: ${resolved} / Selected file in Explorer: ${resolved}`, data: { path: resolved, kind: 'file' } }
    } catch (err) {
      return { ok: false, summary: `باز کردن مسیر ناموفق بود / Failed to open the path: ${errMessage(err)}` }
    }
  },
}

/** Strips characters Windows forbids in folder names + trims dots. */
export function sanitizeFolderName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
}

export const createFolder: ToolDef = {
  name: 'create_folder',
  description: "Create a folder either in Documents/ASTRA (default) or on the Desktop. ساخت پوشه جدید.",
  permission: 'FILES',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Folder name (no paths).' },
      where: { type: 'string', enum: ['Documents/ASTRA', 'Desktop'], description: 'Base location (default Documents/ASTRA).' },
    },
    required: ['name'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const name = sanitizeFolderName(typeof args?.name === 'string' ? args.name : '')
    if (!name) return { ok: false, summary: 'نام پوشه نامعتبر است / Folder name is invalid' }
    const where = args?.where === 'Desktop' ? 'Desktop' : 'Documents/ASTRA'
    const base = where === 'Desktop' ? path.join(ctx.homeDir, 'Desktop') : astraRoot(ctx.homeDir)
    const dir = path.join(base, name)
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      return { ok: false, summary: `ساخت پوشه ناموفق بود / Failed to create the folder: ${errMessage(err)}` }
    }
    return { ok: true, summary: `پوشه ساخته شد: ${dir} / Folder created: ${dir}`, data: { path: dir } }
  },
}

export const showDownloads: ToolDef = {
  name: 'show_downloads',
  description: 'Open the user Downloads folder in Explorer. باز کردن پوشه Downloads.',
  permission: 'WINDOWS_APPS',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    if (process.platform !== 'win32') return { ok: false, summary: WIN_ONLY }
    const downloads = path.join(ctx.homeDir, 'Downloads')
    try {
      fs.mkdirSync(downloads, { recursive: true })
      spawnDetached('explorer.exe', [downloads])
    } catch (err) {
      return { ok: false, summary: `باز کردن Downloads ناموفق بود / Failed to open Downloads: ${errMessage(err)}` }
    }
    return { ok: true, summary: 'پوشه Downloads باز شد / Opened the Downloads folder' }
  },
}
