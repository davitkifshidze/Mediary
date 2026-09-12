import { useCallback } from 'react'
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

/** კომპონენტისთვის — მომხმარებლის არჩეული ფორმატით შებოჭილი ფუნქციები */
export function useDateFormat() {
  const { settings } = useSettings()
  const format = settings.dateFormat

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
  }
}
