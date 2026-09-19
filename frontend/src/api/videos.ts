import { API_URL, api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { Status } from '@/api/types'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   ვიდეოს მოდული (I5) — ბმულები ნებისმიერი წყაროდან.
   ============================================================ */

export type VideoPlatform = 'youtube' | 'vimeo' | 'dailymotion' | 'file' | 'other'

export interface Video {
  id: number
  title: string
  description: string | null
  /** მართვადი ტიპი (Tasks 5.1) — `kind` enum-ი აღარ არსებობს */
  type_id: number | null
  type?: VideoType | null
  /** §6.4 — მართვადი სტატუსი; ამ მოდულს ის აქამდე არ ჰქონდა */
  status: Status | null
  /** 5.6/16.5 — საჯარო პროფილის წინაპირობა */
  visibility: 'private' | 'public'
  url: string
  platform: VideoPlatform
  external_id: string | null
  /** sanitized iframe src — backend-ის allowlist-ით აწყობილი (თვითნებური HTML არასდროს) */
  embed_url: string | null
  /** storage-ის გზა ან პლატფორმის სრული URL */
  thumbnail: string | null
  duration: number | null
  tags: string[]
  is_favorite: boolean
  watch_count: number
  watched_at: string | null
  created_at: string | null
  /**
   * §7.1 — ლოკალური ასლი (`yt-dlp`).
   *
   * ⚠️ სამი სხვადასხვა ფაქტია და ერთ boolean-ში არ ეტევა: `null` — არასდროს
   * გვიცდია · `running` — მიმდინარეობს · `failed` + `download_error` — ვცადეთ
   * და ვერ გამოვიდა · `ready` — ფაილი გვაქვს. ⚠️ **გზა აქ არ მოდის**: ფაილი
   * პრივატულ დისკზეა და მხოლოდ `videoDownloadUrl()`-ით იხსნება.
   */
  download_status: 'running' | 'ready' | 'failed' | null
  download_size: number
  download_format: string | null
  download_name: string | null
  download_error: string | null
  downloaded_at: string | null
  /**
   * ⚠️ **„გაჭედილია" — სერვერის სათქმელია და არა ჩვენი.** ფონური პროცესი
   * შეიძლება მოკვდეს (სერვერის ტერმინალის დახურვა, გადატვირთვა) და სტატუსი
   * `running`-ად დარჩეს სამუდამოდ. ჭერისა და საწყისი დროის აქ გამეორება
   * ორ ფორმულას გააჩენდა — ღილაკი „მიმდინარეობს"-ს აჩვენებდა მაშინ, როცა
   * სერვერი უკვე უშვებდა ხელახლა გაშვებას (`Video::downloadStale()`).
   */
  download_stale: boolean
  /** მიმაგრებული შიგთავსი (K3) */
  images_count?: number
  documents_count?: number
  notes_count?: number
}

/* ---------- მიმაგრებული ფაილები და ჩანიშვნები (K3) ----------
   ⚠️ ცხრილიც და მისამართიც **სექციისაა** (`video_files` / `video_notes`),
   უნივერსალური `attachments`/`notes` აღარ არსებობს (2026-09-03). */

export interface VideoFile {
  id: number
  kind: 'image' | 'doc'
  /** storage-ის გზა (ფრონტი `storageUrl()`-ით აწყობს) */
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export interface VideoNote {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchVideoFiles(videoId: number): Promise<VideoFile[]> {
  const { data } = await api.get(`/videos/${videoId}/files`)
  return data.data
}

export async function uploadVideoFiles(
  videoId: number,
  kind: 'image' | 'doc',
  files: File[],
): Promise<VideoFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((f) => fd.append('files[]', f))
  const { data } = await api.post(`/videos/${videoId}/files`, fd)
  return data.data
}

export async function deleteVideoFile(id: number): Promise<void> {
  await api.delete(`/video-files/${id}`)
}

export async function fetchVideoNotes(videoId: number): Promise<VideoNote[]> {
  const { data } = await api.get(`/videos/${videoId}/notes`)
  return data.data
}

export async function createVideoNote(videoId: number, body: string): Promise<VideoNote> {
  const { data } = await api.post(`/videos/${videoId}/notes`, { body })
  return data.data
}

export async function updateVideoNote(id: number, body: string): Promise<VideoNote> {
  const { data } = await api.patch(`/video-notes/${id}`, { body })
  return data.data
}

export async function deleteVideoNote(id: number): Promise<void> {
  await api.delete(`/video-notes/${id}`)
}

/* ---------- ვიდეოს ტიპები — მართვადი ლექსიკონი (Tasks 5.1) ---------- */

export interface VideoType {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  videos_count?: number
}

export interface VideoTypeInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchVideoTypes(): Promise<VideoType[]> {
  const { data } = await api.get('/video-types')
  return data.data
}

export async function createVideoType(input: VideoTypeInput): Promise<VideoType> {
  const { data } = await api.post('/video-types', input)
  return data.data
}

export async function updateVideoType(id: number, input: VideoTypeInput): Promise<VideoType> {
  const { data } = await api.patch(`/video-types/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ ტიპზე გადავიდეს ეს ვიდეოები (null = ტიპის გარეშე) */
export async function deleteVideoType(
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/video-types/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderVideoTypes(ids: number[]): Promise<VideoType[]> {
  const { data } = await api.post('/video-types/reorder', { ids })
  return data.data
}

/* ---------- ვიდეოები ---------- */

export interface VideoFilters extends ListParams {
  q?: string
  platform?: string
  favorite?: boolean
  /** ტეგები — მძიმით გამოყოფილი სია (5.2) */
  tag?: string
  /** ტიპები — მძიმით გამოყოფილი id-ები (5.2) */
  type_id?: string
  /** §7.1 — მხოლოდ ლოკალურად ჩამოწერილები (მიმდინარეებიც) */
  downloaded?: boolean
  /** §6.4 — სტატუსის **გასაღები** (მძიმით გამოყოფილი სიაც შეიძლება) */
  status?: string
  sort?: string
}

export interface VideoInput {
  title: string
  url: string
  type_id?: number | null
  /** §6.4 — ლექსიკონის გასაღები; `undefined` = „არ შეცვალო" */
  status?: string
  visibility?: 'private' | 'public'
  description?: string
  duration?: number | null
  tags?: string[]
  /** ატვირთული thumbnail; მითითების შემთხვევაში multipart-ად იგზავნება */
  thumbnail?: File | null
  remove_thumbnail?: boolean
}

function toFormData(input: VideoInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('url', input.url)
  fd.append('description', input.description ?? '')
  if (input.type_id != null) fd.append('type_id', String(input.type_id))
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  if (input.duration != null) fd.append('duration', String(input.duration))
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
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
  /**
   * FEAT-17 — ამ ბმულის ჩანაწერი უკვე გაქვს?
   * ⚠️ **გაფრთხილებაა და არა აკრძალვა**: ერთი ბმულის ორჯერ შენახვა
   * ლეგიტიმურია (სხვა ტიპით, სხვა ტეგებით), ამიტომ ფორმა მხოლოდ ამბობს
   * და არავის აჩერებს.
   */
  existing: { id: number; title: string | null } | null
}

/**
 * ბმულის მეტამონაცემი ფორმის შესავსებად (K2) — ჩანაწერს არ ქმნის.
 * ⚠️ `exclude` რედაქტირებისთვისაა: ჩანაწერი საკუთარი თავის დუბლი არაა.
 */
export async function fetchVideoMetadata(url: string, exclude?: number): Promise<VideoMetadata> {
  const { data } = await api.post('/videos/metadata', { url, ...(exclude ? { exclude } : {}) })
  return data
}

export async function fetchVideos(filters: VideoFilters = {}): Promise<Page<Video>> {
  const { favorite, downloaded, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = {
    ...rest,
    ...(favorite ? { favorite: 1 } : {}),
    ...(downloaded ? { downloaded: 1 } : {}),
    ...(all ? { all: 1 } : {}),
  }
  const { data } = await api.get('/videos', { params })
  return readPage<Video>(data)
}

/* ---------- §7.1 — ლოკალური ასლი (`yt-dlp`) ----------
   ⚠️ ერთი მისამართი, სამი ზმნა: დაწყება · მიწოდება · წაშლა. */

export interface VideoDownloadStatus {
  /** `yt-dlp` ამ მანქანაზეა? false-ზე ღილაკი ჩანს, მაგრამ ამბობს, რატომ არა */
  available: boolean
  version: string | null
  /** ⚠️ ffmpeg-ის გარეშე „საუკეთესო" ერთფაილიან ვარიანტამდე ეცემა */
  ffmpeg: boolean
}

/** ერთი ვიდეო id-ით — FEAT-17-ის „დუბლის გახსნა" (სიაში შეიძლება არც იყოს) */
export async function fetchVideo(id: number): Promise<Video> {
  const { data } = await api.get(`/videos/${id}`)
  return data.data
}

export async function fetchVideoDownloadStatus(): Promise<VideoDownloadStatus> {
  const { data } = await api.get('/videos/download-status')
  return data
}

/** ჩამოწერის დაწყება — ბრუნდება მაშინვე, სამუშაო ფონურად მიდის (202) */
export async function startVideoDownload(id: number): Promise<Video> {
  const { data } = await api.post(`/videos/${id}/download`)
  return data.data
}

export async function deleteVideoDownload(id: number): Promise<Video> {
  const { data } = await api.delete(`/videos/${id}/download`)
  return data.data
}

/**
 * ლოკალური ფაილის მისამართი.
 *
 * ⚠️ **`/storage/*` აქ არ გამოდგება**: ფაილი პრივატულ დისკზეა (§17.5-ის წესი),
 * ე.ი. მას მხოლოდ ეს ავტორიზებული API-მარშრუტი გამოიტანს.
 */
export function videoDownloadUrl(id: number): string {
  return `${API_URL}/api/videos/${id}/download`
}

/**
 * „მსგავსი ვიდეოები" (K4) — backend ითვლის **ჩემი ბიბლიოთეკიდან**
 * (საერთო ტეგები + სათაურის მსგავსება + იგივე პლატფორმა/ტიპი).
 */
export async function fetchSimilarVideos(id: number): Promise<Video[]> {
  const { data } = await api.get(`/videos/${id}/similar`)
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

/** §6.4 — სტატუსის შეცვლა ცალკე endpoint-ია (მედია-დომენების ანალოგი) */
export async function setVideoStatus(id: number, status: string): Promise<Video> {
  const { data } = await api.patch(`/videos/${id}/status`, { status })
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

/* ---------- მასობრივი ოპერაცია (Tasks 4 / 19.9) ---------- */

/** ვიდეოს სტატუსი არ აქვს, ამიტომ მასობრივად ტიპი და ტეგები იცვლება */
export type VideoBulkAction = 'type' | 'tags_add' | 'tags_remove' | 'status'

/**
 * **ვის შეეხება (Tasks §9).**
 *
 * ⚠️ **ლექსიკა `PurgeService::TARGET_MODES`-ისაა და არა გამოგონილი** — იგივე
 * სიტყვები, იგივე მნიშვნელობა. ორი ლექსიკონი ერთსა და იმავე ცნებაზე
 * ერთ დღეს დაშორდებოდა.
 */
export const VIDEO_BULK_SCOPES = ['ids', 'type', 'tag', 'status', 'all'] as const
export type VideoBulkScope = (typeof VIDEO_BULK_SCOPES)[number]

/**
 * ⚠️ **სკოუპის პარამეტრებს `scope_` პრეფიქსი აქვს და ეს სავალდებულოა**:
 * `tags`/`type_id`/`status` **მოქმედების** დატვირთვაა, ე.ი. იმავე სახელით
 * სკოუპი თავის თავზე მიუთითებდა — „დაამატე ტეგი X ყველას, ვისაც X აქვს".
 */
export interface VideoBulkScopeInput {
  scope: VideoBulkScope
  scope_ids?: number[]
  /** `0` = ტიპის გარეშე (`type_id IS NULL`) */
  scope_type_id?: number
  scope_tag?: string
  scope_status?: string
}

export interface VideoBulkInput extends VideoBulkScopeInput {
  action: VideoBulkAction
  /** action=type — ⚠️ `null` აღარ არსებობს: ტიპი სავალდებულია */
  type_id?: number
  /** action=status — სტატუსის **გასაღები** */
  status?: string
  tags?: string[]
}

/** @returns რამდენი ვიდეო **ნამდვილად** შეიცვალა */
export async function bulkUpdateVideos(input: VideoBulkInput): Promise<number> {
  const { data } = await api.post('/videos/bulk', input)
  return data.updated as number
}

export interface VideoBulkPreview {
  count: number
  sample: { id: number; title: string }[]
}

/**
 * „რამდენს შეეხება" — **სერვერის პასუხი და არა კლიენტზე დათვლილი რიცხვი**
 * (Tasks §9.2/§9.4): ორი განმარტება ნიშნავდა, რომ ნაჩვენები რიცხვი და
 * შეხებული რიგები ერთმანეთს აცდებოდა.
 *
 * ⚠️ **`GET`**: `preview` `UPDATE_ENDPOINTS`-ში არ არის, ე.ი. POST-ს
 * შუამავალი `create`-ად წაიკითხავდა.
 */
export async function previewVideoBulk(scope: VideoBulkScopeInput): Promise<VideoBulkPreview> {
  const { data } = await api.get('/videos/bulk-preview', { params: scope })
  return data
}

/** per-user per-module პარამეტრები (`module_user.settings`) */
export async function saveModuleSettings(key: string, settings: Record<string, unknown>): Promise<void> {
  await api.put(`/modules/${key}/settings`, { settings })
}
