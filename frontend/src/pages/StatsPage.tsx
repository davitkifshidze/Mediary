import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChartColumn, Heart } from 'lucide-react'
import { fetchStats, type StatModule, type StatNamed, type StatStatus } from '@/api/stats'
import { seriesVars } from '@/lib/chartColors'
import { enumStatusKey, statusFill } from '@/lib/statuses'
import { MODULE_ACCENT_FALLBACK, isMediaKey, modAccent, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { genreLink, monthLink, ratingLink, statusLink, yearLink } from '@/lib/statsLinks'
import { ModuleIcon } from '@/components/ModuleIcon'
import {
  ActorGrid,
  Cut,
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
import { QueryErrorState } from '@/components/ui/query-error-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   სტატისტიკა.

   შენი სიტყვები: „სტატისტიკის გვერდი სრულად განაახლე — მაგალითად, ფილმებისა
   და სერიალების გრაფიკები ძალიან არ მომწონს". არ მოგეწონა ოთხივე:
   ფორმა (სტატუსის რგოლი, თვეების ფართობი), ფერი (ერთი ტონი), სიმჭიდროვე
   (ბევრი პატარა გრაფიკი ერთ გრძელ გვერდზე) და სამი ერთნაირი ბლოკი.

   ⚠️ **ჩანართი თითო მოდულია, ფილმი, სერიალი და ანიმე ცალ-ცალკე**:
   „კალენდარი" (მომავალი ეპიზოდები და ვადები) და საერთო „მედია"
   გაქრა; მედიის კითხვები (რა ჟანრებს ვუყურებ · ვინ არის ჩემი ყველაზე ხშირი
   მსახიობი · როდის ვუყურებ) თითო მედია-ჩანართშია. ნაგულისხმევი — პირველი.
   ქულები **შენია** — მედიაზე `my_rating`, TMDB-ის საშუალო არ ითვლება.

   ⚠️ **ყველაფერი დაჭერადია**: ზოლი, სეგმენტი და ლეგენდა
   შესაბამის სიას ხსნის შესაბამისი ფილტრით (`lib/statsLinks.ts`), მსახიობი —
   მის გვერდს.

   ⚠️ **წელი და ჩანართი URL-შია** (`?year=`, `?tab=`) — გვერდის გაზიარება და
   ბრაუზერის „უკან" უნდა მუშაობდეს.
   ============================================================ */

export function StatsPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [params, setParams] = useSearchParams()

  const year = Number(params.get('year')) || undefined

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['stats', year ?? 'auto'],
    queryFn: () => fetchStats(year),
    staleTime: 60_000,
  })

  const modules = (data?.data ?? []).filter((m) => m.total > 0)

  const tabs: CutOption[] = modules.map((m) => ({
    key: m.key,
    label: lang === 'ka' ? m.name_ka : m.name_en,
    color: m.color,
    node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />,
  }))

  // ⚠️ უცნობი/გამქრალი ჩანართი (მოდული გამოირთო, ცარიელი დარჩა) პირველზე ბრუნდება
  const requested = params.get('tab')
  const tab = tabs.some((o) => o.key === requested) ? requested : (tabs[0]?.key ?? null)

  // ⚠️ ერთი პარამეტრის შეცვლა მეორეს არ შლის (წელი ჩანართზე გადასვლისას რჩება)
  const setParam = (key: string, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set(key, value)
      return next
    })

  const selectedYear = data?.year ?? new Date().getFullYear()
  const module = modules.find((m) => m.key === tab)

  return (
    <PageContainer>
      <PageHeader
        tool="stats"
        title={t('stats.title')}
        hint={t('stats.hint')}
        actions={
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

      {tabs.length > 0 && (
        <div className="mb-6">
          <CutTabs layout="inline" value={tab ?? ''} onChange={(key) => setParam('tab', key)} options={tabs} />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : isError ? (
        /* სერვერის ვარდნა ≠ „ჯერ არაფერია დასათვლელი" */
        <QueryErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : !module ? (
        <EmptyState icon={<ChartColumn className="size-6" />} title={t('stats.empty')} hint={t('stats.emptyHint')} />
      ) : (
        <ModuleStats key={module.key} module={module} year={selectedYear} lang={lang} />
      )}
    </PageContainer>
  )
}

/* ============================================================
   ერთი მოდულის ჩანართი.
   ============================================================ */

function ModuleStats({ module: m, year, lang }: { module: StatModule; year: number; lang: string }) {
  const { t } = useTranslation()
  const { all } = useModules()
  const name = lang === 'ka' ? m.name_ka : m.name_en
  const series: Series[] = [{ key: 'count', label: name }]
  const vars = seriesVars([m.color])
  const media = isMediaKey(m.key)

  /* ბმული მოდულის სიაზე; მარშრუტი მოდულების სიიდანაა (`route_base`).
     ⚠️ `?? undefined` — `StackRow`-ის `to` ცარიელი შეიძლება იყოს, `null` კი არა. */
  const route = all.find((x) => x.key === m.key)?.route_base ?? null
  const to = (build: (route: string) => string | null) => (route ? (build(route) ?? undefined) : undefined)

  const monthRows: StackRow[] = m.months.map((row) => ({
    key: String(row.month),
    label: t(`stats.monthShort.${row.month}`),
    full: t(`stats.month.${row.month}`),
    count: row.count,
    to: row.count ? to((r) => monthLink(m.key, r, year, row.month)) : undefined,
  }))
  const genreRows: StackRow[] = m.genres.map((g) => ({
    key: String(g.id),
    label: named(g, lang, t('stats.other')),
    count: g.count,
    to: to((r) => genreLink(m.key, r, g)),
  }))
  const ratingRows: StackRow[] = m.ratings.map((r) => ({
    key: String(r.score),
    label: String(r.score),
    count: r.count,
    to: to((base) => ratingLink(m.key, base, r.score)),
  }))
  const yearRows: StackRow[] = m.years.map((y) => ({
    key: String(y.year),
    label: String(y.year),
    count: y.count,
    to: to((r) => yearLink(m.key, r, y.year)),
  }))
  const statusLabel = useStatusLabel(m.key, lang)
  const segments = statusSegments(m.key, m.status, statusLabel, route)

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

      {/* მედიაზე სამი კითხვა ამ რიგით: ჟანრები · მსახიობები · თვეები */}
      {genreRows.length > 0 && (
        <Cut title={t(media ? 'stats.mediaGenres' : 'stats.byGenre')}>
          <StackedBars rows={genreRows} series={series} />
        </Cut>
      )}

      {media && (
        <Cut title={t('stats.mediaActors')}>
          <ActorGrid
            actors={m.actors.map((a) => ({
              id: a.id,
              name: (lang === 'ka' ? a.name_ka : null) || a.name,
              photo: a.photo_path,
              count: a.count,
              by: [],
            }))}
          />
        </Cut>
      )}

      {m.has_months && (
        <Cut title={t(media ? 'stats.mediaMonths' : 'stats.byMonth', { year })}>
          <StackedColumns rows={monthRows} series={series} />
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

/* ---------- დამხმარეები ---------- */

function named(row: StatNamed, lang: string, other: string): string {
  return (lang === 'ka' ? row.name_ka : row.name_en) || row.name_en || row.name_ka || other
}

/**
 * სტატუსის ზოლის სეგმენტები — ფერი **ბეჯის ტონია** (`statusFill`), ე.ი.
 * სტატისტიკის „ნანახი" იმავე მწვანეშია, რაც ჩანაწერზე; სეგმენტი იმ
 * სტატუსის სიას ხსნის.
 *
 * ⚠️ სახელს გამომძახებელი აწვდის (`label`) — `t`-ს ტიპი პარამეტრად ვერ
 * გადაეცემა (i18next-ის ოვერლოადები).
 */
function statusSegments(module: string, rows: StatStatus[], label: (s: StatStatus) => string, route: string | null): ShareSegment[] {
  return rows.map((s) => ({
    key: s.key ?? '—',
    label: label(s),
    value: s.count,
    tone: statusFill(module, s.key, s.role, s.color),
    to: route ? statusLink(module, route, s) : null,
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
