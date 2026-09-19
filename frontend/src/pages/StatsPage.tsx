import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChartColumn, Heart } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { fetchStats, type StatModule, type StatNamed } from '@/api/stats'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BAR_RADIUS_X,
  BAR_RADIUS_Y,
  CHART_GRID,
  CHART_TICK,
  ChartFrame,
  ChartTip,
  clipLabel,
} from '@/components/ui/chart'

/* ============================================================
   სტატისტიკა (FEAT-08) — 19.10-ის „მოგვიანებით".

   ⚠️ **ზოლები ნამდვილ გრაფიკებად შეიცვალა (2026-09-19, შენი მითითებით).**
   თავდაპირველად ბიბლიოთეკა განზრახ არ დაემატა — „ყველა ჭრილი
   ჰორიზონტალური ზოლია, ეს კი ერთი `div`-ია". ეს მოსაზრება ორ რამეს
   არ ითვალისწინებდა: `div`-ს **ღერძი და ტულტიპი არ აქვს** (თორმეტი
   თვის დინამიკა ზოლებად საერთოდ არ იკითხება), და ხუთივე ჭრილი ერთ
   ფორმად იყო დაყვანილი, მაშინ როცა მათი **ამოცანები სხვადასხვაა**.

   ⚠️ **თითო ჭრილს თავისი ფორმა აქვს და ეს არჩევანი შინაარსობრივია:**
   – სტატუსი — **ნაწილი მთელთან**: დონატი (≤6 სექტორი), მეტზე ზოლები;
   – თვეები — **დრო**: ფართობიანი ხაზი, თორმეტივე თვით;
   – ჟანრები — **სიდიდე გრძელსახელიან კატეგორიებზე**: ჰორიზონტალური ზოლი;
   – ქულები და გამოშვების წელი — **განაწილება რიგობრივ ღერძზე**: სვეტები.

   ⚠️ **ერთსერიიან ჭრილს ლეგენდა არ აქვს** — სათაური თვითონ ასახელებს
   სერიას; ლეგენდა მხოლოდ დონატს აქვს, სადაც სექტორები **განსხვავებული
   არსებებია**. ამიტომვე ზოლები ერთ ფერშია (მოდულის აქცენტი) და არა
   „რაც დიდია, მით მუქი": სიგრძე უკვე ამბობს რიცხვს, ფერის იმავეზე
   დახარჯვა ერთადერთ თავისუფალ არხს კარგავს.

   ⚠️ **წელი URL-შია** (`?year=`), და არა `useState`-ში — ისევე როგორც
   ფილტრები: გვერდის გაზიარება და ბრაუზერის „უკან" უნდა მუშაობდეს.
   ============================================================ */

