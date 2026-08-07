/**
 * Units of measure.
 *
 * A product carries one unit (`items.uom`) shown next to every quantity ("88 pcs",
 * "13 m"). We store a short, stable code and show a friendlier label in the
 * picker. One unit per product keeps its stock totalable — tracking the same
 * product in two units at once would need unit conversion (1 roll = 50 m), a
 * separate feature.
 */

export type UomGroup = 'Count' | 'Length' | 'Area' | 'Weight' | 'Volume'

export interface Uom {
  value: string
  label: string
  group: UomGroup
}

export const UOM_UNITS: Uom[] = [
  // Count
  { value: 'pcs', label: 'Pieces', group: 'Count' },
  { value: 'pkt', label: 'Packet', group: 'Count' },
  { value: 'box', label: 'Box', group: 'Count' },
  { value: 'set', label: 'Set', group: 'Count' },
  { value: 'pair', label: 'Pair', group: 'Count' },
  { value: 'dozen', label: 'Dozen', group: 'Count' },
  { value: 'roll', label: 'Roll', group: 'Count' },
  { value: 'sheet', label: 'Sheet', group: 'Count' },
  { value: 'bundle', label: 'Bundle', group: 'Count' },
  { value: 'coil', label: 'Coil', group: 'Count' },
  { value: 'bag', label: 'Bag', group: 'Count' },
  // Length
  { value: 'm', label: 'Metre', group: 'Length' },
  { value: 'rmt', label: 'Running metre', group: 'Length' },
  { value: 'yd', label: 'Yard', group: 'Length' },
  { value: 'ft', label: 'Feet', group: 'Length' },
  { value: 'in', label: 'Inch', group: 'Length' },
  { value: 'cm', label: 'Centimetre', group: 'Length' },
  { value: 'mm', label: 'Millimetre', group: 'Length' },
  // Area
  { value: 'sqft', label: 'Sq. feet', group: 'Area' },
  { value: 'sqm', label: 'Sq. metre', group: 'Area' },
  { value: 'sqin', label: 'Sq. inch', group: 'Area' },
  // Weight
  { value: 'kg', label: 'Kilogram', group: 'Weight' },
  { value: 'g', label: 'Gram', group: 'Weight' },
  { value: 'ton', label: 'Tonne', group: 'Weight' },
  // Volume
  { value: 'L', label: 'Litre', group: 'Volume' },
  { value: 'ml', label: 'Millilitre', group: 'Volume' },
  { value: 'cft', label: 'Cubic feet', group: 'Volume' },
  { value: 'cbm', label: 'Cubic metre', group: 'Volume' },
]

/** Group order for the picker's optgroups. */
export const UOM_GROUPS: UomGroup[] = ['Count', 'Length', 'Area', 'Weight', 'Volume']

const BY_VALUE = new Map(UOM_UNITS.map((u) => [u.value, u]))

/** The picker label for a stored code — falls back to the code itself. */
export function uomLabel(value: string | null | undefined): string {
  if (!value) return ''
  return BY_VALUE.get(value)?.label ?? value
}

/**
 * Map whatever a CSV / person typed to a canonical code. Case- and
 * punctuation-insensitive, so "Metre", "mtr", "M." and "meters" all land on `m`.
 * An unrecognised value is returned trimmed rather than forced onto the list —
 * we never silently change a client's meaning.
 */
const SYNONYMS: Record<string, string> = {
  // count
  piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs', nos: 'pcs', no: 'pcs',
  unit: 'pcs', units: 'pcs', qty: 'pcs', ea: 'pcs', each: 'pcs',
  packet: 'pkt', packets: 'pkt', pkt: 'pkt', pkts: 'pkt', pack: 'pkt', packs: 'pkt',
  box: 'box', boxes: 'box', ctn: 'box', carton: 'box', cartons: 'box',
  set: 'set', sets: 'set',
  pair: 'pair', pairs: 'pair', prs: 'pair',
  dozen: 'dozen', dozens: 'dozen', dz: 'dozen', doz: 'dozen',
  roll: 'roll', rolls: 'roll',
  sheet: 'sheet', sheets: 'sheet', sht: 'sheet',
  bundle: 'bundle', bundles: 'bundle', bdl: 'bundle',
  coil: 'coil', coils: 'coil',
  bag: 'bag', bags: 'bag',
  // length
  m: 'm', mtr: 'm', mtrs: 'm', mt: 'm', mts: 'm', meter: 'm', meters: 'm',
  metre: 'm', metres: 'm',
  rmt: 'rmt', rm: 'rmt', 'runningmetre': 'rmt', 'runningmeter': 'rmt',
  yd: 'yd', yds: 'yd', yard: 'yd', yards: 'yd',
  ft: 'ft', foot: 'ft', feet: 'ft',
  in: 'in', inch: 'in', inches: 'in',
  cm: 'cm', centimetre: 'cm', centimeter: 'cm',
  mm: 'mm', millimetre: 'mm', millimeter: 'mm',
  // area
  sqft: 'sqft', sqfeet: 'sqft', sft: 'sqft', 'squarefeet': 'sqft', 'squarefoot': 'sqft',
  sqm: 'sqm', sqmt: 'sqm', sqmtr: 'sqm', 'squaremetre': 'sqm', 'squaremeter': 'sqm',
  sqin: 'sqin', 'squareinch': 'sqin',
  // weight
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  ton: 'ton', tons: 'ton', tonne: 'ton', tonnes: 'ton', mt_weight: 'ton',
  // volume
  l: 'L', ltr: 'L', ltrs: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml',
  cft: 'cft', cuft: 'cft', cubicfeet: 'cft', cubicfoot: 'cft', ft3: 'cft', cfeet: 'cft',
  cbm: 'cbm', cubm: 'cbm', cubicmetre: 'cbm', cubicmeter: 'cbm', m3: 'cbm',
}

export function normalizeUom(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'pcs'
  const key = trimmed.toLowerCase().replace(/[\s._-]/g, '')
  return SYNONYMS[key] ?? (BY_VALUE.has(trimmed) ? trimmed : trimmed)
}
