import { api, ensureCsrfCookie } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import type { Settings } from '@/lib/settings'

/* ============================================================
   ავტორიზაცია, პროფილი, მოდულები, მოთხოვნები და ადმინ-პანელი (I7).
   ============================================================ */

export interface User {
  id: number
  name: string
  first_name: string | null
  last_name: string | null
  username: string | null
  email: string
  display_name: string
  avatar_path: string | null
  /** როლის `key` — სისტემურები: `super_admin` · `user` (Tasks 1.6) */
  role: string
  role_id: number | null
  role_name_ka: string | null
  role_name_en: string | null
  is_super_admin: boolean
  /**
   * მოდულის შიდა უფლებები (19.8): `{ movie: ['view','create'], '*': ['view'] }`.
   * `null` = შეზღუდვის გარეშე (სუპერ-ადმინი).
   */
  permissions?: Record<string, string[]> | null
  /**
   * Tasks 1.6 — რომელ ადმინის სექციას ხედავს: `users` · `roles` · `requests`.
   * ⚠️ ბმულების დამალვა **ამით** ხდება და აღარ `is_super_admin`-ით: წვდომა
   * როლიდანაც შეიძლება მოვიდეს.
   */
  admin_resources?: string[]
  is_active: boolean
  /** Tasks 16.1 — საჯარო პროფილი; `private` default (არავინ ხდება საჯარო ჩუმად) */
  profile_visibility?: 'private' | 'public'
  bio?: string | null
  settings: Partial<Settings> | null
  /** FEAT-16 — მხოლოდ ფაქტი; საიდუმლო და აღდგენის კოდები აქ არასდროს მოდის */
  two_factor_enabled?: boolean
  /** საიდუმლო შექმნილია, კოდი ჯერ არ დადასტურებულა — შესვლა ჯერ არ იცვლება */
  two_factor_pending?: boolean
  created_at: string | null
  /** ადმინის მიერ მინიჭებული მოდულები */
  modules?: string[]
  /** რომელი გამორთო თვითონ (K13) — მინიჭებული რჩება */
  hidden_modules?: string[]
  movies_count?: number
  series_count?: number
  videos_count?: number
  /** L4 — ადმინის სიაში სრული ინფო (`GET /admin/users`) */
  favorites_count?: number
  last_activity?: string | null
  /**
   * 17.3 — დაქეშილი მრიცხველი (`used`/`quota`).
   *
   * ⚠️ **`files`/`bytes` მხოლოდ ერთი ანგარიშის გვერდზეა** (Tasks PERF-14):
   * ისინი დისკიდან გადათვლილი ინვენტარია და თითო მომხმარებელზე ~30 query
   * ღირდა — სია კი მათ არც ხატავდა. `GET /admin/users/{id}`-ის პასუხის
   * ზედა დონის `storage` ისევ ატარებს მათ (`AdminUserDetail`).
   */
  storage?: StorageUsage
}

/* ---------- საცავი (Tasks 17.1/17.3) ---------- */

export interface StorageUsage {
  used: number
  quota: number
  remaining: number
  percent: number
  /** გაფრთხილების ზღვრები backend-იდან (ერთი წყარო) */
  warn_at: number
  critical_at: number
  /** მოდულებად დაშლა — მხოლოდ `GET /storage`-ზე */
  modules?: Record<string, number>
  /**
   * §17.2 — მოდულებზე გადანაწილებული ლიმიტები.
   * ⚠️ სიაში მხოლოდ **ცხადად დაყენებული** ლიმიტებია: გასაღების არარსებობა
   * ნიშნავს „ლიმიტი არ აქვს" და არა „0 ბაიტი".
   */
  allocations?: Record<string, number>
  allocated?: number
  /** გაუნაწილებელი ნაშთი — საერთო „აუზი", საიდანაც ულიმიტო მოდულები ხარჯავენ */
  unallocated?: number
}

/**
 * §17.2 — ლიმიტების ჩაწერა. `null` ლიმიტს **ხსნის** (0 კი „აკრძალვაა").
 * ჯამის შემოწმება backend-ზეა — 422 `allocation_exceeds_quota`.
 */
export async function saveStorageAllocations(
  allocations: Record<string, number | null>,
): Promise<StorageUsage> {
  const { data } = await api.put('/storage/allocations', { allocations })
  return data
}

export async function fetchStorageUsage(): Promise<StorageUsage> {
  const { data } = await api.get('/storage')
  return data
}

/** სრული გადათვლა დისკიდან — მაშინ, როცა მრიცხველი ეჭვქვეშაა */
export async function recalculateStorage(): Promise<StorageUsage> {
  const { data } = await api.post('/storage/recalculate')
  return data
}

/* ---------- საცავის მართვა (Tasks 17.5) ---------- */

export interface StorageFiles {
  files: UploadedFile[]
  total: number
  bytes: number
  /** მოდულების ჯამები — ფილტრის ჩიპებს რიცხვები სჭირდება */
  modules: Record<string, { files: number; bytes: number }>
}

/** ატვირთვების მედია-ბიბლიოთეკა — ადმინის სიის იგივე წყარო (`StorageMeter::files()`) */
export async function fetchStorageFiles(limit = 2000): Promise<StorageFiles> {
  const { data } = await api.get('/storage/files', { params: { limit } })
  return data
}

/** სად მოქმედებს წაშლა/ჩამოტვირთვა — მონიშნულებზე თუ ყველაფერზე (§6.2) */
export type StorageScope = { paths: string[] } | { all: true }

