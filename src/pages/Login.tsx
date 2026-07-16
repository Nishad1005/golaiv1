import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { looksLikePhone, normalizePhone } from '../lib/phone'

const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Enter your email or mobile number')
    .refine(
      (v) => (looksLikePhone(v) ? normalizePhone(v) !== null : z.string().email().safeParse(v.trim()).success),
      'Enter a valid email or 10-digit mobile number',
    ),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export function Login() {
  const signIn = useAuth((s) => s.signIn)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginForm) => {
    setServerError(null)
    const { error } = await signIn(values.identifier, values.password)
    if (error) setServerError(error)
    // On success the auth store updates and the router redirects to the role home.
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-cream to-ink-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo.svg" alt="Golai" className="mx-auto mb-4 h-20 w-20 rounded-2xl shadow-lg" />
          <h1 className="text-3xl font-bold tracking-tight text-navy">Golai</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Golai runs the floor. Your ERP runs the books.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
          <div>
            <label className="label-text" htmlFor="identifier">Email or mobile number</label>
            <input
              id="identifier"
              type="text"
              className="input-field"
              placeholder="you@company.com or 9829012345"
              autoComplete="username"
              {...register('identifier')}
            />
            {errors.identifier && (
              <p className="mt-1 text-sm text-red-600">{errors.identifier.message}</p>
            )}
          </div>

          <div>
            <label className="label-text" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input-field"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
            )}
          </div>

          {serverError && <p className="text-sm text-red-600">{serverError}</p>}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
