import { useTranslation } from 'react-i18next'
import { ExternalLink, HelpCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **„საიდან მოვიტანო ეს გასაღები"** (შენი მითითება, 2026-09-15).

   ⚠️ **ბმული პასუხი არ არის.** დოკუმენტაციის მისამართი ადრეც ეწერა თითო
   ბარათს, მაგრამ „გახსენი და გაერკვიე" ზუსტად ის ადგილია, სადაც ადამიანი
   ჩერდება: Google Cloud-ზე გასაღები ოთხ ეკრანზეა გაბნეული, Twitch-ს კი
   ორფაქტორიანი ავტორიზაცია სჭირდება, სანამ აპლიკაციას დაარეგისტრირებ.
   ამიტომ ნაბიჯები აქ, თვალწინ წერია და ბმული მათ **ბოლოშია**.

   ⚠️ **ნაბიჯები ერთი გასაღებია და არა `s1`…`s5`.** წყაროებს სხვადასხვა
   რაოდენობის ნაბიჯი აქვთ (Serper-ს ორი, IGDB-ს ოთხი), ე.ი. ფიქსირებული
   ველების ნაკრები ან ცარიელ სტრიქონებს დახატავდა, ან ნაბიჯს მოაჭრიდა.
   ტექსტი `\n`-ით იყოფა — i18n-ის ფაილებში მასივები არსად გვაქვს და ერთი
   მათგანის შემოტანა აუდიტის სკრიპტსაც შეეხებოდა.

   ⚠️ **ერთი კომპონენტი ტელეგრამსაც ემსახურება** (`provider="telegram"`),
   თუმცა ის `/credentials`-ზე არ ცხოვრობს: ბოტის ტოკენიც ზუსტად ისეთივე
   „საიდან მოვიტანო"-ა და მეორე, თითქმის იდენტური მოდალი ერთ კვირაში
   დაშორდებოდა.
   ============================================================ */

export function CredentialHelpDialog({
  provider,
  brand,
  docs,
  onClose,
}: {
  provider: string
  brand: string
  docs?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  const steps = t(`credentials.help.${provider}`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const note = t(`credentials.helpNote.${provider}`, '')

  return (
    <ModalShell title={t('credentials.helpTitle', { name: brand })} onClose={onClose}>
      <div className="mt-4 space-y-4">
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-secondary text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        {note && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <HelpCircle className="mt-0.5 size-4 shrink-0" />
            <span>{note}</span>
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {/* ⚠️ `<a>` + `buttonVariants()` და არა `<Button asChild>`:
              ამ პროექტის `Button` Radix-ის `Slot`-ს არ იყენებს, ე.ი.
              `asChild` მას საერთოდ არ აქვს. */}
          {docs && (
            <a
              href={docs}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('credentials.openSite')}
              <ExternalLink className="size-4" />
            </a>
          )}
          <Button onClick={onClose}>{t('actions.close')}</Button>
        </div>
      </div>
    </ModalShell>
  )
}
