// Minimal IndexedDB wrapper for the offline layer.
// Stores: 'queue' (pending actions), 'kv' (cached master data).

const DB_NAME = 'golai-offline'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode)
        const req = fn(t.objectStore(storeName))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idb = {
  queueAdd: (item: unknown) => tx('queue', 'readwrite', (s) => s.add(item)),
  queueAll: <T>() => tx<T[]>('queue', 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  queueDelete: (id: string) => tx('queue', 'readwrite', (s) => s.delete(id)),
  queueCount: () => tx<number>('queue', 'readonly', (s) => s.count()),
  kvSet: (key: string, value: unknown) => tx('kv', 'readwrite', (s) => s.put(value, key)),
  kvGet: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
}
