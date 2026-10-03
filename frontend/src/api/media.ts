import { api } from '@/lib/api'
import type { SyncOutcome } from '@/api/types'
import { pickParams, type PickOptions } from '@/lib/pick'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import { MEDIA, type MediaType } from '@/lib/media'
import type { Genre, Movie, MovieListItem } from './types'

/* ============================================================
   Generic მედია-API — movie/series ერთი factory-ით.
   საერთო რესურსები (genres, lookup, discover, actor) type-პარამეტრით.
   ============================================================ */

export interface MediaFilters extends ListParams {
  status?: string
  genre?: string
  favorite?: boolean
  q?: string
  sort?: string
  source?: string
  year_min?: number
  year_max?: number
  rating_min?: number
  rating_max?: number
  /**
   * ფრანჩაიზის დაჯგუფება (მხოლოდ ფილმებს ეხება, Tasks D1).
   * `false` → სუფთა დალაგება, ჯგუფი დაიშლება. undefined → backend-ის default (ჩართული).
   */
  group?: boolean
}

export interface BulkStatusInput {
  /** ⚠️ §6.4 — ლექსიკონის **გასაღები** (`watched`), და არა თვითონ რიგი */
  status: string
  ids?: number[]
  from_status?: string
}

/** Tasks §18.3 — რიგით დამატებისას სტატუსი და რჩეული ერთეულს მიჰყვება */
export interface AddFromTmdbOptions {
  status?: string
  favorite?: boolean
}

/** დომენზე მიბმული CRUD/სტატუსი/რჩეული/სინქრონი */
export function createMediaApi(base: string) {
  return {
    list: async (filters: MediaFilters = {}): Promise<Page<MovieListItem>> => {
      const { all, ...rest } = filters
      const params = { ...rest, ...(all ? { all: 1 } : {}) }
      const { data } = await api.get(base, { params })
      return readPage<MovieListItem>(data)
    },
    get: async (id: number | string): Promise<Movie> => {
      const { data } = await api.get(`${base}/${id}`)
      return data.data
    },
    create: async (payload: FormData): Promise<Movie> => {
      const { data } = await api.post(base, payload)
      return data.data
    },
    update: async (id: number, payload: FormData): Promise<Movie> => {
      payload.append('_method', 'PUT') // method spoofing — multipart-safe
      const { data } = await api.post(`${base}/${id}`, payload)
      return data.data
    },
    remove: async (id: number): Promise<void> => {
      await api.delete(`${base}/${id}`)
    },
    setStatus: async (id: number, status: string): Promise<Movie> => {
      const { data } = await api.patch(`${base}/${id}/status`, { status })
      return data.data
    },
    /**
     * Tasks §18 — რჩეულის **ცხადი** დაყენება; `parts` — ფრანჩაიზის სხვა ნაწილების
     * (ბიბლიოთეკაში არსებულების) id-ები, რომლებიც პოპაპში მოინიშნა. ⚠️ ჩუმი
     * გავრცელება სერვერზე აღარ არის — რაც აქ არ ჩამოითვალა, არ შეიცვლება.
     */
    setFavorite: async (id: number, value: boolean, parts: number[] = []): Promise<Movie> => {
      const { data } = await api.patch(`${base}/${id}/favorite`, { is_favorite: value, parts })
      return data.data
    },
    toggleFavorite: async (id: number): Promise<Movie> => {
      const { data } = await api.patch(`${base}/${id}/favorite`)
      return data.data
    },
    resync: async (id: number): Promise<Movie> => {
      const { data } = await api.post(`${base}/${id}/resync`)
      return data.data
    },
    /** მასობრივი სტატუსი — ids-ით ან from_status-ით. აბრუნებს განახლებულთა რაოდენობას. */
    bulkStatus: async (input: BulkStatusInput): Promise<number> => {
      const { data } = await api.post(`${base}/bulk-status`, input)
      return data.updated as number
    },
    /**
     * **„რა ვნახო დღეს" — შემთხვევითი ჩანაწერი ფილტრის ფარგლებში (FEAT-20).**
     *
     * ⚠️ **იგივე `filters` მიდის, რაც სიას**: არჩევანი ზუსტად იმ სიიდან
     * უნდა მოდიოდეს, რომელსაც ეკრანზე ხედავ.
     * ⚠️ **`null` ნორმალური პასუხია** — „ფილტრში არაფერია" და არა შეცდომა.
     */
    /**
     * „რა ვნახო დღეს" — **N შემთხვევითი ჩანაწერი** (Tasks §17.5). ⚠️ `all`
     * განზრახ ვარდება: არჩევა სერვერზე ხდება, ე.ი. მთელი სიის ჩამოტვირთვას
     * აზრი არ აქვს. `status` — დიალოგის ჩიპები (სიის `?view=`-ზე მაღლა დგას),
     * `exclude` — უკვე ნაჩვენებები (§6.5), რომ „სხვა" იგივეს არ დააბრუნებდეს.
     */
    pickRandom: async (filters: MediaFilters = {}, opts: PickOptions = {}): Promise<Movie[]> => {
      const { all: _all, status: _status, ...rest } = filters
      const { data } = await api.get(base, { params: { ...rest, ...pickParams(opts) } })
      return data.data ?? []
    },
    /**
     * TMDB id-ით პირდაპირ დამატება (ქმნის + ამდიდრებს). Tasks §18.3 — `status` და
     * `is_favorite` არჩევითია (ფრანჩაიზის პოპაპი ახალ ნაწილს ასე ამატებს).
     */
    addFromTmdb: async (tmdbId: number, extra: AddFromTmdbOptions = {}): Promise<Movie> => {
      const { data } = await api.post(`${base}/from-tmdb`, {
        tmdb_id: tmdbId,
        ...(extra.status ? { status: extra.status } : {}),
        ...(extra.favorite !== undefined ? { is_favorite: extra.favorite } : {}),
      })
      return data.data
    },
  }
}

