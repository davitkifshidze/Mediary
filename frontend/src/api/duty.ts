import { api } from '@/lib/api'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   **მორიგეობა — მოდული `duty` (Tasks §34).**

   სამსახური (ტარიფებით) · ტიპი (კლასიფიკატორი, `/dictionaries`) · მორიგეობა ·
   პერიოდი (შენი „თვე“ — `period_start_day`) · ჯამები.

   ⚠️ **თანხა სერვერზე ითვლება, როცა `pay` არ იგზავნება** (`DutyPay`); ფორმა
   მას წინასწარ ავსებს იმავე წესით (`lib/duty.ts` → `dutyPay()`), რომ ჩანდეს,
   რა ჩაიწერება — და თუ შეცვლი, ცხადად აგზავნის.
   ============================================================ */

export const DUTY_KEY = 'duty' as const

export interface DutyRate {
  type_id: number
  pay: number
}

export interface DutyWorkplace {
  id: number
  name: string
  /** კალენდრის ჩიპის ასო — „A · 24“ */
  short: string | null
  color: string | null
  hourly_rate: number | null
  is_active: boolean
  sort_order: number
  rates: DutyRate[]
  shifts_count: number
}

export interface DutyShiftType {
  id: number
  key: string
  name_ka: string
  name_en: string
  hours: number
  icon: string | null
  sort_order: number
  shifts_count: number
  [extra: string]: unknown
}

export interface DutyShift {
  id: number
  /** `YYYY-MM-DD` — ღამის მორიგეობაზე დაწყების დღე (Q8) */
  date: string
  /** `HH:MM` */
  start_time: string | null
  hours: number
  pay: number | null
  note: string | null
  is_favorite: boolean
  workplace_id: number | null
  type_id: number | null
  workplace: { id: number; name: string; short: string | null; color: string | null } | null
  type: { id: number; name_ka: string; name_en: string; hours: number; icon: string | null } | null
  created_at: string | null
}

export interface DutyRange {
  from: string
  to: string
}

export interface DutyPeriodInfo extends DutyRange {
  previous: DutyRange
  next: DutyRange
}

export interface DutySettingsData {
  period: { since: string | null; day: number }[]
  currency: string
  default_workplace_id: number | null
  default_type_id: number | null
  /** დღეს მოქმედი „პერიოდის პირველი დღე“ */
  period_start_day: number
  /** მომავალი ცვლილება — „15-დან, 1 ნოემბრიდან“ */
  pending: { since: string; day: number } | null
  current: DutyPeriodInfo
  /** §34.7 — შეხსენება წინა დღეს („20:00“); `null` — გამორთულია */
  remind_at: string | null
  /** შეხსენება ტელეგრამითაც (ბოტი `/credentials`-შია) */
  remind_telegram: boolean
}

export interface DutyTotals {
  shifts: number
  hours: number
  pay: number
  /** თანხის გარეშე მორიგეობები (ტარიფი არ იყო) — ჯამში არ შედის */
  unpaid: number
}

export interface DutySummary extends DutyRange {
  /** შუალედი ზუსტად ერთი პერიოდია — მაშინ მოდის `previous` */
  is_period: boolean
  totals: DutyTotals
  workplaces: (DutyTotals & { workplace_id: number | null })[]
  types: (DutyTotals & { type_id: number | null })[]
  previous?: DutyTotals & DutyRange
}

export interface DutyPeriodTotals extends DutyRange {
  totals: DutyTotals
  workplaces: (DutyTotals & { workplace_id: number | null })[]
}

/* ---------- პერიოდი და პარამეტრები ---------- */

export async function fetchDutyPeriod(date?: string): Promise<DutyPeriodInfo> {
  const { data } = await api.get('/duty/period', { params: date ? { date } : {} })
  return data
}

export async function fetchDutySettings(): Promise<DutySettingsData> {
  const { data } = await api.get('/duty/settings')
  return data
}

export interface DutySettingsInput {
  period_start_day?: number
  currency?: string
  default_workplace_id?: number | null
  default_type_id?: number | null
  remind_at?: string | null
  remind_telegram?: boolean
}

/**
 * **ხვალინდელი შეხსენებული მორიგეობები (§34.7)** — ღია აპის polling. სერვერი ჯერ
 * თვითონ ასრულებს შეხსენებას (cron-ის გარეშეც), მერე აბრუნებს ხვალინდელებს;
 * ჩვენებას ბრაუზერი იმახსოვრებს (`lib/dutyReminders.ts`).
 */
export async function fetchDueDutyReminders(): Promise<DutyShift[]> {
  const { data } = await api.get('/duty/reminders/due')
  return data.data
}

export async function updateDutySettings(input: DutySettingsInput): Promise<DutySettingsData> {
  const { data } = await api.put('/duty/settings', input)
  return data
}

/* ---------- ჯამები ---------- */

export async function fetchDutySummary(range: Partial<DutyRange> & { workplaceIds?: number[] } = {}): Promise<DutySummary> {
  const { data } = await api.get('/duty/summary', {
    params: {
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
      // axios მასივს `workplace_id[]=1&workplace_id[]=2`-ად აწყობს — Laravel-ის ფორმა
      ...(range.workplaceIds?.length ? { workplace_id: range.workplaceIds } : {}),
    },
  })
  return data
}

export async function fetchDutyPeriods(count = 12, until?: string): Promise<DutyPeriodTotals[]> {
  const { data } = await api.get('/duty/summary/periods', { params: { count, ...(until ? { until } : {}) } })
  return data.data
}

