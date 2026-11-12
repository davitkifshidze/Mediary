import { Suspense, lazy, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  History,
  PlayCircle,
  Puzzle,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react'
import { fetchDashboard, type DashboardCard } from '@/api/dashboard'
import { useAuth } from '@/lib/auth'
import {
  WIDTH_CLASS,
  DASHBOARD_WIDTHS,
  defaultLayout,
  itemModule,
  normalizeLayout,
  sameLayout,
  type DashboardBlock,
  type DashboardItem,
  type DashboardWidth,
} from '@/lib/dashboardLayout'
import { useModules } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { CountUp } from '@/components/CountUp'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sortable, SortableHandle, SortableItem } from '@/components/ui/sortable'
import { Switch } from '@/components/ui/switch'

/* ⚠️ ბლოკები ზარმაცად იტვირთება და **მხოლოდ ჩართული მონტირდება** — გამორთული ბლოკი
   არც კოდს ჩამოტვირთავს, არც მოთხოვნას გააგზავნის. */
const GoalsBlock = lazy(() => import('@/components/goals/GoalsBlock').then((m) => ({ default: m.GoalsBlock })))
const ContinueBlock = lazy(() => import('@/components/dashboard/DashboardBlocks').then((m) => ({ default: m.ContinueBlock })))
const RecentBlock = lazy(() => import('@/components/dashboard/DashboardBlocks').then((m) => ({ default: m.RecentBlock })))
const SoonBlock = lazy(() => import('@/components/dashboard/DashboardBlocks').then((m) => ({ default: m.SoonBlock })))
const RemindersBlock = lazy(() => import('@/components/dashboard/DashboardBlocks').then((m) => ({ default: m.RemindersBlock })))
const DutyWeekBlock = lazy(() => import('@/components/dashboard/DashboardBlocks').then((m) => ({ default: m.DutyWeekBlock })))

/* ============================================================
   დეშბორდი — მთავარი გვერდი: მისალმება და **მორგებადი** ერთეულები.

   ერთეული ან ბლოკია (მიზნები, „ვაგრძელებ", „ბოლოს დამატებული", „მალე", „შეხსენებები",
   „მორიგეობა ამ კვირაში"), ან ერთი მოდულის ბარათი. „მორგება" რედაქტირების რეჟიმს ხსნის:
   ჩართვა / გამორთვა, რიგი გადათრევით და სიგანე (მთელი · ნახევარი · მესამედი). ეს
   თავისუფალი ბადე არ არის — ბადე ყოველთვის მოწესრიგებულია.

   ⚠️ **მთავარი მოთხოვნა (`/dashboard`) მხოლოდ მოდულების რიცხვებია** და ოთხ query-ზეა
   დაჭერილი; ყოველი ბლოკი თავის მონაცემს თვითონ კითხულობს და მხოლოდ მაშინ, როცა ჩართულია.
   ⚠️ **განლაგება `users.settings.dashboard`-შია** და ცხადად ინახება: რედაქტირება საერთო
   სამუშაო ასლში იწერება, „გაუქმება" მხოლოდ ამ პარამეტრს აბრუნებს (მთლიანი `revert()`
   სხვა შეუნახავ პარამეტრსაც წაშლიდა).
   ⚠️ ტელეფონზე ერთი სვეტია იმავე რიგით; ცარიელი ბლოკი იმალება (`empty:hidden`).
   ============================================================ */

const BLOCK_ICON: Record<DashboardBlock, LucideIcon> = {
  goals: Target,
  continue: PlayCircle,
  recent: History,
  soon: CalendarClock,
  reminders: BellRing,
  duty: CalendarDays,
}

/**
 * ერთი მოდულის ბარათი.
 *
 * ⚠️ **ფერი `modules.color`-იდან მოდის და არა ბარათიდან**: იგივე წყარო, რასაც `PageHeader`
 * კითხულობს, ე.ი. მოდული მთავარ გვერდზეც და თავის გვერდზეც ერთ ფერშია.
 * ⚠️ **ფერი inline `style`-ითაა** — მნიშვნელობა ბაზიდან მოდის, ე.ი. `bg-[#6366f1]`-ს
 * Tailwind ვერ დააგენერირებდა.
 */
