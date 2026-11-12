import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Dices, ExternalLink, FilterX, Loader2, PlayCircle, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import type { ModuleInfo } from '@/api/account'
import { saveModuleSettings } from '@/api/videos'
import type { Status } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { plainText } from '@/lib/richText'
import { useModules } from '@/lib/modules'
import {
  PICK_COUNTS,
  PICK_MAX,
  PICK_SETTING,
  defaultPickStatuses,
  readPickSettings,
  type PickRecord,
  type PickSource,
} from '@/lib/pick'
import { statusName, useStatuses } from '@/lib/statuses'
import { statusStyle } from '@/lib/statusColor'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { NumberPick } from '@/components/ui/number-pick'
import { useToast } from '@/components/ui/feedback'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PosterImage } from '@/components/PosterImage'
import { StatusBadge } from '@/components/StatusBadge'

/* ============================================================
   **„რა ვნახო დღეს?"**.

   ⚠️ **არჩევანი სერვერზე ხდება და არა ბრაუზერში.** სიიდან ჩატვირთულია მხოლოდ
   ერთი გვერდი, ე.ი. ბადიდან აღებული „შემთხვევითი" ყოველთვის მასში მოხვდებოდა.

   ⚠️ **N ბარათი და სტატუსების მრავალარჩევი** — რამდენი და საიდან, ზედა
   ზოლში; არჩევანი `module_user.settings.pick`-ში **ჩუმად** ინახება (შენახვის
   ზოლის გარეშე — ეს ფანჯრის მეხსიერებაა და არა პარამეტრი).

   ⚠️ **ფილტრი სიიდან მოჰყვება, მაგრამ ფანჯრისაა** (`source.filter`): პირობები
   ჩიპებად ჩანს და თითო ✕-ით იხსნება, „ფილტრის შეცვლა" სიის პანელის ველებს
   შლის, „ფილტრის გარეშე" ყველას ხსნის. ფანჯარაში ცვლილება სიის ფილტრს არ
   ეხება და არსად ინახება — დახურვის შემდეგ ისევ სიისა მოჰყვება.

   ⚠️ **ერთი სტატუსი მაინც მონიშნული რჩება**: ყველას მოხსნა სერვერზე
   ნაგულისხმევ `todo`-ს აამოქმედებდა — ეკრანი „არაფერია არჩეული"-ს იტყოდა,
   შედეგი კი მოვიდოდა. ამიტომ ბოლო ჩიპი არ იხსნება.

   ⚠️ **„კიდევ N" ქვემოთ ამატებს და არ ანაცვლებს**: ნაჩვენები id-ები სერვერს
   `exclude`-ით მიაქვს, ახალი ულუფა ბადის ბოლოს დგება. როცა ნაკლები მოვიდა,
   ვიდრე ვთხოვეთ, სია ამოიწურა — ღილაკი ითიშება და ამას ქვედა ზოლი ამბობს.
   „თავიდან" ახალ შემთხვევით არჩევანს აგორებს.

   ⚠️ **„დავიწყოთ" სტატუსს `doing` როლით ეძებს და არა გასაღებით**; თუ ასეთი
   არ არსებობს, ღილაკი არ იხატება. დაჭერის შემდეგ ღილაკი ადგილზე რჩება, როგორც
   შევსებული „დაწყებულია ✓" — ხელახალი დაჭერა ძველ სტატუსს აბრუნებს (შეცდომით
   დაჭერის გასწორება). ბარათი სიიდან არ ქრება.

   ⚠️ **გაგორებისას ჩონჩხები და არა სპინერი**: N ბარათის ადგილას N ჩონჩხია,
   იმავე ბადეში და იმავე ფორმით (`source.shape` — პასუხამდეც ცნობილია), ე.ი.
   ფანჯრის ზომა ადგილზე რჩება.
   ============================================================ */