/* ---------- სამსახურები ---------- */

export interface DutyWorkplaceInput {
  name?: string
  short?: string | null
  color?: string | null
  hourly_rate?: number | null
  is_active?: boolean
  /** ⚠️ მთლიანი სია — აქ არმყოფი ტიპის ტარიფი იხსნება */
  rates?: { type_id: number; pay: number | null }[]
}

/** `locale` — ნაგულისხმევი სამსახურის სახელის ენა (პირველ წაკითხვაზე იქმნება) */
export async function fetchDutyWorkplaces(locale?: string): Promise<DutyWorkplace[]> {
  const { data } = await api.get('/duty/workplaces', { params: locale ? { locale } : {} })
  return data.data
}

export async function createDutyWorkplace(input: DutyWorkplaceInput): Promise<DutyWorkplace> {
  const { data } = await api.post('/duty/workplaces', input)
  return data.data
}

export async function updateDutyWorkplace(id: number, input: DutyWorkplaceInput): Promise<DutyWorkplace> {
  const { data } = await api.patch(`/duty/workplaces/${id}`, input)
  return data.data
}

export async function deleteDutyWorkplace(id: number, removal?: DictionaryRemoval): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/duty/workplaces/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderDutyWorkplaces(ids: number[]): Promise<DutyWorkplace[]> {
  const { data } = await api.post('/duty/workplaces/reorder', { ids })
  return data.data
}

/* ---------- ტიპები (კლასიფიკატორი) ---------- */

export interface DutyTypeInput {
  name_ka: string
  name_en: string
  hours: number
  icon?: string | null
}

export async function fetchDutyTypes(): Promise<DutyShiftType[]> {
  const { data } = await api.get('/duty/types')
  return data.data
}

export async function createDutyType(input: DutyTypeInput): Promise<DutyShiftType> {
  const { data } = await api.post('/duty/types', input)
  return data.data
}

export async function updateDutyType(id: number, input: DutyTypeInput): Promise<DutyShiftType> {
  const { data } = await api.patch(`/duty/types/${id}`, input)
  return data.data
}

export async function deleteDutyType(id: number, removal?: DictionaryRemoval): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/duty/types/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderDutyTypes(ids: number[]): Promise<DutyShiftType[]> {
  const { data } = await api.post('/duty/types/reorder', { ids })
  return data.data
}

/* ---------- მორიგეობები ---------- */

export interface DutyShiftFilters extends Partial<DutyRange> {
  workplace_id?: number
  type_id?: number
  favorite?: boolean
  q?: string
}

export async function fetchDutyShifts(filters: DutyShiftFilters = {}): Promise<{ items: DutyShift[]; range: DutyRange }> {
  const params: Record<string, string | number> = {}

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    params[key] = value === true ? 1 : (value as string | number)
  }

  const { data } = await api.get('/duty/shifts', { params })
  return { items: data.data, range: data.range }
}

/**
 * ⚠️ **გასაღების არსებობა ნიშნავს ცხად მნიშვნელობას**: `type_id: null` —
 * ქასთომ საათები (საათები სავალდებულოა); `pay` არ არის — ტარიფიდან ითვლება.
 */
export interface DutyShiftInput {
  date?: string
  workplace_id?: number | null
  type_id?: number | null
  hours?: number | null
  start_time?: string | null
  pay?: number | null
  note?: string | null
  is_favorite?: boolean
}

export async function fetchDutyShift(id: number): Promise<DutyShift> {
  const { data } = await api.get(`/duty/shifts/${id}`)
  return data.data
}

export async function createDutyShift(input: DutyShiftInput): Promise<DutyShift> {
  const { data } = await api.post('/duty/shifts', input)
  return data.data
}

export async function updateDutyShift(id: number, input: DutyShiftInput): Promise<DutyShift> {
  const { data } = await api.patch(`/duty/shifts/${id}`, input)
  return data.data
}

export async function deleteDutyShift(id: number): Promise<void> {
  await api.delete(`/duty/shifts/${id}`)
}

export async function toggleDutyFavorite(id: number): Promise<DutyShift> {
  const { data } = await api.patch(`/duty/shifts/${id}/favorite`)
  return data.data
}

export interface DutyBatchItem {
  date: string
  type_id?: number | null
  hours?: number | null
  pay?: number | null
  start_time?: string | null
  note?: string | null
}

/** **ერთიანი მონიშვნა** — N დღე ერთ ტრანზაქციაში (`POST /duty/shifts/batch`) */
export async function batchDutyShifts(input: {
  workplace_id: number | null
  type_id: number | null
  items: DutyBatchItem[]
}): Promise<DutyShift[]> {
  const { data } = await api.post('/duty/shifts/batch', input)
  return data.data
}

/** მონიშნულების სამსახური/ტიპი — თანხა ახალი ტარიფით ითვლება */
export async function bulkUpdateDutyShifts(
  ids: number[],
  changes: { workplace_id?: number | null; type_id?: number },
): Promise<number> {
  const { data } = await api.patch('/duty/shifts', { ids, ...changes })
  return data.updated
}

/** მონიშნულების წაშლა (ურნაში) */
export async function deleteDutyShifts(ids: number[]): Promise<number> {
  if (ids.length === 1) {
    await api.delete(`/duty/shifts/${ids[0]}`)
    return 1
  }

  const { data } = await api.delete('/duty/shifts', { data: { ids } })
  return data.trashed
}
