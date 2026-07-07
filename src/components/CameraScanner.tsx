import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { X } from 'lucide-react'

interface CameraScannerProps {
  onScan: (value: string) => void
  onClose: () => void
}

/** Full-screen camera barcode scanner (web). Mobile builds will swap in MLKit. */
export function CameraScanner({ onScan, onClose }: CameraScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5Qrcode('aksure-camera-scanner')
    scannerRef.current = scanner

    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 160 } },
        (decoded) => {
          if (doneRef.current) return
          doneRef.current = true
          onScan(decoded)
        },
        () => {}, // per-frame decode misses are normal; ignore
      )
      .catch((err) => console.error('camera start failed:', err))

    return () => {
      const s = scannerRef.current
      if (s && s.isScanning) {
        void s.stop().then(() => s.clear()).catch(() => {})
      }
    }
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4 text-cream">
        <span className="font-semibold">Point camera at barcode</span>
        <button
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"
          aria-label="Close scanner"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div id="aksure-camera-scanner" className="mx-auto w-full max-w-md flex-1" />
    </div>
  )
}
