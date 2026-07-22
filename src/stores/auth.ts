import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { looksLikePhone, normalizePhone } from '../lib/phone'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialize: () => Promise<void>
  /** Re-read the profile row — after the user edits their own card, say. */
  refreshProfile: () => Promise<void>
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('failed to load profile:', error.message)
    return null
  }
  return data as Profile
}

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  initialize: async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const profile = session ? await fetchProfile(session.user.id) : null
    set({ session, profile, loading: false })

    supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const newProfile = newSession ? await fetchProfile(newSession.user.id) : null
      set({ session: newSession, profile: newProfile, loading: false })
    })
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id
    if (!userId) return
    const profile = await fetchProfile(userId)
    if (profile) set({ profile })
  },

  // `identifier` is an email or a phone number — floor staff often have no email.
  signIn: async (identifier, password) => {
    const phone = looksLikePhone(identifier) ? normalizePhone(identifier) : null
    const { error } = phone
      ? await supabase.auth.signInWithPassword({ phone, password })
      : await supabase.auth.signInWithPassword({ email: identifier.trim(), password })
    return { error: error ? error.message : null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))
