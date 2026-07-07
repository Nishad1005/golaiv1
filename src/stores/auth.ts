import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
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

export const useAuth = create<AuthState>((set) => ({
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

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))
