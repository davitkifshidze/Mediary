import { api, API_URL } from '@/lib/api'
import type { RecordLockState } from '@/api/locks'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { Visibility } from '@/api/publicProfile'

/* ============================================================
   **პირადი გალერეა — მოდული `personal`.**

   პიროვნებები · ალბომები („გარეთ" ან პიროვნების შიგნით) · ფოტო და ვიდეო
   მოწყობილობიდან. ⚠️ **ყველა ფაილი პირად დისკზეა**: `url`/`thumb` API-ის
   გზებია და არა `/storage/*` — ესკიზი blob-ად იკითხება (`usePrivateFileUrl`),
   ვიდეო კი `<video src>`-ით უკრავს (`personalFileUrl()`, Range-ით).

   ⚠️ **ინვარიანტი სერვერისაა**: პიროვნების ალბომში ჩაგდებული ფოტო მისი
   პიროვნება ხდება, სხვა პიროვნებაზე გადატანილი კი წინა პიროვნების ალბომს
   ტოვებს — SPA ამას არ იმეორებს, მხოლოდ პასუხს ხატავს.
   ============================================================ */

const PERSONAL_KINDS = ['photo', 'video'] as const

export type PersonalKind = (typeof PERSONAL_KINDS)[number]

/** სორტირება — გადაღების თარიღი · დამატება · ჩემი რიგი */
export const PERSONAL_SORTS = ['taken', 'added', 'manual'] as const

export type PersonalSort = (typeof PERSONAL_SORTS)[number]

/** „ფოტო & ვიდეო"-ს სერვერული დაჯგუფება („დაუჯგუფებელი" — ფილტრია, `ungrouped`) */
const PERSONAL_GROUPINGS = ['person', 'album'] as const

export type PersonalGrouping = (typeof PERSONAL_GROUPINGS)[number]

/**
 * **ლოკი** — ზოგადია (`api/locks.ts`): მხოლოდ ორი ფაქტი და
 * მინიშნება; hash არასდროს. `locked && !unlocked` — **ბოქლომიანი ბარათი**.
 */
export { isHidden } from '@/api/locks'

export interface Person extends RecordLockState {
  id: number
  name: string
  birthday: string | null
  note: string | null
  cover_media_id: number | null
  /** მთავარი ფოტოს ესკიზის API-გზა (ცხადად არჩეული ან უახლესი) */
  cover: string | null
  photos: number
  videos: number
  albums: number
  sort_order: number
  created_at: string | null
}

export interface PersonalAlbum extends RecordLockState {
  id: number
  name: string
  description: string | null
  person_id: number | null
  person: { id: number; name: string } | null
  cover_media_id: number | null
  cover: string | null
  visibility: Visibility
  photos: number
  videos: number
  sort_order: number
  created_at: string | null
}

export interface PersonalMedia {
  id: number
  kind: PersonalKind
  /** API-ის გზა — `/personal/media/{id}/file` */
  url: string
  /** ესკიზის API-გზა (ვერსიით); ესკიზის გარეშე — `null` */
  thumb: string | null
  private: true
  mime: string | null
  /** ფაილი + ესკიზი (კვოტაში ორივე ითვლება) */
  size: number
  original_name: string
  width: number | null
  height: number | null
  /** ვიდეოს ხანგრძლივობა წამებში */
  duration: number | null
  taken_at: string | null
  caption: string | null
  is_favorite: boolean
  person_id: number | null
  album_id: number | null
  sort_order: number
  created_at: string | null
}

export interface PersonalSummary {
  people: number
  albums: number
  photos: number
  videos: number
  favorites: number
  ungrouped: number
  bytes: number
  storage: import('@/api/account').StorageUsage
}

/** ჯგუფის გახსნის ფილტრი — ზუსტად ის, რასაც `GET /personal/media` იღებს */
export interface PersonalMediaFilters extends ListParams {
  person_id?: number
  album_id?: number
  ungrouped?: boolean
  no_person?: boolean
  no_album?: boolean
  kind?: PersonalKind
  favorite?: boolean
  q?: string
  sort?: PersonalSort
}

