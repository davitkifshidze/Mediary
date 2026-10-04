import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, Lock, LockOpen, ShieldAlert } from 'lucide-react'
import { isHidden, putRecordLock, relockRecord, unlockRecord, type RecordLockState } from '@/api/locks'
import { albumPasswordProblem } from '@/lib/albumPassword'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PasswordInput } from '@/components/ui/secret-input'
import { AlbumPasswordFields } from '@/components/gallery/AlbumPasswordFields'

/* ============================================================
   **ჩანაწერის ჩაკეტვა პაროლით — ერთი ფორმა ყველგან (Tasks §33.7 → §35.5).**

   ოთხი ნაწილი: გახსნა (`RecordUnlockDialog`), დადება/შეცვლა/მოხსნა
   (`RecordLockDialog`), გვერდის ღილაკები (`RecordLockActions`) და ბოქლომიანი
   გვერდი (`RecordLockedScreen`). ჩანაწერს მხოლოდ ორი რამ განასხვავებს —
   API-ის მისამართი (`base`, მაგ. `/movies/12`) და რა გადაიტვირთოს ცვლილების
   შემდეგ (`onChanged`); პირადი გალერეა, ფილმი და მსახიობი ერთსა და იმავე
   ფანჯრებს ხატავენ.

   ⚠️ **ლოკი სერვერზეა** (`RecordLocks`): დაუხსნელზე შიგთავსი საერთოდ არ მოდის —
   აქ დასამალი არაფერია, მხოლოდ ბოქლომი იხატება. გახსნა **სესიაშია**.

   ⚠️ **გალერეის ალბომის ფორმა და სიტყვები** — იგივე პაროლის ველები
   (`AlbumPasswordFields`), იგივე „ანგარიშის პაროლი" არსებული ლოკის
   შესაცვლელად: ორი ლოკი ერთ აპში ორ სხვადასხვა ჩვევას არ უნდა ითხოვდეს.
   ============================================================ */

export type LockableRecord = Pick<RecordLockState, 'locked' | 'unlocked' | 'lock_hint' | 'unlock_blocked_until'> & {
  id: number
  name: string
}

interface LockTarget {
  /** API-ის მისამართი ბოლო სეგმენტის გარეშე — `/personal/people/3`, `/movies/12` */
  base: string
  record: LockableRecord
  /** რა გადაიტვირთოს ცვლილების შემდეგ (სიები, გვერდი) */
  onChanged: () => void
}

