// http(s) URLs only; anything else (javascript:, data:, …) stays plain text.
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
// Punctuation that usually ends a sentence rather than the URL.
const TRAILING = /[).,;:!?\]}'"]+$/

/** Splits text into plain strings and safe http(s) links (no HTML involved). */
export function linkify(text: string): ({ text: string } | { href: string })[] {
  const parts: ({ text: string } | { href: string })[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0]
    const trailing = TRAILING.exec(raw)?.[0] ?? ''
    const url = raw.slice(0, raw.length - trailing.length)
    const start = match.index
    if (start > last) parts.push({ text: text.slice(last, start) })
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') parts.push({ href: url })
      else parts.push({ text: url })
    } catch {
      parts.push({ text: url })
    }
    last = start + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
