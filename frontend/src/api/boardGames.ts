import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'

/* ============================================================
   ბორდგეიმების მოდული (`board_game`, Tasks §14).

   ⚠️ სათაური ერთენოვანია (`title`) — §14 ორ ენას არ ითხოვს და წყარო (BGG)
   ინგლისურია. იგივე გადაწყვეტილებაა, რაც ვიდეოსა და სიმღერაზე.
   ============================================================ */

/** „ჩემი ქულის" ჭერი — იგივე რიცხვი `BoardGame::MAX_RATING`-შია */
export const BOARD_GAME_MAX_RATING = 10

/** მაქვს · მინდა · ვთამაშობ · გავყიდე */
export const BOARD_GAME_STATUSES = ['owned', 'wanted', 'playing', 'sold'] as const
export type BoardGameStatus = (typeof BOARD_GAME_STATUSES)[number]

export interface BoardGameLink {
  label?: string | null
  url: string
  price?: number | null
  currency?: string | null
}

export interface BoardGame {
  id: number
  title: string
  description: string | null
  year: number | null
  designer: string | null
  publisher: string | null
  genre_id: number | null
  genre?: BoardGameGenre | null
  mechanics: string[]
  players_min: number | null
  players_max: number | null
  age_min: number | null
  playtime_min: number | null
  playtime_max: number | null
  complexity: number | null
  bgg_id: number | null
  bgg_rating: number | null
  bgg_url: string | null
  /** storage-ის გზა ან გარე URL */
  image: string | null
  image_source: 'upload' | 'bgg' | null
  status: BoardGameStatus
  rating: number | null
  is_favorite: boolean
  links: BoardGameLink[]
  visibility: 'private' | 'public'
  files_count?: number
  images_count?: number
  notes_count?: number
  created_at: string | null
}

export interface BoardGameFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** ჟანრები — მძიმით გამოყოფილი id-ები */
  genre_id?: string
  /** მექანიკები — მძიმით გამოყოფილი სია */
  mechanic?: string
  /** „რამდენი კაცით ვთამაშობთ" — დიაპაზონში მოხვედრა */
  players?: number
  sort?: string
}

export interface BoardGameInput {
  title?: string
  description?: string | null
  year?: number | null
  designer?: string | null
  publisher?: string | null
  genre_id?: number | null
  mechanics?: string[]
  players_min?: number | null
  players_max?: number | null
  age_min?: number | null
  playtime_min?: number | null
  playtime_max?: number | null
  complexity?: number | null
  bgg_id?: number | null
  bgg_rating?: number | null
  status?: BoardGameStatus
  rating?: number | null
  links?: BoardGameLink[]
  visibility?: 'private' | 'public'
  /** BGG-ის ფოტოს URL — შენახვისას ჩამოიტვირთება (კვოტაში არ ითვლება) */
  bgg_image_url?: string | null
  image_url?: string | null
  /** ატვირთული ფოტო; მითითების შემთხვევაში multipart-ად იგზავნება */
  image?: File | null
  remove_image?: boolean
}

function toFormData(input: BoardGameInput): FormData {
  const fd = new FormData()

  const text: (keyof BoardGameInput)[] = [
    'title', 'description', 'designer', 'publisher', 'image_url',
  ]
  text.forEach((key) => {
    const value = input[key]
    if (value !== undefined) fd.append(key, (value as string | null) ?? '')
  })

  const numbers: (keyof BoardGameInput)[] = [
    'year', 'genre_id', 'players_min', 'players_max', 'age_min',
    'playtime_min', 'playtime_max', 'complexity', 'bgg_id', 'bgg_rating', 'rating',
  ]
  numbers.forEach((key) => {
    const value = input[key]
    if (value != null) fd.append(key, String(value))
  })

  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  ;(input.mechanics ?? []).forEach((m) => fd.append('mechanics[]', m))
  ;(input.links ?? []).forEach((link, i) => {
    fd.append(`links[${i}][url]`, link.url)
    fd.append(`links[${i}][label]`, link.label ?? '')
    if (link.price != null) fd.append(`links[${i}][price]`, String(link.price))
    if (link.currency) fd.append(`links[${i}][currency]`, link.currency)
  })
  if (input.bgg_image_url) fd.append('bgg_image_url', input.bgg_image_url)
  if (input.image) fd.append('image', input.image)
  if (input.remove_image) fd.append('remove_image', '1')

  return fd
}

