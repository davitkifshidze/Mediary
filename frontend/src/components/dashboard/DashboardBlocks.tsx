import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellRing, CalendarClock, CalendarDays, History, PlayCircle, type LucideIcon } from 'lucide-react'
import { fetchContinuing, fetchRecent, type FeedCard } from '@/api/dashboard'
import { fetchDutyShifts } from '@/api/duty'
import { fetchAllNoteReminders } from '@/api/notes'
import { fetchSoon, type SoonItem } from '@/api/soon'
import { storageUrl } from '@/lib/api'
import { todayLocal, useDateFormat } from '@/lib/dates'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { recordOpenPath } from '@/lib/recordLinks'
import { useContentLang } from '@/lib/settings'
import { ModuleIcon } from '@/components/ModuleIcon'
import { buttonVariants } from '@/components/ui/button'

/* ============================================================
   **მთავარი გვერდის არჩევითი ბლოკები** — „ვაგრძელებ", „ბოლოს დამატებული", „მალე",
   „შეხსენებები", „მორიგეობა ამ კვირაში".

   ⚠️ **თითო ბლოკი თავის მოთხოვნას აკეთებს** და მხოლოდ მაშინ, როცა გვერდზეა
   (გამორთული ბლოკი საერთოდ არ მონტირდება): მთავარი გვერდის ჯამი ოთხ query-ზეა
   დაჭერილი და აქაური მონაცემი იქ ვერ ჩაეტეოდა.
   ⚠️ **ცარიელი ბლოკი იმალება** — „არაფერია" ხუთჯერ ერთ გვერდზე ხმაურია; რედაქტირების
   რეჟიმში ბლოკი მაინც სიაშია და ჩანს, რომ ჩართულია.
   ============================================================ */

