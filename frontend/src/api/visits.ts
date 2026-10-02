import { api } from '@/lib/api'

/* ============================================================
   **შესვლების მთვლელი და ჟურნალი** (Tasks §10, Q2).

   „შესვლა" დეტალის გახსნაა (გვერდის ან მოდალის) — საათში ერთხელ თითო
   მნახველზე; დედუპლიკაცია backend-შია (`RecordVisits`). ⚠️ `POST` არაფერს
   ქმნის ბიბლიოთეკაში და ჩავარდნა ჩუმია (`recordVisit`-ის იგივე წესი):
   მთვლელის ვერ-ჩაწერამ ფანჯარა არ უნდა გატეხოს.
   ============================================================ */

/**
 * ⚠️ `Visitable::TYPES`-ის სარკე — URL-ის სეგმენტი და morph-ალიასი ერთი
 * სიტყვაა; `RegistryConsistencyTest` რიგის ჩათვლით ადარებს.
 */
export const VISIT_TYPES = [
  'movie',
  'series',
  'anime',
  'video',
  'song',
  'book',
  'board_game',
  'game',
  'note',
  'bookmark',
  'course',
  'place',
  'playlist',
  'custom_record',
] as const

export type VisitType = (typeof VISIT_TYPES)[number]

export type VisitSource = 'library' | 'public' | 'share'

export interface VisitEntry {
  id: number
  /** ვინ შევიდა — ანონიმზე `null`; ანგარიშის წაშლის შემდეგაც `null`, სახელი `viewer_name`-შია */
  viewer: { id: number; name: string; username: string } | null
  viewer_name: string | null
  is_me: boolean
  source: VisitSource
  visited_at: string | null
}

export interface VisitSummary {
  count: number
  /** ჩემი შესვლები */
  mine: number
  last_at: string | null
  /** ბოლო 20 — ახლიდან ძველისკენ */
  entries: VisitEntry[]
}

export function visitsKey(type: VisitType, id: number): readonly [string, VisitType, number] {
  return ['visits', type, id] as const
}

export async function fetchRecordVisits(type: VisitType, id: number): Promise<VisitSummary> {
  const { data } = await api.get(`/visits/${type}/${id}`)
  return data.data
}

/** „დეტალი გაიხსნა" — სერვერი თვითონ წყვეტს, ითვლება თუ არა (საათში ერთხელ) */
export async function recordRecordVisit(type: VisitType, id: number): Promise<VisitSummary | null> {
  try {
    const { data } = await api.post(`/visits/${type}/${id}`)
    return data.data
  } catch {
    return null
  }
}
