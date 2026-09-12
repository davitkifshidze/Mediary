import { useTranslation } from 'react-i18next'
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Shuffle } from 'lucide-react'
import { GALLERY_SORTS, type GallerySort } from '@/api/gallery'
import { cn } from '@/lib/utils'

/* ============================================================
   რიგის გადამრთველი — **„არეულად თუ დალაგებულად"** (§8.3/§8.5).

   ⚠️ „არეული" სერვერზე **სიდით** კეთდება: გვერდებს შორის რიგი მდგრადი
   უნდა იყოს, თორემ მე-2 გვერდი პირველზე უკვე ნანახ ფოტოებს გამოიტანდა.

   ⚠️ **ცალკე კომპონენტია და არა ბადის ნაწილი** — ის ოთხ ჭრილში ჩნდება,
   ხოლო `PhotoGrid` საერთო ბიბლიოთეკური კომპონენტია და გალერეის ცოდნა
   არ უნდა ჰქონდეს.
   ============================================================ */

const ICONS: Record<GallerySort, typeof Shuffle> = {
  new: ArrowDownWideNarrow,
  old: ArrowUpWideNarrow,
  random: Shuffle,
}

export function SortPick({
  value,
  onChange,
  className,
}: {
  value: GallerySort
  onChange: (next: GallerySort) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      role="radiogroup"
      aria-label={t('gallery.sort.label')}
      className={cn('flex items-center gap-0.5 rounded-lg border border-border p-0.5', className)}
    >
      {GALLERY_SORTS.map((key) => {
        const Icon = ICONS[key]
        const active = value === key

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(`gallery.sort.${key}`)}
            onClick={() => onChange(key)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{t(`gallery.sort.${key}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
