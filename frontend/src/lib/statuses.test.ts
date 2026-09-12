import { describe, expect, it } from 'vitest'
import type { Status } from '@/api/types'
import { statusByKey, statusName, statusTone } from './statuses'

/* ============================================================
   `lib/statuses.ts` — სტატუსის სახელი, პოვნა და ფერი.

   ⚠️ §6.4-დან სტატუსი **per-user ლექსიკონის რიგია**: სახელი ბაზაშია და
   არა თარგმანის გასაღებში. ე.ი. „რა დაიხატოს" აქ წყდება და არა i18n-ში.
   ============================================================ */

function status(over: Partial<Status> = {}): Status {
  return {
    id: 1,
    key: 'watched',
    module: 'movie',
    name_ka: 'ნანახი',
    name_en: 'Watched',
    role: 'done',
    icon: null,
    color: null,
    is_default: false,
    sort_order: 0,
    ...over,
  } as Status
}

describe('statusName', () => {
  it('ენას მიჰყვება', () => {
    expect(statusName(status(), 'ka')).toBe('ნანახი')
    expect(statusName(status(), 'en')).toBe('Watched')
  })

  it('ცარიელ თარგმანზე მეორე ენაზე გადადის და არა ცარიელზე', () => {
    // ⚠️ სახელი მომხმარებელმა შეიძლება ერთ ენაზე შეავსოს — ცარიელი ბეჯი
    // ჩანაწერს უსახელოდ დატოვებდა
    expect(statusName(status({ name_ka: '' }), 'ka')).toBe('Watched')
    expect(statusName(status({ name_en: '' }), 'en')).toBe('ნანახი')
  })

  it('სტატუსის გარეშე ჩანაწერი კანონიერია — ცარიელი სტრიქონი და არა ავარია', () => {
    expect(statusName(null, 'ka')).toBe('')
    expect(statusName(undefined, 'ka')).toBe('')
  })
})

describe('statusByKey', () => {
  const list = [status({ id: 1, key: 'watched' }), status({ id: 2, key: 'to_watch', role: 'todo' })]

  it('გასაღებით პოულობს — `?view=watched` ასე იშიფრება', () => {
    expect(statusByKey(list, 'to_watch')?.id).toBe(2)
  })

  it('უცნობ გასაღებზე და ჩამოუტვირთავ ლექსიკონზე `undefined`', () => {
    expect(statusByKey(list, 'нет')).toBeUndefined()
    expect(statusByKey(undefined, 'watched')).toBeUndefined()
  })
})

describe('statusTone', () => {
  it('ნაცნობ გასაღებს თავისი ფერი აქვს', () => {
    expect(statusTone(status({ key: 'watching' }))).toBe('watching')
  })

  /**
   * ⚠️ **ეს არის `role`-ის აზრი.** ხელით დამატებულ „მიტოვებულს" გასაღები
   * უცნობია, მაგრამ `role = done` — ე.ი. „ნანახის" ფერი უნდა მიიღოს და
   * არა ნაცრისფერი არაფერი.
   */
  it('უცნობ გასაღებზე `role`-ს კითხულობს', () => {
    expect(statusTone(status({ key: 'abandoned', role: 'done' }))).toBe('watched')
    expect(statusTone(status({ key: 'someday', role: 'todo' }))).toBe('towatch')
    expect(statusTone(status({ key: 'rewatching', role: 'doing' }))).toBe('watching')
  })

  it('სტატუსის გარეშე — ნეიტრალური', () => {
    expect(statusTone(null)).toBe('undecided')
  })
})
