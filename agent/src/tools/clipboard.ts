/**
 * `copy_to_clipboard` — Windows clipboard via PowerShell.
 * The text goes through a temp file so no escaping/quoting issues are possible.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ToolDef, ToolResult } from '../types'

export const copyToClipboard: ToolDef = {
  name: 'copy_to_clipboard',
  description: 'Copy text to the Windows clipboard (requires CLIPBOARD permission). کپی متن در کلیپ‌بورد.',
  permission: 'CLIPBOARD',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to copy.' },
    },
    required: ['text'],
  },
  async execute(args): Promise<ToolResult> {
    if (process.platform !== 'win32') {
      return { ok: false, summary: 'فقط در ویندوز کار می‌کند / Windows only' }
    }
    const text = typeof args?.text === 'string' ? args.text : ''
    if (!text) return { ok: false, summary: 'متنی برای کپی نیست / Nothing to copy' }
    if (text.length > 5_000_000) {
      return { ok: false, summary: 'متن بیش از حد بزرگ است (حداکثر ۵ مگابایت) / Text is too large (5 MB max)' }
    }

    const tmp = path.join(os.tmpdir(), `astra-clip-${randomUUID()}.txt`)
    try {
      fs.writeFileSync(tmp, text, 'utf8')
    } catch (err) {
      return { ok: false, summary: `ساخت فایل موقت ناموفق بود / Failed to create the temp file: ${err instanceof Error ? err.message : String(err)}` }
    }
    try {
      const res = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Get-Content -Raw -LiteralPath "${tmp}" | Set-Clipboard`],
        { timeout: 10000, windowsHide: true },
      )
      if (res.error || res.status !== 0) {
        const detail = res.error?.message ?? String(res.stderr ?? '').slice(0, 160)
        return { ok: false, summary: `کپی در کلیپ‌بورد ناموفق بود / Clipboard copy failed: ${detail}` }
      }
    } finally {
      try {
        fs.rmSync(tmp, { force: true })
      } catch {
        /* temp cleanup is best-effort */
      }
    }
    return { ok: true, summary: `در کلیپ‌بورد کپی شد (${text.length} نویسه) / Copied to clipboard (${text.length} chars)` }
  },
}
