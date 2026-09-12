import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { updateModuleSettings } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/lib/noteReminders'
import { useModules } from '@/lib/modules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მიწოდების არხების პარამეტრები (Tasks §13.3).

   ⚠️ **`module_user.settings`-შია და არა `users.settings`-ში**: ეს
   პარამეტრები მხოლოდ ამ მოდულს ეხება და per-module კონფიგი უკვე არსებობს
   (`PUT /api/modules/{key}/settings`). ანგარიშის დონეზე გატანა `/settings`
   გვერდს სხვისი მოდულის ველებით დაამძიმებდა.

   ⚠️ ბრაუზერის ნებართვა **მხოლოდ user-ის კლიკიდან** ითხოვება — სხვას
   ბრაუზერები ბლოკავენ.
   ============================================================ */

export function NoteChannelsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { all } = useModules()

  const settings = (all.find((m) => m.key === 'note')?.user_settings ?? {}) as Record<string, string>

  const [form, setForm] = useState({
    telegram_bot_token: settings.telegram_bot_token ?? '',
    telegram_chat_id: settings.telegram_chat_id ?? '',
  })
  const [permission, setPermission] = useState(notificationPermission())

  const save = useMutation({
    mutationFn: () => updateModuleSettings('note', { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules'] })
      toast({ title: t('notes.channelsSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('notes.channelsTitle')} onClose={onClose} wide>
      <div className="mt-4 space-y-5">
        {/* ---------- ბრაუზერი ---------- */}
        <section className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">{t('notes.channels.browser')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('notes.browserHint')}</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <BellRing className="size-4 text-muted-foreground" />
            {t(`notes.permission.${permission}`)}
            {permission !== 'granted' && permission !== 'unsupported' && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => setPermission(await requestNotificationPermission())}
              >
                {t('notes.permissionAsk')}
              </Button>
            )}
          </p>
        </section>

        {/* ---------- ტელეგრამი ---------- */}
        <section className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">{t('notes.channels.telegram')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('notes.telegramHint')}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tg-token">{t('notes.telegramToken')}</Label>
              <Input
                id="tg-token"
                value={form.telegram_bot_token}
                placeholder="123456:ABC-DEF…"
                onChange={(e) => setForm((f) => ({ ...f, telegram_bot_token: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="tg-chat">{t('notes.telegramChat')}</Label>
              <Input
                id="tg-chat"
                value={form.telegram_chat_id}
                placeholder="123456789"
                onChange={(e) => setForm((f) => ({ ...f, telegram_chat_id: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* ⚠️ **ელფოსტის არხი წაშლილია (Tasks §8.2)** — SMTP ამ პროექტს
            არ აქვს, ე.ი. ველი მხოლოდ იმას გვპირდებოდა, რასაც ვერ ასრულებდა.
            მის ადგილს **ჟურნალი** იკავებს: ყოველი გასროლილი შეხსენება
            რჩება და `/notes`-ის „ჟურნალის" ღილაკიდან იკითხება. */}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
