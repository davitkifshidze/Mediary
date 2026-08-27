import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { STATUS_ACTIVE, STATUS_INACTIVE } from '@/lib/statusStyles'

export type StatusFilterValue = 'all' | 'undecided' | 'to_watch' | 'watching' | 'watched' | 'favorite'

const items: StatusFilterValue[] = ['all', 'undecided', 'to_watch', 'watching', 'watched', 'favorite']

export function StatusFilter({
  value,
  onChange,
}: {
  value: StatusFilterValue
  onChange: (v: StatusFilterValue) => void
}) {
  const { t } = useTranslation()

  const label = (v: StatusFilterValue) =>
    v === 'all' ? t('filter.all') : v === 'favorite' ? t('filter.favorite') : t(`status.${v}`)

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'cursor-pointer rounded-md border px-3.5 py-1.5 text-sm font-medium transition-colors',
            value === v ? STATUS_ACTIVE[v] : STATUS_INACTIVE[v],
          )}
        >
          {label(v)}
        </button>
      ))}
    </div>
  )
}
