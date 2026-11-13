import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { KeyRound, Lock } from 'lucide-react'
import type { MenuAction } from '@/components/ui/record-menu'
import type { MediaType } from '@/lib/media'

/* ============================================================
   **ლოკის პატარა საერთო ნაწილები.**
   ============================================================ */

/**
 * **ჩანაწერი ისევ დაიკეტა — მისი შიგთავსი ქეშიდანაც უნდა გაქრეს.**
 *
 * ⚠️ „ისევ ჩაკეტვა" მხოლოდ საკუთარ სიას ანახლებდა, დახურული ჩანაწერი კი სხვა
 * პასუხებშიც ზის: მისი გვერდი, გალერეა, ძებნა, მთავარი გვერდის ბლოკები. ქეშირებული
 * პასუხი იმ გვერდზე დაბრუნებისას მაშინვე იხატება — ახალ პასუხამდე, ხოლო გრძელი
 * `staleTime`-ით საერთოდ არ იკითხება თავიდან.
 *
 * ორი ნაბიჯი: ეკრანზე არსებული მოთხოვნები თავიდან იკითხება (მონაცემი რჩება, სანამ
 * ახალი არ მოვა — ჩარჩო არ ციმციმებს), ეკრანს მიღმა ქეშირებული კი იშლება. ⚠️ მხოლოდ
 * `inactive`: აქტიური მოთხოვნის წაშლა მიმდინარე ჩატვირთვას უხმოდ წყვეტს.
 */
export function forgetLockedContent(qc: QueryClient): void {
  const others = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'me'

  void qc.invalidateQueries({ predicate: others })
  qc.removeQueries({ type: 'inactive', predicate: others })
}

/** მსახიობის ლოკის მისამართი — `/cast/{id}` (ლოკი მნახველისაა) */
export function actorLockBase(id: number): string {
  return `/cast/${id}`
}

/** ფილმის/სერიალის/ანიმეს ლოკის მისამართი — `/media/{type}/{id}` (+ `/lock`, `/unlock`) */
export function mediaLockBase(type: MediaType, id: number): string {
  return `/media/${type}/${id}`
}

/**
 * მარჯვენა ღილაკის პუნქტები — ჩაკეტილზე (ამ სესიაში გახსნილზე) „ისევ ჩაკეტვა" ·
 * „პაროლი", დანარჩენზე — „ჩაკეტვა".
 */
export function lockMenuActions(
  locked: boolean,
  { relock, manage }: { relock: () => void; manage: () => void },
  t: TFunction,
): MenuAction[] {
  return locked
    ? [
        { key: 'relock', label: t('lock.relock'), icon: Lock, separator: true, run: relock },
        { key: 'lock-password', label: t('lock.password'), icon: KeyRound, run: manage },
      ]
    : [{ key: 'lock', label: t('lock.lock'), icon: Lock, separator: true, run: manage }]
}
