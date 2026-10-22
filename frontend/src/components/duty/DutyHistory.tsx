import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import {
  DUTY_KEY,
  DUTY_STATUSES,
  fetchDutyShiftPage,
  type DutySettingsData,
  type DutyShift,
  type DutyShiftStatus,
  type DutyShiftType,
  type DutyWorkplace,
} from '@/api/duty'
import { useFilterDraft } from '@/lib/filters'
import { typeName } from '@/lib/duty'
import { usePagedList } from '@/lib/paged'
import { usePageSize } from '@/lib/pageSize'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { FilterGroup, FilterOption, FilterOptionList, FilterPanel, FilterTrigger } from '@/components/FilterPanel'
import { DutyList } from '@/components/duty/DutyList'

/* ============================================================
   **სრული სია — ყველა მორიგეობა, თვეებით** (`?view=list`).

   „რაც ადრე იყო, რაც მომავალში მაქვს, რაც ახლაა": სერვერის გვერდებიანი
   რეჟიმი (`GET /duty/shifts?page=…`), თარიღით კლებადი (ან ზრდადი), თვის
   მიკრული სათაურებით; ფილტრები (`FilterPanel`) — სამსახური, ტიპი, სტატუსი,
   რჩეული, თარიღის შუალედი; ძებნა შენიშვნაში. გვერდი `?page=`-შია
   (`usePagedList`), ზომა — მოდულზე (`usePageSize`, სტრიქონები).

   ⚠️ ფილტრები მისამართშია (`fw` · `ft` · `fs` · `ff` · `from` · `to` · `q` ·
   `sort`) და კალენდრის `?w`-ს არ ეხება — ორი ხედი ორ კითხვას სვამს.
   ============================================================ */

interface Filters {
  workplaces: string[]
  types: string[]
  statuses: string[]
  favorite: boolean
  from: string
  to: string
}

const EMPTY: Filters = { workplaces: [], types: [], statuses: [], favorite: false, from: '', to: '' }

const SORTS = ['date_desc', 'date_asc'] as const

const list = (raw: string | null) => (raw ? raw.split(',').filter(Boolean) : [])

