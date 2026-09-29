/**
 * Chrome browser-control tools — talk to the MV3 extension through the native-messaging
 * bridge (`ctx.chrome`). Actions: get_context / get_elements / act / screenshot.
 */
import type { ChromeBridge, ToolContext, ToolDef, ToolResult } from '../types'

const CHROME_UNAVAILABLE =
  'اتصال به کروم در دسترس نیست — افزونه و Native Host را نصب و راه‌اندازی کنید / Chrome connection unavailable — install the extension and native host'

const ACT_LABELS: Record<string, { fa: string; en: string }> = {
  click: { fa: 'کلیک روی عنصر', en: 'Clicking element' },
  type: { fa: 'تایپ متن در عنصر', en: 'Typing text' },
  scroll: { fa: 'اسکرول صفحه', en: 'Scrolling the page' },
  navigate: { fa: 'باز کردن نشانی', en: 'Navigating' },
  key: { fa: 'فشردن کلید', en: 'Pressing key' },
  select: { fa: 'انتخاب گزینه', en: 'Selecting option' },
  hover: { fa: 'قرار دادن نشانگر روی عنصر', en: 'Hovering element' },
}

/** Kinds that mutate page state — confirmed when `settings.browser.confirmActions` is on. */
const CONFIRM_KINDS = new Set(['click', 'type', 'navigate', 'select', 'key'])

function chromeUnavailable(): ToolResult {
  return { ok: false, summary: CHROME_UNAVAILABLE }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function requireChrome(ctx: ToolContext): ChromeBridge | null {
  return ctx.chrome && ctx.chrome.connected() ? ctx.chrome : null
}

export const browserContext: ToolDef = {
  name: 'browser_context',
  description:
    'Read the active Chrome tab: {url, title, selection}. Always call this first when operating the browser. خواندن وضعیت مرورگر.',
  permission: 'BROWSER',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    const chrome = requireChrome(ctx)
    if (!chrome) return chromeUnavailable()
    ctx.emit({ type: 'activity', text: 'خواندن صفحه فعال کروم… / Reading the active Chrome tab…' })
    try {
      const data = await chrome.request('get_context', undefined, 10000)
      const url = typeof data?.url === 'string' ? data.url : ''
      const title = typeof data?.title === 'string' ? data.title : ''
      const selection = typeof data?.selection === 'string' ? data.selection : ''
      const label = title || url || 'unknown'
      return {
        ok: true,
        summary: `صفحه فعال: ${label} / Active page: ${label}`,
        data: { url, title, selection },
      }
    } catch (err) {
      return { ok: false, summary: `خطای ارتباط با کروم / Chrome bridge error: ${errMessage(err)}` }
    }
  },
}

export const browserElements: ToolDef = {
  name: 'browser_elements',
  description:
    'List interactive elements of the active tab ({id, role, text, ariaLabel, x, y, w, h, tag, placeholder, value}). Pick an element id, then call browser_act. فهرست عناصر صفحه.',
  permission: 'BROWSER',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Maximum number of elements to return (default 120).' },
    },
  },
  async execute(args, ctx): Promise<ToolResult> {
    const chrome = requireChrome(ctx)
    if (!chrome) return chromeUnavailable()
    const limit =
      typeof args?.limit === 'number' && Number.isFinite(args.limit) ? Math.min(500, Math.max(1, Math.floor(args.limit))) : 120
    ctx.emit({ type: 'activity', text: 'فهرست‌کردن عناصر صفحه… / Listing page elements…' })
    try {
      const data = await chrome.request('get_elements', { limit }, 10000)
      const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.elements) ? data.elements : []
      return {
        ok: true,
        summary: `${list.length} عنصر پیدا شد / ${list.length} elements found`,
        data: { elements: list.slice(0, limit) },
      }
    } catch (err) {
      return { ok: false, summary: `خطای ارتباط با کروم / Chrome bridge error: ${errMessage(err)}` }
    }
  },
}

