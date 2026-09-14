import { describe, expect, it } from 'vitest'
import { canPreview, kindOf } from '@/components/FileViewer'

/* ============================================================
   ფაილის სახეობა (2026-09-14) — მნახველის ერთადერთი გადაწყვეტილება.

   ⚠️ ეს სუფთა ფუნქციაა და ამიტომ იმაგრება: მისი შეცდომა **ცარიელ ყუთად**
   ჩანს ეკრანზე (PDF `<video>`-ში ან ვიდეო `<iframe>`-ში) და არც `tsc`-ს
   და არც lint-ს არაფერი ეტყობა.
   ============================================================ */

describe('kindOf', () => {
  /** ⚠️ `mime` პირველია: სერვერის სახელს გაფართოება შეიძლება საერთოდ არ ჰქონდეს */
  it('mime-ს ენდობა სახელზე მეტად', () => {
    expect(kindOf({ id: 1, url: '/x', name: 'უსახელო', mime: 'application/pdf' })).toBe('pdf')
    expect(kindOf({ id: 1, url: '/x', name: 'photo.pdf', mime: 'image/jpeg' })).toBe('image')
    expect(kindOf({ id: 1, url: '/x', mime: 'video/mp4' })).toBe('video')
    expect(kindOf({ id: 1, url: '/x', mime: 'audio/mpeg' })).toBe('audio')
    expect(kindOf({ id: 1, url: '/x', mime: 'text/csv' })).toBe('text')
  })

  /** `mime`-ის გარეშე გაფართოება სათადარიგოა */
  it('mime-ის გარეშე გაფართოებას კითხულობს', () => {
    expect(kindOf({ id: 1, url: '/files/a.webp' })).toBe('image')
    expect(kindOf({ id: 1, url: '/x', name: 'clip.MOV' })).toBe('video')
    expect(kindOf({ id: 1, url: '/x', name: 'guide.pdf' })).toBe('pdf')
    // ⚠️ ფაილის სახელი განზრახ **არაა** `notes.md` — `audit.py` მას i18n-ის
    // გასაღებად კითხულობს (`notes` ნამდვილი namespace-ია) და ცრუ განგაშს იძლევა
    expect(kindOf({ id: 1, url: '/x', name: 'readme.md' })).toBe('text')
  })

  /** ⚠️ უცნობი = `other`, და ეს ეკრანზეც ღიად ითქმება („ჩამოტვირთე") */
  it('უცნობ ფორმატს `other`-ად ტოვებს და არ ცდილობს ჩვენებას', () => {
    expect(kindOf({ id: 1, url: '/x', name: 'archive.zip' })).toBe('other')
    expect(kindOf({ id: 1, url: '/x', name: 'book.docx' })).toBe('other')
    expect(kindOf({ id: 1, url: '/x' })).toBe('other')

    expect(canPreview({ id: 1, url: '/x', name: 'archive.zip' })).toBe(false)
    expect(canPreview({ id: 1, url: '/x', mime: 'application/pdf' })).toBe(true)
  })
})