/** **გახსნა ამ სესიაში** — არასწორი პაროლი ველთან, ბლოკი/სესია — სერვერის ტექსტით */
export function RecordUnlockDialog({
  base,
  record,
  onChanged,
  onClose,
  onUnlocked,
}: LockTarget & { onClose: () => void; onUnlocked?: () => void }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const [password, setPassword] = useState('')
  const [wrong, setWrong] = useState(false)

  const unlock = useMutation({
    mutationFn: () => unlockRecord(base, password),
    onSuccess: () => {
      onChanged()
      onUnlocked?.()
      onClose()
    },
    onError: (e) => {
      const isWrong = isApiCode(e, 'record_password_wrong')
      setWrong(isWrong)
      if (isWrong) setPassword('')
    },
  })

  return (
    <ModalShell title={record.name} onClose={onClose} hint={t('lock.unlockHint')}>
      <form
        id="record-unlock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) unlock.mutate()
        }}
      >
        <FormSection>
          {record.lock_hint && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="size-4 shrink-0" />
              {t('lock.hintShown', { hint: record.lock_hint })}
            </p>
          )}
          {record.unlock_blocked_until && (
            <p className="text-sm text-destructive">{t('lock.blockedUntil', { time: dateTime(record.unlock_blocked_until) })}</p>
          )}
          <FormField label={t('gallery.albumPassword')} htmlFor="record-unlock">
            <PasswordInput
              id="record-unlock"
              value={password}
              onChange={(v) => {
                setPassword(v)
                setWrong(false)
              }}
              autoComplete="off"
            />
            {wrong && <p className="mt-1.5 text-xs text-destructive">{t('gallery.albumPasswordWrong')}</p>}
            {unlock.isError && !wrong && <p className="mt-1.5 text-xs text-destructive">{errorMessage(unlock.error)}</p>}
          </FormField>
        </FormSection>
      </form>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form="record-unlock-form" disabled={!password || unlock.isPending}>
          <LockOpen className="size-4" />
          {t('lock.unlock')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

/**
 * **პაროლის დადება, შეცვლა ან მოხსნა.**
 *
 * ⚠️ არსებული ლოკის ცვლილება **ანგარიშის პაროლს** ითხოვს, თუ ჩანაწერი ამ
 * სესიაში არ გახსნილა (სერვერის წესი, `ManagesRecordLock::putLock()`) — ველი
 * მხოლოდ მაშინ ჩანს. „დამავიწყდა" ამიტომ ჩიხი არ არის.
 */
export function RecordLockDialog({
  base,
  record,
  onChanged,
  onClose,
  hint,
}: LockTarget & {
  onClose: () => void
  /** რას ნიშნავს ჩაკეტვა ამ ჩანაწერზე — ფანჯრის ქვესათაური */
  hint: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [lockHint, setLockHint] = useState(record.lock_hint ?? '')
  const [current, setCurrent] = useState('')
  const [removing, setRemoving] = useState(false)

  const locked = record.locked
  const needsCurrent = isHidden(record)
  const hintChanged = lockHint.trim() !== (record.lock_hint ?? '')
  const changing = removing || !!password || (locked && hintChanged)

  const save = useMutation({
    mutationFn: () =>
      putRecordLock(base, {
        ...(removing ? { remove: true } : { ...(password ? { password } : {}), hint: lockHint.trim() || null }),
        ...(needsCurrent ? { account_password: current } : {}),
      }),
    onSuccess: () => {
      onChanged()
      toast({ title: t(removing ? 'lock.removed' : 'lock.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const ready =
    changing && (removing || locked || !!password) && !albumPasswordProblem(password, repeat) && (!needsCurrent || !!current)

  return (
    <ModalShell title={t('lock.title')} onClose={onClose} hint={hint}>
      <form
        id="record-lock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) save.mutate()
        }}
      >
        <FormSection>
          <p className="flex items-center gap-2 text-sm font-medium">
            {locked ? <Lock className="size-4 text-primary" /> : <LockOpen className="size-4 text-muted-foreground" />}
            {record.name}
            {locked && <InfoHint info={t('lock.lockedHint')} />}
          </p>

          {needsCurrent && (
            <div>
              <Label htmlFor="record-lock-current" className="flex items-center gap-1.5">
                {t('gallery.albumAccountPassword')}
                <InfoHint info={t('lock.accountPasswordHint')} />
              </Label>
              <PasswordInput id="record-lock-current" value={current} onChange={setCurrent} autoComplete="current-password" />
            </div>
          )}

          {removing ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{t('lock.removeHint')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(false)}>
                {t('actions.cancel')}
              </Button>
            </div>
          ) : (
            <>
              <AlbumPasswordFields
                idPrefix="record-lock"
                password={password}
                repeat={repeat}
                onPassword={setPassword}
                onRepeat={setRepeat}
                replacing={locked}
              />
              <FormField label={t('lock.hintLabel')} htmlFor="record-lock-hint" hint={t('lock.hintHelp')}>
                <Input id="record-lock-hint" value={lockHint} onChange={(e) => setLockHint(e.target.value)} maxLength={120} />
              </FormField>
              {locked && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(true)}>
                    <LockOpen className="size-4" />
                    {t('lock.remove')}
                  </Button>
                </div>
              )}
            </>
          )}
        </FormSection>
      </form>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form="record-lock-form" variant={removing ? 'destructive' : 'default'} disabled={!ready || save.isPending}>
          {removing ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {t(removing ? 'lock.remove' : 'actions.save')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

/** ბარათის ნიშანი — „ჩაკეტილი" ან „გახსნილი" (ჩაკეტილი, ამ სესიაში ღია) */
export function LockBadge({ hidden }: { hidden: boolean }) {
  const { t } = useTranslation()

  return (
    <span className="inline-flex items-center gap-1">
      {hidden ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
      {t(hidden ? 'lock.badgeLocked' : 'lock.badgeOpen')}
    </span>
  )
}

/**
 * **გვერდის ღილაკები** — „ჩაკეტვა" (ლოკის გარეშე), „ისევ ჩაკეტვა" და „პაროლი"
 * (ჩაკეტილი, ამ სესიაში გახსნილი). ⚠️ დაუხსნელ გვერდზე ეს ღილაკები არ ჩანს —
 * იქ `RecordLockedScreen` დგას.
 */
export function RecordLockActions({ base, record, onChanged, hint, size }: LockTarget & { hint: string; size?: 'sm' }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [managing, setManaging] = useState(false)

  const relock = useMutation({
    mutationFn: () => relockRecord(base),
    onSuccess: () => {
      onChanged()
      toast({ title: t('lock.relocked'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <>
      {record.locked ? (
        <>
          <Button variant="outline" size={size} onClick={() => relock.mutate()} disabled={relock.isPending}>
            <Lock className="size-4" />
            {t('lock.relock')}
          </Button>
          <Button variant="outline" size={size} onClick={() => setManaging(true)}>
            <KeyRound className="size-4" />
            {t('lock.password')}
          </Button>
        </>
      ) : (
        <Button variant="outline" size={size} onClick={() => setManaging(true)}>
          <Lock className="size-4" />
          {t('lock.lock')}
        </Button>
      )}

      {managing && <RecordLockDialog base={base} record={record} onChanged={onChanged} hint={hint} onClose={() => setManaging(false)} />}
    </>
  )
}

/**
 * **ბოქლომიანი გვერდი** — დაუხსნელი ჩანაწერი. სახელი და (თუ აქვს) რიცხვი ჩანს,
 * შიგთავსი კი სერვერიდან საერთოდ არ მოდის; „პაროლის შეცვლა" ანგარიშის პაროლით
 * (დავიწყებული პაროლი ჩიხი არ არის).
 */
export function RecordLockedScreen({
  base,
  record,
  onChanged,
  hint,
  summary,
}: LockTarget & {
  hint: string
  /** „12 ფოტო · 3 ვიდეო" — რიცხვი შიგთავსს არ ამხელს */
  summary?: string
}) {
  const { t } = useTranslation()
  const [unlocking, setUnlocking] = useState(false)
  const [managing, setManaging] = useState(false)

  return (
    <section className="grid place-items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="record-locked">
      <span className="grid size-14 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Lock className="size-7" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{t('lock.screenTitle')}</h2>
      {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => setUnlocking(true)}>
          <LockOpen className="size-4" />
          {t('lock.unlock')}
        </Button>
        <Button variant="outline" onClick={() => setManaging(true)}>
          <KeyRound className="size-4" />
          {t('lock.forgot')}
        </Button>
      </div>

      {unlocking && <RecordUnlockDialog base={base} record={record} onChanged={onChanged} onClose={() => setUnlocking(false)} />}
      {managing && <RecordLockDialog base={base} record={record} onChanged={onChanged} hint={hint} onClose={() => setManaging(false)} />}
    </section>
  )
}
