import { api } from '@/lib/api'

/* ============================================================
   სტატისტიკა (FEAT-08).

   ⚠️ **დეშბორდს არ ცვლის**: ის „რა მაქვს და სად შევდივარ"-ს პასუხობს
   (ბარათი = ერთი რიცხვი + ბმული), ეს კი „რა გავაკეთე"-ს. 19.10-ის
   გადაწყვეტილება („ჯერ მხოლოდ რაოდენობა") ამიტომ რჩება ძალაში.

   ⚠️ **ერთი რექვესთი ყველა ჩართულ მოდულზე** — გვერდი ისედაც ყველა ჭრილს
   ერთად ხატავს, ათი ცალკე მოთხოვნა კი ერთ გახსნაზე ათით ხარჯავდა
   `throttle:api`-ს ლიმიტს.
   ============================================================ */

/** სტატუსის ჭრილი; enum-იან მოდულებზე `role`/`name_*` ცარიელია */
export interface StatStatus {
  key: string | null
  name_ka: string | null
  name_en: string | null
  role: string | null
  color: string | null
  count: number
}

export interface StatNamed {
  id: number
  name_ka: string | null
  name_en: string | null
  count: number
  /** „სხვა" რიგი — რამდენი ჟანრია მასში მოყრილი */
  rest?: number
}

export interface StatModule {
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  color: string | null
  module: string
  total: number
  favorites: number
  status: StatStatus[]
  years: { year: number; count: number }[]
  genres: StatNamed[]
  ratings: { score: number; count: number }[]
  months: { month: number; count: number }[]
  /** აქვს თუ არა ამ მოდულს „როდის გავაკეთე" თარიღი (წიგნს — არა) */
  has_months: boolean
}

export interface StatsPayload {
  year: number
  /** წლები, რომლებშიც აქტივობა მაქვს — ამომრჩევს სია სჭირდება */
  years: number[]
  data: StatModule[]
}

export async function fetchStats(year?: number): Promise<StatsPayload> {
  const res = await api.get('/stats', { params: year ? { year } : {} })
  return res.data
}

/* ---------- დეშბორდის ჯამი (2026-09-19) ---------- */

export interface StatsSummary {
  year: number
  month: number
  totals: {
    /** სულ ჩანაწერი ათივე მოდულში — ⚠️ გალერეის ფოტოები აქ არ ითვლება */
    records: number
    favorites: number
    done_year: number
    done_month: number
  }
  months: { month: number; count: number }[]
}

/**
 * ⚠️ **ცალკე რექვესთია და არა `fetchStats()`-ის ნაწილი** — სრული პასუხი
 * ათივე მოდულის ხუთივე ჭრილს ითვლის, დეშბორდს კი ოთხი რიცხვი სჭირდება.
 */
export async function fetchStatsSummary(): Promise<StatsSummary> {
  const res = await api.get('/stats/summary')
  return res.data
}
