import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, HelpCircle } from 'lucide-react'
import { fetchCredentials, revealCredential, saveCredential } from '@/api/credentials'
import { errorMessage } from '@/lib/errors'
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/lib/noteReminders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { SecretInput } from '@/components/ui/secret-input'
import { CredentialHelpDialog } from '@/components/CredentialHelpDialog'
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

  /* ⚠️ ტოკენი **აღარ მოდის** მოდულების სიასთან ერთად (§21.9): ის ახლა
     დაშიფრულია და მხოლოდ ნიღბიანი კუდი ჩანს. ამიტომ ეს ფანჯარაც იმავე
     წყაროს ეკითხება, რასაც „მონაცემები". */
  const credentials = useQuery({ queryKey: ['credentials'], queryFn: fetchCredentials })
  const telegram = credentials.data?.data.find((c) => c.provider === 'telegram')
  const tokenField = telegram?.fields.find((f) => f.name === 'bot_token')
  const chatField = telegram?.fields.find((f) => f.name === 'chat_id')

  const [form, setForm] = useState({ bot_token: '', chat_id: '' })
  const [permission, setPermission] = useState(notificationPermission())
  const [helpOpen, setHelpOpen] = useState(false)

  /* ⚠️ `chat_id` საიდუმლო არაა, ე.ი. სერვერიდან მზა მნიშვნელობით მოდის —
     ტოკენი კი არა. ფორმა სწორედ ამ ასიმეტრიას მიჰყვება: ღია ველი ივსება,
     საიდუმლო ცარიელი რჩება (ცარიელი = „არ შეცვლილა"). */
  useEffect(() => {
    if (chatField) setForm((f) => (f.chat_id === '' ? { ...f, chat_id: chatField.value ?? '' } : f))
  }, [chatField])

  const save = useMutation({
    /* ⚠️ ცარიელი საიდუმლო **არ იგზავნება** — backend-ზე ცარიელი სტრიქონი
       „გასუფთავებას" ნიშნავს, ე.ი. მხოლოდ chat id-ის შეცვლა ტოკენს
       ჩუმად წაშლიდა. */
    mutationFn: () =>
      saveCredential('telegram', {
        fields: {
          ...(form.bot_token !== '' ? { bot_token: form.bot_token } : {}),
          chat_id: form.chat_id,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] })
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{t('notes.channels.telegram')}</h3>
            <span className="flex-1" />
            {/* ⚠️ იგივე მოდალია, რაც `/credentials`-ზე: ბოტის ტოკენიც
                ზუსტად ისეთივე „საიდან მოვიტანო"-ა, და მეორე, თითქმის
                იდენტური ფანჯარა ერთ კვირაში დაშორდებოდა. */}
            <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
              <HelpCircle className="size-4" />
              {t('credentials.getKey')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('notes.telegramHint')}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tg-token">{t('notes.telegramToken')}</Label>
              {/* ⚠️ **ტოკენი პაროლის სახითაა** (შენი მითითება): ის სრული
                  წვდომაა ბოტზე, ე.ი. ეკრანზე ღიად წერა იმავე რიგისაა, რაც
                  გასაღების ჩვენება. ⚠️ `onReveal` **არ სჭირდება** — ეს
                  მნიშვნელობა `module_user.settings`-იდან ისედაც ხელთაა,
                  ე.ი. თვალი ლოკალურად მუშაობს და სერვერს არ ეკითხება. */}
              <SecretInput
                id="tg-token"
                value={form.bot_token}
                masked={tokenField?.masked ?? null}
                placeholder="123456:ABC-DEF…"
                onChange={(value) => setForm((f) => ({ ...f, bot_token: value }))}
                onReveal={
                  tokenField?.has_own
                    ? async () => (await revealCredential('telegram')).fields.bot_token ?? null
                    : undefined
                }
              />
            </div>
            <div>
              <Label htmlFor="tg-chat">{t('notes.telegramChat')}</Label>
              <Input
                id="tg-chat"
                value={form.chat_id}
                placeholder="123456789"
                onChange={(e) => setForm((f) => ({ ...f, chat_id: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* ⚠️ **ელფოსტის არხი წაშლილია (Tasks §8.2)** — SMTP ამ პროექტს
            არ აქვს, ე.ი. ველი მხოლოდ იმას გვპირდებოდა, რასაც ვერ ასრულებდა.
            მის ადგილს **ჟურნალი** იკავებს: ყოველი გასროლილი შეხსენება
            რჩება და `/notes`-ის „ჟურნალის" ღილაკიდან იკითხება. */}

        {helpOpen && (
          <CredentialHelpDialog
            provider="telegram"
            brand="Telegram"
            docs="https://t.me/BotFather"
            onClose={() => setHelpOpen(false)}
          />
        )}

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
