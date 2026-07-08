import { create } from 'zustand'
import { supabase } from '../supabase'
import { compressPhoto } from '../photos'
import { idb } from './db'

// ---------------------------------------------------------------------------
// Offline action queue (PRD 7.5): floor transactions captured while offline
// are stored locally (including photos as data URLs) and replayed in order
// when connectivity returns. Server RPCs re-validate everything on sync, so a
// stale offline action fails loudly rather than corrupting stock.
// ---------------------------------------------------------------------------

export type QueuedType = 'capture' | 'transfer' | 'grn_gate_entry'

export interface QueuedAction {
  id: string
  type: QueuedType
  /** RPC params minus photo paths (photos uploaded at sync time). */
  payload: Record<string, unknown>
  /** photo-param name → array of data URLs, uploaded to `folder` on sync. */
  photos: Record<string, string[]>
  folder: string
  tenant_id: string
  queued_at: string
}

export interface SyncError {
  id: string
  type: QueuedType
  message: string
  queued_at: string
}

interface OfflineState {
  online: boolean
  pending: number
  syncing: boolean
  errors: SyncError[]
  init: () => Promise<void>
  enqueue: (
    type: QueuedType,
    payload: Record<string, unknown>,
    photoFiles: Record<string, File[]>,
    folder: string,
    tenantId: string,
  ) => Promise<void>
  sync: () => Promise<void>
  dismissError: (id: string) => void
}

async function fileToDataUrl(file: File): Promise<string> {
  const blob = await compressPhoto(file)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

const RPC_BY_TYPE: Record<QueuedType, string> = {
  capture: 'capture_entry',
  transfer: 'transfer_stock',
  grn_gate_entry: 'create_grn_gate_entry',
}

export const useOffline = create<OfflineState>((set, get) => ({
  online: navigator.onLine,
  pending: 0,
  syncing: false,
  errors: [],

  init: async () => {
    set({ pending: await idb.queueCount() })
    window.addEventListener('online', () => {
      set({ online: true })
      void get().sync()
    })
    window.addEventListener('offline', () => set({ online: false }))
    if (navigator.onLine) void get().sync()
  },

  enqueue: async (type, payload, photoFiles, folder, tenantId) => {
    const photos: Record<string, string[]> = {}
    for (const [field, files] of Object.entries(photoFiles)) {
      photos[field] = await Promise.all(files.map(fileToDataUrl))
    }
    const action: QueuedAction = {
      id: crypto.randomUUID(),
      type,
      payload,
      photos,
      folder,
      tenant_id: tenantId,
      queued_at: new Date().toISOString(),
    }
    await idb.queueAdd(action)
    set({ pending: await idb.queueCount() })
  },

  sync: async () => {
    if (get().syncing || !navigator.onLine) return
    set({ syncing: true })
    try {
      const actions = await idb.queueAll<QueuedAction>()
      actions.sort((a, b) => a.queued_at.localeCompare(b.queued_at))

      for (const action of actions) {
        try {
          // Upload queued photos, then splice paths into the RPC params
          const params: Record<string, unknown> = { ...action.payload }
          for (const [field, dataUrls] of Object.entries(action.photos)) {
            const paths: string[] = []
            for (const dataUrl of dataUrls) {
              const blob = await dataUrlToBlob(dataUrl)
              const path = `${action.tenant_id}/${action.folder}/${crypto.randomUUID()}.jpg`
              const { error } = await supabase.storage.from('photos').upload(path, blob, {
                contentType: 'image/jpeg',
              })
              if (error) throw new Error(`photo upload: ${error.message}`)
              paths.push(path)
            }
            params[field] = paths
          }

          const { error } = await supabase.rpc(RPC_BY_TYPE[action.type], params)
          if (error) throw new Error(error.message)

          await idb.queueDelete(action.id)
        } catch (e) {
          // Keep the action queued only for transient (network) failures;
          // permanent rejections surface as errors and are dropped.
          const message = (e as Error).message
          const transient = !navigator.onLine || /fetch|network|timeout/i.test(message)
          if (!transient) {
            await idb.queueDelete(action.id)
            set({
              errors: [
                ...get().errors,
                { id: action.id, type: action.type, message, queued_at: action.queued_at },
              ],
            })
          }
          if (transient) break // stop syncing, retry when connectivity is back
        }
      }
    } finally {
      set({ syncing: false, pending: await idb.queueCount() })
    }
  },

  dismissError: (id) => set({ errors: get().errors.filter((e) => e.id !== id) }),
}))