export const browserAct: ToolDef = {
  name: 'browser_act',
  description:
    'Act on the active Chrome tab. kind: click | type | scroll | navigate | key | select | hover. Use elementId from browser_elements; navigate takes url; type takes text; key takes key ("Enter", "Tab", …). Select option with option. اجرای عملیات در مرورگر.',
  permission: 'BROWSER',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['click', 'type', 'scroll', 'navigate', 'key', 'select', 'hover'] },
      elementId: { type: 'string', description: 'Element id from browser_elements.' },
      text: { type: 'string', description: 'Text to type (kind=type).' },
      url: { type: 'string', description: 'URL to open (kind=navigate).' },
      key: { type: 'string', description: 'Key name (kind=key), e.g. "Enter".' },
      x: { type: 'number', description: 'X coordinate (kind=scroll / hover fallback).' },
      y: { type: 'number', description: 'Y coordinate (kind=scroll / hover fallback).' },
      option: { type: 'string', description: 'Option value/label (kind=select).' },
    },
    required: ['kind'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    const chrome = requireChrome(ctx)
    if (!chrome) return chromeUnavailable()
    const kind = typeof args?.kind === 'string' ? args.kind : ''
    if (!(kind in ACT_LABELS)) {
      return { ok: false, summary: `نوع عملیات نامعتبر: «${kind.slice(0, 40)}» / Invalid action kind: "${kind.slice(0, 40)}"` }
    }
    const labels = ACT_LABELS[kind]

    if (CONFIRM_KINDS.has(kind) && ctx.settings.browser?.confirmActions === true) {
      const target = [args?.elementId, args?.url, args?.key, args?.option, args?.text]
        .map((v) => (typeof v === 'string' ? v : ''))
        .find((v) => v.length > 0)
      const ok = await ctx.confirm(
        'عمل در مرورگر',
        `ASTRA می‌خواهد «${labels.fa}» ${target ? `روی «${String(target).slice(0, 80)}»` : ''} انجام دهد. اجازه می‌دهید؟ / ASTRA wants to ${labels.en}${target ? ` on "${String(target).slice(0, 80)}"` : ''}. Allow?`,
      )
      if (!ok) return { ok: false, summary: 'رد شد توسط کاربر / Cancelled by user' }
    }

    ctx.emit({ type: 'activity', text: `${labels.fa}… / ${labels.en}…` })
    const payload: Record<string, unknown> = { kind }
    for (const key of ['elementId', 'text', 'url', 'key', 'x', 'y', 'option'] as const) {
      if (args?.[key] !== undefined && args?.[key] !== null) payload[key] = args[key]
    }
    try {
      const data = await chrome.request('act', payload, 20000)
      return { ok: true, summary: `${labels.fa} انجام شد / ${labels.en} done`, data }
    } catch (err) {
      return { ok: false, summary: `${labels.fa} ناموفق بود / ${labels.en} failed: ${errMessage(err)}` }
    }
  },
}

export const browserScreenshot: ToolDef = {
  name: 'browser_screenshot',
  description:
    'Capture a PNG screenshot of the active Chrome tab (requires SCREEN_CAPTURE permission). Returns the image data in `data.image`. گرفتن اسکرین‌شات از مرورگر.',
  permission: 'BROWSER',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx): Promise<ToolResult> {
    if (ctx.settings.permissions.SCREEN_CAPTURE !== true) {
      return {
        ok: false,
        summary:
          'اجازه ضبط صفحه خاموش است — Settings → Permissions → SCREEN_CAPTURE را روشن کنید / Screen-capture permission is off — enable it in Settings → Permissions',
      }
    }
    const chrome = requireChrome(ctx)
    if (!chrome) return chromeUnavailable()
    ctx.emit({ type: 'activity', text: 'گرفتن اسکرین‌شات از کروم… / Capturing Chrome screenshot…' })
    try {
      const data = await chrome.request('screenshot', { format: 'png' }, 25000)
      const image =
        typeof data?.dataUrl === 'string'
          ? data.dataUrl
          : typeof data?.base64 === 'string'
            ? data.base64
            : typeof data?.image === 'string'
              ? data.image
              : ''
      if (!image) return { ok: false, summary: 'اسکرین‌شات دریافت نشد / No screenshot was returned' }
      const kb = Math.round((image.length * 3) / 4 / 1024)
      return { ok: true, summary: `اسکرین‌شات گرفته شد (~${kb} KB) / Screenshot captured (~${kb} KB)`, data: { image } }
    } catch (err) {
      return { ok: false, summary: `خطای اسکرین‌شات / Screenshot error: ${errMessage(err)}` }
    }
  },
}
