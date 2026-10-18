/**
 * Parses a raw `Cookie` header. Express routes use cookie-parser; this exists
 * for the Socket.IO handshake, which bypasses the Express middleware stack.
 */
export function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue

    const name = pair.slice(0, separator).trim()
    // The first occurrence wins, matching browser and cookie-parser behaviour.
    if (!name || cookies.has(name)) continue

    let value = pair.slice(separator + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      cookies.set(name, value)
    }
  }
  return cookies
}
