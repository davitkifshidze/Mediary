import { api } from '@/lib/api'
import type { Actor } from '@/api/media'

/* ============================================================
   **მსახიობების გვერდი `/actors` (Tasks §35.2).**

   ⚠️ „ჩემი" მსახიობი — ჩემს ჩანაწერზეა ან ჩემი ფოტო აქვს; რიცხვები
   (`counts`, `records`, `photos`) ჩემი ბიბლიოთეკისაა და არა TMDB-ის
   ფილმოგრაფიის. ფილტრი, დახარისხება და გვერდები სერვერზეა — ავზი ათასობითაა.
   ============================================================ */

export const ACTORS_KEY = 'actors'

export const ACTOR_SORTS = ['name', 'records', 'popularity', 'recent'] as const
export type ActorSort = (typeof ACTOR_SORTS)[number]

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
  /** ბიოგრაფია და ბმულები TMDB-დან ჩამოსულია (§8.1) */
  synced: boolean
  counts: { movie: number; series: number; anime: number }
  records: number
  /** ჩემი ფოტოები გალერეაში */
  photos: number
  /** ჩემი საძიებო ტეგები (§7.5) */
  tags: string[]
}

export interface ActorFilters {
  q?: string
  gender?: 'female' | 'male'
  known_for?: string
  tag?: string
  photos?: 'with' | 'without'
  records_min?: number
  synced?: 'yes' | 'no'
  sort?: ActorSort
  locale?: 'ka' | 'en'
  page?: number
  per_page?: number
}

export interface ActorList {
  items: ActorCard[]
  total: number
  page: number
  last_page: number
  per_page: number
  facets: { gender: { all: number; female: number; male: number } }
  options: { known_for: string[]; tags: string[] }
}

/** Tasks §35.3 — ახალი მსახიობი ან ხელით შექმნილის რედაქტირება */
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

/**
 * „წაშლა ჩემი ჩანაწერებიდან" — ურნაში, თითო ჩანაწერზე. `skipped` — დომენები,
 * სადაც რედაქტირების უფლება არ გაქვს (იქ ბმული რჩება).
 */
export async function detachActorEverywhere(id: number): Promise<{ removed: number; skipped: number }> {
  const { data } = await api.delete(`/actors/${id}/records`)
  return data
}
