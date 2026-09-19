import { useTranslation } from 'react-i18next'
import { CopyCheck, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * **„ეს ბმული უკვე გაქვს" (FEAT-17).**
 *
 * ⚠️ **გაფრთხილებაა და არა აკრძალვა.** ერთი ბმულის ორჯერ შენახვა
 * ლეგიტიმურია — სხვა ტიპით, სხვა ტეგებით — ამიტომ არც `unique` ინდექსი
 * დაემატა და არც 422; ფორმა მხოლოდ ამბობს და შენახვის ღილაკს ხელს არ ახლებს.
 *
 * ⚠️ **ტონი `warning`-ია და არა `destructive`**: არაფერი ფუჭდება და
 * არაფერი იშლება — წითელი ჩარჩო აქ ცრუ განგაშია და ის ნამდვილ
 * გაფრთხილებებს გაუფასურებდა.
 *
 * ⚠️ **ერთი კომპონენტი ორივე მოდულზე** — ვიდეოსა და სიმღერის ფორმა
 * ერთსა და იმავეს ამბობს, და მეორე ასლი პირველივე ცვლილებაზე დაშორდებოდა.
 * „გახსნა" გამომძახებლისაა: ჩანაწერი მოდალში იხსნება და რომელ მოდალში —
 * ამას გვერდმა იცის, კომპონენტმა არა.
 */
export function DuplicateLinkNotice({
  title,
  onOpen,
}: {
  /** არსებული ჩანაწერის სათაური — `null`, თუ უსათაუროდაა შენახული */
  title: string | null
  onOpen: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <p className="flex min-w-0 items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <CopyCheck className="size-4 shrink-0" />
        <span className="min-w-0">
          {t('duplicate.notice')}
          {title && <span className="ml-1 font-medium">„{title}“</span>}
        </span>
      </p>

      <Button type="button" variant="outline" size="sm" onClick={onOpen}>
        <ExternalLink className="size-4" />
        {t('duplicate.open')}
      </Button>
    </div>
  )
}
