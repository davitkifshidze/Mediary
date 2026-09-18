import { api } from '@/lib/api'

/* ============================================================
   ფონური პარტია (აუდიტი 2026-09-14, §D1).

   ⚠️ **რას ხსნის:** სინქრონი, გალერეა და თარგმანი კლიენტის რიგში ტრიალებს —
   თითო ჩანაწერზე ერთი მოკლე რექვესთი. ეს მყისიერ უკუკავშირს იძლევა, მაგრამ
   **ტაბის დახურვაზე ჩერდება**. აქ იგივე გეგმა სერვერს გადაეცემა და ბრაუზერი
   აღარაფერს წყვეტს.

   ⚠️ **კლიენტის რიგი არ იშლება.** ორივე ერთსა და იმავე სერვისებს იძახებს,
   ე.ი. შედეგი იდენტურია; განსხვავება მხოლოდ ისაა, ვინ ატრიალებს ციკლს.
   ============================================================ */

export type BatchKind = 'sync' | 'gallery' | 'translate'

export interface BatchItem {
  type: string
  id: number
}

/**
 * **ერთი ერთეულის შედეგი** (Tasks FEAT-03).
 *
 * ⚠️ სამი მდგომარეობა და არა ორი: `skipped` (ჩანაწერი წაიშალა — ხელახლა
 * გაშვება არაფერს შეცვლის) სხვა ქმედებას ითხოვს, ვიდრე `failed`.
 */
export interface BatchItemResult {
  type: string
  id: number
  title: string | null
  status: 'running' | 'ok' | 'skipped' | 'failed'
  error: string | null
}

export interface BatchStatus {
  id: string | null
  kind?: string
  total?: number
  pending?: number
  processed?: number
  failed?: number
  progress?: number
  cancelled?: boolean
  finished: boolean
  /** ⚠️ სერვერული რიგის „რომელი და რატომ" — კლიენტურ რიგს ეს ყოველთვის ჰქონდა */
  items?: BatchItemResult[]
}

export async function startBatch(
  kind: BatchKind,
  items: BatchItem[],
  options: Record<string, unknown> = {},
): Promise<BatchStatus> {
  const { data } = await api.post<BatchStatus>('/batches', { kind, items, options })
  return data
}

export async function fetchBatch(id: string): Promise<BatchStatus> {
  const { data } = await api.get<BatchStatus>(`/batches/${id}`)
  return data
}

export async function cancelBatch(id: string): Promise<BatchStatus> {
  const { data } = await api.delete<BatchStatus>(`/batches/${id}`)
  return data
}
