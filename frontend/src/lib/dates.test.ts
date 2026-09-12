import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './dates'

/* ============================================================
   `lib/dates.ts` — თარიღის ერთიანი ფორმატი.
   ============================================================ */

describe('formatDate', () => {
  /**
   * ⚠️ **ეს ის ბაგია, რომლის გამოც `sv-SE` აირჩა.** `toISOString()` UTC-ზე
   * გადაჰყავს თარიღი, ე.ი. თბილისის ღამის საათებში (UTC+4) წინა დღეს
   * აჩვენებდა. ლოკალური შუაღამის შემდეგი საათი სწორედ ამას იჭერს.
   */
  it('`iso` ლოკალურ დღეს წერს და არა UTC-ისას', () => {
    const localMidnightPlusOne = new Date(2026, 8, 12, 1, 0, 0) // 12 სექტემბერი, 01:00 ადგილობრივად

    expect(formatDate(localMidnightPlusOne, 'iso')).toBe('2026-09-12')
  })

  it('ცარიელს და გაუმართავს ტირეს უწერს და არა „Invalid Date"-ს', () => {
    expect(formatDate(null, 'iso')).toBe('—')
    expect(formatDate(undefined, 'iso')).toBe('—')
    expect(formatDate('', 'iso')).toBe('—')
    expect(formatDate('არა თარიღი', 'iso')).toBe('—')
  })

  it('სტრიქონსაც იღებს — API ზუსტად ასე აბრუნებს', () => {
    expect(formatDate('2026-09-12T10:00:00Z', 'iso')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDateTime', () => {
  it('თარიღსაც წერს და საათსაც', () => {
    expect(formatDateTime(new Date(2026, 8, 12, 14, 5), 'iso')).toBe('2026-09-12 14:05')
  })

  it('ცარიელზე ტირეა', () => {
    expect(formatDateTime(null, 'iso')).toBe('—')
  })
})
