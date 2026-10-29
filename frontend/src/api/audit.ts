import { api, API_URL } from '@/lib/api'

/* ============================================================
   აუდიტ-ლოგი.

   ⚠️ **სია ყოველთვის გვერდებზეა.** ლოგი სამუდამოდ ინახება და თვეში
   ათასობით რიგით იზრდება — „ყველას ჩამოტვირთვა ერთ პასუხში" ცხადად
   გამორიცხულია, ე.ი. `fetchAuditLogs` ყოველთვის `page`/`per_page`-ს
   იღებს და `meta`-ს აბრუნებს.

   ⚠️ **გასუფთავება შეუქცევადია** და `confirm: "DELETE"`-ს ითხოვს —
   `purge`-ის იგივე წესი. `ids` და ფილტრი **ერთდროულად** მოქმედებს:
   მონიშვნა ყოველთვის გაფილტრულის შიგნითაა.
   ============================================================ */

/**
 * მოქმედების ტიპები — backend-ის `AuditLog::ACTIONS`-ის სარკე, რიგის ჩათვლით
 * (`RegistryConsistencyTest`). ⚠️ **ყველა** ტიპი: ადრე რვა იყო
 * თექვსმეტიდან, ე.ი. ფერი და ფილტრი ნახევარს არ ჰქონდა.
 */
