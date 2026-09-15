import { describe, expect, it } from 'vitest'
import { highlightParts, resultPath } from './searchResults'
import type { SearchItem } from '@/api/search'

/* ============================================================
   `lib/searchResults.ts` — ძებნის შედეგის ორი წმინდა წესი.

   ⚠️ **ორივე ჩუმად ტყდება.** არასწორი ხაზგასმა ტიპებით არ იჭერა (ორივე
   მხარე `string`-ია), არასწორი მისამართი კი ბრაუზერში 404-ია და არა
   შეცდომა — ე.ი. ტესტის გარეშე ორივე მხოლოდ ხელით დაჭერით გამოჩნდებოდა.
   ============================================================ */

function item(over: Partial<SearchItem>): SearchItem {
  return {
    id: 7,
    domain: 'movie',
    module: 'movie',
    title: 'მატრიცა',
    subtitle: null,
    image: null,
    image_url: null,
    matches: [],
    ...over,
  }
}

describe('highlightParts', () => {
  it('ქართულ ტექსტში სიტყვის შუაშიც პოულობს', () => {
    const parts = highlightParts('აქ ინფორმაციაა', 'ინ')

    expect(parts.map((p) => p.text).join('')).toBe('აქ ინფორმაციაა')
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['ინ'])
  })

  it('ყველა დამთხვევას ნიშნავს და არა პირველს', () => {
    expect(highlightParts('in in', 'in').filter((p) => p.hit)).toHaveLength(2)
  })

  it('რეგისტრს აიგნორებს, ორიგინალ ფორმას კი ინახავს', () => {
    const parts = highlightParts('Angelina Jolie', 'jol')

    expect(parts.find((p) => p.hit)?.text).toBe('Jol')
  })

  /* ⚠️ ეს არის ის მიზეზი, რის გამოც `RegExp` არ გამოიყენება: შაბლონად
     წაკითხული „(" ან „*" ან შეცდომაა, ან სულ სხვას პოულობს. */
  it('სპეცსიმბოლოს ჩვეულებრივ ტექსტად კითხულობს', () => {
    const parts = highlightParts('რეჟისორი (ჯონი)', '(ჯო')

    expect(parts.find((p) => p.hit)?.text).toBe('(ჯო')
  })

  it('ცარიელ ტერმინზე ტექსტს ერთ ნაჭრად აბრუნებს (და არ იჭედება)', () => {
    expect(highlightParts('ტექსტი', '')).toEqual([{ text: 'ტექსტი', hit: false }])
  })
})

describe('resultPath', () => {
  it('მედიას ჩანაწერის გვერდზე მიჰყავს', () => {
    expect(resultPath(item({ domain: 'series', id: 3 }), '/series')).toBe('/series/3')
  })

  it('დანარჩენ მოდულებში სექციას `?q=`-ით ხსნის (ჩანაწერი მოდალშია)', () => {
    expect(resultPath(item({ domain: 'book', title: 'ომი და მშვიდობა' }), '/books'))
      .toBe(`/books?q=${encodeURIComponent('ომი და მშვიდობა')}`)
  })

  /* ⚠️ სამი დომენი მოდული არაა — მათ ფესვს `GET /api/modules` ვერ მოგვცემს */
  it('მსახიობს, პლეილისტსა და გალერეის ვიდეოს თავისი მისამართი აქვს', () => {
    expect(resultPath(item({ domain: 'cast', module: null, id: 12 }), undefined)).toBe('/actors/12')
    expect(resultPath(item({ domain: 'playlist', module: 'song', id: 4 }), '/songs')).toBe('/playlists/4')
    expect(resultPath(item({ domain: 'gallery', module: 'gallery' }), '/gallery')).toBe('/gallery/videos')
  })

  it('უცნობ (გამორთულ) მოდულზე ბმულს არ აგენერირებს', () => {
    expect(resultPath(item({ domain: 'game', module: 'game' }), undefined)).toBeNull()
  })
})