export interface PersonalGroup {
  /** `person:5` · `person:none` · `album:3` · `album:none` */
  key: string
  /** `null` — პიროვნების/ალბომის გარეშე */
  title: string | null
  subtitle: string | null
  filter: Partial<Pick<PersonalMediaFilters, 'person_id' | 'album_id' | 'no_person' | 'no_album'>>
  photos: number
  videos: number
  total: number
  /** ესკიზების API-გზები */
  previews: string[]
}

/* ---------- ქეშის გასაღებები ---------- */

/** ყველა სია ერთ ფესვზე — ცვლილება მათ ერთად აბათილებს (`invalidatePersonal`) */
export const PERSONAL_KEY = 'personal' as const

/* ---------- შეჯამება ---------- */

export async function fetchPersonalSummary(): Promise<PersonalSummary> {
  const { data } = await api.get('/personal/summary')
  return data
}

/* ---------- ადამიანები ---------- */

export interface PersonInput {
  name?: string
  birthday?: string | null
  note?: string | null
  cover_media_id?: number | null
}

export async function fetchPeople(): Promise<Person[]> {
  const { data } = await api.get('/personal/people')
  return data.data
}

export async function fetchPerson(id: number): Promise<Person> {
  const { data } = await api.get(`/personal/people/${id}`)
  return data.data
}

export async function createPerson(input: PersonInput): Promise<Person> {
  const { data } = await api.post('/personal/people', input)
  return data.data
}

export async function updatePerson(id: number, input: PersonInput): Promise<Person> {
  const { data } = await api.patch(`/personal/people/${id}`, input)
  return data.data
}

/** ურნაში — `keep` ფოტოებსა და ალბომებს უჯგუფოდ ტოვებს; მის გარეშე ისინი მასთან ერთად მიდის */
export async function deletePerson(id: number, keep: boolean): Promise<void> {
  await api.delete(`/personal/people/${id}`, { params: keep ? { keep: 1 } : {} })
}

export async function reorderPeople(ids: number[]): Promise<Person[]> {
  const { data } = await api.post('/personal/people/reorder', { ids })
  return data.data
}

/* ---------- ალბომები ---------- */

export interface PersonalAlbumInput {
  name?: string
  description?: string | null
  person_id?: number | null
  cover_media_id?: number | null
  visibility?: Visibility
}

export async function fetchPersonalAlbums(params: { person_id?: number; outside?: boolean } = {}): Promise<PersonalAlbum[]> {
  const { data } = await api.get('/personal/albums', {
    params: { ...(params.person_id ? { person_id: params.person_id } : {}), ...(params.outside ? { outside: 1 } : {}) },
  })
  return data.data
}

export async function fetchPersonalAlbum(id: number): Promise<PersonalAlbum> {
  const { data } = await api.get(`/personal/albums/${id}`)
  return data.data
}

export async function createPersonalAlbum(input: PersonalAlbumInput): Promise<PersonalAlbum> {
  const { data } = await api.post('/personal/albums', input)
  return data.data
}

export async function updatePersonalAlbum(id: number, input: PersonalAlbumInput): Promise<PersonalAlbum> {
  const { data } = await api.patch(`/personal/albums/${id}`, input)
  return data.data
}

/** ურნაში — ნაგულისხმევად ფოტოები რჩება ალბომის გარეშე; `withMedia` მათ ალბომთან ერთად აგზავნის */
export async function deletePersonalAlbum(id: number, withMedia: boolean): Promise<void> {
  await api.delete(`/personal/albums/${id}`, { params: withMedia ? { with_media: 1 } : {} })
}

export async function reorderPersonalAlbums(ids: number[]): Promise<PersonalAlbum[]> {
  const { data } = await api.post('/personal/albums/reorder', { ids })
  return data.data
}

/* ---------- ჩაკეტვა ---------- */

/** ლოკის მარშრუტის სეგმენტი — `/personal/people/{id}/lock` · `/personal/albums/{id}/lock` */
export type PersonalLockKind = 'people' | 'albums'

/* ---------- ფოტო და ვიდეო ---------- */

