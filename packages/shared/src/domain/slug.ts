import { LIMITS } from '../constants/domain'

/**
 * Turns a display name into a URL slug that satisfies the database CHECK
 * constraint (`^[a-z0-9]+(-[a-z0-9]+)*$`). Accents are folded ("Café" ->
 * "cafe"); anything else non-alphanumeric becomes a hyphen.
 *
 * Returns an empty string when nothing usable remains (e.g. an emoji-only
 * name); callers must then fall back to a generated slug. Uniqueness (suffixing
 * "-2", "-3", ...) is the caller's job because it needs a database lookup.
 */
export function slugify(input: string, maxLength: number = LIMITS.SLUG_MAX): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '')
}
