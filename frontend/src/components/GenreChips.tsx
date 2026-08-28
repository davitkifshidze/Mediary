import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { genreName } from '@/lib/display'
import type { MediaType } from '@/lib/media'
import type { Genre } from '@/api/types'

const TINTS = [
  'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100',
  'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100',
  'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100',
  'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100',
  'bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100',
  'bg-teal-50 text-teal-700 border-teal-300 hover:bg-teal-100',
  'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100',
  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300 hover:bg-fuchsia-100',
]

// ინდექსზე დაფუძნებული — მიმდებარე ჩიპებს ყოველთვის განსხვავებული ფერი აქვთ
function tint(index: number) {
  return TINTS[index % TINTS.length]
}

export function GenreChips({
  genres,
  active,
  onChange,
  type = 'movie',
}: {
  genres: Genre[]
  active: string | null
  onChange: (slug: string | null) => void
  /** რომელი დომენის რაოდენობა ჩანდეს ჩიპზე */
  type?: MediaType
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const base =
    'inline-flex cursor-pointer items-center gap-1.5 rounded-[5px] border px-5 py-2.5 text-sm font-medium transition-colors'

  const chip = (label: string, value: string | null, colorIndex: number, count?: number) => {
    const isActive = active === value
    return (
      <button
        key={value ?? 'all'}
        onClick={() => onChange(value)}
        className={cn(
          base,
          isActive
            ? 'border-primary bg-primary text-primary-foreground'
            : cn('border-dashed', value ? tint(colorIndex) : 'border-border bg-secondary/50 hover:bg-secondary'),
        )}
      >
        {label}
        {count != null && count > 0 && <span className="text-xs opacity-70">{count}</span>}
      </button>
    )
  }

  if (!genres.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {chip(t('filter.allGenres'), null, 0)}
      {genres.map((g, i) =>
        chip(genreName(g, lang), g.slug, i, type === 'series' ? g.series_count : g.movies_count),
      )}
    </div>
  )
}
