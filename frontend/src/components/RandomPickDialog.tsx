import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dices, ExternalLink, Loader2, PlayCircle, RotateCcw } from 'lucide-react'
import type { ModuleInfo } from '@/api/account'
import { saveModuleSettings } from '@/api/videos'
import type { Status } from '@/api/types'
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
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { NumberPick } from '@/components/ui/number-pick'
import { useToast } from '@/components/ui/feedback'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PosterImage } from '@/components/PosterImage'
import { StatusBadge } from '@/components/StatusBadge'

/* ============================================================
   **„რა ვნახო დღეს"** (FEAT-20 → Tasks §17.4).

   ⚠️ **არჩევანი სერვერზე ხდება და არა ბრაუზერში.** ჩატვირთულია მხოლოდ
   პრეფიქსი („მეტის ჩვენება"), ე.ი. ბადიდან აღებული „შემთხვევითი" ყოველთვის
   პირველ სამოცში მოხვდებოდა.

   ⚠️ **N ბარათი და სტატუსების მრავალარჩევი** — რამდენი და საიდან, ზედა
   ზოლში; არჩევანი `module_user.settings.pick`-ში **ჩუმად** ინახება (შენახვის
   ზოლის გარეშე — ეს დიალოგის მეხსიერებაა და არა პარამეტრი). ფილტრის
   დანარჩენი ნაწილი სიისაა (ჟანრი, წელი…): კითხვა „ამ სიიდან რომელი"-ა.

   ⚠️ **ერთი სტატუსი მაინც მონიშნული რჩება**: ყველას მოხსნა სერვერზე
   ნაგულისხმევ `todo`-ს აამოქმედებდა — ეკრანი „არაფერია არჩეული"-ს იტყოდა,
   შედეგი კი მოვიდოდა. ამიტომ ბოლო ჩიპი არ იხსნება.

   ⚠️ **„სხვა N" უკვე ნაჩვენებს არ იმეორებს** (§6.5): ნანახი id-ები სერვერს
   `exclude`-ით მიაქვს. როცა ამოიწურა — ცალკე მდგომარეობაა („ყველა ნაჩვენებია",
   თავიდან დაწყება), ცარიელი ფილტრისგან განსხვავებული.

   ⚠️ **„დავიწყოთ" სტატუსს `doing` როლით ეძებს და არა გასაღებით** (§6.4);
   თუ ასეთი არ არსებობს, ღილაკი არ იხატება. ბარათი ადგილზე რჩება და
   ახალ სტატუსს აჩვენებს — ხუთბარათიან დიალოგს ერთი დაჭერა არ უნდა ხურავდეს.

   ⚠️ **Tasks §52.2 — გაგორებისას ჩონჩხები და არა სპინერი.** ადრე ბარათები
   ქრებოდა და `py-12`-იანი სპინერი დგებოდა — ფანჯარა პატარავდებოდა და ისევ
   იზრდებოდა („ხტუნაობს"). ახლა N ბარათის ადგილას N ჩონჩხია, იმავე ბადეში და
   იმავე ფორმით (`source.shape` — პასუხამდეც ცნობილია), ე.ი. ფანჯრის ზომა
   ადგილზე რჩება.
   ============================================================ */

/* Tasks §52.1 — **ბადე ნებისმიერ რაოდენობაზე** (ადრე ხელით 1–5-ზე იყო):
   სვეტი ბარათის სიგანითაა შემოსაზღვრული (`minmax`), `auto-fit` ცარიელ სვეტებს
   აქრობს და ბარათები ცენტრში დგება — ორი ბარათი ფართო ფანჯარაში აღარ
   იჭიმება, ოცი კი რიგებად ლაგდება. ერთი ბარათი — ვიწრო ფანჯრის შუაში. */
function gridClass(shape: PickRecord['shape'], n: number): string {
  if (n <= 1) return 'mx-auto max-w-xs'
  return cn(
    'justify-center',
    shape === 'wide'
      ? 'grid-cols-[repeat(auto-fit,minmax(14rem,18rem))]'
      : 'grid-cols-[repeat(auto-fit,minmax(9.5rem,11.5rem))]',
  )
}