export type MediaApi = ReturnType<typeof createMediaApi>

export const moviesApi = createMediaApi(MEDIA.movie.apiBase)
export const seriesApi = createMediaApi(MEDIA.series.apiBase)
export const animeApi = createMediaApi(MEDIA.anime.apiBase)

/**
 * ⚠️ **რუკა და არა ტერნარი** (§7.1): `type === 'series' ? … : …` მესამე
 * დომენს ჩუმად ფილმების endpoint-ზე გაუშვებდა.
 */
const MEDIA_APIS: Record<MediaType, MediaApi> = {
  movie: moviesApi,
  series: seriesApi,
  anime: animeApi,
}

export function mediaApi(type: MediaType): MediaApi {
  return MEDIA_APIS[type] ?? moviesApi
}

/* ---------- მასობრივი სინქრონი TMDB-დან — სათითაოდ (Tasks J2/J3/J4) ---------- */

export interface SyncPlanFilters {
  /** დომენები; ცარიელი = ორივე */
  types?: MediaType[]
  status?: string
  favorite?: boolean
  /** ჟანრების slug-ები */
  genres?: string[]
  /** კონკრეტული ჩანაწერები დომენების მიხედვით */
  ids?: Partial<Record<MediaType, number[]>>
  /** მხოლოდ ისინი, ვისაც პოსტერი ან მსახიობის ფოტო აკლია */
  missing_media_only?: boolean
  /** Tasks §31.2 — წარმატებით განახლებული/უცვლელი აღარ ჩანს; ცარიელი და ჩავარდნილი რჩება */
  hide_processed?: boolean
}

export interface SyncPlanItem {
  type: MediaType
  id: number
  title: string
  year: number | null
}

export interface SyncPlan {
  items: SyncPlanItem[]
  count: number
  eta_seconds: number
  /** tmdb_id-ის გარეშე ჩანაწერები — მათი სინქრონი შეუძლებელია */
  skipped_without_tmdb: number
  /** Tasks §30.6 — ჩემი TMDB-ის გასაღები მაქვს? (`false` — გაშვება ვერ დაიწყება) */
  tmdb: boolean
  /** Tasks §31 — რამდენი დაიმალა „დამუშავებულების დამალვით" და რამდენია შეჩერებული */
  skipped_processed: number
  skipped_paused: number
}

/** ფილტრები → დასამუშავებელი რიგი (გაშვებამდე ჩვენებისთვის) */
export async function fetchSyncPlan(filters: SyncPlanFilters): Promise<SyncPlan> {
  const { data } = await api.post('/media/sync/plan', filters)
  return data
}

