import { api } from '@/lib/api'

/* ============================================================
   აუდიტ-ლოგი (Tasks §4).

   ⚠️ **სია ყოველთვის გვერდებზეა.** ლოგი სამუდამოდ ინახება (§4.1) და თვეში
   ათასობით რიგით იზრდება — „ყველას ჩამოტვირთვა ერთ პასუხში" ცხადად
   გამორიცხულია, ე.ი. `fetchAuditLogs` ყოველთვის `page`/`per_page`-ს
   იღებს და `meta`-ს აბრუნებს.

   ⚠️ **გასუფთავება შეუქცევადია** და `confirm: "DELETE"`-ს ითხოვს —
   `purge`-ის იგივე წესი. `ids` და ფილტრი **ერთდროულად** მოქმედებს:
   მონიშვნა ყოველთვის გაფილტრულის შიგნითაა.
   ============================================================ */

/** მოქმედების ტიპები — backend-ის `AuditLog::ACTIONS`-ის ანარეკლი */
export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'register',
  'visit',
  'create',
  'update',
  'delete',
  'chat_delete',
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
  /** ძველი და ახალი — ერთი და იმავე გასაღებებით (§4.1-ის diff) */
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  context: Record<string, unknown> | null
  /** §4.6-ის რიგი — გასუფთავებას არ ემორჩილება */
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
  modules: { key: string; name_ka: string | null; name_en: string | null }[]
  users: { id: number; name: string; username: string }[]
}

/**
 * ფილტრი — სამივე ჭრილი ერთდროულად მოქმედებს (§4.7).
 * `module`/`action` მძიმით გამოყოფილ სიად მიდის (backend-ის `slugList()`).
 */
export interface AuditFilters {
  user_id?: number | null
  modules?: string[]
  actions?: string[]
  from?: string | null
  to?: string | null
  q?: string
}

function params(filters: AuditFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}

  if (filters.user_id) out.user_id = filters.user_id
  if (filters.modules?.length) out.module = filters.modules.join(',')
  if (filters.actions?.length) out.action = filters.actions.join(',')
  if (filters.from) out.from = filters.from
  if (filters.to) out.to = filters.to
  if (filters.q?.trim()) out.q = filters.q.trim()

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
 * გასუფთავება (§4.7) — მონიშნულები ან **მთელი ფილტრი**.
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

/**
 * **„რომელ სექციაში შევიდა" (§4.1)** — SPA-ს მარშრუტის შეცვლაზე.
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
