import { api, API_URL } from '@/lib/api'
import type { PublicProfile } from './publicProfile'

/* ============================================================
   ჩატი (Tasks §16.3) — პირადი მიმოწერა ორ მომხმარებელს შორის.

   ⚠️ **მიწერა მხოლოდ ორ საჯარო პროფილს შორის შეიძლება** — იგივე კარიბჭე,
   რაც დამთხვევებს (§16.2). არასაჯარო მხარეზე backend 409-ს აბრუნებს
   (`profile_not_public`), დაბლოკვაზე კი 403-ს (`chat_blocked`).

   **მედია გაკეთდა 2026-09-06-ს** (`docs/DECISIONS.md` §1).

   ⚠️ **ფაილი პრივატულ დისკზეა** და `/storage/*`-ით არ იხსნება: ერთადერთი
   გზა `GET /api/chat/files/{message}`-ია, რომელიც მონაწილეობას ამოწმებს.
   სწორედ ამიტომ `attachmentUrl()` `API_URL`-ზე დგას და არა `storageUrl()`-ზე.

   ⚠️ **წაშლა ორივესთან შლის** — შეტყობინების რიგი რჩება და
   `attachment_deleted`-ით იხატება „ფაილი წაშლილია".
   ============================================================ */

export const MESSAGE_TYPES = ['text', 'emoji', 'gif', 'image', 'video', 'file', 'record'] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

/** ატვირთვის ტიპები — რასაც `file` input-ი აძლევს */
export const MEDIA_TYPES = ['image', 'video', 'file'] as const
export type MediaMessageType = (typeof MEDIA_TYPES)[number]

type Profile = PublicProfile['profile']

export interface ChatAttachment {
  /** api-ს ფარდობითი გზა; სრულ URL-ს `attachmentUrl()` აწყობს */
  url: string
  name: string | null
  mime: string | null
  size: number | null
}

export interface ChatMessage {
  id: number
  type: MessageType
  body: string | null
  /** ჩემი გაგზავნილია — ბუშტის მხარეს ეს წყვეტს */
  mine: boolean
  attachment: ChatAttachment | null
  /** გამგზავნმა ფაილი წაშალა — ბუშტში ნაცრისფერი ჩანაცვლება ჩნდება */
  attachment_deleted: boolean
  /** სახელი წაშლის შემდეგაც რჩება: ჩანაცვლებამ უნდა თქვას, რა იყო */
  attachment_name: string | null
  /**
   * §10.10 — ემოჯი → რამდენჯერ. ⚠️ **თითო ადამიანზე ერთი რეაქციაა**
   * (Messenger-ის სემანტიკა), ე.ი. ჯამი მონაწილეთა რაოდენობას ვერ
   * გადააჭარბებს.
   */
  reactions: Record<string, number>
  /** ჩემი რეაქცია — იმავეს ხელახლა დაჭერა მოხსნაა */
  my_reaction: string | null
  /** §10.7 — დაპინულია თუ არა; **ორივე მონაწილეს შეუძლია** */
  pinned: boolean
  /** FEAT-13 — გაზიარებული ჩანაწერი; `null` — ჩვეულებრივი წერილი */
  record: SharedRecord | null
  created_at: string | null
}

/* ============================================================
   გაზიარებული ჩანაწერი (FEAT-13).

   ⚠️ **`card` `null`-ია ორ შემთხვევაში და ეს განზრახვაა**: ჩანაწერი
   პირადია, ან უკვე აღარ არსებობს. ორივეზე ინტერფეისს ერთი და იგივე
   აქვს სათქმელი — „მხოლოდ სათაური".

   ⚠️ **ბარათი სერვერზე იგება კითხვის მომენტში**, ე.ი. დღეს
   დაპრივატებული ჩანაწერი გუშინდელ წერილშიც იხურება.
   ============================================================ */

export interface SharedRecord {
  domain: string
  title: string
  identity: Record<string, string | number | null>
  /** სრული ბარათი — მხოლოდ საჯარო ჩანაწერზე (ან ავტორისთვის) */
  card: {
    id: number
    domain: string
    title_ka?: string | null
    title_en?: string | null
    poster_url?: string | null
    cover_url?: string | null
    image_url?: string | null
    thumbnail_url?: string | null
    year?: number | null
    rating?: number | null
  } | null
}

/**
 * მიმაგრებული ფაილის სრული მისამართი.
 * ⚠️ **`withCredentials` აუცილებელია** — `<img src>` cookie-ს თვითონ გზავნის,
 * ე.ი. იმავე origin-ის სესია მუშაობს; ცალკე token არ გვჭირდება.
 */
export function attachmentUrl(attachment: ChatAttachment): string {
  return `${API_URL}/api${attachment.url}`
}

