import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { fetchTrashRetention } from '@/api/trash'
import { useSettings } from '@/lib/settings'
import { SettingRow as Row } from '@/components/SettingRow'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'

/* ============================================================
   **ურნის ვადა** (Tasks §29, ეტაპი 6 — 29.6) — `/settings`-ის ერთი სექცია.

   ⚠️ **ვადა ჩვეულებრივი პარამეტრია** (`users.settings.trashDays`) და
   `SettingsSaveBar`-ით ინახება — ცალკე ღილაკი ერთ გვერდზე ორ შენახვას
   გააჩენდა. ზედა ზღვარს კი სერვერი ამბობს (`max_days`, ინსტალაციისაა),
   რადგან კლიენტში მისი ასლი პირველივე შეცვლაზე დაშორდებოდა.

   ⚠️ **შემოკლება ურნაში უკვე მყოფზეც მოქმედებს** მომდევნო ღამის
   გასუფთავებისას — ამიტომ შეუნახავ მნიშვნელობაზე გვერდი სერვერს ეკითხება,
   რამდენი წაიშლება, და შენახვამდე ამბობს.
   ============================================================ */

export function TrashRetentionSetting() {
  const { t } = useTranslation()
  const { settings, set, isDirty } = useSettings()
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
    </section>
  )
}
