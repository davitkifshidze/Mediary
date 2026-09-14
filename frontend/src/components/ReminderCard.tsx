import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  BellOff,
  BellRing,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  Hourglass,
  Pencil,
  Repeat,
  Send,
  Sun,
  Timer,
  Trash2,
} from 'lucide-react'
import type { NoteReminder, ReminderChannel, ReminderMode } from '@/api/notes'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useDateFormat } from '@/lib/dates'
import { reminderState, type ReminderState } from '@/lib/reminders'
import { cn } from '@/lib/utils'

/* ============================================================
   **შეხსენების ბარათი — ერთი ვიზუალი ორ ადგილას (ეტაპი 11.1 → 11.2).**

   ჩანაწერის ფანჯარაშიც (`NoteReminders`) და შეხსენებების საერთო გვერდზეც
   (`/notes/reminders`) ერთი და იგივე ბარათია. ⚠️ ორი ასლი ერთ კვირაში
   გაშორდებოდა — ერთს „არხის ხატულა" დაემატებოდა, მეორეს არა.

   რას ამბობს ბარათი, ზემოდან ქვემოთ:
   1. **მარცხენა ზოლი** — მდგომარეობა ტექსტის წაკითხვამდე ჩანს;
   2. **რეჟიმის ხატულა** — „რა სახისაა" ერთი შეხედვით;
   3. **განრიგი** მსხვილად;
   4. **ერთი ყველაზე საჭირო ფაქტი ცალკე ხაზზე** — „3 საათში · 14.09.2026 09:00";
   5. წვრილი მეტა-ნიშნები — არხი, ჯერადობა, ფანჯარა (და საერთო გვერდზე —
      **რომელ ჩანაწერს ეკუთვნის**).

   ⚠️ ადრე ეს ყველაფერი ერთ სტრიქონში იყო „·"-ებით გადაბმული და ვერაფერი იკითხებოდა.
   ============================================================ */

/** ადამიანური აღწერა — ერთი წყარო სიისთვისაც და ბარათისთვისაც */
function reminderLabel(reminder: NoteReminder, t: TFunction, dateTime: (v: string) => string): string {
  // ⚠️ ეტაპი 7 — დროებიც და რიცხვებიც **სიებია**; ერთწევრიანი ძველივით იკითხება
  const at = reminder.times_of_day.join(', ')
  const days = reminder.days_of_month.join(', ')

  switch (reminder.mode) {
    case 'once':
      return reminder.remind_at
        ? `${t('notes.modes.once')} · ${dateTime(reminder.remind_at)}`
        : t('notes.modes.once')
    case 'interval':
      return t('notes.everyMinutes', { count: reminder.interval_minutes ?? 0 })
    case 'daily':
      return `${t('notes.modes.daily')} · ${at}`
    case 'weekly':
      // ⚠️ §5.5 — დღეები **რამდენიმეა**; ერთი არჩეული ძველივით გამოიყურება
      return `${reminder.weekdays.map((d) => t(`notes.weekdays.${d}`)).join(', ')} · ${at}`
    case 'monthly':
      return `${t('notes.monthlyOn', { days })} · ${at}`
    case 'yearly':
      return `${t('notes.yearlyOn', {
        month: t(`notes.months.${reminder.month ?? 1}`),
        days,
      })} · ${at}`
    default:
      return reminder.mode
  }
}

/** ჯერადობის მინაწერი — ცარიელი, თუ უსასრულოა */
function repeatLabel(reminder: NoteReminder, t: TFunction): string | null {
  if (!reminder.repeat_count) {
    return null
  }

  return `${t('notes.reminderTimes', { count: reminder.repeat_count })} · ${t('notes.reminderRepeatLeft', {
    count: Math.max(reminder.repeat_count - reminder.sent_count, 0),
  })}`
}

/** მოქმედების ფანჯრის მინაწერი — ცარიელი, თუ საზღვარი არ აქვს (ეტაპი 7) */
function windowLabel(
  reminder: NoteReminder,
  t: TFunction,
  dateTime: (v: string) => string,
): string | null {
  const parts = [
    reminder.starts_at ? t('notes.reminderWindowFrom', { date: dateTime(reminder.starts_at) }) : null,
    reminder.ends_at ? t('notes.reminderWindowUntil', { date: dateTime(reminder.ends_at) }) : null,
  ].filter(Boolean)

  return parts.length ? parts.join(' ') : null
}

/**
 * რეჟიმის ხატულა — „რა სახის შეხსენებაა" ერთი შეხედვით.
 * ⚠️ ერთი რუკა და არა ექვსი `if`: ახალი რეჟიმი (მაგ. „სამუშაო დღეებში")
 * აქ ერთი რიგია, თორემ სადღაც უხატულოდ დარჩებოდა.
 */
