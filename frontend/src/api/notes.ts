import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import type { Status } from '@/api/types'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   ჩანაწერების მოდული (`note`, Tasks §13).

   ⚠️ მოდულის key `note`-ია, ცხრილი კი `note_entries` — უნივერსალური `notes`
   2026-09-03-ის წესით აღარ არსებობს და სახელი „სხვა ჩანაწერზე მიმაგრებულ
   ჩანიშვნას" ნიშნავს (`video_notes`, `book_notes`…). API-ის მისამართი
   მაინც `/notes`-ია, რადგან იქ ის მოდულის key-ს მიჰყვება.
   ============================================================ */

/**
 * ⚠️ **სტატუსი per-user ლექსიკონია (Tasks §6.4)** — სია აღარ წერია კოდში.
 * ჩანაწერზე ის ობიექტია (`Status`), შესანახად კი **გასაღები** მიდის.
 */
export type NoteStatus = string

export interface NoteLink {
  label?: string | null
  url: string
}

export interface NoteEntry {
  id: number
  title: string
  description: string | null
  category_id: number | null
  category?: NoteCategory | null
  tags: string[]
  links: NoteLink[]
  /** „როდისთვის მჭირდება" — deadline (§13.1) */
  due_at: string | null
  status: Status | null
  is_favorite: boolean
  /** ⚠️ §13 — პირადი დოკუმენტების მოდული: default ყოველთვის `private` */
  visibility: 'private' | 'public'
  files_count?: number
  reminders_count?: number
  reminders?: NoteReminder[]
  created_at: string | null
  updated_at: string | null
}

export interface NoteFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** კატეგორიები — მძიმით გამოყოფილი id-ები */
  category_id?: string
  /** ტეგები — მძიმით გამოყოფილი სია */
  tag?: string
  /** მხოლოდ ვადაგადაცილებული, ღია ჩანაწერები */
  overdue?: boolean
  sort?: string
}

export interface NoteInput {
  title?: string
  description?: string | null
  category_id?: number | null
  tags?: string[]
  links?: NoteLink[]
  due_at?: string | null
  status?: NoteStatus
  visibility?: 'private' | 'public'
}

export async function fetchNotes(filters: NoteFilters = {}): Promise<Page<NoteEntry>> {
  const { favorite, overdue, all, ...rest } = filters
  // boolean-ები 1/0-ად — Laravel-ის `boolean` წესი "true"-ს არ იღებს
  const params = {
    ...rest,
    ...(favorite ? { favorite: 1 } : {}),
    ...(overdue ? { overdue: 1 } : {}),
    ...(all ? { all: 1 } : {}),
  }
  const { data } = await api.get('/notes', { params })
  return readPage<NoteEntry>(data)
}

export async function fetchNote(id: number): Promise<NoteEntry> {
  const { data } = await api.get(`/notes/${id}`)
  return data.data
}

export async function createNote(input: NoteInput): Promise<NoteEntry> {
  const { data } = await api.post('/notes', input)
  return data.data
}

export async function updateNote(id: number, input: NoteInput): Promise<NoteEntry> {
  const { data } = await api.patch(`/notes/${id}`, input)
  return data.data
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}`)
}

export async function toggleNoteFavorite(id: number): Promise<NoteEntry> {
  const { data } = await api.patch(`/notes/${id}/favorite`)
  return data.data
}

export async function setNoteStatus(id: number, status: NoteStatus): Promise<NoteEntry> {
  const { data } = await api.patch(`/notes/${id}/status`, { status })
  return data.data
}

/* ---------- ატვირთვები: სქრინშოტი · ვიდეო · დოკუმენტი ---------- */

export interface NoteFile {
  id: number
  kind: 'image' | 'video' | 'doc'
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
}

export async function fetchNoteFiles(noteId: number, kind?: NoteFile['kind']): Promise<NoteFile[]> {
  const { data } = await api.get(`/notes/${noteId}/files`, { params: kind ? { kind } : {} })
  return data.data
}

export async function uploadNoteFiles(
  noteId: number,
  kind: NoteFile['kind'],
  files: File[],
): Promise<NoteFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/notes/${noteId}/files`, fd)
  return data.data
}

export async function deleteNoteFile(id: number): Promise<void> {
  await api.delete(`/note-files/${id}`)
}

/* ---------- შეხსენებები (§13.2) ---------- */

/**
 * ⚠️ §5.5 — სრული ნაკრები: ერთჯერადი · ინტერვალი · ყოველდღე · ყოველკვირეული
 * (**რამდენიმე დღე ერთდროულად**) · ყოველთვიური (თვის რიცხვი) · ყოველწლიური.
 */
export const REMINDER_MODES = ['once', 'interval', 'daily', 'weekly', 'monthly', 'yearly'] as const
export type ReminderMode = (typeof REMINDER_MODES)[number]

/**
 * ⚠️ **`email` ამოღებულია (Tasks §8.2, შენი მითითებით: „არ გვინდა").**
 * SMTP ამ პროექტს არ აქვს, ე.ი. არხი მხოლოდ ლოგში აგდებდა წერილს და
 * მომხმარებელი ფიქრობდა, რომ შეხსენება გაიგზავნა. მის ნაცვლად **ჟურნალია**
 * (`GET /api/note-notifications`): ყოველი გასროლა რჩება და აპლიკაციაში ჩანს.
 */
export const REMINDER_CHANNELS = ['browser', 'telegram'] as const
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

