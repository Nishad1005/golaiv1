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
      if (body?.error) return body.error as string
    } catch {
      /* fall through */
    }
  }
  return error.message
}
