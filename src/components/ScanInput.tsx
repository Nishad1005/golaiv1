import { useRef, useState } from 'react'
import { Camera, Keyboard, ScanBarcode } from 'lucide-react'
import { CameraScanner } from './CameraScanner'

interface ScanInputProps {
  placeholder: string
  onScan: (value: string, manual: boolean) => void
  /** Scan-first, type-second (PRD 7.2): typing must be explicitly toggled. */
  allowManual?: boolean
  autoFocus?: boolean
}

/**
 * Unified scan field. USB scanners act as keyboards ending with Enter, so the
 * focused input catches them directly. Camera scanning opens html5-qrcode.
 * Manual typing is an explicit toggle and is reported upstream (audit-flagged).
 */
export function ScanInput({ placeholder, onScan, allowManual = true, autoFocus = true }: ScanInputProps) {
  const [value, setValue] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastKeyTime = useRef(0)
  const burstStart = useRef(0)

  const submit = (v: string, manual: boolean) => {
    const trimmed = v.trim()
    if (!trimmed) return
    setValue('')
    onScan(trimmed, manual)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input
            ref={inputRef}
            className="input-field pl-12"
            placeholder={manualMode ? `Type ${placeholder}…` : `Scan ${placeholder}…`}
            value={value}
            autoFocus={autoFocus}
            readOnly={false}
            inputMode={manualMode ? 'text' : 'none'}
            onChange={(e) => {
              const now = performance.now()
              if (e.target.value.length <= 1) burstStart.current = now
              lastKeyTime.current = now
              setValue(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                // USB scanners type the whole code in a fast burst (<80ms/char avg).
                const elapsed = performance.now() - burstStart.current
                const fastBurst = value.length >= 3 && elapsed / value.length < 80
                submit(value, manualMode && !fastBurst)
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn-secondary px-4"
          onClick={() => setShowCamera(true)}
          aria-label="Scan with camera"
        >
          <Camera className="h-6 w-6" />
        </button>
        {allowManual && (
          <button
            type="button"
            className={
              'min-h-tap rounded-xl border-2 px-4 transition-colors ' +
              (manualMode ? 'border-ink bg-ink text-cream' : 'border-tan bg-white text-ink-400')
            }
            onClick={() => {
              setManualMode((v) => !v)
              inputRef.current?.focus()
            }}
            aria-label="Toggle manual typing"
            title="Manual typing (audit-logged)"
          >
            <Keyboard className="h-6 w-6" />
          </button>
        )}
      </div>
      {manualMode && (
        <p className="text-xs text-amber-700">
          Manual entry mode — this will be flagged in the audit log. Press Enter to confirm.
        </p>
      )}

      {showCamera && (
        <CameraScanner
          onScan={(v) => {
            setShowCamera(false)
            submit(v, false)
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}
