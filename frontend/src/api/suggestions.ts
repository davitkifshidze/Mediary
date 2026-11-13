import { api } from '@/lib/api'
import { mediaOf, type MediaType } from '@/lib/media'
import type { Page } from '@/lib/paged'
import type { SoonTrailer } from '@/api/soon'
import type { Status } from '@/api/types'

/* ============================================================
   „შემოთავაზებები" — მსგავსი სათაურები ჩემი არჩევანის მიხედვით
   (`GET /{module}/suggestions`), ჩემი სიიდანაც და გარედანაც.

   ⚠️ **პასუხი ორგვარია.** სანამ სერვერი საფუძვლების მასალას წყაროებიდან აგროვებს,
   `ready: false` მოდის პროგრესით და იმავე მოთხოვნის გამეორება სამუშაოს აგრძელებს
   (ერთი მოთხოვნა შეზღუდულ სამუშაოს ასრულებს — ერთნაკადიან სერვერს არ ბლოკავს).
   `fetchSuggestions()` ამ ციკლს თვითონ ატარებს და გვერდს მხოლოდ მზა შედეგს აძლევს.

   ⚠️ საფუძვლის ფილტრებს სერვერზე `b_` თავსართი აქვს — შედეგის ფილტრებს (ჟანრი,
   წელი, რეიტინგი) იგივე სახელები ჰქვია.
   ============================================================ */

/** რაზე დგას შემოთავაზება — ინახება მოდულზე (`module_user.settings.suggest`) */
export interface SuggestSelection {
  /** სტატუსების გასაღებები (ჩემი ლექსიკონიდან) */
  statuses: string[]
  favorite: boolean
  /** ხელით მონიშნული სათაურები; ცარიელი — არჩეული სტატუსების მთელი ავზი */
  ids: number[]
  /** დავიწროება: ჟანრების slug-ები და „დან – მდე" წყვილები (ცარიელი სტრიქონი — ზღვარი არ არის) */
  genre: string[]
  yearMin: string
  yearMax: string
  myRatingMin: string
  myRatingMax: string
  ratingMin: string
  ratingMax: string
}

export const EMPTY_SELECTION: SuggestSelection = {
  statuses: [],
  favorite: false,
  ids: [],
  genre: [],
  yearMin: '',
  yearMax: '',
  myRatingMin: '',
  myRatingMax: '',
  ratingMin: '',
  ratingMax: '',
}

export type SuggestCut = 'all' | 'mine' | 'new'

/** შედეგის ფილტრი — გვერდზე რჩება, მოდულზე არ ინახება */
export interface SuggestFilters {
  cut: SuggestCut
  hidden: boolean
  genre: string
  yearMin: string
  yearMax: string
  ratingMin: string
}

export const EMPTY_FILTERS: SuggestFilters = { cut: 'all', hidden: false, genre: '', yearMin: '', yearMax: '', ratingMin: '' }

/** საფუძვლის ჩანაწერი მოკლედ — ამრჩევის რიგი და „რაზე დგას" ჩიპი */
export interface BasisRecord {
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  poster: string | null
  is_favorite: boolean
  status: Status | null
}

/** `ok` · `missing` (გასაღები არ არის) · `failed` (ჩავარდა, დროებით გამოთიშულია) · `off` (ამ მოდულს არ ეხება) */
export type SourceState = 'ok' | 'missing' | 'failed' | 'off'

export type SuggestSource = 'tmdb' | 'trakt' | 'anilist'

interface WhyBasis {
  id: number
  title_ka: string | null
  title_en: string | null
}

export interface SuggestionWhy {
  /** ჩემი სათაურები, რომლებზეც წყაროებმა ამ სათაურის მსგავსად მიუთითეს (პირველი რამდენიმე) */
  bases: (WhyBasis & { sources: SuggestSource[] })[]
  bases_total: number
  /** საერთო ჟანრები ჩემი არჩევანის მთავარ ჟანრებთან */
  genres: { name_en: string | null; name_ka: string | null }[]
  /** საკვანძო სიტყვები, რომლებიც ჩემს რამდენიმე სათაურს აქვს (TMDB-ის სიტყვა, ინგლისურად) */
  keywords: string[]
  /** სიუჟეტით ყველაზე ახლო ჩემი სათაური; `match` — სიახლოვე პროცენტად */
  plot: (WhyBasis & { match: number }) | null
}

export interface Suggestion {
  tmdb_id: number
  title: string
  title_ka: string | null
  year: number | null
  rating: number | null
  poster: string | null
  overview: string | null
  overview_ka: string | null
  genres: { name_en: string | null; name_ka: string | null }[]
  /** უკვე ჩემს სიაშია (და ჯერ არ მინახავს) */
  owned: boolean
  record: { id: number; status: Status | null; is_favorite: boolean } | null
  /** „დამალულების" სიის რიგი — მხოლოდ სათაური, წელი და პოსტერი აქვს */
  hidden: boolean
  score: number | null
  why: SuggestionWhy | null
}

export interface SuggestProgress {
  /** `sources` — საფუძვლების მასალა · `titles` — სათაურების აღწერები · `keywords` · `plot` — სიუჟეტის შედარება */
  stage: 'sources' | 'titles' | 'keywords' | 'plot'
  done: number
  total: number
}

