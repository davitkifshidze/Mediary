/* ============================================================
   მედია-დომენი: movie | series | anime.
   ერთი generic UI/API ფენა მუშაობს სამივეზე ამ დესკრიპტორით.

   ⚠️ **ანიმე მესამე დომენად ჯდება და არა მესამე ფორმად** (Tasks §7.1):
   ერთი და იმავე გვერდის მესამედ დაწერა §2-ის წესს („ერთი საერთო
   კომპონენტი") არღვევდა. Backend-ზე მისი სარკეა `App\Support\MediaDomain`.
   ============================================================ */

export type MediaType = 'movie' | 'series' | 'anime'

export interface MediaDescriptor {
  type: MediaType
  apiBase: string // '/movies' | '/series' | '/anime'
  detailBase: string // detail/new/edit ბმულების ფესვი
  libraryPath: string // ბიბლიოთეკის მისამართი
  /** /lookup და /discover-ს გადაეცემა როგორც `type` (movie-ს default-ია, ამიტომ undefined) */
  lookupType?: MediaType
}

export const MEDIA: Record<MediaType, MediaDescriptor> = {
  movie: {
    type: 'movie',
    apiBase: '/movies',
    detailBase: '/movies',
    // Tasks 2.2 — `/` დეშბორდისაა; ბიბლიოთეკა `/movies`-ზეა, სერიალების ანალოგიით
    libraryPath: '/movies',
  },
  series: {
    type: 'series',
    apiBase: '/series',
    detailBase: '/series',
    libraryPath: '/series',
    lookupType: 'series',
  },
  anime: {
    type: 'anime',
    // ⚠️ **მხოლობითი** — `modules.route_base`/`api_base` სწორედ `/anime`-ია
    apiBase: '/anime',
    detailBase: '/anime',
    libraryPath: '/anime',
    lookupType: 'anime',
  },
}

export function mediaOf(type: MediaType): MediaDescriptor {
  return MEDIA[type]
}

/**
 * მიმდინარე მისამართიდან დომენის ამოცნობა.
 * ⚠️ `/` აღარ ნიშნავს ფილმს (Tasks 2.2) — ის დეშბორდია, ე.ი. აქ `null` ბრუნდება.
 */
export function mediaFromPath(pathname: string): MediaType | null {
  for (const d of Object.values(MEDIA)) {
    if (pathname === d.libraryPath || pathname.startsWith(`${d.detailBase}/`)) return d.type
  }

  return null
}

/**
 * ჩანაწერის დეტალური/რედაქტირების გვერდია? (/movies/12, /series/3/edit, /anime/7)
 * ⚠️ შაბლონი **`MEDIA`-დან** იგება და არა ხელით ჩამოწერილი — მესამე დომენის
 * დამატებისას ჩუმად გამორჩენა სწორედ ასეთ regex-ებში ხდება.
 */
const DETAIL_RE = new RegExp(
  `^(${Object.values(MEDIA)
    .map((d) => d.detailBase.replace('/', '\\/'))
    .join('|')})\\/\\d+`,
)

export function isDetailPath(path: string): boolean {
  return DETAIL_RE.test(path)
}

/**
 * ცარიელი `Record<MediaType, T[]>` — ჩანაწერების არჩევანის საწყისი
 * მდგომარეობა (სინქრონი, თარგმანი, ჟანრის მიბმა).
 *
 * ⚠️ ხელით `{ movie: [], series: [] }` სამივე ადგილას ეწერა და მესამე
 * დომენის დამატებისას სამივე გატყდა — რაც კარგია (tsc-მ დაიჭირა), მაგრამ
 * მეოთხეზე იგივე გამეორდებოდა.
 */
export function emptyMediaIds<T = number>(): Record<MediaType, T[]> {
  return Object.fromEntries(Object.keys(MEDIA).map((k) => [k, [] as T[]])) as unknown as Record<
    MediaType,
    T[]
  >
}

/**
 * **დომენური i18n სუფიქსი.** ფილმი უსუფიქსოა (ისტორიულად ის იყო პირველი),
 * სერიალი `Series`, ანიმე `Anime` — ე.ი. `toast.deleted` / `toast.deletedSeries`
 * / `toast.deletedAnime`.
 *
 * ⚠️ ეს ჰელპერი იმისთვისაა, რომ `type === 'series' ? a : b` სახის ტერნარები
 * აღარსად დარჩეს: მესამე დომენზე ისინი **ჩუმად** ფილმის ტექსტს აჩვენებდნენ.
 */
const MEDIA_SUFFIX: Record<MediaType, string> = {
  movie: '',
  series: 'Series',
  anime: 'Anime',
}

export function mediaKey(base: string, type: MediaType): string {
  return `${base}${MEDIA_SUFFIX[type]}`
}

/** დომენის სახელი გვერდით მენიუს ლექსიკონიდან */
export const MEDIA_NAV_KEY: Record<MediaType, string> = {
  movie: 'nav.movies',
  series: 'nav.series',
  anime: 'nav.anime',
}