export interface NoteReminder {
  id: number
  note_entry_id: number
  mode: ReminderMode
  /** `once` — აბსოლუტური მომენტი (ISO) */
  remind_at: string | null
  /** ⚠️ პერიოდი ველია და არა ჩაშენებული 10/15/20 (§13.2) */
  interval_minutes: number | null
  /** ⚠️ **სიაა** (ეტაპი 7) — `HH:mm`, დღეში რამდენიმე გასროლა */
  times_of_day: string[]
  /** ⚠️ **მასივია** (§5.5) — 0 = კვირა */
  weekdays: number[]
  /** ⚠️ **სიაა** (ეტაპი 7) — 1–31 (მოკლე თვეში ბოლო დღეზე ჩამოდის) */
  days_of_month: number[]
  /** `yearly` — 1–12 */
  month: number | null
  /** ჯერადობა: სულ რამდენჯერ გაისროლოს; `null` = უსასრულოდ */
  repeat_count: number | null
  /** მოქმედების ფანჯარა (ეტაპი 7) — აბსოლუტური მომენტები, ISO */
  starts_at: string | null
  ends_at: string | null
  timezone: string
  channels: ReminderChannel[]
  is_active: boolean
  /** მხოლოდ საჩვენებლად — backend-ი ითვლის */
  next_at: string | null
  last_sent_at: string | null
  sent_count: number
  /** მხოლოდ საერთო სიაში (`fetchAllNoteReminders`) — ბმა ჩანაწერზე */
  note?: { id: number; title: string }
}

export interface NoteReminderInput {
  mode: ReminderMode
  remind_at?: string | null
  interval_minutes?: number | null
  times_of_day?: string[] | null
  weekdays?: number[] | null
  days_of_month?: number[] | null
  month?: number | null
  repeat_count?: number | null
  starts_at?: string | null
  ends_at?: string | null
  timezone?: string
  channels?: ReminderChannel[]
  is_active?: boolean
}

export async function fetchNoteReminders(noteId: number): Promise<NoteReminder[]> {
  const { data } = await api.get(`/notes/${noteId}/reminders`)
  return data.data
}

/**
 * **ყველა შეხსენება ერთ სიაში** (ეტაპი 11.2 — `/notes/reminders`-ის გვერდი).
 *
 * ⚠️ თითო რიგს თან მოჰყვება `note` (id + სათაური) — ეს არის ის „ბმა",
 * რომლის გარეშეც სია უაზროა: „ყოველდღე 09:00" არაფერს ამბობს, სანამ არ
 * ჩანს, *რას* ეხება.
 */
export async function fetchAllNoteReminders(): Promise<NoteReminder[]> {
  const { data } = await api.get('/note-reminders')
  return data.data
}

export async function createNoteReminder(
  noteId: number,
  input: NoteReminderInput,
): Promise<NoteReminder> {
  const { data } = await api.post(`/notes/${noteId}/reminders`, input)
  return data.data
}

export async function updateNoteReminder(
  id: number,
  input: NoteReminderInput,
): Promise<NoteReminder> {
  const { data } = await api.patch(`/note-reminders/${id}`, input)
  return data.data
}

export async function deleteNoteReminder(id: number): Promise<void> {
  await api.delete(`/note-reminders/${id}`)
}

/* ---------- მიწოდება (§13.3) ---------- */

export interface NoteNotification {
  id: number
  note_entry_id: number
  note_reminder_id: number | null
  channel: ReminderChannel
  title: string
  body: string | null
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  scheduled_for: string | null
  sent_at: string | null
  read_at: string | null
}

/**
 * ბრაუზერის რიგი.
 *
 * ⚠️ **GET-ია, თუმცა backend-ზე ვადამოსულ შეხსენებებსაც ისვრის.** ეს განზრახაა:
 * dev-მანქანაზე cron არ დგას, ბრაუზერის შეტყობინება კი §13.3-ის მიხედვით
 * „დამოკიდებულების გარეშე" უნდა მუშაობდეს.
 */
export async function fetchDueNotifications(): Promise<NoteNotification[]> {
  const { data } = await api.get('/note-reminders/due')
  return data.data
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.patch(`/note-notifications/${id}`)
}

/**
 * **შეხსენებების ჟურნალი (Tasks §8.2)** — რაც კი გასროლილა, წაკითხულის ჩათვლით.
 *
 * ⚠️ ეს `fetchDueNotifications()`-ის ტყუპი არ არის: ის **რიგია** (რა უნდა
 * ამოხტეს ახლა), ეს კი **ისტორია**. სწორედ ეს ხურავს ხვრელს, რომელსაც
 * ელფოსტა ხურავდა — დახურული აპი აღარ ნიშნავს დაკარგულ შეხსენებას.
 */
export async function fetchNotificationLog(params: { unread?: boolean; per_page?: number } = {}) {
  const { data } = await api.get<{
    data: NoteNotification[]
    meta?: { total: number; current_page: number; last_page: number }
  }>('/note-notifications', { params })
  return data
}

/* ---------- კატეგორიები — per-user ლექსიკონი ---------- */

export interface NoteCategory {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  note_entries_count?: number
}

export interface NoteCategoryInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function fetchNoteCategories(): Promise<NoteCategory[]> {
  const { data } = await api.get('/note-categories')
  return data.data
}

export async function createNoteCategory(input: NoteCategoryInput): Promise<NoteCategory> {
  const { data } = await api.post('/note-categories', input)
  return data.data
}

export async function updateNoteCategory(
  id: number,
  input: NoteCategoryInput,
): Promise<NoteCategory> {
  const { data } = await api.patch(`/note-categories/${id}`, input)
  return data.data
}

/** წაშლა; `moveTo` — რომელ კატეგორიაზე გადავიდნენ ეს ჩანაწერები (null = უკატეგორიოდ) */
export async function deleteNoteCategory(
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/note-categories/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderNoteCategories(ids: number[]): Promise<NoteCategory[]> {
  const { data } = await api.post('/note-categories/reorder', { ids })
  return data.data
}
