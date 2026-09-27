import { useQueries, useQuery } from '@tanstack/react-query'

import type { BookStatus } from '@/api/books'
import type { CourseStatus } from '@/api/courses'
import type { GameStatus } from '@/api/games'
import type { PlaceStatus } from '@/api/places'
import { STATUS_DOMAINS, fetchStatuses, isStatusDomain, type StatusDomain } from '@/api/statuses'
import type { Status, StatusRole } from '@/api/types'
import { STATUS_FILL } from '@/lib/statusStyles'

/* ============================================================
   **სტატუსების წაკითხვის ერთადერთი ადგილი (Tasks §6.4).**

   საიდბარი, ბარათის მენიუ, ფორმა, ფილტრი, მასობრივი ცვლილება და `/purge` —
   ექვსივე ერთსა და იმავე სიას ხატავს. ერთი ქეშის გასაღები (`['statuses', domain]`)
   ნიშნავს, რომ სტატუსის დამატება ყველგან ერთდროულად ჩნდება.
   ============================================================ */

export const statusesQueryKey = (domain: StatusDomain) => ['statuses', domain] as const

export function useStatuses(domain: StatusDomain, enabled = true) {
  return useQuery({
    queryKey: statusesQueryKey(domain),
    queryFn: () => fetchStatuses(domain),
    enabled,
    // ლექსიკონი იშვიათად იცვლება — ზედმეტი მოთხოვნა ყოველ გვერდზე არ გვინდა
    staleTime: 5 * 60_000,
  })
}

/**
 * ექვსივე დომენის ლექსიკონი ერთდროულად — საიდბარს სჭირდება, სადაც სექციები
 * ერთ ციკლში იხატება.
 *
 * ⚠️ **query-ების რაოდენობა ყოველთვის ექვსია** და მხოლოდ `enabled` იცვლება:
 * პირობითი `useStatuses()` ციკლის შიგნით hook-ების რიგს გატეხდა.
 */
export function useStatusMap(enabledDomains: readonly string[]): Record<StatusDomain, Status[]> {
  const results = useQueries({
    queries: STATUS_DOMAINS.map((domain) => ({
      queryKey: statusesQueryKey(domain),
      queryFn: () => fetchStatuses(domain),
      enabled: enabledDomains.includes(domain),
      staleTime: 5 * 60_000,
    })),
  })

  return Object.fromEntries(
    STATUS_DOMAINS.map((domain, i) => [domain, results[i].data ?? []]),
  ) as Record<StatusDomain, Status[]>
}

/**
 * **რამდენიმე დომენის საერთო სია.** სინქრონის, თარგმანის და გალერეის სკოუპი
 * ერთდროულად ეხება ფილმს, სერიალსა და ანიმეს, ე.ი. სტატუსის გადამრჩევიც
 * მათ **გაერთიანებას** უნდა აჩვენებდეს.
 *
 * ⚠️ დუბლი **გასაღებით** იჭრება და არა `id`-ით: სამ დომენს თავისი რიგები
 * აქვს, „ნანახი" კი ერთი და იგივე ფილტრია.
 */
export function useMergedStatuses(domains: readonly string[]): Status[] {
  const map = useStatusMap(domains)

  const seen = new Map<string, Status>()

  for (const domain of domains) {
    if (!isStatusDomain(domain)) continue
    for (const status of map[domain] ?? []) {
      if (!seen.has(status.key)) seen.set(status.key, status)
    }
  }

  return [...seen.values()]
}

/**
 * სტატუსის სახელი არჩეულ ენაზე.
 *
 * ⚠️ **ფოლბექი i18n-ზე განზრახ არ კეთდება.** სახელი ლექსიკონშია და ის
 * ერთადერთი წყაროა — თარგმანზე დაბრუნება გადარქმეულ სტატუსს ძველი
 * სახელით დახატავდა.
 */
export function statusName(status: Status | null | undefined, lang: string): string {
  if (!status) return ''

  return lang === 'ka'
    ? status.name_ka || status.name_en
    : status.name_en || status.name_ka
}

/** ლექსიკონის სიიდან გასაღებით (`?view=watched` → რიგი) */
export function statusByKey(statuses: Status[] | undefined, key: string): Status | undefined {
  return statuses?.find((s) => s.key === key)
}

/**
 * **ფერი.** ჯერ ნაგულისხმევი გასაღები (მისი ფერი უკვე ნაცნობია), მერე
 * `role` — ე.ი. ხელით დამატებული „მიტოვებული" (`done`) „ნანახის" ფერს იღებს
 * და არა ნაცრისფერ არაფერს.
 */
const KEY_TONE: Record<string, string> = {
  undecided: 'undecided',
  to_watch: 'towatch',
  watching: 'watching',
  watched: 'watched',
}

const ROLE_TONE: Record<StatusRole, string> = {
  todo: 'towatch',
  doing: 'watching',
  done: 'watched',
}

export function statusTone(status: Pick<Status, 'key' | 'role'> | null | undefined): string {
  if (!status) return 'undecided'

  return KEY_TONE[status.key] ?? ROLE_TONE[status.role] ?? 'undecided'
}