/** ერთი საკუთარი ატვირთვის წაშლა; აბრუნებს განახლებულ მდგომარეობას */
export async function deleteStorageFile(path: string): Promise<StorageUsage> {
  const { data } = await api.delete('/storage/files', { data: { path } })
  return data
}

/**
 * **§6.2 — მონიშნულების ან ყველას წაშლა.** იმავე endpoint-ია, რაც ერთ
 * ფაილზე: წესი („მხოლოდ ის, რაც `StorageMeter::files()`-შია") ერთ ადგილას რჩება.
 */
export async function deleteStorageFiles(
  scope: StorageScope,
): Promise<StorageUsage & { deleted: number; freed: number }> {
  const { data } = await api.delete('/storage/files', { data: scope })
  return data
}

/**
 * **§6.2 — მონიშნულების ან ყველას ჩამოტვირთვა ერთ zip-ად.**
 *
 * ⚠️ `blob` და არა json: პასუხი ფაილია. ⚠️ `POST`, რადგან მონიშვნა ასეულ
 * გზას შეიძლება შეიცავდეს და query-string-ს ეს არ ჯდება.
 */
export async function downloadStorageFiles(scope: StorageScope): Promise<void> {
  const res = await api.post('/storage/files/download', scope, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  /* ⚠️ `formatDate(…, 'iso')` და არა `toISOString()` (Tasks BUG-15): ეს
     უკანასკნელი **UTC-ზე გადადის**, ე.ი. თბილისში 00:00–04:00 ექსპორტი
     გუშინდელი თარიღით დაინომრებოდა. სწორედ ამისთვის არსებობს `lib/dates.ts`-ის
     `sv-SE` წესი და `dates.test.ts`. */
  a.download = `mediary-files-${formatDate(new Date(), 'iso')}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // ⚠️ ბლობი ხელით უნდა გათავისუფლდეს, თორემ არქივი მეხსიერებაში რჩება
  URL.revokeObjectURL(url)
}

/** ობოლი ფაილი — დისკზეა, ბაზაში არავინ იხსენიებს */
export interface OrphanFile {
  path: string
  folder: string
  size: number
  modified_at: string | null
}

export interface StorageOrphans {
  files: OrphanFile[]
  total: number
  bytes: number
}

/** ⚠️ გლობალური ოპერაცია (ფაილს მფლობელი აღარ აქვს) → მხოლოდ super_admin */
export async function fetchStorageOrphans(): Promise<StorageOrphans> {
  const { data } = await api.get('/storage/orphans')
  return data
}

export async function cleanStorageOrphans(): Promise<{ files: number; bytes: number }> {
  const { data } = await api.post('/storage/orphans/clean')
  return data
}

export interface ModuleInfo {
  id: number
  key: string
  name_ka: string
  name_en: string
  description_ka: string | null
  description_en: string | null
  icon: string
  /** გვერდის ჰედერის ფონი (§2.1) — `#rrggbb` ან `null` = ნეიტრალური */
  color: string | null
  route_base: string
  api_base: string
  morph_alias: string | null
  is_active: boolean
  enabled_by_default: boolean
  sort_order: number
  /** რამდენს აქვს **რეალურად ჩართული** (თვითონ გამორთული არ ითვლება) */
  users_count?: number
  /** ვის აქვს მინიჭებული — ადმინის ტაბი (K14/L3) */
  users?: {
    id: number
    display_name: string
    avatar_path: string | null
    role: string
    is_super_admin: boolean
    /** super_admin-ს pivot-ის გარეშე აქვს */
    implicit: boolean
    /** თვითონ გამორთო (K13) — უფლება რჩება */
    hidden_by_user: boolean
    enabled_at: string | null
  }[]
  /** ჩართულია ჩემთვის (GET /modules) */
  enabled?: boolean
  /** უფლება აქვს (ადმინმა ჩართო) — `enabled=false && granted=true` ნიშნავს „თვითონ გამოვრთე" */
  granted?: boolean
  /** ბოლო მოთხოვნის სტატუსი, თუ არსებობს */
  request_status?: 'pending' | 'approved' | 'rejected' | null
  /** per-user per-module პარამეტრები (`module_user.settings`) */
  user_settings?: Record<string, unknown>
  /** Tasks 16.1 — ჩანს თუ არა მოდული ჩემს საჯარო პროფილზე */
  is_public?: boolean
  /** შეიძლება თუ არა საერთოდ გასაჯაროება — `note`-ზე **არასდროს** (16.5) */
  shareable?: boolean
}

export interface ApprovalRequestItem {
  id: number
  type: 'module_access' | 'genre_delete' | 'storage_increase'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  payload: Record<string, unknown> | null
  created_at: string | null
  reviewed_at: string | null
  review_note: string | null
  user?: { id: number; display_name: string; email: string }
  reviewer?: { id: number; display_name: string } | null
  module?: { id: number; key: string; name_ka: string; name_en: string; icon: string } | null
  genre?: { id: number; slug: string; name_ka: string | null; name_en: string | null } | null
}

/* ---------- auth ---------- */

export interface LoginInput {
  login: string
  password: string
  remember?: boolean
  /**
   * FEAT-16 — TOTP ან აღდგენის კოდი.
   * ⚠️ პაროლი კოდთან ერთად **ხელახლა** იგზავნება: სერვერზე „ნახევრად
   * შესული" მდგომარეობა განზრახ არ არსებობს (მისი ვადა და გაუქმება ცალკე
   * დასაცავი იქნებოდა), ე.ი. მეორე ნაბიჯი იმავე მოთხოვნის გამეორებაა.
   */
  code?: string
}

export interface RegisterInput {
  name: string
  first_name?: string
  last_name?: string
  username: string
  email: string
  password: string
  password_confirmation: string
}

export async function login(input: LoginInput): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post('/auth/login', input)
  return data.data
}

