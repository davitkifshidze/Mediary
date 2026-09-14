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
  /**
   * რამდენ ჩანაწერს აქვს TMDB-ის ქართული აღწერა, ე.ი. გადასამოწმებელია.
   *
   * ⚠️ **`total`-ში განზრახ არ შედის** — ჰედერის badge „ნაკლულ თარგმანს"
   * ნიშნავს; გადამოწმება ცხადი არჩევანია და ჯამში ჩადებული badge-ს
   * სამუდამოდ აანთებდა.
   */
  reviewable: number
  /** `GEMINI_API_KEY` არის თუ არა — უამისოდ მხოლოდ TMDB-ის ტექსტი მოვა */
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
  /** `review` რეჟიმზე — ეს ჩანაწერი გადასამოწმებლად არის რიგში */
  review: boolean
}

export interface TranslationPlanFilters {
  types?: MediaType[]
  status?: string
  favorite?: boolean
  genres?: string[]
  ids?: Record<MediaType, number[]>
  include_genres?: boolean
  /** TMDB-ის ქართული აღწერის გადამოწმება Gemini-თ (2026-09-14) */
  review?: boolean
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
  /** ველი → წყარო — „რა რითი ითარგმნა" */
  providers?: Record<string, TranslationProvider>
  error: string | null
  title?: string
}

/* ---------- წყაროს არჩევანი (2026-09-14) ---------- */

/**
 * რომელი წყაროებით ვთარგმნით — `ItemTranslator::SOURCES`-ის ასლი.
 *
 * ⚠️ **თანმიმდევრობა სერვერისაა** (ჯერ TMDB, მერე Gemini) — აქ მხოლოდ
 * „რომელი ჩაირთოს" იგზავნება.
 */
export const TRANSLATION_SOURCES = ['tmdb', 'gemini'] as const
export type TranslationSource = (typeof TRANSLATION_SOURCES)[number]

/**
 * რამ **შეავსო** ველი — პასუხისა და ლოგის მნიშვნელობა.
 *
 * ⚠️ **`TranslationSource`-ისგან განზრახ ცალკეა**: წყარო *არჩევანია*
 * (რა ჩავრთოთ), ეს კი *შედეგია* (რამ შეავსო). `review` არჩევად წყაროდ
 * არასდროს იგზავნება — ის ცალკე დროშაა, სხვა ღერძზე.
 */
export type TranslationProvider = TranslationSource | 'review'

export interface TranslationUsage {
  gemini: {
    provider: string
    model: string | null
    configured: boolean
    used: number
    limit: number
    /** `null` = ლიმიტი გამორთულია; `0` = ამოიწურა */
    remaining: number | null
    rpm_used: number
    rpm_limit: number
    exhausted: boolean
  }
  recent: {
    id: number
    type: string | null
    record_id: number | null
    title: string | null
    /** ველი → წყარო */
    fields: Record<string, TranslationProvider>
    at: string | null
  }[]
}

/**
 * ⚠️ **არჩევანის გარეშე `sources` საერთოდ არ იგზავნება** — სერვერი
 * გასაღების არსებობას „ორივედ" კითხულობს, ცარიელ მასივს კი — 422-ით.
 * ე.ი. ძველი კლიენტი არ ერთვის.
 */
function sourceBody(sources?: TranslationSource[], review?: boolean) {
  return { ...(sources?.length ? { sources } : {}), ...(review ? { review: true } : {}) }
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
  sources?: TranslationSource[],
  review?: boolean,
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const { data } = await api.post(`/translations/${type}/${id}`, sourceBody(sources, review), { signal })
  return data
}

/** ჟანრების ლექსიკონი — ერთი გატარებით */
export async function translateGenres(
  sources?: TranslationSource[],
  signal?: AbortSignal,
): Promise<TranslateResult & { translated: number }> {
  const { data } = await api.post('/translations/genres', sourceBody(sources), { signal })
  return data
}

/** ხარჯი + ბოლო თარგმანების ლოგი */
export async function fetchTranslationUsage(): Promise<TranslationUsage> {
  const { data } = await api.get('/translations/usage')
  return data
}
