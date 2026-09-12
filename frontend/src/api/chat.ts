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

export const MESSAGE_TYPES = ['text', 'emoji', 'gif', 'image', 'video', 'file'] as const
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
  created_at: string | null
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
  last_message_at: string | null
}

export interface ChatThread {
  data: ChatMessage[]
  meta: { current_page: number; last_page: number; total: number }
  profile: Profile | null
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

export async function fetchThread(id: number, page = 1): Promise<ChatThread> {
  const { data } = await api.get(`/chat/${id}`, { params: { page } })
  return data
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

/** ⚠️ `PATCH` — POST-ს backend-ის `permission:` middleware `create`-ად წაიკითხავდა */
export async function markThreadRead(id: number): Promise<void> {
  await api.patch(`/chat/${id}/read`)
}

/** დაბლოკვა **ადამიანზეა** და არა საუბარზე — დაბლოკილი ვერც ახალს დაიწყებს */
export async function setBlocked(username: string, blocked: boolean): Promise<boolean> {
  const { data } = await api.put(`/chat/block/${encodeURIComponent(username)}`, { blocked })
  return data.blocked as boolean
}