export async function register(input: RegisterInput): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post('/auth/register', input)
  return data.data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get('/auth/me')
  return data.data
}

/** პროფილი — multipart (ავატარი), method spoofing-ით */
export async function updateProfile(payload: FormData): Promise<User> {
  payload.append('_method', 'PATCH')
  const { data } = await api.post('/auth/profile', payload)
  return data.data
}

export async function updatePassword(input: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<void> {
  await api.patch('/auth/password', input)
}

export async function saveSettings(settings: Settings): Promise<void> {
  await api.put('/auth/settings', { settings })
}

/* ---------- მოდულები / მოთხოვნები ---------- */

/* ---------- ორფაქტორიანი შესვლა და აღდგენა (FEAT-16) ---------- */

export interface TwoFactorStart {
  secret: string
  /** `otpauth://` — QR-ისთვის და ხელით ჩასაწერად */
  uri: string
}

export async function startTwoFactor(password: string): Promise<TwoFactorStart> {
  const { data } = await api.post('/auth/2fa', { password })
  return data
}

export async function confirmTwoFactor(code: string): Promise<string[]> {
  const { data } = await api.post('/auth/2fa/confirm', { code })
  return data.recovery_codes
}

export async function regenerateRecoveryCodes(password: string): Promise<string[]> {
  const { data } = await api.post('/auth/2fa/recovery-codes', { password })
  return data.recovery_codes
}

export async function disableTwoFactor(password: string): Promise<void> {
  await api.delete('/auth/2fa', { data: { password } })
}

export interface ResetLinkInfo {
  url: string
  expires_at: string
  hours: number
}

/** ადმინის ერთჯერადი ბმული — ⚠️ ნედლი ტოკენი მხოლოდ ამ პასუხშია */
export async function createResetLink(userId: number): Promise<ResetLinkInfo> {
  const { data } = await api.post(`/admin/users/${userId}/reset-link`)
  return data
}

export interface ResetTarget {
  display_name: string
  username: string | null
}

/** ⚠️ ორივე ავტორიზაციის გარეთაა — ბმულით შემოსული ვერ შედის */
export async function fetchResetTarget(token: string): Promise<ResetTarget> {
  const { data } = await api.get(`/auth/reset/${encodeURIComponent(token)}`)
  return data
}

export async function submitReset(
  token: string,
  password: string,
  password_confirmation: string,
): Promise<void> {
  await ensureCsrfCookie()
  await api.post(`/auth/reset/${encodeURIComponent(token)}`, { password, password_confirmation })
}

export async function fetchModules(): Promise<ModuleInfo[]> {
  const { data } = await api.get('/modules')
  return data.data
}

export async function fetchMyRequests(): Promise<ApprovalRequestItem[]> {
  const { data } = await api.get('/requests')
  return data.data
}

export async function requestModule(moduleKey: string, message?: string): Promise<ApprovalRequestItem> {
  const { data } = await api.post('/requests/module', { module_key: moduleKey, message })
  return data.data
}

/**
 * 17.4 — ლიმიტის გაზრდის მოთხოვნა. `requestedBytes` **სასურველი სრული
 * ლიმიტია** და არა მატება (იხ. `ApprovalRequestController`).
 */
export async function requestStorageIncrease(
  requestedBytes: number,
  message?: string,
): Promise<ApprovalRequestItem> {
  const { data } = await api.post('/requests/storage', {
    requested_bytes: requestedBytes,
    message,
  })
  return data.data
}

export async function cancelRequest(id: number): Promise<void> {
  await api.delete(`/requests/${id}`)
}

/** მოდულის ჩართვა/გამორთვა საკუთარი თავისთვის (K13) */
export async function setModuleEnabled(key: string, enabled: boolean): Promise<void> {
  await api.patch(`/modules/${key}`, { enabled })
}

/**
 * per-user per-module პარამეტრები (`module_user.settings`).
 * ანგარიშის დონის პარამეტრებისგან (`users.settings`) განსხვავებული ფენაა —
 * მაგ. გალერეის ფოტოს ზომა/რაოდენობა (Tasks 10).
 */
export async function updateModuleSettings(
  key: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await api.put(`/modules/${key}/settings`, { settings })
}

/* ---------- ველების კონსტრუქტორი (Tasks §6, ფაზა 1) ---------- */

/**
 * მოდულის **არჩევითი** ველი. ⚠️ სავალდებულო ველები (ვიდეოს სახელი/ბმული)
 * აქ საერთოდ არ ჩნდება — მათი გამორთვა ჩაწერას გატეხავდა
 * (იხ. `docs/6-field-builder.md`).
 */
export interface ModuleField {
  key: string
  type: string
  enabled: boolean
  /**
   * ⚠️ **ფორმის დისციპლინაა და არა სქემის შეზღუდვა** — ველი კატალოგში სწორედ
   * იმიტომაა, რომ ბაზაზე არჩევითია. backend მას არ ამოწმებს; ფორმა იცავს.
   */
  required: boolean
  /**
   * §16 — ჩანს თუ არა ველი **საჯარო პროფილზე** და დამთხვევებში.
   * ⚠️ წყვეტს ჩანაწერის **მფლობელი** და არა მნახველი.
   */
  public: boolean
  /**
   * §6.5 — ველი, რომლის გარეშე ჩანაწერი **ვერ ჩაიწერება** (ვიდეოს `url`,
   * ჩანაწერის სახელი). სიაში ჩანს, რომ სია არ ტყუოდეს, მაგრამ
   * ჩართულობა/სავალდებულოობა არ იმართება — backend-იც იგივეს ამბობს
   * (`FieldCatalog::for()` აიძულებს `true`-ს).
   */
  locked: boolean
  /**
   * §4 — **ჩაკეტვა მოხსნილია** (`super_admin`-ის ცხადი არჩევანი).
   *
   * ⚠️ `locked` ამის შემდეგაც `true` რჩება: ის სქემაზე ამბობს სიმართლეს,
   * ე.ი. ინტერფეისს შეუძლია თქვას „ჩაკეტილია, მაგრამ შენ მოხსენი" და
   * გაფრთხილება არ იკარგება.
   */
  unlocked: boolean
  /**
   * ⚠️ **§6.5-ის შემდეგ რიგი მხოლოდ backend-ისაა** — UI მას აღარ ცვლის და
   * `PUT` მას აღარ იღებს. მნიშვნელობა კითხვისთვის რჩება (ფორმის რიგი).
   */
  sort_order: number
  /** `null` = გადაწერილი არაა, ტექსტი ლოკალიზაციიდან უნდა აიღო */
  label_ka: string | null
  label_en: string | null
  placeholder_ka: string | null
  placeholder_en: string | null
  /**
   * §6 ფაზა 3 — user-ის მიერ დამატებული ველი (და არა ჩაშენებული).
   * ⚠️ ლეიბლი მას ლოკალიზაციაში **არ აქვს**: ნაგულისხმევი `key`-ია.
   */
  custom?: boolean
}

/* ---------- §6, ფაზა 3 — მორგებული ველები ---------- */

/** მორგებული ველის ტიპები (`file` — ფაზა 4b, კვოტაზე გადის) */
export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'list',
  'switch',
  'link',
  'file',
] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

