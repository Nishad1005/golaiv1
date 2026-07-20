import { useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { logActivity } from '../lib/audit'
import { PageHeader } from '../components/PageHeader'

const ROLE_LABELS: Record<string, string> = {
  security: 'Security',
  storekeeper: 'Storekeeper',
  planner: 'Production Planner',
  manager: 'Manager',
  admin: 'Admin',
}

const MIN_LENGTH = 8

/**
 * My Account — every user can change their own password here. Staff are created
 * with an admin-issued temporary password, so this is how they replace it.
 * Uses supabase.auth.updateUser (the user is already authenticated; no
 * service-role/edge function involved).
 */
export function Account() {
  const { profile, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)

  const changePassword = useMutation({
    mutationFn: async () => {
      if (password.length < MIN_LENGTH) {
        throw new Error(`Password must be at least ${MIN_LENGTH} characters.`)
      }
      if (password !== confirm) throw new Error('The two passwords do not match.')

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)

      await logActivity({
        tenantId: profile!.tenant_id,
        userId: profile!.id,
        userRole: profile!.role,
        action: 'update.own_password',
        entityType: 'profile',
        entityId: profile!.id,
      })
    },
    onSuccess: () => {
      setDone(true)
      setPassword('')
      setConfirm('')
    },
  })

  return (
    <div className="space-y-4">
      <PageHeader title="My Account" subtitle="Your details and password." />

      <div className="card space-y-1">
        <p className="text-lg font-semibold">{profile?.full_name}</p>
        <p className="text-sm text-ink-500">
          {[profile?.email, profile?.phone].filter(Boolean).join(' · ')}
        </p>
        <p className="text-sm text-ink-400">Role: {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</p>
      </div>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setDone(false)
          changePassword.mutate()
        }}
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-500" />
          <p className="font-semibold">Change password</p>
        </div>
        <p className="text-sm text-ink-400">
          If you signed in with a temporary password given by your admin, set your own here.
        </p>

        <div>
          <label className="label-text" htmlFor="new-password">New password</label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              className="input-field pr-14"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-400">At least {MIN_LENGTH} characters.</p>
        </div>

        <div>
          <label className="label-text" htmlFor="confirm-password">Repeat new password</label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            className="input-field"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        {changePassword.isError && (
          <p className="text-sm text-red-600">{(changePassword.error as Error).message}</p>
        )}
        {done && (
          <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Password changed. Use it the next time you sign in.
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={changePassword.isPending}>
          {changePassword.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Update password
        </button>
      </form>

      <button className="btn-secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  )
}
