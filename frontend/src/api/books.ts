import { api } from '@/lib/api'

/* ============================================================
   წიგნების მოდული (`book`, Tasks §12).

   ⚠️ ორენოვნება **ბრტყელი ველებია** (`title_ka`/`title_en`) — ისევე,
   როგორც `MovieResource`-ზე. ბაზაში translation-ცხრილი განზრახ არაა:
   წყარო (Open Library) ერთენოვანია.
   ============================================================ */

/** „ჩემი ქულის" ჭერი — იგივე რიცხვი `Book::MAX_RATING`-შია */
export const BOOK_MAX_RATING = 10

export const BOOK_FORMATS = ['print', 'ebook', 'audio'] as const
export type BookFormat = (typeof BOOK_FORMATS)[number]

export const BOOK_STATUSES = ['to_read', 'reading', 'read', 'abandoned'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

export interface BookLink {
  label?: string | null
  url: string
}

export interface Book {
  id: number
  title_ka: string | null
  title_en: string | null
  description_ka: string | null
  description_en: string | null
  author: string | null
  publisher: string | null
  isbn: string | null
  year: number | null
  pages: number | null
  language: string | null
  /** §5.7 — წყაროს / წასაკითხი ლინკი (ატვირთულ ფაილს არ ცვლის) */
  source_url: string | null
  genre_id: number | null
  genre?: BookGenre | null
  series_name: string | null
  series_number: number | null
  format: BookFormat
  status: BookStatus
  rating: number | null
  is_favorite: boolean
  progress_page: number | null
  progress_percent: number | null
  /** storage-ის გზა ან გარე URL */
  cover: string | null
  cover_source: 'upload' | 'openlibrary' | null
  links: BookLink[]
  tags: string[]
  openlibrary_id: string | null
  visibility: 'private' | 'public'
  files_count?: number
  notes_count?: number
  created_at: string | null
}

export interface BookFilters {
  q?: string
  status?: string
  format?: string
  favorite?: boolean
  /** ჟანრები — მძიმით გამოყოფილი id-ები */
  genre_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია */
  tag?: string
  author?: string
  series?: string
  sort?: string
}

export interface BookInput {
  title_ka?: string | null
  title_en?: string | null
  description_ka?: string | null
  description_en?: string | null
  author?: string | null
  publisher?: string | null
  isbn?: string | null
  year?: number | null
  pages?: number | null
  language?: string | null
  source_url?: string | null
  genre_id?: number | null
  series_name?: string | null
  series_number?: number | null
  format?: BookFormat
  status?: BookStatus
  rating?: number | null
  tags?: string[]
  links?: BookLink[]
  visibility?: 'private' | 'public'
  openlibrary_id?: string | null
  /** Open Library-ის ყდის id — შენახვისას ჩამოიტვირთება (კვოტაში არ ითვლება) */
  openlibrary_cover_id?: number | null
  cover_url?: string | null
  /** ატვირთული ყდა; მითითების შემთხვევაში multipart-ად იგზავნება */
  cover?: File | null
  remove_cover?: boolean
}

function toFormData(input: BookInput): FormData {
  const fd = new FormData()

  const text: (keyof BookInput)[] = [
    'title_ka', 'title_en', 'description_ka', 'description_en',
    'author', 'publisher', 'isbn', 'language', 'source_url', 'series_name',
    'openlibrary_id', 'cover_url',
  ]
  text.forEach((key) => {
    const value = input[key]
    if (value !== undefined) fd.append(key, (value as string | null) ?? '')
  })

  const numbers: (keyof BookInput)[] = ['year', 'pages', 'genre_id', 'series_number', 'rating']
  numbers.forEach((key) => {
    const value = input[key]
    if (value != null) fd.append(key, String(value))
  })

  if (input.format) fd.append('format', input.format)
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  ;(input.links ?? []).forEach((link, i) => {
    fd.append(`links[${i}][url]`, link.url)
    fd.append(`links[${i}][label]`, link.label ?? '')
  })
  if (input.openlibrary_cover_id) fd.append('openlibrary_cover_id', String(input.openlibrary_cover_id))
  if (input.cover) fd.append('cover', input.cover)
  if (input.remove_cover) fd.append('remove_cover', '1')

  return fd
}

export async function fetchBooks(filters: BookFilters = {}): Promise<Book[]> {
  const { favorite, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}) }
  const { data } = await api.get('/books', { params })
  return data.data
}

export async function fetchBook(id: number): Promise<Book> {
  const { data } = await api.get(`/books/${id}`)
  return data.data
}

export async function createBook(input: BookInput): Promise<Book> {
  const { data } = await api.post('/books', toFormData(input))
  return data.data
}

export async function updateBook(id: number, input: BookInput): Promise<Book> {
  const fd = toFormData(input)
  fd.append('_method', 'PATCH') // multipart-safe method spoofing
  const { data } = await api.post(`/books/${id}`, fd)
  return data.data
}

