import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { Status } from '@/api/types'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   ბუკმარკების მოდული (`bookmark`, Tasks §18 — `DECISIONS.md` §10).

   ⚠️ გამამდიდრებელი წყარო არ არსებობს (TMDB/RAWG/BGG-ის ანალოგი
   ბმულებზე არ არის). ერთადერთი probe `POST /bookmarks/metadata`-ა,
   რომელიც თვითონ გვერდის `<head>`-ს კითხულობს.

   ⚠️ კატეგორია **ერთია** (`category_id`) და არა pivot: ის საქაღალდეა,
   დანარჩენ ჭრილს `tags` ფარავს (ჩანაწერების მოდულის იგივე წესი).
   ============================================================ */

/**
 * ⚠️ **სტატუსი per-user ლექსიკონია (Tasks §6.4)** — სია აღარ წერია კოდში.
 * ჩანაწერზე ის ობიექტია (`Status`), შესანახად კი **გასაღები** მიდის.
 */
export type BookmarkStatus = string

/**
 * **დამატებითი ბმულის „რა არის"** (Tasks §36.3) — `Bookmark::LINK_KINDS`-ის სარკე
 * (`RegistryConsistencyTest`). აიქონი და ფერი — `lib/bookmarkLinks.ts`.
 */
export const BOOKMARK_LINK_KINDS = ['shop', 'price', 'review', 'video', 'docs', 'other'] as const
export type BookmarkLinkKind = (typeof BOOKMARK_LINK_KINDS)[number]

/** ფასი მხოლოდ ამ ტიპებზე ინახება — `Bookmark::PRICED_LINK_KINDS`-ის სარკე */
export const BOOKMARK_PRICED_LINK_KINDS = ['shop', 'price'] as const

export interface BookmarkLink {
  label: string | null
  url: string
  kind: BookmarkLinkKind
  /** ხელით ჩაწერილი ფასი („49 ₾") — მხოლოდ მაღაზიისა და ფასის ბმულზე */
  price?: string | null
  /** §15-ის მეტა-მონაცემიდან — ბმულის ჩასმისას ივსება */
  favicon_url?: string | null
}

export interface Bookmark {
  id: number
  title: string
  url: string
  /** ჰოსტი `www.`-ის გარეშე — backend-ის `Bookmark::applyUrl()` ავსებს */
  domain: string | null
  description: string | null
  category_id: number | null
  category?: BookmarkCategory | null
  tags: string[]
  /** Tasks §36.3 — დამატებითი ბმულები (მაღაზია, ფასი, მიმოხილვა…) */
  links: BookmarkLink[]
  /** ატვირთული ფოტოს გზა, გალერეიდან არჩეული ფოტოს გზა ან გვერდის og:image */
  image: string | null
  favicon_url: string | null
  /** Tasks §36.4 — ჩემი ფოტოები (`bookmark_files`) და ვებიდან მოტანილი (გალერეა) — სიაში */
  files_count?: number
  photos_count?: number
  status: Status | null
  is_favorite: boolean
  /** Tasks §10 — შესვლების რიცხვი სიაში (`withCount('visits')`) */
  visits_count?: number
  visit_count: number
  visited_at: string | null
  /** 16.5 — საჯარო პროფილის წინაპირობა */
  visibility: 'private' | 'public'
  created_at: string | null
}

export interface BookmarkFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** კატეგორიები — მძიმით გამოყოფილი id-ები (OR — სვეტია) */
  category_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია (AND) */
  tag?: string
  domain?: string
  sort?: string
}

export interface BookmarkInput {
  title: string
  url: string
  description?: string | null
  category_id?: number | null
  tags?: string[]
  /** `undefined` — „არ შეეხო"; ცარიელი სია — „ყველა მოხსენი" */
  links?: BookmarkLink[]
  status?: BookmarkStatus
  visibility?: 'private' | 'public'
  image_url?: string | null
  favicon_url?: string | null
  /** ატვირთული ფოტო; მითითების შემთხვევაში multipart-ად იგზავნება */
  thumbnail?: File | null
  remove_thumbnail?: boolean
}

/** გვერდის `<head>`-იდან ამოკითხული მეტამონაცემი */
export interface LinkMetadata {
  title: string | null
  description: string | null
  image_url: string | null
  favicon_url: string | null
  site_name: string | null
  domain: string | null
}

