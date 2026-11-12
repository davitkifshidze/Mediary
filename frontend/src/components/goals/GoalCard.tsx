import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, CheckCircle2, CircleSlash, TrendingDown, TrendingUp } from 'lucide-react'
import type { Goal } from '@/api/goals'
import { useDateFormat } from '@/lib/dates'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Badge } from '@/components/ui/badge'

/* ============================================================
   **ერთი მიზანი** — `/goals` გვერდის ბარათი და მთავარი გვერდის კომპაქტური ფილა.

   ერთი კომპონენტი ორივეზე: რიცხვები და წარწერები ერთი და იგივეა, მხოლოდ
   მოქმედებები (`actions`) და სიმჭიდროვე (`compact`) განსხვავდება.

   ⚠️ **ტემპი სერვერის ნათქვამია** (`pace` = გაკეთებული − დღეისთვის მოსალოდნელი):
   აქ ხელახლა არ ითვლება, თორემ ბრაუზერის საათი და ზონა სხვა რიცხვს აჩვენებდა.
   ⚠️ ფერი მოდულისაა (`--mod`); მდგომარეობის ფერი — სტატუსების ცვლადებიდან, ორივე
   თემაში.
   ============================================================ */

/** პერიოდის წარწერა: წელი — რიცხვით, დანარჩენი — ორი თარიღით */
export function goalPeriodLabel(goal: Pick<Goal, 'period' | 'starts_on' | 'ends_on'>, date: (value: string) => string): string {
  return goal.period === 'year' ? goal.starts_on.slice(0, 4) : `${date(goal.starts_on)} – ${date(goal.ends_on)}`
}

export function GoalCard({ goal, actions, compact }: { goal: Goal; actions?: ReactNode; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date } = useDateFormat()
  const { all } = useModules()
  const module = all.find((m) => m.key === goal.module)
  const name = module ? moduleName(module, i18n.language) : goal.module
  const classifier = goal.classifier ? (lang === 'ka' ? goal.classifier.name_ka : goal.classifier.name_en) || goal.classifier.name_en || goal.classifier.name_ka : null
  const percent = Math.min(100, Math.round((goal.done / Math.max(1, goal.target)) * 100))

  return (
    <article
      style={modAccent(module?.color) ?? MODULE_ACCENT_FALLBACK}
      className={cn('flex flex-col gap-3 rounded-md border border-border bg-card', compact ? 'p-3' : 'p-4')}
      data-testid="goal-card"
      data-state={goal.state}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
          <ModuleIcon name={module?.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" title={goal.name ?? undefined}>
            {goal.name || t('goals.defaultName', { module: name, count: goal.target })}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {[name, t(`goals.period.${goal.period}`), goalPeriodLabel(goal, date), classifier].filter(Boolean).join(' · ')}
          </p>
        </div>
        <StateBadge goal={goal} />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-semibold tabular-nums" data-testid="goal-progress">
            {goal.done} / {goal.target}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--mod)]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="goal-pace">
        <Pace goal={goal} />
        {goal.state === 'active' && <span>{t('goals.daysLeft', { count: goal.days_left })}</span>}
        {goal.state === 'upcoming' && <span>{t('goals.startsOn', { date: date(goal.starts_on) })}</span>}
      </p>

      {actions && <div className="mt-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </article>
  )
}

function StateBadge({ goal }: { goal: Goal }) {
  const { t } = useTranslation()

  if (goal.state === 'achieved') {
    return (
      <Badge className="shrink-0 bg-[color-mix(in_oklab,var(--status-watched)_15%,transparent)] text-[var(--status-watched)]">
        <CheckCircle2 className="size-3" />
        {t('goals.state.achieved')}
      </Badge>
    )
  }

  if (goal.state === 'failed') {
    return (
      <Badge className="shrink-0 bg-destructive/10 text-destructive">
        <CircleSlash className="size-3" />
        {t('goals.state.failed')}
      </Badge>
    )
  }

  if (goal.state === 'upcoming') {
    return (
      <Badge className="shrink-0 bg-secondary text-muted-foreground">
        <CalendarClock className="size-3" />
        {t('goals.state.upcoming')}
      </Badge>
    )
  }

  return null
}

/** „გრაფიკს უსწრებ / ჩამორჩები N-ით" — მხოლოდ აქტიურ მიზანზე */
function Pace({ goal }: { goal: Goal }) {
  const { t } = useTranslation()

  if (goal.state !== 'active' || goal.pace == null) return null

  if (goal.pace > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-[var(--status-watched)]">
        <TrendingUp className="size-3.5" />
        {t('goals.ahead', { count: goal.pace })}
      </span>
    )
  }

  if (goal.pace < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-destructive">
        <TrendingDown className="size-3.5" />
        {t('goals.behind', { count: -goal.pace })}
      </span>
    )
  }

  return <span className="font-medium text-foreground">{t('goals.onTrack')}</span>
}
