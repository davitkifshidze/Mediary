import type { ReactNode } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import type { StatusDomainKey } from '@/api/statuses'
import type { Status } from '@/api/types'

/* ============================================================
   **„რა ვნახო დღეს" — საერთო ნაწილი**.

   ⚠️ **დიალოგი არც ფილმს იცნობს და არც ვიდეოს** — მას `PickSource` ეძლევა:
   რა ჩამოიტანოს, როგორ გახსნას, რომელ ქეშს ეხება. ფილმი/სერიალი/ანიმე
   `LibraryPage`-ზე აწყობს წყაროს, ვიდეო — `VideosPage`-ზე (კამათელი
   მხოლოდ ამ ოთხზეა). ასე ერთი დიალოგია და არა ორი.

   ⚠️ **`api/media.ts`-ს ეს ფაილი იმპორტირებული აქვს** (`pickParams`), ე.ი.
   აქედან `api/*`-ის იმპორტი წრეს შექმნიდა — წყაროების აწყობა გვერდებზეა.
   ============================================================ */

/** `module_user.settings`-ის გასაღები — რამდენი და რომელი სტატუსებიდან */
export const PICK_SETTING = 'pick'

/**
 * დიალოგის `NumberPick`-ის სია: „4 · 8 · 12 · 16 · სხვა" (ხელით —
 * `PICK_MAX`-მდე); ჭერი ბაზისაც არის (`PicksRandomRecords::$pickMax`).
 *
 * ⚠️ **4-ის ჯერადები**: ფანჯრის ბადე ოთხსვეტიანია (ოთხზე სტატუსი და ორი ღილაკი
 * ეტევა), ე.ი. ჯერადი რაოდენობა ბოლო რიგს ყოველთვის ავსებს.
 */
export const PICK_COUNTS = [4, 8, 12, 16]
export const PICK_MAX = 20
/** რამდენი, თუ მოდულზე არაფერი შენახულა — ორი სავსე რიგი */
const PICK_DEFAULT = 8

export interface PickOptions {
  count?: number
  /** სტატუსის **გასაღებები** — `status[]` მასივად (სერვერზე „ან"-ით) */
  status?: string[]
  /** უკვე ნაჩვენებები */
  exclude?: number[]
}

/** `?pick=random&count=N&status[]=…&exclude[]=…` — ორივე API-კლიენტი ერთსა და იმავეს გზავნის */
export function pickParams({ count = PICK_DEFAULT, status = [], exclude = [] }: PickOptions): Record<string, unknown> {
  return {
    pick: 'random',
    count: Math.min(PICK_MAX, Math.max(1, count)),
    ...(status.length ? { status } : {}),
    ...(exclude.length ? { exclude } : {}),
  }
}

export interface PickSettings {
  count: number
  /** `null` — არასდროს არჩეულა, ნაგულისხმევი ფარგლები მოქმედებს */
  statuses: string[] | null
}

/** ⚠️ JSON ბლოკი ნებისმიერი იყოს — ცარიელი/ძველი/დაზიანებული ნაგულისხმევს ნიშნავს */
export function readPickSettings(settings: Record<string, unknown> | undefined): PickSettings {
  const raw = settings?.[PICK_SETTING]
  if (!raw || typeof raw !== 'object') return { count: PICK_DEFAULT, statuses: null }

  const { count, statuses } = raw as Record<string, unknown>
  const n =
    typeof count === 'number' && Number.isFinite(count)
      ? Math.min(PICK_MAX, Math.max(1, Math.round(count)))
      : PICK_DEFAULT
  const list = Array.isArray(statuses) ? statuses.filter((x): x is string => typeof x === 'string') : null

  return { count: n, statuses: list && list.length ? list : null }
}

/**
 * ნაგულისხმევი ფარგლები: სიის ცხადად არჩეული სექცია, თუ არის; თორემ `todo`
 * როლის **ყველა** სტატუსი (როლით და არა სახელით).
 */
export function defaultPickStatuses(statuses: Status[], current?: string | null): string[] {
  if (current && statuses.some((s) => s.key === current)) return [current]
  const todo = statuses.filter((s) => s.role === 'todo').map((s) => s.key)
  return todo.length ? todo : statuses.map((s) => s.key)
}

/** ერთი ბარათი — დომენისგან დამოუკიდებელი ფორმა */
export interface PickRecord {
  id: number
  title: string
  poster: string | null
  /** პოსტერი 2:3 (მედია) · ფართო 16:9 (ვიდეო) */
  shape: 'poster' | 'wide'
  year: number | null
  /** TMDB-ის საშუალო, სტრიქონად („7.4"); ვიდეოს არ აქვს */
  rating: string | null
  /** ჟანრები ან არხი · ტიპი — ერთი ხაზი სათაურის ქვეშ */
  meta: string[]
  description: string | null
  statusKey: string | null
}

/** ფანჯრის ფილტრის ერთი პირობა ჩიპად — ✕-ით იხსნება */
export interface PickFilterChip<F> {
  key: string
  label: string
  /** იგივე ფილტრი ამ პირობის გარეშე */
  without: F
}

/**
 * **ფანჯრის ფილტრი** — სიიდან მოყოლილი, მაგრამ მისგან დამოუკიდებელი.
 *
 * ⚠️ ფანჯარა სიის ფილტრს ჩუმად იღებდა: არც ჩანდა, არც იცვლებოდა — „რატომ
 * მთავაზობს მხოლოდ კომედიებს" პასუხგაუცემელი რჩებოდა. ახლა ის **ასლია**:
 * პირობები ჩიპებად ჩანს, იხსნება და იცვლება, სიის მისამართს კი არაფერი ეხება.
 */
export interface PickFilter<F> {
  /** სიის მიმდინარე ფილტრი — ფანჯრის საწყისი მდგომარეობა */
  initial: F
  /** „ფილტრის გარეშე" */
  empty: F
  chips: (filter: F) => PickFilterChip<F>[]
  /** „ფილტრის შეცვლა" — იგივე ველები, რაც სიის პანელშია */
  fields: (filter: F, change: (update: (current: F) => F) => void) => ReactNode
}

export interface PickSource<F = unknown> {
  /** მოდულის გასაღები — სტატუსების ლექსიკონი და `module_user.settings` */
  domain: StatusDomainKey
  /** სიის ცხადად არჩეული სტატუსი (`?view=`) — ნაგულისხმევი ფარგლების საწყისი */
  currentStatus: string | null
  filter: PickFilter<F>
  /** ბარათის ფორმა — ჩონჩხები მას პასუხამდე ხატავენ */
  shape: PickRecord['shape']
  fetch: (opts: Required<PickOptions>, filter: F) => Promise<PickRecord[]>
  setStatus: (id: number, statusKey: string) => Promise<unknown>
  /** „გახსნა" — გვერდი წყვეტს: დეტალის გვერდი (მედია) თუ ფანჯარა (ვიდეო) */
  open: (record: PickRecord) => void
  /** რომელი სიები უნდა განახლდეს სტატუსის შეცვლის შემდეგ */
  invalidate: QueryKey[]
}
