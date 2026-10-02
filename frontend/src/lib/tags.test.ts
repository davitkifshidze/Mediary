import { describe, expect, it } from 'vitest'
import { addTag, dedupeTags, tagKey } from './tags'

/* ============================================================
   `lib/tags.ts` — `Video::normalizeTags()`-ის **ტყუპი**.

   ⚠️ ამ ტესტს ერთადერთი დანიშნულება აქვს: ორი მხარე ერთნაირად უნდა
   ითვლიდეს. თუ ფრონტი „Sci-Fi"-სა და „sci-fi"-ს სხვადასხვად ჩათვლის და
   ბექენდი — ერთად, ფორმა ერთს აჩვენებს და ბაზაში მეორე შეინახება.
   შესაბამისი ბექენდის წესი: trim → სივრცის შეკუმშვა → რეგისტრის იგნორი →
   **ძველი რჩება**.
   ============================================================ */

describe('tagKey', () => {
  it('რეგისტრს და ზედმეტ სივრცეს აიგნორებს', () => {
    expect(tagKey('  Sci-Fi  ')).toBe('sci-fi')
    expect(tagKey('Film   Noir')).toBe('film noir')
  })
})

describe('dedupeTags', () => {
  it('დუბლს ჭრის და **პირველს** ინახავს', () => {
    const { tags, removed } = dedupeTags(['Sci-Fi', 'sci-fi', 'SCI-FI'])

    // ⚠️ „ძველი რჩება" — ე.ი. პირველად დაწერილი ფორმა, და არა ბოლო
    expect(tags).toEqual(['Sci-Fi'])
    expect(removed).toBe(2)
  })

  it('შიდა სივრცეს კუმშავს და გარეს ჭრის', () => {
    expect(dedupeTags(['  დრამა ', 'დრამა']).tags).toEqual(['დრამა'])
    expect(dedupeTags(['film   noir']).tags).toEqual(['film noir'])
  })

  it('ცარიელს აგდებს, მაგრამ `removed`-ში არ ითვლის', () => {
    // ცარიელი ველი „მოჭრილი დუბლი" არაა — შეტყობინება ტყუილს იტყოდა
    const { tags, removed } = dedupeTags(['', '   ', 'დრამა'])

    expect(tags).toEqual(['დრამა'])
    expect(removed).toBe(0)
  })

  it('თანმიმდევრობას ინახავს', () => {
    expect(dedupeTags(['გ', 'ა', 'ბ', 'ა']).tags).toEqual(['გ', 'ა', 'ბ'])
  })
})

describe('addTag (Tasks §13)', () => {
  it('დუბლს არ ამატებს და არსებულ ფორმას აბრუნებს', () => {
    expect(addTag(['Rock'], ' rock ')).toEqual({ tags: ['Rock'], duplicate: 'Rock', added: null })
  })

  it('ახალს ამატებს, ბიბლიოთეკაში ნაცნობს — მისი რეგისტრით', () => {
    expect(addTag(['Rock'], 'blues')).toEqual({ tags: ['Rock', 'blues'], duplicate: null, added: 'blues' })
    expect(addTag(['Rock'], 'jazz', ['Jazz'])).toEqual({ tags: ['Rock', 'Jazz'], duplicate: null, added: 'Jazz' })
    expect(addTag([], 'film   noir').tags).toEqual(['film noir'])
  })

  it('ცარიელი აკრეფა არაფერს ცვლის', () => {
    expect(addTag(['Rock'], '   ')).toEqual({ tags: ['Rock'], duplicate: null, added: null })
  })
})
