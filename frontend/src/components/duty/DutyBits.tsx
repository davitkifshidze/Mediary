import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Ban, Repeat, SquarePen } from 'lucide-react'
import type { DutyShift, DutyShiftStatus } from '@/api/duty'
import { formatMoney, hoursLabel, SHIFT_BLOCK, shiftRange, shiftTint, typeName, workplaceColor } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **მორიგეობის მოდულის საერთო ნაწილები** — ერთი ვიზუალური ენა კალენდარში,
   გვერდით პანელში, სიასა და ფანჯრებში.

   ⚠️ **მორიგეობა ყველგან ერთნაირი ბლოკია**: მარცხნივ სამსახურის ფერადი ზოლი,
   ფონი — იმავე ფერის ღია ელფერი, **ტექსტი კი ტექსტის ფერია** (ყვითელ ან
   ვარდისფერ ფონზე ფერადი ასო არ იკითხება). გაუქმებული იმავე ბლოკს წითლად და
   გადახაზულად იმეორებს — დღე რჩება, უბრალოდ არ ითვლება.

   ⚠️ ფერი inline `style`-ით ჩამოდის (`shiftTint()` → `--wp`): მნიშვნელობა
   მომხმარებლის არჩეული hex-ია და Tailwind მისგან კლასს ვერ დაბადებს.
   ============================================================ */

/** სამსახურის ფერი წერტილად — ლეგენდასა და ჩამონათვალში */
export function WorkplaceDot({ workplace, className }: { workplace: { color: string | null } | null | undefined; className?: string }) {
  return <span className={cn('inline-block size-3 shrink-0 rounded-sm', className)} style={{ background: workplaceColor(workplace) }} />
}

/**
 * **შემაჯამებელი ბარათი** — აიქონი მოდულის ფერით, წარწერა, დიდი რიცხვი და
 * (სურვილით) ერთი წვრილი ხაზი. `onClick`-ით მთელი ბარათი ღილაკია.
 * ⚠️ ტელეფონზე ბარათები ორ სვეტად დგას — აიქონის ფილა იქ არ იხატება, თორემ
 * რიცხვს ადგილი აღარ რჩება.
 */
export function DutyStatCard({
  icon: Icon,
  label,
  value,
  note,
  onClick,
  'data-testid': testId,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  note?: ReactNode
  onClick?: () => void
  'data-testid'?: string
}) {
  const body = (
    <>
      <span className="hidden size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)] sm:grid">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-xl font-semibold leading-tight tabular-nums first-letter:uppercase">{value}</span>
        {note && <span className="block truncate text-xs text-muted-foreground">{note}</span>}
      </span>
    </>
  )
  const box = 'flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left sm:p-4'

  return onClick ? (
    <button data-kind="card" type="button" onClick={onClick} className={cn(box, 'cursor-pointer transition-colors hover:border-[var(--mod)]')} data-testid={testId}>
      {body}
    </button>
  ) : (
    <div className={box} data-testid={testId}>
      {body}
    </div>
  )
}

/** გაუქმებული / ნაწილობრივი — ნიშანი; დაგეგმილს ნიშანი არ სჭირდება */
export function DutyStatusBadge({ status }: { status: DutyShiftStatus }) {
  const { t } = useTranslation()

  if (status === 'scheduled') return null

  return (
    <Badge
      className={
        status === 'cancelled'
          ? 'bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-destructive'
          : 'bg-[color-mix(in_oklab,var(--icon-warn)_20%,transparent)]'
      }
    >
      {status === 'cancelled' && <Ban className="size-3" />}
      {t(`duty.status.${status}`)}
    </Badge>
  )
}

/**
 * **მორიგეობა სრულად** — სამსახური · ტიპი, დრო · საათები · თანხა · სტატუსი და
 * შენიშვნა; `children` მისი ღილაკებია (მარჯვნივ, ვიწრო ადგილას ქვემოთ ჩადის).
 * ⚠️ მარჯვენა ღილაკი იგივე მენიუა ყველგან (`useDutyShiftActions`).
 */
export function DutyShiftCard({
  shift,
  currency,
  menu,
  dimmed,
  lead,
  children,
  'data-testid': testId = 'duty-shift',
}: {
  shift: DutyShift
  currency: string
  menu?: MenuAction[]
  /** „ღია" სამსახური — ბაცად, ფერი და მონაცემი უცვლელი */
  dimmed?: boolean
  /** ბლოკის თავში — მაგ. თარიღი სიაში */
  lead?: ReactNode
  children?: ReactNode
  'data-testid'?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const range = shiftRange(shift)

  return (
    <RecordContextMenu actions={menu ?? []}>
      <li
        style={shiftTint(shift)}
        className={cn(SHIFT_BLOCK, 'flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5', dimmed && 'opacity-45')}
        data-testid={testId}
      >
        {lead}
        <div className="min-w-[9rem] flex-1">
          <p
            className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold', shift.status === 'cancelled' && 'text-destructive line-through')}
            data-status={shift.status}
          >
            <span className="min-w-0 truncate">{shift.workplace?.name ?? t('duty.noWorkplace')}</span>
            <span className="font-normal text-muted-foreground">· {shift.type ? typeName(shift.type, lang) : t('duty.shift.custom')}</span>
            {shift.pattern_id != null && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('duty.pattern.fromPattern')} />}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-muted-foreground">
            {range && <span>{range}</span>}
            <span>{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
            {shift.pay != null && <span className="font-medium text-foreground">{formatMoney(shift.pay, currency, lang)}</span>}
            <DutyStatusBadge status={shift.status} />
          </p>
          {shift.note && <p className="mt-1 text-sm text-muted-foreground">{shift.note}</p>}
        </div>
        {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </li>
    </RecordContextMenu>
  )
}

/** **ერთი დღის მორიგეობები** — გვერდით პანელსა და დღის ფანჯარაში ერთი და იგივე სია */
export function DutyDayShifts({
  shifts,
  currency,
  onEdit,
  shiftActions,
  dimmed,
}: {
  shifts: DutyShift[]
  currency: string
  onEdit: (shift: DutyShift) => void
  shiftActions?: (shift: DutyShift) => MenuAction[]
  dimmed?: ReadonlySet<number>
}) {
  const { t } = useTranslation()

  return (
    <ul className="space-y-2" data-testid="duty-day-shifts">
      {shifts.map((shift) => (
        <DutyShiftCard
          key={shift.id}
          shift={shift}
          currency={currency}
          menu={shiftActions?.(shift)}
          dimmed={shift.workplace_id != null && dimmed?.has(shift.workplace_id)}
        >
          <Button variant="edit" size="sm" onClick={() => onEdit(shift)}>
            <SquarePen className="size-3.5" />
            {t('actions.edit')}
          </Button>
        </DutyShiftCard>
      ))}
    </ul>
  )
}
