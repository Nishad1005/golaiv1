import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

interface SignaturePadProps {
  label: string
  onChange: (blob: Blob | null) => void
}

/** On-screen e-signature (foreman receiving material, PRD 4.4). */
export function SignaturePad({ label, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)
    ctx.strokeStyle = '#2C1E0F'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const emit = () => {
    canvasRef.current!.toBlob((blob) => onChange(blob), 'image/png')
  }

  const clear = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label-text mb-0">{label}</span>
        {hasInk && (
          <button type="button" onClick={clear} className="flex items-center gap-1 text-sm text-ink-400">
            <Eraser className="h-4 w-4" /> Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="h-32 w-full touch-none rounded-xl border-2 border-dashed border-tan bg-white"
        onPointerDown={(e) => {
          drawing.current = true
          const ctx = canvasRef.current!.getContext('2d')!
          const { x, y } = pos(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvasRef.current!.getContext('2d')!
          const { x, y } = pos(e)
          ctx.lineTo(x, y)
          ctx.stroke()
          setHasInk(true)
        }}
        onPointerUp={() => {
          drawing.current = false
          emit()
        }}
      />
      {!hasInk && <p className="mt-1 text-xs text-ink-300">Sign with finger or stylus</p>}
    </div>
  )
}