function toFormData(input: BookmarkInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('url', input.url)
  fd.append('description', input.description ?? '')
  if (input.category_id != null) fd.append('category_id', String(input.category_id))
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  if (input.image_url) fd.append('image_url', input.image_url)
  if (input.favicon_url) fd.append('favicon_url', input.favicon_url)
  /* ⚠️ ცარიელი სია ცარიელ სტრიქონად იგზავნება (კურსისა და ადგილის წესი): multipart-ში
     ცარიელი მასივი საერთოდ არ გადის, ე.ი. ბოლო ტეგის/ბმულის მოხსნა შენახვის შემდეგ
     ჩუმად უკან ბრუნდებოდა. */
  if (input.tags !== undefined && input.tags.length === 0) fd.append('tags', '')
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.links !== undefined && input.links.length === 0) fd.append('links', '')
  ;(input.links ?? []).forEach((link, i) => {
    fd.append(`links[${i}][url]`, link.url)
    fd.append(`links[${i}][label]`, link.label ?? '')
    fd.append(`links[${i}][kind]`, link.kind)
    fd.append(`links[${i}][price]`, link.price ?? '')
    fd.append(`links[${i}][favicon_url]`, link.favicon_url ?? '')
  })
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')
  return fd
}

/** გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const { data } = await api.post('/bookmarks/metadata', { url })
  return data
}

export async function fetchBookmarks(filters: BookmarkFilters = {}): Promise<Page<Bookmark>> {
  const { favorite, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/bookmarks', { params })
  return readPage<Bookmark>(data)
}

export async function fetchBookmark(id: number): Promise<Bookmark> {
  const { data } = await api.get(`/bookmarks/${id}`)
  return data.data
}

export async function createBookmark(input: BookmarkInput): Promise<Bookmark> {
  const { data } = await api.post('/bookmarks', toFormData(input))
  return data.data
}

export async function updateBookmark(id: number, input: BookmarkInput): Promise<Bookmark> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/bookmarks/${id}`, fd)
  return data.data
}

export async function deleteBookmark(id: number): Promise<void> {
  await api.delete(`/bookmarks/${id}`)
}

export async function toggleBookmarkFavorite(id: number): Promise<Bookmark> {
  const { data } = await api.patch(`/bookmarks/${id}/favorite`)
  return data.data
}

export async function setBookmarkStatus(id: number, status: BookmarkStatus): Promise<Bookmark> {
  const { data } = await api.patch(`/bookmarks/${id}/status`, { status })
  return data.data
}

export async function markBookmarkVisited(id: number): Promise<Bookmark> {
  const { data } = await api.post(`/bookmarks/${id}/visited`)
  return data.data
}

/**
 * Tasks §36.5 — ბმულების სიის შეცვლა ფორმის გარეშე („ბმულის დამატება" მენიუდან).
 * ⚠️ JSON `PATCH` და არა multipart: მხოლოდ `links` იგზავნება, დანარჩენ ველებს
 * სერვერი არ ეხება (`BookmarkController::apply()` გასაღების არსებობას ამოწმებს).
 */
export async function setBookmarkLinks(id: number, links: BookmarkLink[]): Promise<Bookmark> {
  const { data } = await api.patch(`/bookmarks/${id}`, { links })
  return data.data
}

/* ---------- ფოტოები — Tasks §36.4 ---------- */

/** ბუკმარკზე მიმაგრებული ჩემი ფოტო („შოპინგის" სკრინშოტი); ვებიდან მოტანილი გალერეაშია */
export interface BookmarkFile {
  id: number
  kind: 'image'
  path: string
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export async function fetchBookmarkFiles(bookmarkId: number): Promise<BookmarkFile[]> {
  const { data } = await api.get(`/bookmarks/${bookmarkId}/files`)
  return data.data
}

export async function uploadBookmarkFiles(bookmarkId: number, files: File[]): Promise<BookmarkFile[]> {
  const fd = new FormData()
  fd.append('kind', 'image')
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/bookmarks/${bookmarkId}/files`, fd)
  return data.data
}

export async function deleteBookmarkFile(id: number): Promise<void> {
  await api.delete(`/bookmark-files/${id}`)
}

/* ---------- კატეგორიები — per-user ლექსიკონი ---------- */

export interface BookmarkCategory {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  bookmarks_count?: number
}

export interface BookmarkCategoryInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchBookmarkCategories(): Promise<BookmarkCategory[]> {
  const { data } = await api.get('/bookmark-categories')
  return data.data
}

export async function createBookmarkCategory(
  input: BookmarkCategoryInput,
): Promise<BookmarkCategory> {
  const { data } = await api.post('/bookmark-categories', input)
  return data.data
}

export async function updateBookmarkCategory(
  id: number,
  input: BookmarkCategoryInput,
): Promise<BookmarkCategory> {
  const { data } = await api.patch(`/bookmark-categories/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ კატეგორიაზე გადავიდნენ (null = კატეგორიის გარეშე) */
export async function deleteBookmarkCategory(
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/bookmark-categories/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderBookmarkCategories(ids: number[]): Promise<BookmarkCategory[]> {
  const { data } = await api.post('/bookmark-categories/reorder', { ids })
  return data.data
}
