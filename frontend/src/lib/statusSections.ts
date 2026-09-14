import type { ModuleInfo } from '@/api/account'
import type { SectionPlacement, SectionsLayout, StatusDomain } from '@/api/statuses'
import type { Status } from '@/api/types'

/* ============================================================
   **საიდბარის განყოფილებები: სტატუსები + „ყველა" / „რჩეული" (ეტაპი 8).**

   ლექსიკონის გვერდი და საიდბარი ერთსა და იმავე სიას ხატავს, ე.ი. „რა
   რიგით და რა ჩანს" **ერთ ფუნქციაში** (`arrangeSections`) იწყობა — ორ
   ადგილას ხელით რომ ეწერა, გვერდზე „რჩეული" ერთგან, საიდბარში მეორეგან
   გამოჩნდებოდა.

   ⚠️ **ფსევდო-განყოფილების ადგილი ანკერია და არა ინდექსი.** `at` =
   `start` · `end` · *მეზობელ სტატუსის გასაღები* (რომლის შემდეგაც დგას).
   ახალი სტატუსი ლექსიკონის ბოლოს ემატება; ინდექსით „ბოლოს" შენახული
   „რჩეული" მის **წინ** აღმოჩნდებოდა, `end` კი ბოლოს რჩება.

   ⚠️ **დამალვა მხოლოდ საიდბარს ეხება** (მომხმარებლის პასუხი 2026-09-13) —
   სტატუსი ჩანაწერზე, ფილტრსა და ფორმაში ისევ ჩანს.

   ⚠️ **დომენის key = მოდულის key** ექვსივეზე (`StatusDomain::DOMAINS[*].module`),
   ამიტომ განლაგება `modules.user_settings`-იდან პირდაპირ იკითხება.
   ============================================================ */

export type PseudoSectionId = 'all' | 'favorite' | 'downloaded'

export interface PseudoSection {
  id: PseudoSectionId
  /** i18n */
  labelKey: string
  icon: string
  /** სად დგას, სანამ მომხმარებელი არ გადაიტანს */
  defaultAt: 'start' | 'end'
}

const ALL: PseudoSection = { id: 'all', labelKey: 'filter.all', icon: 'LayoutGrid', defaultAt: 'start' }
const FAVORITE: PseudoSection = { id: 'favorite', labelKey: 'filter.favorite', icon: 'Star', defaultAt: 'end' }
/** §7.1 — ლოკალურად ჩამოწერილი ვიდეოები */
const DOWNLOADED: PseudoSection = {
  id: 'downloaded',
  labelKey: 'videos.downloadedSection',
  icon: 'HardDriveDownload',
  defaultAt: 'end',
}

/** ⚠️ სარკე: `App\Support\StatusDomain::RESERVED_KEYS` (სტატუსი ამ გასაღებებს არ იღებს) */
export const PSEUDO_SECTIONS: Record<StatusDomain, PseudoSection[]> = {
  movie: [ALL, FAVORITE],
  series: [ALL, FAVORITE],
  anime: [ALL, FAVORITE],
  video: [ALL, DOWNLOADED, FAVORITE],
  note: [ALL, FAVORITE],
  bookmark: [ALL, FAVORITE],
}

/** `module_user.settings`-ის გასაღები — `StatusController::SECTIONS_KEY` */
export const SECTIONS_SETTING = 'status_sections'

export const EMPTY_LAYOUT: SectionsLayout = { hidden: [], placement: [] }

/** ⚠️ JSON ბლოკი ნებისმიერი იყოს — ცარიელი/ძველი/დაზიანებული ნაგულისხმევ განლაგებას ნიშნავს */
export function readLayout(settings: Record<string, unknown> | undefined): SectionsLayout {
  const raw = settings?.[SECTIONS_SETTING]
  if (!raw || typeof raw !== 'object') return EMPTY_LAYOUT

  const { hidden, placement } = raw as Record<string, unknown>

  return {
    hidden: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string') : [],
    placement: Array.isArray(placement)
      ? placement.filter(
          (p): p is SectionPlacement =>
            !!p &&
            typeof p === 'object' &&
            typeof (p as SectionPlacement).id === 'string' &&
            typeof (p as SectionPlacement).at === 'string',
        )
      : [],
  }
}