export async function deleteBook(id: number): Promise<void> {
  await api.delete(`/books/${id}`)
}

export async function toggleBookFavorite(id: number): Promise<Book> {
  const { data } = await api.patch(`/books/${id}/favorite`)
  return data.data
}

export async function setBookStatus(id: number, status: BookStatus): Promise<Book> {
  const { data } = await api.patch(`/books/${id}/status`, { status })
  return data.data
}

/** პროგრესი — გვერდი ან პროცენტი; მეორეს backend თვითონ ითვლის */
export async function setBookProgress(
  id: number,
  progress: { page?: number | null; percent?: number | null },
): Promise<Book> {
  const { data } = await api.patch(`/books/${id}/progress`, progress)
  return data.data
}

/* ---------- Open Library (§12-ის enrichment) ---------- */

export interface BookCandidate {
  key: string
  title: string | null
  author: string | null
  year: number | null
  isbn: string | null
  pages: number | null
  publisher: string | null
  language: string | null
  cover_id: number | null
  description: string | null
  subjects: string[]
}

/**
 * არჩევანის სია — ავტომატურად არაფერი ემთხვევა (TMDB-ის იგივე წესი).
 *
 * ⚠️ **`notice: 'manual_only'` ცარიელი სიის ტოლფასი არ არის** (§5.7): ქართულ
 * შეკითხვაზე წყარო საერთოდ არ იძახება, ე.ი. „ვერაფერი ვიპოვე" ტყუილი
 * იქნებოდა — ფორმა ხელით შევსებას სთავაზობს.
 */
export async function fetchBookCandidates(input: {
  query?: string
  isbn?: string
}): Promise<{ results: BookCandidate[]; notice: string | null }> {
  const { data } = await api.post('/books/lookup/candidates', input)
  return { results: data.results, notice: data.notice ?? null }
}

/** არჩეულის სრული დრაფტი ფორმის შესავსებად — ჩანაწერს არ ქმნის */
export async function fetchBookDraft(key: string): Promise<BookCandidate> {
  const { data } = await api.post('/books/lookup', { key })
  return data.draft
}

/* ---------- ფაილები (pdf/epub) ---------- */

export interface BookFile {
  id: number
  kind: 'book' | 'image' | 'doc'
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export async function fetchBookFiles(bookId: number): Promise<BookFile[]> {
  const { data } = await api.get(`/books/${bookId}/files`)
  return data.data
}

export async function uploadBookFiles(
  bookId: number,
  kind: BookFile['kind'],
  files: File[],
): Promise<BookFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/books/${bookId}/files`, fd)
  return data.data
}

export async function deleteBookFile(id: number): Promise<void> {
  await api.delete(`/book-files/${id}`)
}

/* ---------- ჩანიშვნები და ციტატები ---------- */

export interface BookNote {
  id: number
  body: string
  is_quote: boolean
  page: number | null
  created_at: string | null
  updated_at: string | null
}

export interface BookNoteInput {
  body: string
  is_quote?: boolean
  page?: number | null
}

export async function fetchBookNotes(bookId: number): Promise<BookNote[]> {
  const { data } = await api.get(`/books/${bookId}/notes`)
  return data.data
}

export async function createBookNote(bookId: number, input: BookNoteInput): Promise<BookNote> {
  const { data } = await api.post(`/books/${bookId}/notes`, input)
  return data.data
}

export async function updateBookNote(id: number, input: BookNoteInput): Promise<BookNote> {
  const { data } = await api.patch(`/book-notes/${id}`, input)
  return data.data
}

export async function deleteBookNote(id: number): Promise<void> {
  await api.delete(`/book-notes/${id}`)
}

/* ---------- წიგნის ჟანრები — per-user ლექსიკონი ---------- */

export interface BookGenre {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  books_count?: number
}

export interface BookGenreInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchBookGenres(): Promise<BookGenre[]> {
  const { data } = await api.get('/book-genres')
  return data.data
}

export async function createBookGenre(input: BookGenreInput): Promise<BookGenre> {
  const { data } = await api.post('/book-genres', input)
  return data.data
}

export async function updateBookGenre(id: number, input: BookGenreInput): Promise<BookGenre> {
  const { data } = await api.patch(`/book-genres/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ ჟანრზე გადავიდეს ეს წიგნები (null = ჟანრის გარეშე) */
export async function deleteBookGenre(id: number, moveTo?: number | null): Promise<number> {
  const { data } = await api.delete(`/book-genres/${id}`, {
    data: { move_to: moveTo ?? null },
  })
  return data.moved as number
}

export async function reorderBookGenres(ids: number[]): Promise<BookGenre[]> {
  const { data } = await api.post('/book-genres/reorder', { ids })
  return data.data
}
