import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'

/* ============================================================
   თამაშების მოდული (`game`, Tasks §11; ველების სია დამტკიცდა 19.1-ში).

   ⚠️ ჟანრი **მრავალია** (`genre_ids`) და არა ერთი `genre_id`, როგორც წიგნზე/
   ბორდგეიმზე — 11.1 „ჟანრებს" მრავლობითში წერს და თამაში მართლაც
   ერთდროულად Action + RPG + Adventure-ია.

   ⚠️ `year` **სერვერზე გამოთვლილია** `release_date`-იდან (აქსესორი) — ე.ი.
   read-only ველია და ფორმაში არ იგზავნება.
   ============================================================ */

/** „ჩემი ქულის" ჭერი — იგივე რიცხვი `Game::MAX_RATING`-შია */
export const GAME_MAX_RATING = 10

/** გადასაწყვეტი · სათამაშო · ვთამაშობ · გავიარე · მივატოვე */
export const GAME_STATUSES = ['undecided', 'to_play', 'playing', 'finished', 'abandoned'] as const
export type GameStatus = (typeof GAME_STATUSES)[number]

export const GAME_PLATFORMS = ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile'] as const
export type GamePlatform = (typeof GAME_PLATFORMS)[number]

export const GAME_MODES = ['single', 'multiplayer', 'coop_local', 'coop_online', 'pvp'] as const
export type GameMode = (typeof GAME_MODES)[number]

export const GAME_LINK_KINDS = ['official', 'steam', 'epic', 'gog', 'psn', 'xbox', 'other'] as const
export type GameLinkKind = (typeof GAME_LINK_KINDS)[number]

export interface GameLink {
  label?: string | null
  url: string
  kind?: GameLinkKind
}

export interface GameDlc {
  name: string
  note?: string | null
}

export interface GameLanguages {
  interface?: string[]
  audio?: string[]
  subtitles?: string[]
}

export interface Game {
  id: number
  title_ka: string | null
  title_en: string | null
  description_ka: string | null
  description_en: string | null
  release_date: string | null
  /** read-only — `release_date`-იდან */
  year: number | null
  developer: string | null
  publisher: string | null
  franchise: string | null
  platforms: GamePlatform[]
  my_platform: GamePlatform | null
  modes: GameMode[]
  genres?: GameGenre[]
  genre_ids?: number[]
  hltb_main: number | null
  hltb_main_extra: number | null
  hltb_complete: number | null
  metacritic: number | null
  opencritic: number | null
  /** RAWG-ის შკალა 0–5 (და არა 0–100) */
  users_score: number | null
  rating: number | null
  /** storage-ის გზა ან გარე URL */
  cover: string | null
  cover_source: 'upload' | 'rawg' | null
  links: GameLink[]
  status: GameStatus
  is_favorite: boolean
  age_rating: string | null
  languages: GameLanguages
  size_gb: number | null
  dlcs: GameDlc[]
  rawg_id: number | null
  rawg_slug: string | null
  igdb_id: number | null
  igdb_slug: string | null
  visibility: 'private' | 'public'
  videos?: GameVideo[]
  videos_count?: number
  files_count?: number
  images_count?: number
  notes_count?: number
  gallery_count?: number
  created_at: string | null
}

export interface GameFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** ჟანრები — მძიმით გამოყოფილი id-ები (AND) */
  genre_id?: string
  /** პლატფორმები — მძიმით გამოყოფილი key-ები (AND) */
  platform?: string
  /** რეჟიმები — მძიმით გამოყოფილი key-ები (AND) */
  mode?: string
  /** ფრენჩაიზი — **ზუსტი** სახელი (§5.1-ის მოდალი) */
  franchise?: string
  sort?: string
}

export interface GameInput {
  title_ka?: string | null
  title_en?: string | null
  description_ka?: string | null
  description_en?: string | null
  release_date?: string | null
  developer?: string | null
  publisher?: string | null
  franchise?: string | null
  platforms?: GamePlatform[]
  my_platform?: GamePlatform | null
  modes?: GameMode[]
  genre_ids?: number[]
  hltb_main?: number | null
  hltb_main_extra?: number | null
  hltb_complete?: number | null
  metacritic?: number | null
  opencritic?: number | null
  users_score?: number | null
  rating?: number | null
  links?: GameLink[]
  status?: GameStatus
  age_rating?: string | null
  languages?: GameLanguages
  size_gb?: number | null
  dlcs?: GameDlc[]
  rawg_id?: number | null
  rawg_slug?: string | null
  igdb_id?: number | null
  igdb_slug?: string | null
  visibility?: 'private' | 'public'
  /** RAWG-ის ყდის URL — შენახვისას ჩამოიტვირთება (კვოტაში არ ითვლება) */
  rawg_cover_url?: string | null
  cover_url?: string | null
  /** ატვირთული ყდა; მითითების შემთხვევაში multipart-ად იგზავნება */
  cover?: File | null
  remove_cover?: boolean
}