export interface ChatConversation {
  id: number
  profile: Profile | null
  /** მე დავბლოკე ეს ადამიანი (ღილაკის მდგომარეობა) */
  blocked_by_me: boolean
  last_message: {
    body: string | null
    type: MessageType
    /** მედიის შემთხვევაში სიაში სახელი ჩანს და არა ცარიელი ხაზი */
    attachment_name: string | null
    mine: boolean
    created_at: string | null
  } | null
  unread: number
  /**
   * §10.5 — დადუმებული. ⚠️ **რიცხვი პატიოსანი რჩება**: დადუმება ნიშნავს
   * „ნუ მაწუხებ" და არა „დამალე" — მხოლოდ ჰედერის ბეჯი ჩუმდება.
   */
  muted: boolean
  /** §10.11 — ჩემი დარქმეული სახელი; ნამდვილი `profile`-ში რჩება */
  nickname: string | null
  theme: string | null
  last_message_at: string | null
}

export interface ChatThread {
  data: ChatMessage[]
  /**
   * §10.8 — **კურსორი და არა გვერდის ნომერი.** ახალი წერილი სიას წინ
   * ემატება, ე.ი. „მე-2 გვერდი" ყოველ ახალ წერილზე სხვა რიგებს ნიშნავდა
   * და ისტორიის კითხვისას დუბლები ჩნდებოდა.
   */
  meta: { has_more: boolean; oldest_id: number | null; newest_id: number | null }
  profile: Profile | null
  /** §10.3 — მეორე მხარემ სად წაიკითხა; „ნანახია" ნიშანი ამაზე დგას */
  other_read_at: string | null
  muted: boolean
  theme: string | null
  nickname: string | null
  blocked_by_me: boolean
  /**
   * ⚠️ **„საერთოდ დაბლოკილია" ≠ „მე დავბლოკე".** მეორემ თუ დამბლოკა,
   * ღილაკი „განბლოკვა" არ უნდა გამოჩნდეს — მაგრამ წერაც არ შეიძლება.
   */
  blocked: boolean
}

export async function fetchConversations(): Promise<{ data: ChatConversation[]; unread_total: number }> {
  const { data } = await api.get('/chat')
  return data
}

/** ჰედერის badge — მხოლოდ რიცხვი */
export async function fetchChatUnread(): Promise<number> {
  const { data } = await api.get('/chat/unread')
  return data.unread as number
}

/** საუბრის გახსნა username-ით; არსებულს აბრუნებს და დუბლს არ ქმნის */
export async function openConversation(username: string): Promise<number> {
  const { data } = await api.post(`/chat/with/${encodeURIComponent(username)}`)
  return data.id as number
}

/**
 * **ძაფის კითხვა კურსორით (§10.8).**
 *
 * ⚠️ `before_id` — „ძველი"; `around_id` — ნახტომი ძებნიდან ან პინიდან.
 * ⚠️ **`around_id` წაკითხულად არ ნიშნავს**: ისტორიაში ჩახტომა „ყველაფერი
 * წავიკითხე" არ არის (ეს წესი backend-შია და არა აქ).
 */
export async function fetchThread(
  id: number,
  cursor: { before_id?: number; around_id?: number } = {},
): Promise<ChatThread> {
  const { data } = await api.get(`/chat/${id}`, { params: cursor })
  return data
}

/* ---------- §10 — Messenger-ის დონე ---------- */

export interface ChatSearchHit {
  id: number
  mine: boolean
  /** სერვერზე მოჭრილი კონტექსტი; ხაზგასმას `highlightParts()` აკეთებს */
  snippet: string | null
  created_at: string | null
}

/** ძებნა ერთ საუბარში (§10.9) — დამალული წერილი შედეგებში არ ჩნდება */
export async function searchThread(id: number, q: string): Promise<ChatSearchHit[]> {
  const { data } = await api.get(`/chat/${id}/search`, { params: { q } })
  return data.data
}

/** პინების სია (§10.7) — წაშლილი თავისით ცვივა, მეორე ჩაწერის გარეშე */
export async function fetchPins(id: number): Promise<ChatMessage[]> {
  const { data } = await api.get(`/chat/${id}/pins`)
  return data.data
}

/** ⚠️ `PATCH` — POST-ს backend-ის `permission:` middleware `create`-ად წაიკითხავდა */
export async function pinMessage(messageId: number, pinned: boolean): Promise<ChatMessage> {
  const { data } = await api.patch(`/chat/messages/${messageId}/pin`, { pinned })
  return data.data
}

/**
 * რეაქცია (§10.10). ⚠️ **`null` = მოხსნა**, და იმავე ემოჯის ხელახლა
 * გაგზავნაც მოხსნაა — Messenger-ის ქცევა, backend-ზე გადაწყვეტილი.
 */
export async function reactToMessage(messageId: number, emoji: string | null): Promise<ChatMessage> {
  const { data } = await api.put(`/chat/messages/${messageId}/reaction`, { emoji })
  return data.data
}

/** დადუმება (§10.5). ⚠️ `until`-ის გარეშე — სამუდამოდ */
export async function setChatMuted(id: number, muted: boolean, until?: string): Promise<boolean> {
  const { data } = await api.put(`/chat/${id}/mute`, { muted, until })
  return data.muted as boolean
}

