import { useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
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
    const scanner = new Html5Qrcode('golai-camera-scanner', {
      // Explicit formats + the browser's native BarcodeDetector (when
      // available) decode 1D codes like Code128 far more reliably than the
      // JS fallback — this is what shelf/issuance/carton labels use.
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    })
    scannerRef.current = scanner

    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 300, height: 200 } },
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
      <div id="golai-camera-scanner" className="mx-auto w-full max-w-md flex-1" />
    </div>
  )
}
