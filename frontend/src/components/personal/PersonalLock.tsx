import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock, LockOpen, ShieldAlert } from 'lucide-react'
import {
  isHidden,
  relockPersonal,
  setPersonalLock,
  unlockPersonal,
  type Person,
  type PersonalAlbum,
  type PersonalLockKind,
  type RecordLockState,
} from '@/api/personal'
import { albumPasswordProblem } from '@/lib/albumPassword'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, isApiCode } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
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
   **ადამიანისა და ალბომის ჩაკეტვა (Tasks §33.7 ← §35.4).**

   სამი ნაწილი: გახსნა (`PersonalUnlockDialog`), დადება/შეცვლა/მოხსნა
   (`PersonalLockDialog`) და ბოქლომიანი გვერდი (`PersonalLockedScreen`).

   ⚠️ **ლოკი სერვერზეა** (`RecordLocks`): დაუხსნელ ჩანაწერზე სერვერი ყდას,
   ჩანიშვნას და შიგთავსს საერთოდ არ აგზავნის — აქ დასამალი არაფერია, მხოლოდ
   ბოქლომი იხატება. გახსნა **სესიაშია**: გასვლისას ისევ იკეტება.

   ⚠️ **გალერეის ალბომის ფორმა და სიტყვები** (`AlbumUnlockDialog`,
   `AlbumDialog`): იგივე პაროლის ველები (`AlbumPasswordFields`), იგივე
   „ანგარიშის პაროლი" არსებული ლოკის შესაცვლელად — ორი სხვადასხვა ლოკი ერთ
   აპში ორ სხვადასხვა ჩვევას არ უნდა ითხოვდეს.
   ============================================================ */

type Lockable = Pick<RecordLockState, 'locked' | 'unlocked' | 'lock_hint' | 'unlock_blocked_until'> & {
  id: number
  name: string
}