/** ბლოკის საერთო ჩარჩო: სათაური, „ყველა →" და შიგთავსი */
function Block({ icon: Icon, title, to, more, children, testId }: { icon: LucideIcon; title: string; to?: string; more?: string; children: ReactNode; testId: string }) {
  return (
    <section aria-label={title} className="h-full rounded-md border border-border bg-card p-4" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </h2>
        {to && more && (
          <Link to={to} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {more}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/* ---------- „ვაგრძელებ" და „ბოლოს დამატებული": ჩანაწერების ზოლი ---------- */

function FeedList({ cards }: { cards: FeedCard[] }) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { all } = useModules()

  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="feed-list">
      {cards.map((card) => {
        const module = all.find((m) => m.key === card.module)
        const title = (lang === 'ka' ? card.title_ka : card.title) || card.title || card.title_ka || `#${card.id}`
        const href = recordOpenPath({ kind: card.module, id: card.id, title: card.title ?? card.title_ka }, module?.route_base)
        const photo = storageUrl(card.photo)
        const body = (
          <>
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
              {photo ? <img src={photo} alt="" loading="lazy" className="size-full object-cover" /> : <ModuleIcon name={module?.icon} className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{module ? moduleName(module, i18n.language) : card.module}</span>
            </span>
          </>
        )
        const className = 'flex items-center gap-3 rounded-md border border-border bg-background p-2'

        return (
          <li key={`${card.module}:${card.id}`} style={modAccent(module?.color) ?? MODULE_ACCENT_FALLBACK}>
            {href ? (
              <Link to={href} className={className} data-testid="feed-card">
                {body}
              </Link>
            ) : (
              <span className={className} data-testid="feed-card">
                {body}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function ContinueBlock() {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: ['dashboard', 'continuing'], queryFn: fetchContinuing })

  if (!data?.length) return null

  return (
    <Block icon={PlayCircle} title={t('dashboard.blocks.continue')} testId="block-continue">
      <FeedList cards={data} />
    </Block>
  )
}

export function RecentBlock() {
  const { t } = useTranslation()
  const { data } = useQuery({ queryKey: ['dashboard', 'recent'], queryFn: fetchRecent })

  if (!data?.length) return null

  return (
    <Block icon={History} title={t('dashboard.blocks.recent')} testId="block-recent">
      <FeedList cards={data} />
    </Block>
  )
}

/* ---------- „მალე": რაც ჩემი ბიბლიოთეკიდან მალე გამოდის ---------- */

const SOON_DOMAINS = ['movie', 'series', 'anime'] as const

/** მალე გამომავალი — მოდულების მიხედვით ერთ რიგში, უახლოესი პირველი */
export function SoonBlock() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date } = useDateFormat()
  const { all, has } = useModules()
  const modules = all.filter((m) => (SOON_DOMAINS as readonly string[]).includes(m.key) && has(m.key))

  const { data } = useQuery({
    queryKey: ['dashboard', 'soon', modules.map((m) => m.key).join(',')],
    queryFn: async () => {
      const lists = await Promise.all(modules.map((m) => fetchSoon(m.api_base).then((items) => items.map((item) => ({ item, module: m })))))
      return lists
        .flat()
        .filter((row) => row.item.date)
        .sort((a, b) => (a.item.date ?? '').localeCompare(b.item.date ?? ''))
        .slice(0, 6)
    },
    enabled: modules.length > 0,
  })

  if (!data?.length) return null

  const label = (item: SoonItem) => (lang === 'ka' ? item.title_ka : item.title_en) || item.title_en || item.title_ka || `#${item.id}`

  return (
    <Block icon={CalendarClock} title={t('dashboard.blocks.soon')} testId="block-soon">
      <ul className="space-y-1.5">
        {data.map(({ item, module }) => (
          <li key={`${module.key}:${item.id}`} style={modAccent(module.color) ?? MODULE_ACCENT_FALLBACK}>
            <Link to={`${module.route_base}/${item.id}`} className="flex items-center gap-3 rounded-md border border-border bg-background px-2.5 py-2 text-sm" data-testid="soon-row">
              <ModuleIcon name={module.icon} className="size-4 shrink-0 text-[var(--mod)]" />
              <span className="min-w-0 flex-1 truncate font-medium">{label(item)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {item.days === 0 ? t('dashboard.soonToday') : item.date ? date(item.date) : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  )
}

/* ---------- „შეხსენებები": უახლოესი აქტიური შეხსენებები ---------- */

export function RemindersBlock() {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const { data } = useQuery({ queryKey: ['dashboard', 'reminders'], queryFn: fetchAllNoteReminders })

  const upcoming = (data ?? [])
    .filter((r) => r.is_active && r.next_at)
    .sort((a, b) => (a.next_at ?? '').localeCompare(b.next_at ?? ''))
    .slice(0, 5)

  if (!upcoming.length) return null

  return (
    <Block icon={BellRing} title={t('dashboard.blocks.reminders')} to="/notes/reminders" more={t('dashboard.all')} testId="block-reminders">
      <ul className="space-y-1.5">
        {upcoming.map((reminder) => (
          <li key={reminder.id}>
            <Link
              to={recordOpenPath({ kind: 'note', id: reminder.note_entry_id, title: reminder.note?.title ?? null }, '/notes') ?? '/notes/reminders'}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              data-testid="reminder-row"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{reminder.note?.title ?? `#${reminder.note_entry_id}`}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{dateTime(reminder.next_at!)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  )
}

/* ---------- „მორიგეობა ამ კვირაში" ---------- */

/** მიმდინარე კვირის ორშაბათი და კვირა (`Y-m-d`), ბრაუზერის ადგილობრივი დღით */
export function weekRange(today: string = todayLocal()): { from: string; to: string } {
  const [y, m, d] = today.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const offset = (day.getDay() + 6) % 7
  const iso = (shift: number) => {
    const at = new Date(y, m - 1, d - offset + shift)
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  }

  return { from: iso(0), to: iso(6) }
}

export function DutyWeekBlock() {
  const { t, i18n } = useTranslation()
  const { date } = useDateFormat()
  const range = weekRange()
  const { data } = useQuery({ queryKey: ['dashboard', 'duty', range.from], queryFn: () => fetchDutyShifts(range) })

  // გაუქმებული მორიგეობა არსად ითვლება
  const shifts = (data?.items ?? []).filter((shift) => shift.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date))

  if (!shifts.length) return null

  return (
    <Block icon={CalendarDays} title={t('dashboard.blocks.duty')} to="/duty" more={t('dashboard.all')} testId="block-duty">
      <ul className="space-y-1.5">
        {shifts.map((shift) => (
          <li key={shift.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-2.5 py-2 text-sm" data-testid="duty-row">
            <span className="shrink-0 font-medium tabular-nums">{date(shift.date)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {[shift.type ? (i18n.language === 'ka' ? shift.type.name_ka : shift.type.name_en) : null, shift.workplace?.short || shift.workplace?.name]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {shift.start_time && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {shift.start_time}
                {shift.end_time ? `–${shift.end_time}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Block>
  )
}
