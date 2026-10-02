import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { Status } from '@/api/types'
import type { LinkMetadata } from '@/api/bookmarks'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   **ინტერფეისიდან შექმნილი მოდულის ჩანაწერები (Tasks §37).**

   ერთი API ყველა პირად მოდულზე — მისამართი `/custom/{key}/…`, სადაც
   `{key}` მოდულის გასაღებია (`c{owner}-{slug}`). სხვისი მოდული სერვერზე
   404-ია, ე.ი. ფრონტს ამის შემოწმება არ სჭირდება — ის მხოლოდ საკუთარს
   ხედავს (`GET /modules`).

   ⚠️ **გამამდიდრებელი წყარო არ არსებობს** (ბუკმარკის წესი): ერთადერთი
   დახმარება ბმულის გვერდის `<head>`-ია (`POST /custom/{key}/metadata`).
   ============================================================ */

export interface CustomCategory {
  id: number
  key: string
  module: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  records_count?: number
}

export interface CustomRecord {
  id: number
  module: string
  title: string
  description: string | null
  url: string | null
  /** ბმულის ჰოსტი `www.`-ის გარეშე */
  domain: string | null
  /** `VideoUrl`-ით ამოცნობილი ბმული — ფლეერისთვის; `null` = უბრალო ბმული */
  platform: string | null
  embed_url: string | null
  /** ატვირთული ფოტოს გზა */
  photo_path: string | null
  /** ბმულის გვერდის og:image (დაშორებული — კვოტას არ ხარჯავს) */
  image_url: string | null
  /** ფოტო ან og:image — ბარათისთვის */
  image: string | null
  category_id: number | null
  category?: CustomCategory | null
  tags: string[]
  status: Status | null
  is_favorite: boolean
  /** Tasks §10 — შესვლების რიცხვი სიაში (`withCount('visits')`) */
  visits_count?: number
  finished_at: string | null
  visibility: 'private' | 'public'
  created_at: string | null
  updated_at: string | null
}

export interface CustomRecordFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** კლასიფიკაცია — მძიმით გამოყოფილი id-ები (OR — სვეტია) */
  category_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია (AND) */
  tag?: string
  sort?: string
}

export interface CustomRecordInput {
  title: string
  url?: string | null
  description?: string | null
  category_id?: number | null
  tags?: string[]
  status?: string
  image_url?: string | null
  /** ატვირთული ფოტო; მითითებისას multipart-ად იგზავნება */
  photo?: File | null
  remove_photo?: boolean
}

/**
 * ⚠️ **`null` ცარიელ სტრიქონად იგზავნება, `undefined` კი საერთოდ არა**
 * (Tasks §4.8): backend `array_key_exists`-ით წერს, ე.ი. გამოტოვებული ველი
 * „არ შეეხო"-ა, ცარიელი კი „გაასუფთავე" (`ConvertEmptyStringsToNull`).
 */
function toFormData(input: CustomRecordInput): FormData {
  const fd = new FormData()
  const put = (key: string, value: string | null | undefined) => {
    if (value !== undefined) fd.append(key, value ?? '')
  }

  put('title', input.title)
  put('url', input.url)
  put('description', input.description)
  put('category_id', input.category_id === undefined ? undefined : input.category_id == null ? null : String(input.category_id))
  if (input.status) fd.append('status', input.status)
  put('image_url', input.image_url)
  if (input.tags !== undefined) {
    // ⚠️ ცარიელი სია ცხადად — სხვაგვარად ბოლო ტეგის წაშლა არ იგზავნებოდა
    if (input.tags.length) input.tags.forEach((tag) => fd.append('tags[]', tag))
    else fd.append('tags', '')
  }
  if (input.photo) fd.append('photo', input.photo)
  if (input.remove_photo) fd.append('remove_photo', '1')
  // ⚠️ ფორმამ მეტამონაცემი უკვე წამოიღო — სერვერი მეორედ აღარ ითხოვს
  fd.append('autofill', '0')

  return fd
}