/** ⚠️ ცრუ boolean-ები საერთოდ არ იგზავნება — `ungrouped=0` სერვერზე „ფილტრის გარეშეა" */
function mediaParams(filters: PersonalMediaFilters) {
  const out: Record<string, string | number> = {}

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    out[key] = value === true ? 1 : (value as string | number)
  }

  return out
}

export async function fetchPersonalMedia(filters: PersonalMediaFilters = {}): Promise<Page<PersonalMedia>> {
  const { data } = await api.get('/personal/media', { params: mediaParams(filters) })
  return readPage<PersonalMedia>(data)
}

export async function fetchPersonalGroups(
  by: PersonalGrouping,
  filters: Pick<PersonalMediaFilters, 'kind' | 'favorite'> = {},
): Promise<PersonalGroup[]> {
  const { data } = await api.get('/personal/media/groups', { params: { by, ...mediaParams(filters) } })
  return data.data
}

export interface UploadPersonalInput {
  person_id?: number | null
  album_id?: number | null
  caption?: string | null
}

/**
 * **ერთი ფაილი ერთ მოთხოვნაში** — პროგრესით (`onProgress` 0–1).
 *
 * ⚠️ `taken_at` ბრაუზერის `lastModified`-ია — სერვერი მას მხოლოდ მაშინ იყენებს,
 * როცა ფაილს EXIF-ის (ვიდეოზე `creation_time`-ის) თარიღი არ აქვს.
 */
export async function uploadPersonalMedia(
  file: File,
  input: UploadPersonalInput = {},
  onProgress?: (fraction: number) => void,
): Promise<PersonalMedia> {
  const form = new FormData()
  form.append('file', file)
  if (input.person_id) form.append('person_id', String(input.person_id))
  if (input.album_id) form.append('album_id', String(input.album_id))
  if (input.caption) form.append('caption', input.caption)
  if (file.lastModified) form.append('taken_at', new Date(file.lastModified).toISOString())

  const { data } = await api.post('/personal/media', form, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(event.loaded / event.total)
    },
  })

  return data.data
}

export async function updatePersonalMedia(
  id: number,
  input: { caption?: string | null; taken_at?: string | null },
): Promise<PersonalMedia> {
  const { data } = await api.patch(`/personal/media/${id}`, input)
  return data.data
}

export async function togglePersonalFavorite(id: number): Promise<PersonalMedia> {
  const { data } = await api.patch(`/personal/media/${id}/favorite`)
  return data.data
}

/**
 * გადატანა — **გასაღების არსებობა ნიშნავს ცვლილებას**: `person_id: null`
 * ადამიანს ხსნის, გასაღების არქონა ხელს არ ახლებს.
 */
export async function movePersonalMedia(
  ids: number[],
  changes: { person_id?: number | null; album_id?: number | null },
): Promise<number> {
  const { data } = await api.post('/personal/media/move', { ids, ...changes })
  return data.moved
}

export async function reorderPersonalMedia(ids: number[]): Promise<void> {
  await api.post('/personal/media/reorder', { ids })
}

/** ურნაში — ერთიც და მონიშნულებიც */
export async function deletePersonalMedia(ids: number[]): Promise<number> {
  if (ids.length === 1) {
    await api.delete(`/personal/media/${ids[0]}`)
    return 1
  }

  const { data } = await api.delete('/personal/media', { data: { ids } })
  return data.trashed
}

/**
 * ვიდეოს **პირდაპირი** მისამართი `<video src>`-ისთვის (Range-ით გადახვევა).
 *
 * ⚠️ blob აქ არ გამოდგება — 300-მეგაბაიტიანი ფაილი მთლიანად მეხსიერებაში
 * ჩაიტვირთებოდა, სანამ დაკვრა დაიწყებოდა. ქუქი იმავე საიტზე მიდის
 * (`localhost:5173` → `localhost:8000`), როგორც ჩამოტვირთული ვიდეოს
 * დამკვრელში (`videoDownloadUrl()`).
 */
export function personalFileUrl(media: Pick<PersonalMedia, 'url'>): string {
  return `${API_URL}/api${media.url}`
}
