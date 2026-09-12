import { api } from '@/lib/api'
import type { VideoMetadata, VideoPlatform } from '@/api/videos'

/* ============================================================
   სიმღერების მოდული (`song`, 2026-09-03).

   ⚠️ ადრე სიმღერა `videos`-ის რიგი იყო (Tasks §15). ცალკე მოდულმა მას
   მისცა საიდბარის სექცია, ადმინის გადამრთველი, როლების უფლებები და
   სრული მუსიკალური ველები: შემსრულებელი · ალბომი · წელი · ჟანრი ·
   ხანგრძლივობა · ტეგები · ჩემი ქულა.
   ============================================================ */

/** „ჩემი ქულის" ჭერი — იგივე რიცხვი `Song::MAX_RATING`-შია */
export const SONG_MAX_RATING = 10

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
  images_count?: number
  documents_count?: number
  notes_count?: number
  created_at: string | null
}

export interface SongFilters {
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
  if (input.year != null) fd.append('year', String(input.year))
  // ⚠️ ცარიელ მასივსაც ვგზავნით (`genre_ids` გასაღებით), თორემ ყველა ჟანრის
  // მოხსნა backend-ზე „ველი არ მოვიდა"-დ იკითხებოდა და ძველი რჩებოდა
  if (input.genre_ids) {
    if (input.genre_ids.length === 0) fd.append('genre_ids', '')
    input.genre_ids.forEach((id) => fd.append('genre_ids[]', String(id)))
  }
  if (input.duration != null) fd.append('duration', String(input.duration))
  if (input.rating != null) fd.append('rating', String(input.rating))
  if (input.visibility) fd.append('visibility', input.visibility)
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')
  return fd
}

/** ბმულის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchSongMetadata(url: string): Promise<VideoMetadata> {
  const { data } = await api.post('/songs/metadata', { url })
  return data
}

export async function fetchSongs(filters: SongFilters = {}): Promise<Song[]> {
  const { favorite, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}) }
  const { data } = await api.get('/songs', { params })
  return data.data
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
  sort_order: number
  songs_count?: number
}

export interface SongGenreInput {
  name_ka: string
  name_en: string
  icon?: string | null
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
export async function deleteSongGenre(id: number, moveTo?: number | null): Promise<number> {
  const { data } = await api.delete(`/song-genres/${id}`, {
    data: { move_to: moveTo ?? null },
  })
  return data.moved as number
}

export async function reorderSongGenres(ids: number[]): Promise<SongGenre[]> {
  const { data } = await api.post('/song-genres/reorder', { ids })
  return data.data
}

/* ---------- §7.4 — მიმაგრებული ფაილები და ჩანიშვნები ----------
   ცხრილები **სექციისაა** (`song_files`/`song_notes`) — 2026-09-03-ის წესი,
   უნივერსალური `attachments` აღარ არსებობს. ფორმა ვიდეოსი ზუსტად იგივეა.

   ⚠️ **აუდიოფაილი აქ არ იტვირთება** — სიმღერის წყარო `songs.url`-ია. */

export interface SongFile {
  id: number
  kind: 'image' | 'doc'
  /** storage-ის გზა (ფრონტი `storageUrl()`-ით აწყობს) */
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export interface SongNote {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchSongFiles(songId: number): Promise<SongFile[]> {
  const { data } = await api.get(`/songs/${songId}/files`)
  return data.data
}

export async function uploadSongFiles(
  songId: number,
  kind: SongFile['kind'],
  files: File[],
): Promise<SongFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((f) => fd.append('files[]', f))
  const { data } = await api.post(`/songs/${songId}/files`, fd)
  return data.data
}

export async function deleteSongFile(id: number): Promise<void> {
  await api.delete(`/song-files/${id}`)
}

export async function fetchSongNotes(songId: number): Promise<SongNote[]> {
  const { data } = await api.get(`/songs/${songId}/notes`)
  return data.data
}

export async function createSongNote(songId: number, body: string): Promise<SongNote> {
  const { data } = await api.post(`/songs/${songId}/notes`, { body })
  return data.data
}

export async function updateSongNote(id: number, body: string): Promise<SongNote> {
  const { data } = await api.patch(`/song-notes/${id}`, { body })
  return data.data
}

export async function deleteSongNote(id: number): Promise<void> {
  await api.delete(`/song-notes/${id}`)
}
