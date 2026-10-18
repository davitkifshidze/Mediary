import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Save } from 'lucide-react'
import { fetchAuditSettings, saveAuditSettings, type AuditKindSetting } from '@/api/audit'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **„ჟურნალის პარამეტრები" — რა იწერება** (სუპერადმინი).

   შენი სიტყვები: „აბსოლუტურად ყველა მოქმედების ჩართვა-გამორთვის უფლებები მინდა
   მქონდეს". თითო ტიპი — გადამრთველით; ჩატის წაშლა დაცულია (🔒). ⚠️ ცხადი
   „შენახვა" (პარამეტრების წესი) — გადამრთველი მყისიერად არაფერს წერს, ე.ი.
   რამდენიმეს ერთად შეცვლა ერთი ცვლილებაა და ჟურნალშიც ერთხელ ჩანს.
   ============================================================ */

export function AuditSettingsPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['audit-settings'], queryFn: fetchAuditSettings })
  const [draft, setDraft] = useState<AuditKindSetting[]>([])

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  const save = useMutation({
    mutationFn: () => saveAuditSettings(draft.filter((kind) => !kind.enabled).map((kind) => kind.key)),
    onSuccess: (next) => {
      qc.setQueryData(['audit-settings'], next)
      // `/auth/me`-ის `audit_kinds` — SPA მაშინვე წყვეტს/იწყებს გაგზავნას
      qc.invalidateQueries({ queryKey: ['me'] })
      toast({ title: t('audit.settings.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const dirty = data != null && draft.some((kind, i) => kind.enabled !== data[i]?.enabled)

  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="audit-settings">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        {t('audit.settings.title')}
        <InfoHint info={t('audit.settings.hint')} />
      </h2>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {draft.map((kind) => (
          <li key={kind.key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <label htmlFor={`audit-kind-${kind.key}`} className="flex min-w-0 cursor-pointer items-center gap-1.5 text-sm">
              {kind.protected && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('audit.settings.protected')} />}
              <span className="truncate">{t(`audit.settings.kinds.${kind.key}`)}</span>
            </label>
            <Switch
              id={`audit-kind-${kind.key}`}
              checked={kind.enabled}
              disabled={kind.protected}
              onCheckedChange={(on) => setDraft((cur) => cur.map((k) => (k.key === kind.key ? { ...k, enabled: on } : k)))}
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <Save className="size-3.5" />
          {t('actions.save')}
        </Button>
      </div>
    </section>
  )
}
