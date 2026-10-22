import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Calculator, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, List, Loader2, Pencil, Plus, Repeat, Settings, TriangleAlert, Wallet, X } from 'lucide-react'
import {
  continueDutyPattern,
  DUTY_KEY,
  fetchDutyPatterns,
  fetchDutyPeriod,
  fetchDutySettings,
  fetchDutyShift,
  fetchDutyShifts,
  fetchDutyTypes,
  fetchDutyWorkplaces,
  type DutyShift,
  type DutyWorkplace,
} from '@/api/duty'
import { errorMessage } from '@/lib/errors'
import { formatHours, formatMoney, invalidateDuty, patternFromShifts, payMode, periodLabel, todayIso } from '@/lib/duty'
import { useToast } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { DutyBatchDialog } from '@/components/duty/DutyBatchDialog'
import { DutyBulkDialog } from '@/components/duty/DutyBulkDialog'
import { DutyCalculator } from '@/components/duty/DutyCalculator'
import { DutyCalendar } from '@/components/duty/DutyCalendar'
import { DutyDayDialog } from '@/components/duty/DutyDayDialog'
import { DutyDimToggles } from '@/components/duty/DutyDimToggles'
import { DutyHistory } from '@/components/duty/DutyHistory'
import { DutyIncome } from '@/components/duty/DutyIncome'
import { useDutyDim } from '@/components/duty/useDutyDim'
import { DutyPatternDialog } from '@/components/duty/DutyPatternDialog'
import { useDutyShiftActions } from '@/components/duty/useDutyShiftActions'
import { DutySettingsDialog } from '@/components/duty/DutySettingsDialog'
import { DutyShiftDialog } from '@/components/duty/DutyShiftDialog'
import { DutyTotals } from '@/components/duty/DutyTotals'

/* ============================================================
   **მორიგეობა — `/duty`.**

   ზემოთ პერიოდის ნავიგაცია (← პერიოდი →, „დღეს“) და სამსახურის ფილტრი
   (ფერებით), ქვემოთ ხედები: **კალენდარი · სია · ჯამები · კალკულატორი**.

   ⚠️ **მდგომარეობა მისამართშია** (`?date=` — ნებისმიერი დღე პერიოდში, `?view=`,
   `?w=` — სამსახური): „უკან“ და ბმული იმავე პერიოდს და ხედს აბრუნებს.
   `?shift=<id>` (ძებნის შედეგი) მის პერიოდს ხსნის და რედაქტირებას აჩვენებს.

   ⚠️ **ერთიანი მონიშვნა** კალენდრის რეჟიმია: მონიშნულ დღეებზე —
   „დამატება“ (ბევრი დღე ერთ მოთხოვნაში) ან მათი მორიგეობების შეცვლა/წაშლა.
   ============================================================ */

const VIEWS = ['calendar', 'list', 'totals', 'income', 'calculator'] as const
type View = (typeof VIEWS)[number]

const ALL = 'all'

