import { describe, expect, it } from 'vitest'
import { filterCount, filterKey } from './filters'

/* ============================================================
   `lib/filters.ts` — ფილტრის მონახაზის ორი სუფთა ფუნქცია (ეტაპი 6).

   ⚠️ სწორედ ეს ორი ფაქტი ეწერა რვა გვერდზე ხელით (`same()` და
   `activeCount`-ის შეკრება), ე.ი. აცდენა ჩუმი იყო: „გაფილტვრის" ღილაკი
   ან უმიზეზოდ ინთებოდა, ან პირიქით — მკვდარი რჩებოდა.
   ============================================================ */

describe('filterKey', () => {
  it('სიის რიგს არ ითვალისწინებს', () => {
    // ძველი `same()` ზუსტად ასე ადარებდა — სამი ჟანრი სხვა რიგით *იგივე* ფილტრია
    expect(filterKey(['drama', 'comedy'])).toBe(filterKey(['comedy', 'drama']))
  })

  it('შიგთავსის ცვლილებას ხედავს', () => {
    expect(filterKey(['drama'])).not.toBe(filterKey(['drama', 'comedy']))
    expect(filterKey({ yearMin: '2000', yearMax: '' })).not.toBe(filterKey({ yearMin: '', yearMax: '2000' }))
  })

  it('ჩადგმულ ობიექტს გასაღების რიგისგან დამოუკიდებლად კითხულობს', () => {
    const a = { genres: ['a', 'b'], ranges: { yearMin: '1990', yearMax: '' } }
    const b = { ranges: { yearMax: '', yearMin: '1990' }, genres: ['b', 'a'] }

    expect(filterKey(a)).toBe(filterKey(b))
  })
})

describe('filterCount', () => {
  it('სიას სიგრძით, დანარჩენს ერთით ითვლის', () => {
    expect(filterCount({ genres: ['a', 'b'], tags: [] })).toBe(2)
    expect(filterCount({ categories: [], tags: ['x'], overdue: true })).toBe(2)
  })

  it('ცარიელი სტრიქონი ფილტრი არაა', () => {
    // დიაპაზონები ცარიელი ველებია და არა სია — `players: ''` ნული უნდა იყოს
    expect(filterCount({ players: '' })).toBe(0)
    expect(filterCount({ players: '4' })).toBe(1)
    expect(filterCount({ yearMin: '2000', yearMax: '', ratingMin: ' ', ratingMax: '8' })).toBe(2)
  })
})
