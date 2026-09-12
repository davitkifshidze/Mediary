import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Save, Undo2 } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   პარამეტრების შენახვის ზოლი (Tasks 3).

   ადრე ცვლილება 400ms-ში თვითონ ინახებოდა და user-ს არ ჰქონდა
   გარანტია, შენახულია თუ არა. ახლა შენახვა ცხადია: ზოლი გვერდის ბოლოში
   sticky-ია, ღილაკები მხოლოდ ცვლილებისას აქტიურდება და შენახვის შემდეგ
   „შენახულია ✓" ჩანს. იგივე ზოლი `/sync`-ის პარამეტრებზეც (3-ის ბოლო პუნქტი).
   ============================================================ */

/** რამდენ ხანს ჩანს „შენახულია ✓" */
const CONFIRM_MS = 3000

export function SettingsSaveBar() {
  const { t } = useTranslation()
  const { dirty, saving, savedAt, save, revert } = useSettings()
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!savedAt) return
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [savedAt])

  return (
    <div className="sticky bottom-4 z-30 mt-6">
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur transition-colors',
          dirty ? 'border-primary' : 'border-border',
        )}
      >
        <span className="min-w-0 flex-1 text-sm">
          {saving ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('actions.saving')}
            </span>
          ) : dirty ? (
            <span className="inline-flex items-center gap-2 font-medium text-primary">
              <span className="size-2 rounded-full bg-primary" />
              {t('settings.unsaved')}
            </span>
          ) : justSaved ? (
            <span className="inline-flex items-center gap-2 text-gold">
              <Check className="size-4" />
              {t('settings.savedOk')}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('settings.noChanges')}</span>
          )}
        </span>

        <Button variant="outline" size="sm" onClick={revert} disabled={!dirty || saving}>
          <Undo2 className="size-4" />
          {t('settings.revert')}
        </Button>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          <Save className="size-4" />
          {t('actions.save')}
        </Button>
      </div>
    </div>
  )
}
