import { api } from '@/lib/api'
import { MEDIA, type MediaType } from '@/lib/media'
import type { Genre, Movie, MovieListItem, Status } from './types'

/* ============================================================
   Generic მედია-API — movie/series ერთი factory-ით.
   საერთო რესურსები (genres, lookup, discover, actor) type-პარამეტრით.
   ============================================================ */

export interface MediaFilters {
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
}

export interface BulkStatusInput {
  status: Status
  ids?: number[]
  from_status?: Status
}

/** დომენზე მიბმული CRUD/სტატუსი/რჩეული/სინქრონი */
export function createMediaApi(base: string) {
  return {
    list: async (filters: MediaFilters = {}): Promise<MovieListItem[]> => {
      const { data } = await api.get(base, { params: filters })
      return data.data
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
    setStatus: async (id: number, status: Status): Promise<Movie> => {
      const { data } = await api.patch(`${base}/${id}/status`, { status })
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
    /** TMDB id-ით პირდაპირ დამატება (ქმნის + ამდიდრებს) */
    addFromTmdb: async (tmdbId: number): Promise<Movie> => {
      const { data } = await api.post(`${base}/from-tmdb`, { tmdb_id: tmdbId })
      return data.data
    },
  }
}

export type MediaApi = ReturnType<typeof createMediaApi>

export const moviesApi = createMediaApi(MEDIA.movie.apiBase)
export const seriesApi = createMediaApi(MEDIA.series.apiBase)

export function mediaApi(type: MediaType): MediaApi {
  return type === 'series' ? seriesApi : moviesApi
}

/* ---------- მედიის ხელახლა ჩამოტვირთვა TMDB-დან ---------- */

export interface RedownloadResult {
  movies: { ok: number; failed: number }
  series: { ok: number; failed: number }
}

/**
 * ყველა (ან type-ით გაფილტრული) ჩანაწერის პოსტერი + მსახიობთა ფოტოები TMDB-დან
 * ხელახლა ჩამოტვირთვა — ახალ მანქანაზე, სადაც storage/ ცარიელია.
 * timeout: 0 — ბევრ ჩანაწერზე დიდხანს გრძელდება.
 */
export async function redownloadMedia(type?: MediaType): Promise<RedownloadResult> {
  const { data } = await api.post('/media/redownload', type ? { type } : {}, { timeout: 0 })
  return data.result as RedownloadResult
}

/* ---------- ჟანრები (გაზიარებული) ---------- */

export async function fetchGenres(): Promise<Genre[]> {
  const { data } = await api.get('/genres')
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

/** წაშლა — reassign_to (გადაბმა სხვა ჟანრზე) ან force (უჟანროდ დატოვება) */
export async function deleteGenre(
  id: number,
  opts?: { reassign_to?: number; force?: boolean },
): Promise<void> {
  await api.delete(`/genres/${id}`, { data: opts })
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
}

/** TMDB discover — ფილტრებით აღმოჩენა (movie ან series) */
export async function discover(filters: DiscoverFilters, type: MediaType = 'movie'): Promise<DiscoverResponse> {
  const { data } = await api.get('/discover', { params: { ...filters, type } })
  return data
}

/* ---------- ფრანჩაიზი (მხოლოდ ფილმებს) ---------- */

export interface CollectionPart {
  tmdb_id: number
  title: string
  year: number | null
  rating: number | null
  poster: string | null
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
}

export interface ActorPageData {
  actor: Actor
  movies: MovieListItem[]
  series: MovieListItem[]
  suggestions: Suggestion[]
  series_suggestions: Suggestion[]
}

/** მსახიობის გვერდი — ფილმოგრაფია + სერიალოგრაფია (კოლექცია + TMDB შემოთავაზება) */
export async function fetchActor(id: number | string): Promise<ActorPageData> {
  const { data } = await api.get(`/cast/${id}`)
  return data
}
