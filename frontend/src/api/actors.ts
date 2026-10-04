import { api } from '@/lib/api'

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
