import { api } from '@/lib/api'
import { readPage, type Page } from '@/lib/paged'

/* ============================================================
   **სინქრონიზაციის ისტორია** — გაშვებები და მათი ერთეულები.

   გაშვება ორი გზით იწერება: ფონური პარტია (გასაღები — პარტიის id) და ბრაუზერის
   რიგი (გასაღებს რიგი თვითონ ქმნის — `newRunKey()` — და ყოველ ერთეულს თან ატანს).
   ერთეულზე ინახება შედეგი, მიზეზი და **რა შეიცვალა**: ველების სია (`changes`) და
   რა რით (`details` — ძველი და ახალი მნიშვნელობა). ისტორია 90 დღე ინახება.

   გაშვებამ იცის, **რაზე და რით გაეშვა** (დაგეგმილი ერთეულები და პარამეტრები): ფონურ
   პარტიაზე სერვერი თვითონ წერს, ბრაუზერის რიგი კი გაშვების დასაწყისში აგზავნის
   (`openSyncRun`). ამიტომ გაწყვეტილი გაშვება გრძელდება — მხოლოდ იმაზე, რასაც შედეგი არ
   აქვს, იმავე პარამეტრებით და იმავე გაშვებაში (`resumeSyncRun`; სერვერზე, ფონურად).
   ============================================================ */

/** მონაცემები · სეზონები და სერიები · მსახიობები · თარგმანი */
export type SyncRunKind = 'sync' | 'episodes' | 'cast' | 'translate'

export const SYNC_RUN_RESULTS = ['updated', 'unchanged', 'skipped', 'failed'] as const

export type SyncRunResult = (typeof SYNC_RUN_RESULTS)[number]

/**
 * მიმდინარეობს · გაწყდა (ერთეულები დარჩა და გაშვება აღარ მიდის) · დასრულდა.
 * ⚠️ ბრაუზერის რიგზე სერვერმა მხოლოდ ბოლო ერთეულის დრო იცის: „გაწყდა" მაშინაა, როცა რიგი
 * გაჩერდა (`stopSyncRun`) ან ორი წუთია დუმს.
 */
export type SyncRunState = 'running' | 'interrupted' | 'finished'

/** რით გაეშვა — სახეობის მიხედვით: ველები, გადაწერა, მედია, წყაროები */
export interface SyncRunParams {
  fields?: string[]
  media?: boolean
  only_missing?: boolean
  overwrite?: boolean
  overwrite_photo?: boolean
  sources?: string[]
  review?: boolean
  /** თარგმანი: მსახიობის რომელი ველები (`name` · `biography`) */
  cast?: string[]
}

export interface SyncRun {
  /** გაშვების გასაღები (UUID) — მისამართშიც ეს წერია */
  key: string
  kind: SyncRunKind
  /** `batch` — ფონური პარტია · `queue` — ბრაუზერის რიგი */
  source: 'batch' | 'queue'
  /** დაგეგმილი ერთეულები */
  total: number
  /** რამდენს აქვს შედეგი — შეწყვეტილ გაშვებაზე `total`-ზე ნაკლებია */
  done: number
  /** რამდენი დარჩა გასაშვები */
  left: number
  state: SyncRunState
  /** „გაგრძელება" შეიძლება: გაწყდა და დაგეგმილი სია ინახება (ძველ გაშვებებს არ აქვს) */
  resumable: boolean
  /** „ჩავარდნილების თავიდან გაშვება" შეიძლება: ჩავარდნილი აქვს და არ მიმდინარეობს */
  retryable: boolean
  /** „შეჩერება" შეიძლება: მიმდინარეობს და სერვერის ფონური პარტია ატარებს (ბრაუზერის რიგს თავისი ღილაკი აქვს) */
  stoppable: boolean
  /** მხოლოდ ერთი გაშვების პასუხში; `null` — ძველი გაშვება, პარამეტრები არ ინახება */
  params?: SyncRunParams | null
  counts: Record<SyncRunResult, number>
  /** რომელ ტიპებს შეეხო: `movie` · `series` · `anime` · `actor` */
  types: string[]
  started_at: string | null
  last_at: string | null
}

/**
 * ერთი შეცვლილი ველი — რა რით. სამი ფორმა:
 * · მნიშვნელობა: `from` → `to` (`from: null` — ცარიელი იყო, ახლად შეივსო); თარგმანზე `by` — რომელმა წყარომ შეავსო;
 * · სია (ჟანრები, მსახიობები): რა დაემატა და რა მოაკლდა;
 * · ფაილი (პოსტერი, ფოტო): მხოლოდ ფაქტი — მისამართი ისტორიაში არ იწერება.
 */
export type SyncRunDetail =
  | { field: string; from: string | null; to: string | null; by?: string }
  | { field: string; added: string[]; removed: string[] }
  | { field: string; file: true; replaced: boolean }

export interface SyncRunItem {
  id: number
  type: string
  record_id: number
  title: string | null
  result: SyncRunResult
  /** გამოტოვების ან ჩავარდნის მიზეზი — მანქანური კოდი ან წყაროს ტექსტი */
  reason: string | null
  /** შეცვლილი ველების გასაღებები (`poster`, `description_ka`, `seasons:8`…) */
  changes: string[]
  /** რა რით შეიცვალა; ძველ გაშვებებზე ცარიელია — იქ მხოლოდ `changes` ჩანს */
  details: SyncRunDetail[]
  /** ჩანაწერი ისევ არსებობს — ბმული მხოლოდ მაშინ იხატება */
  exists: boolean
  /** ჩანაწერზე „აღარ განაახლო" ახლა ჩართულია */
  paused: boolean
}

