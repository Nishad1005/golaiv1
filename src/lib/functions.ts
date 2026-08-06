// Helpers for calling Supabase Edge Functions from the client.

/**
 * supabase-js hides an edge function's JSON error body on any non-2xx response —
 * `error.message` is just "Edge Function returned a non-2xx status code". The
 * real message ("User not found in your company", etc.) is in the attached
 * Response; read it back so the UI can show what actually went wrong.
 */
export async function invokeError(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      // Our functions return { error }. The functions gateway itself (e.g. a
      // function that isn't deployed) returns { message }/{ msg } — surface
      // those too, otherwise the caller only ever sees the opaque
      // "Edge Function returned a non-2xx status code".
      const msg = body?.error ?? body?.message ?? body?.msg
      if (typeof msg === 'string' && msg) {
        if (ctx.status === 404 && /not\s*found/i.test(msg)) {
          return 'This feature is not deployed yet — its edge function needs deploying on Supabase, then try again.'
        }
        return msg
      }
    } catch {
      /* fall through */
    }
  }
  if ((ctx as Response | undefined)?.status === 404) {
    return 'This feature is not deployed yet — its edge function needs deploying on Supabase, then try again.'
  }
  return error.message
}
