import type { ShareDomainSpec, ShareDomains, ShareDomainKey, ShareScopeMode } from '@/api/shareLinks'
import { SHARE_DOMAINS } from '@/api/shareLinks'

/* ============================================================
   გაზიარების ბმულის სუფთა წესები (Tasks §40) — ტესტირებადი.
   ============================================================ */

/** სტატუსის მექანიზმი — `ShareDomain::statusKind()`-ის სარკე */
export type ShareStatusKind = 'dictionary' | 'enum' | null

/** რას ჰქვია კლასიფიკატორი ამ დომენში — ფანჯრისა და ფილტრის სიტყვა */
export type ShareClassifierKind = 'genre' | 'category' | 'type'

export interface ShareDomainMeta {
  status: ShareStatusKind
  /** `null` — კლასიფიკატორი არ აქვს (პლეილისტი, §40.13) */
  classifier: ShareClassifierKind | null
  /** pivot — „ნებისმიერი/ყველა" მხოლოდ მას აქვს აზრი */
  multi: boolean
  /** მედიის გლობალური ჟანრი (slug); დანარჩენზე — მფლობელის ლექსიკონის id */
  global: boolean
  /** მფლობელის **საკუთარი** შეფასება (`ShareDomain::personal_rating`) */
  personalRating: boolean
  /** „რჩეული" (`is_favorite`) — პლეილისტს არ აქვს */
  favorite: boolean
  /** რომელი მოდულის უფლება და ფერი — პლეილისტი `song`-ისაა */
  module: string
  /** ბარათის ფორმა მიმღების გვერდზე */
  shape: 'poster' | 'wide' | 'photo'
  /** სიების react-query გასაღები — დამატების შემდეგ ახლდება (მოდულის გვერდი) */
  listKeys: readonly string[]
}

/**
 * **თითო დომენის თვისებები — `ShareDomain::DOMAINS`-ის სარკე** (§40.10, §40.13).
 *
 * ⚠️ რიგები **ერთ ხაზზეა** განზრახ: `RegistryConsistencyTest` მათ წყაროდან
 * კითხულობს და სტატუსს, კლასიფიკატორს, `multi`-ს, `global`-ს, შეფასებას,
 * „რჩეულსა" და მოდულს backend-ს ადარებს — ორი რეესტრი ერთ დღეს დაშორდებოდა
 * და ფანჯარა სერვერის 422-ს დაიჭერდა.
 * ⚠️ `satisfies` ყოველ დომენს ითხოვს — ახალი დომენი აქ ჩაუწერლად `tsc`-ს აწითლებს.
 */
export const SHARE_DOMAIN_META = {
  movie: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, favorite: true, module: 'movie', shape: 'poster', listKeys: ['movie'] },
  series: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, favorite: true, module: 'series', shape: 'poster', listKeys: ['series'] },
  anime: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, favorite: true, module: 'anime', shape: 'poster', listKeys: ['anime'] },
  game: { status: 'enum', classifier: 'genre', multi: true, global: false, personalRating: true, favorite: true, module: 'game', shape: 'poster', listKeys: ['games'] },
  book: { status: 'enum', classifier: 'genre', multi: false, global: false, personalRating: true, favorite: true, module: 'book', shape: 'poster', listKeys: ['books'] },
  board_game: { status: null, classifier: 'genre', multi: false, global: false, personalRating: true, favorite: true, module: 'board_game', shape: 'poster', listKeys: ['board-games'] },
  place: { status: 'enum', classifier: 'category', multi: false, global: false, personalRating: true, favorite: true, module: 'place', shape: 'photo', listKeys: ['places'] },
  video: { status: 'dictionary', classifier: 'type', multi: false, global: false, personalRating: false, favorite: true, module: 'video', shape: 'wide', listKeys: ['videos'] },
  song: { status: null, classifier: 'genre', multi: true, global: false, personalRating: true, favorite: true, module: 'song', shape: 'wide', listKeys: ['songs'] },
  playlist: { status: null, classifier: null, multi: false, global: false, personalRating: false, favorite: false, module: 'song', shape: 'poster', listKeys: ['playlists', 'songs'] },
  bookmark: { status: 'dictionary', classifier: 'category', multi: false, global: false, personalRating: false, favorite: true, module: 'bookmark', shape: 'wide', listKeys: ['bookmarks'] },
  course: { status: 'enum', classifier: 'category', multi: false, global: false, personalRating: false, favorite: true, module: 'course', shape: 'wide', listKeys: ['courses'] },
} as const satisfies Record<ShareDomainKey, ShareDomainMeta>

export function shareMeta(domain: ShareDomainKey): ShareDomainMeta {
  return SHARE_DOMAIN_META[domain]
}

/**
 * **რომელი ფარგალი არსებობს ამ დომენზე** — `ShareDomain::modes()`-ის სარკე.
 * ⚠️ სხვა რეჟიმს სერვერი `share_scope_unsupported`-ით (422) აბრუნებს.
 */
export function shareModes(domain: ShareDomainKey): ShareScopeMode[] {
  const meta = SHARE_DOMAIN_META[domain]
  const modes: ShareScopeMode[] = ['all']

  if (meta.status !== null) modes.push('status')
  if (meta.favorite) modes.push('favorite')
  if (meta.classifier !== null) modes.push('genre')
  modes.push('ids')

  return modes
}