export const AUDIT_ACTIONS = [
  'login',
  'login_failed',
  'logout',
  'register',
  'visit',
  'refresh',
  'open',
  'profile_visit',
  'click',
  'create',
  'update',
  'delete',
  'chat_delete',
  'cast_attach',
  'cast_detach',
  'cast_update',
  'translate',
  'export',
  'import',
  'restore',
  'cast_sync',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export interface AuditEntry {
  id: number
  action: string
  module: string | null
  user: { id: number; name: string; username: string } | null
  /** ⚠️ ანგარიშის წაშლის შემდეგ `user` ცარიელია, სახელის ასლი კი რჩება */
  user_label: string | null
  subject: { type: string; id: number | null; label: string | null } | null
  method: string | null
  route: string | null
  ip: string | null
  user_agent: string | null
  /** ძველი და ახალი — ერთი და იმავე გასაღებებით (diff-ისთვის) */
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  context: Record<string, unknown> | null
  /** დაცული რიგი — გასუფთავებას არ ემორჩილება */
  is_protected: boolean
  created_at: string | null
}

export interface AuditPage {
  data: AuditEntry[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

export interface AuditMeta {
  actions: string[]
  protected_actions: string[]
  /** `owner` — პირადი მოდულის მფლობელი; საბაზისოსა და ფსევდო-მოდულზე `null` */
  modules: { key: string; name_ka: string | null; name_en: string | null; owner?: string | null }[]
  users: { id: number; name: string; username: string }[]
}

/**
 * ფილტრი — სამივე ჭრილი ერთდროულად მოქმედებს.
 * `module`/`action` მძიმით გამოყოფილ სიად მიდის (backend-ის `slugList()`).
 */
export interface AuditFilters {
  user_id?: number | null
  modules?: string[]
  actions?: string[]
  from?: string | null
  to?: string | null
  q?: string
  /** „გახსნების" ჩაღრმავება: ერთი ჩანაწერის რიგები */
  subject_type?: string | null
  subject_id?: number | null
  /** „პროფილების" ჩაღრმავება: ვისი პროფილიდან (`context.owner`) */
  owner?: string | null
}

function params(filters: AuditFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}

  if (filters.user_id) out.user_id = filters.user_id
  if (filters.modules?.length) out.module = filters.modules.join(',')
  if (filters.actions?.length) out.action = filters.actions.join(',')
  if (filters.from) out.from = filters.from
  if (filters.to) out.to = filters.to
  if (filters.q?.trim()) out.q = filters.q.trim()
  if (filters.subject_type) out.subject_type = filters.subject_type
  if (filters.subject_id) out.subject_id = filters.subject_id
  if (filters.owner) out.owner = filters.owner

  return out
}

export async function fetchAuditLogs(
  filters: AuditFilters,
  page = 1,
  perPage = 25,
): Promise<AuditPage> {
  const { data } = await api.get('/admin/audit', {
    params: { ...params(filters), page, per_page: perPage },
  })
  return data
}

/**
 * ჭრილების მთვლელები — რამდენი რიგი აქვს თითო მოდულს/მოქმედებას.
 *
 * ⚠️ **თითო ჭრილი საკუთარ თავს არ ითვლის** (backend-ის `except`): მოდულის
 * არჩევის შემდეგაც დანარჩენი ბარათები თავის რიცხვს ინარჩუნებს, ე.ი.
 * „სხვაგან რა დევს" ყოველთვის კითხვადია. რიცხვი სწორედ ის რაოდენობაა,
 * რასაც იმ ბარათზე დაჭერით მიიღებ.
 */
export interface AuditFacet {
  /** `null` = მოდულის გარეშე რიგი (შესვლა/გასვლა/რეგისტრაცია) */
  key: string | null
  total: number
}

export interface AuditSummary {
  total: number
  modules: AuditFacet[]
  actions: AuditFacet[]
}

export async function fetchAuditSummary(filters: AuditFilters): Promise<AuditSummary> {
  const { data } = await api.get('/admin/audit/summary', { params: params(filters) })
  return data
}

export async function fetchAuditMeta(): Promise<AuditMeta> {
  const { data } = await api.get('/admin/audit/meta')
  return data
}

/**
 * რამდენი რიგი წაიშლება ამ ფილტრით და რამდენი გადარჩება დაცვის გამო.
 * ⚠️ **`GET`** — გეგმა კითხვაა; POST-ს backend `create`-ად წაიკითხავდა და
 * მხოლოდ-ნახვის უფლების მქონე ადმინი ცრუ 403-ს მიიღებდა.
 */
export async function fetchAuditPlan(
  filters: AuditFilters,
): Promise<{ total: number; protected: number }> {
  const { data } = await api.get('/admin/audit/plan', { params: params(filters) })
  return data
}

/**
 * გასუფთავება — მონიშნულები ან **მთელი ფილტრი**.
 * ⚠️ `ids` ფილტრს არ ცვლის, ავიწროებს: შემთხვევით უფრო ფართო წაშლა
 * შეუძლებელია.
 */
export async function purgeAuditLogs(
  filters: AuditFilters,
  ids?: number[],
): Promise<number> {
  const { data } = await api.delete('/admin/audit', {
    params: params(filters),
    data: { confirm: 'DELETE', ...(ids?.length ? { ids } : {}) },
  })
  return data.deleted as number
}

/* ============================================================
   **გახსნა, დაჭერები, პარამეტრები.**

   ხილული „შევედი N-ჯერ" წაიშალა (`api/visits.ts`): ჩანაწერის გახსნა
   ახლა მხოლოდ ჟურნალშია (`open`), „ვინ რა გახსნა და რამდენჯერ" კი ჟურნალის
   „გახსნების" ხედია. ⚠️ SPA მხოლოდ **ჩართულ** ტიპებს აგზავნის
   (`user.audit_kinds`); სერვერი გამორთულს მაინც აგდებს — ეს მეორე კარიბჭეა.
   ============================================================ */

/**
 * ⚠️ `Openable::TYPES`-ის სარკე — URL-ის სეგმენტი და morph-ალიასი ერთი
 * სიტყვაა; `RegistryConsistencyTest` რიგის ჩათვლით ადარებს.
 */
export const OPEN_TYPES = [
  'movie',
  'series',
  'anime',
  'video',
  'song',
  'book',
  'board_game',
  'game',
  'note',
  'bookmark',
  'course',
  'place',
  'playlist',
  'custom_record',
] as const

export type OpenType = (typeof OPEN_TYPES)[number]

/** ჩანაწერის გახსნა — იგივე ჩანაწერი წუთში ერთხელ (სერვერი); ჩავარდნა ჩუმია */
export async function recordOpen(type: OpenType, id: number): Promise<void> {
  try {
    await api.post(`/audit/open/${type}/${id}`)
  } catch {
    /* ჟურნალის ვერ-ჩაწერამ ფანჯარა არ უნდა გატეხოს */
  }
}

/** SPA-ს მოვლენა პაკეტში — ⚠️ ველის მნიშვნელობა აქ არასოდეს მოდის */
export interface AuditEvent {
  action: 'click' | 'refresh'
  path: string
  label?: string | null
  role?: 'button' | 'link' | 'menuitem' | 'tab' | 'option' | 'switch'
}

/** backend-ის `max:50` */
export const AUDIT_EVENT_BATCH = 50

/**
 * პაკეტის გაგზავნა. `keepalive` — გვერდის დატოვებისას (`pagehide`): `fetch`-ი
 * და არა `sendBeacon`, რადგან Sanctum-ის POST-ს `X-XSRF-TOKEN` სჭირდება, ბიკონი კი
 * ჰედერს ვერ აგზავნის (419 იქნებოდა). ⚠️ ჩავარდნა ჩუმია.
 */
export async function sendAuditEvents(events: AuditEvent[], keepalive = false): Promise<void> {
  if (events.length === 0) return

  try {
    if (!keepalive) {
      await api.post('/audit/events', { events })
      return
    }

    const token = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie)?.[1]
    await fetch(`${API_URL}/api/audit/events`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
      },
      body: JSON.stringify({ events }),
    })
  } catch {
    /* ignore */
  }
}

