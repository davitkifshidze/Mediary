import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   „მთავარ ეკრანზე დამატება" (FEAT-15).

   ⚠️ **ღილაკი მხოლოდ მაშინ ჩანს, როცა ბრაუზერი თვითონ ამბობს, რომ
   დაყენება შეიძლება.** `beforeinstallprompt` არ ისვრება, თუ აპი უკვე
   დაყენებულია, თუ manifest არასრულია, ან თუ ბრაუზერს ეს საერთოდ არ
   აქვს (Safari, Firefox). მუდმივად დახატული ღილაკი სამივე შემთხვევაში
   იტყუებოდა — ზუსტად ის, რასაც ეს პროექტი „ღილაკი, რომელიც არაფერს
   აკეთებს"-ად უწოდებს.

   ⚠️ **მოვლენა ერთჯერადია** და მისი `preventDefault()` ბრაუზერის
   საკუთარ ზოლს აჩერებს — ე.ი. ობიექტი უნდა შევინახოთ, თორემ ღილაკს
   გამოსაძახებელი არაფერი დარჩება.

   ⚠️ **Safari-ზე ავტომატური დაყენება არ არსებობს** — iOS-ზე ეს
   „გაზიარება → მთავარ ეკრანზე დამატებაა", ე.ი. ღილაკი იქ ვერაფერს
   იზამს და სწორედ ამიტომ არ ჩანს.
   ============================================================ */

/** Chrome-ის `beforeinstallprompt` — TS-ის lib-ში ის არ არის */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallApp() {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPrompt)
    }

    // დაყენების შემდეგ ღილაკს აზრი აღარ აქვს
    const onInstalled = () => setPrompt(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!prompt) return null

  const install = async () => {
    await prompt.prompt()
    await prompt.userChoice
    /* ⚠️ შედეგს არ ვამოწმებთ: უარიც ლეგიტიმური პასუხია და მოვლენა
       ისედაც ერთჯერადია — ღილაკის შენარჩუნება მეორე დაჭერაზე
       უხმოდ ჩავარდებოდა. */
    setPrompt(null)
  }

  return (
    <section className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Smartphone className="size-4 text-muted-foreground" />
        {t('install.title')}
        <InfoHint info={t('install.hint')} />
      </span>

      <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={install}>
        <Download className="size-4" />
        {t('install.action')}
      </Button>
    </section>
  )
}
