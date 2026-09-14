import { api } from '@/lib/api'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'
import type { Status, StatusRole } from '@/api/types'

/* ============================================================
   **სტატუსების ლექსიკონი (Tasks §6.2/§6.4).**

   ექვს დომენს — ფილმი · სერიალი · ანიმე · **ვიდეო** · ჩანაწერი · ბუკმარკი —
   სტატუსი per-user ლექსიკონად აქვს: ემატება, გადაერქმევა, იშლება და ლაგდება.
   წიგნი, თამაში და ბორდგეიმი განზრახ `enum`-ზე რჩება (მომხმარებლის სია).

   ⚠️ **ერთი endpoint ექვსივეზე** (`/statuses/{domain}`) — `/visibility/{domain}`-ის
   ნიმუში; ექვსი ცალკე მისამართი ექვს ადგილს ნიშნავდა, სადაც წესი დაშორდებოდა.
   ============================================================ */

/** ვისაც მართვადი სტატუსი აქვს — სარკე `App\Support\StatusDomain::DOMAINS`-ისა */
export const STATUS_DOMAINS = ['movie', 'series', 'anime', 'video', 'note', 'bookmark'] as const

export type StatusDomain = (typeof STATUS_DOMAINS)[number]

export function isStatusDomain(value: string): value is StatusDomain {
  return (STATUS_DOMAINS as readonly string[]).includes(value)
}

export interface StatusInput {
  name_ka: string
  name_en: string
  /** ⚠️ სავალდებულოა — „დასრულებული" სახელით ვერ იზომება (იხ. `types.ts`) */
  role: StatusRole
  icon?: string | null
  color?: string | null
  is_default?: boolean
}

/**
 * @param userId მხოლოდ `super_admin`-ს — `/purge` სხვისი ბიბლიოთეკიდან შლის,
 *               ე.ი. სტატუსების სიაც **მისი** ლექსიკონიდან უნდა დაიხატოს.
 */
export async function fetchStatuses(domain: StatusDomain, userId?: number): Promise<Status[]> {
  const { data } = await api.get(`/statuses/${domain}`, {
    params: userId ? { user_id: userId } : undefined,
  })
  return data.data
}

export async function createStatus(domain: StatusDomain, input: StatusInput): Promise<Status> {
  const { data } = await api.post(`/statuses/${domain}`, input)
  return data.data
}

export async function updateStatus(
  domain: StatusDomain,
  id: number,
  input: StatusInput,
): Promise<Status> {
  const { data } = await api.patch(`/statuses/${domain}/${id}`, input)
  return data.data
}

/**
 * გადატანა · ცარიელად დატოვება · **ჩანაწერების წაშლაც** (ეტაპი 8) —
 * ტანი `api/dictionary.ts`-ში იწყობა, რვავე ლექსიკონის ერთ ფორმით.
 */
export async function deleteStatus(
  domain: StatusDomain,
  id: number,
  removal?: DictionaryRemoval,
): Promise<DictionaryRemoved> {
  const { data } = await api.delete(`/statuses/${domain}/${id}`, { data: removalBody(removal) })
  return readRemoved(data)
}

export async function reorderStatuses(domain: StatusDomain, ids: number[]): Promise<Status[]> {
  const { data } = await api.post(`/statuses/${domain}/reorder`, { ids })
  return data.data
}

/* ---------- საიდბარის განლაგება (ეტაპი 8) ---------- */

/** ფსევდო-განყოფილების ადგილი: `start` · `end` · მეზობელ სტატუსის `key` */
export interface SectionPlacement {
  id: string
  at: string
}

export interface SectionsLayout {
  /** საიდბარში დამალული — სტატუსის `key` ან `all`/`favorite`/`downloaded` */
  hidden: string[]
  placement: SectionPlacement[]
}

/** ⚠️ `PUT` — `module_user.settings.status_sections`-ში ჯდება (იხ. `lib/statusSections.ts`) */
export async function saveStatusSections(
  domain: StatusDomain,
  layout: SectionsLayout,
): Promise<SectionsLayout> {
  const { data } = await api.put(`/statuses/${domain}/sections`, layout)
  return data.status_sections
}
