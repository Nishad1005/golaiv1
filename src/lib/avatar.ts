import { supabase } from './supabase'

/** Public URL for a photo stored in the avatars bucket (see migration 0018). */
export function avatarPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path // tolerate a full URL stored directly
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/** "Rajesh Kumar Sharma" → "RS". Used wherever there is no photo yet. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
