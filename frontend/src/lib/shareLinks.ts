import type { ShareDomainSpec, ShareDomains, ShareDomainKey } from '@/api/shareLinks'
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
  classifier: ShareClassifierKind
  /** pivot — „ნებისმიერი/ყველა" მხოლოდ მას აქვს აზრი */
  multi: boolean
  /** მედიის გლობალური ჟანრი (slug); დანარჩენზე — მფლობელის ლექსიკონის id */
  global: boolean
  /** მფლობელის **საკუთარი** შეფასება (`ShareDomain::personal_rating`) */
  personalRating: boolean
  /** ბარათის ფორმა მიმღების გვერდზე */
  shape: 'poster' | 'wide' | 'photo'
  /** სიის react-query გასაღები — დამატების შემდეგ ახლდება (მოდულის გვერდი) */
  listKey: string
}

/**
 * **თითო დომენის თვისებები — `ShareDomain::DOMAINS`-ის სარკე** (§40.10).
 *
 * ⚠️ რიგები **ერთ ხაზზეა** განზრახ: `RegistryConsistencyTest` მათ წყაროდან
 * კითხულობს და სტატუსს, `multi`-ს, `global`-სა და შეფასებას backend-ს ადარებს —
 * ორი რეესტრი ერთ დღეს დაშორდებოდა და ფანჯარა სერვერის 422-ს დაიჭერდა.
 * ⚠️ `satisfies` ყოველ დომენს ითხოვს — ახალი დომენი აქ ჩაუწერლად `tsc`-ს აწითლებს.
 */
export const SHARE_DOMAIN_META = {
  movie: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, shape: 'poster', listKey: 'movie' },
  series: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, shape: 'poster', listKey: 'series' },
  anime: { status: 'dictionary', classifier: 'genre', multi: true, global: true, personalRating: false, shape: 'poster', listKey: 'anime' },
  game: { status: 'enum', classifier: 'genre', multi: true, global: false, personalRating: true, shape: 'poster', listKey: 'games' },
  book: { status: 'enum', classifier: 'genre', multi: false, global: false, personalRating: true, shape: 'poster', listKey: 'books' },
  board_game: { status: null, classifier: 'genre', multi: false, global: false, personalRating: true, shape: 'poster', listKey: 'board-games' },
  place: { status: 'enum', classifier: 'category', multi: false, global: false, personalRating: true, shape: 'photo', listKey: 'places' },
  video: { status: 'dictionary', classifier: 'type', multi: false, global: false, personalRating: false, shape: 'wide', listKey: 'videos' },
  song: { status: null, classifier: 'genre', multi: true, global: false, personalRating: true, shape: 'wide', listKey: 'songs' },
  bookmark: { status: 'dictionary', classifier: 'category', multi: false, global: false, personalRating: false, shape: 'wide', listKey: 'bookmarks' },
  course: { status: 'enum', classifier: 'category', multi: false, global: false, personalRating: false, shape: 'wide', listKey: 'courses' },
} as const satisfies Record<ShareDomainKey, ShareDomainMeta>

export function shareMeta(domain: ShareDomainKey): ShareDomainMeta {
  return SHARE_DOMAIN_META[domain]
}

export function isShareDomain(value: string): value is ShareDomainKey {
  return (SHARE_DOMAINS as readonly string[]).includes(value)
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
    // ⚠️ სტატუსის უქონელ დომენზე „სტატუსით" არ არსებობს — ნარჩენი რეჟიმი „ყველად" ბრუნდება
    const scope = spec.scope === 'status' && meta.status === null ? 'all' : spec.scope
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

  if (view === 'favorite') return { scope: 'favorite' }
  if (view && view !== 'all' && view !== 'downloaded' && meta.status !== null) {
    return { scope: 'status', statuses: [view] }
  }

  if (classifiers.length) {
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
