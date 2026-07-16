// Phone-number handling for logins. Supabase stores phones in E.164
// (+919829012345), so everything the user types must normalize to that.
// Default country is India (+91) — Golai's pilot market.

const DEFAULT_COUNTRY = '+91'

/**
 * True when the input looks like a phone number rather than an email/username:
 * only digits, separators (space, dash, dot, parens) and an optional leading +.
 */
export function looksLikePhone(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false
  return /^\+?[\d\s\-().]+$/.test(trimmed) && /\d{6,}/.test(trimmed.replace(/\D/g, ''))
}

/**
 * Normalize a typed phone number to E.164, or return null when it can't be a
 * valid phone. Handles: "98290 12345", "098290-12345", "+91 98290 12345".
 */
export function normalizePhone(input: string, defaultCountry = DEFAULT_COUNTRY): string | null {
  const trimmed = input.trim()
  if (!trimmed || /[a-zA-Z@]/.test(trimmed)) return null

  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  if (hasPlus) {
    // Already international — just validate a sane length (E.164 max 15)
    return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null
  }

  // Domestic formats: strip one leading trunk zero ("098290..." → "98290...")
  if (digits.startsWith('0')) digits = digits.slice(1)

  // Bare 10-digit Indian mobile → +91XXXXXXXXXX
  if (digits.length === 10) return defaultCountry + digits

  // "919829012345" typed without the + (12 digits starting with country code)
  const cc = defaultCountry.slice(1)
  if (digits.length === 10 + cc.length && digits.startsWith(cc)) return '+' + digits

  return null
}