export function RandomPickDialog({ source, onClose }: { source: PickSource; onClose: () => void }) {
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

  const [seen, setSeen] = useState<number[]>([])
  const [started, setStarted] = useState<Record<number, string>>({})
  const [starting, setStarting] = useState<number | null>(null)

  /* ⚠️ `useQuery` და არა `useEffect`: პირველი არჩევანი გახსნისთანავე უნდა
     მოვიდეს, „სხვა" კი გასაღების ცვლილებაა (`seen`). `staleTime: 0` + `gcTime: 0`:
     ქეშირებული „შემთხვევითი" ყოველ გახსნაზე ერთსა და იმავეს დააბრუნებდა.
     სტატუსების ლექსიკონამდე არ იწყება — ფარგლები მასზეა დამოკიდებული. */
  const { data: records = [], isFetching } = useQuery({
    queryKey: ['random-pick', source.domain, source.filterKey, count, active, seen],
    queryFn: () => source.fetch({ count, status: active, exclude: seen }),
    enabled: statusesQ.isSuccess,
    staleTime: 0,
    gcTime: 0,
  })

  const busy = isFetching || !statusesQ.isSuccess
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
      // მეხსიერების დაკარგვა დიალოგს არ აჩერებს — შემდეგ ჯერზე ისევ ნაგულისხმევი იქნება
    })
  }

  const changeCount = (n: number) => {
    setCount(n)
    setSeen([])
    persist({ count: n })
  }

  const toggleStatus = (key: string) => {
    const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
    if (!next.length) return
    setChosen(next)
    setSeen([])
    persist({ statuses: next })
  }

  const another = () => setSeen((cur) => Array.from(new Set([...cur, ...records.map((r) => r.id)])))
  const restart = () => setSeen([])

  const start = async (record: PickRecord) => {
    if (!doing) return
    setStarting(record.id)
    try {
      await source.setStatus(record.id, doing.key)
      setStarted((cur) => ({ ...cur, [record.id]: doing.key }))
      // Tasks §6.5 — ბადემ ახალი სტატუსი უნდა დაინახოს
      source.invalidate.forEach((key) => void qc.invalidateQueries({ queryKey: key }))
      toast({ title: t('pick.started'), variant: 'success' })
    } finally {
      setStarting(null)
    }
  }

  const statusOf = (record: PickRecord): Status | null => {
    const key = started[record.id] ?? record.statusKey
    return key ? (statuses.find((s) => s.key === key) ?? null) : null
  }

  return (
    <ModalShell title={t('pick.title')} hint={t('pick.hint')} onClose={onClose} size={count > 1 ? 'wide' : undefined}>
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

      <div className="mt-4">
        {busy ? (
          // §52.2 — N ჩონჩხი იმავე ბადეში: ფანჯარა ზომას არ იცვლის
          <div className={cn('grid gap-3', gridClass(source.shape, count))} aria-busy>
            {Array.from({ length: count }, (_, i) => (
              <PickSkeleton key={i} shape={source.shape} />
            ))}
          </div>
        ) : records.length === 0 ? (
          seen.length > 0 ? (
            <EmptyState
              icon={<Dices className="size-6" />}
              title={t('pick.exhaustedTitle')}
              hint={t('pick.exhaustedHint')}
              actions={
                <Button variant="outline" onClick={restart}>
                  <RotateCcw className="size-4" />
                  {t('pick.restart')}
                </Button>
              }
            />
          ) : (
            /* ⚠️ ცარიელი ფილტრი შეცდომა არაა — მდგომარეობაა (რა ცარიელია · რატომ · რა ვქნა) */
            <EmptyState
              icon={<Dices className="size-6" />}
              title={t('pick.emptyTitle')}
              hint={t('pick.emptyHint')}
              actions={
                <Button variant="outline" onClick={onClose}>
                  {t('actions.close')}
                </Button>
              }
            />
          )
        ) : (
          <div className={cn('grid gap-3', gridClass(source.shape, records.length))}>
            {records.map((record, i) => (
              <PickCard
                key={record.id}
                record={record}
                index={i}
                status={statusOf(record)}
                canStart={!!doing && started[record.id] === undefined}
                starting={starting === record.id}
                onOpen={() => source.open(record)}
                onStart={() => void start(record)}
              />
            ))}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={another} disabled={busy || records.length === 0}>
          <Dices className="size-4" />
          {t('pick.againN', { count })}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

/** §52.2 — ბარათის ჩონჩხი: იგივე ჩარჩო, ფოტოს ფორმა და ხაზების რიგი, რაც `PickCard`-ს აქვს */
function PickSkeleton({ shape }: { shape: PickRecord['shape'] }) {
  const bar = 'animate-pulse rounded bg-muted motion-reduce:animate-none'
  return (
    <div
      aria-hidden
      data-testid="pick-skeleton"
      className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className={cn('w-full', bar, 'rounded-none', shape === 'wide' ? 'aspect-video' : 'aspect-[2/3]')} />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className={cn('h-3.5 w-11/12', bar)} />
        <div className={cn('h-3.5 w-3/5', bar)} />
        <div className={cn('h-3 w-2/5', bar)} />
        <div className={cn('h-3 w-4/5', bar)} />
        <div className={cn('h-3 w-full', bar)} />
        <div className={cn('h-3 w-3/4', bar)} />
        <div className="mt-auto flex gap-2 pt-2">
          <div className={cn('h-9 w-20', bar)} />
          <div className={cn('h-9 w-24', bar)} />
        </div>
      </div>
    </div>
  )
}

function PickCard({
  record,
  index,
  status,
  canStart,
  starting,
  onOpen,
  onStart,
}: {
  record: PickRecord
  index: number
  status: Status | null
  canStart: boolean
  starting: boolean
  onOpen: () => void
  onStart: () => void
}) {
  const { t } = useTranslation()
  const facts = [record.year, record.rating ? `★ ${record.rating}` : null].filter(Boolean).join(' · ')

  return (
    <article
      className="fb-card flex h-full flex-col overflow-hidden rounded-md border border-border bg-card"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer" aria-label={record.title}>
        <PosterImage
          src={record.poster}
          alt={record.title}
          className={cn('w-full', record.shape === 'wide' ? 'aspect-video' : 'aspect-[2/3]')}
        />
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <button
          type="button"
          onClick={onOpen}
          className="line-clamp-2 cursor-pointer text-left text-sm font-semibold leading-tight hover:text-primary"
        >
          {record.title}
        </button>
        {facts && <p className="text-xs text-muted-foreground">{facts}</p>}
        {record.meta.length > 0 && <p className="line-clamp-1 text-xs text-muted-foreground">{record.meta.join(' · ')}</p>}
        {record.description && <p className="line-clamp-3 text-xs text-muted-foreground">{plainText(record.description)}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {status && <StatusBadge status={status} />}
          <Button variant="outline" size="sm" onClick={onOpen}>
            <ExternalLink className="size-4" />
            {t('actions.open')}
          </Button>
          {canStart && (
            <Button size="sm" onClick={onStart} disabled={starting}>
              {starting ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
              {t('pick.start')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
