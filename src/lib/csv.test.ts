import { describe, expect, it } from 'vitest'
import { parseCsv, findColumn } from './csv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas and quotes', () => {
    expect(parseCsv('name,note\n"Sofa, 3-seater","said ""ok"""')).toEqual([
      ['name', 'note'],
      ['Sofa, 3-seater', 'said "ok"'],
    ])
  })

  it('handles CRLF and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })
})

describe('findColumn', () => {
  it('matches headers case- and separator-insensitively', () => {
    const headers = ['Item Code', 'ITEM_NAME', 'Sub-Category', 'UOM']
    expect(findColumn(headers, ['itemcode', 'code'])).toBe(0)
    expect(findColumn(headers, ['itemname', 'name'])).toBe(1)
    expect(findColumn(headers, ['subcategory'])).toBe(2)
    expect(findColumn(headers, ['uom', 'unit'])).toBe(3)
  })

  it('returns -1 when absent', () => {
    expect(findColumn(['a', 'b'], ['missing'])).toBe(-1)
  })

  it("maps U&M's actual master headers", () => {
    const headers = ['Particular', 'Product Code', 'Definition', 'Category (clean)', 'Sub-Category (clean)']
    expect(findColumn(headers, ['itemname', 'name', 'particular'])).toBe(0)
    expect(findColumn(headers, ['itemcode', 'productcode', 'code'])).toBe(1)
    expect(findColumn(headers, ['category', 'group'])).toBe(3) // not fooled by "Sub-Category"
    expect(findColumn(headers, ['subcategory', 'subgroup'])).toBe(4)
  })
})
