import { useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { signedPhotoUrl } from '../lib/photos'

const SIZES = {
  sm: 'h-11 w-11',
  md: 'h-16 w-16',
  lg: 'h-40 w-40',
}

/**
 * A product's identification photo as a thumbnail. Resolves a short-lived signed
 * URL (the photos bucket is private) and caches it, so the same product shown in
 * many rows costs one storage call. Falls back to a soft placeholder when a
 * product has no photo yet — never a broken image.
 */
export function ItemThumb({ path, name, size = 'sm', className = '' }: {
  path?: string | null
  name?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const { data: url } = useQuery({
    queryKey: ['photo-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000, // signed URLs last 1h; refresh well before expiry
    queryFn: () => signedPhotoUrl(path!),
  })

  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-lg ${className}`

  if (path && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={box} title={name ? `Photo of ${name}` : 'Product photo'}>
        <img src={url} alt={name ? `Photo of ${name}` : ''} className="h-full w-full object-cover" />
      </a>
    )
  }
  return (
    <div className={`${box} flex items-center justify-center bg-ink-100 text-ink-300`} aria-hidden>
      <ImageOff className={size === 'lg' ? 'h-10 w-10' : 'h-5 w-5'} />
    </div>
  )
}