/** მოდულები, რომლებსაც მორგებული ველები აქვთ — backend-ის იგივე სია */
export const CUSTOM_FIELD_MODULES = [
  'movie',
  'series',
  'video',
  'song',
  'book',
  'board_game',
  'game',
  'note',
  'bookmark',
] as const

export interface CustomFieldDefinition {
  /** ცარიელი = ახალი ველი; key-ს backend სახელიდან ქმნის და აღარ ცვლის */
  key: string
  type: CustomFieldType
  label_ka: string | null
  label_en: string | null
  placeholder_ka: string | null
  placeholder_en: string | null
  enabled: boolean
  required: boolean
  sort_order: number
}

/**
 * `ფაილი` ტიპის მნიშვნელობა (ფაზა 4b).
 * ⚠️ **`url` API-ს გზაა და არა `/storage/…`** — `notes/fields` პრივატულ დისკზეა
 * (§17.5) და ფაილი მხოლოდ მფლობელობაშემოწმებული route-იდან გაიცემა.
 */
export interface CustomFieldFile {
  /**
   * ⚠️ **სავალდებულოა §7.3-ის შემდეგ** — ერთ ველზე რამდენიმე ფაილია და
   * სახელი უნიკალური არაა, ე.ი. „წაშალე ეს" სხვანაირად ვერ ითქმის.
   */
  id: number
  name: string | null
  mime: string | null
  size: number
  url: string
}

/** ერთი ჩანაწერის მნიშვნელობები — `field_key => value` */
export type CustomFieldValues = Record<string, unknown>

export async function fetchCustomFields(key: string): Promise<CustomFieldDefinition[]> {
  const { data } = await api.get(`/modules/${key}/custom-fields`)
  return data.fields
}

/** ⚠️ **მთელი სია მიდის** — წაშლა = სიიდან ამოგდება (playlist-ის იგივე ნიმუში) */
export async function saveCustomFields(
  key: string,
  fields: Array<Partial<CustomFieldDefinition> & { type: CustomFieldType }>,
): Promise<CustomFieldDefinition[]> {
  const { data } = await api.put(`/modules/${key}/custom-fields`, { fields })
  return data.fields
}

export async function fetchCustomFieldValues(
  module: string,
  id: number,
): Promise<CustomFieldValues> {
  const { data } = await api.get(`/custom-fields/${module}/${id}`)
  return data.values
}

export async function saveCustomFieldValues(
  module: string,
  id: number,
  values: CustomFieldValues,
): Promise<CustomFieldValues> {
  const { data } = await api.put(`/custom-fields/${module}/${id}`, { values })
  return data.values
}

/* ---------- §6, ფაზა 4b — `ფაილი` ტიპი ---------- */

/**
 * ⚠️ **ატვირთვა ცალკე endpoint-ია და მაშინვე ხდება** (და არა მონახაზში
 * ინახება): მნიშვნელობების `PUT` მთელ სიას იღებს და ფაილს ცარიელ
 * მნიშვნელობად წაიკითხავდა — ე.ი. ჩვეულებრივი „შენახვა" წაშლიდა.
 */
/** ერთ ველზე დაშვებული ფაილების ჭერი — იგივე რიცხვი `CustomFields::FILE_MAX_COUNT`-შია */
export const CUSTOM_FIELD_MAX_FILES = 10

export async function uploadCustomFieldFile(
  module: string,
  id: number,
  key: string,
  files: File[],
): Promise<CustomFieldFile[]> {
  const form = new FormData()
  form.append('key', key)
  // §7.3 — ერთი რექვესთი მთელ პარტიაზე; backend `files[]`-საც იღებს და `file`-საც
  files.forEach((file) => form.append('files[]', file))

  const { data } = await api.post(`/custom-fields/${module}/${id}/file`, form)
  return data.value
}