export interface SuggestionPage extends Page<Suggestion> {
  basis: { used: number; total: number; limit: number; records: BasisRecord[] }
  sources: Record<'trakt' | 'anilist' | 'gemini', SourceState>
  counts: Record<SuggestCut | 'hidden', number>
  /** რამდენ სათაურს აქვს აღწერის ვექტორი და რამდენს ჯერ არა */
  plot: { vectors: number; missing: number } | null
}

interface SuggestionResponse {
  ready: boolean
  progress: SuggestProgress | null
  basis: SuggestionPage['basis']
  sources: SuggestionPage['sources']
  counts: SuggestionPage['counts'] | null
  plot: SuggestionPage['plot']
  data: Suggestion[]
  meta: { total: number; last_page: number } | null
}

/** ცარიელი ველი მოთხოვნაში არ მიდის */
const filled = (value: string) => (value.trim() === '' ? undefined : value.trim())

/** საფუძვლის არჩევანი მოთხოვნის პარამეტრებად (`b_` — საფუძვლის ფილტრი) */
export function selectionParams(selection: SuggestSelection): Record<string, string | number | undefined> {
  return {
    statuses: selection.statuses.join(',') || undefined,
    favorite: selection.favorite ? 1 : undefined,
    ids: selection.ids.join(',') || undefined,
    b_genre: selection.genre.join(',') || undefined,
    b_year_min: filled(selection.yearMin),
    b_year_max: filled(selection.yearMax),
    b_my_rating_min: filled(selection.myRatingMin),
    b_my_rating_max: filled(selection.myRatingMax),
    b_rating_min: filled(selection.ratingMin),
    b_rating_max: filled(selection.ratingMax),
  }
}

/** მაქსიმუმ რამდენჯერ მეორდება მოთხოვნა, სანამ მასალა გროვდება — უსასრულო ციკლის დაზღვევა */
const MAX_ROUNDS = 400

/**
 * შედეგის ერთი გვერდი. სანამ მასალა გროვდება, მოთხოვნა მეორდება და `onProgress` პროგრესს იღებს.
 * ⚠️ `refresh` („თავიდან") მხოლოდ პირველ მოთხოვნას მიჰყვება — თორემ ყოველი გამეორება
 * ქეშს თავიდან დაცლიდა და ციკლი არ დასრულდებოდა.
 */
export async function fetchSuggestions(
  type: MediaType,
  selection: SuggestSelection,
  filters: SuggestFilters,
  page: number,
  perPage: number,
  options: { refresh?: boolean; onProgress?: (progress: SuggestProgress | null, basis: SuggestionPage['basis']) => void } = {},
): Promise<SuggestionPage> {
  const params = {
    ...selectionParams(selection),
    cut: filters.cut === 'all' ? undefined : filters.cut,
    hidden: filters.hidden ? 1 : undefined,
    genre: filled(filters.genre),
    year_min: filled(filters.yearMin),
    year_max: filled(filters.yearMax),
    rating_min: filled(filters.ratingMin),
    page,
    per_page: perPage,
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data } = await api.get<SuggestionResponse>(`${mediaOf(type).apiBase}/suggestions`, {
      params: { ...params, refresh: options.refresh && round === 0 ? 1 : undefined },
    })

    if (data.ready && data.counts) {
      options.onProgress?.(null, data.basis)

      return {
        items: data.data ?? [],
        total: data.meta?.total ?? 0,
        lastPage: Math.max(1, data.meta?.last_page ?? 1),
        basis: data.basis,
        sources: data.sources,
        counts: data.counts,
        plot: data.plot,
      }
    }

    options.onProgress?.(data.progress, data.basis)
  }

  throw new Error('suggestions_not_ready')
}

/** ამრჩევის სია: არჩეული სტატუსებისა და „რჩეულის" ჩანაწერები (დავიწროების შემდეგ), ძებნით */
export async function fetchBasisPool(
  type: MediaType,
  selection: SuggestSelection,
  q: string,
): Promise<{ total: number; limit: number; data: BasisRecord[] }> {
  const { data } = await api.get<{ total: number; limit: number; data: BasisRecord[] }>(`${mediaOf(type).apiBase}/suggestions/basis`, {
    params: { ...selectionParams({ ...selection, ids: [] }), q: filled(q) },
  })

  return data
}

/** „არ მაინტერესებს" (`hidden: true`) ან მისი მოხსნა */
export async function setSuggestionHidden(type: MediaType, item: Pick<Suggestion, 'tmdb_id' | 'title' | 'year' | 'poster'>, hidden: boolean) {
  const { data } = await api.patch<{ hidden: boolean; count: number }>(`${mediaOf(type).apiBase}/suggestions/hidden`, {
    tmdb_id: item.tmdb_id,
    hidden,
    title: item.title,
    year: item.year,
    poster: item.poster,
  })

  return data
}

/** ახალი სათაურის თრეილერი — მოთხოვნისას (სიაში თითოზე ცალკე მოთხოვნა გვერდს დააგვიანებდა) */
export async function fetchSuggestionTrailer(type: MediaType, tmdbId: number): Promise<SoonTrailer | null> {
  const { data } = await api.get<{ trailer: SoonTrailer | null }>(`${mediaOf(type).apiBase}/suggestions/trailer`, {
    params: { tmdb_id: tmdbId },
  })

  return data.trailer
}
