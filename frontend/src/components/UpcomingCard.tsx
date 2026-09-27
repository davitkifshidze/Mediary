import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { fetchUpcoming, type UpcomingEvent } from '@/api/upcoming'
import { useDateFormat } from '@/lib/dates'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   „მალე" — სტატისტიკის „კალენდრის" ჩანართი (FEAT-10 → Tasks §27.4).

   ⚠️ **დეშბორდიდან აქ გადმოვიდა** (Q18): მთავარზე მხოლოდ მიზნების ზოლი და
   მოდულების ბარათები რჩება. ⚠️ ფასი: თარიღიან ამბავს (ეპიზოდი, გამოსვლა,
   ჩანაწერის ვადა) მხოლოდ მაშინ დაინახავ, როცა სტატისტიკას გახსნი.

   ⚠️ **ცარიელზე ახლა `EmptyState` ჩანს** — დეშბორდზე ბლოკი ქრებოდა, რადგან
   ყოველდღიური „არაფერია" ხმაური იქნებოდა; ჩანართში კი ცარიელი ეკრანი
   „არ მუშაობს"-ად წაიკითხებოდა.

   ⚠️ **თარიღი `useDateFormat()`-ით იხატება** და არა `toLocaleDateString()`-ით —
   პროექტის წესი (`lib/dates.ts`): ფორმატი პარამეტრია და შვიდი ადგილი
   სხვადასხვა ენას მიჰყვებოდა.

   ⚠️ **„S05E03" აქ იგება და არა სერვერზე** — სერვერი ორ რიცხვს აბრუნებს,
   რადგან წარწერა ენაზეა დამოკიდებული და ორ ადგილას იარსებებდა.
   ============================================================ */

export function UpcomingCard() {
  const { t, i18n } = useTranslation()
  const { date } = useDateFormat()
  const { enabled } = useModules()

  const { data, isLoading } = useQuery({
    queryKey: ['upcoming'],
    queryFn: () => fetchUpcoming(),
    staleTime: 5 * 60_000,
  })

  const events = data?.data ?? []

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>

  if (events.length === 0) {
    return (
      <EmptyState icon={<CalendarClock className="size-6" />} title={t('upcoming.empty')} hint={t('upcoming.hint')} />
    )
  }

  const info = (key: string) => enabled.find((m) => m.key === key)

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
        <CalendarClock className="size-5 text-muted-foreground" />
        {t('upcoming.title')}
        <InfoHint info={t('upcoming.hint')} />
      </h2>

      <ul className="grid gap-2 sm:grid-cols-2">
        {events.map((event) => {
          const module = info(event.module)

          return (
            <li
              key={`${event.module}:${event.id}`}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-2.5"
              style={modAccent(module?.color) ?? MODULE_ACCENT_FALLBACK}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-4 [&>svg]:text-[var(--mod)]">
                <ModuleIcon name={module?.icon} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  <Target event={event} module={module?.route_base} />
                </span>
                <span className="block text-xs text-muted-foreground">
                  {module ? moduleName(module, i18n.language) : event.module}
                  {episodeLabel(event) ? ` · ${episodeLabel(event)}` : ''}
                </span>
              </span>

              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{date(event.date)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * სათაური — ბმული იქ, სადაც ჩანაწერს საკუთარი გვერდი აქვს.
 *
 * ⚠️ **ჩანიშვნა და თამაში მოდალში იხსნება** (მათ URL არ აქვთ), ე.ი. ბმული
 * სექციაზე მიდის და არა ჩანაწერზე — `resultPath()`-ის იგივე წესი, რაც
 * ძებნის შედეგებს აქვს.
 */
function Target({ event, module }: { event: UpcomingEvent; module?: string | null }) {
  if (!module) return <>{event.title}</>

  const base = `/${module.replace(/^\//, '')}`
  const href = event.module === 'series' || event.module === 'anime' ? `${base}/${event.id}` : base

  return (
    <Link to={href} className="hover:text-primary">
      {event.title}
    </Link>
  )
}

function episodeLabel(event: UpcomingEvent): string {
  if (event.season == null || event.episode == null) return ''

  return `S${String(event.season).padStart(2, '0')}E${String(event.episode).padStart(2, '0')}`
}
