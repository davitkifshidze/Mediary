import { describe, expect, it } from 'vitest'
import { readPage } from './paged'

/* ============================================================
   `lib/paged.ts` — სიის პასუხის წაკითხვა.

   ⚠️ ბექენდი **ორ ფორმას** აბრუნებს: გვერდს (`{data, meta}`) და მთელ სიას
   (`{data}`, `all=1`-ზე). ერთი წაკითხვა ორივეს უნდა უმკლავდებოდეს, თორემ
   „მეტის ჩვენება" სრულ სიაზე სამუდამოდ დარჩებოდა.
   ============================================================ */

describe('readPage', () => {
  it('გვერდიდან ჯამს `meta`-დან იღებს', () => {
    const page = readPage<{ id: number }>({ data: [{ id: 1 }, { id: 2 }], meta: { total: 353 } })

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(353)
  })

  it('`meta`-ს გარეშე ჯამი თვითონ სიის სიგრძეა (`all=1`)', () => {
    const page = readPage<{ id: number }>({ data: [{ id: 1 }, { id: 2 }] })

    expect(page.total).toBe(2)
  })

  it('ცარიელ და გაუმართავ პასუხზე არ ტყდება', () => {
    expect(readPage({ data: [] })).toEqual({ items: [], total: 0 })
    expect(readPage({})).toEqual({ items: [], total: 0 })
  })
})
