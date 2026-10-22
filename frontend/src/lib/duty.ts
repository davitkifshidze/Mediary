import type { QueryClient } from '@tanstack/react-query'
import { DUTY_KEY, type DutyShift, type DutyShiftType, type DutyWorkplace } from '@/api/duty'

/* ============================================================
   **მორიგეობა — SPA-ს საერთო დამხმარეები.**

   ⚠️ **თარიღი აქ სტრიქონია** (`YYYY-MM-DD`) და არა `Date`: კალენდარი დღეებს
   ითვლის, საათები და სასაათო სარტყელი მას არ ეხება. `Date` მხოლოდ შიგნით
   ჩნდება და ყოველთვის **ადგილობრივი შუადღით** (`T12:00`) — შუაღამის `Date`
   ზაფხულის/ზამთრის დროის გადასვლაზე წინა დღეზე „ჩამოცურდებოდა“.
   ============================================================ */

/** ყველა სია ერთად ძველდება — მორიგეობა ჯამებს, კალენდარსაც და დეშბორდსაც ცვლის */
export function invalidateDuty(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: [DUTY_KEY] })
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  void qc.invalidateQueries({ queryKey: ['trash'] })
}

/* ---------- თარიღები ---------- */

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

function isoDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso(): string {
  return isoDay(new Date())
}

function addDays(iso: string, days: number): string {
  const date = parseDay(iso)
  date.setDate(date.getDate() + days)
  return isoDay(date)
}

/** ყველა დღე `from`-დან `to`-მდე ჩათვლით */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day)
  return out
}

/** კვირის დღე — ორშაბათი 0, კვირა 6 (ქართული კალენდრის რიგი) */
export function weekdayIndex(iso: string): number {
  return (parseDay(iso).getDay() + 6) % 7
}

/**
 * პერიოდის სახელი — „1 ოქტ – 31 ოქტ 2026“; წლის საზღვარზე ორივე წელი.
 * ⚠️ `Intl` — თვის მოკლე სახელი ინტერფეისის ენაზეა.
 */
export function periodLabel(from: string, to: string, locale: string): string {
  const a = parseDay(from)
  const b = parseDay(to)
  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  return a.getFullYear() === b.getFullYear()
    ? `${dayMonth.format(a)} – ${full.format(b)}`
    : `${full.format(a)} – ${full.format(b)}`
}

/* ---------- რიცხვები ---------- */

/** „24“ · „7.5“ — ზედმეტი ნულის გარეშე */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10)
}

/** „1 250 ₾“ — ათასების გამყოფით ინტერფეისის ენაზე */
export function formatMoney(amount: number, currency: string, locale: string): string {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)
  return currency ? `${number} ${currency}` : number
}

/* ---------- ტარიფი ---------- */

/**
 * **რამდენი ეკუთვნის** — სერვერის `DutyPay`-ის ასლი, ფორმის წინასწარ შესავსებად:
 * ტიპზე — სამსახურის ტარიფი; ქასთომზე (ან ტარიფის გარეშე) — საათები ×
 * საათობრივი; არცერთი — `null`. ⚠️ ჩაწერისას თანხა ცხადად იგზავნება, ე.ი.
 * ეკრანზე რაც წერია, ის ინახება.
 */
export function dutyPay(workplace: DutyWorkplace | null | undefined, typeId: number | null, hours: number): number | null {
  if (!workplace) return null

  if (typeId != null) {
    const rate = workplace.rates.find((r) => r.type_id === typeId)
    if (rate) return Math.round(rate.pay * 100) / 100
  }

  return workplace.hourly_rate != null ? Math.round(hours * workplace.hourly_rate * 100) / 100 : null
}

/* ---------- სახელები და ფერები ---------- */

export function typeName(type: Pick<DutyShiftType, 'name_ka' | 'name_en'> | null | undefined, lang: string): string {
  if (!type) return ''
  return (lang === 'ka' ? type.name_ka : type.name_en) || type.name_ka || type.name_en
}

/**
 * **სამსახურების ფერები** — ვალიდირებული კატეგორიული პალიტრა, ფიქსირებული რიგით
 * (`index.css`, `--duty-1…8`). ⚠️ ბაზაში ღია თემის hex ინახება, ხატვისას კი
 * ცვლადი (`workplaceColor()`), რომ მუქ თემას თავისი საფეხური ჰქონდეს. ახალი
 * სამსახური რიგით შემდეგს იღებს.
 */
export const DUTY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const

/**
 * ფერი ხატვისთვის — პალიტრის ფერზე თემის ცვლადი, სხვაზე თავად hex (ძველი ან
 * ხელით ჩაწერილი), ფერის გარეშე — პირველი.
 */
export function workplaceColor(workplace: { color: string | null } | null | undefined): string {
  const color = workplace?.color?.toLowerCase()
  if (!color) return 'var(--duty-1)'

  const index = (DUTY_COLORS as readonly string[]).indexOf(color)
  return index >= 0 ? `var(--duty-${index + 1})` : color
}

/**
 * **დასრულება** — დაწყება + საათები (სერვერის `DutyShiftResource::end()`-ის ასლი,
 * ფორმის წინასწარ საჩვენებლად): `{ time: '09:00', day: 1 }`; დაწყების გარეშე — `null`.
 */
