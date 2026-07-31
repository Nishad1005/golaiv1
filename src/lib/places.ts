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

/** Block number → letter: 1 → "A", 2 → "B"… ("#27" past Z). */
export function blockLetter(block: number): string {
  return block >= 1 && block <= 26 ? String.fromCharCode(64 + block) : `#${block}`
}

/** Coordinate label for a pallet in a block: "Block B · Row 2 · Col 3". */
export function palletLabel(block: number, row: number, col: number): string {
  return `Block ${blockLetter(block)} · Row ${row} · Col ${col}`
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
