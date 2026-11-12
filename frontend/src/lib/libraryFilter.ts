import type { TFunction } from 'i18next'
import type { MediaFilters } from '@/api/media'
import type { Genre } from '@/api/types'
import { genreName } from '@/lib/display'
import { straightenRanges } from '@/lib/filters'
import type { PickFilterChip } from '@/lib/pick'
import { drillChips, drillLabel } from '@/lib/statsLinks'

/* ============================================================
   ფილმის · სერიალის · ანიმეს ფილტრი — ერთი აღწერა სიის პანელისა და
   „რა ვნახო დღეს" ფანჯრისთვის.

   ⚠️ ფანჯარა სიის ფილტრის **ასლზე** მუშაობს (`LibraryPickFilter`): იგივე ველები,
   იგივე ჩიპები, მაგრამ ცვლილება მისამართში არ იწერება.
   ============================================================ */

export interface Ranges {
  yearMin: string
  yearMax: string
  /** TMDB-ის რეიტინგი */
  ratingMin: string
  ratingMax: string
  /** ჩემი ქულა — ცალკე დიაპაზონი, TMDB-ისას არ ერევა */
  myRatingMin: string
  myRatingMax: string
}

const EMPTY_RANGES: Ranges = {
  yearMin: '',
  yearMax: '',
  ratingMin: '',
  ratingMax: '',
  myRatingMin: '',
  myRatingMax: '',
}

/** „დან – მდე" წყვილები — შებრუნებული წყვილი გაშვებისას თავისით გადაისმება */
export const RANGE_PAIRS: readonly [keyof Ranges, keyof Ranges][] = [
  ['yearMin', 'yearMax'],
  ['ratingMin', 'ratingMax'],
  ['myRatingMin', 'myRatingMax'],
]

/** რამდენიმე ჟანრი: ერთი მაინც (`any`) თუ ყველა ერთად (`all`) */
export const GENRE_MODES = ['any', 'all'] as const
export type GenreMode = (typeof GENRE_MODES)[number]

/**
 * პანელის მონახაზი — ჯერ გაუშვებელი მონიშვნები.
 * სტატუსი **აქ არ არის**: ის სექციიდან/`?view=`-იდან მოდის.
 */
export interface LibraryDraft {
  genres: string[]
  ranges: Ranges
}

export const EMPTY_DRAFT: LibraryDraft = { genres: [], ranges: EMPTY_RANGES }

/** „რა ვნახო დღეს" ფანჯრის ფილტრი: პანელის ველები + ის, რაც სიას პანელის გარეთ ავიწროებს */
export interface LibraryPickFilter extends LibraryDraft {
  q: string
  genreMode: GenreMode
  favorite: boolean
  /** სტატისტიკის ზოლიდან მოსული ჭრილი (თვე) */
  drill: Record<string, string>
}

export const EMPTY_PICK_FILTER: LibraryPickFilter = {
  ...EMPTY_DRAFT,
  q: '',
  genreMode: 'any',
  favorite: false,
  drill: {},
}

const num = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)

/** ფანჯრის ფილტრი → სიის API-ის პარამეტრები (სტატუსს ფანჯრის ჩიპები წყვეტენ) */
export function pickFilterParams(filter: LibraryPickFilter): MediaFilters {
  const ranges = straightenRanges(filter.ranges, RANGE_PAIRS)

  return {
    q: filter.q.trim() || undefined,
    genre: filter.genres.length ? filter.genres.join(',') : undefined,
    genre_mode: filter.genres.length > 1 && filter.genreMode === 'all' ? 'all' : undefined,
    favorite: filter.favorite || undefined,
    year_min: num(ranges.yearMin),
    year_max: num(ranges.yearMax),
    rating_min: num(ranges.ratingMin),
    rating_max: num(ranges.ratingMax),
    my_rating_min: num(ranges.myRatingMin),
    my_rating_max: num(ranges.myRatingMax),
    ...filter.drill,
  }
}

/** „2000–2010" · „≥ 2000" · „≤ 2010" */
function rangeText(min: string, max: string): string {
  const from = min.trim()
  const to = max.trim()

  return from && to ? (from === to ? from : `${from}–${to}`) : from ? `≥ ${from}` : `≤ ${to}`
}

/** ფანჯრის ფილტრის პირობები ჩიპებად — თითო ✕-ით იხსნება */
export function pickFilterChips(
  filter: LibraryPickFilter,
  { genres, lang, t }: { genres: Genre[]; lang: string; t: TFunction },
): PickFilterChip<LibraryPickFilter>[] {
  const chips: PickFilterChip<LibraryPickFilter>[] = []

  if (filter.q.trim()) {
    chips.push({ key: 'q', label: t('pick.chip.search', { query: filter.q.trim() }), without: { ...filter, q: '' } })
  }
  if (filter.favorite) {
    chips.push({ key: 'favorite', label: t('filter.favorite'), without: { ...filter, favorite: false } })
  }

  for (const slug of filter.genres) {
    const genre = genres.find((g) => g.slug === slug)
    chips.push({
      key: `genre-${slug}`,
      label: genre ? genreName(genre, lang) : slug,
      without: { ...filter, genres: filter.genres.filter((g) => g !== slug) },
    })
  }
  if (filter.genres.length > 1 && filter.genreMode === 'all') {
    chips.push({ key: 'genre-mode', label: t('pick.chip.allGenres'), without: { ...filter, genreMode: 'any' } })
  }

  // წარწერა იმას აჩვენებს, რაც სერვერთან მიდის — შებრუნებული წყვილი გადასმულია
  const straight = straightenRanges(filter.ranges, RANGE_PAIRS)
  const range = (key: string, label: string, from: keyof Ranges, to: keyof Ranges) => {
    if (!filter.ranges[from].trim() && !filter.ranges[to].trim()) return
    chips.push({
      key,
      label: `${label}: ${rangeText(straight[from], straight[to])}`,
      without: { ...filter, ranges: { ...filter.ranges, [from]: '', [to]: '' } },
    })
  }
  range('year', t('filter.year'), 'yearMin', 'yearMax')
  range('rating', t('filter.tmdbRating'), 'ratingMin', 'ratingMax')
  range('my-rating', t('filter.myRating'), 'myRatingMin', 'myRatingMax')

  for (const chip of drillChips(filter.drill)) {
    chips.push({
      key: `drill-${chip.kind}`,
      label: drillLabel(chip, t),
      without: {
        ...filter,
        drill: Object.fromEntries(Object.entries(filter.drill).filter(([key]) => !chip.keys.includes(key))),
      },
    })
  }

  return chips
}
