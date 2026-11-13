import { api } from '@/lib/api'
import type { SyncOutcome } from '@/api/types'
import type { MediaType } from '@/lib/media'

/* ============================================================
   თარგმანები.

   იმავე per-item მოდელით, რაც სინქრონსა და გალერეაზეა: `plan` აბრუნებს რიგს,
   შემდეგ თითო ჩანაწერზე ერთი მოკლე რექვესთი მიდის (ციკლს queue ატარებს).
   ჟანრები გამონაკლისია — გლობალური ლექსიკონია და ერთ რექვესთში მუშავდება.

   **თარგმანი ნაწილებად იშლება** (`TRANSLATION_PARTS`): სათაური და აღწერა ორივე
   მიმართულებით, გადასამოწმებელი აღწერები, ჟანრები და მსახიობების ქართული სახელები და
   ბიოგრაფიები. თითო ნაწილს თავისი რიცხვი აქვს (`fetchTranslationParts`) და ცალკე
   ეშვება: გეგმა და ერთეულის მოთხოვნა მხოლოდ არჩეულ ნაწილს ეხება.
   ============================================================ */

/** ჩანაწერის ნაწილები — ველი და მიმართულება (`TranslationScanner::FIELDS`-ის სარკე) */
export const TRANSLATION_FIELDS = ['title_ka', 'title_en', 'description_ka', 'description_en'] as const
export type TranslationField = (typeof TRANSLATION_FIELDS)[number]

/** თარგმანის ყველა ნაწილი (`TranslationScanner::PARTS`-ის სარკე) */
export const TRANSLATION_PARTS = [...TRANSLATION_FIELDS, 'review', 'genres', 'cast_names', 'cast_bios'] as const
export type TranslationPart = (typeof TRANSLATION_PARTS)[number]

/** მსახიობზე რა ითარგმნება (`CastTranslator::FIELDS`-ის სარკე) */
export type CastTranslationField = 'name' | 'biography'

/** ჩაშლილი რიცხვები — თარგმანის გვერდების ბარათები */
export interface TranslationParts {
  /** რომელ მოდულებზეა დათვლილი (მოდულის გვერდზე — ერთი) */
  types: MediaType[]
  /** ნაწილი → რამდენია სათარგმნი; ჩანაწერის ნაწილებზე — მოდულებადაც */
  parts: Record<TranslationPart, { count: number; by_type?: Partial<Record<MediaType, number>> }>
  translator_configured: boolean
  tmdb_configured: boolean
}

/** ჰედერის badge-ის მონაცემი */
export interface TranslationSummary {
  movie: number
  series: number
  anime: number
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
  /** შენი Gemini-ის გასაღები („მონაცემები") არის თუ არა — უამისოდ მხოლოდ TMDB-ის ტექსტი მოვა */
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
  /** რომელი ნაწილები გაეშვას — ველებს, გადამოწმებას, ჟანრებსა და მსახიობებს ერთად წყვეტს */
  parts?: TranslationPart[]
  /** ბოლო გაშვებაზე ნათარგმნი აღარ ჩანს; ცარიელი და ჩავარდნილი რჩება */
  hide_processed?: boolean
}

/** გეგმის მსახიობი — რა გაეშვება მასზე (ქართული სახელი და/ან ბიოგრაფია) */
export interface TranslationCastItem {
  type: 'actor'
  id: number
  title: string
  missing: CastTranslationField[]
}

export interface TranslationPlan {
  items: TranslationPlanItem[]
  count: number
  /** მსახიობები — ცალკე ერთეულები, ჩანაწერების შემდეგ */
  cast: TranslationCastItem[]
  cast_count: number
  /**
   * Gemini-ს ხარჯი გაშვებამდე: მაქსიმუმ რამდენი მოთხოვნაა (რასაც TMDB შეავსებს, Gemini-მდე
   * არ მიდის) და რამდენ დღეს გაწვდება დღიური ლიმიტი (`null` — ლიმიტი ან გასაღები არ არის).
   */
  gemini: { requests: number; limit: number; remaining: number | null; days: number | null }
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
  /** `updated` · `empty` · `failed`; გამოტოვებაზე `null` */
  result?: SyncOutcome | null
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
  /** ბოლო გაშვებებზე ვერაფერი შეივსო: ცარიელი ან ჩავარდნილი */
  unfilled: {
    type: string
    record_id: number
    title: string | null
    result: SyncOutcome
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

export async function fetchTranslationParts(type?: MediaType): Promise<TranslationParts> {
  const { data } = await api.get('/translations/parts', { params: type ? { type } : undefined })
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
  /** რიგის გაშვების გასაღები და დაგეგმილი რიცხვი — ერთეული სინქრონიზაციის ისტორიაში იწერება */
  run?: { run?: string; run_total?: number },
  /** მხოლოდ ეს ველები; მის გარეშე — ყველაფერი, რაც აკლია (ცარიელი სია — მხოლოდ გადამოწმება) */
  fields?: TranslationField[],
): Promise<TranslateResult> {
  const { data } = await api.post(
    `/translations/${type}/${id}`,
    { ...sourceBody(sources, review), ...(fields ? { fields } : {}), ...run },
    { signal },
  )
  return data
}

/**
 * ერთი მსახიობის ქართული სახელი და/ან ბიოგრაფია. ⚠️ `gemini_quota_exceeded` — დღიური
 * ლიმიტი ამოიწურა: რიგი ჩერდება და ერთეული ისტორიაში ჩავარდნილად არ იწერება.
 */
export async function translateActor(
  id: number,
  opts: { fields?: CastTranslationField[]; sources?: TranslationSource[] },
  signal?: AbortSignal,
  run?: { run?: string; run_total?: number },
): Promise<TranslateResult> {
  const { data } = await api.post(
    `/translations/actor/${id}`,
    { ...sourceBody(opts.sources), ...(opts.fields?.length ? { fields: opts.fields } : {}), ...run },
    { signal },
  )
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