export type SyncField =
  | 'title'
  | 'description'
  | 'year'
  | 'rating'
  | 'genres'
  | 'cast'
  | 'details'
  /** ოფიციალური ტრეილერი TMDB-დან (Tasks 9) — ცალკე რექვესთია, ამიტომ არჩევადი */
  | 'trailer'

export const SYNC_FIELDS: SyncField[] = [
  'title',
  'description',
  'year',
  'rating',
  'genres',
  'cast',
  'details',
  'trailer',
]

export interface SyncOptions {
  /** პოსტერი + მსახიობთა ფოტოები */
  media?: boolean
  /** მედია მხოლოდ მაშინ, თუ ფაილი აკლია */
  only_missing?: boolean
  /** false (default) — მხოლოდ ცარიელი ველები; true — TMDB-ს მონაცემი ჩაანაცვლებს */
  overwrite?: boolean
  fields?: SyncField[]
}

export interface SyncItemResult {
  ok: boolean
  skipped: boolean
  changed: string[]
  /** Tasks §31.4 — ოთხი შედეგი ცალკე; გამოტოვებაზე `null` */
  result: SyncOutcome | null
  error: string | null
  title: string
}

/** ერთი ჩანაწერის სინქრონი — მოკლე რექვესთი, გაუქმებადი `signal`-ით */
export async function syncItem(
  type: MediaType,
  id: number,
  opts: SyncOptions,
  signal?: AbortSignal,
): Promise<SyncItemResult> {
  const { data } = await api.post(`/media/sync/${type}/${id}`, opts, { signal })
  return data
}

/** Tasks §31.3 — „აღარ განაახლო" ჩანაწერზე: გეგმები და რიგი მას გამოტოვებენ */
export async function setSyncPaused(type: MediaType, id: number, paused: boolean): Promise<{ ok: boolean; sync_paused: boolean }> {
  const { data } = await api.patch(`/media/sync/${type}/${id}/pause`, { paused })
  return data
}

/** Tasks §31.3 — იგივე მსახიობზე; **ჩემი** პარამეტრია (მსახიობი გლობალურია) */
export async function setActorSyncPaused(id: number, paused: boolean): Promise<{ ok: boolean; paused: boolean }> {
  const { data } = await api.patch(`/cast/sync/${id}/pause`, { paused })
  return data
}

/* ---------- ჟანრები (გაზიარებული) ---------- */

/** ჟანრები — ორივე რაოდენობით; `type` მხოლოდ დალაგებაზე მოქმედებს */
export async function fetchGenres(type?: MediaType): Promise<Genre[]> {
  const { data } = await api.get('/genres', { params: type ? { type } : undefined })
  return data.data
}

export interface GenrePayload {
  name_ka?: string
  name_en?: string
}

export async function createGenre(payload: GenrePayload): Promise<Genre> {
  const { data } = await api.post('/genres', payload)
  return data.data
}

export async function updateGenre(id: number, payload: GenrePayload): Promise<Genre> {
  const { data } = await api.patch(`/genres/${id}`, payload)
  return data.data
}

/* ---------- ჟანრზე მიბმული ჩანაწერები (Tasks C1/C2) ---------- */

export interface GenreItems {
  movies: MovieListItem[]
  series: MovieListItem[]
  animes: MovieListItem[]
  movies_count: number
  series_count: number
  animes_count: number
}

/**
 * დომენი → პასუხის bucket.
 * ⚠️ backend-ის `GenreItemController::BUCKETS`-ის სარკეა; `series` მხოლობითი
 * რჩება, ანიმე კი `animes`-ია (რელაციის სახელი).
 */
export const GENRE_ITEM_BUCKET = {
  movie: 'movies',
  series: 'series',
  anime: 'animes',
} as const satisfies Record<MediaType, keyof GenreItems>

/** ჟანრზე მიბმული ჩანაწერები — ყველა მედია-დომენი ერთ პასუხში */
export async function fetchGenreItems(id: number): Promise<GenreItems> {
  const { data } = await api.get(`/genres/${id}/items`)
  return data
}

export type GenreItemAction = 'attach' | 'detach' | 'move' | 'replace'

