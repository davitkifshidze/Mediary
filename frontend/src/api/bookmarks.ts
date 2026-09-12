import { api } from '@/lib/api'
import type { Status } from '@/api/types'

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
  /** ატვირთული ფოტოს გზა ან გვერდის og:image */
  image: string | null
  favicon_url: string | null
  status: Status | null
  is_favorite: boolean
  visit_count: number
  visited_at: string | null
  /** 16.5 — საჯარო პროფილის წინაპირობა */
  visibility: 'private' | 'public'
  created_at: string | null
}

export interface BookmarkFilters {
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
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')
  return fd
}

/** გვერდის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const { data } = await api.post('/bookmarks/metadata', { url })
  return data
}

export async function fetchBookmarks(filters: BookmarkFilters = {}): Promise<Bookmark[]> {
  const { favorite, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}) }
  const { data } = await api.get('/bookmarks', { params })
  return data.data
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
export async function deleteBookmarkCategory(id: number, moveTo?: number | null): Promise<number> {
  const { data } = await api.delete(`/bookmark-categories/${id}`, {
    data: { move_to: moveTo ?? null },
  })
  return data.moved as number
}

export async function reorderBookmarkCategories(ids: number[]): Promise<BookmarkCategory[]> {
  const { data } = await api.post('/bookmark-categories/reorder', { ids })
  return data.data
}
