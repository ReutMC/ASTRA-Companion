/**
 * Shared HTTP error mapping for AI providers — clean bilingual messages, no stack noise.
 */

/** Reads the first 200 chars of an error body (never throws). */
export async function safeErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200)
  } catch {
    return ''
  }
}

/** Maps an HTTP error status to a friendly Error (Persian first, English after " / "). */
export function describeHttpError(status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new Error(
      `کلید API نامعتبر یا بدون دسترسی است — آن را در Settings → AI بررسی کنید / Invalid or unauthorized API key — check Settings → AI (HTTP ${status})`,
    )
  }
  if (status === 404) {
    return new Error(
      `مدل یا نشانی سرویس پیدا نشد — endpoint و model را در Settings → AI بررسی کنید / Model or endpoint not found — check Settings → AI (HTTP 404) ${body}`,
    )
  }
  if (status === 429) {
    return new Error(
      `محدودیت نرخ سرویس هوش مصنوعی — چند لحظه بعد دوباره تلاش کنید / AI service rate-limited — try again shortly (HTTP 429) ${body}`,
    )
  }
  return new Error(`خطای سرویس هوش مصنوعی (HTTP ${status}): ${body} / AI service error (HTTP ${status}): ${body}`)
}

/** Wraps a network-level failure (DNS, TLS, offline, abort pass-through). */
export function networkErrorMessage(err: unknown): Error {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return err
  const msg = err instanceof Error ? err.message : String(err)
  return new Error(`خطای شبکه در ارتباط با سرویس هوش مصنوعی / Network error contacting the AI service: ${msg}`)
}
