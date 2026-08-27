export type Status = 'undecided' | 'to_watch' | 'watching' | 'watched'

export interface Genre {
  id: number
  name_en: string
  name_ka: string | null
  slug: string
  movies_count?: number
}

export interface CastMember {
  id: number
  name: string
  name_ka: string | null
  photo: string | null
  character?: string | null
  billing_order?: number
}

export interface MovieListItem {
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  rating: string | null
  poster: string | null
  status: Status
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
  imdb_id: string | null
  imdb_url: string | null
  tmdb_id: number | null
  ge_url: string | null
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
