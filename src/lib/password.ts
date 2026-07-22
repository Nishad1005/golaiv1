/** Shortest password Supabase (and we) will accept. */
export const MIN_PASSWORD_LENGTH = 8

export interface PasswordStrength {
  /** 0 = nothing typed, 1 = Weak … 4 = Strong. Drives the meter on My Account. */
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

/**
 * A rough strength hint for the change-password meter — length first, character
 * variety second. Deliberately not a dictionary check: this only nudges people
 * away from something too short, it never blocks them (the only hard rule is
 * MIN_PASSWORD_LENGTH). A long all-lowercase passphrase scores well, which is
 * correct — it is genuinely harder to guess than "P@ss1".
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '' }
  if (password.length < MIN_PASSWORD_LENGTH) return { score: 1, label: 'Weak' }

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length

  let score: PasswordStrength['score'] = 2
  if (password.length >= 12 || variety >= 3) score = 3
  if ((password.length >= 12 && variety >= 3) || password.length >= 16) score = 4

  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] }
}
