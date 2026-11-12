import { api } from '@/lib/api'

/* ============================================================
   **„ჩაკეტილები"** — ყველა ჩანაწერი, რომელზეც ჩემი პაროლი დევს (`/locks` გვერდი).

   ერთი ჩანაწერის სამი კარი `api/locks.ts`-შია; აქ არის სია ყველა ტიპზე ერთად
   (ფილმი · სერიალი · ანიმე · მსახიობი · გალერეის ალბომი · პირადი გალერეის პიროვნება
   და ალბომი), პაროლის ერთად მოხსნა და „ისევ ჩაკეტვა" ყველაზე. ⚠️ დაუხსნელი
   ჩანაწერიდან მხოლოდ სახელი მოდის — იგივე, რასაც ბოქლომიანი ბარათი აჩვენებს.
   ============================================================ */

/** `record_locks.lockable_type` — ჩანაწერის morph-ალიასი */
export type LockType = 'movie' | 'series' | 'anime' | 'cast_member' | 'gallery_album' | 'personal' | 'personal_album'

export interface LockRow {
  /** ლოკის id — მოხსნა ამით მიდის */
  id: number
  type: LockType
  /** მოდულის key; მსახიობზე — `cast` (მოდულის რიგი არ აქვს) */
  module: string
  record_id: number
  title: string | null
  title_ka: string | null
  hint: string | null
  /** ამ სესიაში გახსნილია — შიგთავსი ჩანს */
  unlocked: boolean
  locked_at: string | null
}

export async function fetchLocks(): Promise<LockRow[]> {
  const { data } = await api.get('/locks')
  return data.data
}

/**
 * პაროლის მოხსნა მონიშნული ლოკებიდან. ⚠️ ყოველთვის ანგარიშის პაროლით — ერთხელ მთელ
 * მონიშვნაზე, სესიაში გახსნილებზეც. პასუხი — რამდენი მოიხსნა.
 */
export async function removeLocks(ids: number[], accountPassword: string): Promise<number> {
  const { data } = await api.post('/locks/remove', { ids, account_password: accountPassword })
  return data.removed as number
}

/** „ისევ ჩაკეტვა" ყველაზე — ამ სესიაში გახსნილები ისევ იმალება */
export async function relockAll(): Promise<void> {
  await api.post('/locks/relock')
}
