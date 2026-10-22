import { useTranslation } from 'react-i18next'
import type { DutyWorkplace } from '@/api/duty'
import { workplaceColor } from '@/lib/duty'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'

/**
 * **მუქი / ღია** — თითო სამსახურზე ჩიპი: მონიშნული = მუქი (გამოკვეთილი),
 * მოუნიშნავი = ღია (ბაცი). ერთი სამსახურის დროს არაფერს ხატავს.
 */
export function DutyDimToggles({
  workplaces,
  dimmed,
  onToggle,
}: {
  workplaces: DutyWorkplace[]
  dimmed: ReadonlySet<number>
  onToggle: (workplaceId: number) => void
}) {
  const { t } = useTranslation()

  if (workplaces.length < 2) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" data-testid="duty-dim">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {t('duty.dim.label')}
        <InfoHint info={t('duty.dim.hint')} />
      </span>
      {workplaces.map((w) => (
        <Chip
          key={w.id}
          active={!dimmed.has(w.id)}
          onClick={() => onToggle(w.id)}
          icon={<span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />}
        >
          {w.name} · {t(dimmed.has(w.id) ? 'duty.dim.light' : 'duty.dim.dark')}
        </Chip>
      ))}
    </div>
  )
}
