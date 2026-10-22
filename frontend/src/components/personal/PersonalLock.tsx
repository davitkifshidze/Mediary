import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock } from 'lucide-react'
import { relockRecord } from '@/api/locks'
import { isHidden, type Person, type PersonalAlbum, type PersonalLockKind } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { useToast } from '@/components/ui/feedback'
import type { MenuAction } from '@/components/ui/record-menu'
import {
  RecordLockActions,
  RecordLockDialog,
  RecordLockedScreen,
  RecordUnlockDialog,
  type LockableRecord,
} from '@/components/locks/RecordLock'

/* ============================================================
   **პიროვნებისა და ალბომის ჩაკეტვა** — გვერდის ღილაკებით და ბარათის მენიუდან.

   ⚠️ ფანჯრები ზოგადია (`components/locks/RecordLock.tsx` — იგივე ფილმსა და
   მსახიობზე); აქ მხოლოდ პირადი გალერეის ორი განსხვავებაა: API-ის მისამართი
   (`/personal/{people|albums}/{id}`) და რას ნიშნავს ჩაკეტვა (ქვესათაური).
   ============================================================ */

const base = (kind: PersonalLockKind, id: number) => `/personal/${kind}/${id}`
const hintKey = (kind: PersonalLockKind) => (kind === 'people' ? 'personal.lock.hintPerson' : 'personal.lock.hintAlbum')

/** **გახსნა ამ სესიაში** — ბადის ბოქლომიანი ბარათიდან */
export function PersonalUnlockDialog({
  kind,
  record,
  onClose,
  onUnlocked,
}: {
  kind: PersonalLockKind
  record: LockableRecord
  onClose: () => void
  onUnlocked?: () => void
}) {
  const qc = useQueryClient()

  return (
    <RecordUnlockDialog
      base={base(kind, record.id)}
      record={record}
      onChanged={() => invalidatePersonal(qc)}
      onClose={onClose}
      onUnlocked={onUnlocked}
    />
  )
}

/** **გვერდის ღილაკები** — ჩაკეტვა / ისევ ჩაკეტვა / პაროლი */
export function PersonalLockActions({ kind, record }: { kind: PersonalLockKind; record: Person | PersonalAlbum }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  return <RecordLockActions base={base(kind, record.id)} record={record} onChanged={() => invalidatePersonal(qc)} hint={t(hintKey(kind))} />
}

/**
 * **ბარათის ლოკის პუნქტები** — `⋯`-სა და მარჯვენა ღილაკის მენიუში: ჩაკეტვა,
 * ან ჩაკეტილზე ისევ ჩაკეტვა · პაროლი (დამალულზე მხოლოდ პაროლი — „ისევ
 * ჩაკეტვას" აზრი არ აქვს, გახსნას ბარათი თვითონ სთავაზობს).
 *
 * ⚠️ გვერდის ღილაკების (`PersonalLockActions`) იგივე ფანჯარა და მოთხოვნა —
 * ბარათზე ლოკის ველები `PersonResource`/`PersonalAlbumResource`-ს უკვე მოაქვს,
 * ე.ი. დამატებითი მოთხოვნა არ სჭირდება. `dialog` ბარათების სიის ბოლოს იხატება.
 */
export function usePersonalLockMenu(kind: PersonalLockKind) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [managing, setManaging] = useState<Person | PersonalAlbum | null>(null)

  const relock = useMutation({
    mutationFn: (record: Person | PersonalAlbum) => relockRecord(base(kind, record.id)),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('lock.relocked'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const items = (record: Person | PersonalAlbum): MenuAction[] =>
    record.locked
      ? [
          ...(isHidden(record) ? [] : [{ key: 'relock', label: t('lock.relock'), icon: Lock, run: () => relock.mutate(record) }]),
          { key: 'password', label: t('lock.password'), icon: KeyRound, run: () => setManaging(record) },
        ]
      : [{ key: 'lock', label: t('lock.lock'), icon: Lock, run: () => setManaging(record) }]

  const dialog = managing && (
    <RecordLockDialog
      base={base(kind, managing.id)}
      record={managing}
      onChanged={() => invalidatePersonal(qc)}
      hint={t(hintKey(kind))}
      onClose={() => setManaging(null)}
    />
  )

  return { items, dialog }
}

/** **ბოქლომიანი გვერდი** — დაუხსნელი პიროვნება/ალბომი, რიცხვით */
export function PersonalLockedScreen({
  kind,
  record,
  summary,
}: {
  kind: PersonalLockKind
  record: Person | PersonalAlbum
  /** „12 ფოტო · 3 ვიდეო" — რიცხვი ფოტოს არ ამხელს */
  summary: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  return (
    <RecordLockedScreen
      base={base(kind, record.id)}
      record={record}
      onChanged={() => invalidatePersonal(qc)}
      hint={t(hintKey(kind))}
      summary={summary}
    />
  )
}