/**
 * ფაილის მოშორება.
 *
 * ⚠️ **`fileId`-ის გარეშე ველის ყველა ფაილი მიდის** — ეს backend-ის ქცევაა
 * და არა შემთხვევითობა: ძველი ერთფაილიანი მისამართი უცვლელად მუშაობს.
 */
export async function deleteCustomFieldFile(
  module: string,
  id: number,
  key: string,
  fileId?: number,
): Promise<void> {
  await api.delete(
    `/custom-fields/${module}/${id}/file/${key}${fileId == null ? '' : `/${fileId}`}`,
  )
}

/** გადახრები, რომლებსაც `PUT` იღებს (ცარიელი ტექსტი გადახრას შლის) */
/**
 * ⚠️ **`sort_order` აქ განზრახ არაა** (§6.5): დალაგების UI მოიხსნა და
 * თანმიმდევრობა კატალოგისაა — backend-იც აღარ იღებს ამ ატრიბუტს.
 */
export type ModuleFieldPatch = Partial<
  Pick<
    ModuleField,
    | 'enabled'
    | 'required'
    | 'public'
    | 'unlocked'
    | 'label_ka'
    | 'label_en'
    | 'placeholder_ka'
    | 'placeholder_en'
  >
>

export async function fetchModuleFields(key: string): Promise<ModuleField[]> {
  const { data } = await api.get(`/modules/${key}/fields`)
  return data.fields
}

/** ⚠️ `PUT` — POST-ს backend-ის `permission:` middleware `create`-ად წაიკითხავდა */
export async function saveModuleFields(
  key: string,
  fields: Record<string, ModuleFieldPatch>,
): Promise<ModuleField[]> {
  const { data } = await api.put(`/modules/${key}/fields`, { fields })
  return data.fields
}

/**
 * **ველების კონფიგის ნაგულისხმევზე დაბრუნება** (§4).
 *
 * ⚠️ `DELETE` — `POST`-ს `permission:` middleware `create`-ად წაიკითხავდა,
 * `delete` კი ზუსტად ის უფლებაა, რასაც ეს მოქმედება ითხოვს.
 */
export async function resetModuleFields(key: string): Promise<ModuleField[]> {
  const { data } = await api.delete(`/modules/${key}/fields`)
  return data.fields
}

/* ---------- ადმინი ---------- */

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get('/admin/users')
  return data.data
}

/**
 * ერთი ატვირთული ფაილი (Tasks 1.3 / 17.5).
 * ⚠️ ორივე კავშირი **`StorageMeter::files()`-ის სარკეა** — იქ დამატებული
 * `kind`/`owner_type` აქაც უნდა ჩაიწეროს, თორემ `storage.fileKind.*`
 * ლეიბლი და წაშლის გზა ჩუმად ამოვარდება (ასე გამოჩნდა `field` 2026-09-06-ზე).
 */
export interface UploadedFile {
  kind: 'avatar' | 'poster' | 'cover' | 'thumbnail' | 'image' | 'video' | 'doc' | 'field'
  /** მოდულის `key` (ან `account` ავატარზე, `chat` მიმაგრებაზე) */
  module: string
  /** ჩანაწერი, რომელსაც ფაილი ჰკიდია — წაშლა ამით მიდის სწორ გზაზე */
  owner_type:
    | 'user'
    | 'movie'
    | 'series'
    | 'video'
    | 'song'
    | 'book'
    | 'board_game'
    | 'game'
    | 'bookmark'
    | 'video_file'
    // §7.4 — სიმღერის სექციის ფაილი
    | 'song_file'
    | 'book_file'
    | 'board_game_file'
    | 'game_file'
    | 'note_entry_file'
    | 'gallery_image'
    | 'message'
    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილი */
    | 'field_value'
  /**
   * პრივატულ დისკზეა (§17.5) — `/storage/*` მას **ვერ ხედავს**.
   * ⚠️ ამას backend ამბობს (`StorageFolder::isPrivate()`) და არა ფრონტი:
   * ფესვების სიის აქ გამეორება ერთ დღეს პრივატულ ფაილს საჯარო url-ით
   * გამოაჩენდა.
   */
  private: boolean
  owner_id: number | null
  path: string
  name: string | null
  size: number
  mime: string | null
  created_at: string | null
}

/** მომხმარებლის შიდა გვერდი (K14) */
export interface UserDetail {
  user: User
  content: {
    movies: number
    series: number
    videos: number
    favorites: number
  }
  /** 17.1 — დაქეშილი მრიცხველი + დისკიდან გადათვლილი ჯამი და მოდულების ჭრილი */
  storage: StorageUsage & {
    files: number
    bytes: number
    modules: Record<string, number>
  }
  /** ატვირთული ფაილები — ყველაზე მძიმეები თავში, მაქსიმუმ 200 (1.3) */
  files: UploadedFile[]
  last_activity: string | null
  modules: {
    id: number
    key: string
    name_ka: string
    name_en: string
    icon: string
    is_active: boolean
    granted: boolean
    enabled: boolean
    /** მომხმარებელმა თვითონ დამალა (K13) */
    hidden_by_user: boolean
    enabled_at: string | null
  }[]
  requests: ApprovalRequestItem[]
}

export async function fetchUserDetail(id: number): Promise<UserDetail> {
  const { data } = await api.get(`/admin/users/${id}`)
  return data
}

