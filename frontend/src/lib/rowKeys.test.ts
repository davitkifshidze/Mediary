import { describe, expect, it } from 'vitest'
import { keyRow, keyRows, newRowKey, unkeyRows } from '@/lib/rowKeys'

/* ============================================================
   სარედაქტირებელი სტრიქონების გასაღებები (Tasks BUG-11).

   ორი ფაქტი, რომელთა დარღვევაც **ჩუმია**: გასაღები უნიკალური უნდა იყოს
   (თორემ React ისევ იმავე DOM-ს გადაიტანს) და **გაგზავნამდე უნდა გაქრეს**
   (თორემ `_key` JSON-სვეტში ჩაჯდება).
   ============================================================ */

describe('rowKeys', () => {
  it('ყოველი გასაღები ახალია', () => {
    const keys = [newRowKey(), newRowKey(), newRowKey()]

    expect(new Set(keys).size).toBe(3)
  })

  it('სიის გასაღებები ერთმანეთს არ ემთხვევა', () => {
    const rows = keyRows([{ url: 'a' }, { url: 'b' }, { url: 'c' }])

    expect(new Set(rows.map((r) => r._key)).size).toBe(3)
    expect(rows.map((r) => r.url)).toEqual(['a', 'b', 'c'])
  })

  it('შუა სტრიქონის წაშლა დანარჩენების გასაღებს არ ცვლის', () => {
    const rows = keyRows([{ url: 'a' }, { url: 'b' }, { url: 'c' }])

    // ⚠️ ზუსტად ეს იყო ბაგი: ინდექსზე მესამის გასაღები მეორისა ხდებოდა
    const left = rows.filter((_, i) => i !== 1)

    expect(left.map((r) => r._key)).toEqual([rows[0]._key, rows[2]._key])
  })

  it('unkeyRows მხოლოდ გასაღებს შლის', () => {
    const rows = [keyRow({ label: 'BGG', url: 'https://x', price: null })]

    expect(unkeyRows(rows)).toEqual([{ label: 'BGG', url: 'https://x', price: null }])
    // ორიგინალს ხელი არ ეხება — state-ის რიგი ადგილზე რჩება
    expect(rows[0]._key).toBeTruthy()
  })

  it('ცარიელი სია ცარიელივე რჩება', () => {
    expect(keyRows([])).toEqual([])
    expect(unkeyRows([])).toEqual([])
  })
})
