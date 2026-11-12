import { api } from '@/lib/api'
import type { PublicCard } from '@/api/publicProfile'
import type { ShareGenre } from '@/api/shareLinks'

/* ============================================================
   **სტუმრის შიდა გვერდი — ერთი ჩანაწერი უცხო თვალისთვის.**

   ორი გზა, ერთი პასუხი (`RecordPage::build()`): გაზიარების ბმული
   (`/share/:token/:domain/:id`) და საჯარო პროფილი (`/u/:username/:domain/:id`).

   ⚠️ **რა ბლოკი მოვა, მფლობელი წყვეტს** — ბმულზე ბმულის პარამეტრებით, პროფილზე
   მოდულის პარამეტრებით (`public_blocks`). `blocks` ამბობს, ბლოკი ჩართულია თუ არა:
   ჩართული და ცარიელი „არ არის"-ია, გამორთული კი საერთოდ არ იხატება.
   ⚠️ ჩაკეტილი ფოტო, ჩაკეტილი ან დამალული მსახიობი და პირადი შენიშვნები
   სერვერიდან არ გამოდის.
   ============================================================ */

/** საიდან იხსნება ჩანაწერი */
export type GuestSource = { kind: 'link'; token: string } | { kind: 'profile'; username: string }

export interface GuestPhoto {
  id: number
  path: string
  category: string | null
  width: number | null
  height: number | null
}

export interface GuestCastMember {
  name: string
  name_ka: string | null
  character: string | null
  photo: string | null
}

/** პროფილის ბლოკები — `RecordPage::BLOCKS` */
export const PUBLIC_BLOCKS = ['gallery', 'cast', 'trailer', 'rating', 'status'] as const

export type PublicBlock = (typeof PUBLIC_BLOCKS)[number]

/** `module_user.settings`-ის გასაღები — `RecordPage::SETTING` */
export const PUBLIC_BLOCKS_SETTING = 'public_blocks'

/** პროფილის ნაგულისხმევი — `RecordPage::PROFILE_DEFAULTS`: ქულა და სტატუსი ბარათზე ისედაც ჩანს */
export const PUBLIC_BLOCK_DEFAULTS: Record<PublicBlock, boolean> = {
  gallery: false,
  cast: false,
  trailer: false,
  rating: true,
  status: true,
}

export interface GuestRecord {
  record: PublicCard
  description: { ka: string | null; en: string | null } | null
  genres: ShareGenre[]
  blocks: { gallery: boolean; cast: boolean; trailer: boolean }
  gallery: GuestPhoto[]
  cast: GuestCastMember[]
  trailer: { url: string; embed_url: string | null; platform: string | null } | null
}

/** სტუმრის გვერდის მისამართი SPA-ში */
export function guestRecordPath(source: GuestSource, domain: string, id: number): string {
  return `${guestListPath(source)}/${domain}/${id}`
}

/** სია, საიდანაც ჩანაწერი გაიხსნა — „უკან" */
export function guestListPath(source: GuestSource): string {
  return source.kind === 'link'
    ? `/share/${encodeURIComponent(source.token)}`
    : `/u/${encodeURIComponent(source.username)}`
}

export async function fetchGuestRecord(source: GuestSource, domain: string, id: number): Promise<GuestRecord> {
  const base =
    source.kind === 'link'
      ? `/public/shares/${encodeURIComponent(source.token)}`
      : `/public/profiles/${encodeURIComponent(source.username)}`
  const { data } = await api.get(`${base}/${encodeURIComponent(domain)}/${id}`)

  return data
}
