import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'
import type { LinkMetadata } from '@/api/bookmarks'

/* ============================================================
   კურსების მოდული (`course`, FEAT-25).

   ⚠️ გამამდიდრებელი წყარო არ არსებობს (Udemy/Coursera-ს კატალოგი
   დახურულია). ერთადერთი დახმარება `POST /courses/metadata`-ა — **იგივე
   probe**, რომელსაც ბუკმარკი იყენებს; ტიპიც იქიდან მოდის, რომ ორი
   იდენტური აღწერა არ დაიბადოს.

   ⚠️ სტატუსი **enum-ია** და არა per-user ლექსიკონი: „მივატოვე" მეოთხე
   ფაქტია და `StatusDomain`-ის სამ როლს (`todo`/`doing`/`done`) არ უდრის.
   ============================================================ */

export const COURSE_STATUSES = ['to_take', 'taking', 'done', 'dropped'] as const

export type CourseStatus = (typeof COURSE_STATUSES)[number]

export const COURSE_FILE_KINDS = ['certificate', 'image', 'doc'] as const

export type CourseFileKind = (typeof COURSE_FILE_KINDS)[number]

export interface CourseCategory {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  courses_count?: number
}

export interface Course {
  id: number
  title: string
  url: string | null
  /** ჰოსტი `www.`-ის გარეშე — backend-ის `Course::applyUrl()` ავსებს */
  platform: string | null
  instructor: string | null
  description: string | null
  category_id: number | null
  category?: CourseCategory | null
  tags: string[]
  lessons_total: number | null
  lessons_done: number
  /** ⚠️ **გამოთვლადია და არ ინახება**; `null` = გაკვეთილების რაოდენობა უცნობია */
  percent: number | null
  /** ხანგრძლივობა **წუთებში** (§2.5-ის ერთეული მთელ პროექტში) */
  minutes: number | null
  status: CourseStatus
  rating: string | null
  is_favorite: boolean
  /** ატვირთული ესკიზი ან გვერდის og:image */
  image: string | null
  started_at: string | null
  finished_at: string | null
  files_count?: number
  visibility: 'private' | 'public'
  created_at: string | null
}

export interface CourseFile {
  id: number
  kind: CourseFileKind
  path: string
  url: string
  original_name: string
  mime: string | null
  size: number
  created_at: string | null
}

export interface CourseFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** კატეგორიები — მძიმით გამოყოფილი id-ები (OR — სვეტია) */
  category_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია (AND) */
  tag?: string
  platform?: string
  sort?: string
}

export interface CourseInput {
  title: string
  url?: string | null
  instructor?: string | null
  description?: string | null
  category_id?: number | null
  tags?: string[]
  lessons_total?: number | null
  lessons_done?: number | null
  minutes?: number | null
  status?: CourseStatus
  rating?: number | null
  visibility?: 'private' | 'public'
  image_url?: string | null
  /** ატვირთული ესკიზი; მითითების შემთხვევაში multipart-ად იგზავნება */
  thumbnail?: File | null
  remove_thumbnail?: boolean
  started_at?: string | null
  finished_at?: string | null
}

function toFormData(input: CourseInput): FormData {
  const fd = new FormData()
  fd.append('title', input.title)
  fd.append('url', input.url ?? '')
  fd.append('instructor', input.instructor ?? '')
  fd.append('description', input.description ?? '')
  if (input.category_id != null) fd.append('category_id', String(input.category_id))
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  if (input.image_url) fd.append('image_url', input.image_url)
  if (input.lessons_total != null) fd.append('lessons_total', String(input.lessons_total))
  if (input.lessons_done != null) fd.append('lessons_done', String(input.lessons_done))
  if (input.minutes != null) fd.append('minutes', String(input.minutes))
  if (input.rating != null) fd.append('rating', String(input.rating))
  if (input.started_at) fd.append('started_at', input.started_at)
  if (input.finished_at) fd.append('finished_at', input.finished_at)
  /* ⚠️ **ცარიელი სიაც იგზავნება**: backend `has('tags')`-ზე დგას, ე.ი.
     გამოტოვებული გასაღები „არ შეცვალო"-ს ნიშნავს და ბოლო ტეგის მოხსნა
     შეუძლებელი იქნებოდა. */
  if ((input.tags ?? []).length === 0) fd.append('tags', '')
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.thumbnail) fd.append('thumbnail', input.thumbnail)
  if (input.remove_thumbnail) fd.append('remove_thumbnail', '1')

  return fd
}

