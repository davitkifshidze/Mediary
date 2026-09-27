import { describe, expect, it } from 'vitest'
import { ALBUM_PASSWORD_MIN } from '@/api/gallery'
import { albumPasswordProblem } from '@/lib/albumPassword'

/* ============================================================
   ალბომის ახალი პაროლი (Tasks §17.2) — **ერთი წესი ორ ფორმაში**.

   ⚠️ ცარიელი ველი შეცდომა არ არის: ფანჯარაში ის „პაროლს არ ვცვლი"-ს
   ნიშნავს. „ლოკი ჩართულია და პაროლი ცარიელია" ამრჩევის კითხვაა და
   აქ განზრახ არ წყდება — სხვაგვარად ალბომის სახელის გადარქმევა
   პაროლის შეყვანის გარეშე შეუძლებელი გახდებოდა.
   ============================================================ */

describe('albumPasswordProblem', () => {
  it('ცარიელი ველი — „არ ვცვლი", არა შეცდომა', () => {
    expect(albumPasswordProblem('', '')).toBeNull()
    expect(albumPasswordProblem('', 'secret1')).toBeNull()
  })

  it('მოკლე პაროლი სერვერის `min:4`-ს იმეორებს', () => {
    expect(ALBUM_PASSWORD_MIN).toBe(4)
    expect(albumPasswordProblem('abc', 'abc')).toBe('short')
    expect(albumPasswordProblem('abcd', 'abcd')).toBeNull()
  })

  it('სიგრძე მოწმდება გამეორებამდე — ჯერ ის, რასაც ახლა წერ', () => {
    expect(albumPasswordProblem('ab', 'xyz')).toBe('short')
  })

  it('არაემთხვევი გამეორება', () => {
    expect(albumPasswordProblem('secret1', 'secret2')).toBe('mismatch')
    expect(albumPasswordProblem('secret1', '')).toBe('mismatch')
    expect(albumPasswordProblem('secret1', 'secret1')).toBeNull()
  })
})
