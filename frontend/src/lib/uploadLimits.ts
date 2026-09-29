import { useQuery } from '@tanstack/react-query'
import { fetchUploadLimits, type UploadKind, type UploadKindLimit, type UploadLimits } from '@/api/account'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **ატვირთვის ლიმიტები ინტერფეისში (2026-09-14 → Tasks §34).**

   ⚠️ ლიმიტი აქამდე **მხოლოდ backend-ის ვალიდაციაში იყო**: ატვირთვა 422-ით
   ვარდებოდა და ეკრანზე არსად ეწერა, რა ზომა ან რა ფორმატი შეიძლება. ახლა
   იგივე რიცხვები, რომლებზეც სერვერი ამოწმებს, ეკრანზეც წერია —
   `GET /api/uploads/limits` (ერთი წყარო, `App\\Support\\UploadLimits`).

   ⚠️ **რიცხვი ფრონტზე არ დუბლირდება.** მაცდური იყო `MAX = 8 * 1024 * 1024`
   კონსტანტად ჩაწერა, მაგრამ ნამდვილი ჭერი `php.ini`-ზეც არის დამოკიდებული
   (`upload_max_filesize`) და §34-იდან **სუპერადმინიც ცვლის** და **ანგარიშსაც**
   შეიძლება პირადი გამონაკლისი ჰქონდეს — ასლი პირველივე დღეს მოიტყუებოდა.
   ============================================================ */

/** ქეშის გასაღები — რედაქტორი და დამტკიცება მას პირდაპირ აახლებს */
export const UPLOAD_LIMITS_KEY = ['upload-limits'] as const

/** ქეშირებულია — ლიმიტი ხშირად არ იცვლება; ცვლილება ქეშს თვითონ აახლებს */
export function useUploadLimits() {
  return useQuery({
    queryKey: UPLOAD_LIMITS_KEY,
    queryFn: fetchUploadLimits,
    staleTime: 30 * 60_000,
  })
}

/** ერთი სახეობის ლიმიტი (ჯერ არ ჩამოსულზე `undefined`) */
export function limitFor(
  limits: { kinds: UploadKindLimit[] } | undefined,
  kind: UploadKind,
): UploadKindLimit | undefined {
  return limits?.kinds.find((k) => k.kind === kind)
}

/** ფორმატების სია ადამიანისთვის — „JPG, PNG, WEBP" */
export function formatList(formats: readonly string[]): string {
  return formats.map((f) => f.toUpperCase()).join(', ')
}

/** კილობაიტები ადამიანურად — „≤ 8 MB" */
export function kbLabel(kb: number): string {
  return formatBytes(kb * 1024)
}

/**
 * ადამიანური მინაწერი — „მაქს. 8 MB · JPG, PNG…".
 *
 * ⚠️ ფორმატების სია **იჭრება**: ცამეტი გაფართოება სექციის სათაურს ორ რიგად
 * გახლეჩდა; დანარჩენი „+N"-ად ითვლება.
 */
export function limitHint(limit: UploadKindLimit | undefined, more: (n: number) => string): string {
  if (!limit) return ''

  const size = `≤ ${formatBytes(limit.max_bytes)}`
  if (!limit.mimes.length) return size

  const shown = formatList(limit.mimes.slice(0, 6))
  const rest = limit.mimes.length - 6

  return `${size} · ${shown}${rest > 0 ? ` ${more(rest)}` : ''}`
}

/**
 * **რისი მოთხოვნა შეიძლება** (§34.5) — ამ სახეობის არჩევანიდან ის, რაც ჯერ
 * **არ აქვს**. სერვერი იმავეს ამოწმებს (`upload_request_nothing_new`), აქ კი
 * ის სიაა, რომელიც ფანჯარაში ჩანს — უკვე ჩართულს ხელახლა არ გთავაზობს.
 */
export function requestableFormats(limit: UploadKindLimit): string[] {
  if (limit.locked) return []

  const have = new Set(limit.mimes)

  return limit.selectable.filter((f) => !have.has(f))
}

/**
 * ფორმატები ოჯახებად — კატალოგის რიგით; ცარიელი ოჯახი არ ბრუნდება.
 *
 * ⚠️ ოჯახის რიგი და შიგნით რიგი **სერვერისაა** (`UploadLimits::CATALOG`) —
 * რედაქტორი, მოთხოვნის ფანჯარა და სია ერთნაირად ალაგებს.
 */
export function byFamily(
  catalog: UploadLimits['catalog'],
  formats: readonly string[],
): { family: string; formats: string[] }[] {
  const pick = new Set(formats)

  return Object.entries(catalog)
    .map(([family, list]) => ({ family, formats: list.filter((f) => pick.has(f)) }))
    .filter((g) => g.formats.length > 0)
}

/** MB (აკრეფილი ტექსტი) → KB; არარიცხვი/არადადებითი — `null` */
export function mbToKb(mb: string): number | null {
  const value = Number(mb.replace(',', '.'))

  return Number.isFinite(value) && value > 0 ? Math.round(value * 1024) : null
}

/** KB → MB ველისთვის — მთელი, როცა მთელია; სხვაგვარად ერთი ათწილადი */
export function kbToMb(kb: number): string {
  const mb = kb / 1024

  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1)
}
