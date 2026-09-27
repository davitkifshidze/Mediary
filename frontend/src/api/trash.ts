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

/**
 * `record` — მოდულის ჩანაწერი · `item` — რიგიანი ელემენტი (ფაილი, ბმული,
 * ჩანიშვნა, შეხსენება…) · `file` — `trashed_files` · `entry` — `trash_entries`
 * (მსახიობის ბმული) · `message` — `trashed_messages` (ჩატის წერილი)
 */
export type TrashCategory = 'record' | 'item' | 'file' | 'entry' | 'message'

/** რატომ ვერ ბრუნდება — სერვერის მანქანური კოდი (`TrashBin::blocked()`) */
export type TrashBlocked =
  | 'module_disabled'
  | 'parent_blocked'
  | 'parent_missing'
  | 'slot_taken'
  | 'field_missing'
  | 'already_present'

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
  /** მომენტი, რომელიც თვითონ ელემენტია — ნახვის დრო, შეხსენების შემდეგი გაგზავნა */
  when: string | null
  /** ალბომზე — რამდენ ფოტოს დააბრუნებს აღდგენა; კლასიფიკატორზე — რამდენი ჩანაწერი გადაიტანა წაშლამ */
  count: number | null
  /** რომელ მოდულს ეკუთვნის — მრავალმოდულიან ჯგუფში (სტატუსი, ნახვა, ველის ფაილი) */
  module: string | null
  /** კლასიფიკატორის რიგი: აღდგენას შეუძლია გადატანილი ჩანაწერებიც დააბრუნოს (Tasks §29, ეტაპი 3) */
  offers_records: boolean
  /**
   * მთავარი ფოტო/ავატარი დაკავებულ სვეტში (ეტაპი 4): აღდგენა ახლანდელს
   * ჩაანაცვლებს — ის თვითონ გადავა ურნაში (29.2 — „ჯერ იკითხავს")
   */
  replaceable: boolean
  /**
   * ჩატის წერილი (ეტაპი 5): `self` — მხოლოდ ჩემთან დამალული, `both` —
   * ორივესთან წაშლილი. ⚠️ საბოლოო წაშლა მას მხოლოდ ურნიდან აშორებს —
   * წერილი დამალული რჩება.
   */
  scope: 'self' | 'both' | null
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
  /** ⚠️ ამ ანგარიშის ვადა (Tasks §29.6) და არა კოდის მუდმივა */
  keep_days: number
  /** ვადის ზედა ზღვარი — ინსტალაციისაა */
  max_days: number
  /** ⚠️ რამდენ ადგილს იკავებს ურნა — თავისუფლდება მხოლოდ საბოლოო წაშლისას (29.4) */
  bytes: number
  data: TrashGroup[]
}

export async function fetchTrash(): Promise<TrashPayload> {
  const res = await api.get('/trash')
  return res.data
}

/**
 * **ვადის შეცვლის გადახედვა** (Tasks §29.6) — რამდენი წაიშლება მომდევნო
 * ღამის გასუფთავებისას, თუ ვადა `days` იქნება.
 */
export interface TrashRetention {
  /** შეკვეცილი ვადა — ის, რაც მართლა იმოქმედებს */
  days: number
  saved_days: number
  default_days: number
  max_days: number
  /** გასუფთავების დრო (`HH:mm`) — `config('mediary.trash.prune_at')` */
  prune_at: string
  expiring: number
}

export async function fetchTrashRetention(days: number): Promise<TrashRetention> {
  const res = await api.get('/trash/retention', { params: { days } })
  return res.data
}

/**
 * აღდგენა. `records` — კლასიფიკატორის რიგზე წაშლამ გადატანილი ჩანაწერებიც
 * ბრუნდება (მხოლოდ ის, ვინც მას შემდეგ არ შეცვლილა).
 */
export async function restoreFromTrash(
  kind: string,
  id: number,
  options: { records?: boolean; replace?: boolean } = {},
): Promise<{ restored: true; with_parent: boolean; records: number }> {
  const res = await api.post(`/trash/${kind}/${id}/restore`, {
    ...(options.records ? { records: true } : {}),
    ...(options.replace ? { replace: true } : {}),
  })
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
