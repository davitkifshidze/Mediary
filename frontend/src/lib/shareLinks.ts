import type { ShareDomainSpec, ShareDomains, ShareDomainKey } from '@/api/shareLinks'
import { SHARE_DOMAINS } from '@/api/shareLinks'

/* ============================================================
   გაზიარების ბმულის სუფთა წესები (Tasks §40) — ტესტირებადი.
   ============================================================ */

export function isShareDomain(value: string): value is ShareDomainKey {
  return (SHARE_DOMAINS as readonly string[]).includes(value)
}

/**
 * **სრულია თუ არა სექციის არჩევანი.**
 *
 * ⚠️ სერვერის `share_scope_incomplete`-ის ტყუპია: „სტატუსით" არცერთი
 * სტატუსის გარეშე, „ჟანრით" — არცერთი ჟანრის, „კონკრეტული" — არცერთი
 * ჩანაწერის გარეშე **არაფერს** ნიშნავს და არა „ყველაფერს". ღილაკი ამიტომ
 * ითიშება, სანამ მოთხოვნა 422-ზე წაიქცეოდა.
 */
export function specComplete(spec: ShareDomainSpec): boolean {
  switch (spec.scope) {
    case 'status':
      return (spec.statuses?.length ?? 0) > 0
    case 'genre':
      return (spec.genres?.length ?? 0) > 0
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
 */
export function buildDomains(selected: ShareDomainKey[], specs: Partial<Record<ShareDomainKey, ShareDomainSpec>>): ShareDomains {
  const out: ShareDomains = {}

  for (const domain of SHARE_DOMAINS) {
    if (!selected.includes(domain)) continue

    const spec = specs[domain] ?? { scope: 'all' }
    const clean: ShareDomainSpec = { scope: spec.scope, public_only: !!spec.public_only }

    if (spec.scope === 'status') clean.statuses = spec.statuses ?? []
    if (spec.scope === 'genre') {
      clean.genres = spec.genres ?? []
      clean.genre_mode = spec.genre_mode ?? 'any'
    }
    if (spec.scope === 'ids') clean.ids = spec.ids ?? []

    out[domain] = clean
  }

  return out
}

/**
 * **„ეს სია გაუზიარე"** — ბიბლიოთეკის გვერდის მიმდინარე ფილტრიდან სექციის
 * ფარგლები.
 *
 * ⚠️ ბმულის ფარგალი **ერთი** პირობაა (Tasks §40.3 — შენი ჩამონათვალი
 * „ან"-ებით: სტატუსი, ან კატეგორია, ან რჩეულები…). ორივე თუ არის არჩეული,
 * **განყოფილება იმარჯვებს** (საიდბარის სტატუსი — „სად ვარ"), ფანჯარა კი
 * არჩევანს ცხადად აჩვენებს და შეცვლა იქვე შეიძლება.
 * ⚠️ ბიბლიოთეკის ჟანრის ფილტრი **„და"**-თია (`Controller::slugList()`),
 * ამიტომ აქ `genre_mode = all` — თორემ ბმულში სხვა სია მოხვდებოდა.
 */
export function librarySpec(view: string | null | undefined, genres: string[]): ShareDomainSpec {
  if (view === 'favorite') return { scope: 'favorite' }
  if (view && view !== 'all' && view !== 'downloaded') return { scope: 'status', statuses: [view] }
  if (genres.length) return { scope: 'genre', genres: [...genres], genre_mode: 'all' }

  return { scope: 'all' }
}

/** ტოკენი ბმულიდან (`…/share/{token}`) — „მიმღების თვალით" გახსნისთვის */
export function shareTokenOf(url: string | null): string | null {
  if (!url) return null
  const match = /\/share\/([A-Za-z0-9]+)\/?$/.exec(url)

  return match ? match[1] : null
}
