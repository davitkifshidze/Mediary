import { useTranslation } from 'react-i18next'
import { Check, Trash2 } from 'lucide-react'
import type { PublicCard } from '@/api/publicProfile'
import { cn } from '@/lib/utils'

/* ============================================================
   **„ჩემს ბიბლიოთეკაში დამატების" ნიშნები ბარათის კუთხეში** — გაზიარების
   ბმულისა და საჯარო პროფილის გვერდს ერთი და იგივე აქვს: „უკვე გაქვს" /
   „შენს ურნაშია" მარცხნივ და მონიშვნის ჩამრთველი მარჯვნივ.

   ⚠️ ორივე `absolute`-ია და ბარათის **ბმულის გარეთ** დგას (მის `relative`
   მშობელში): ღილაკი ბმულში არასწორი HTML-ია და ერთი დაჭერა ორივეს გაუშვებდა.
   ============================================================ */

/** „უკვე გაქვს" / „შენს ურნაშია" — ბარათის კუთხეში */
export function InLibraryMark({ mine }: { mine: PublicCard['in_library'] }) {
  const { t } = useTranslation()

  if (!mine) return null

  return (
    <span
      className={cn(
        'absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium shadow',
        mine.trashed ? 'bg-background/90 text-muted-foreground' : 'bg-status-watched text-white',
      )}
    >
      {mine.trashed ? <Trash2 className="size-3" /> : <Check className="size-3" />}
      {t(mine.trashed ? 'share.page.inTrash' : 'share.page.inLibrary')}
    </span>
  )
}

/** მონიშვნის ჩამრთველი ბარათის კუთხეში */
export function SelectBox({ title, selected, onToggle }: { title: string; selected: boolean; onToggle: () => void }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={t('share.page.select', { title })}
      onClick={onToggle}
      className={cn(
        'absolute right-1.5 top-1.5 grid size-6 cursor-pointer place-items-center rounded-md border shadow',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90',
      )}
    >
      {selected && <Check className="size-4" />}
    </button>
  )
}