/** ამ დომენის განლაგება — `GET /api/modules`-ის `user_settings`-იდან */
export function layoutFor(modules: ModuleInfo[], domain: StatusDomain): SectionsLayout {
  return readLayout(modules.find((m) => m.key === domain)?.user_settings)
}

export type SectionRow =
  | { kind: 'status'; id: string; status: Status; hidden: boolean }
  | { kind: 'pseudo'; id: PseudoSectionId; pseudo: PseudoSection; hidden: boolean }

/**
 * სტატუსები (`sort_order`-ის რიგით) + ფსევდო-განყოფილებები თავ-თავის ანკერზე.
 *
 * ⚠️ **უცნობი ანკერი ბოლოში ჩამოდის და არ ქრება** — წაშლილ სტატუსზე
 * მიბმული „რჩეული" საიდბარიდან რომ გაქრეს, ეს ხარვეზად წაიკითხებოდა
 * (backend წაშლისას ანკერს ისედაც წინა მეზობელზე გადააბამს).
 */
export function arrangeSections(
  statuses: Status[],
  pseudo: PseudoSection[],
  layout: SectionsLayout,
): SectionRow[] {
  const hidden = new Set(layout.hidden)
  const keys = new Set(statuses.map((s) => s.key))
  const stored = new Map(layout.placement.map((p, i) => [p.id, { at: p.at, rank: i }]))

  // ერთ ანკერზე რამდენიმე: შენახული — შენახულ რიგით, ახალი — კოდის რიგით, მათ შემდეგ
  const ordered = pseudo
    .map((p, i) => ({ p, rank: stored.get(p.id)?.rank ?? layout.placement.length + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.p)

  const start: SectionRow[] = []
  const end: SectionRow[] = []
  const after = new Map<string, SectionRow[]>()

  for (const p of ordered) {
    const row: SectionRow = { kind: 'pseudo', id: p.id, pseudo: p, hidden: hidden.has(p.id) }
    const at = stored.get(p.id)?.at ?? p.defaultAt

    if (at === 'start') start.push(row)
    else if (at !== 'end' && keys.has(at)) after.set(at, [...(after.get(at) ?? []), row])
    else end.push(row)
  }

  const middle = statuses.flatMap((status): SectionRow[] => [
    { kind: 'status', id: status.key, status, hidden: hidden.has(status.key) },
    ...(after.get(status.key) ?? []),
  ])

  return [...start, ...middle, ...end]
}

/**
 * `arrangeSections`-ის შებრუნებული: რიგიდან → ანკერები.
 * `arrangeSections(statuses, pseudo, { placement: placementFromRows(rows) })`
 * იმავე რიგს აბრუნებს (`statusSections.test.ts`).
 */
export function placementFromRows(rows: SectionRow[]): SectionPlacement[] {
  const anyStatus = rows.some((r) => r.kind === 'status')

  return rows.flatMap((row, i): SectionPlacement[] => {
    if (row.kind !== 'pseudo') return []

    // სტატუსის გარეშე ანკერი არაფერია — ნაგულისხმევ ადგილას რჩება
    if (!anyStatus) return [{ id: row.id, at: row.pseudo.defaultAt }]

    const before = rows
      .slice(0, i)
      .reverse()
      .find((r) => r.kind === 'status')
    const statusLater = rows.slice(i + 1).some((r) => r.kind === 'status')

    return [{ id: row.id, at: !before ? 'start' : !statusLater ? 'end' : before.id }]
  })
}

/** თვალის ღილაკი — ერთ id-ის ჩართვა/გამორთვა `hidden`-ში */
export function toggleHidden(layout: SectionsLayout, id: string): SectionsLayout {
  const hidden = layout.hidden.includes(id)
    ? layout.hidden.filter((x) => x !== id)
    : [...layout.hidden, id]

  return { ...layout, hidden }
}

/** საიდბარის `?view=` — „ყველა" პარამეტრის გარეშეა */
export function sectionSearch(row: SectionRow): string {
  return row.id === 'all' ? '' : `view=${row.id}`
}
