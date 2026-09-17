import { afterEach, describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { CODES, errorMessage } from '@/lib/errors'
import i18n from '@/i18n'
import en from '@/i18n/en.json'
import ka from '@/i18n/ka.json'

/* ============================================================
   რეგრესია: **backend-ის მანქანური კოდი toast-ში snake_case-ად ჩანდა**
   (Tasks GAP-01).

   `errorMessage()` უცნობ კოდს სიტყვასიტყვით აბრუნებს, ე.ი. `CODES`-იდან
   ან ლოკალიდან გამორჩენილი კოდი ჩუმად „module_not_enabled"-ად
   იხატებოდა — 39 ასეთი დაგროვდა. `tsc`-ც და i18n-ის აუდიტიც ამას ვერ
   ხედავს: აუდიტი `errors.*`-ს დინამიურ პრეფიქსად თვლის და მხოლოდ იმას
   ამოწმებს, რომ **რამე** შვილი აქვს.
   ============================================================ */

const LOCALES = { ka: ka.errors, en: en.errors } as Record<'ka' | 'en', Record<string, string>>

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  } as AxiosResponse

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
}

afterEach(async () => {
  await i18n.changeLanguage('ka')
})

describe('CODES ⊆ ორივე ლოკალი', () => {
  it.each(Object.keys(LOCALES) as ('ka' | 'en')[])('every code has its own text in %s', (lang) => {
    const missing = CODES.filter((code) => !LOCALES[lang][code]?.trim())

    expect(missing).toEqual([])
  })

  it.each(['ka', 'en'] as const)('no code reaches the toast raw in %s', async (lang) => {
    await i18n.changeLanguage(lang)

    const raw = CODES.filter((code) => {
      const text = errorMessage(apiError(422, { message: code }))
      return text === code || text.startsWith('errors.')
    })

    expect(raw).toEqual([])
  })
})

describe('errorMessage — GAP-01', () => {
  it('translates registration_disabled in both languages', async () => {
    const e = apiError(403, { message: 'registration_disabled' })

    await i18n.changeLanguage('en')
    expect(errorMessage(e)).toBe(en.errors.registration_disabled)

    await i18n.changeLanguage('ka')
    expect(errorMessage(e)).toBe(ka.errors.registration_disabled)
  })

  it('names the missing permission instead of printing empty brackets', async () => {
    await i18n.changeLanguage('en')

    const text = errorMessage(apiError(403, { message: 'forbidden_permission', permission: 'movie.update' }))

    expect(text).toContain('(movie.update)')
    expect(text).not.toContain('{{')
  })

  it('passes the file cap through as a number, not as bytes', async () => {
    await i18n.changeLanguage('en')

    const text = errorMessage(apiError(422, { message: 'custom_field_file_limit', max: 10, value: [] }))

    expect(text).toContain('at most 10 files')
    expect(text).not.toContain('{{')
  })
})

/* ============================================================
   პასუხის გარეშე დარჩენილი მოთხოვნა (Tasks GAP-02).
   ============================================================ */

describe('errorMessage — GAP-02', () => {
  const noResponse = (code: string) => new AxiosError(code === 'ERR_CANCELED' ? 'canceled' : 'Network Error', code)

  it.each(['ka', 'en'] as const)('translates a network failure in %s', async (lang) => {
    await i18n.changeLanguage(lang)

    const text = errorMessage(noResponse(AxiosError.ERR_NETWORK))

    expect(text).toBe(LOCALES[lang].network)
    expect(text).not.toBe('Network Error')
  })

  /* ⚠️ გაუქმება ქსელის ჩავარდნა **არ არის**: გლობალურ ძებნაში ყოველი აკრეფილი
     ასო წინა მოთხოვნას წყვეტს, ე.ი. „შეამოწმე ინტერნეტი" ყოველ ასოზე დაიწერებოდა. */
  it('never calls a cancelled request a network failure', async () => {
    await i18n.changeLanguage('en')

    expect(errorMessage(noResponse('ERR_CANCELED'))).not.toBe(en.errors.network)
  })

  it('translates the 419 that survived the retry', async () => {
    await i18n.changeLanguage('en')

    // ⚠️ backend-ი მანქანურ კოდს აბრუნებს და არა `'CSRF token mismatch.'`-ს
    expect(errorMessage(apiError(419, { message: 'csrf_token_mismatch' }))).toBe(en.errors.csrf_token_mismatch)
  })
})
