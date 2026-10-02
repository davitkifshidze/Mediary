import { api } from '@/lib/api'
import type { MediaType } from '@/lib/media'
import type { PublicCard } from '@/api/publicProfile'

/* ============================================================
   **გაზიარების ბმული (Tasks §40).**

   მფლობელი ბმულს ქმნის, სხვა ადამიანი კი მისით მის ფილმებს, სერიალებსა
   და ანიმეს ხედავს — ფარგლებით, თითო სექციაზე. ⚠️ ნახვა შესვლის გარეშეც
   შეიძლება (Q46); ბიბლიოთეკაში დამატება მხოლოდ შესულს (40.8).

   ⚠️ **ფარგლების ლექსიკონი `GalleryScope`-ისაა** (`all` · `status` ·
   `favorite` · `genre` · `ids`) — იგივე, რასაც სინქრონიზაციისა და გალერეის
   ფანჯრები იყენებს; ორი ლექსიკონი ერთი კითხვისთვის დაშორდებოდა.
   ============================================================ */

/** რომელი დომენები ზიარდება ბმულით — `ShareDomain::DOMAINS`-ის სარკე */
export const SHARE_DOMAINS = ['movie', 'series', 'anime'] as const satisfies readonly MediaType[]

export type ShareDomainKey = (typeof SHARE_DOMAINS)[number]

export const SHARE_SCOPES = ['all', 'status', 'favorite', 'genre', 'ids'] as const

export type ShareScopeMode = (typeof SHARE_SCOPES)[number]

/** ერთი სექციის ფარგლები — `ShareScope::normalize()`-ის ფორმა */
export interface ShareDomainSpec {
  scope: ShareScopeMode
  statuses?: string[]
  genres?: string[]
  genre_mode?: 'any' | 'all'
  ids?: number[]
  public_only?: boolean
}

export type ShareDomains = Partial<Record<ShareDomainKey, ShareDomainSpec>>

/** ვადის არჩევანი დღეებით; `null` — უვადო */
export type ShareExpiry = 7 | 30 | 365 | null

export interface ShareLink {
  id: number
  name: string | null
  /** `null` — `APP_KEY` შეიცვალა: ბმული მუშაობს, მაგრამ ღიად ვეღარ ჩანს */
  url: string | null
  readable: boolean
  domains: ShareDomains
  /** ცოცხალი რიცხვები, მხოლოდ იმ სექციებზე, რაც მფლობელს ჯერ კიდევ შეუძლია გააზიაროს */
  counts: Partial<Record<ShareDomainKey, number>>
  /** მოდული მფლობელს გაეთიშა — ეს სექცია მიმღებს აღარ უჩანს */
  unavailable: ShareDomainKey[]
  show_status: boolean
  show_rating: boolean
  expires_at: string | null
  revoked_at: string | null
  state: 'active' | 'expired' | 'revoked'
  views: number
  imports: number
  /** Tasks §40.8 — ვინ დაიმატა ამ ბმულიდან და რამდენი (ახლები ზემოთ) */
  importers: { username: string | null; display_name: string; added: number; last_added_at: string | null }[]
  last_opened_at: string | null
  created_at: string | null
}

export interface ShareLinkList {
  data: ShareLink[]
  meta: {
    enabled: boolean
    available: ShareDomainKey[]
    expiry_days: number[]
    default_expiry_days: number
  }
}

export interface ShareLinkInput {
  domains?: ShareDomains
  name?: string | null
  show_status?: boolean
  show_rating?: boolean
  expires_days?: ShareExpiry
  revoked?: boolean
}

export interface SharePreview {
  domains: Partial<Record<ShareDomainKey, { total: number; private: number }>>
  total: number
  private: number
}

export async function fetchShareLinks(): Promise<ShareLinkList> {
  const { data } = await api.get('/share-links')
  return data
}

/**
 * ⚠️ **ლოგიკური მნიშვნელობა `1`/`0`-ად იგზავნება** — `GET`-ის პარამეტრი
 * სტრიქონია და Laravel-ის `boolean` წესი `"true"`-ს არ იღებს.
 */
function domainsParam(domains: ShareDomains) {
  return Object.fromEntries(
    Object.entries(domains).map(([key, spec]) => [
      key,
      { ...spec, public_only: spec?.public_only ? 1 : 0 },
    ]),
  )
}

/** რამდენი მოხვდება ბმულში (`GET` — მხოლოდ ითვლის) */
export async function previewShareLink(domains: ShareDomains, signal?: AbortSignal): Promise<SharePreview> {
  const { data } = await api.get('/share-links/preview', { params: { domains: domainsParam(domains) }, signal })
  return data
}

export async function createShareLink(input: ShareLinkInput): Promise<ShareLink> {
  const { data } = await api.post('/share-links', input)
  return data.data
}

export async function updateShareLink(id: number, input: ShareLinkInput): Promise<ShareLink> {
  const { data } = await api.patch(`/share-links/${id}`, input)
  return data.data
}

