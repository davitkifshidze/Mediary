import type { TFunction } from 'i18next'
import { KeyRound, Lock } from 'lucide-react'
import type { MenuAction } from '@/components/ui/record-menu'
import type { MediaType } from '@/lib/media'

/* ============================================================
   **ლოკის პატარა საერთო ნაწილები.**
   ============================================================ */

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
