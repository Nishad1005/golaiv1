import { useEffect, useState } from 'react'
import { signedPhotoUrl } from '../lib/photos'

/** Renders stored photo paths as thumbnails via short-lived signed URLs. */
export function PhotoGallery({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<(string | null)[]>([])

  useEffect(() => {
    let cancelled = false
    void Promise.all(paths.map(signedPhotoUrl)).then((resolved) => {
      if (!cancelled) setUrls(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [paths])

  if (paths.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) =>
        url ? (
          <a key={i} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
          </a>
        ) : (
          <div key={i} className="h-20 w-20 animate-pulse rounded-lg bg-cream-dark" />
        ),
      )}
    </div>
  )
}