export async function updateUser(
  id: number,
  input: {
    role_id?: number
    is_active?: boolean
    storage_quota_bytes?: number
    /** Tasks 1.3 (🔗 16) — abuse-ის შემთხვევაში პროფილის იძულებით დახურვა */
    profile_visibility?: 'private' | 'public'
  },
): Promise<User> {
  const { data } = await api.patch(`/admin/users/${id}`, input)
  return data.data
}

/* ---------- როლები და უფლებები (Tasks 1.6) ---------- */

export interface Role {
  id: number
  key: string
  name_ka: string
  name_en: string
  /** `{ movie: ['view','create'], '*': ['view'] }`; `null` = შეზღუდვის გარეშე */
  permissions: Record<string, string[]> | null
  /** სისტემური როლი — არ იშლება */
  is_system: boolean
  is_super_admin: boolean
  sort_order: number
  users_count?: number
  /** უფლების ოთხი მოქმედება backend-იდან — მატრიცის სვეტები */
  actions: string[]
}

export interface RoleInput {
  name_ka: string
  name_en: string
  permissions?: Record<string, string[]>
}

export async function fetchRoles(): Promise<Role[]> {
  const { data } = await api.get('/admin/roles')
  return data.data
}

/** მისანიჭებელი როლი — მხოლოდ id და სახელი (Tasks GAP-10) */
export interface AssignableRole {
  id: number
  key: string
  name_ka: string
  name_en: string
}

/**
 * **`/users/{id}`-ის როლის სელექტისთვის (Tasks GAP-10).**
 *
 * ⚠️ `fetchRoles()` `admin_access:roles`-ის უკანაა, ე.ი. `admin:users`-ის
 * მქონე ადმინი (როლების უფლების გარეშე) 403-ს იღებდა და სელექტი **ჩუმად
 * ცარიელი** რჩებოდა. ეს endpoint მომხმარებლების სექციაშია და მხოლოდ
 * სახელებს აბრუნებს — უფლებების მატრიცა მას არ სჭირდება.
 */
export async function fetchAssignableRoles(): Promise<AssignableRole[]> {
  const { data } = await api.get('/admin/assignable-roles')
  return data.data
}

export async function createRole(input: RoleInput): Promise<Role> {
  const { data } = await api.post('/admin/roles', input)
  return data.data
}

export async function updateRole(id: number, input: RoleInput): Promise<Role> {
  const { data } = await api.patch(`/admin/roles/${id}`, input)
  return data.data
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/admin/roles/${id}`)
}

export async function syncUserModules(id: number, moduleKeys: string[]): Promise<User> {
  const { data } = await api.put(`/admin/users/${id}/modules`, { module_keys: moduleKeys })
  return data.data
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/admin/users/${id}`)
}

export async function fetchAdminModules(): Promise<ModuleInfo[]> {
  const { data } = await api.get('/admin/modules')
  return data.data
}

export async function updateModule(id: number, input: Partial<ModuleInfo>): Promise<ModuleInfo> {
  const { data } = await api.patch(`/admin/modules/${id}`, input)
  return data.data
}

/** ჭრილების მთვლელები — ბარათების რიცხვები (`AdminRequestController::index`) */
export interface RequestCounts {
  pending: number
  approved: number
  rejected: number
  all: number
}

export interface AdminRequestPage {
  items: ApprovalRequestItem[]
  counts: RequestCounts
}

/**
 * ⚠️ **სია და მთვლელები ერთი პასუხია და არა ორი რექვესთი.** ბარათი რიცხვის
 * გარეშე იმავე უფერო პილულად რჩება, ორი წყარო კი „ბარათზე 4 წერია, შიგნით
 * 3-ია"-ს დაბადებდა — აუდიტ-ლოგის `summary()`-ის იგივე წესი.
 */
export async function fetchAdminRequests(status = 'pending'): Promise<AdminRequestPage> {
  const { data } = await api.get('/admin/requests', { params: { status } })
  return {
    items: data.data,
    counts: data.counts ?? { pending: 0, approved: 0, rejected: 0, all: 0 },
  }
}

export async function fetchPendingCount(): Promise<number> {
  const { data } = await api.get('/admin/requests/pending-count')
  return data.pending as number
}

/**
 * `grantedBytes` მხოლოდ `storage_increase`-ს ეხება: ადმინს შეუძლია
 * მოთხოვნილზე **ნაკლებ** ლიმიტზე დათანხმდეს — ეს უარი არაა (17.4).
 */
export async function approveRequest(
  id: number,
  note?: string,
  grantedBytes?: number,
): Promise<ApprovalRequestItem> {
  const { data } = await api.post(`/admin/requests/${id}/approve`, {
    review_note: note,
    granted_bytes: grantedBytes,
  })
  return data.data
}

export async function rejectRequest(id: number, note?: string): Promise<ApprovalRequestItem> {
  const { data } = await api.post(`/admin/requests/${id}/reject`, { review_note: note })
  return data.data
}

/* ---------- მასობრივი წაშლა (Tasks 20) ---------- */

export const PURGE_TARGETS = [
  'movie',
  'series',
  'video',
  'song',
  'book',
  'board_game',
  'game',
  'note',
  'bookmark',
  'anime',
  // FEAT-25 — კურსები
  'course',
  // FEAT-26 — ადგილები
  'place',
  'gallery',
] as const
export type PurgeTarget = (typeof PURGE_TARGETS)[number]

export const PURGE_MODES = ['all', 'ids', 'genre', 'status', 'type', 'tag'] as const
export type PurgeMode = (typeof PURGE_MODES)[number]

