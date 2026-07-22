import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight, ClipboardCheck, MapPin, PackageCheck, PackageOpen, PencilRuler,
  Send, ShieldAlert, Undo2,
} from 'lucide-react'

/**
 * How each `item_movements.kind` (migration 0019) is shown to a user. One place,
 * so the stock card and the manager dashboard never disagree about what a
 * movement is called.
 */
export const MOVEMENTS: Record<string, { label: string; short: string; icon: LucideIcon }> = {
  grn: { label: 'Received', short: 'Received', icon: PackageCheck },
  capture: { label: 'Counted', short: 'Counted', icon: ClipboardCheck },
  transfer_in: { label: 'Transferred in', short: 'Transfer in', icon: ArrowLeftRight },
  transfer_out: { label: 'Transferred out', short: 'Transfer out', icon: ArrowLeftRight },
  issue: { label: 'Issued to production', short: 'Issued', icon: PackageOpen },
  return: { label: 'Returned', short: 'Returned', icon: Undo2 },
  dispatch: { label: 'Dispatched', short: 'Dispatched', icon: Send },
  adjust: { label: 'Adjusted', short: 'Adjusted', icon: PencilRuler },
  qc_release: { label: 'Released from QC', short: 'QC release', icon: ShieldAlert },
  placement: { label: 'Located', short: 'Located', icon: MapPin },
}

/** Compact labels for tight rows (dashboard feed). */
export const MOVEMENT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(MOVEMENTS).map(([key, m]) => [key, m.short]),
)