export function DutyPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [params, setParams] = useSearchParams()

  const anchor = params.get('date') ?? undefined
  const view: View = (VIEWS as readonly string[]).includes(params.get('view') ?? '') ? (params.get('view') as View) : 'calendar'
  const workplaceFilter = params.get('w') ? Number(params.get('w')) : null
  const shiftParam = params.get('shift') ? Number(params.get('shift')) : null

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: key !== 'date' })
  }

  const settingsQ = useQuery({ queryKey: [DUTY_KEY, 'settings'], queryFn: fetchDutySettings })
  // ⚠️ გაფილტრული სამსახური — მისი პერიოდი („5-დან 4-მდე“); ყველა ერთად — კალენდარული თვე
  const periodQ = useQuery({
    queryKey: [DUTY_KEY, 'period', anchor ?? 'today', workplaceFilter],
    queryFn: () => fetchDutyPeriod(anchor, workplaceFilter),
  })
  const workplacesQ = useQuery({
    queryKey: [DUTY_KEY, 'workplaces'],
    queryFn: () => fetchDutyWorkplaces(lang === 'en' ? 'en' : 'ka'),
  })
  const typesQ = useQuery({ queryKey: [DUTY_KEY, 'types'], queryFn: fetchDutyTypes })

  const period = periodQ.data
  const shiftsQ = useQuery({
    queryKey: [DUTY_KEY, 'shifts', period?.from, period?.to],
    queryFn: () => fetchDutyShifts({ from: period!.from, to: period!.to }),
    enabled: !!period,
  })

  const settings = settingsQ.data
  const workplaces = useMemo(() => workplacesQ.data ?? [], [workplacesQ.data])
  const types = typesQ.data ?? []
  const shifts = useMemo(
    () => (shiftsQ.data?.items ?? []).filter((s) => workplaceFilter == null || s.workplace_id === workplaceFilter),
    [shiftsQ.data, workplaceFilter],
  )

  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ shift: DutyShift | null; date?: string } | null>(null)
  const [batching, setBatching] = useState(false)
  const [bulking, setBulking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // კალენდრის ჩიპის მენიუ (სიის სტრიქონი თავის თავს თვითონ აწყობს)
  const { actionsFor, moveDialog } = useDutyShiftActions((shift) => setEditing({ shift }))
  // „მუქი / ღია" სამსახური — კალენდარსა და სიაში
  const [dimmed, toggleDim] = useDutyDim()
  const qc = useQueryClient()
  const { toast } = useToast()

  /* ---------- რიტმი ---------- */
  const patternsQ = useQuery({ queryKey: [DUTY_KEY, 'patterns'], queryFn: fetchDutyPatterns })
  // „რიტმი მონიშნულიდან“ — ფანჯარა წინასწარ შევსებული
  const [rhythm, setRhythm] = useState<{ workplace: DutyWorkplace; preset: ReturnType<typeof patternFromShifts> } | null>(null)

  // ძებნის შედეგიდან — `?shift=12`: მისი პერიოდი და რედაქტირება
  const linkedQ = useQuery({
    queryKey: [DUTY_KEY, 'shift', shiftParam],
    queryFn: () => fetchDutyShift(shiftParam!),
    enabled: shiftParam != null,
    retry: false,
  })

  useEffect(() => {
    const linked = linkedQ.data
    if (!linked) return

    const next = new URLSearchParams(params)
    next.delete('shift')
    next.set('date', linked.date)
    setParams(next, { replace: true })
    setEditing({ shift: linked })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ერთხელ, მოსვლისას
  }, [linkedQ.data])

  const selectedShifts = useMemo(() => shifts.filter((s) => selected.has(s.date)), [shifts, selected])

  /* ⚠️ **გაგრძელება მხოლოდ იმ რიტმს სჭირდება, რომელიც ამ პერიოდის ბოლომდე ჯერ
     არ გაგრძელებულა** (აქტიური, სამსახური არ არის ურნაში, პირველი დღე ≤ ბოლო) */
  const pending = useMemo(
    () =>
      period
        ? (patternsQ.data ?? []).filter(
            (p) =>
              p.is_active &&
              p.anchor_date <= period.to &&
              (p.generated_until == null || p.generated_until < period.to) &&
              workplaces.some((w) => w.id === p.workplace_id),
          )
        : [],
    [patternsQ.data, period, workplaces],
  )

  const continueAll = useMutation({
    mutationFn: async () => {
      let created = 0
      let skipped = 0
      // თითო რიტმი თავის ტრანზაქციაში — რიგრიგობით
      for (const pattern of pending) {
        const result = await continueDutyPattern(pattern.id, period!.to)
        created += result.created
        skipped += result.skipped
      }
      return { created, skipped }
    },
    onSuccess: (result) => {
      invalidateDuty(qc)
      toast({ title: t('duty.pattern.continued', result), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const fromSelection = () => {
    const preset = patternFromShifts(selectedShifts)
    if (preset === 'uneven' || preset === null) {
      toast({ title: t(preset === 'uneven' ? 'duty.pattern.uneven' : 'duty.pattern.needTwo'), variant: 'error' })
      return
    }
    const workplace = workplaces.find((w) => w.id === preset.workplace_id)
    if (workplace) setRhythm({ workplace, preset })
  }

  const totals = useMemo(
    () =>
      // გაუქმებული არც საათებში ითვლება, არც თანხაში, არც რიცხვში
      shifts.reduce(
        (sum, s) =>
          s.status === 'cancelled'
            ? sum
            : { count: sum.count + 1, hours: sum.hours + s.hours, pay: sum.pay + (s.pay ?? 0) },
        { count: 0, hours: 0, pay: 0 },
      ),
    [shifts],
  )

  const openDay = (day: string) => {
    const list = shifts.filter((s) => s.date === day)
    if (list.length) setDayOpen(day)
    else setEditing({ shift: null, date: day })
  }

  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const loading = periodQ.isLoading || settingsQ.isLoading || workplacesQ.isLoading || typesQ.isLoading
  const currency = settings?.currency ?? '₾'
  /* აქტიური სამსახური ტარიფისა და საათობრივის გარეშე — თანხა არ ითვლება;
     ეს პირველი ნაბიჯია და გვერდი ამას პირდაპირ ამბობს (ბმულით პარამეტრებზე) */
  const unpaid = workplaces.filter((w) => w.is_active && payMode(w) === null)

  return (
    <PageContainer>
      <PageHeader
        module="duty"
        title={t('duty.title')}
        hint={t('duty.hint')}
        actions={
          <>
            <Button variant="outline" onClick={() => setSettingsOpen(true)} disabled={!settings}>
              <Settings className="size-4" />
              {t('duty.settings.open')}
            </Button>
            {view === 'calendar' && (
              <Button variant={selecting ? 'secondary' : 'outline'} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                <CalendarCheck className="size-4" />
                {t(selecting ? 'duty.select.stop' : 'duty.select.start')}
              </Button>
            )}
            <Button onClick={() => setEditing({ shift: null, date: todayIso() })} disabled={loading}>
              <Plus className="size-4" />
              {t('duty.shift.add')}
            </Button>
          </>
        }
      />

      {unpaid.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm" data-testid="duty-no-rate">
          <TriangleAlert className="size-4 shrink-0 text-[var(--icon-warn)]" />
          <span className="min-w-0 flex-1">{t('duty.workplace.noRateBanner', { names: unpaid.map((w) => w.name).join(', ') })}</span>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} disabled={!settings}>
            <Settings className="size-4" />
            {t('duty.settings.open')}
          </Button>
        </div>
      )}

      {/* ---------- პერიოდი ---------- (სრულ სიას თავისი თარიღის ფილტრი აქვს) */}
      {view !== 'list' && (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!period} onClick={() => period && setParam('date', period.previous.from)}>
          <ChevronLeft className="size-4" />
          {t('duty.period.previous')}
        </Button>
        <h2 className="min-w-0 px-2 text-base font-semibold" data-testid="duty-period-label">
          {period ? periodLabel(period.from, period.to, lang) : '…'}
        </h2>
        <Button variant="outline" size="sm" disabled={!period} onClick={() => period && setParam('date', period.next.from)}>
          {t('duty.period.next')}
          <ChevronRight className="size-4" />
        </Button>
        {anchor && (
          <Button variant="ghost" size="sm" onClick={() => setParam('date', null)}>
            {t('duty.period.today')}
          </Button>
        )}
        {/* რიტმი ამ პერიოდში ჯერ არ გაგრძელებულა — ერთი დაჭერით ნამდვილი მორიგეობები */}
        {pending.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => continueAll.mutate()} disabled={continueAll.isPending} data-testid="duty-pattern-continue">
            {continueAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <Repeat className="size-4" />}
            {t('duty.pattern.continue')}
          </Button>
        )}

        {!!shifts.length && (
          <p className="ml-auto text-sm text-muted-foreground" data-testid="duty-period-totals">
            {t('duty.period.totals', {
              count: totals.count,
              hours: formatHours(totals.hours),
              pay: formatMoney(totals.pay, currency, lang),
            })}
          </p>
        )}
      </div>
      )}

      {view !== 'list' && workplaces.length > 1 && (
        <div className="mb-4">
          <CutTabs
            options={[
              { key: ALL, label: t('duty.allWorkplaces') },
              ...workplaces.map((w) => ({ key: String(w.id), label: w.name, color: w.color })),
            ]}
            value={workplaceFilter == null ? ALL : String(workplaceFilter)}
            onChange={(key) => setParam('w', key === ALL ? null : key)}
          />
        </div>
      )}

      <div className="mb-4">
        <CutTabs
          options={[
            { key: 'calendar', label: t('duty.view.calendar'), icon: CalendarDays },
            { key: 'list', label: t('duty.view.list'), icon: List },
            { key: 'totals', label: t('duty.view.totals'), icon: BarChart3 },
            { key: 'income', label: t('duty.view.income'), icon: Wallet },
            { key: 'calculator', label: t('duty.view.calculator'), icon: Calculator },
          ]}
          value={view}
          onChange={(key) => {
            stopSelecting()
            setParam('view', key === 'calendar' ? null : key)
          }}
        />
      </div>

      {/* ---------- მონიშვნის ზოლი ---------- */}
      {selecting && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2.5 text-sm" data-testid="duty-selection-bar">
          <span className="font-medium">
            {selected.size
              ? t('duty.select.count', { days: selected.size, shifts: selectedShifts.length })
              : t('duty.select.hint')}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={!selected.size} onClick={() => setBatching(true)}>
              <Plus className="size-4" />
              {t('duty.select.add')}
            </Button>
            <Button size="sm" variant="edit" disabled={!selectedShifts.length} onClick={() => setBulking(true)}>
              <Pencil className="size-4" />
              {t('duty.select.change')}
            </Button>
            <Button size="sm" variant="outline" disabled={selectedShifts.length < 2} onClick={fromSelection}>
              <Repeat className="size-4" />
              {t('duty.pattern.fromSelection')}
            </Button>
            <Button size="sm" variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>
              <X className="size-4" />
              {t('duty.select.clear')}
            </Button>
          </div>
        </div>
      )}

      {(view === 'calendar' || view === 'list') && <DutyDimToggles workplaces={workplaces} dimmed={dimmed} onToggle={toggleDim} />}

      {view === 'list' ? (
        <DutyHistory workplaces={workplaces} types={types} settings={settings} dimmed={dimmed} onEdit={(shift) => setEditing({ shift })} />
      ) : loading || !period || shiftsQ.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'calendar' ? (
        <DutyCalendar
          from={period.from}
          to={period.to}
          shifts={shifts}
          selecting={selecting}
          selected={selected}
          onSelectionChange={setSelected}
          onOpenDay={openDay}
          shiftActions={actionsFor}
          dimmed={dimmed}
          currency={currency}
        />
      ) : view === 'income' ? (
        <DutyIncome until={period.to} workplaceFilter={workplaceFilter} workplaces={workplaces} settings={settings} />
      ) : view === 'totals' ? (
        <DutyTotals period={period} workplaceFilter={workplaceFilter} workplaces={workplaces} types={types} settings={settings} />
      ) : (
        <DutyCalculator key={period.from} period={period} workplaces={workplaces} types={types} settings={settings} />
      )}

      {/* ---------- ფანჯრები ---------- */}
      {dayOpen && (
        <DutyDayDialog
          day={dayOpen}
          shifts={shifts.filter((s) => s.date === dayOpen)}
          settings={settings}
          onEdit={(shift) => {
            setDayOpen(null)
            setEditing({ shift })
          }}
          onAdd={() => {
            const day = dayOpen
            setDayOpen(null)
            setEditing({ shift: null, date: day })
          }}
          onClose={() => setDayOpen(null)}
        />
      )}
      {editing && (
        <DutyShiftDialog
          shift={editing.shift}
          date={editing.date}
          workplaces={workplaces}
          types={types}
          settings={settings}
          onClose={() => setEditing(null)}
        />
      )}
      {batching && (
        <DutyBatchDialog
          days={[...selected]}
          workplaces={workplaces}
          types={types}
          settings={settings}
          onClose={() => setBatching(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {bulking && (
        <DutyBulkDialog
          shifts={selectedShifts}
          workplaces={workplaces}
          types={types}
          onClose={() => setBulking(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
      {moveDialog}
      {rhythm && rhythm.preset && rhythm.preset !== 'uneven' && (
        <DutyPatternDialog
          workplace={rhythm.workplace}
          pattern={(patternsQ.data ?? []).find((p) => p.workplace_id === rhythm.workplace.id) ?? null}
          types={types}
          preset={{
            interval_days: rhythm.preset.interval_days,
            anchor_date: rhythm.preset.anchor_date,
            type_id: rhythm.preset.type_id,
            hours: rhythm.preset.hours,
            start_time: rhythm.preset.start_time,
            adopt_ids: rhythm.preset.ids,
          }}
          onClose={() => {
            setRhythm(null)
            setSelected(new Set())
          }}
        />
      )}
      {settingsOpen && settings && (
        <DutySettingsDialog settings={settings} workplaces={workplaces} types={types} onClose={() => setSettingsOpen(false)} />
      )}
    </PageContainer>
  )
}