/**
 * რომელი სკოუპი რომელ სამიზნეს შეესაბამება.
 * ⚠️ სარკეა backend-ის `PurgeService::TARGET_MODES`-ისა — შეუსაბამობას 422
 * (`mode_not_supported_for_target`) დაიჭერს, მაგრამ ღილაკი ჯერ არ უნდა ჩანდეს.
 *
 * ⚠️ **`as const satisfies` და არა უბრალო ანოტაცია.** `satisfies` სრულყოფილებას
 * ისევე ამოწმებს, როგორც `Record<PurgeTarget, …>`, `as const` კი ლიტერალებს
 * ინახავს — სწორედ ეს აძლევს ქვემოთ `PurgeTargetWithType`-ს საშუალებას,
 * *გამოთვალოს*, რომელ დომენს სჭირდება ლექსიკონი. ჩვეულებრივი `PurgeMode[]`
 * ლიტერალებს შლიდა და ეს შემოწმება შეუძლებელი იყო.
 */
export const PURGE_TARGET_MODES = {
  // FEAT-18 — `tag` სამივე მედია-დომენს გაუჩნდა (პირადი ტეგები)
  movie: ['ids', 'genre', 'tag', 'status', 'all'],
  series: ['ids', 'genre', 'tag', 'status', 'all'],
  // §7.1 — ანიმეს ფილმის/სერიალის იგივე ღერძები აქვს
  anime: ['ids', 'genre', 'tag', 'status', 'all'],
  // §6.4 — ვიდეოს სტატუსი ახლა აქვს, ე.ი. სკოუპიც
  // ⚠️ `ids` თერთმეტივეს აქვს (§25.1) — სარკეა `PurgeService::TARGET_MODES`-ისა
  video: ['ids', 'type', 'tag', 'status', 'all'],
  song: ['ids', 'type', 'tag', 'all'],
  book: ['ids', 'type', 'tag', 'status', 'all'],
  board_game: ['ids', 'type', 'status', 'all'],
  game: ['ids', 'type', 'status', 'all'],
  // §13 — „ტიპი" აქ **კატეგორიაა** (`note_entries.category_id`)
  note: ['ids', 'type', 'tag', 'status', 'all'],
  // §18 — ბუკმარკზეც კატეგორიაა (`bookmarks.category_id`)
  bookmark: ['ids', 'type', 'tag', 'status', 'all'],
  // FEAT-25 — კურსები; „ტიპი“ აქაც კატეგორიაა (`courses.category_id`)
  course: ['ids', 'type', 'tag', 'status', 'all'],
  // FEAT-26 — ადგილზეც კატეგორიაა (`places.category_id`)
  place: ['ids', 'type', 'tag', 'status', 'all'],
  gallery: ['ids', 'genre', 'status', 'all'],
} as const satisfies Record<PurgeTarget, readonly PurgeMode[]>

/**
 * სამიზნეები, რომლებსაც **`type` სკოუპი აქვთ**, ე.ი. per-user ლექსიკონი
 * *სჭირდებათ* (`PurgePage`-ის `DICTIONARIES`).
 *
 * ⚠️ ეს ტიპი იმისთვისაა, რომ ახალი მოდული ლექსიკონის გარეშე **ვერ გაიაროს
 * კომპილაცია**. ადრე რუკა `Partial<Record<…>>` იყო და `game` სწორედ ასე
 * გამოგვეპარა (2026-09-04) — გვერდი ცარიელ ტიპების სიას ხატავდა და
 * არავითარ შეცდომას არ იძლეოდა.
 */
export type PurgeTargetWithType = {
  [K in PurgeTarget]: 'type' extends (typeof PURGE_TARGET_MODES)[K][number] ? K : never
}[PurgeTarget]

/** სამიზნეები `status` სკოუპით — სტატუსის ლეიბლი მათ სჭირდებათ */
export type PurgeTargetWithStatus = {
  [K in PurgeTarget]: 'status' extends (typeof PURGE_TARGET_MODES)[K][number] ? K : never
}[PurgeTarget]

/**
 * სტატუსების ლექსიკონი დომენზე — ⚠️ **არ ემთხვევა** ერთმანეთს: ფილმს
 * `watched` აქვს, წიგნს `read`, ბორდგეიმს `owned`.
 * სარკეა `PurgeService::TARGET_STATUSES`-ისა.
 *
 * ⚠️ **§6.4-ის შემდეგ აქ მხოლოდ `enum`-იანი დომენებია** (წიგნი · ბორდგეიმი ·
 * თამაში). დანარჩენ ექვსს per-user ლექსიკონი აქვს, ე.ი. სია **სამიზნე
 * ანგარიშიდან** ჩამოდის (`GET /statuses/{domain}?user_id=`) — ჩემი
 * ნაგულისხმევები სხვის გადარქმეულ სტატუსზე ცრუ პასუხს გასცემდა.
 */
export const PURGE_TARGET_STATUSES: Record<string, string[]> = {
  book: ['to_read', 'reading', 'read', 'abandoned'],
  board_game: ['owned', 'wanted', 'playing', 'sold'],
  game: ['undecided', 'to_play', 'playing', 'finished', 'abandoned'],
}

