import { api } from '@/lib/api'

/* ============================================================
   ურნა (FEAT-11 → Tasks §29).

   ⚠️ **ერთი მოთხოვნა ყველა სახეზე** — ჩანაწერები, რიგიანი ფაილები
   (გალერეის ფოტო, ვიდეო-ბმული, მოდულების ფაილები, ბაზის ასლი) და
   `trashed_files` (ჩატისა და ველის ფაილი). გვერდი ყველას ერთად ხატავს.

   ⚠️ **`kind` სერვერის სახელია** (`TrashDomain::kinds()`) — ჩანაწერზე
   მოდულის key (`movie`), ფაილზე `StorageMeter`-ის `owner_type`
   (`video_file`, `gallery_image`…).
   ============================================================ */

/** `record` — მოდულის ჩანაწერი · `item` — რიგიანი ფაილი/ბმული · `file` — `trashed_files` */
export type TrashCategory = 'record' | 'item' | 'file'

/** რატომ ვერ ბრუნდება — სერვერის მანქანური კოდი (`TrashBin::blocked()`) */
export type TrashBlocked = 'module_disabled' | 'parent_blocked' | 'parent_missing' | 'slot_taken' | 'field_missing'

export interface TrashParent {
  kind: string
  id: number
  title: string
  /** ⚠️ თუ მშობელიც ურნაშია, აღდგენა მასაც დააბრუნებს (29.5) */
  trashed: boolean
}

export interface TrashItem {
  id: number
  title: string
  /** მშობელი ჩანაწერი ან ალბომი */
  subtitle: string | null
  trashed_at: string | null
  /** რამდენი დღე რჩება საბოლოო წაშლამდე — **სერვერი ითვლის** */
  expires_in_days: number
  /** ბაიტები; ჩანაწერზე — მისი ფაილების ჯამი (29.4) */
  size: number
  /**
   * ესკიზი. `private` — ურნის საკუთარი მარშრუტით (`/trash/{kind}/{id}/file`)
   * და ბლობად; სხვაგვარად `src` დისკის გზაა ან დაშორებული ბმული.
   */
  preview: { src: string; private: boolean } | null
  /** ჩაკეტილი ალბომის ფოტო — ესკიზი არ იგზავნება (29.5) */
  locked: boolean
  parent: TrashParent | null
  restorable: boolean
  blocked: TrashBlocked | null
}

export interface TrashGroup {
  kind: string
  category: TrashCategory
  /** მოდულის key ან ფსევდო-მოდული (`backup`, `chat`) — ფერი და ხატულა */
  module: string | null
  /** მხოლოდ ჩანაწერებზე; დანარჩენის სახელი i18n-შია (`trash.kinds.*`) */
  name_ka: string | null
  name_en: string | null
  icon: string | null
  color: string | null
  total: number
  bytes: number
  items: TrashItem[]
}

export interface TrashPayload {
  keep_days: number
  /** ⚠️ რამდენ ადგილს იკავებს ურნა — თავისუფლდება მხოლოდ საბოლოო წაშლისას (29.4) */
  bytes: number
  data: TrashGroup[]
}

export async function fetchTrash(): Promise<TrashPayload> {
  const res = await api.get('/trash')
  return res.data
}

export async function restoreFromTrash(kind: string, id: number): Promise<{ restored: true; with_parent: boolean }> {
  const res = await api.post(`/trash/${kind}/${id}/restore`)
  return res.data
}

export async function deleteFromTrash(kind: string, id: number): Promise<void> {
  await api.delete(`/trash/${kind}/${id}`)
}

/**
 * ურნის დაცლა.
 *
 * ⚠️ **`confirm` არგუმენტია და არა აქ ჩაწერილი.** სერვერი აკრეფილ `DELETE`-ს
 * ითხოვს; ავტომატურად გაგზავნა იმ გარანტიას გააუქმებდა, რომლისთვისაც ის
 * არსებობს — ზუსტად ის წესი, რაც ასლის ცხრილის აღდგენას აქვს.
 */
export async function emptyTrash(confirm: string, domain?: string): Promise<{ deleted: number }> {
  const res = await api.delete('/trash', { data: { confirm, ...(domain ? { domain } : {}) } })
  return res.data
}