function toFormData(input: GameInput): FormData {
  const fd = new FormData()

  const text: (keyof GameInput)[] = [
    'title_ka', 'title_en', 'description_ka', 'description_en',
    'release_date', 'developer', 'publisher', 'franchise', 'age_rating',
    'rawg_slug', 'igdb_slug', 'cover_url',
  ]
  text.forEach((key) => {
    const value = input[key]
    if (value !== undefined) fd.append(key, (value as string | null) ?? '')
  })

  const numbers: (keyof GameInput)[] = [
    'hltb_main', 'hltb_main_extra', 'hltb_complete',
    'metacritic', 'opencritic', 'users_score', 'rating', 'size_gb', 'rawg_id', 'igdb_id',
  ]
  numbers.forEach((key) => {
    const value = input[key]
    if (value != null) fd.append(key, String(value))
  })

  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  if (input.my_platform) fd.append('my_platform', input.my_platform)
  ;(input.platforms ?? []).forEach((p) => fd.append('platforms[]', p))
  ;(input.modes ?? []).forEach((m) => fd.append('modes[]', m))
  // ⚠️ ცარიელ მასივსაც ვგზავნით (`genre_ids` გასაღებით), თორემ ყველა ჟანრის
  // მოხსნა backend-ზე „ველი არ მოვიდა"-დ იკითხებოდა და ძველი რჩებოდა
  if (input.genre_ids) {
    if (input.genre_ids.length === 0) fd.append('genre_ids', '')
    input.genre_ids.forEach((id) => fd.append('genre_ids[]', String(id)))
  }
  ;(input.links ?? []).forEach((link, i) => {
    fd.append(`links[${i}][url]`, link.url)
    fd.append(`links[${i}][label]`, link.label ?? '')
    fd.append(`links[${i}][kind]`, link.kind ?? 'other')
  })
  ;(input.dlcs ?? []).forEach((dlc, i) => {
    fd.append(`dlcs[${i}][name]`, dlc.name)
    if (dlc.note) fd.append(`dlcs[${i}][note]`, dlc.note)
  })
  ;(['interface', 'audio', 'subtitles'] as const).forEach((key) => {
    (input.languages?.[key] ?? []).forEach((lang) => fd.append(`languages[${key}][]`, lang))
  })

  if (input.rawg_cover_url) fd.append('rawg_cover_url', input.rawg_cover_url)
  if (input.cover) fd.append('cover', input.cover)
  if (input.remove_cover) fd.append('remove_cover', '1')

  return fd
}