export interface GenreItemsInput {
  type: MediaType
  action: GenreItemAction
  /** კონკრეტული ჩანაწერები; `all`-თან ერთად არ არის საჭირო */
  ids?: number[]
  /** attach → ბიბლიოთეკის ყველა ჩანაწერი; დანარჩენზე → ჟანრზე მიბმული ყველა */
  all?: boolean
  /** move/replace-ისთვის სავალდებულო */
  target_genre_id?: number
}

/** ჟანრის მიბმა/ჩახსნა/გადატანა/ჩანაცვლება — აბრუნებს შეხებული ჩანაწერების რაოდენობას */
export async function updateGenreItems(
  id: number,
  input: GenreItemsInput,
): Promise<{ affected: number; genre: Genre }> {
  const { data } = await api.post(`/genres/${id}/items`, input)
  return data
}

/**
 * წაშლა — reassign_to (გადაბმა სხვა ჟანრზე) ან force (უჟანროდ დატოვება).
 *
 * ჟანრი **გლობალურია**: ჩვეულებრივი მომხმარებლის წაშლა პირდაპირ არ სრულდება —
 * backend აბრუნებს 202-ს და მოთხოვნა ადმინთან მიდის (I7). super_admin-ზე — 204.
 */
export async function deleteGenre(
  id: number,
  opts?: { reassign_to?: number; force?: boolean },
): Promise<{ approvalRequired: boolean }> {
  const res = await api.delete(`/genres/${id}`, { data: opts })
  return { approvalRequired: res.status === 202 }
}

/* ---------- Lookup (type-ით: movie|series) ---------- */

export interface LookupDraft {
  tmdb_id: number
  imdb_id: string | null
  title_en: string | null
  title_ka: string | null
  year: number | null
  rating: number | null
  runtime?: number | null
  seasons?: number | null
  episodes?: number | null
  description_en: string | null
  description_ka: string | null
  genres: string[]
  poster: string | null
  cast: { name: string; character: string; photo: string | null }[]
}

export interface LookupInput {
  tmdb_id?: number
  url?: string
  imdb?: string
  query?: string
  year?: number
}

export interface Candidate {
  tmdb_id: number
  title_en: string
  year: number | null
  rating: number | null
  poster: string | null
}

/** ლინკი/IMDb/სახელი → კანდიდატების სია (ასარჩევად) */
export async function lookupCandidates(input: LookupInput, type: MediaType = 'movie'): Promise<Candidate[]> {
  const { data } = await api.post('/lookup/candidates', { ...input, type })
  return data.data
}

/** კონკრეტული ერთეულის სრული დრაფტი (tmdb_id ან ლინკი/სახელი) */
export async function lookupDraft(input: LookupInput, type: MediaType = 'movie'): Promise<LookupDraft> {
  const { data } = await api.post('/lookup', { ...input, type })
  return data.data
}

/* ---------- Discover (type-ით) ---------- */

export interface GenreName {
  name_en: string
  name_ka: string | null
}

export interface DiscoverItem {
  tmdb_id: number
  title: string
  title_ka?: string | null
  year: number | null
  rating: number | null
  poster: string | null
  overview?: string | null
  genres?: GenreName[]
  owned: boolean
  movie_id: number | null
}

export interface DiscoverResponse {
  page: number
  total_pages: number
  results: DiscoverItem[]
}

export interface DiscoverFilters {
  query?: string
  genre?: string
  year_min?: number
  year_max?: number
  rating_min?: number
  rating_max?: number
  sort?: string
  page?: number
  refresh?: boolean
  /** რამდენ TMDB გვერდამდე მივყვეთ (E3); TMDB-ის ლიმიტი 500 */
  max_pages?: number
  /** ჩანაწერი გვერდზე — TMDB-ის 20-ის ჯერადი (E3) */
  per_page?: number
}

/** TMDB discover — ფილტრებით აღმოჩენა (movie ან series) */
export async function discover(filters: DiscoverFilters, type: MediaType = 'movie'): Promise<DiscoverResponse> {
  // boolean query-პარამეტრი 1/0-ად — axios `true`-ს "true"-დ სერიალიზაციას უკეთებს,
  // რასაც Laravel-ის `boolean` წესი არ იღებს
  const { refresh, ...rest } = filters
  const params = { ...rest, type, ...(refresh ? { refresh: 1 } : {}) }
  const { data } = await api.get('/discover', { params })
  return data
}

