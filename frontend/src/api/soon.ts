import { api } from '@/lib/api'
import type { MediaType } from '@/lib/media'
import type { Page } from '@/lib/paged'
import type { Status } from '@/api/types'

/* ============================================================
   „მალე" — გამოუსვლელი სათაურები ფილმში, სერიალსა და ანიმეში.

   ორი სია: **ჩემი** დამატებული სათაურები, რომელთა გამოსვლა წინ არის
   (`GET /{module}/soon`), და **TMDB-ზე** გამოცხადებული, ჯერ გამოუსვლელი
   (`GET /discover/upcoming`) — იქიდან ერთი დაჭერით ემატება.
   ============================================================ */

/** თრეილერი აპის ფლეიერისთვის — `embed_url` სერვერის allowlist-ით ნაშენია */
export interface SoonTrailer {
  url: string
  embed_url: string | null
  platform: string | null
}

/**
 * რა გამოდის: `premiere` — ფილმის პრემიერა ან პირველი ეთერი; `season` — ახალი სეზონის
 * პირველი სერია; `episode` — მიმდინარე სეზონის შემდეგი სერია; `announced` — თარიღი ჯერ უცნობია.
 */
export type SoonKind = 'premiere' | 'season' | 'episode' | 'announced'

export interface SoonItem {
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  poster: string | null
  /** `YYYY-MM-DD`; `null` — მხოლოდ გამოცხადებულია */
  date: string | null
  /** რამდენი დღე დარჩა (0 — დღეს) */
  days: number | null
  kind: SoonKind
  season: number | null
  episode: number | null
  /** TMDB-ის სიტყვა — „Post Production", „Planned"… */
  tmdb_status: string | null
  trailer: SoonTrailer | null
  status: Status | null
  is_favorite: boolean
}

export interface UpcomingItem {
  tmdb_id: number
  title: string
  title_ka: string | null
  date: string | null
  poster: string
  overview: string | null
  genres: { name_en: string; name_ka: string | null }[]
  trailer: SoonTrailer | null
  /** უკვე ჩემს ბიბლიოთეკაშია */
  owned: boolean
  record_id: number | null
}

/** TMDB გვერდზე ფიქსირებულად 20 სათაურს აბრუნებს */
export const UPCOMING_PAGE_SIZE = 20

export async function fetchSoon(base: string): Promise<SoonItem[]> {
  const { data } = await api.get<{ data: SoonItem[] }>(`${base}/soon`)

  return data.data ?? []
}

export async function fetchUpcoming(type: MediaType, page: number): Promise<Page<UpcomingItem>> {
  const { data } = await api.get<{ page: number; total_pages: number; results: UpcomingItem[] }>('/discover/upcoming', {
    params: { type, page },
  })

  return {
    items: data.results ?? [],
    // TMDB ჯამს გვერდებით ამბობს — „სულ N" მიახლოებითია, ნომრები კი ზუსტი
    total: data.total_pages * UPCOMING_PAGE_SIZE,
    lastPage: Math.max(1, data.total_pages),
  }
}
