import type { QueryKey } from '@tanstack/react-query'
import type { StatusDomainKey } from '@/api/statuses'
import type { Status } from '@/api/types'

/* ============================================================
   **„რა ვნახო დღეს" — საერთო ნაწილი** (Tasks §17).

   ⚠️ **დიალოგი არც ფილმს იცნობს და არც ვიდეოს** — მას `PickSource` ეძლევა:
   რა ჩამოიტანოს, როგორ გახსნას, რომელ ქეშს ეხება. ფილმი/სერიალი/ანიმე
   `LibraryPage`-ზე აწყობს წყაროს, ვიდეო — `VideosPage`-ზე (Q4: კამათელი
   მხოლოდ ამ ოთხზეა). ასე ერთი დიალოგია და არა ორი.

   ⚠️ **`api/media.ts`-ს ეს ფაილი იმპორტირებული აქვს** (`pickParams`), ე.ი.
   აქედან `api/*`-ის იმპორტი წრეს შექმნიდა — წყაროების აწყობა გვერდებზეა.
   ============================================================ */

/** `module_user.settings`-ის გასაღები — რამდენი და რომელი სტატუსებიდან (§17.4) */
export const PICK_SETTING = 'pick'

/** დიალოგის `NumberPick`-ის სია; ჭერი ბაზისაც არის (`PicksRandomRecords::$pickMax`) */
export const PICK_COUNTS = [1, 2, 3, 4, 5]
export const PICK_MAX = 5

export interface PickOptions {
  count?: number
  /** სტატუსის **გასაღებები** — `status[]` მასივად (სერვერზე „ან"-ით) */
  status?: string[]
  /** უკვე ნაჩვენებები (§6.5) */
  exclude?: number[]
}

/** `?pick=random&count=N&status[]=…&exclude[]=…` — ორივე API-კლიენტი ერთსა და იმავეს გზავნის */
export function pickParams({ count = 1, status = [], exclude = [] }: PickOptions): Record<string, unknown> {
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
  if (!raw || typeof raw !== 'object') return { count: 1, statuses: null }

  const { count, statuses } = raw as Record<string, unknown>
  const n =
    typeof count === 'number' && Number.isFinite(count) ? Math.min(PICK_MAX, Math.max(1, Math.round(count))) : 1
  const list = Array.isArray(statuses) ? statuses.filter((x): x is string => typeof x === 'string') : null

  return { count: n, statuses: list && list.length ? list : null }
}

/**
 * ნაგულისხმევი ფარგლები: სიის ცხადად არჩეული სექცია, თუ არის; თორემ `todo`
 * როლის **ყველა** სტატუსი (როლით და არა სახელით — §6.4).
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

export interface PickSource {
  /** მოდულის გასაღები — სტატუსების ლექსიკონი და `module_user.settings` */
  domain: StatusDomainKey
  /** სიის ცხადად არჩეული სტატუსი (`?view=`) — ნაგულისხმევი ფარგლების საწყისი */
  currentStatus: string | null
  /** სიის დანარჩენი ფილტრის ანაბეჭდი — query-ის გასაღების ნაწილი */
  filterKey: string
  fetch: (opts: Required<PickOptions>) => Promise<PickRecord[]>
  setStatus: (id: number, statusKey: string) => Promise<unknown>
  /** „გახსნა" — გვერდი წყვეტს: დეტალის გვერდი (მედია) თუ ფანჯარა (ვიდეო) */
  open: (record: PickRecord) => void
  /** რომელი სიები უნდა განახლდეს „დავიწყოთ"-ის შემდეგ */
  invalidate: QueryKey[]
}
