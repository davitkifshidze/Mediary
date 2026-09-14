import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, type DateFormat } from '@/lib/settings'

/* ============================================================
   თარიღის ერთიანი ფორმატირება (Tasks 18).

   ⚠️ **`toLocaleDateString()` პირდაპირ აღარ იძახება კომპონენტში** —
   თითო ადგილას ის ბრაუზერის ლოკალს მიჰყვებოდა, ე.ი. ერთსა და იმავე
   გვერდზე ორი სხვადასხვა ფორმატი ჩნდებოდა და პარამეტრი ვერაფერს ცვლიდა.
   ============================================================ */

/**
 * `iso` განზრახ **`sv-SE`-თია** და არა `toISOString()`-ით: ეს უკანასკნელი
 * UTC-ზე გადაჰყავს თარიღი, ე.ი. თბილისის ღამის საათებში წინა დღეს აჩვენებდა.
 */
export function formatDate(value: string | number | Date | null | undefined, format: DateFormat): string {
  if (value == null || value === '') return '—'

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleDateString(format === 'iso' ? 'sv-SE' : format)
}

/** იგივე, ოღონდ დროსთან ერთად (შეხსენებები, ჩატი) */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  format: DateFormat,
): string {
  if (value == null || value === '') return '—'

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const locale = format === 'iso' ? 'sv-SE' : format

  return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** რამდენად შორია მომენტი — დიდიდან პატარისკენ, პირველი რომელიც „ეტევა" */
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
  ['second', 1000],
]

/**
 * „3 საათში" · „ხვალ" · „2 დღის წინ" — **აბსოლუტური თარიღის დამატება და არა
 * ჩანაცვლება** (შეხსენებები: „როდის" და „რამდენ ხანში" ორი სხვადასხვა კითხვაა).
 *
 * ⚠️ **ლოკალი ინტერფეისის ენაა და არა თარიღის ფორმატი.** „3 საათში" წინადადებაა
 * და არა თარიღი: `dateFormat: 'iso'`-ზეც კი ქართულ ინტერფეისზე ქართულად უნდა
 * წაიკითხებოდეს, თორემ ერთ ხაზზე ორ ენას მივიღებდით.
 *
 * ⚠️ `numeric: 'auto'` აძლევს „ხვალ"/„გუშინ"-ს „1 დღეში"-ს ნაცვლად.
 */
export function formatRelative(
  value: string | number | Date | null | undefined,
  locale: string,
  now: number = Date.now(),
): string | null {
  if (value == null || value === '') return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const diff = date.getTime() - now
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit)
    }
  }

  return null
}

/** კომპონენტისთვის — მომხმარებლის არჩეული ფორმატით შებოჭილი ფუნქციები */
export function useDateFormat() {
  const { settings } = useSettings()
  const { i18n } = useTranslation()
  const format = settings.dateFormat
  const locale = i18n.language

  return {
    format,
    date: useCallback(
      (value: string | number | Date | null | undefined) => formatDate(value, format),
      [format],
    ),
    dateTime: useCallback(
      (value: string | number | Date | null | undefined) => formatDateTime(value, format),
      [format],
    ),
    relative: useCallback(
      (value: string | number | Date | null | undefined) => formatRelative(value, locale),
      [locale],
    ),
  }
}