export async function deleteShareLink(id: number): Promise<void> {
  await api.delete(`/share-links/${id}`)
}

/** ახალი ბმული — ძველი ამ წამიდან აღარ მუშაობს */
export async function regenerateShareLink(id: number): Promise<ShareLink> {
  const { data } = await api.post(`/share-links/${id}/regenerate`)
  return data.data
}

/* ---------- მიმღების მხარე — ავტორიზაციის გარეშე ---------- */

export interface PublicShare {
  owner: { username: string; display_name: string; avatar_path: string | null }
  link: { expires_at: string | null; show_status: boolean }
  sections: { domain: ShareDomainKey; count: number }[]
  modules: Record<string, { name_ka: string; name_en: string; icon: string; color: string | null }>
  viewer: {
    signed_in: boolean
    own: boolean
    /** შესულ უცხოს — რომელ სექციაში შეუძლია დამატება (§40.6); სხვას — ცარიელი */
    sections: Partial<Record<ShareDomainKey, ShareAbility>>
  }
}

/** მნახველის შესაძლებლობა ერთ სექციაში — მოდულის უქონელს მოთხოვნის ღილაკი უჩანს */
export interface ShareAbility {
  enabled: boolean
  can_create: boolean
  /** მოდულის მოთხოვნა უკვე გაგზავნილია */
  requested: boolean
}

export interface ShareGenre {
  slug: string
  name_ka: string | null
  name_en: string
}

/** მიმღების ბარათი — ვიწრო (`PublicDomain::card()`) + ჟანრები (+ შესულს „უკვე გაქვს") */
export interface ShareCard extends PublicCard {
  genres?: ShareGenre[]
  /** მხოლოდ შესულ უცხოს: `null` — არ გაქვს; `trashed` — შენს ურნაშია */
  in_library?: { id: number; trashed: boolean } | null
}

export interface ShareItems {
  data: ShareCard[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
  genres: (ShareGenre & { count: number })[]
}

export async function fetchPublicShare(token: string): Promise<PublicShare> {
  const { data } = await api.get(`/public/shares/${encodeURIComponent(token)}`)
  return data
}

/**
 * ⚠️ **ნამდვილი გვერდებია და არა „ერთი მზარდი გვერდი"** — სერვერი
 * `per_page`-ს 100-ზე ჭრის (ავტორიზაციის გარეშე endpoint-ია, §B4), ე.ი.
 * მზარდი `per_page` 100-ზე გაჩერდებოდა. საჯარო პროფილის ყალიბია.
 */
export async function fetchPublicShareItems(
  token: string,
  domain: ShareDomainKey,
  params: { page: number; q?: string; genre?: string },
): Promise<ShareItems> {
  const { data } = await api.get(`/public/shares/${encodeURIComponent(token)}/${domain}`, {
    params: {
      page: params.page,
      ...(params.q ? { q: params.q } : {}),
      ...(params.genre ? { genre: params.genre } : {}),
    },
  })
  return data
}

/* ---------- ბიბლიოთეკაში დამატება — შესულისთვის (Tasks §40.8) ---------- */

/** „ჩემი ნაგულისხმევი სტატუსით" · „როგორც გამზიარებელს აქვს" (Q48) */
export type ShareStatusMode = 'default' | 'owner'

export interface SharePlanItem {
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  /** `new` — არ გაქვს · `have` — გაქვს · `trash` — შენს ურნაშია */
  state: 'new' | 'have' | 'trash'
  mine_id: number | null
}

export interface SharePlan {
  domain: ShareDomainKey
  module: ShareAbility
  items: SharePlanItem[]
  counts: { new: number; have: number; trash: number }
  status_modes: ShareStatusMode[]
}

/**
 * რა შედის არჩევანში და რომელი უკვე გაქვს. ⚠️ გარე წყაროს არ ეკითხება —
 * `ids`-ის გარეშე მთელი სექციაა.
 */
export async function planShareImport(token: string, domain: ShareDomainKey, ids?: number[]): Promise<SharePlan> {
  const { data } = await api.post(`/shares/${encodeURIComponent(token)}/plan`, {
    domain,
    ...(ids && ids.length ? { ids } : {}),
  })
  return data
}

export interface ShareItemResult {
  ok: boolean
  result: 'added' | 'have'
  id: number
  /** TMDB-დან ვერ შეივსო (გასაღები არ არის, წყარო არ პასუხობს) — სინქრონიზაცია შეავსებს */
  partial: boolean
  /** ხელით შეყვანილის პოსტერი ვერ ჩაიწერა — მიზეზის კოდი */
  poster_skipped: string | null
}

/** ერთი ჩანაწერის დამატება — რიგი თითოს ცალკე აგზავნის */
export async function addShareItem(
  token: string,
  domain: ShareDomainKey,
  id: number,
  statusMode: ShareStatusMode,
  signal?: AbortSignal,
): Promise<ShareItemResult> {
  const { data } = await api.post(
    `/shares/${encodeURIComponent(token)}/item`,
    { domain, id, status_mode: statusMode },
    { signal },
  )
  return data
}
