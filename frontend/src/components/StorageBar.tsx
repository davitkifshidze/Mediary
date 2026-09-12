import { useTranslation } from 'react-i18next'
import type { StorageUsage } from '@/api/account'
import { cn, formatBytes } from '@/lib/utils'

/* ============================================================
   საცავის ინდიკატორი (Tasks 17.3).
   ზღვრები **backend-იდან** მოდის (`warn_at`/`critical_at`), ე.ი. ერთ
   ადგილას იცვლება — ფრონტზე კონსტანტა არ დევს.
   ============================================================ */

type Level = 'ok' | 'warn' | 'critical' | 'full'

export function storageLevel(usage: Pick<StorageUsage, 'percent' | 'warn_at' | 'critical_at'>): Level {
  if (usage.percent >= 100) return 'full'
  if (usage.percent >= usage.critical_at) return 'critical'
  if (usage.percent >= usage.warn_at) return 'warn'
  return 'ok'
}

const BAR: Record<Level, string> = {
  ok: 'bg-primary',
  warn: 'bg-amber-500',
  critical: 'bg-destructive',
  full: 'bg-destructive',
}

const TEXT: Record<Level, string> = {
  ok: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-500',
  critical: 'text-destructive',
  full: 'text-destructive',
}

export function StorageBar({
  usage,
  className,
  showLabel = true,
}: {
  usage: StorageUsage
  className?: string
  showLabel?: boolean
}) {
  const { t } = useTranslation()
  const level = storageLevel(usage)

  return (
    <div className={className}>
      {showLabel && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className={TEXT[level]}>
            {t('storage.used', { used: formatBytes(usage.used), quota: formatBytes(usage.quota) })}
          </span>
          <span className={cn('shrink-0 tabular-nums', TEXT[level])}>{usage.percent}%</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={usage.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width]', BAR[level])}
          style={{ width: `${Math.max(usage.percent, usage.used > 0 ? 2 : 0)}%` }}
        />
      </div>
      {/* გაფრთხილება ცხადია და არა ჩუმი (17.3) */}
      {level !== 'ok' && (
        <p className={cn('mt-1.5 text-xs', TEXT[level])}>
          {t(level === 'full' ? 'storage.warnFull' : 'storage.warnNear', {
            remaining: formatBytes(usage.remaining),
          })}
        </p>
      )}
    </div>
  )
}
