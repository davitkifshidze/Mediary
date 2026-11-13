import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SYNC_RUN_RESULTS, type SyncRun, type SyncRunResult } from '@/api/syncRuns'
import { useDateFormat } from '@/lib/dates'
import { SYNC_RESULT_LOOK } from '@/lib/syncLook'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/* ============================================================
   **გაშვების წვრილი ნაწილები** — შედეგების გვერდიც და სინქრონიზაციის ბარათებიც
   ერთსა და იმავეს ხატავენ: შედეგის ჯამებს, დაუსრულებელი გაშვების ზოლს და „ბოლო
   გაშვების" ხაზს.
   ============================================================ */

/**
 * შედეგის ჯამები ფერადი ნიშნებით — განახლდა · უცვლელი · გამოტოვდა · ჩავარდა.
 * ⚠️ ოთხივე ყოველთვის იხატება (ნული გაუფერულებული), რომ ნიშნები რიგიდან რიგში არ
 * ინაცვლებდეს; სახელი `title`-შია — ნიშანში მხოლოდ აიქონი და რიცხვია.
 */
export function RunCounts({ counts, className }: { counts: Record<SyncRunResult, number>; className?: string }) {
  const { t } = useTranslation()

  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)} data-testid="run-counts">
      {SYNC_RUN_RESULTS.map((result) => {
        const { icon: Icon, tone, soft } = SYNC_RESULT_LOOK[result]
        const count = counts[result] ?? 0

        return (
          <Badge
            key={result}
            title={t(`syncResults.result.${result}`)}
            data-result={result}
            className={cn('tabular-nums', soft, count === 0 && 'opacity-40')}
          >
            <Icon className={cn('size-3.5', tone)} aria-label={t(`syncResults.result.${result}`)} />
            {count}
          </Badge>
        )
      })}
    </span>
  )
}

/** დაუსრულებელი გაშვების ზოლი — რამდენს აქვს შედეგი დაგეგმილიდან; სრულზე არ იხატება */
export function RunProgress({ run, className }: { run: Pick<SyncRun, 'done' | 'total'>; className?: string }) {
  if (run.total <= 0 || run.done >= run.total) return null

  const percent = Math.round((run.done / run.total) * 100)

  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('block h-1.5 overflow-hidden rounded-md bg-muted', className)}
      data-testid="run-progress"
    >
      <span className="block h-full rounded-md bg-[var(--mod)]" style={{ width: `${percent}%` }} />
    </span>
  )
}

/**
 * ბარათის ქვედა ხაზი: ბოლო გაშვება — როდის და რა შედეგით; მთლიანად ბმულია ამ გაშვების
 * გვერდზე. `kind` — სახეობაც ეწერება (ბარათი, რომელიც ყველა სახეობის ისტორიას ხსნის).
 */
export function LastRun({ run, kind = false }: { run: SyncRun | null | undefined; kind?: boolean }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()

  if (!run) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="last-run-none">
        {t('syncCards.neverRan')}
      </span>
    )
  }

  return (
    <Link
      to={`/sync/results/${run.key}`}
      className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      data-testid="last-run"
    >
      <span>
        {kind && `${t(`syncResults.kind.${run.kind}`)} · `}
        {t('syncCards.lastRun', { date: dateTime(run.last_at ?? run.started_at) })}
      </span>
      <RunCounts counts={run.counts} />
    </Link>
  )
}