/**
 * **enum-სტატუსიანი მოდულების i18n სივრცე** (§6.4-ის მეორე მექანიზმი).
 *
 * ⚠️ ეს რუკა სამ ფაილში ცალ-ცალკე ეწერა (`MatchPanel`, `StatsPage`,
 * `PurgePage`) და კურსი და ადგილი (Tasks §2) ორ მათგანს დააკლდა — ეკრანზე
 * ნედლი გასაღები იხატებოდა. სივრცეები ისტორიულია (`board_game` →
 * `boardGames`), ამიტომ რუკაა და არა შეწებება.
 */
export const ENUM_STATUS_NS = {
  book: 'books.statuses',
  game: 'games.statuses',
  course: 'courses.statuses',
  place: 'places.statuses',
} as const satisfies Record<string, string>

/** enum-სტატუსის i18n გასაღები; უცნობ დომენზე — `null` */
export function enumStatusKey(domain: string, status: string): string | null {
  const ns = (ENUM_STATUS_NS as Record<string, string>)[domain]
  return ns ? `${ns}.${status}` : null
}

export type EnumStatusDomain = keyof typeof ENUM_STATUS_NS

/** ლექსიკონის სამი როლი + „მიტოვებული", რომელიც მათგან არცერთს არ უდრის */
export type EnumStatusRole = StatusRole | 'dropped'

/**
 * **enum-სტატუსის როლი — ფერი ლექსიკონის სტატუსებისაა** (Tasks §21).
 *
 * შენი სიტყვები: „წიგნებში სტატუსს „ვკითხულობ“ ნაცრისფერი ფონი აქვს …
 * შესაბამისი ფერი მიეცი — ნაცრისფერი არ მომწონს".
 *
 * ⚠️ **ოთხ გვერდს ოთხი ხელით დაწერილი რუკა ჰქონდა** და ოთხივე სხვადასხვა
 * ენაზე ლაპარაკობდა: წიგნის „ვკითხულობ" `bg-primary/15`-ით ნაცრისფრად
 * იხატებოდა (ნათელ თემაზე `--primary` მუქი მელანია), თამაშის „დახურული" —
 * ნაცრისფრად, კურსის „მიმდინარე" — ლურჯად, ადგილის „ნანახი" — მწვანედ.
 * ახლა ერთი ფერი ერთ **როლს** ეკუთვნის და ზუსტად ის, რაც ფილმის სტატუსებს
 * აქვს (`ROLE_TONE`): „ჯერ არა" — ქარვისფერი (ფილმის „საყურებელი"),
 * „მიმდინარეობს" — ლურჯი („ვუყურებ"), „დასრულდა" — მწვანე („ნანახი"),
 * „მიტოვებული" — წითელი.
 *
 * ⚠️ `satisfies` თითო დომენზე **სრულ** სიას ითხოვს — ახალი enum-სტატუსი
 * ფერის გარეშე `tsc`-ს აწითლებს და ჩუმად ნაცრისფერი აღარ დარჩება.
 */
export const ENUM_STATUS_ROLE = {
  book: { to_read: 'todo', reading: 'doing', read: 'done', abandoned: 'dropped' },
  game: { to_play: 'todo', playing: 'doing', finished: 'done' },
  course: { to_take: 'todo', taking: 'doing', done: 'done', dropped: 'dropped' },
  place: { to_visit: 'todo', visited: 'done' },
} as const satisfies {
  book: Record<BookStatus, EnumStatusRole>
  game: Record<GameStatus, EnumStatusRole>
  course: Record<CourseStatus, EnumStatusRole>
  place: Record<PlaceStatus, EnumStatusRole>
}

/** enum-სტატუსის ტონი (`STATUS_BADGE`-ის გასაღები); უცნობზე — ნეიტრალური `undecided` */
export function enumStatusTone(domain: EnumStatusDomain, status: string): string {
  const role = (ENUM_STATUS_ROLE[domain] as Record<string, EnumStatusRole>)[status]

  if (!role) return 'undecided'

  return role === 'dropped' ? 'dropped' : ROLE_TONE[role]
}

/**
 * **სტატუსის ფერი გრაფიკზე** (Tasks §28) — ზუსტად ბეჯის ტონი, ორივე
 * მექანიზმზე: ლექსიკონის სტატუსი `statusTone`-ით, enum-ისა `enumStatusTone`-ით.
 *
 * ⚠️ enum-ზე სერვერი `role`-ს არ აბრუნებს, ამიტომ დომენი აუცილებელია —
 * უამისოდ წიგნის ყველა სეგმენტი ერთ ფერში დაიხატებოდა. ⚠️ `statuses.color`
 * არსად იხატება (ბეჯიც ტონს კითხულობს), ამიტომ აქაც არა — სხვაგვარად ერთი
 * სტატუსი ორ ფერში გამოჩნდებოდა.
 */
export function statusFill(domain: string, key: string | null, role: string | null): string {
  if (!key) return STATUS_FILL.undecided

  const tone =
    domain in ENUM_STATUS_NS
      ? enumStatusTone(domain as EnumStatusDomain, key)
      : statusTone({ key, role: (role ?? 'todo') as StatusRole })

  return STATUS_FILL[tone] ?? STATUS_FILL.undecided
}