export function StatsPage() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()

  const year = Number(params.get('year')) || undefined

  const { data, isLoading } = useQuery({
    queryKey: ['stats', year ?? 'auto'],
    queryFn: () => fetchStats(year),
    staleTime: 60_000,
  })

  const modules = data?.data ?? []
  const anything = modules.some((m) => m.total > 0)

  return (
    <PageContainer>
      <PageHeader
        tool="stats"
        title={t('stats.title')}
        hint={t('stats.hint')}
        actions={
          (data?.years.length ?? 0) > 0 && (
            <Select
              value={String(data?.year ?? '')}
              onValueChange={(v) => setParams({ year: v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(data?.years ?? []).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !anything ? (
        <EmptyState
          icon={<ChartColumn className="size-6" />}
          title={t('stats.empty')}
          hint={t('stats.emptyHint')}
        />
      ) : (
        <div className="grid gap-4">
          {modules.filter((m) => m.total > 0).map((m) => (
            <ModuleStats key={m.key} module={m} lang={i18n.language} year={data?.year ?? 0} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

function ModuleStats({ module: m, lang, year }: { module: StatModule; lang: string; year: number }) {
  const { t } = useTranslation()
  const named = (row: StatNamed) =>
    (lang === 'ka' ? row.name_ka : row.name_en) || row.name_en || row.name_ka || t('stats.other')

  /* ⚠️ `t`-ს ტიპი პარამეტრად ვერ გადაეცემა (i18next-ის ოვერლოადები),
     ამიტომ დამხმარე აქვეა — იქ, სადაც `t` სქოუპშია. */
  const enumStatus = (key: string | null) => {
    const ns = ENUM_STATUS_NS[m.key]
    return ns && key ? t(`${ns}.${key}`, { defaultValue: key }) : (key ?? '—')
  }

  const statusRows: Row[] = m.status.map((s) => ({
    key: s.key ?? '—',
    // enum-იან მოდულებს ლექსიკონი არ აქვთ — სახელი i18n-შია
    label: (lang === 'ka' ? s.name_ka : s.name_en) || enumStatus(s.key),
    value: s.count,
    tone: s.color ?? roleTone(s.role),
  }))

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
    >
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
          <ModuleIcon name={m.icon} />
        </span>
        <h2 className="font-display text-lg font-semibold">
          {lang === 'ka' ? m.name_ka : m.name_en}
        </h2>
        <span className="text-sm text-muted-foreground">{t('stats.total', { count: m.total })}</span>
        {m.favorites > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Heart className="size-4" />
            {m.favorites}
          </span>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {statusRows.length > 0 && (
          <Cut title={t('stats.byStatus')}>
            <StatusCut rows={statusRows} total={m.total} />
          </Cut>
        )}

        {m.has_months && (
          <Cut title={t('stats.byMonth', { year })}>
            <MonthsChart
              rows={m.months.map((row) => ({
                key: String(row.month),
                label: t(`stats.monthShort.${row.month}`),
                full: t(`stats.month.${row.month}`),
                value: row.count,
              }))}
            />
          </Cut>
        )}

        {m.genres.length > 0 && (
          <Cut title={t('stats.byGenre')}>
            <RankedBars rows={m.genres.map((g) => ({ key: String(g.id), label: named(g), value: g.count }))} />
          </Cut>
        )}

        {m.ratings.length > 0 && (
          <Cut title={t('stats.byRating')}>
            <ColumnChart
              rows={m.ratings.map((r) => ({ key: String(r.score), label: String(r.score), value: r.count }))}
            />
          </Cut>
        )}

        {m.years.length > 0 && (
          <Cut title={t('stats.byYear')}>
            <ColumnChart rows={m.years.map((y) => ({ key: String(y.year), label: String(y.year), value: y.count }))} />
          </Cut>
        )}
      </div>
    </section>
  )
}

/**
 * ⚠️ **სამ მოდულს სტატუსი ლექსიკონი არ აქვს** (§6.4) — წიგნს, თამაშსა და
 * ბორდგეიმს enum უწერიათ, ე.ი. მათ სახელს `ka.json` ინახავს. სივრცეები
 * ისტორიულია და არა გამოთვლადი (`board_game` → `boardGames`), ამიტომ
 * რუკაა და არა შეწებება.
 */
const ENUM_STATUS_NS: Record<string, string> = {
  book: 'books.statuses',
  game: 'games.statuses',
  board_game: 'boardGames.statuses',
}

function Cut({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

interface Row {
  key: string
  label: string
  value: number
  /** სრული სახელი ტულტიპისთვის, როცა ღერძზე შემოკლებულია */
  full?: string
  /** სტატუსის საკუთარი ფერი; უამისოდ მოდულის აქცენტი */
  tone?: string | null
}

/**
 * recharts-ის ტულტიპის payload — ჩვენი რიგი `payload`-შია.
 *
 * ⚠️ **გენერიკები ნაგულისხმევი უნდა დარჩეს** (`ValueType`/`NameType`) და არა
 * `<number, string>`: `content`-ის ტიპი უფრო ზოგადს ელოდება, ვიწრო კი
 * კონტრავარიანტულად აღარ ჯდება — `tsc` სწორედ ამაზე წითლდება.
 */
type Tip = TooltipContentProps<TooltipValueType, number | string>

function tipRow(props: Tip): Row | null {
  const entry = props.payload?.[0]

  return props.active && entry ? (entry.payload as Row) : null
}

/* ---------- სტატუსი: ნაწილი მთელთან ---------- */

/**
 * ⚠️ **ერთ სტატუსზე გრაფიკი არ იხატება.** ერთსექტორიანი დონატი (ისევე
 * როგორც ერთზოლიანი დიაგრამა) არაფერს ადარებს — რიცხვი თვითონაა პასუხი.
 *
 * ⚠️ **ექვსზე მეტ სტატუსზე დონატი ზოლებად იცვლება** — მჭიდრო სექტორები
 * ერთმანეთისგან აღარ განირჩევა და სწორედ იქ იწყება „ლამაზი, მაგრამ
 * წაუკითხავი" დიაგრამა.
 */
function StatusCut({ rows, total }: { rows: Row[]; total: number }) {
  const only = rows[0]

  if (rows.length === 1 && only) {
    return (
      <p className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums">{only.value}</span>
        <span className="text-sm text-muted-foreground">{only.label}</span>
      </p>
    )
  }

  if (rows.length > 6) return <RankedBars rows={rows} />

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-40 flex-1">
        <ChartFrame height={168}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="86%"
              /* ⚠️ სექტორებს შორის 2px **ზედაპირის** ღრეჭოა და არა ჩარჩო */
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell key={row.key} fill={row.tone ?? 'var(--mod)'} />
              ))}
            </Pie>
            <Tooltip
              content={(props: Tip) => {
                const row = tipRow(props)

                return row ? <ChartTip rows={[{ label: row.label, value: row.value, tone: row.tone }]} /> : null
              }}
            />
          </PieChart>
        </ChartFrame>
      </div>

      {/* ლეგენდა — ორ და მეტ სერიაზე იდენტობა მხოლოდ ფერით არ ითქმის */}
      <ul className="min-w-44 flex-1 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: row.tone ?? 'var(--mod)' }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.label}>
              {row.label}
            </span>
            <span className="tabular-nums">{row.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {total > 0 ? `${Math.round((row.value / total) * 100)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- ჟანრები: სიდიდე გრძელსახელიან კატეგორიებზე ---------- */

function RankedBars({ rows }: { rows: Row[] }) {
  const shown = rows.filter((r) => r.value > 0)

  if (!shown.length) return null

  /* სიმაღლე რიგების რაოდენობიდან — თორემ ათი ჟანრი ერთმანეთზე დაჯდებოდა */
  const height = Math.max(120, shown.length * 26 + 16)

  return (
    <ChartFrame height={height}>
      <BarChart data={shown} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => clipLabel(v)}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={(props: Tip) => {
            const row = tipRow(props)

            return row ? <ChartTip rows={[{ label: row.full ?? row.label, value: row.value, tone: row.tone }]} /> : null
          }}
        />
        <Bar dataKey="value" radius={BAR_RADIUS_X} barSize={12} isAnimationActive={false} label={VALUE_LABEL}>
          {shown.map((row) => (
            <Cell key={row.key} fill={row.tone ?? 'var(--mod)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

/**
 * რიცხვი ზოლის **გარეთ**, ბოლოში.
 *
 * ⚠️ ვიწრო ზოლში (12px) შიგნით მოთავსებული წარწერა აუცილებლად ჩაიჭრება —
 * ზუსტად ის შეცდომა, როცა პირველი ასო `overflow: hidden`-ს მიღმა რჩება.
 */
const VALUE_LABEL = {
  position: 'right' as const,
  fill: 'var(--muted-foreground)',
  fontSize: 11,
}

/* ---------- ქულები და წლები: განაწილება რიგობრივ ღერძზე ---------- */

function ColumnChart({ rows }: { rows: Row[] }) {
  if (!rows.length) return null

  return (
    <ChartFrame height={168}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={(props: Tip) => {
            const row = tipRow(props)

            return row ? <ChartTip title={row.full ?? row.label} rows={[{ label: row.label, value: row.value }]} /> : null
          }}
        />
        <Bar dataKey="value" radius={BAR_RADIUS_Y} fill="var(--mod)" maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  )
}

/* ---------- თვეები: დრო ---------- */

/**
 * ⚠️ **ნულოვანი თვე მაინც იხატება** — თორემ „ივლისში არაფერი" იმ თვისგან
 * ვერ განირჩეოდა, რომელიც სიაში საერთოდ არ იყო. სწორედ ამიტომ არის ეს
 * ჭრილი ხაზი და არა ზოლები: უწყვეტი ღერძი თვითონ ამბობს, რომ ნული
 * ნულია და არა „უცნობი".
 */
function MonthsChart({ rows }: { rows: Row[] }) {
  return (
    <ChartFrame height={168}>
      <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <defs>
          <linearGradient id="fb-months" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mod)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--mod)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip
          cursor={{ stroke: CHART_GRID }}
          content={(props: Tip) => {
            const row = tipRow(props)

            return row ? <ChartTip rows={[{ label: row.full ?? row.label, value: row.value }]} /> : null
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--mod)"
          strokeWidth={2}
          fill="url(#fb-months)"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
        />
      </AreaChart>
    </ChartFrame>
  )
}

/**
 * როლის ტონი — სტატუსს საკუთარი ფერი შეიძლება არ ჰქონდეს.
 *
 * ⚠️ **`lib/statuses.ts`-ის `statusTone()` აქ ვერ გამოდგება**: ის
 * Tailwind-ის **კლასებს** აბრუნებს (`lib/statusStyles.ts`), გრაფიკს კი
 * `fill`-ისთვის CSS-ის მნიშვნელობა სჭირდება.
 */
function roleTone(role: string | null): string | undefined {
  if (role === 'done') return 'var(--icon-ok)'
  if (role === 'doing') return 'var(--icon-info)'
  if (role === 'todo') return 'var(--status-undecided)'

  return undefined
}