function Card({ card, lang, color }: { card: DashboardCard; lang: string; color: string | null }) {
  const name = (lang === 'ka' ? card.name_ka : card.name_en) || card.name_en

  return (
    <Link
      to={card.route_base}
      className="group relative block h-full overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={
        color
          ? {
              backgroundColor: `color-mix(in oklab, ${color} 8%, var(--card))`,
              borderColor: `color-mix(in oklab, ${color} 28%, var(--border))`,
            }
          : undefined
      }
      data-testid="module-card"
    >
      {/* ფერადი ზოლი მარცხნივ — მოდული ერთი შეხედვით იცნობა */}
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color ?? 'var(--border)' }} aria-hidden />

      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"
          style={color ? { backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` } : undefined}
        >
          <ModuleIcon name={card.icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-4 font-display text-4xl font-semibold leading-none tracking-tight tabular-nums">
        {card.count === null ? '—' : <CountUp value={card.count} />}
      </div>
    </Link>
  )
}

function BlockView({ block }: { block: DashboardBlock }) {
  switch (block) {
    case 'goals':
      return <GoalsBlock />
    case 'continue':
      return <ContinueBlock />
    case 'recent':
      return <RecentBlock />
    case 'soon':
      return <SoonBlock />
    case 'reminders':
      return <RemindersBlock />
    case 'duty':
      return <DutyWeekBlock />
  }
}

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { all, has } = useModules()
  const { settings, set, save, saving } = useSettings()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  /** რედაქტირების დაწყებისას შენახული მნიშვნელობა — „გაუქმება" მას აბრუნებს */
  const snapshot = useRef<DashboardItem[] | null>(null)

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  })

  /* ბლოკი მხოლოდ მაშინ არსებობს, როცა მისი მოდული ჩართულია: „მალე" — მედიაზე,
     „შეხსენებები" — ჩანაწერებზე, „მორიგეობა" — მორიგეობაზე. */
  const blocks: DashboardBlock[] = [
    'goals',
    'continue',
    'recent',
    ...(['movie', 'series', 'anime'].some((key) => has(key)) ? (['soon'] as const) : []),
    ...(has('note') ? (['reminders'] as const) : []),
    ...(has('duty') ? (['duty'] as const) : []),
  ]
  const moduleKeys = cards.map((card) => card.key)
  const layout = normalizeLayout(settings.dashboard, moduleKeys, blocks)
  const pristine = sameLayout(layout, defaultLayout(moduleKeys, blocks))

  const change = (next: DashboardItem[]) => set('dashboard', next)
  const patch = (id: string, value: Partial<DashboardItem>) => change(layout.map((item) => (item.id === id ? { ...item, ...value } : item)))

  const open = () => {
    snapshot.current = settings.dashboard
    setEditing(true)
  }
  const cancel = () => {
    set('dashboard', snapshot.current)
    setEditing(false)
  }
  const commit = async () => {
    // ჩავარდნის ტოსტს პროვაიდერი აჩვენებს — რეჟიმი ღია რჩება
    if (!(await save())) return
    setEditing(false)
    toast({ title: t('dashboard.saved'), variant: 'success' })
  }

  const label = (item: DashboardItem): string => {
    const key = itemModule(item.id)
    if (!key) return t(`dashboard.blocks.${item.id}`)
    const card = cards.find((c) => c.key === key)

    return (card && ((i18n.language === 'ka' ? card.name_ka : card.name_en) || card.name_en)) || key
  }

  const icon = (item: DashboardItem): ReactNode => {
    const key = itemModule(item.id)
    if (key) return <ModuleIcon name={cards.find((c) => c.key === key)?.icon} className="size-4" />
    const Icon = BLOCK_ICON[item.id as DashboardBlock]

    return <Icon className="size-4" />
  }

  const ready = !isLoading && cards.length > 0

  return (
    <PageContainer>
      {/* ⚠️ ქვესათაური („რა გაქვს და სად გაჩერდი.") **მოხსნილია** */}
      <PageHeader
        title={t('dashboard.title', { name: user?.first_name || user?.display_name })}
        hint={editing ? t('dashboard.editHint') : undefined}
        actions={
          ready &&
          (editing ? (
            <>
              <Button variant="outline" onClick={() => set('dashboard', null)} disabled={pristine} data-testid="dashboard-reset">
                <RotateCcw className="size-4" />
                {t('dashboard.reset')}
              </Button>
              <Button variant="outline" onClick={cancel} data-testid="dashboard-cancel">
                <X className="size-4" />
                {t('actions.cancel')}
              </Button>
              <Button onClick={() => void commit()} disabled={saving} data-testid="dashboard-save">
                <Save className="size-4" />
                {saving ? t('actions.saving') : t('actions.save')}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={open} data-testid="dashboard-customize">
              <SlidersHorizontal className="size-4" />
              {t('dashboard.customize')}
            </Button>
          ))
        }
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && !cards.length && (
        <EmptyState
          icon={<Puzzle className="size-6" />}
          title={t('modules.emptyTitle')}
          hint={t('modules.emptyHint')}
          actions={
            <Link to="/modules" className={buttonVariants()}>
              {t('modules.title')}
            </Link>
          }
        />
      )}

      {/* ===== რედაქტირების რეჟიმი: რიგი, ჩართვა და სიგანე ===== */}
      {ready && editing && (
        <ul className="space-y-2" data-testid="dashboard-editor">
          <Sortable ids={layout.map((item) => item.id)} onReorder={(ids) => change(ids.map((id) => layout.find((item) => item.id === id)!))}>
            {layout.map((item) => (
              <SortableItem
                key={item.id}
                id={item.id}
                handle
                className={cn('flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2', !item.on && 'opacity-60')}
                data-testid="dashboard-item"
                data-item={item.id}
              >
                <SortableHandle />
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">{icon(item)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(item)}</span>
                <Select value={item.width} onValueChange={(width) => patch(item.id, { width: width as DashboardWidth })}>
                  <SelectTrigger className="w-36 shrink-0" aria-label={t('dashboard.width.label')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DASHBOARD_WIDTHS.map((width) => (
                      <SelectItem key={width} value={width}>
                        {t(`dashboard.width.${width}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch checked={item.on} onCheckedChange={(on) => patch(item.id, { on })} aria-label={t('dashboard.show', { name: label(item) })} />
              </SortableItem>
            ))}
          </Sortable>
        </ul>
      )}

      {/* ===== ჩვეულებრივი ხედი: ჩართული ერთეულები შენახული რიგითა და სიგანით ===== */}
      {ready && !editing && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6" data-testid="dashboard-grid">
          {layout
            .filter((item) => item.on)
            .map((item) => {
              const key = itemModule(item.id)
              const card = key ? cards.find((c) => c.key === key) : null

              return (
                <div key={item.id} className={cn('min-w-0 empty:hidden', WIDTH_CLASS[item.width])} data-item={item.id} data-width={item.width}>
                  {key ? (
                    card && <Card card={card} lang={i18n.language} color={all.find((m) => m.key === key)?.color ?? null} />
                  ) : (
                    <Suspense fallback={null}>
                      <BlockView block={item.id as DashboardBlock} />
                    </Suspense>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </PageContainer>
  )
}