export async function fetchCustomRecords(key: string, filters: CustomRecordFilters = {}): Promise<Page<CustomRecord>> {
  const { favorite, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get(`/custom/${key}`, { params })
  return readPage<CustomRecord>(data)
}

export async function fetchCustomRecord(key: string, id: number): Promise<CustomRecord> {
  const { data } = await api.get(`/custom/${key}/${id}`)
  return data.data
}

export async function createCustomRecord(key: string, input: CustomRecordInput): Promise<CustomRecord> {
  const { data } = await api.post(`/custom/${key}`, toFormData(input))
  return data.data
}

export async function updateCustomRecord(key: string, id: number, input: CustomRecordInput): Promise<CustomRecord> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/custom/${key}/${id}`, fd)
  return data.data
}

/** ⚠️ ურნაში (Tasks §29) — ფაილები და ველები ადგილზე რჩება */
export async function deleteCustomRecord(key: string, id: number): Promise<void> {
  await api.delete(`/custom/${key}/${id}`)
}

export async function toggleCustomRecordFavorite(key: string, id: number): Promise<CustomRecord> {
  const { data } = await api.patch(`/custom/${key}/${id}/favorite`)
  return data.data
}

export async function setCustomRecordStatus(key: string, id: number, status: string): Promise<CustomRecord> {
  const { data } = await api.patch(`/custom/${key}/${id}/status`, { status })
  return data.data
}

/** ბმულის გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchCustomLinkMetadata(key: string, url: string): Promise<LinkMetadata> {
  const { data } = await api.post(`/custom/${key}/metadata`, { url })
  return data
}

/* ---------- კლასიფიკატორი — ჟანრი / ტიპი / კატეგორია ---------- */

export interface CustomCategoryInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export const customCategoriesKey = (key: string) => ['custom-categories', key] as const

export async function fetchCustomCategories(key: string): Promise<CustomCategory[]> {
  const { data } = await api.get(`/custom/${key}/categories`)
  return data.data
}

export async function createCustomCategory(key: string, input: CustomCategoryInput): Promise<CustomCategory> {
  const { data } = await api.post(`/custom/${key}/categories`, input)
  return data.data
}

export async function updateCustomCategory(key: string, id: number, input: CustomCategoryInput): Promise<CustomCategory> {
  const { data } = await api.patch(`/custom/${key}/categories/${id}`, input)
  return data.data
}

/** წაშლა — გადატანა · ცარიელად დატოვება · ჩანაწერების წაშლაც (`api/dictionary.ts`) */
export async function deleteCustomCategory(
  key: string,
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/custom/${key}/categories/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderCustomCategories(key: string, ids: number[]): Promise<CustomCategory[]> {
  const { data } = await api.post(`/custom/${key}/categories/reorder`, { ids })
  return data.data
}

/* ---------- მასობრივი სტატუსი (Tasks §37.5) ---------- */

/** ⚠️ `ids` ან `from_status` — ცარიელი სკოუპი სერვერზე 422-ია და არასდროს „ყველა" */
export interface CustomBulkStatusInput {
  status: string
  ids?: number[]
  from_status?: string
}

export async function bulkCustomStatus(key: string, input: CustomBulkStatusInput): Promise<number> {
  const { data } = await api.post(`/custom/${key}/bulk-status`, input)
  return data.updated
}

/* ---------- ჩანაწერის საკუთარი ფაილები და ჩანიშვნები (Tasks §37.5) ---------- */

/** `image` = ჩემი ფოტო (ვიტრინა) · `doc` = თანმხლები დოკუმენტი */
export interface CustomRecordFile {
  id: number
  kind: 'image' | 'doc'
  path: string
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export const customRecordFilesKey = (key: string, id: number) => ['custom-record-files', key, id] as const

export async function fetchCustomRecordFiles(
  key: string,
  id: number,
  kind?: CustomRecordFile['kind'],
): Promise<CustomRecordFile[]> {
  const { data } = await api.get(`/custom/${key}/${id}/files`, { params: kind ? { kind } : {} })
  return data.data
}

export async function uploadCustomRecordFiles(
  key: string,
  id: number,
  kind: CustomRecordFile['kind'],
  files: File[],
): Promise<CustomRecordFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/custom/${key}/${id}/files`, fd)
  return data.data
}

/** ⚠️ ურნაში (Tasks §29) — ფაილი დისკზე და კვოტაში რჩება, სანამ საბოლოოდ არ წაიშლება */
export async function deleteCustomRecordFile(key: string, fileId: number): Promise<void> {
  await api.delete(`/custom/${key}/files/${fileId}`)
}

export interface CustomRecordNote {
  id: number
  body: string
  created_at: string | null
  updated_at: string | null
}

export async function fetchCustomRecordNotes(key: string, id: number): Promise<CustomRecordNote[]> {
  const { data } = await api.get(`/custom/${key}/${id}/notes`)
  return data.data
}

export async function createCustomRecordNote(key: string, id: number, body: string): Promise<CustomRecordNote> {
  const { data } = await api.post(`/custom/${key}/${id}/notes`, { body })
  return data.data
}

export async function updateCustomRecordNote(key: string, noteId: number, body: string): Promise<CustomRecordNote> {
  const { data } = await api.patch(`/custom/${key}/notes/${noteId}`, { body })
  return data.data
}

export async function deleteCustomRecordNote(key: string, noteId: number): Promise<void> {
  await api.delete(`/custom/${key}/notes/${noteId}`)
}
