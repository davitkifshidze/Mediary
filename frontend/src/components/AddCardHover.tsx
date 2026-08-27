import { useTranslation } from 'react-i18next'
import { TooltipContent } from '@/components/ui/tooltip'
import { genreName } from '@/lib/display'
import type { GenreName } from '@/api/movies'

/** დასამატებელი ფილმის hover-ინფო: სახელი + ჟანრები + აღწერა */
export function AddCardHover({
  title,
  genres,
  overview,
  lang,
}: {
  title: string
  genres?: GenreName[]
  overview?: string | null
  lang: string
}) {
  const { t } = useTranslation()
  return (
    <TooltipContent side="bottom" align="start" className="max-w-sm rounded-xl p-4 shadow-lg">
      <p className="font-display text-sm font-semibold leading-snug">{title}</p>
      {genres && genres.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {genres.map((g, i) => (
            <span key={i} className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
              {genreName(g, lang)}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 line-clamp-6 text-xs leading-relaxed text-muted-foreground">
        {overview || t('detail.noDescription')}
      </p>
    </TooltipContent>
  )
}