/** „ვინ რა გახსნა და რამდენჯერ" — მომხმარებელი × ჩანაწერი */
export interface AuditOpenRow {
  user: { id: number; name: string; username: string } | null
  /** ანონიმზე (საჯარო პროფილი, გაზიარება) `null` */
  user_id: number | null
  user_label: string | null
  module: string | null
  subject: { type: string; id: number | null; label: string | null }
  opens: number
  last_at: string | null
}

export async function fetchAuditOpens(
  filters: AuditFilters,
  page = 1,
  perPage = 25,
): Promise<{ data: AuditOpenRow[]; meta: AuditPage['meta'] }> {
  const { data } = await api.get('/admin/audit/opens', {
    params: { ...params(filters), page, per_page: perPage },
  })
  return data
}

/** „ვინ შევიდა ვის პროფილში და რა გადმოიტანა" (სუპერადმინი) — სტუმარი × პროფილის მფლობელი */
export interface AuditProfileRow {
  user: { id: number; name: string; username: string } | null
  /** ანონიმზე `null` — ერთ რიგად თითო პროფილზე */
  user_id: number | null
  owner: string
  visits: number
  imports: number
  last_at: string | null
}

export async function fetchAuditProfiles(
  filters: AuditFilters,
  page = 1,
  perPage = 25,
): Promise<{ data: AuditProfileRow[]; meta: AuditPage['meta'] }> {
  const { data } = await api.get('/admin/audit/profiles', {
    params: { ...params(filters), page, per_page: perPage },
  })
  return data
}

/** „ჟურნალის პარამეტრები" (სუპერადმინი) — თითო გადამრთველი */
export interface AuditKindSetting {
  key: string
  enabled: boolean
  /** ჩატის წაშლა — ვერ გამოირთვება */
  protected: boolean
}

export async function fetchAuditSettings(): Promise<AuditKindSetting[]> {
  const { data } = await api.get('/admin/audit/settings')
  return data.data
}

/** მხოლოდ გამორთულები იგზავნება — ნაგულისხმევად ყველაფერი ჩართულია */
export async function saveAuditSettings(off: string[]): Promise<AuditKindSetting[]> {
  const { data } = await api.put('/admin/audit/settings', { off })
  return data.data
}

/**
 * **„რომელ სექციაში შევიდა"** — SPA-ს მარშრუტის შეცვლაზე.
 *
 * ⚠️ **ჩავარდნა ჩუმია და განზრახ**: ლოგირების ვერ-ჩაწერამ ნავიგაცია არ
 * უნდა გატეხოს და toast-იც არ უნდა აჩვენოს.
 */
export async function recordVisit(path: string, module?: string | null): Promise<void> {
  try {
    await api.post('/audit/visit', { path, module: module ?? undefined })
  } catch {
    /* ignore */
  }
}