export async function fetchBoardGames(filters: BoardGameFilters = {}): Promise<Page<BoardGame>> {
  const { favorite, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/board-games', { params })
  return readPage<BoardGame>(data)
}

export async function fetchBoardGame(id: number): Promise<BoardGame> {
  const { data } = await api.get(`/board-games/${id}`)
  return data.data
}

export async function createBoardGame(input: BoardGameInput): Promise<BoardGame> {
  const { data } = await api.post('/board-games', toFormData(input))
  return data.data
}

export async function updateBoardGame(id: number, input: BoardGameInput): Promise<BoardGame> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/board-games/${id}`, fd)
  return data.data
}

export async function deleteBoardGame(id: number): Promise<void> {
  await api.delete(`/board-games/${id}`)
}

export async function toggleBoardGameFavorite(id: number): Promise<BoardGame> {
  const { data } = await api.patch(`/board-games/${id}/favorite`)
  return data.data
}

export async function setBoardGameStatus(id: number, status: BoardGameStatus): Promise<BoardGame> {
  const { data } = await api.patch(`/board-games/${id}/status`, { status })
  return data.data
}

/* ---------- BoardGameGeek (§14-ის enrichment) ---------- */

export interface BggCandidate {
  bgg_id: number
  title: string | null
  description: string | null
  year: number | null
  players_min: number | null
  players_max: number | null
  age_min: number | null
  playtime_min: number | null
  playtime_max: number | null
  complexity: number | null
  bgg_rating: number | null
  image_url: string | null
  genre: string | null
  mechanics: string[]
  designer: string | null
  publisher: string | null
}

/**
 * ⚠️ **503 `bgg_unavailable` ცალკე მდგომარეობაა.** BGG Cloudflare-ის
 * challenge-ის უკან დგას და სერვერიდან შეიძლება საერთოდ არ გაიხსნას —
 * ცარიელი სია მაშინ „ასეთი თამაში არ არსებობს"-ს ნიშნავდა ცრუდ.
 */
export async function fetchBggCandidates(query: string): Promise<BggCandidate[]> {
  const { data } = await api.post('/board-games/lookup/candidates', { query })
  return data.results
}

export async function fetchBggDraft(bggId: number): Promise<BggCandidate> {
  const { data } = await api.post('/board-games/lookup', { bgg_id: bggId })
  return data.draft
}

/* ---------- ქართული მაღაზიები (Tasks §7.2) ---------- */

/** მაღაზიის კოდი — backend-ის `GeorgianShops::SHOPS`-ის გასაღებები */
export const GE_SHOPS = ['corners', 'puzz'] as const
export type GeShop = (typeof GE_SHOPS)[number]

export interface ShopOffer {
  shop: GeShop | string
  shop_name: string
  title: string
  url: string
  image: string | null
  /** `null` = ფასი ვერ ამოვიკითხეთ (მარკაპი შეიცვალა), და არა „უფასოა" */
  price: number | null
  old_price: number | null
  currency: string | null
  /** `null` = მაღაზიას არ უწერია */
  in_stock: boolean | null
}

/** ⚠️ `ok: false` = მაღაზია არ გაიხსნა; `ok: true, count: 0` = ვერაფერი იპოვა */
export interface ShopSource {
  key: GeShop | string
  name: string
  url: string
  ok: boolean
  count: number
}

/**
 * ძებნა ქართულ მაღაზიებში (corners.ge / puzz.ge).
 *
 * ⚠️ **სქრეიპინგია და არა API** — მაღაზიის ჩავარდნა 200-ით ბრუნდება და
 * `sources[]`-ში იწერება, ე.ი. „მაღაზია მიუწვდომელია" და „ვერაფერი ვიპოვე"
 * ინტერფეისზე ერთმანეთს არ ერევა.
 */
export async function fetchShopOffers(
  query: string,
  shops: string[] = [],
): Promise<{ offers: ShopOffer[]; sources: ShopSource[] }> {
  const { data } = await api.get('/board-games/shops', {
    params: { query, ...(shops.length ? { shops: shops.join(',') } : {}) },
  })
  return data
}

/* ---------- ფაილები: წესები, გალერეა, დოკუმენტები ---------- */

export interface BoardGameFile {
  id: number
  kind: 'rules' | 'image' | 'doc'
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export async function fetchBoardGameFiles(
  gameId: number,
  kind?: BoardGameFile['kind'],
): Promise<BoardGameFile[]> {
  const { data } = await api.get(`/board-games/${gameId}/files`, { params: kind ? { kind } : {} })
  return data.data
}

export async function uploadBoardGameFiles(
  gameId: number,
  kind: BoardGameFile['kind'],
  files: File[],
): Promise<BoardGameFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/board-games/${gameId}/files`, fd)
  return data.data
}

export async function deleteBoardGameFile(id: number): Promise<void> {
  await api.delete(`/board-game-files/${id}`)
}

/* ---------- ჩანიშვნები ---------- */

export interface BoardGameNote {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchBoardGameNotes(gameId: number): Promise<BoardGameNote[]> {
  const { data } = await api.get(`/board-games/${gameId}/notes`)
  return data.data
}

export async function createBoardGameNote(gameId: number, body: string): Promise<BoardGameNote> {
  const { data } = await api.post(`/board-games/${gameId}/notes`, { body })
  return data.data
}

export async function deleteBoardGameNote(id: number): Promise<void> {
  await api.delete(`/board-game-notes/${id}`)
}

/* ---------- ჟანრები — per-user ლექსიკონი ---------- */

export interface BoardGameGenre {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  board_games_count?: number
}

export interface BoardGameGenreInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchBoardGameGenres(): Promise<BoardGameGenre[]> {
  const { data } = await api.get('/board-game-genres')
  return data.data
}

export async function createBoardGameGenre(input: BoardGameGenreInput): Promise<BoardGameGenre> {
  const { data } = await api.post('/board-game-genres', input)
  return data.data
}

export async function updateBoardGameGenre(
  id: number,
  input: BoardGameGenreInput,
): Promise<BoardGameGenre> {
  const { data } = await api.patch(`/board-game-genres/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ ჟანრზე გადავიდეს ეს თამაშები (null = ჟანრის გარეშე) */
export async function deleteBoardGameGenre(id: number, moveTo?: number | null): Promise<number> {
  const { data } = await api.delete(`/board-game-genres/${id}`, {
    data: { move_to: moveTo ?? null },
  })
  return data.moved as number
}

export async function reorderBoardGameGenres(ids: number[]): Promise<BoardGameGenre[]> {
  const { data } = await api.post('/board-game-genres/reorder', { ids })
  return data.data
}
