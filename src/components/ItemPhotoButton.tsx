import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'
import { uploadPhoto } from '../lib/photos'
import { logActivity } from '../lib/audit'

/**
 * Add or replace a product's identification photo, from wherever a product is
 * being handled (Assign, Counts, the stock card). Opens the camera on mobile,
 * compresses + uploads, then sets items.photo_url through the guarded
 * set_item_photo RPC (so counting staff can do it without full item-write rights).
 * The parent gets the new path via onChanged and updates its own state.
 */
export function ItemPhotoButton({ itemId, hasPhoto, name, onChanged, className = 'btn-secondary', compact = false }: {
  itemId: string
  hasPhoto: boolean
  name?: string
  onChanged: (path: string) => void
  className?: string
  /** Icon-only button (no label), for tight rows. */
  compact?: boolean
}) {
  const { profile } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const path = await uploadPhoto(file, profile!.tenant_id, 'items')
      const { error } = await supabase.rpc('set_item_photo', { p_item_id: itemId, p_photo_url: path })
      if (error) throw new Error(error.message)
      await logActivity({
        tenantId: profile!.tenant_id, userId: profile!.id, userRole: profile!.role,
        action: 'update.item_photo', entityType: 'item', entityId: itemId, after: { name },
      })
      onChanged(path)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const label = hasPhoto ? 'Replace photo' : 'Add photo'
  return (
    <>
      {compact ? (
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-white hover:text-brand-600 disabled:opacity-50"
          disabled={busy} onClick={() => inputRef.current?.click()}
          aria-label={`${label}${name ? ` for ${name}` : ''}`} title={label}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </button>
      ) : (
        <button type="button" className={className} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          {label}
        </button>
      )}
      <input
        ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  )
}