export async function fetchGames(filters: GameFilters = {}): Promise<Page<Game>> {
  const { favorite, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/games', { params })
  return readPage<Game>(data)
}

export async function fetchGame(id: number): Promise<Game> {
  const { data } = await api.get(`/games/${id}`)
  return data.data
}

export async function createGame(input: GameInput): Promise<Game> {
  const { data } = await api.post('/games', toFormData(input))
  return data.data
}

export async function updateGame(id: number, input: GameInput): Promise<Game> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/games/${id}`, fd)
  return data.data
}

/* ---------- ფრენჩაიზები (§5.1) ---------- */

export interface GameFranchise {
  name: string
  games_count: number
}

/**
 * ბიბლიოთეკაში არსებული ფრენჩაიზები.
 * ⚠️ ლექსიკონის ცხრილი არ არსებობს — სია თვითონ `games.franchise`-იდან
 * იკრიბება, ე.ი. ახალი სახელი პირველივე შენახვისთანავე ჩნდება.
 */
export async function fetchGameFranchises(): Promise<GameFranchise[]> {
  const { data } = await api.get('/games/franchises')
  return data.data
}

export async function deleteGame(id: number): Promise<void> {
  await api.delete(`/games/${id}`)
}

export async function toggleGameFavorite(id: number): Promise<Game> {
  const { data } = await api.patch(`/games/${id}/favorite`)
  return data.data
}

export async function setGameStatus(id: number, status: GameStatus): Promise<Game> {
  const { data } = await api.patch(`/games/${id}/status`, { status })
  return data.data
}

/* ---------- RAWG (§11.4-ის enrichment) ---------- */

export interface RawgScreenshot {
  url: string
  width: number | null
  height: number | null
}

export interface RawgCandidate {
  /**
   * საიდან მოვიდა რიგი. ⚠️ `undefined` = RAWG (ძველი პასუხების თავსებადობა);
   * `'igdb'` კი სათადარიგო წყაროა (`DECISIONS.md` §7).
   */
  source?: 'rawg' | 'igdb'
  rawg_id: number | null
  rawg_slug: string | null
  igdb_id?: number | null
  igdb_slug?: string | null
  title_en: string | null
  description_en?: string | null
  release_date: string | null
  cover_url: string | null
  metacritic: number | null
  users_score: number | null
  platforms: GamePlatform[]
  /** RAWG-ის ჟანრების **სახელები** — ჩვენს ლექსიკონს სახელით ვუთავსებთ */
  genres: string[]
  developer?: string | null
  publisher?: string | null
  age_rating?: string | null
  links?: GameLink[]
  screenshots?: RawgScreenshot[]
}

/**
 * ⚠️ **503 `rawg_unavailable` ცალკე მდგომარეობაა.** კლავიშის გარეშე (ან
 * RAWG-ის ჩავარდნაზე) ცარიელი სია ცრუდ ნიშნავდა „ასეთი თამაში არ არსებობს".
 */
export async function fetchRawgCandidates(query: string): Promise<RawgCandidate[]> {
  const { data } = await api.post('/games/lookup/candidates', { query })
  return data.results
}

/**
 * არჩეულის სრული დრაფტი. ⚠️ **წყარო კანდიდატიდან მოდის** — IGDB-ის რიგს
 * `rawg_id` არ აქვს, ე.ი. მისი გაგზავნა 422-ს მოგვცემდა.
 */
export async function fetchRawgDraft(candidate: RawgCandidate): Promise<RawgCandidate> {
  const body =
    candidate.source === 'igdb'
      ? { igdb_id: candidate.igdb_id }
      : { rawg_id: candidate.rawg_id }

  const { data } = await api.post('/games/lookup', body)
  return data.draft
}

/* ---------- ვიდეოები (§11.2) ---------- */

export const GAME_VIDEO_KINDS = ['walkthrough', 'trailer', 'review', 'guide', 'other'] as const
export type GameVideoKind = (typeof GAME_VIDEO_KINDS)[number]

export interface GameVideo {
  id: number
  kind: GameVideoKind
  title: string | null
  url: string
  platform: string
  /** სერვერზე აგებული — ნედლი HTML არასდროს მოდის */
  embed_url: string | null
  thumbnail_url: string | null
  duration: number | null
  sort_order: number
}

export async function fetchGameVideos(gameId: number): Promise<GameVideo[]> {
  const { data } = await api.get(`/games/${gameId}/videos`)
  return data.data
}

export async function createGameVideo(
  gameId: number,
  input: { url: string; kind?: GameVideoKind; title?: string | null },
): Promise<GameVideo> {
  const { data } = await api.post(`/games/${gameId}/videos`, input)
  return data.data
}

export async function updateGameVideo(
  id: number,
  input: { url?: string; kind?: GameVideoKind; title?: string | null },
): Promise<GameVideo> {
  const { data } = await api.patch(`/game-videos/${id}`, input)
  return data.data
}

export async function deleteGameVideo(id: number): Promise<void> {
  await api.delete(`/game-videos/${id}`)
}

/* ---------- ფაილები: სქრინშოტები და დოკუმენტები ---------- */

export interface GameFile {
  id: number
  kind: 'image' | 'doc'
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export async function fetchGameFiles(gameId: number, kind?: GameFile['kind']): Promise<GameFile[]> {
  const { data } = await api.get(`/games/${gameId}/files`, { params: kind ? { kind } : {} })
  return data.data
}

export async function uploadGameFiles(
  gameId: number,
  kind: GameFile['kind'],
  files: File[],
): Promise<GameFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/games/${gameId}/files`, fd)
  return data.data
}

export async function deleteGameFile(id: number): Promise<void> {
  await api.delete(`/game-files/${id}`)
}

/* ---------- ჩანიშვნები ---------- */

export interface GameNote {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchGameNotes(gameId: number): Promise<GameNote[]> {
  const { data } = await api.get(`/games/${gameId}/notes`)
  return data.data
}

export async function createGameNote(gameId: number, body: string): Promise<GameNote> {
  const { data } = await api.post(`/games/${gameId}/notes`, { body })
  return data.data
}

export async function deleteGameNote(id: number): Promise<void> {
  await api.delete(`/game-notes/${id}`)
}

/* ---------- ჟანრები — per-user ლექსიკონი ---------- */

export interface GameGenre {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  games_count?: number
}

export interface GameGenreInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchGameGenres(): Promise<GameGenre[]> {
  const { data } = await api.get('/game-genres')
  return data.data
}

export async function createGameGenre(input: GameGenreInput): Promise<GameGenre> {
  const { data } = await api.post('/game-genres', input)
  return data.data
}

export async function updateGameGenre(id: number, input: GameGenreInput): Promise<GameGenre> {
  const { data } = await api.patch(`/game-genres/${id}`, input)
  return data.data
}

/**
 * წაშლა; `moveTo` — რომელ ჟანრზე გადავიდნენ ეს თამაშები.
 * ⚠️ pivot-ზე „გადატანა" **მიმატებაა** — თამაშის დანარჩენი ჟანრები რჩება.
 */
export async function deleteGameGenre(id: number, moveTo?: number | null): Promise<number> {
  const { data } = await api.delete(`/game-genres/${id}`, { data: { move_to: moveTo ?? null } })
  return data.moved as number
}

export async function reorderGameGenres(ids: number[]): Promise<GameGenre[]> {
  const { data } = await api.post('/game-genres/reorder', { ids })
  return data.data
}
