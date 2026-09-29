import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw, Save, SquarePen } from 'lucide-react'
import { fetchTrashRetention, updateTrashMaxDays } from '@/api/trash'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { useSettings } from '@/lib/settings'
import { SettingRow as Row } from '@/components/SettingRow'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ურნის ვადა** (Tasks §29, ეტაპი 6 — 29.6) — `/settings`-ის ერთი სექცია.

   ⚠️ **ვადა ჩვეულებრივი პარამეტრია** (`users.settings.trashDays`) და
   `SettingsSaveBar`-ით ინახება — ცალკე ღილაკი ერთ გვერდზე ორ შენახვას
   გააჩენდა. ზედა ზღვარს კი სერვერი ამბობს (`max_days`, ინსტალაციისაა),
   რადგან კლიენტში მისი ასლი პირველივე შეცვლაზე დაშორდებოდა.

   ⚠️ **ზედა ზღვარს სუპერადმინი აქვე ცვლის** (§29.6 → §34.1) — ოღონდ **მოდალში
   და თავისი შენახვით**: ის ყველა ანგარიშს ეხება (`app_settings`) და
   ანგარიშის პარამეტრების ზოლთან ერთად შენახვა ორ სხვადასხვა ბუნების
   ცვლილებას აურევდა.

   ⚠️ **შემოკლება ურნაში უკვე მყოფზეც მოქმედებს** მომდევნო ღამის
   გასუფთავებისას — ამიტომ შეუნახავ მნიშვნელობაზე გვერდი სერვერს ეკითხება,
   რამდენი წაიშლება, და შენახვამდე ამბობს.
   ============================================================ */

export function TrashRetentionSetting() {
  const { t } = useTranslation()
  const { settings, set, isDirty } = useSettings()
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(false)
  const days = settings.trashDays
  const dirty = isDirty('trashDays')

  const retention = useQuery({
    queryKey: ['trash', 'retention', days],
    queryFn: () => fetchTrashRetention(days),
    // ⚠️ ყოველ აკრეფაზე ახალი გასაღებია — წინა პასუხი რჩება, რომ ხაზი არ ციმციმებდეს
    placeholderData: keepPreviousData,
  })

  const max = retention.data?.max_days ?? 365
  const expiring = retention.data?.expiring ?? 0

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-2 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
        {t('settings.trash')}
        <InfoHint info={t('settings.trashHint')} />
      </h2>

      <Row label={t('settings.trashDays')} hint={t('settings.trashDaysHint', { max })} dirty={dirty}>
        <Input
          type="number"
          min={1}
          max={max}
          value={days}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isNaN(v)) set('trashDays', Math.min(Math.max(1, Math.round(v)), max))
          }}
        />
      </Row>

      {/* ⚠️ შენახული მნიშვნელობა ზღვარს შეიძლება აღემატებოდეს (ზღვარი მოგვიანებით
          შემცირდა) — მოქმედებს ზღვარი და ეს ითქმის */}
      {retention.data && days > retention.data.max_days && (
        <p className="mt-2 text-xs text-muted-foreground">{t('settings.trashDaysCapped', { max })}</p>
      )}

      {dirty && expiring > 0 && retention.data && (
        <p className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t('settings.trashDaysExpiring', { count: expiring, time: retention.data.prune_at })}
        </p>
      )}

      {/* ---------- ზედა ზღვარი ყველასთვის — მხოლოდ სუპერადმინი (§34.1) ---------- */}
      {me?.is_super_admin && retention.data && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{t('settings.trashCeiling', { max })}</span>
          <InfoHint info={t('settings.trashCeilingHint')} critical={t('settings.trashCeilingWarn')} />
          <Button size="sm" variant="edit" className="ml-auto" onClick={() => setEditing(true)}>
            <SquarePen className="size-4" />
            {t('actions.edit')}
          </Button>
        </div>
      )}

      {editing && retention.data && (
        <CeilingDialog
          current={retention.data.max_days}
          fallback={retention.data.default_max_days}
          ceiling={retention.data.max_days_ceiling}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  )
}

function CeilingDialog({
  current,
  fallback,
  ceiling,
  onClose,
}: {
  current: number
  fallback: number
  /** ⚠️ სერვერისაა (`max_days_ceiling`) — კლიენტში ასლი არ იწერება */
  ceiling: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [value, setValue] = useState(String(current))

  const days = Number(value)
  const valid = Number.isInteger(days) && days >= 1 && days <= ceiling

  const save = useMutation({
    // ⚠️ ნაგულისხმევის ტოლი — `null`: სერვერი რიგს შლის და `TRASH_MAX_DAYS` ისევ მოქმედებს
    mutationFn: () => updateTrashMaxDays(days === fallback ? null : days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] })
      toast({ title: t('settings.trashCeilingSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('settings.trashCeilingTitle')} hint={t('settings.trashCeilingHint')} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={ceiling}
            inputMode="numeric"
            className="w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t('settings.trashCeilingTitle')}
          />
          <span className="text-sm text-muted-foreground">{t('settings.trashCeilingUnit')}</span>
          <InfoHint critical={t('settings.trashCeilingWarn')} />
          <Button size="sm" variant="ghost" disabled={days === fallback} onClick={() => setValue(String(fallback))}>
            <RotateCcw className="size-4" />
            {t('settings.trashCeilingDefault', { days: fallback })}
          </Button>
        </div>

        {!valid && <p className="text-xs text-destructive">{t('settings.trashCeilingInvalid', { max: ceiling })}</p>}

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={!valid || days === current || save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" />
            {t('actions.save')}
          </Button>
        </ModalFooter>
      </div>
    </ModalShell>
  )
}