/* ---------- კურსები ---------- */

export async function fetchCourses(filters: CourseFilters = {}): Promise<Page<Course>> {
  const { favorite, all, ...rest } = filters
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/courses', { params })
  return readPage<Course>(data)
}

export async function fetchCourse(id: number): Promise<Course> {
  const { data } = await api.get(`/courses/${id}`)
  return data.data
}

/** ბმულის მეტამონაცემი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchCourseMetadata(url: string): Promise<LinkMetadata> {
  const { data } = await api.post('/courses/metadata', { url })
  return data
}

export async function createCourse(input: CourseInput): Promise<Course> {
  const { data } = await api.post('/courses', toFormData(input))
  return data.data
}

export async function updateCourse(id: number, input: CourseInput): Promise<Course> {
  const fd = toFormData(input)
  fd.append('_method', 'PUT') // method spoofing — multipart-safe
  const { data } = await api.post(`/courses/${id}`, fd)
  return data.data
}

export async function deleteCourse(id: number): Promise<void> {
  await api.delete(`/courses/${id}`)
}

export async function toggleCourseFavorite(id: number): Promise<Course> {
  const { data } = await api.patch(`/courses/${id}/favorite`)
  return data.data
}

export async function setCourseStatus(id: number, status: CourseStatus): Promise<Course> {
  const { data } = await api.patch(`/courses/${id}/status`, { status })
  return data.data
}

/** გავლილი გაკვეთილები — სტატუსს backend თვითონ ათანხმებს (`syncProgress()`) */
export async function setCourseProgress(id: number, lessonsDone: number): Promise<Course> {
  const { data } = await api.patch(`/courses/${id}/progress`, { lessons_done: lessonsDone })
  return data.data
}

/* ---------- ფაილები ---------- */

export async function fetchCourseFiles(courseId: number): Promise<CourseFile[]> {
  const { data } = await api.get(`/courses/${courseId}/files`)
  return data.data
}

export async function uploadCourseFiles(
  courseId: number,
  kind: CourseFileKind,
  files: File[],
): Promise<CourseFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/courses/${courseId}/files`, fd)
  return data.data
}

export async function deleteCourseFile(id: number): Promise<void> {
  await api.delete(`/course-files/${id}`)
}

/* ---------- კატეგორიები (per-user ლექსიკონი) ---------- */

export async function fetchCourseCategories(): Promise<CourseCategory[]> {
  const { data } = await api.get('/course-categories')
  return data.data
}

export interface CourseCategoryInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function createCourseCategory(input: CourseCategoryInput): Promise<CourseCategory> {
  const { data } = await api.post('/course-categories', input)
  return data.data
}

export async function updateCourseCategory(
  id: number,
  input: CourseCategoryInput,
): Promise<CourseCategory> {
  const { data } = await api.put(`/course-categories/${id}`, input)
  return data.data
}

export async function deleteCourseCategory(
  id: number,
  opts: DictionaryRemoval = {},
): Promise<DictionaryRemoved> {
  const res = await api.delete(`/course-categories/${id}`, { data: removalBody(opts) })
  return readRemoved(res.data)
}

export async function reorderCourseCategories(ids: number[]): Promise<CourseCategory[]> {
  const { data } = await api.post('/course-categories/reorder', { ids })
  return data.data
}
