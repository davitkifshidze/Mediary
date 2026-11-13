import { api } from '@/lib/api'
import type { Actor } from '@/api/media'
import type { StackPreview } from '@/components/ui/photo-stack'

/* ============================================================
   **მსახიობების გვერდი `/actors`.**

   ⚠️ „ჩემი" მსახიობი — ჩემს ჩანაწერზეა ან ჩემი ფოტო აქვს; რიცხვები
   (`counts`, `records`, `photos`) ჩემი ბიბლიოთეკისაა და არა TMDB-ის
   ფილმოგრაფიის. ფილტრი, დახარისხება და გვერდები სერვერზეა — ავზი ათასობითაა.
   ============================================================ */

/**
 * მანქანური ქართული სახელის ან ბიოგრაფიის დადასტურება (`text`-ის გარეშე) ან ხელით
 * გასწორება — „გადასამოწმებელია" ნიშანი იხსნება.
 */
export async function settleActorGeorgian(id: number, field: 'name' | 'biography', text?: string): Promise<void> {
  await api.patch(`/cast/${id}/georgian`, { field, ...(text === undefined ? {} : { text }) })
}

export const ACTORS_KEY = 'actors'

/**
 * დალაგება — სერვერის `ActorIndex::SORTS`. ⚠️ რჩეულები ნებისმიერ დალაგებაზე თავშია;
 * `media` (ნაგულისხმევი) — ფოტოებისა და ვიდეო-ბმულების რაოდენობით, ტოლობისას გახსნებით.
 */
export const ACTOR_SORTS = ['media', 'opens', 'records', 'name', 'recent', 'popularity'] as const
export type ActorSort = (typeof ACTOR_SORTS)[number]

export const DEFAULT_ACTOR_SORT: ActorSort = 'media'

/** „რამდენ ჩანაწერზეა" — სერვერის `ActorIndex::RECORD_STEPS` */
export const ACTOR_RECORD_STEPS = [1, 2, 5, 10] as const

export interface ActorCard {
  id: number
  name: string
  name_ka: string | null
  photo: string | null
  /** TMDB: 1 = ქალი, 2 = კაცი */
  gender: number | null
  /** TMDB-ის `known_for_department` — „Acting", „Directing"… */
  known_for: string | null
  popularity: number | null
  has_tmdb: boolean
  /** ჩემი ხელით შექმნილი: რედაქტირდება და ურნაში იშლება */
  editable?: boolean
  /** ბიოგრაფია და ბმულები TMDB-დან ჩამოსულია */
  synced: boolean
  counts: { movie: number; series: number; anime: number }
  records: number
  /** ჩემი ფოტოები გალერეაში */
  photos: number
  /** ჩემი ვიდეო-ბმულები გალერეაში */
  videos: number
  /** ჩემი რჩეული (მსახიობი გლობალურია — ნიშანი მხოლოდ ჩემია) */
  favorite: boolean
  /** დასტის ესკიზები — მხოლოდ „გალერეის" ხედზე (`thumbs: true`) */
  thumbs?: StackPreview[]
  /** ჩემი საძიებო ტეგები */
  tags: string[]
  /* ჩემი ლოკი (მნახველისაა: სხვას მსახიობი ჩვეულებრივ უჩანს) */
  hidden?: false
  locked?: boolean
  unlocked?: boolean
  lock_hint?: string | null
  unlock_blocked_until?: string | null
}

/** დამალული (ჩაკეტილი, ამ სესიაში დაუხსნელი): მხოლოდ სახელი და ბოქლომი */
export interface HiddenActorCard {
  id: number
  name: string
  name_ka: string | null
  hidden: true
  locked: true
  unlocked: false
  lock_hint: string | null
  unlock_blocked_until: string | null
}

export type ActorListItem = ActorCard | HiddenActorCard

export interface ActorFilters {
  q?: string
  gender?: 'female' | 'male'
  tag?: string
  photos?: 'with' | 'without'
  records_min?: number
  synced?: 'yes' | 'no'
  /** მხოლოდ ჩემ მიერ ჩაკეტილები */
  locked?: boolean
  /** მხოლოდ რჩეულები */
  favorite?: boolean
  /** მხოლოდ ისინი, ვისაც ჩემი ფოტო ან ვიდეო-ბმული აქვს */
  media?: boolean
  /** დასტის ესკიზები ბარათებზე */
  thumbs?: boolean
  sort?: ActorSort
  locale?: 'ka' | 'en'
  page?: number
  per_page?: number
}