/**
 * **სრულია თუ არა სექციის არჩევანი.**
 *
 * ⚠️ სერვერის `share_scope_incomplete`-ის ტყუპია: „სტატუსით" არცერთი
 * სტატუსის გარეშე, „ჟანრით" — არცერთი ჟანრის, „კონკრეტული" — არცერთი
 * ჩანაწერის გარეშე **არაფერს** ნიშნავს და არა „ყველაფერს". ღილაკი ამიტომ
 * ითიშება, სანამ მოთხოვნა 422-ზე წაიქცეოდა. ⚠️ კლასიფიკატორის ველი დომენზეა
 * დამოკიდებული: მედიაზე `genres` (slug), დანარჩენზე `categories` (id).
 */
export function specComplete(spec: ShareDomainSpec, domain?: ShareDomainKey): boolean {
  switch (spec.scope) {
    case 'status':
      return (spec.statuses?.length ?? 0) > 0
    case 'genre':
      return domain && !SHARE_DOMAIN_META[domain].global
        ? (spec.categories?.length ?? 0) > 0
        : (spec.genres?.length ?? 0) > 0
    case 'ids':
      return (spec.ids?.length ?? 0) > 0
    default:
      return true
  }
}

/**
 * მხოლოდ არჩეული სექციები და მხოლოდ თავისი რეჟიმის ველები — სერვერი
 * ზედმეტს ისედაც უგულებელყოფს, მაგრამ წინასწარი რიცხვის ქეშის გასაღები
 * ნარჩენით (წინა რეჟიმის სტატუსები) ზედმეტად გაიყოფოდა.
 *
 * ⚠️ „ყველა ერთდროულად" მხოლოდ pivot-იან დომენზე იგზავნება — ერთ სვეტს ორი
 * სხვადასხვა მნიშვნელობა ვერ ექნება (სერვერი მას ისედაც `any`-ად აქცევს).
 */
export function buildDomains(selected: ShareDomainKey[], specs: Partial<Record<ShareDomainKey, ShareDomainSpec>>): ShareDomains {
  const out: ShareDomains = {}

  for (const domain of SHARE_DOMAINS) {
    if (!selected.includes(domain)) continue

    const meta = SHARE_DOMAIN_META[domain]
    const spec = specs[domain] ?? { scope: 'all' }
    // ⚠️ დომენზე არარსებული რეჟიმი (სტატუსის უქონელზე „სტატუსით", პლეილისტზე „რჩეული") „ყველად" ბრუნდება
    const scope = shareModes(domain).includes(spec.scope) ? spec.scope : 'all'
    const clean: ShareDomainSpec = { scope, public_only: !!spec.public_only }

    if (scope === 'status') clean.statuses = spec.statuses ?? []
    if (scope === 'genre') {
      if (meta.global) clean.genres = spec.genres ?? []
      else clean.categories = spec.categories ?? []
      clean.genre_mode = meta.multi ? (spec.genre_mode ?? 'any') : 'any'
    }
    if (scope === 'ids') clean.ids = spec.ids ?? []

    out[domain] = clean
  }

  return out
}

/**
 * **„ეს სია გაუზიარე"** — მოდულის გვერდის მიმდინარე ფილტრიდან სექციის ფარგლები.
 *
 * ⚠️ ბმულის ფარგალი **ერთი** პირობაა (Tasks §40.3 — შენი ჩამონათვალი
 * „ან"-ებით: სტატუსი, ან კატეგორია, ან რჩეულები…). ორივე თუ არის არჩეული,
 * **განყოფილება იმარჯვებს** (საიდბარის სტატუსი — „სად ვარ"), ფანჯარა კი
 * არჩევანს ცხადად აჩვენებს და შეცვლა იქვე შეიძლება.
 * ⚠️ სიის ფილტრი pivot-ზე **„და"**-თია (`Controller::slugList()`), ერთ სვეტზე
 * კი „ან"-ით (`whereIn`) — ამიტომ `genre_mode` დომენის სტრუქტურას მიჰყვება,
 * თორემ ბმულში სხვა სია მოხვდებოდა.
 * ⚠️ `view`-ში სტატუსი მხოლოდ სტატუსიან დომენზეა — სიმღერისა და სამაგიდოს
 * განყოფილება „ყველა"/„რჩეული"-ა.
 */
export function librarySpec(
  domain: ShareDomainKey,
  view: string | null | undefined,
  classifiers: readonly string[] = [],
): ShareDomainSpec {
  const meta = SHARE_DOMAIN_META[domain]

  if (view === 'favorite' && meta.favorite) return { scope: 'favorite' }
  if (view && view !== 'all' && view !== 'downloaded' && view !== 'favorite' && meta.status !== null) {
    return { scope: 'status', statuses: [view] }
  }

  if (classifiers.length && meta.classifier !== null) {
    const mode = meta.multi ? 'all' : 'any'

    if (meta.global) return { scope: 'genre', genres: [...classifiers], genre_mode: mode }

    const ids = classifiers.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    if (ids.length) return { scope: 'genre', categories: ids, genre_mode: mode }
  }

  return { scope: 'all' }
}

/**
 * ბარათისა და ფილტრის კლასიფიკატორის სახელი ენით. ⚠️ ორივე მხარე შეიძლება
 * ცარიელი იყოს (გლობალურ ჟანრს ქართული ხშირად არ აქვს), ამიტომ არა
 * `genreName()` — მისი ტიპი ინგლისურს სავალდებულოდ თვლის.
 */
export function shareGenreName(g: { name_ka: string | null; name_en: string | null }, lang: string): string {
  return (lang === 'ka' ? g.name_ka || g.name_en : g.name_en || g.name_ka) || ''
}

/** ტოკენი ბმულიდან (`…/share/{token}`) — „მიმღების თვალით" გახსნისთვის */
export function shareTokenOf(url: string | null): string | null {
  if (!url) return null
  const match = /\/share\/([A-Za-z0-9]+)\/?$/.exec(url)

  return match ? match[1] : null
}
