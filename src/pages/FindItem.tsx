import { ItemLocator } from '../components/ItemLocator'
import { PageHeader } from '../components/PageHeader'

/**
 * The "where is this product?" screen — the reason the whole system exists.
 * Same locator as the home card, given its own destination so anyone on the
 * floor can reach it in one tap.
 */
export function FindItem() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Find Item"
        subtitle="Type a product name, code or barcode to see exactly where it is."
      />
      <ItemLocator />
      <p className="text-sm text-ink-400">
        Nothing showing for a product? It may not have been assigned a location yet — use
        <span className="font-medium text-ink-600"> Assign Location</span> to record where it sits.
      </p>
    </div>
  )
}
