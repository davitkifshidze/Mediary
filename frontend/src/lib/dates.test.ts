import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatRelative } from './dates'

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

describe('formatRelative', () => {
  const NOW = Date.parse('2026-09-14T12:00:00Z')

  /** ⚠️ „3 საათში" წინადადებაა — ლოკალი ინტერფეისის ენაა და არა თარიღის ფორმატი */
  it('ქართულად წერს მომავალსაც და წარსულსაც', () => {
    expect(formatRelative('2026-09-14T15:00:00Z', 'ka', NOW)).toBe('3 საათში')
    expect(formatRelative('2026-09-14T10:00:00Z', 'ka', NOW)).toBe('2 საათის წინ')
  })

  /** `numeric: 'auto'` — „ხვალ" და არა „1 დღეში" */
  it('უახლოეს დღეებს სიტყვით ამბობს', () => {
    expect(formatRelative('2026-09-15T12:00:00Z', 'ka', NOW)).toBe('ხვალ')
    expect(formatRelative('2026-09-15T12:00:00Z', 'en', NOW)).toBe('tomorrow')
  })

  /** ერთ წუთზე ნაკლები წამებში ითქმება და არა „0 წუთში" */
  it('ძალიან ახლო მომენტი წამებშია', () => {
    expect(formatRelative('2026-09-14T12:00:30Z', 'ka', NOW)).toBe('30 წამში')
  })

  it('ცარიელსა და გაუმართავზე `null`-ია და არა „Invalid Date"', () => {
    expect(formatRelative(null, 'ka', NOW)).toBeNull()
    expect(formatRelative('', 'ka', NOW)).toBeNull()
    expect(formatRelative('არა თარიღი', 'ka', NOW)).toBeNull()
  })
})
