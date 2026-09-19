import { api } from '@/lib/api'
import type { MediaType } from '@/lib/media'

/* ============================================================
   ხელახლა ნახვის ჟურნალი (FEAT-14).

   ⚠️ **`watched_at` ჩანაწერზე რჩება და „ბოლო ნახვას" ნიშნავს** — სერვერი
   მას ჟურნალიდან ითვლის (`max`), ე.ი. კლიენტს მისი გამოთვლა არ უწევს
   და ორი რიცხვი ვერ დაშორდება.
   ============================================================ */

export interface WatchEntry {
  id: number
  watched_at: string | null
  note: string | null
}

export async function fetchWatches(type: MediaType, id: number): Promise<WatchEntry[]> {
  const { data } = await api.get(`/media/watches/${type}/${id}`)
  return data.data as WatchEntry[]
}

/**
 * „კიდევ ვნახე".
 *
 * ⚠️ **თარიღი არჩევითია** — ჩვეულებრივ „ახლა"-ა, მაგრამ ჟურნალს წარსულის
 * შევსებაც სჭირდება. მომავალი თარიღი სერვერზე **422-ია**.
 */
export async function logWatch(
  type: MediaType,
  id: number,
  payload: { watched_at?: string; note?: string } = {},
): Promise<WatchEntry> {
  const { data } = await api.post(`/media/watches/${type}/${id}`, payload)
  return data.data as WatchEntry
}

export async function deleteWatch(watchId: number): Promise<void> {
  await api.delete(`/media-watches/${watchId}`)
}