/* ---------- ფრანჩაიზი (მხოლოდ ფილმებს) ---------- */

export interface CollectionPart {
  tmdb_id: number
  title: string
  year: number | null
  rating: number | null
  poster: string | null
  /** Tasks §18.3 — TMDB-ის აღწერა პოპაპის ორხაზიანი ხაზისთვის */
  overview: string | null
  owned: boolean
  movie_id: number | null
}

export interface MovieCollection {
  name: string | null
  parts: CollectionPart[]
}

export async function fetchMovieCollection(id: number | string): Promise<MovieCollection> {
  const { data } = await api.get(`/movies/${id}/collection`)
  return data
}

/* ---------- მსახიობი (ფილმები + სერიალები) ---------- */

export interface Actor {
  id: number
  name: string
  name_ka: string | null
  photo: string | null
  /**
   * §7.5 — საძიებო ტეგები ვებიდან ფოტოს მოსატანად.
   * ⚠️ **ესენი ჩემია და არა გლობალური:** `cast_members` საერთო ლექსიკონია
   * (ერთი მსახიობი ყველა ანგარიშზე ერთი რიგია), ტეგები კი ცალკე ცხრილშია,
   * მომხმარებელზე მიბმული.
   */
  tags: string[]

  /* §8.1 — პიროვნების მონაცემები TMDB-დან. ⚠️ ეს **ფაქტებია** და ამიტომ
     გლობალურ ლექსიკონში ზის (სახელისა და სქესის რიგში); ჩემი მხოლოდ
     ტეგები და ფოტოებია. */
  gender?: number | null
  has_tmdb?: boolean
  tmdb_person_id?: number | null
  imdb_id?: string | null
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  biography?: string | null
  known_for?: string | null
  popularity?: number | null
  homepage?: string | null
  /** instagram_id · twitter_id · facebook_id · tiktok_id · youtube_id · wikidata_id */
  profile_links?: Record<string, string> | null
  details_synced_at?: string | null
}

export interface Suggestion {
  tmdb_id: number
  title: string
  title_ka?: string | null
  year: number | null
  rating: number | null
  poster: string | null
  overview?: string | null
  genres?: GenreName[]
  /** უკვე ჩემს კოლექციაშია — სიიდან არ ვშლით, ვნიშნავთ (იხ. Tasks B3) */
  owned: boolean
  /** ლოკალური ჩანაწერის id, თუ owned */
  movie_id: number | null
}

export interface ActorPageData {
  actor: Actor
  movies: MovieListItem[]
  series: MovieListItem[]
  /** §7.1 — მესამე მედია-დომენი; ცალკე შემოთავაზება მას განზრახ არ აქვს */
  animes: MovieListItem[]
  suggestions: Suggestion[]
  series_suggestions: Suggestion[]
}

/** მსახიობის გვერდი — ფილმები + სერიალები + ანიმეები (კოლექცია + TMDB შემოთავაზება) */
export async function fetchActor(id: number | string): Promise<ActorPageData> {
  const { data } = await api.get(`/cast/${id}`)
  return data
}

/**
 * მსახიობის საძიებო ტეგები (§7.5) — მთელი ნაკრების ჩანაცვლება.
 * ⚠️ **`PUT`-ია და არა `POST`**: POST-ს ნებართვების middleware `create`-ად
 * კითხულობს, ე.ი. update-ის უფლებით მომხმარებელი 403-ს მიიღებდა.
 */
export async function updateActorTags(id: number | string, tags: string[]): Promise<string[]> {
  const { data } = await api.put<{ tags: string[] }>(`/cast/${id}/tags`, { tags })
  return data.tags
}

/**
 * **მსახიობის მონაცემების განახლება TMDB-დან (§8.1)** — ბიოგრაფია,
 * დაბადების თარიღი, IMDb-ის id, ოფიციალური ბმულები.
 *
 * ⚠️ **ცხადი ღილაკია და არა ავტომატური შევსება ყოველ გახსნაზე**: TMDB-ის
 * ლიმიტი საერთოა, მსახიობის გვერდი კი ხშირად იხსნება.
 *
 * ⚠️ **`resync` და არა `sync`** — `EnsureModulePermission::UPDATE_ENDPOINTS`
 * სწორედ ამ სიტყვას იცნობს (არსებული ხაფანგი: POST-იდან `create` გამოდის).
 */