/** სინქრონიზაციის გვერდის ბარათების სახეობები — თარგმანს თავისი გვერდი აქვს */
export type SyncCardKind = Exclude<SyncRunKind, 'translate'>

/** სინქრონიზაციის გვერდების ბარათები — `GET /sync/overview` */
export interface SyncOverview {
  /** რამდენია გასაშვები (გეგმის იგივე რიცხვი); `null` — ეს ბარათი ამ ანგარიშს ან მოდულს არ აქვს */
  pending: Record<SyncCardKind, number | null>
  /** სახეობის ბოლო გაშვება — მოდულის გვერდზე ამ მოდულისა */
  last: Record<SyncCardKind, SyncRun | null>
  /** ისტორიაში სულ რამდენი გაშვებაა და რომელია ბოლო — ყველა სახეობა ერთად */
  runs: number
  latest: SyncRun | null
  /**
   * დაუსრულებელი გაშვებები, ახლიდან ძველისკენ: გაწყვეტილი, რომლის გაგრძელებაც შეიძლება, და
   * სერვერზე ფონურად მიმდინარე (გაგრძელებული გაშვება აქვე ჩანს, სანამ არ დასრულდება)
   */
  unfinished: SyncRun[]
}

/** ერთი სახეობის ისტორიის ჯამი და დაუსრულებელი გაშვებები — თარგმანის გვერდების ბარათები */
export interface SyncKindRuns {
  runs: number
  latest: SyncRun | null
  unfinished: SyncRun[]
}

export async function fetchSyncKindRuns(kind: SyncRunKind, type?: string): Promise<SyncKindRuns> {
  const { data } = await api.get<SyncKindRuns>('/sync/unfinished', { params: { kind, ...(type ? { type } : {}) } })
  return data
}

export async function fetchSyncOverview(type?: string): Promise<SyncOverview> {
  const { data } = await api.get<SyncOverview>('/sync/overview', { params: type ? { type } : undefined })
  return data
}

export async function fetchSyncRuns(page = 1, perPage = 10, kind?: SyncRunKind | null): Promise<Page<SyncRun>> {
  const { data } = await api.get('/sync/runs', { params: { page, per_page: perPage, kind: kind ?? undefined } })
  return readPage<SyncRun>(data)
}

export async function fetchSyncRun(key: string): Promise<SyncRun> {
  const { data } = await api.get(`/sync/runs/${key}`)
  return data.data
}

export async function fetchSyncRunItems(
  key: string,
  params: { result?: SyncRunResult | null; q?: string; page?: number; per_page?: number },
): Promise<Page<SyncRunItem>> {
  const { data } = await api.get(`/sync/runs/${key}/items`, {
    params: { result: params.result ?? undefined, q: params.q || undefined, page: params.page, per_page: params.per_page },
  })
  return readPage<SyncRunItem>(data)
}

/**
 * „ამათზე აღარ გაეშვას" / „ისევ გაეშვას" — მონიშნულ ერთეულებზე, ან (`failed`) გაშვების
 * ყველა ჩავარდნილზე. პასუხი — რამდენ ჩანაწერზე შეიცვალა გადამრთველი.
 */
export async function pauseSyncRunItems(key: string, paused: boolean, target: { items: number[] } | { failed: true }): Promise<number> {
  const { data } = await api.post(`/sync/runs/${key}/pause`, { paused, ...target })
  return data.changed as number
}

/**
 * ბრაუზერის რიგის გაშვების დასაწყისი: რაზე და რით ეშვება. სერვერი ამით იგებს, რა დარჩება
 * გასაშვები, თუ რიგი გაწყდება. ⚠️ ვერ გაგზავნილი დასაწყისი რიგს არ აჩერებს — გაშვება
 * პირველივე ერთეულზე მაინც იქმნება, უბრალოდ გაგრძელება არ ექნება.
 */
export async function openSyncRun(
  key: string,
  kind: SyncRunKind,
  items: { type: string; id: number }[],
  params: SyncRunParams,
): Promise<void> {
  await api.post('/sync/runs', { key, kind, items, params })
}

/**
 * გაწყვეტილი გაშვების გაგრძელება (ან, `only: 'failed'` — მხოლოდ ჩავარდნილების თავიდან
 * გაშვება): იმავე პარამეტრებით, იმავე გაშვებაში, სერვერზე ფონურად. `delay_ms` — პაუზა
 * ერთეულებს შორის.
 */
export async function resumeSyncRun(key: string, opts: { only?: 'failed'; delay_ms?: number } = {}): Promise<SyncRun> {
  const { data } = await api.post(`/sync/runs/${key}/resume`, opts)
  return data.data
}

/** გაშვების გაჩერება: ფონური პარტია უქმდება, ბრაუზერის რიგის გაშვება „გაწყვეტილად" ინიშნება */
export async function stopSyncRun(key: string): Promise<SyncRun> {
  const { data } = await api.post(`/sync/runs/${key}/stop`)
  return data.data
}

/** ბრაუზერის რიგის გაშვების გასაღები — სერვერი პირველივე ერთეულზე ქმნის გაშვებას */
export function newRunKey(): string {
  const random = globalThis.crypto?.randomUUID?.()
  if (random) return random

  // ძველი ბრაუზერი (ან არაუსაფრთხო კონტექსტი): იგივე ფორმა შემთხვევითი ბაიტებით
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
