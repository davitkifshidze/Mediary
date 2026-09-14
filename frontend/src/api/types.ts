/**
 * **სტატუსის „მნიშვნელობა" (Tasks §6.4).**
 *
 * ⚠️ სახელი per-user-ია და გადაერქმევა, ე.ი. ლოგიკა მასზე ვერ დგება.
 * სამი ადგილი სწორედ ამას კითხულობს: „ორივემ ნანახი" (`MatchPanel`),
 * მასობრივი წაშლა და ფრანჩაიზის ბეჯი.
 */
export type StatusRole = 'todo' | 'doing' | 'done'

/**
 * **ჩანაწერის სტატუსი — ლექსიკონის რიგი და არა სტრიქონი (Tasks §6.4).**
 *
 * ⚠️ ობიექტი იმიტომაა, რომ სახელი **მფლობელის** ლექსიკონშია: უცხო პროფილზე
 * მხოლოდ გასაღები („watched") წასაკითხი არ იქნებოდა, ორივეს ცალკე ველად
 * დაბრუნება კი ერთსა და იმავე ფაქტს ორ ადგილას გაიმეორებდა.
 *
 * ⚠️ `null` კანონიერია — ლექსიკონში ყველაფერი იშლება, ე.ი. ჩანაწერი
 * სტატუსის გარეშეც არსებობს.
 */
export interface Status {
  id: number
  /** ⚠️ არასდროს იცვლება — გადარქმევა `name_*`-ს ეხება */
  key: string
  module: string
  name_ka: string
  name_en: string
  role: StatusRole
  icon: string | null
  color: string | null
  is_default: boolean
  sort_order: number
  /** მხოლოდ ლექსიკონის სიაში მოდის (ჩანაწერის შიგნით — არა) */
  records_count?: number
}

export interface Genre {
  id: number
  name_en: string
  name_ka: string | null
  slug: string
  movies_count?: number
  series_count?: number
}

export interface CastMember {
  id: number
  name: string
  name_ka: string | null
  photo: string | null
  character?: string | null
  billing_order?: number
  /** TMDB-ის კოდირება: 1 = ქალი, 2 = კაცი */
  gender?: number | null
  has_tmdb?: boolean
  /** ეტაპი 1 — ეს ბმული ხელით გაკეთდა და `/sync` მას აღარ შლის */
  is_manual?: boolean
}

export interface MovieListItem {
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  rating: string | null
  poster: string | null
  status: Status | null
  is_favorite: boolean
  description_ka?: string | null
  description_en?: string | null
  collection_id?: number | null
  collection_name?: string | null
  franchise_next?: boolean
  seasons?: number | null
  episodes?: number | null
  genres: Genre[]
  missing?: string[]
}

export interface Movie extends MovieListItem {
  /** Tasks 16.1 — ხილვადობა საჯარო პროფილზე; `private` default */
  visibility: 'private' | 'public'
  imdb_id: string | null
  imdb_url: string | null
  tmdb_id: number | null
  ge_url: string | null
  /** ოფიციალური ტრეილერი (Tasks 9) */
  trailer_url: string | null
  /** backend-ის allowlist-ით აწყობილი embed — თვითნებური HTML არასდროს */
  trailer_embed_url: string | null
  description_ka: string | null
  description_en: string | null
  description_ka_source: string | null
  description_en_source: string | null
  runtime: number | null
  seasons?: number | null
  episodes?: number | null
  cast: CastMember[]
  sync_status: string
  watched_at: string | null
  created_at: string
}