const MODE_ICON: Record<ReminderMode, typeof BellRing> = {
  once: CalendarClock,
  interval: Timer,
  daily: Sun,
  weekly: CalendarDays,
  monthly: CalendarRange,
  yearly: Calendar,
}

/** არხის ხატულა — ბრაუზერი და ტელეგრამი (`NoteReminder::CHANNELS`) */
const CHANNEL_ICON: Record<ReminderChannel, typeof BellRing> = {
  browser: BellRing,
  telegram: Send,
}

/**
 * მდგომარეობის ტონი — **სამი მდგომარეობა, სამი სახე** (`lib/reminders.ts`).
 * ⚠️ „შეჩერებული" და „აღარ გაისვრის" ერთნაირად რომ გამოიყურებოდა, სწორედ
 * იმიტომ იყო სია უაზრო: პირველი ერთი დაჭერით ბრუნდება, მეორეს რედაქტირება სჭირდება.
 */
const STATE_TONE: Record<ReminderState, { stripe: string; icon: string; card: string }> = {
  active: { stripe: 'bg-primary', icon: 'bg-primary/15 text-primary', card: 'border-border bg-card' },
  paused: {
    stripe: 'bg-muted-foreground/40',
    icon: 'bg-muted text-muted-foreground',
    card: 'border-dashed border-border bg-card/50',
  },
  done: {
    stripe: 'bg-muted-foreground/25',
    icon: 'bg-muted text-muted-foreground',
    card: 'border-dashed border-border bg-card/50',
  },
}

/** წვრილი მეტა-ნიშანი ბარათზე (არხი, ჯერადობა, ფანჯარა) — დაუჭერელი */
function Meta({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * ერთი შეხსენება — ბარათი.
 *
 * ⚠️ **ბარათი მთლიანად ხსნის რედაქტირებას**, გადამრთველი და წაშლა კი მის
 * გარეთაა: ერთი ჩართვა რედაქტორსაც რომ ხსნიდეს, ეს ყოველ დაჭერაზე გაუგებარი იქნებოდა.
 */
export function ReminderCard({
  reminder,
  onEdit,
  onToggle,
  onDelete,
  /** ბმა ჩანაწერზე — მხოლოდ საერთო სიაში (ფანჯარაში ის ისედაც სათაურშია) */
  noteLink,
}: {
  reminder: NoteReminder
  onEdit: () => void
  onToggle: (active: boolean) => void
  onDelete: () => void
  noteLink?: ReactNode
}) {
  const { t } = useTranslation()
  const { dateTime, relative } = useDateFormat()

  const state = reminderState(reminder)
  const tone = STATE_TONE[state]
  const Icon = MODE_ICON[reminder.mode]
  const repeat = repeatLabel(reminder, t)
  const period = windowLabel(reminder, t, dateTime)

  return (
    <li className={cn('relative overflow-hidden rounded-xl border p-3 pl-4 transition-colors', tone.card)}>
      {/* მარცხენა ზოლი — მდგომარეობა ტექსტის წაკითხვამდე */}
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.stripe)} />

      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', tone.icon)}>
          <Icon className="size-4" />
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 cursor-pointer text-left"
          aria-label={t('notes.reminderEditTitle')}
        >
          <span className="block truncate text-sm font-medium hover:underline">
            {reminderLabel(reminder, t, dateTime)}
          </span>

          {/* ყველაზე საჭირო ფაქტი ცალკე ხაზზეა და არა „·"-ებში ჩამარხული */}
          <span className="mt-1 flex items-center gap-1.5 text-xs">
            {state === 'active' && (
              <>
                <Hourglass className="size-3 shrink-0 text-primary" />
                <span className="font-medium text-primary">{relative(reminder.next_at)}</span>
                <span className="truncate text-muted-foreground">· {dateTime(reminder.next_at)}</span>
              </>
            )}
            {state === 'paused' && (
              <>
                <BellOff className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{t('notes.reminderPaused')}</span>
              </>
            )}
            {state === 'done' && (
              <>
                <CheckCheck className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{t('notes.reminderNoNext')}</span>
              </>
            )}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1">
            {noteLink}
            {reminder.channels.map((channel) => {
              const ChannelIcon = CHANNEL_ICON[channel]
              return (
                <Meta key={channel} icon={<ChannelIcon className="size-3 shrink-0" />}>
                  {t(`notes.channels.${channel}`)}
                </Meta>
              )
            })}
            {repeat && <Meta icon={<Repeat className="size-3 shrink-0" />}>{repeat}</Meta>}
            {period && <Meta icon={<CalendarRange className="size-3 shrink-0" />}>{period}</Meta>}
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          <Switch
            checked={reminder.is_active}
            onCheckedChange={onToggle}
            aria-label={t('notes.reminderActive')}
          />
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t('actions.edit')}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={onDelete}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="size-4" />
          </Button>
        </span>
      </div>
    </li>
  )
}
