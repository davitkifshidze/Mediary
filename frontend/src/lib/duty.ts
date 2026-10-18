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

/** კალენდრის ჩიპი — „A · 24“ (სამსახურის გარეშე — მხოლოდ საათები) */
export function chipLabel(shift: Pick<DutyShift, 'hours' | 'workplace'>): string {
  const short = shift.workplace?.short || shift.workplace?.name?.slice(0, 1)
  return short ? `${short} · ${formatHours(shift.hours)}` : formatHours(shift.hours)
}
