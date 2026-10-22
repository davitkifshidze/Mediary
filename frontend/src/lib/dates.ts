import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, type DateFormat } from '@/lib/settings'

/* ============================================================
   თარიღის ერთიანი ფორმატირება.

   ⚠️ **`toLocaleDateString()` პირდაპირ აღარ იძახება კომპონენტში** —
   თითო ადგილას ის ბრაუზერის ლოკალს მიჰყვებოდა, ე.ი. ერთსა და იმავე
   გვერდზე ორი სხვადასხვა ფორმატი ჩნდებოდა და პარამეტრი ვერაფერს ცვლიდა.
   ============================================================ */

/**
 * **„ახლა" ლოკალურად** — `YYYY-MM-DDTHH:mm` (წუთამდე), ზუსტად ის ფორმატი, რასაც
 * `DatePicker withTime` და `<input type="datetime-local">` ელის. ⚠️ ლოკალური
 * საათებიდან და არა `toISOString()`-იდან — ის UTC-ში გადადის და თბილისის ღამის
 * საათებში წინა დღეს დაწერდა.
 */
export function nowLocal(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** დღევანდელი თარიღი — `YYYY-MM-DD` */
export function todayLocal(at: Date = new Date()): string {
  return nowLocal(at).slice(0, 10)
}

/** მიმდინარე დრო — `HH:mm` */
export function nowClock(at: Date = new Date()): string {
  return nowLocal(at).slice(11)
}

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

/**
 * **თვე და წელი — „ივლისი 2024"** (პირადი გალერეის თვეები).
 *
 * ⚠️ შესავალი `YYYY-MM`-ია (სერვერის ჯგუფის გასაღები) და არა მომენტი —
 * `new Date('2024-07')` UTC-ის შუაღამეა და დასავლეთის ზონაში წინა თვე
 * გამოჩნდებოდა; ამიტომ თარიღი ადგილობრივად, თვის შუა რიცხვზე იგება.
 * ⚠️ ლოკალი ინტერფეისის ენაა (`formatRelative()`-ის წესი) — თვის სახელი სიტყვაა.
 */
export function formatMonth(yearMonth: string, locale: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth

  const text = new Date(year, month - 1, 15).toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return text.charAt(0).toUpperCase() + text.slice(1)
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