/** თემა (§10.6) — **საუბრისაა**, ორივე მხარე ერთსა და იმავე ფერს ხედავს */
export async function setChatTheme(id: number, theme: string | null): Promise<string | null> {
  const { data } = await api.put(`/chat/${id}/theme`, { theme })
  return data.theme as string | null
}

/** ნიკნეიმი (§10.11) — **მხოლოდ ჩემს ხედში**; ცარიელი მნიშვნელობა შლის */
export async function setChatNickname(id: number, nickname: string | null): Promise<string | null> {
  const { data } = await api.put(`/chat/${id}/nickname`, { nickname })
  return data.nickname as string | null
}

export async function sendMessage(id: number, body: string, type: MessageType = 'text'): Promise<ChatMessage> {
  const { data } = await api.post(`/chat/${id}`, { body, type })
  return data.data
}

/**
 * ფაილის გაგზავნა (§16.3). იგივე endpoint-ია, რაც ტექსტისა — `file`-ის
 * არსებობა წყვეტს, რომელია; ასე დაბლოკვის/საჯაროობის კარიბჭე ერთია.
 *
 * ⚠️ ადგილის ამოწურვაზე backend **413**-ს აბრუნებს (`storage_quota_exceeded`
 * ან `module_quota_exceeded`) — ტექსტი იმავე მდგომარეობაშიც იგზავნება (§16.4).
 */
export async function sendAttachment(
  id: number,
  file: File,
  type: MediaMessageType,
  body?: string,
): Promise<ChatMessage> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)
  if (body) form.append('body', body)

  const { data } = await api.post(`/chat/${id}`, form)
  return data.data
}

/** ფაილის წაშლა — **ორივესთან** ქრება, შეტყობინება რჩება (`DECISIONS.md` §1) */
export async function deleteAttachment(messageId: number): Promise<ChatMessage> {
  const { data } = await api.delete(`/chat/files/${messageId}`)
  return data.data
}

/** წაშლის სკოუპი (Tasks §4.6) — `self` მხოლოდ ჩემთან, `both` ორივესთან */
export const REMOVAL_SCOPES = ['self', 'both'] as const
export type RemovalScope = (typeof REMOVAL_SCOPES)[number]

/**
 * **წერილის წაშლა (Tasks §4.6).**
 *
 * ⚠️ **`scope` სავალდებულოა** — არჩევანი მომხმარებელს ეკითხება; „ვივარაუდოთ
 * ორივესთან" სწორედ ის ძველი ქცევაა, რომელიც ამ თასქმა შეცვალა.
 *
 * ⚠️ **რიგი ბაზაში რჩება** (აღდგენისთვის), ე.ი. ეს დამალვაა და არა `delete`.
 * `both` მხოლოდ ავტორს შეუძლია — სხვაგვარად backend 403-ს აბრუნებს.
 */
export async function deleteMessage(messageId: number, scope: RemovalScope): Promise<void> {
  await api.delete(`/chat/messages/${messageId}`, { data: { scope } })
}

/** ფაილიდან შეტყობინების ტიპი — backend იმავე სამ ჯგუფს იცნობს */
export function mediaTypeOf(file: File): MediaMessageType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'

  return 'file'
}

/** დაბლოკვა **ადამიანზეა** და არა საუბარზე — დაბლოკილი ვერც ახალს დაიწყებს */
export async function setBlocked(username: string, blocked: boolean): Promise<boolean> {
  const { data } = await api.put(`/chat/block/${encodeURIComponent(username)}`, { blocked })
  return data.blocked as boolean
}

/* ---------- ჩანაწერის გაზიარება (FEAT-13) ---------- */

/**
 * ჩანაწერის გაგზავნა ბარათად.
 *
 * ⚠️ **იმავე endpoint-ზეა, რაზეც ტექსტი და ფაილი** — `domain`-ის არსებობა
 * წყვეტს, რომელია. ცალკე მისამართი დაბლოკვისა და საჯაროობის კარიბჭეს
 * მესამედ გაიმეორებდა.
 */
export async function shareRecord(
  conversationId: number,
  domain: string,
  recordId: number,
  body?: string,
): Promise<ChatMessage> {
  const { data } = await api.post(`/chat/${conversationId}`, {
    domain,
    record_id: recordId,
    ...(body ? { body } : {}),
  })

  return data.data as ChatMessage
}

/**
 * „დაამატე ჩემთანაც".
 *
 * ⚠️ **იდენტობით ემატება და არა `id`-ით** — გამგზავნის ბიბლიოთეკის ნომერი
 * მიმღებთან არაფერს ნიშნავს; `tmdb_id`/`url`/`platform`+`external_id`
 * არის ის, რაც ორ ანგარიშს შორის ერთსა და იმავე ნივთს აღნიშნავს.
 */
export async function saveSharedRecord(
  messageId: number,
): Promise<{ created: boolean; id: number; domain: string }> {
  const { data } = await api.post(`/chat/messages/${messageId}/save`)
  return data
}