export interface ActorList {
  items: ActorListItem[]
  total: number
  page: number
  last_page: number
  per_page: number
  facets: { gender: { all: number; female: number; male: number } }
  options: { tags: string[] }
}

/** ახალი მსახიობი ან ხელით შექმნილის რედაქტირება */
export interface ActorInput {
  /** TMDB-ის პირი — საერთო ლექსიკონი (დანარჩენი ველები მაშინ არ იგზავნება) */
  tmdb_person_id?: number
  name?: string
  name_ka?: string
  gender?: number | null
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string
  biography?: string
  photo?: File | null
  remove_photo?: boolean
}

export interface SavedActor {
  actor: Actor
  /** ასეთი უკვე არსებობდა (იგივე სახელი ან TMDB-ის პირი) — ახალი არ შექმნილა */
  existing?: boolean
}

/** ⚠️ ფოტოს გამო ყოველთვის multipart; `null` ველი ცარიელ სტრიქონად მიდის (სერვერი `null`-ად კითხულობს) */
function actorForm(input: ActorInput): FormData {
  const form = new FormData()

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (key === 'photo') {
      if (value instanceof File) form.append('photo', value)
      continue
    }
    if (typeof value === 'boolean') form.append(key, value ? '1' : '0')
    else form.append(key, value === null ? '' : String(value))
  }

  return form
}

export async function createActor(input: ActorInput): Promise<SavedActor> {
  const { data } = await api.post('/cast', actorForm(input))
  return data
}

/** ⚠️ multipart-ის რედაქტირება — `POST` + `_method=PUT` (CLAUDE.md) */
export async function updateActor(id: number, input: ActorInput): Promise<SavedActor> {
  const form = actorForm(input)
  form.append('_method', 'PUT')
  const { data } = await api.post(`/cast/${id}`, form)
  return data
}

export async function fetchActors(filters: ActorFilters): Promise<ActorList> {
  const { data } = await api.get('/actors', { params: filters })
  return data
}

/** რჩეულის ნიშანი — ჩემი; სხვის სიაში არაფერი იცვლება */
export async function setActorFavorite(id: number, favorite: boolean): Promise<{ favorite: boolean }> {
  const { data } = await api.put(`/actors/${id}/favorite`, { favorite })
  return data
}

/**
 * გახსნის დათვლა — მსახიობის გვერდი იძახის. ⚠️ სერვერი ერთ მსახიობს წუთში ერთხელ ითვლის;
 * რიცხვი მხოლოდ დალაგებას ემსახურება და მხოლოდ მსახიობის გვერდის `i`-ში ჩანს.
 */
export async function countActorOpen(id: number): Promise<{ counted: boolean; opens: number }> {
  const { data } = await api.post(`/actors/${id}/open`)
  return data
}

/** გახსნების განულება — ერთ მსახიობზე ან (id-ის გარეშე) ყველაზე ერთად; რჩეულის ნიშანი რჩება */
export async function resetActorOpens(id?: number): Promise<{ reset: number }> {
  const { data } = await api.delete(id === undefined ? '/actors/opens' : `/actors/${id}/opens`)
  return data
}

/**
 * „წაშლა ჩემი ჩანაწერებიდან" — ურნაში, თითო ჩანაწერზე. `skipped` — დომენები,
 * სადაც რედაქტირების უფლება არ გაქვს (იქ ბმული რჩება).
 */
export async function detachActorEverywhere(id: number): Promise<{ removed: number; skipped: number }> {
  const { data } = await api.delete(`/actors/${id}/records`)
  return data
}

/**
 * **ხელით შექმნილი მსახიობის წაშლა ურნაში.**
 *
 * ⚠️ „წაშლა ჩემი ჩანაწერებიდან"-ისგან (`detachActorEverywhere`) განსხვავდება:
 * იქ მსახიობი რჩება, აქ კი თვითონ მიდის — ბმულებთან და ფოტოებთან ერთად,
 * ერთ ელემენტად, და ურნიდან ერთად ბრუნდება. მხოლოდ ჩემს კერძოზე (სხვაზე — 403).
 */
export async function trashActor(id: number): Promise<{ trashed: boolean; trash_id: number; links: number; photos: number }> {
  const { data } = await api.delete(`/cast/${id}`)
  return data
}
