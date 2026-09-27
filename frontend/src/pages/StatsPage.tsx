import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChartColumn, Heart } from 'lucide-react'
import { fetchStats, type StatModule, type StatNamed, type StatsMedia, type StatStatus } from '@/api/stats'
import { seriesVars } from '@/lib/chartColors'
import { enumStatusKey, statusFill } from '@/lib/statuses'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { ModuleIcon } from '@/components/ModuleIcon'
import { UpcomingCard } from '@/components/UpcomingCard'
import {
  ActorGrid,
  Cut,
  Legend,
  StackedBars,
  StackedColumns,
  StackedShare,
  YearLine,
  type Series,
  type ShareSegment,
  type StackRow,
} from '@/components/stats/StatsCharts'
import { CutTabs, type CutOption } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   სტატისტიკა (FEAT-08 → Tasks §28, თავიდან).

   შენი სიტყვები: „სტატისტიკის გვერდი სრულად განაახლე — მაგალითად, ფილმებისა
   და სერიალების გრაფიკები ძალიან არ მომწონს". Q19-ით არ მოგეწონა ოთხივე:
   ფორმა (სტატუსის რგოლი, თვეების ფართობი), ფერი (ერთი ტონი), სიმჭიდროვე
   (ბევრი პატარა გრაფიკი ერთ გრძელ გვერდზე) და სამი ერთნაირი ბლოკი.

   ⚠️ **ჩანართები** (§28.1): „კალენდარი" (პირველი — დეშბორდის „მალე") ·
   „მედია" (ფილმი, სერიალი და ანიმე **ერთად**) · დანარჩენი მოდულები თითო
   ჩანართად — მხოლოდ ჩართული და მონაცემიანი. თითო ჩანართში ცოტა, მაგრამ
   დიდი გრაფიკი.

   ⚠️ **მედიის ჩანართის თავში Q20-ის სამი კითხვა, ამ რიგით**: რა ჟანრებს
   ვუყურებ · ვინ არის ჩემი ყველაზე ხშირი მსახიობი · როდის ვუყურებ; ქვემოთ
   სტატუსები და ქულები. ⚠️ „შენი ქულით საუკეთესო ათეული" **არ არის** —
   მედიას პირადი შეფასება არ აქვს (`rating` TMDB-ისაა).

   ⚠️ **წელი და ჩანართი URL-შია** (`?year=`, `?tab=`) — გვერდის გაზიარება და
   ბრაუზერის „უკან" უნდა მუშაობდეს. წლის ამრჩევი კალენდარზე არ ჩანს.
   ============================================================ */

const MEDIA_KEYS = ['movie', 'series', 'anime']