export interface PurgeInput {
  target: PurgeTarget
  mode: PurgeMode
  /** `target = 'gallery'`-ზე რომელი დომენის ჩანაწერებს ვასუფთავებთ */
  media_type?: 'movie' | 'series'
  ids?: number[]
  genres?: string[]
  status?: string
  type_ids?: number[]
  tags?: string[]
  keep_favorites?: boolean
  /**
   * §25.5 — „ჩანაწერს ვშლი, ფოტოები გალერეაში დამიტოვე".
   *
   * ⚠️ ფოტო **უკატეგორიო** ხდება (მშობელი ეხსნება) და არა იშლება; ადგილი
   * კი **არ თავისუფლდება** — ფაილი დისკზე რჩება და კვოტაშიც ითვლება,
   * რასაც გეგმა ცხადად ამბობს (`kept_photos`).
   */
  keep_gallery?: boolean
  /** ადმინს სხვისი ბიბლიოთეკის გასუფთავებაც შეუძლია */
  user_id?: number
}

/** რიგის ერთი ერთეული (20.2) — `SyncPlanItem`-ის ანალოგი */
export interface PurgePlanItem {
  /** დომენი (გალერეაზეც ჩანაწერის დომენია და არა `gallery`) */
  type: Exclude<PurgeTarget, 'gallery'>
  id: number
  title: string
  year: number | null
}

export interface PurgePlan {
  plan: {
    target: PurgeTarget
    mode: PurgeMode
    records: number
    photos: number
    attachments: number
    notes: number
    bytes: number
    /** §25.5 — რამდენი ფოტო რჩება გალერეაში (და არა იშლება) */
    kept_photos: number
    items: PurgePlanItem[]
  }
  eta_seconds: number
  user: { id: number; display_name: string }
  storage: StorageUsage
}

/** per-item წაშლის შედეგი — რიგისთვის (20.2) */
export interface PurgeItemResult {
  ok: boolean
  /** ჩანაწერი უკვე აღარ იყო */
  skipped?: boolean
  error?: string | null
  result?: { target: PurgeTarget; records: number; photos: number; bytes: number; title: string | null }
  storage?: StorageUsage
}

export async function fetchPurgePlan(input: PurgeInput): Promise<PurgePlan> {
  const { data } = await api.post('/admin/purge/plan', input)
  return data
}

/** `ids` სკოუპის ამრჩევის ერთეული — id + უკვე გადაწყვეტილი სათაური */
export type PurgeRecord = { id: number; title: string; year: number | null }

/**
 * **სამიზნე ანგარიშის** ჩანაწერები ერთი სამიზნის ფარგლებში (§25.2).
 *
 * ⚠️ **მოდულის თავისი `list({all:true})` აქ არ ვარგა** და სწორედ ეს იყო
 * ხარვეზი: `/purge` სხვისი ბიბლიოთეკიდან შლის (`user_id`), მოდულის სია კი
 * ყოველთვის **ჩემს** ჩანაწერებს აბრუნებს (`owner` სკოუპი) — ე.ი. ამრჩევში
 * ჩემი ფილმები ჩანდა და მათი id-ები სხვის ანგარიშზე მიდიოდა.
 *
 * ⚠️ **სათაურს backend წყვეტს**: თერთმეტი დომენიდან ზოგს `title` აქვს,
 * ზოგს `title_ka`/`title_en` — ერთი რუკა ორ მხარეს გაშორდებოდა.
 */
export async function fetchPurgeRecords(opts: {
  target: PurgeTarget
  media_type?: string
  user_id?: number
}): Promise<PurgeRecord[]> {
  const { data } = await api.get('/admin/purge/records', { params: opts })
  return data.items ?? []
}

/**
 * ⚠️ დესტრუქციული — რიგის ერთი ნაბიჯი (20.2). ინტერფეისი **მხოლოდ ამ
 * გზას** იყენებს; ერთრექვესთიანი `POST /admin/purge` backend-ზე რჩება
 * (სკრიპტული გაშვება და ტესტები), მაგრამ გვერდიდან აღარ იძახება.
 *
 * `mode`/სკოუპი აღარ იგზავნება: id-ები `plan`-იდან მოვიდა და user-მა დაადასტურა.
 */
export async function purgeItem(
  opts: {
    target: PurgeTarget
    media_type?: 'movie' | 'series'
    user_id?: number
    /** §25.5 — რიგის **ყოველ** ნაბიჯს უნდა მოჰყვეს, თორემ პირველის
        ფოტოები დარჩებოდა და დანარჩენების — წაიშლებოდა */
    keep_gallery?: boolean
  },
  id: number,
  signal?: AbortSignal,
): Promise<PurgeItemResult> {
  const { data } = await api.post(
    '/admin/purge/item',
    { ...opts, id, confirm: 'DELETE' },
    { signal },
  )
  return data
}

/* ---------- ატვირთვის ლიმიტები (2026-09-14) ---------- */

export interface UploadKindLimit {
  kind: 'image' | 'doc' | 'video' | 'book' | 'rules'
  /** აპის წესი (KB) — რაც კოდში წერია */
  max_kb: number
  /** **ნამდვილი** ჭერი ბაიტებში — აპისა და PHP-ის მინიმუმი */
  max_bytes: number
  /** ⚠️ `true` = ჭერი PHP-მ ჩამოწია (`php.ini`), და არა აპმა */
  capped_by_server: boolean
  /** ცარიელი `image`-ზე: მას Laravel-ის `image` წესი იცავს და არა გაფართოება */
  mimes: string[]
}

export interface UploadLimits {
  kinds: UploadKindLimit[]
  max_files: number
  server: { upload_max_filesize: string; post_max_size: string; max_bytes: number }
}

export async function fetchUploadLimits(): Promise<UploadLimits> {
  const { data } = await api.get('/uploads/limits')
  return data.data
}
