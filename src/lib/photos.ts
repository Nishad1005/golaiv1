import { supabase } from './supabase'

const MAX_BYTES = 1_000_000 // PRD 7.3: compress client-side before upload, max 1MB
const MAX_DIMENSION = 1600

/** Downscale + re-encode a photo until it fits under 1MB. */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= MAX_BYTES) return blob
    if (quality === 0.4 && blob) return blob // best effort
  }
  throw new Error('Could not compress photo')
}

/**
 * Compress and upload a photo to the tenant-namespaced private bucket.
 * Returns the storage path (rendered later via signed URLs, 1h expiry).
 */
export async function uploadPhoto(file: File, tenantId: string, folder: string): Promise<string> {
  const blob = await compressPhoto(file)
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: 'image/jpeg',
  })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return path
}

/** Get a temporary signed URL for a stored photo path. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}