export function StatsPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [params, setParams] = useSearchParams()

  const year = Number(params.get('year')) || undefined

  const { data, isLoading } = useQuery({
    queryKey: ['stats', year ?? 'auto'],
    queryFn: () => fetchStats(year),
    staleTime: 60_000,
  })

  const modules = (data?.data ?? []).filter((m) => m.total > 0)
  const media = modules.filter((m) => MEDIA_KEYS.includes(m.key))
  const others = modules.filter((m) => !MEDIA_KEYS.includes(m.key))

  const tabs: CutOption[] = [
    { key: 'calendar', label: t('stats.tabs.calendar') },
    ...(media.length > 0 && data?.media ? [{ key: 'media', label: t('stats.tabs.media') }] : []),
    ...others.map((m) => ({
      key: m.key,
      label: lang === 'ka' ? m.name_ka : m.name_en,
      color: m.color,
      node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />,
    })),
  ]

  const requested = params.get('tab') ?? 'calendar'
  // ⚠️ უცნობი/გამქრალი ჩანართი (მოდული გამოირთო, ცარიელი დარჩა) კალენდარზე ბრუნდება
  const tab = tabs.some((o) => o.key === requested) ? requested : 'calendar'

  // ⚠️ ერთი პარამეტრის შეცვლა მეორეს არ შლის (წელი ჩანართზე გადასვლისას რჩება)
  const setParam = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set(key, value)
      return next
    })

  const selectedYear = data?.year ?? new Date().getFullYear()

  return (
    <PageContainer>
      <PageHeader
        tool="stats"
        title={t('stats.title')}
        hint={t('stats.hint')}
        actions={
          tab !== 'calendar' &&
          (data?.years.length ?? 0) > 0 && (
            <Select value={String(data?.year ?? '')} onValueChange={(v) => setParam('year', v)}>
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

      <div className="mb-6">
        <CutTabs layout="inline" value={tab} onChange={(key) => setParam('tab', key)} options={tabs} />
      </div>

      {tab === 'calendar' ? (
        <UpcomingCard />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !modules.length ? (
        <EmptyState icon={<ChartColumn className="size-6" />} title={t('stats.empty')} hint={t('stats.emptyHint')} />
      ) : tab === 'media' && data?.media ? (
        <MediaStats media={data.media} modules={media} year={selectedYear} lang={lang} />
      ) : (
        (() => {
          const m = others.find((x) => x.key === tab)
          return m ? <ModuleStats module={m} year={selectedYear} lang={lang} /> : null
        })()
      )}
    </PageContainer>
  )
}

/* ============================================================
   „მედია" — ფილმი, სერიალი და ანიმე ერთ შედარებაში (§28.2).
   ============================================================ */

function MediaStats({
  media,
  modules,
  year,
  lang,
}: {
  media: StatsMedia
  modules: StatModule[]
  year: number
  lang: string
}) {
  const { t } = useTranslation()

  // ⚠️ სერიების რიგი სერვერისაა (`domains`); ფერი — მოდულის (`modules.color`)
  const ordered = media.domains
    .map((key) => modules.find((m) => m.key === key))
    .filter((m): m is StatModule => Boolean(m))
  const series: Series[] = ordered.map((m) => ({ key: m.key, label: lang === 'ka' ? m.name_ka : m.name_en }))
  const vars = seriesVars(ordered.map((m) => m.color))

  const genreRows: StackRow[] = media.genres.map((g) => ({
    key: String(g.id),
    label: named(g, lang, t('stats.other')),
    ...g.by,
  }))

  const monthRows: StackRow[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const row: StackRow = { key: String(month), label: t(`stats.monthShort.${month}`), full: t(`stats.month.${month}`) }
    ordered.forEach((m) => {
      row[m.key] = m.months.find((x) => x.month === month)?.count ?? 0
    })
    return row
  })

  // TMDB-ის ქულები 1…10 — დომენებად
  const ratingRows: StackRow[] = Array.from({ length: 10 }, (_, i) => {
    const score = i + 1
    const row: StackRow = { key: String(score), label: String(score) }
    ordered.forEach((m) => {
      row[m.key] = m.ratings.find((r) => r.score === score)?.count ?? 0
    })
    return row
  })
  const hasRatings = ordered.some((m) => m.ratings.length > 0)

  return (
    <div className="fb-series space-y-4" style={vars}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <YearLine year={year} thisYear={media.this_year} lastYear={media.last_year} />
        <Legend series={series} />
      </div>

      {/* (1) რა ჟანრებს ვუყურებ */}
      {genreRows.length > 0 && (
        <Cut title={t('stats.mediaGenres')}>
          <StackedBars rows={genreRows} series={series} />
        </Cut>
      )}

      {/* (2) ვინ არის ჩემი ყველაზე ხშირი მსახიობი */}
      <Cut title={t('stats.mediaActors')}>
        <ActorGrid
          actors={media.actors.map((a) => ({
            id: a.id,
            name: (lang === 'ka' ? a.name_ka : null) || a.name,
            photo: a.photo_path,
            count: a.count,
            by: series.map((s, index) => ({ label: s.label, value: a.by[s.key] ?? 0, index })),
          }))}
        />
      </Cut>

      {/* (3) როდის ვუყურებ — ხელახლა ნახვაც ითვლება (`media_watches`) */}
      <Cut title={t('stats.mediaMonths', { year })}>
        <StackedColumns rows={monthRows} series={series} />
      </Cut>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cut title={t('stats.byStatus')}>
          <div className="space-y-5">
            {ordered.map((m) => (
              <DomainStatus key={m.key} module={m} lang={lang} />
            ))}
          </div>
        </Cut>

        {hasRatings && (
          <Cut title={t('stats.byRating')}>
            <StackedColumns rows={ratingRows} series={series} height={220} />
          </Cut>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   ერთი მოდულის ჩანართი.
   ============================================================ */

function ModuleStats({ module: m, year, lang }: { module: StatModule; year: number; lang: string }) {
  const { t } = useTranslation()
  const name = lang === 'ka' ? m.name_ka : m.name_en
  const series: Series[] = [{ key: 'count', label: name }]
  const vars = seriesVars([m.color])

  const monthRows: StackRow[] = m.months.map((row) => ({
    key: String(row.month),
    label: t(`stats.monthShort.${row.month}`),
    full: t(`stats.month.${row.month}`),
    count: row.count,
  }))
  const genreRows: StackRow[] = m.genres.map((g) => ({ key: String(g.id), label: named(g, lang, t('stats.other')), count: g.count }))
  const ratingRows: StackRow[] = m.ratings.map((r) => ({ key: String(r.score), label: String(r.score), count: r.count }))
  const yearRows: StackRow[] = m.years.map((y) => ({ key: String(y.year), label: String(y.year), count: y.count }))
  const statusLabel = useStatusLabel(m.key, lang)
  const segments = statusSegments(m.key, m.status, statusLabel)

  return (
    <div className="fb-series space-y-4" style={{ ...vars, ...(modAccent(m.color) ?? MODULE_ACCENT_FALLBACK) }}>
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
          <ModuleIcon name={m.icon} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">{name}</h2>
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            {t('stats.total', { count: m.total })}
            {m.favorites > 0 && (
              <span className="flex items-center gap-1">
                <Heart className="size-4" />
                {m.favorites}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto">
          <YearLine year={year} thisYear={m.this_year} lastYear={m.last_year} />
        </div>
      </header>

      {m.has_months && (
        <Cut title={t('stats.byMonth', { year })}>
          <StackedColumns rows={monthRows} series={series} />
        </Cut>
      )}

      {genreRows.length > 0 && (
        <Cut title={t('stats.byGenre')}>
          <StackedBars rows={genreRows} series={series} />
        </Cut>
      )}

      {(segments.length > 0 || ratingRows.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {segments.length > 0 && (
            <Cut title={t('stats.byStatus')}>
              <StackedShare segments={segments} />
            </Cut>
          )}
          {ratingRows.length > 0 && (
            <Cut title={t('stats.byRating')}>
              <StackedColumns rows={ratingRows} series={series} height={220} />
            </Cut>
          )}
        </div>
      )}

      {yearRows.length > 0 && (
        <Cut title={t('stats.byYear')}>
          <StackedColumns rows={yearRows} series={series} height={220} />
        </Cut>
      )}
    </div>
  )
}

/** მედიის ჩანართის ერთი დომენის სტატუსის ზოლი — hook ციკლში ვერ გამოიძახება */
function DomainStatus({ module: m, lang }: { module: StatModule; lang: string }) {
  const { t } = useTranslation()
  const label = useStatusLabel(m.key, lang)

  return (
    <StackedShare
      segments={statusSegments(m.key, m.status, label)}
      label={
        <p className="flex items-center gap-2 text-sm font-medium">
          <ModuleIcon name={m.icon} className="size-4 text-muted-foreground" />
          {lang === 'ka' ? m.name_ka : m.name_en}
          <span className="text-xs font-normal text-muted-foreground">{t('stats.total', { count: m.total })}</span>
        </p>
      }
    />
  )
}

/* ---------- დამხმარეები ---------- */

function named(row: StatNamed, lang: string, other: string): string {
  return (lang === 'ka' ? row.name_ka : row.name_en) || row.name_en || row.name_ka || other
}

/**
 * სტატუსის ზოლის სეგმენტები — ფერი **ბეჯის ტონია** (`statusFill`), ე.ი.
 * სტატისტიკის „ნანახი" იმავე მწვანეშია, რაც ჩანაწერზე.
 *
 * ⚠️ სახელს გამომძახებელი აწვდის (`label`) — `t`-ს ტიპი პარამეტრად ვერ
 * გადაეცემა (i18next-ის ოვერლოადები).
 */
function statusSegments(module: string, rows: StatStatus[], label: (s: StatStatus) => string): ShareSegment[] {
  return rows.map((s) => ({
    key: s.key ?? '—',
    label: label(s),
    value: s.count,
    tone: statusFill(module, s.key, s.role),
  }))
}

/** სტატუსის სახელი — ლექსიკონიდან, enum-ზე i18n-იდან */
function useStatusLabel(module: string, lang: string) {
  const { t } = useTranslation()

  return (s: StatStatus) => {
    const own = lang === 'ka' ? s.name_ka : s.name_en
    if (own) return own

    const key = s.key ? enumStatusKey(module, s.key) : null

    return key ? t(key, { defaultValue: s.key ?? '—' }) : (s.key ?? '—')
  }
}