export function shiftEnd(start: string | null, hours: number): { time: string; day: number } | null {
  if (!start || !(hours > 0)) return null
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + Math.round(hours * 60)
  const minutes = total % 1440

  return {
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    day: Math.floor(total / 1440),
  }
}

/** „09:00 → 09:00 (+1)“ — დაწყების გარეშე `null` */
export function timeRange(start: string | null, end: { time: string; day: number } | null): string | null {
  if (!start || !end) return null
  return `${start} → ${end.time}${end.day > 0 ? ` (+${end.day})` : ''}`
}

/** შენახული მორიგეობის დიაპაზონი — სერვერის `end_time`/`end_day`-ით */
export function shiftRange(shift: Pick<DutyShift, 'start_time' | 'end_time' | 'end_day'>): string | null {
  return timeRange(shift.start_time, shift.end_time ? { time: shift.end_time, day: shift.end_day ?? 0 } : null)
}

/**
 * **ანაზღაურების რეჟიმი** — „მორიგეობაზე“ (ტარიფები ტიპებზე) ან „საათზე“
 * (მხოლოდ საათობრივი). ⚠️ რეჟიმი სქემაში არ ინახება: ტარიფი თუ აქვს —
 * მორიგეობაზეა (`DutyPay`-შიც ტარიფი იმარჯვებს), თორემ საათობრივი თუ აქვს —
 * საათზე; არცერთი — „ტარიფი არ არის“ (`null`).
 */
export function payMode(workplace: Pick<DutyWorkplace, 'rates' | 'hourly_rate'>): 'shift' | 'hour' | null {
  if (workplace.rates.length) return 'shift'
  return workplace.hourly_rate != null ? 'hour' : null
}

/**
 * საათები — ნაწილობრივზე „10 / 24“ (ნამუშევარი / ტიპის), სხვაგან „24“.
 */
export function hoursLabel(shift: Pick<DutyShift, 'hours' | 'status' | 'type'>): string {
  const planned = shift.type?.hours
  return shift.status === 'partial' && planned && planned !== shift.hours
    ? `${formatHours(shift.hours)} / ${formatHours(planned)}`
    : formatHours(shift.hours)
}

/* ---------- რიტმი ---------- */

/** დღეებს შორის მანძილი (`b - a`) */
function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000)
}

/**
 * რიტმის შემდეგი დღეები — `anchor`-იდან ყოველ `interval` დღეში, `from`-ზე ან მის
 * შემდეგ (სერვერის `DutyPattern::datesBetween()`-ის ასლი, ფანჯრის წინასწარ საჩვენებლად).
 */
export function patternDates(anchor: string, interval: number, from: string, count: number): string[] {
  const step = Math.max(1, Math.round(interval))
  const offset = daysBetween(anchor, from)
  let day = offset <= 0 ? anchor : addDays(anchor, Math.ceil(offset / step) * step)
  const out: string[] = []

  while (out.length < count) {
    out.push(day)
    day = addDays(day, step)
  }

  return out
}

/**
 * **„რიტმი მონიშნულიდან“** — მონიშნული დღეების ერთი სამსახურის მორიგეობებიდან
 * (ყველაზე ხშირი სამსახური): ინტერვალი = მათ შორის მანძილი (თანაბარი უნდა იყოს),
 * პირველი დღე = პირველი, ტიპი — ყველაზე ხშირი, დაწყება — პირველისა. `uneven` —
 * მანძილი არათანაბარია; `null` — ორზე ნაკლები მორიგეობაა.
 */
export function patternFromShifts(shifts: DutyShift[]):
  | { workplace_id: number; interval_days: number; anchor_date: string; type_id: number | null; hours: number; start_time: string | null; ids: number[] }
  | 'uneven'
  | null {
  const counts = new Map<number, DutyShift[]>()
  for (const shift of shifts) {
    if (shift.workplace_id == null) continue
    counts.set(shift.workplace_id, [...(counts.get(shift.workplace_id) ?? []), shift])
  }

  const group = [...counts.values()].sort((a, b) => b.length - a.length)[0]
  if (!group || group.length < 2) return null

  const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
  const gaps = sorted.slice(1).map((shift, i) => daysBetween(sorted[i].date, shift.date))
  if (gaps.some((gap) => gap <= 0 || gap !== gaps[0])) return 'uneven'

  const types = new Map<number | null, number>()
  for (const shift of sorted) types.set(shift.type_id, (types.get(shift.type_id) ?? 0) + 1)
  const typeId = [...types.entries()].sort((a, b) => b[1] - a[1])[0][0]

  return {
    workplace_id: sorted[0].workplace_id!,
    interval_days: gaps[0],
    anchor_date: sorted[0].date,
    type_id: typeId,
    hours: sorted.find((s) => s.type_id === typeId)?.hours ?? sorted[0].hours,
    start_time: sorted[0].start_time,
    ids: sorted.map((s) => s.id),
  }
}

/** კალენდრის ჩიპი — „A · 24“, ნაწილობრივზე „A · 10 / 24“ (სამსახურის გარეშე — მხოლოდ საათები) */
export function chipLabel(shift: Pick<DutyShift, 'hours' | 'workplace' | 'status' | 'type'>): string {
  const short = shift.workplace?.short || shift.workplace?.name?.slice(0, 1)
  return short ? `${short} · ${hoursLabel(shift)}` : hoursLabel(shift)
}
