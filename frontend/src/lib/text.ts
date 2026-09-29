/** ASTRA renderer — small text helpers shared across modes. */

const PERSIAN_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/

/** True when the text should render right-to-left. */
export function isPersian(text: string): boolean {
  return PERSIAN_RE.test(text)
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
