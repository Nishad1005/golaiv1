import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

interface PhotoInputProps {
  files: File[]
  onChange: (files: File[]) => void
  label?: string
}

/** Photo evidence capture: opens device camera, shows thumbnails, removable. */
export function PhotoInput({ files, onChange, label = 'Add photo' }: PhotoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const added = Array.from(list)
    onChange([...files, ...added])
    setPreviews((p) => [...p, ...added.map((f) => URL.createObjectURL(f))])
  }

  const remove = (i: number) => {
    URL.revokeObjectURL(previews[i])
    onChange(files.filter((_, idx) => idx !== i))
    setPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative">
            <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-cream"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-tan text-ink-400"
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-6 w-6" />
          <span className="text-[10px]">{label}</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
