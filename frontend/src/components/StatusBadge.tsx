import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Status } from '@/api/types'

const styles: Record<Status, string> = {
  undecided: 'bg-status-undecided/15 text-status-undecided',
  to_watch: 'bg-status-towatch/15 text-status-towatch',
  watching: 'bg-status-watching/15 text-status-watching',
  watched: 'bg-status-watched/15 text-status-watched',
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  )
}
