import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChartColumn, Heart } from 'lucide-react'
import { fetchStats, type StatModule, type StatNamed } from '@/api/stats'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   სტატისტიკა (FEAT-08) — 19.10-ის „მოგვიანებით".

   ⚠️ **გრაფიკების ბიბლიოთეკა არ დამატებულა.** recharts ≈100 kB gzip-ია,
   ე.ი. ორჯერ იმდენი, რამდენზეც ამ პროექტმა dnd-kit-ზე უარი თქვა (40 kB),
   და სამივე ჭრილი, რაც აქ გვჭირდება, **ჰორიზონტალური ზოლია** — ეს კი
   ერთი `div` და ერთი `width: %`-ია. ღირებულება რიცხვშია და არა ღერძებში.

   ⚠️ **ყველა ზოლი ერთ მაქსიმუმზე ნორმდება ჭრილის შიგნით** და არა
   გლობალურად: „რა ჭარბობს ამ ჭრილში" კითხვაა, ხოლო ერთი გლობალური
   მასშტაბი პატარა მოდულის ყველა ზოლს ხაზად აქცევდა.

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
        {m.status.length > 0 && (
          <Cut title={t('stats.byStatus')}>
            <Bars
              rows={m.status.map((s) => ({
                key: s.key ?? '—',
                // enum-იან მოდულებს ლექსიკონი არ აქვთ — სახელი i18n-შია
                label: (lang === 'ka' ? s.name_ka : s.name_en) || enumStatus(s.key),
                value: s.count,
                tone: s.color ?? roleTone(s.role),
              }))}
            />
          </Cut>
        )}

        {m.has_months && (
          <Cut title={t('stats.byMonth', { year })}>
            <Bars
              rows={m.months.map((row) => ({
                key: String(row.month),
                label: t(`stats.month.${row.month}`),
                value: row.count,
              }))}
              /* ⚠️ ნულოვანი თვე მაინც იხატება — თორემ „ივლისში არაფერი"
                 იმ თვისგან ვერ განირჩეოდა, რომელიც სიაში არ იყო. */
              keepZeroes
            />
          </Cut>
        )}

        {m.genres.length > 0 && (
          <Cut title={t('stats.byGenre')}>
            <Bars rows={m.genres.map((g) => ({ key: String(g.id), label: named(g), value: g.count }))} />
          </Cut>
        )}

        {m.ratings.length > 0 && (
          <Cut title={t('stats.byRating')}>
            <Bars rows={m.ratings.map((r) => ({ key: String(r.score), label: String(r.score), value: r.count }))} />
          </Cut>
        )}

        {m.years.length > 0 && (
          <Cut title={t('stats.byYear')}>
            <Bars rows={m.years.map((y) => ({ key: String(y.year), label: String(y.year), value: y.count }))} />
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
  /** სტატუსის საკუთარი ფერი; უამისოდ მოდულის აქცენტი */
  tone?: string | null
}

function Bars({ rows, keepZeroes }: { rows: Row[]; keepZeroes?: boolean }) {
  const shown = keepZeroes ? rows : rows.filter((r) => r.value > 0)
  const max = Math.max(1, ...shown.map((r) => r.value))

  if (!shown.length) return null

  return (
    <ul className="space-y-1">
      {shown.map((row) => (
        <li key={row.key} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={row.label}>
            {row.label}
          </span>
          <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
            <span
              className="block h-full rounded-md"
              style={{
                width: `${Math.round((row.value / max) * 100)}%`,
                background: row.tone ?? 'var(--mod)',
              }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums">{row.value}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * როლის ტონი — სტატუსს საკუთარი ფერი შეიძლება არ ჰქონდეს.
 *
 * ⚠️ **`lib/statuses.ts`-ის `statusTone()` აქ ვერ გამოდგება**: ის
 * Tailwind-ის **კლასებს** აბრუნებს (`lib/statusStyles.ts`), ზოლს კი
 * `background`-ისთვის CSS-ის მნიშვნელობა სჭირდება.
 */
function roleTone(role: string | null): string | undefined {
  if (role === 'done') return 'var(--icon-ok)'
  if (role === 'doing') return 'var(--icon-info)'
  if (role === 'todo') return 'var(--status-undecided)'
  return undefined
}
