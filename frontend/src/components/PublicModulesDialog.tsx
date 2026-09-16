import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { setModulePublic } from '@/api/publicProfile'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { errorMessage } from '@/lib/errors'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ModalShell } from '@/components/ui/modal-shell'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ფენა 2 — რომელი მოდული ჩანს საჯარო პროფილზე (Tasks §7.2).**

   შენი სიტყვები: „რომელი მოდულები ჩანს — გვერდზე ღილაკი ჰქონდეს მარჯვნივ
   და მოდალი გამოდიოდეს".

   ⚠️ **წესი, რომელიც გადმოტანისას არ უნდა დაიკარგოს: სანამ თვითონ
   პროფილი პირადია, ეს გადამრთველები მკვდარია.** ბარათზე ის `disabled`-ით
   ჩანდა — მოდალში იგივე `disabled` ახსნის გარეშე „რატომ არ მუშაობს"-ად
   წაიკითხებოდა, ამიტომ ფანჯარა **ხმამაღლა ამბობს** მიზეზს.

   ⚠️ **ხატულა და ფერი მოდულისაა** (`modules.color` + `ModuleIcon`) — იგივე,
   რასაც საიდბარი და გვერდის სათაური ხატავს. ფერი inline `style`-ით მიდის
   (`modAccent()`): Tailwind hex-იდან კლასს **ვერ** ააგებს.
   ============================================================ */

export function PublicModulesDialog({
  profilePublic,
  onClose,
}: {
  /** ფენა 1 — პროფილი თვითონ ღიაა თუ არა */
  profilePublic: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { enabled } = useModules()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [busy, setBusy] = useState<string | null>(null)

  // მოდულები, რომელთა გასაჯაროებაც საერთოდ შეიძლება (`note` — არასდროს, 16.5)
  const shareable = enabled.filter((m) => m.shareable)

  const toggle = async (key: string, next: boolean) => {
    setBusy(key)
    try {
      await setModulePublic(key, next)
      // `is_public` `GET /modules`-იდან მოდის — სია უნდა გადმოიკითხოს
      await qc.invalidateQueries({ queryKey: ['modules'] })
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalShell title={t('publicProfile.modules')} onClose={onClose}>
      <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">{t('publicProfile.modulesHint')}</p>

        {!profilePublic && (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t('publicProfile.profilePrivateNotice')}
          </p>
        )}

        {shareable.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">{t('publicProfile.noShareable')}</p>
        ) : (
          <ul>
            {shareable.map((m) => (
              <li
                key={m.key}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
                style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
                    <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />
                  </span>
                  <span className="min-w-0 truncate text-sm">{moduleName(m, i18n.language)}</span>
                </span>
                <Switch
                  checked={!!m.is_public}
                  disabled={!profilePublic || busy === m.key}
                  onCheckedChange={(v) => toggle(m.key, v)}
                  aria-label={moduleName(m, i18n.language)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
