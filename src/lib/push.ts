import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

/**
 * Register for push notifications on native builds (iOS/Android via FCM).
 * No-op on web — web users get the in-app alerts bell instead.
 *
 * Deployment prerequisites (one-time):
 * 1. Firebase project + google-services.json in android/app/
 * 2. FCM server key stored as a Supabase Edge Function secret
 * 3. Edge function 'send-alert-push' triggered on alerts insert
 */
export async function registerPush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  const perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return

  PushNotifications.addListener('registration', (token) => {
    void supabase
      .from('profiles')
      .update({ push_token: token.value, push_token_updated_at: new Date().toISOString() })
      .eq('id', userId)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.error('push registration failed:', err)
  })

  await PushNotifications.register()
}
