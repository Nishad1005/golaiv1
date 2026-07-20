// Storage locations. Golai never imposes warehouse vocabulary: the client types
// what they call a location type ("Ghoda", "Shelf", "Rack"), its first letter
// becomes the code prefix, and their word is echoed back everywhere.

/**
 * "Ghoda" → "G". Takes the first letter of the first word that actually starts
 * with one, so "1st Floor Bin" → "F" rather than "S" (which would collide with
 * "Shelf"). Falls back to "S" when nothing usable was typed.
 */
export function prefixFor(locationType: string): string {
  const match = locationType.trim().match(/(?:^|[^A-Za-z0-9])([A-Za-z])/)
  return (match?.[1] ?? 'S').toUpperCase()
}

/**
 * Human label for a location, in the client's own words.
 * Prefers an explicit description; otherwise derives "Ghoda 1" from the type
 * and the trailing number of the code (Z03-G001 → 1).
 */
export function locationLabel(place: {
  code: string
  fixture_type?: string | null
  description?: string | null
}): string {
  if (place.description?.trim()) return place.description.trim()
  const match = place.code.match(/-([A-Za-z]+)0*(\d+)$/)
  const type = place.fixture_type?.trim() || 'Location'
  return match ? `${type} ${Number(match[2])}` : place.code
}
