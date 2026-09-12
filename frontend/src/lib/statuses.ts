import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { STATUS_DOMAINS, fetchStatuses, isStatusDomain, type StatusDomain } from '@/api/statuses'
import type { Status, StatusRole } from '@/api/types'

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

export function statusTone(status: Status | null | undefined): string {
  if (!status) return 'undecided'

  return KEY_TONE[status.key] ?? ROLE_TONE[status.role] ?? 'undecided'
}

/** „ჩემი სექციის" ლეიბლი — `?view=` სამ რამეს ნიშნავს: ყველა · რჩეული · სტატუსი */
export function useViewLabel(statuses: Status[] | undefined, lang: string) {
  const { t } = useTranslation()

  return (view: string, allLabel?: string) => {
    if (view === 'all') return allLabel ?? t('filter.all')
    if (view === 'favorite') return t('filter.favorite')

    const status = statusByKey(statuses, view)

    // ლექსიკონი ჯერ არ ჩამოსულა (ან სტატუსი წაიშალა) — გასაღები ცარიელ
    // ადგილზე უკეთესია: სექციის სახელი მაინც იკითხება
    return status ? statusName(status, lang) : view
  }
}
