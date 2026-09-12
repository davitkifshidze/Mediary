import { api } from '@/lib/api'
import type { MediaType } from '@/lib/media'

/* ============================================================
   თარგმანები (Tasks 7).

   იმავე per-item მოდელით, რაც სინქრონსა და გალერეაზეა: `plan` აბრუნებს რიგს,
   შემდეგ თითო ჩანაწერზე ერთი მოკლე რექვესთი მიდის (ციკლს queue ატარებს).
   ჟანრები გამონაკლისია — გლობალური ლექსიკონია და ერთ რექვესთში მუშავდება.
   ============================================================ */

/** ჰედერის badge-ის მონაცემი */
export interface TranslationSummary {
  movie: number
  series: number
  genres: number
  total: number
  /** `ANTHROPIC_API_KEY` არის თუ არა — უამისოდ მხოლოდ TMDB-ის ტექსტი მოვა */
  translator_configured: boolean
  tmdb_configured: boolean
}

export interface TranslationPlanItem {
  type: MediaType
  id: number
  title: string
  year: number | null
  /** რომელი ველები აკლია: `title_ka`, `description_en`… */
  missing: string[]
}

export interface TranslationPlanFilters {
  types?: MediaType[]
  status?: string
  favorite?: boolean
  genres?: string[]
  ids?: Record<MediaType, number[]>
  include_genres?: boolean
}

export interface TranslationPlan {
  items: TranslationPlanItem[]
  count: number
  /** ჟანრები რიგში შედის თუ არა (0 ან სათარგმნების რაოდენობა) */
  genres: number
  /** სათარგმნი ჟანრები საერთოდ — არჩევანის მიუხედავად */
  genres_pending: number
  eta_seconds: number
}

export interface TranslateResult {
  ok: boolean
  skipped: boolean
  changed?: string[]
  error: string | null
  title?: string
}

export async function fetchTranslationSummary(): Promise<TranslationSummary> {
  const { data } = await api.get('/translations/summary')
  return data
}

export async function fetchTranslationPlan(filters: TranslationPlanFilters): Promise<TranslationPlan> {
  const { data } = await api.post('/translations/plan', filters)
  return data
}

export async function translateItem(
  type: MediaType,
  id: number,
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const { data } = await api.post(`/translations/${type}/${id}`, {}, { signal })
  return data
}

/** ჟანრების ლექსიკონი — ერთი გატარებით */
export async function translateGenres(signal?: AbortSignal): Promise<TranslateResult & { translated: number }> {
  const { data } = await api.post('/translations/genres', {}, { signal })
  return data
}
