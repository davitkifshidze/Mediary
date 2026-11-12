import { api } from '@/lib/api'
import { readPage, type Page } from '@/lib/paged'

/* ============================================================
   **სინქრონიზაციის ისტორია** — გაშვებები და მათი ერთეულები.

   გაშვება ორი გზით იწერება: ფონური პარტია (გასაღები — პარტიის id) და ბრაუზერის
   რიგი (გასაღებს რიგი თვითონ ქმნის — `newRunKey()` — და ყოველ ერთეულს თან ატანს).
   ერთეულზე ინახება შედეგი, მიზეზი და **რა შეიცვალა** — ველების სია, მნიშვნელობების
   გარეშე. ისტორია 90 დღე ინახება.
   ============================================================ */

/** მონაცემები · სეზონები და სერიები · მსახიობები · თარგმანი */
export type SyncRunKind = 'sync' | 'episodes' | 'cast' | 'translate'

export const SYNC_RUN_RESULTS = ['updated', 'unchanged', 'skipped', 'failed'] as const

export type SyncRunResult = (typeof SYNC_RUN_RESULTS)[number]

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
  counts: Record<SyncRunResult, number>
  /** რომელ ტიპებს შეეხო: `movie` · `series` · `anime` · `actor` */
  types: string[]
  started_at: string | null
  last_at: string | null
}

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
  /** ჩანაწერი ისევ არსებობს — ბმული მხოლოდ მაშინ იხატება */
  exists: boolean
  /** ჩანაწერზე „აღარ განაახლო" ახლა ჩართულია */
  paused: boolean
}

export async function fetchSyncRuns(page = 1, perPage = 10): Promise<Page<SyncRun>> {
  const { data } = await api.get('/sync/runs', { params: { page, per_page: perPage } })
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