export function DutyHistory({
  workplaces,
  types,
  settings,
  dimmed,
  onEdit,
}: {
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  settings: DutySettingsData | undefined
  dimmed: ReadonlySet<number>
  onEdit: (shift: DutyShift) => void
}) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const [panelOpen, setPanelOpen] = useState(false)

  const applied: Filters = {
    workplaces: list(params.get('fw')),
    types: list(params.get('ft')),
    statuses: list(params.get('fs')),
    favorite: params.get('ff') === '1',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
  const q = params.get('q') ?? ''
  const sort = params.get('sort') === 'date_asc' ? 'date_asc' : 'date_desc'

  /** ერთი ან რამდენიმე პარამეტრი; ⚠️ გვერდი პირველზე ბრუნდება */
  const write = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      next.delete('page')
      return next
    })

  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(applied, EMPTY, (next) => {
    setPanelOpen(false)
    write({
      fw: next.workplaces.join(','),
      ft: next.types.join(','),
      fs: next.statuses.join(','),
      ff: next.favorite ? '1' : null,
      from: next.from || null,
      to: next.to || null,
    })
  })

  // ძებნა — აკრეფიდან ცოტა ხანში (თითო ასოზე მოთხოვნა არ მიდის)
  const [search, setSearch] = useState(q)
  useEffect(() => {
    if (search.trim() === q) return
    const timer = window.setTimeout(() => write({ q: search.trim() || null }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `write` ყოველ რენდერზე ახალია; ტრიგერი აკრეფაა
  }, [search, q])

  const [pageSize, setPageSize, columns] = usePageSize('duty', 'rows')
  const query = usePagedList({
    queryKey: [DUTY_KEY, 'history', applied, q, sort],
    fetchPage: (page, per_page) =>
      fetchDutyShiftPage({
        page,
        per_page,
        workplace_id: applied.workplaces.map(Number),
        type_id: applied.types.map(Number),
        status: applied.statuses as DutyShiftStatus[],
        favorite: applied.favorite || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
        q: q || undefined,
        sort,
      }),
    pageSize,
  })

  const toggle = (key: 'workplaces' | 'types' | 'statuses', value: string, on: boolean) =>
    setDraft((cur) => ({ ...cur, [key]: on ? [...cur[key], value] : cur[key].filter((x) => x !== value) }))

  const filtered = activeCount > 0 || q !== ''

  return (
    <div className="flex gap-6" data-testid="duty-history">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-56 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('duty.history.search')}
              aria-label={t('duty.history.search')}
              className="h-9 pl-9"
            />
          </div>
          <Select value={sort} onValueChange={(v) => write({ sort: v === 'date_desc' ? null : v })}>
            <SelectTrigger className="h-9 w-auto" aria-label={t('sort.label')}>
              <SelectFitValue labels={SORTS.map((s) => t(`duty.history.sort.${s}`))} />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`duty.history.sort.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PageSizePick className="ml-auto" size="sm" columns={columns} value={pageSize} total={query.total} onChange={setPageSize} />
          <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
        </div>

        {!query.isLoading && (
          <DutyList
            shifts={query.items}
            settings={settings}
            onEdit={onEdit}
            months
            dimmed={dimmed}
            emptyTitle={filtered ? t('duty.history.noMatch') : undefined}
          />
        )}
        <Pagination {...query.pagination} />
      </div>

      <FilterPanel
        activeCount={activeCount}
        dirty={dirty}
        onApply={() => apply(draft)}
        onClear={clear}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      >
        {workplaces.length > 1 && (
          <FilterGroup title={t('fields.name.duty.workplace')} count={draft.workplaces.length}>
            <FilterOptionList>
              {workplaces.map((w) => (
                <FilterOption
                  key={w.id}
                  label={w.name}
                  checked={draft.workplaces.includes(String(w.id))}
                  onChange={(on) => toggle('workplaces', String(w.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>
        )}

        <FilterGroup title={t('fields.name.duty.type')} count={draft.types.length}>
          <FilterOptionList>
            {types.map((type) => (
              <FilterOption
                key={type.id}
                label={typeName(type, i18n.language)}
                checked={draft.types.includes(String(type.id))}
                onChange={(on) => toggle('types', String(type.id), on)}
              />
            ))}
          </FilterOptionList>
        </FilterGroup>

        <FilterGroup title={t('fields.name.duty.status')} count={draft.statuses.length}>
          <FilterOptionList>
            {DUTY_STATUSES.map((status) => (
              <FilterOption
                key={status}
                label={t(`duty.status.${status}`)}
                checked={draft.statuses.includes(status)}
                onChange={(on) => toggle('statuses', status, on)}
              />
            ))}
          </FilterOptionList>
        </FilterGroup>

        <FilterGroup title={t('filter.favorite')} count={draft.favorite ? 1 : 0}>
          <FilterOption
            label={t('duty.history.onlyFavorite')}
            checked={draft.favorite}
            onChange={(on) => setDraft((cur) => ({ ...cur, favorite: on }))}
          />
        </FilterGroup>

        <FilterGroup title={t('duty.history.range')} count={(draft.from ? 1 : 0) + (draft.to ? 1 : 0)}>
          <div className="space-y-2">
            <DatePicker id="duty-history-from" value={draft.from || null} onChange={(v) => setDraft((cur) => ({ ...cur, from: v ?? '' }))} />
            <DatePicker id="duty-history-to" value={draft.to || null} onChange={(v) => setDraft((cur) => ({ ...cur, to: v ?? '' }))} />
          </div>
        </FilterGroup>
      </FilterPanel>
    </div>
  )
}
