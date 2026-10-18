import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { Person, PersonalAlbum, PersonalLockKind } from '@/api/personal'
import { invalidatePersonal } from '@/lib/personal'
import {
  RecordLockActions,
  RecordLockedScreen,
  RecordUnlockDialog,
  type LockableRecord,
} from '@/components/locks/RecordLock'

/* ============================================================
   **ადამიანისა და ალბომის ჩაკეტვა.**

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

/** **ბოქლომიანი გვერდი** — დაუხსნელი ადამიანი/ალბომი, რიცხვით */
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
