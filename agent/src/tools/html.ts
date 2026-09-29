/**
 * Small HTML → text helpers shared by the web tools (no dependencies).
 */

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#160;': ' ',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&laquo;': '«',
  '&raquo;': '»',
  '&copy;': '©',
  '&reg;': '®',
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return ''
  try {
    return String.fromCodePoint(n)
  } catch {
    return ''
  }
}

/** Decode the common HTML entities (`&amp;`, `&#x27;`, `&quot;`, numeric, …). */
export function decodeEntities(input: string): string {
  let out = input.replace(
    /&(amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|rsquo|lsquo|ldquo|rdquo|laquo|raquo|copy|reg|#39|#x27|#160);/gi,
    (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m,
  )
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
  out = out.replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number(dec)))
  return out
}

/** Remove all HTML tags (replaced by spaces). */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

/** Strip tags, decode entities and collapse whitespace into one line. */
export function cleanText(input: string): string {
  return decodeEntities(stripTags(input)).replace(/\s+/g, ' ').trim()
}

/**
 * Convert an HTML document into readable plain text:
 * drops script/style/noscript/comments, turns block ends into newlines,
 * strips the remaining tags, decodes entities and collapses whitespace.
 */
export function htmlToText(html: string): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
  return text
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
