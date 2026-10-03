import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { VideoMetadata, VideoPlatform } from '@/api/videos'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   სიმღერების მოდული (`song`, 2026-09-03).

   ⚠️ ადრე სიმღერა `videos`-ის რიგი იყო (Tasks §15). ცალკე მოდულმა მას
   მისცა საიდბარის სექცია, ადმინის გადამრთველი, როლების უფლებები და
   სრული მუსიკალური ველები: შემსრულებელი · ალბომი · წელი · ჟანრი ·
   ხანგრძლივობა · ტეგები · ჩემი ქულა.
   ============================================================ */

export interface Song {
  id: number
  title: string
  artist: string | null
  album: string | null
  year: number | null
  /** ⚠️ **მრავალჟანრიანია** (`DECISIONS.md` §5) — ერთი `genre_id` აღარ არსებობს */
  genres?: SongGenre[]
  genre_ids?: number[]
  duration: number | null
  url: string
  platform: VideoPlatform
  external_id: string | null
  /** sanitized iframe src — backend-ის allowlist-ით აწყობილი */
  embed_url: string | null
  /** storage-ის გზა ან პლატფორმის სრული URL */
  thumbnail: string | null
  tags: string[]
  rating: number | null
  is_favorite: boolean
  /** Tasks §10 — შესვლების რიცხვი სიაში (`withCount('visits')`) */
  visits_count?: number
  play_count: number
  played_at: string | null
  /** 16.5 — საჯარო პროფილის წინაპირობა */
  visibility: 'private' | 'public'
  playlist_ids?: number[]
  /**
   * §5.3 — რომელ პლეილისტებშია სიმღერა.
   * ⚠️ `undefined` = კავშირი არ ჩატვირთულა, `[]` = **არცერთში** — სია ამ
   * ორს სხვადასხვანაირად ხატავს, თორემ „არცერთ პლეილისტში" იქაც ეწერებოდა,
   * სადაც უბრალოდ არ გვიკითხავს.
   */
  playlists?: { id: number; name: string }[]
  /** §7.4 — მიმაგრებული ფაილები/ჩანიშვნები (`undefined` = არ დაგვითვლია) */
  created_at: string | null
}

export interface SongFilters extends ListParams {
  q?: string
  platform?: string
  favorite?: boolean
  /** ჟანრები — მძიმით გამოყოფილი id-ები (AND) */
  genre_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია */
  tag?: string
  artist?: string
  sort?: string
}

export interface SongInput {
  title: string
  url: string
  artist?: string | null
  album?: string | null
  year?: number | null
  genre_ids?: number[]
  duration?: number | null
  tags?: string[]
  rating?: number | null
  visibility?: 'private' | 'public'
  /** ატვირთული ფოტო; მითითების შემთხვევაში multipart-ად იგზავნება */
  thumbnail?: File | null
  remove_thumbnail?: boolean
}

function toFormData(input: SongInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('url', input.url)
  fd.append('artist', input.artist ?? '')
  fd.append('album', input.album ?? '')
  /* Tasks §25.3 (§4.8-ის წესი) — `null` („გაასუფთავე“) ცარიელ სტრიქონად
     იგზავნება, `undefined` („არ შეეხო“) — არა; ადრე გასუფთავებული წელი,
     ხანგრძლივობა და ქულა შენახვის შემდეგ უკან ბრუნდებოდა. */
  const number = (key: 'year' | 'duration' | 'rating') => {
    const value = input[key]
    if (value !== undefined) fd.append(key, value == null ? '' : String(value))
  }
  number('year')
  // ⚠️ ცარიელ მასივსაც ვგზავნით (`genre_ids` გასაღებით), თორემ ყველა ჟანრის
  // მოხსნა backend-ზე „ველი არ მოვიდა"-დ იკითხებოდა და ძველი რჩებოდა
  if (input.genre_ids) {
    if (input.genre_ids.length === 0) fd.append('genre_ids', '')
    input.genre_ids.forEach((id) => fd.append('genre_ids[]', String(id)))
  }
  number('duration')
  number('rating')
  if (input.visibility) fd.append('visibility', input.visibility)
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')
  return fd
}

/**
 * ბმულის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის.
 * ⚠️ `exclude` რედაქტირებისთვისაა: ჩანაწერი საკუთარი თავის დუბლი არაა.
 */
export async function fetchSongMetadata(url: string, exclude?: number): Promise<VideoMetadata> {
  const { data } = await api.post('/songs/metadata', { url, ...(exclude ? { exclude } : {}) })
  return data
}

export async function fetchSongs(filters: SongFilters = {}): Promise<Page<Song>> {
  const { favorite, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/songs', { params })
  return readPage<Song>(data)
}

export async function fetchSong(id: number): Promise<Song> {
  const { data } = await api.get(`/songs/${id}`)
  return data.data
}

export async function createSong(input: SongInput): Promise<Song> {
  const { data } = await api.post('/songs', toFormData(input))
  return data.data
}

export async function updateSong(id: number, input: SongInput): Promise<Song> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/songs/${id}`, fd)
  return data.data
}

export async function deleteSong(id: number): Promise<void> {
  await api.delete(`/songs/${id}`)
}

export async function toggleSongFavorite(id: number): Promise<Song> {
  const { data } = await api.patch(`/songs/${id}/favorite`)
  return data.data
}

export async function markSongPlayed(id: number): Promise<Song> {
  const { data } = await api.post(`/songs/${id}/played`)
  return data.data
}

/* ---------- მუსიკის ჟანრები — per-user ლექსიკონი ---------- */

export interface SongGenre {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  /** Tasks §24.3 — ჟანრის ფერი: პალიტრის გასაღები (`c1…c12`) ან `#rrggbb`; `null` — ნაცრისფერი */
  color: string | null
  sort_order: number
  songs_count?: number
}

export interface SongGenreInput {
  name_ka: string
  name_en: string
  icon?: string | null
  color?: string | null
}

export async function fetchSongGenres(): Promise<SongGenre[]> {
  const { data } = await api.get('/song-genres')
  return data.data
}

export async function createSongGenre(input: SongGenreInput): Promise<SongGenre> {
  const { data } = await api.post('/song-genres', input)
  return data.data
}

export async function updateSongGenre(id: number, input: SongGenreInput): Promise<SongGenre> {
  const { data } = await api.patch(`/song-genres/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ ჟანრზე გადავიდეს ეს სიმღერები (null = ჟანრის გარეშე) */
export async function deleteSongGenre(
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/song-genres/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderSongGenres(ids: number[]): Promise<SongGenre[]> {
  const { data } = await api.post('/song-genres/reorder', { ids })
  return data.data
}

