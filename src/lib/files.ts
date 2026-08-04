import { supabase } from './supabase'

/**
 * Upload a file as-is (no image compression) to the tenant-namespaced private
 * `photos` bucket. For non-image references like a requisition PDF — the image
 * sibling is uploadPhoto() in photos.ts. View later via signedPhotoUrl().
 */
export async function uploadFile(file: File, tenantId: string, folder: string): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}
