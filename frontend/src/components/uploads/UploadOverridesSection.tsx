import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { UPLOAD_KINDS, updateUserUploadOverrides, type UploadKind, type UploadOverrides } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { kbLabel } from '@/lib/uploadLimits'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   **ატვირთვის პირადი გამონაკლისები `/users/{id}`-ზე (Tasks §34.6).**

   ⚠️ **აქ ჩანს და იხსნება — თორემ ერთხელ მიცემული ნებართვა სამუდამოდ
   უხილავი დარჩებოდა** (დამტკიცება მას ჩუმად წერს, სხვაგან კი ის არსად
   ჩანს). მოხსნის შემდეგ ანგარიშს ისევ ინსტალაციის ლიმიტი მოქმედებს.

   ⚠️ **ჩიპზე დაჭერა ერთ ფორმატს ხსნის**, „ყველას მოხსნა" კი დასტურს
   ითხოვს — ორივე შექცევადია (ახალი მოთხოვნით ბრუნდება), მაგრამ მთელი
   სახეობის ერთი დაჭერით დაკარგვა შემთხვევით არ უნდა ხდებოდეს.

   ⚠️ **მთელი რუკა იგზავნება** (`PUT`) — სერვერზე ერთი წესია, ერთი
   ფორმატის მოხსნაც და მთელი სახეობისაც.
   ============================================================ */

export function UploadOverridesSection({ userId, overrides }: { userId: number; overrides: UploadOverrides }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const kinds = UPLOAD_KINDS.filter((k) => overrides[k])

  const save = useMutation({
    mutationFn: (next: UploadOverrides) => updateUserUploadOverrides(userId, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', userId] })
      toast({ title: t('uploads.overrides.removed'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const without = (kind: UploadKind, change: (o: NonNullable<UploadOverrides[UploadKind]>) => UploadOverrides[UploadKind]) => {
    const next: UploadOverrides = { ...overrides }
    const own = next[kind]
    if (!own) return

    const changed = change(own)
    if (!changed || (changed.formats.length === 0 && changed.max_kb == null)) {
      delete next[kind]
    } else {
      next[kind] = changed
    }

    save.mutate(next)
  }

  const removeKind = async (kind: UploadKind) => {
    const ok = await confirm({
      title: t('uploads.overrides.removeAllTitle', { kind: t(`uploads.kind.${kind}`) }),
      description: t('uploads.overrides.removeAllHint'),
      confirmText: t('uploads.overrides.removeAll'),
      variant: 'destructive',
    })

    if (ok) without(kind, () => undefined)
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
        {t('uploads.overrides.title')}
        <InfoHint info={t('uploads.overrides.hint')} />
      </h2>

      {kinds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('uploads.overrides.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {kinds.map((kind) => {
            const own = overrides[kind]!

            return (
              <li key={kind} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-40 font-medium">{t(`uploads.kind.${kind}`)}</span>

                {own.formats.map((f) => (
                  <Chip
                    key={f}
                    remove
                    disabled={save.isPending}
                    title={t('uploads.overrides.removeOne', { what: f.toUpperCase() })}
                    onClick={() => without(kind, (o) => ({ ...o, formats: o.formats.filter((x) => x !== f) }))}
                  >
                    {f.toUpperCase()}
                  </Chip>
                ))}

                {own.max_kb != null && (
                  <Chip
                    remove
                    disabled={save.isPending}
                    title={t('uploads.overrides.removeOne', { what: `≤ ${kbLabel(own.max_kb)}` })}
                    onClick={() => without(kind, (o) => ({ ...o, max_kb: null }))}
                  >
                    ≤ {kbLabel(own.max_kb)}
                  </Chip>
                )}

                <Button
                  size="sm"
                  variant="destructiveOutline"
                  className="ml-auto"
                  disabled={save.isPending}
                  onClick={() => removeKind(kind)}
                >
                  <Trash2 className="size-4" />
                  {t('uploads.overrides.removeAll')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
