import { api } from '@/lib/api'

/* ============================================================
   **ჩანაწერის ლოკი — ერთი API ყველა ჩაკეტვადზე (Tasks §33.7 → §35.4–35.5).**

   სერვერზე სამივე კარი ერთნაირია (`ManagesRecordLock`), ჩანაწერის მისამართს
   ბოლოში ემატება: `PUT {base}/lock` (დადება/შეცვლა/მოხსნა), `POST {base}/unlock`
   (გახსნა ამ სესიაში) და `POST {base}/lock` (ისევ ჩაკეტვა). `base` —
   მაგ. `/personal/people/3`, `/movies/12`, `/cast/7`.

   ⚠️ **ლოკი სერვერზეა** — დაუხსნელ ჩანაწერზე შიგთავსი საერთოდ არ მოდის; აქ
   მხოლოდ ორი ფაქტია: „ჩაკეტილია" და „ამ სესიაში ღიაა".
   ============================================================ */

export interface RecordLockState {
  locked: boolean
  /** ჩაკეტილი არაა, ან ამ სესიაში გაიხსნა */
  unlocked: boolean
  lock_hint: string | null
  failed_unlocks: number
  /** 10 არასწორი ცდის შემდეგ — როდემდეა გახსნა დაბლოკილი */
  unlock_blocked_until: string | null
}

/** ჩაკეტილია და ამ სესიაში არ გახსნილა — შიგთავსი სერვერიდან არ მოდის */
export function isHidden(record: Pick<RecordLockState, 'locked' | 'unlocked'>): boolean {
  return record.locked && !record.unlocked
}

export interface RecordLockInput {
  password?: string
  hint?: string | null
  /** ლოკის მოხსნა */
  remove?: boolean
  /** არსებული ლოკის შეცვლა/მოხსნა, როცა ჩანაწერი ამ სესიაში არ გახსნილა */
  account_password?: string
}

export async function putRecordLock<T>(base: string, input: RecordLockInput): Promise<T> {
  const { data } = await api.put(`${base}/lock`, input)
  return data.data ?? data
}

/** გახსნა ამ სესიაში — 422 `record_password_wrong`, 423 `record_temporarily_locked` */
export async function unlockRecord<T>(base: string, password: string): Promise<T> {
  const { data } = await api.post(`${base}/unlock`, { password })
  return data.data ?? data
}

/** „ისევ ჩაკეტე" — სესიიდან ამოვარდნა, პაროლი რჩება */
export async function relockRecord<T>(base: string): Promise<T> {
  const { data } = await api.post(`${base}/lock`)
  return data.data ?? data
}