export async function resyncActor(id: number | string): Promise<{ updated: boolean; actor: Actor }> {
  const { data } = await api.post(`/cast/${id}/resync`)
  return data
}

/* ---------- მსახიობების მასობრივი სინქრონიზაცია (Tasks §39) ---------- */

/**
 * ფარგლები. ⚠️ `never` ნაგულისხმევია (TMDB-ის ბიუჯეტი საერთოა); `stale`
 * „არასდროს განახლებულსაც" მოიცავს — ნიშნის არქონა „უსასრულოდ ძველია".
 * ⚠️ სია `CastSyncController::SCOPES`-ის სარკეა.
 */
export const CAST_SYNC_SCOPES = ['never', 'stale', 'all', 'ids'] as const
export type CastSyncScope = (typeof CAST_SYNC_SCOPES)[number]

/** რა განახლდეს — `CastEnricher::FIELDS`-ის სარკე */
export const CAST_SYNC_FIELDS = ['details', 'biography', 'links', 'photo'] as const
export type CastSyncField = (typeof CAST_SYNC_FIELDS)[number]

/**
 * ერთი ნაბიჯის შედეგი — `CastEnricher`-ის კოდები.
 * ⚠️ `unchanged`/`tmdb_empty`/`no_tmdb_id` გამოტოვებაა და **არა** ჩავარდნა.
 */
export type CastSyncResult = 'updated' | 'unchanged' | 'tmdb_empty' | 'no_tmdb_id' | 'failed'

export interface CastSyncOptions {
  fields: CastSyncField[]
  /** ფოტო ხელახლა ჩამოვიდეს მაშინაც, თუ უკვე აქვს */
  overwrite_photo?: boolean
}

export interface CastSyncFilters extends Partial<CastSyncOptions> {
  types?: MediaType[]
  scope?: CastSyncScope
  /** `stale` — „N დღეზე ადრე" */
  days?: number
  /** `ids` — კონკრეტული მსახიობები */
  ids?: number[]
  /** ამრჩევში ძებნა */
  q?: string
  /** ⚠️ გაშვება: იგივე გეგმა + ჟურნალის **ერთი** რიგი (და არა გადახედვა) */
  start?: boolean
}

export interface CastSyncPlanItem {
  type: 'actor'
  id: number
  title: string
}

export interface CastSyncCandidate {
  id: number
  name: string
  name_ka: string | null
  has_tmdb: boolean
  details_synced_at: string | null
}

export interface CastSyncPlan {
  /** Tasks §31.3 — რამდენი მსახიობია შეჩერებული ამ ფარგლებში */
  skipped_paused?: number
  types: MediaType[]
  items: CastSyncPlanItem[]
  count: number
  eta_seconds: number
  skipped_without_tmdb: number
  /** ფარგლების გარეშე — რამდენი მსახიობია ბიბლიოთეკაში სულ */
  pool_total: number
  never_synced: number
  /** `ids`-ის ამრჩევი (სხვა ფარგლებზე ცარიელია) */
  cast: CastSyncCandidate[]
  cast_truncated: boolean
  /** TMDB-ის გასაღები მითითებულია? */
  tmdb: boolean
}

/** ფარგლები → რიგი. ⚠️ `start: true` ჟურნალს წერს — მხოლოდ გაშვების ღილაკზე */
export async function fetchCastSyncPlan(filters: CastSyncFilters): Promise<CastSyncPlan> {
  const { data } = await api.post('/cast/sync/plan', filters)
  return data
}

export interface CastSyncItemResult {
  ok: boolean
  skipped: boolean
  result: CastSyncResult
  error: string | null
  title: string
}

/** რიგის ერთი ნაბიჯი — ერთი მსახიობი (`POST /cast/sync/{id}`) */
export async function syncActor(
  id: number,
  opts: CastSyncOptions,
  signal?: AbortSignal,
): Promise<CastSyncItemResult> {
  const { data } = await api.post(`/cast/sync/${id}`, opts, { signal })
  return data
}
