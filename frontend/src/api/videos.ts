import { api } from '@/lib/api'

/* ============================================================
   ვიდეოს მოდული (I5) — ბმულები ნებისმიერი წყაროდან.
   ============================================================ */

export type VideoPlatform = 'youtube' | 'vimeo' | 'dailymotion' | 'file' | 'other'

export interface Video {
  id: number
  title: string
  description: string | null
  kind: VideoKind
  url: string
  platform: VideoPlatform
  external_id: string | null
  /** sanitized iframe src — backend-ის allowlist-ით აწყობილი (თვითნებური HTML არასდროს) */
  embed_url: string | null
  /** storage-ის გზა, სრული URL, ან private thumb-ის route */
  thumbnail: string | null
  thumbnail_is_private: boolean
  duration: number | null
  tags: string[]
  is_adult: boolean
  is_favorite: boolean
  watch_count: number
  watched_at: string | null
  created_at: string | null
  /** მიმაგრებული შიგთავსი (K3) */
  images_count?: number
  documents_count?: number
  notes_count?: number
}

/* ---------- მიმაგრებული ფაილები და ჩანიშვნები (K3) ---------- */

export interface Attachment {
  id: number
  kind: 'image' | 'doc'
  /** public → storage-ის გზა; private (18+) → სრული URL policy-ით დაცულ route-ზე */
  url: string
  is_private: boolean
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export interface Note {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchAttachments(videoId: number): Promise<Attachment[]> {
  const { data } = await api.get(`/videos/${videoId}/attachments`)
  return data.data
}

export async function uploadAttachments(
  videoId: number,
  kind: 'image' | 'doc',
  files: File[],
): Promise<Attachment[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((f) => fd.append('files[]', f))
  const { data } = await api.post(`/videos/${videoId}/attachments`, fd)
  return data.data
}

export async function deleteAttachment(id: number): Promise<void> {
  await api.delete(`/attachments/${id}`)
}

export async function fetchNotes(videoId: number): Promise<Note[]> {
  const { data } = await api.get(`/videos/${videoId}/notes`)
  return data.data
}

export async function createNote(videoId: number, body: string): Promise<Note> {
  const { data } = await api.post(`/videos/${videoId}/notes`, { body })
  return data.data
}

export async function updateNote(id: number, body: string): Promise<Note> {
  const { data } = await api.patch(`/notes/${id}`, { body })
  return data.data
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}`)
}

/** ვიდეოს ტიპი — საიდბარის სექციები (K7) */
export type VideoKind = 'media' | 'info'

export interface VideoFilters {
  q?: string
  platform?: string
  favorite?: boolean
  tag?: string
  adult_only?: boolean
  kind?: VideoKind
  sort?: string
}

export interface VideoInput {
  title: string
  url: string
  kind?: VideoKind
  description?: string
  duration?: number | null
  tags?: string[]
  is_adult?: boolean
  /** ატვირთული thumbnail; მითითების შემთხვევაში multipart-ად იგზავნება */
  thumbnail?: File | null
  remove_thumbnail?: boolean
}

function toFormData(input: VideoInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('url', input.url)
  fd.append('description', input.description ?? '')
  fd.append('kind', input.kind ?? 'media')
  if (input.duration != null) fd.append('duration', String(input.duration))
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  fd.append('is_adult', input.is_adult ? '1' : '0')
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')
  return fd
}

export interface VideoMetadata {
  platform: VideoPlatform
  external_id: string | null
  embed_url: string | null
  title: string | null
  description: string | null
  duration: number | null
  tags: string[]
  thumbnail_url: string | null
  author: string | null
  /** საიდან წამოვიდა: oembed | youtube_api | null */
  source: 'oembed' | 'youtube_api' | null
  /** დაყენებულია თუ არა YOUTUBE_API_KEY (ხანგრძლივობა/ტეგებისთვის) */
  youtube_key: boolean
}

/** ბმულის მეტამონაცემი ფორმის შესავსებად (K2) — ჩანაწერს არ ქმნის */
export async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  const { data } = await api.post('/videos/metadata', { url })
  return data
}

export async function fetchVideos(filters: VideoFilters = {}): Promise<Video[]> {
  const { favorite, adult_only, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = {
    ...rest,
    ...(favorite ? { favorite: 1 } : {}),
    ...(adult_only ? { adult_only: 1 } : {}),
  }
  const { data } = await api.get('/videos', { params })
  return data.data
}

export async function createVideo(input: VideoInput): Promise<Video> {
  const { data } = await api.post('/videos', toFormData(input))
  return data.data
}

export async function updateVideo(id: number, input: VideoInput): Promise<Video> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/videos/${id}`, fd)
  return data.data
}

export async function deleteVideo(id: number): Promise<void> {
  await api.delete(`/videos/${id}`)
}

export async function toggleVideoFavorite(id: number): Promise<Video> {
  const { data } = await api.patch(`/videos/${id}/favorite`)
  return data.data
}

export async function markVideoWatched(id: number): Promise<Video> {
  const { data } = await api.post(`/videos/${id}/watched`)
  return data.data
}

/** per-user per-module პარამეტრები (18+ consent) */
export async function saveModuleSettings(key: string, settings: Record<string, unknown>): Promise<void> {
  await api.put(`/modules/${key}/settings`, { settings })
}
