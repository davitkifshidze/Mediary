/* ============================================================
   მედია-დომენი: movie | series (მომავალში anime).
   ერთი generic UI/API ფენა მუშაობს ორივეზე ამ დესკრიპტორით.
   ============================================================ */

export type MediaType = 'movie' | 'series'

export interface MediaDescriptor {
  type: MediaType
  apiBase: string // '/movies' | '/series'
  detailBase: string // detail/new/edit ბმულების ფესვი: '/movies' | '/series'
  libraryPath: string // ბიბლიოთეკის მისამართი: '/' | '/series'
  /** /lookup და /discover-ს გადაეცემა როგორც `type` (movie-ს default-ია, ამიტომ undefined) */
  lookupType?: MediaType
}

export const MEDIA: Record<MediaType, MediaDescriptor> = {
  movie: {
    type: 'movie',
    apiBase: '/movies',
    detailBase: '/movies',
    libraryPath: '/',
  },
  series: {
    type: 'series',
    apiBase: '/series',
    detailBase: '/series',
    libraryPath: '/series',
    lookupType: 'series',
  },
}

export function mediaOf(type: MediaType): MediaDescriptor {
  return MEDIA[type]
}

/** მიმდინარე მისამართიდან დომენის ამოცნობა (series-ის მარშრუტები /series-ით იწყება) */
export function mediaFromPath(pathname: string): MediaType {
  return pathname === '/series' || pathname.startsWith('/series/') ? 'series' : 'movie'
}