/* **ოთხი ბარათი რიგში** (საშუალო ეკრანზე სამი, ტელეფონზე ორი): ოთხზე სტატუსი და
   ორი ღილაკი ეტევა და პოსტერიც საკმარისად დიდია. ხუთი აღარ ეტეოდა — სწორედ
   ამიტომ იკეცებოდა ბარათის ქვედა რიგი. */
const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4'

/** „დავიწყოთ" ღილაკის მდგომარეობა ბარათზე */
type StartState = 'idle' | 'started' | 'already'

export function RandomPickDialog<F>({ source, onClose }: { source: PickSource<F>; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const qc = useQueryClient()
  const { all: modules } = useModules()
  const statusesQ = useStatuses(source.domain)
  const statuses = useMemo(() => statusesQ.data ?? [], [statusesQ.data])

  const saved = useMemo(
    () => readPickSettings(modules.find((m) => m.key === source.domain)?.user_settings),
    [modules, source.domain],
  )
  const [count, setCount] = useState(saved.count)
  /** `null` — ჯერ ხელი არ უხლია: შენახული ან ნაგულისხმევი ფარგლები მოქმედებს */
  const [chosen, setChosen] = useState<string[] | null>(null)
  const active = useMemo(() => {
    if (chosen) return chosen
    const valid = saved.statuses?.filter((k) => statuses.some((s) => s.key === k)) ?? []
    return valid.length ? valid : defaultPickStatuses(statuses, source.currentStatus)
  }, [chosen, saved.statuses, statuses, source.currentStatus])

  /** ფანჯრის ფილტრი — სიის ფილტრის ასლი; `draft` ღია „ფილტრის შეცვლის" მონახაზია */
  const [filter, setFilter] = useState<F>(source.filter.initial)
  const [draft, setDraft] = useState<F | null>(null)
  const chips = source.filter.chips(filter)

  /** „თავიდან" — იმავე ფარგლებში ახალი გაგორება */
  const [round, setRound] = useState(0)
  /** ყველაფერი, რაც არჩევანს განსაზღვრავს: მისი ცვლილება დაგროვილ ბარათებს ასუფთავებს */
  const scope = JSON.stringify([count, active, filter, round])

  /* ⚠️ `useQuery` და არა `useEffect`: პირველი არჩევანი გახსნისთანავე უნდა
     მოვიდეს. `staleTime: 0` + `gcTime: 0`: ქეშირებული „შემთხვევითი" ყოველ გახსნაზე
     ერთსა და იმავეს დააბრუნებდა. ფანჯარაზე დაბრუნება თავიდან არ აგორებს —
     ბარათები თვალწინ შეიცვლებოდა. სტატუსების ლექსიკონამდე არ იწყება —
     ფარგლები მასზეა დამოკიდებული. */
  const first = useQuery({
    queryKey: ['random-pick', source.domain, scope],
    queryFn: () => source.fetch({ count, status: active, exclude: [] }, filter),
    enabled: statusesQ.isSuccess,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  /** „კიდევ N"-ით დამატებული ულუფები */
  const [extra, setExtra] = useState<PickRecord[]>([])
  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle')
  const scopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
    setExtra([])
    setMore('idle')
  }, [scope])

  const records = useMemo(() => [...(first.data ?? []), ...extra], [first.data, extra])
  const busy = first.isFetching || !statusesQ.isSuccess
  /** ბოლო ულუფა ნაკლები მოვიდა, ვიდრე ვთხოვეთ — ამ ფარგლებში მეტი აღარ არის */
  const exhausted = more === 'done' || (!!first.data && first.data.length < count)
  const doing = statuses.find((s) => s.role === 'doing')

  /** ჩუმი შენახვა: ჯერ ლოკალური ქეში (მომდევნო გახსნაც უმალ ხედავს), მერე სერვერი */
  const persist = (next: { count?: number; statuses?: string[] }) => {
    const value = { count: next.count ?? count, statuses: next.statuses ?? active }
    qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
      list?.map((m) =>
        m.key === source.domain ? { ...m, user_settings: { ...m.user_settings, [PICK_SETTING]: value } } : m,
      ),
    )
    void saveModuleSettings(source.domain, { [PICK_SETTING]: value }).catch(() => {
      // მეხსიერების დაკარგვა ფანჯარას არ აჩერებს — შემდეგ ჯერზე ისევ ნაგულისხმევი იქნება
    })
  }

  const changeCount = (n: number) => {
    setCount(n)
    persist({ count: n })
  }

  const toggleStatus = (key: string) => {
    const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
    if (!next.length) return
    setChosen(next)
    persist({ statuses: next })
  }

  const applyFilter = (next: F) => {
    setFilter(next)
    setDraft(null)
  }

  const loadMore = async () => {
    const asked = scope
    setMore('loading')
    try {
      const list = await source.fetch({ count, status: active, exclude: records.map((r) => r.id) }, filter)
      // ამასობაში ფარგლები შეიცვალა — პასუხი ძველ კითხვას ეკუთვნის
      if (scopeRef.current !== asked) return
      setExtra((cur) => [...cur, ...list])
      setMore(list.length < count ? 'done' : 'idle')
    } catch (e) {
      if (scopeRef.current !== asked) return
      setMore('idle')
      toast({ title: errorMessage(e), variant: 'error' })
    }
  }

  /** id → სტატუსი, რომელიც „დავიწყოთ"-მდე ეწერა (ხელახალი დაჭერა მას აბრუნებს) */
  const [started, setStarted] = useState<Record<number, string | null>>({})
  const [pending, setPending] = useState<number | null>(null)

  const toggleStart = async (record: PickRecord) => {
    if (!doing) return
    const undo = record.id in started
    const target = undo ? started[record.id] : doing.key
    if (!target) return

    setPending(record.id)
    try {
      await source.setStatus(record.id, target)
      setStarted((cur) => {
        const next = { ...cur }
        if (undo) delete next[record.id]
        else next[record.id] = record.statusKey
        return next
      })
      // ბადემ ახალი სტატუსი უნდა დაინახოს
      source.invalidate.forEach((key) => void qc.invalidateQueries({ queryKey: key }))
      toast({ title: t(undo ? 'pick.restored' : 'pick.started'), variant: 'success' })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setPending(null)
    }
  }

  const statusOf = (record: PickRecord): Status | null => {
    const key = record.id in started ? doing?.key : record.statusKey
    return key ? (statuses.find((s) => s.key === key) ?? null) : null
  }

  const startState = (record: PickRecord): StartState =>
    record.id in started ? 'started' : doing && record.statusKey === doing.key ? 'already' : 'idle'

  return (
    <ModalShell title={t('pick.title')} hint={t('pick.hint')} onClose={onClose} size="full">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('pick.count')}</span>
          <NumberPick size="sm" value={count} onChange={changeCount} options={PICK_COUNTS} min={1} max={PICK_MAX} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('pick.from')}</span>
          <ChipRow>
            {statuses.map((s) => {
              const on = active.includes(s.key)
              return (
                <Chip
                  key={s.key}
                  active={on}
                  onClick={() => toggleStatus(s.key)}
                  style={on ? statusStyle(s, 'active') : undefined}
                  icon={<ModuleIcon name={s.icon ?? 'Circle'} className="size-3.5 shrink-0" style={statusStyle(s, 'icon')} />}
                >
                  {statusName(s, lang)}
                </Chip>
              )
            })}
          </ChipRow>
        </div>
      </div>

      {/* ---------- ფილტრი: სიიდან მოყოლილი პირობები ჩიპებად ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="pick-filter">
        <span className="text-sm text-muted-foreground">{t('pick.filter')}</span>
        {chips.length ? (
          chips.map((chip) => (
            <Chip
              key={chip.key}
              active
              remove
              title={t('drill.remove')}
              data-filter={chip.key}
              onClick={() => applyFilter(chip.without)}
            >
              {chip.label}
            </Chip>
          ))
        ) : (
          <span className="text-sm">{t('pick.filterNone')}</span>
        )}
        <Button
          variant="outline"
          size="xs"
          aria-expanded={draft !== null}
          onClick={() => setDraft(draft === null ? filter : null)}
        >
          <SlidersHorizontal className="size-3.5" />
          {t('pick.editFilter')}
        </Button>
        {chips.length > 0 && (
          <Button variant="outline" size="xs" onClick={() => applyFilter(source.filter.empty)}>
            <FilterX className="size-3.5" />
            {t('pick.withoutFilter')}
          </Button>
        )}
      </div>

      {draft !== null && (
        <div className="mt-3 rounded-md border border-border bg-card/40 p-3" data-testid="pick-filter-editor">
          {/* სიის პანელის ველები; ჯგუფების საკუთარი გამყოფი ხაზი ბადეში ზედმეტია */}
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 [&>*]:border-b-0 [&>*]:py-0">
            {source.filter.fields(draft, (update) => setDraft((cur) => (cur === null ? cur : update(cur))))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              <X className="size-4" />
              {t('actions.cancel')}
            </Button>
            <Button size="sm" onClick={() => applyFilter(draft)}>
              <Check className="size-4" />
              {t('filter.apply')}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {busy ? (
          // N ჩონჩხი იმავე ბადეში: ფანჯარა ზომას არ იცვლის
          <div className={GRID} aria-busy>
            {Array.from({ length: count }, (_, i) => (
              <PickSkeleton key={i} shape={source.shape} />
            ))}
          </div>
        ) : first.isError ? (
          /* სერვერის ვარდნა ≠ „ამ ფილტრში არაფერია" */
          <QueryErrorState error={first.error} onRetry={() => void first.refetch()} />
        ) : records.length === 0 ? (
          /* ⚠️ ცარიელი ფილტრი შეცდომა არაა — მდგომარეობაა (რა ცარიელია · რატომ · რა ვქნა) */
          <EmptyState
            icon={<Dices className="size-6" />}
            title={t('pick.emptyTitle')}
            hint={t('pick.emptyHint')}
            actions={
              <>
                {chips.length > 0 && (
                  <Button variant="outline" onClick={() => applyFilter(source.filter.empty)}>
                    <FilterX className="size-4" />
                    {t('pick.withoutFilter')}
                  </Button>
                )}
                <Button variant="outline" onClick={onClose}>
                  <X className="size-4" />
                  {t('actions.close')}
                </Button>
              </>
            }
          />
        ) : (
          <div className={GRID}>
            {records.map((record, i) => (
              <PickCard
                key={record.id}
                record={record}
                index={i % count}
                status={statusOf(record)}
                start={doing ? startState(record) : null}
                pending={pending === record.id}
                onOpen={() => source.open(record)}
                onStart={() => void toggleStart(record)}
              />
            ))}
            {/* „კიდევ N" — ახალი ულუფის ადგილას ჩონჩხები, არსებული ბარათები ადგილზე რჩება */}
            {more === 'loading' &&
              Array.from({ length: count }, (_, i) => <PickSkeleton key={`more-${i}`} shape={source.shape} />)}
          </div>
        )}
      </div>

      <ModalFooter>
        {exhausted && records.length > 0 && (
          <span className="mr-auto text-sm text-muted-foreground" data-testid="pick-exhausted">
            {t('pick.exhaustedTitle')}
          </span>
        )}
        <Button variant="outline" onClick={() => setRound((r) => r + 1)} disabled={busy} title={t('pick.restartHint')}>
          <RotateCcw className="size-4" />
          {t('pick.restart')}
        </Button>
        <Button
          onClick={() => void loadMore()}
          disabled={busy || more === 'loading' || exhausted || records.length === 0}
        >
          <Dices className="size-4" />
          {t('pick.moreN', { count })}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

/** ბარათის ჩონჩხი: იგივე ჩარჩო, ფოტოს ფორმა და ხაზების რიგი, რაც `PickCard`-ს აქვს */
function PickSkeleton({ shape }: { shape: PickRecord['shape'] }) {
  const bar = 'animate-pulse rounded bg-muted motion-reduce:animate-none'
  return (
    <div
      aria-hidden
      data-testid="pick-skeleton"
      className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className={cn('w-full', bar, 'rounded-none', shape === 'wide' ? 'aspect-video' : 'aspect-[2/3]')} />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className={cn('h-3.5 w-11/12', bar)} />
        <div className={cn('h-3.5 w-3/5', bar)} />
        <div className={cn('h-3 w-2/5', bar)} />
        <div className={cn('h-3 w-4/5', bar)} />
        <div className={cn('h-3 w-full', bar)} />
        <div className="mt-auto space-y-3 pt-3">
          <div className={cn('h-6 w-24', bar)} />
          <div className="grid grid-cols-2 gap-2">
            <div className={cn('h-9', bar)} />
            <div className={cn('h-9', bar)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PickCard({
  record,
  index,
  status,
  start,
  pending,
  onOpen,
  onStart,
}: {
  record: PickRecord
  index: number
  status: Status | null
  /** `null` — `doing` როლის სტატუსი არ არსებობს, ღილაკი არ იხატება */
  start: StartState | null
  pending: boolean
  onOpen: () => void
  onStart: () => void
}) {
  const { t } = useTranslation()
  const facts = [record.year, record.rating ? `★ ${record.rating}` : null].filter(Boolean).join(' · ')
  /* ⚠️ ვიწრო ბარათზე (ტელეფონის ორი სვეტი) წარწერა ქრება და რჩება აიქონი — ორი
     ღილაკი ყოველთვის ერთ რიგშია და თანაბარია; რას აკეთებს, `title` ამბობს. */
  const label = 'hidden truncate @min-[17rem]:inline'
  const startLabel = start === 'idle' ? t('pick.start') : t('pick.startedLabel')

  return (
    <article
      className="fb-card @container flex h-full flex-col overflow-hidden rounded-md border border-border bg-card"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer" aria-label={record.title}>
        <PosterImage
          src={record.poster}
          alt={record.title}
          className={cn('w-full', record.shape === 'wide' ? 'aspect-video' : 'aspect-[2/3]')}
        />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <button
          data-kind="link"
          type="button"
          onClick={onOpen}
          className="line-clamp-2 cursor-pointer text-left text-sm font-semibold leading-tight hover:text-primary"
        >
          {record.title}
        </button>
        {facts && <p className="text-xs text-muted-foreground">{facts}</p>}
        {record.meta.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">{record.meta.join(' · ')}</p>}
        {record.description && <p className="line-clamp-3 text-xs text-muted-foreground">{plainText(record.description)}</p>}

        <div className="mt-auto space-y-3 pt-3">
          {/* სტატუსი ცალკე ხაზზე — ღილაკებთან ერთ რიგში რიგი იკეცებოდა */}
          {status && (
            <div data-testid="pick-status">
              <StatusBadge status={status} className="max-w-full" />
            </div>
          )}
          <div className={cn('grid gap-2', start ? 'grid-cols-2' : 'grid-cols-1')} data-testid="pick-actions">
            <Button variant="outline" size="sm" onClick={onOpen} title={t('actions.open')} className="min-w-0 px-2">
              <ExternalLink className="size-4 shrink-0" />
              <span className={label}>{t('actions.open')}</span>
            </Button>
            {start && (
              <Button
                size="sm"
                variant={start === 'idle' ? 'outline' : 'default'}
                onClick={onStart}
                // უკვე დაწყებულს (ამ ფანჯრის გარეთ) დასაბრუნებელი არაფერი აქვს
                disabled={pending || start === 'already'}
                aria-pressed={start !== 'idle'}
                title={start === 'started' ? t('pick.undoStart') : startLabel}
                data-start={start}
                className={cn('min-w-0 px-2', start === 'idle' && 'border-primary text-primary')}
              >
                {pending ? (
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                ) : start === 'idle' ? (
                  <PlayCircle className="size-4 shrink-0" />
                ) : (
                  <Check className="size-4 shrink-0" />
                )}
                <span className={label}>{startLabel}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