/** **გახსნა ამ სესიაში** — არასწორი პაროლი ველთან, ბლოკი/სესია — სერვერის ტექსტით */
export function PersonalUnlockDialog({
  kind,
  record,
  onClose,
  onUnlocked,
}: {
  kind: PersonalLockKind
  record: Lockable
  onClose: () => void
  onUnlocked?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { dateTime } = useDateFormat()
  const [password, setPassword] = useState('')
  const [wrong, setWrong] = useState(false)

  const unlock = useMutation({
    mutationFn: () => unlockPersonal(kind, record.id, password),
    onSuccess: () => {
      invalidatePersonal(qc)
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
    <ModalShell title={record.name} onClose={onClose} hint={t('personal.lock.unlockHint')}>
      <form
        id="personal-unlock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) unlock.mutate()
        }}
      >
        <FormSection>
          {record.lock_hint && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="size-4 shrink-0" />
              {t('personal.lock.hintShown', { hint: record.lock_hint })}
            </p>
          )}
          {record.unlock_blocked_until && (
            <p className="text-sm text-destructive">
              {t('personal.lock.blockedUntil', { time: dateTime(record.unlock_blocked_until) })}
            </p>
          )}
          <FormField label={t('gallery.albumPassword')} htmlFor="personal-unlock">
            <PasswordInput
              id="personal-unlock"
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
        <Button type="submit" form="personal-unlock-form" disabled={!password || unlock.isPending}>
          <LockOpen className="size-4" />
          {t('personal.lock.unlock')}
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
export function PersonalLockDialog({
  kind,
  record,
  onClose,
}: {
  kind: PersonalLockKind
  record: Person | PersonalAlbum
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [hint, setHint] = useState(record.lock_hint ?? '')
  const [current, setCurrent] = useState('')
  const [removing, setRemoving] = useState(false)

  const locked = record.locked
  const needsCurrent = isHidden(record)
  const hintChanged = hint.trim() !== (record.lock_hint ?? '')
  const changing = removing || !!password || (locked && hintChanged)

  const save = useMutation({
    mutationFn: () =>
      setPersonalLock(kind, record.id, {
        ...(removing ? { remove: true } : { ...(password ? { password } : {}), hint: hint.trim() || null }),
        ...(needsCurrent ? { account_password: current } : {}),
      }),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t(removing ? 'personal.lock.removed' : 'personal.lock.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const ready =
    changing &&
    (removing || locked || !!password) &&
    !albumPasswordProblem(password, repeat) &&
    (!needsCurrent || !!current)

  return (
    <ModalShell
      title={t('personal.lock.title')}
      onClose={onClose}
      hint={t(kind === 'people' ? 'personal.lock.hintPerson' : 'personal.lock.hintAlbum')}
    >
      <form
        id="personal-lock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) save.mutate()
        }}
      >
        <FormSection>
          <p className="flex items-center gap-2 text-sm font-medium">
            {locked ? <Lock className="size-4 text-primary" /> : <LockOpen className="size-4 text-muted-foreground" />}
            {record.name}
            {locked && <InfoHint info={t('personal.lock.lockedHint')} />}
          </p>

          {needsCurrent && (
            <div>
              <Label htmlFor="personal-lock-current" className="flex items-center gap-1.5">
                {t('gallery.albumAccountPassword')}
                <InfoHint info={t('personal.lock.accountPasswordHint')} />
              </Label>
              <PasswordInput id="personal-lock-current" value={current} onChange={setCurrent} autoComplete="current-password" />
            </div>
          )}

          {removing ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{t('personal.lock.removeHint')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(false)}>
                {t('actions.cancel')}
              </Button>
            </div>
          ) : (
            <>
              <AlbumPasswordFields
                idPrefix="personal-lock"
                password={password}
                repeat={repeat}
                onPassword={setPassword}
                onRepeat={setRepeat}
                replacing={locked}
              />
              <FormField label={t('personal.lock.hintLabel')} htmlFor="personal-lock-hint" hint={t('personal.lock.hintHelp')}>
                <Input id="personal-lock-hint" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={120} />
              </FormField>
              {locked && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(true)}>
                    <LockOpen className="size-4" />
                    {t('personal.lock.remove')}
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
        <Button
          type="submit"
          form="personal-lock-form"
          variant={removing ? 'destructive' : 'default'}
          disabled={!ready || save.isPending}
        >
          {removing ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {t(removing ? 'personal.lock.remove' : 'actions.save')}
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
      {t(hidden ? 'personal.lock.badgeLocked' : 'personal.lock.badgeOpen')}
    </span>
  )
}

/**
 * **გვერდის ღილაკები** — „ჩაკეტვა" (ლოკის გარეშე), „ისევ ჩაკეტვა" და
 * „პაროლი" (ჩაკეტილი, ამ სესიაში გახსნილი). ⚠️ დაუხსნელ გვერდზე ეს ღილაკები
 * არ ჩანს — იქ `PersonalLockedScreen` დგას.
 */
export function PersonalLockActions({ kind, record }: { kind: PersonalLockKind; record: Person | PersonalAlbum }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [managing, setManaging] = useState(false)

  const relock = useMutation({
    mutationFn: () => relockPersonal(kind, record.id),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('personal.lock.relocked'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <>
      {record.locked ? (
        <>
          <Button variant="outline" onClick={() => relock.mutate()} disabled={relock.isPending}>
            <Lock className="size-4" />
            {t('personal.lock.relock')}
          </Button>
          <Button variant="outline" onClick={() => setManaging(true)}>
            <KeyRound className="size-4" />
            {t('personal.lock.password')}
          </Button>
        </>
      ) : (
        <Button variant="outline" onClick={() => setManaging(true)}>
          <Lock className="size-4" />
          {t('personal.lock.lock')}
        </Button>
      )}

      {managing && <PersonalLockDialog kind={kind} record={record} onClose={() => setManaging(false)} />}
    </>
  )
}

/**
 * **ბოქლომიანი გვერდი** — დაუხსნელი ადამიანი/ალბომი. სახელი და რიცხვი ჩანს,
 * შიგთავსი კი სერვერიდან საერთოდ არ მოდის; „პაროლის შეცვლა" ანგარიშის
 * პაროლით (დავიწყებული პაროლი ჩიხი არ არის).
 */
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
  const [unlocking, setUnlocking] = useState(false)
  const [managing, setManaging] = useState(false)

  return (
    <section className="grid place-items-center rounded-xl border border-border bg-card px-6 py-14 text-center" data-testid="personal-locked">
      <span className="grid size-14 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Lock className="size-7" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{t('personal.lock.screenTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => setUnlocking(true)}>
          <LockOpen className="size-4" />
          {t('personal.lock.unlock')}
        </Button>
        <Button variant="outline" onClick={() => setManaging(true)}>
          <KeyRound className="size-4" />
          {t('personal.lock.forgot')}
        </Button>
      </div>

      {unlocking && <PersonalUnlockDialog kind={kind} record={record} onClose={() => setUnlocking(false)} />}
      {managing && <PersonalLockDialog kind={kind} record={record} onClose={() => setManaging(false)} />}
    </section>
  )
}
