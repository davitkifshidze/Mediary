import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, BellPlus, Plus, X } from 'lucide-react'
import {
  REMINDER_CHANNELS,
  REMINDER_MODES,
  createNoteReminder,
  deleteNoteReminder,
  fetchNoteReminders,
  updateNoteReminder,
  type NoteReminder,
  type NoteReminderInput,
  type ReminderChannel,
  type ReminderMode,
} from '@/api/notes'
import { errorMessage } from '@/lib/errors'
import { notificationPermission, requestNotificationPermission } from '@/lib/noteReminders'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Chip, ChipRow } from '@/components/ui/chip'
import { StepSection } from '@/components/ui/step-section'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ReminderCard } from '@/components/ReminderCard'
import { EmptyState } from '@/components/ui/empty-state'
import { activeCount, reminderInput, sortReminders } from '@/lib/reminders'
import { cn, fromDateTimeLocal, toDateTimeLocal } from '@/lib/utils'

/* ============================================================
   **შეხსენებები — ერთი ბლოკი ორ ადგილას (§13.2 → §5.5 → ეტაპი 7).**

   ⚠️ ადრე ეს მთლიანად `NoteDetail`-ის შიგნით იდგა, ე.ი. **დამატება/რედაქტირების
   ფორმას შეხსენება საერთოდ არ ჰქონდა**: შეხსენებას ქმნიდი, მერე კი მისი
   ჩასწორება მხოლოდ სხვა მოდალიდან იძებნებოდა და სიის „1"-იანი უბრალო
   წარწერა იყო. ახლა ერთი კომპონენტია და **ორივე ადგილას დგას**.

   ⚠️ **ჯერ შეუნახავ ჩანაწერზე შეხსენება არ იდგმება** — `note_reminders`-ს
   `note_entry_id` სჭირდება, ე.ი. `noteId === null`-ზე მხოლოდ მინიშნებაა
   (ზუსტად `CustomFieldsCard`-ის ქცევა).

   ⚠️ **შეხსენება `note`-ის ფაქტია** (`note_reminders.note_entry_id`) და სხვა
   მოდულებზე არ ვრცელდება — ცხრილი პოლიმორფული უნდა გამხდარიყო.
   ============================================================ */



/** კვირის დღეები ორშაბათიდან, Carbon-ის ნუმერაციით (0 = კვირა) */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** მალსახმობები — ⚠️ ინტერვალი მაინც **ველია** (§13.2), ეს მხოლოდ ჩქარი გზაა */
const INTERVAL_PRESETS = [10, 15, 20, 60, 1440]

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** რეჟიმები, რომლებსაც კედლის საათი სჭირდებათ (backend: `NoteReminder::CLOCK_MODES`) */
const CLOCK_MODES: ReminderMode[] = ['daily', 'weekly', 'monthly', 'yearly']

/** რეჟიმები, რომლებსაც თვის რიცხვი სჭირდებათ */
const DAY_MODES: ReminderMode[] = ['monthly', 'yearly']

/**
 * რედაქტორის მონახაზი.
 *
 * ⚠️ **ცალკე ტიპია და არა თორმეტი `useState`**: ეტაპ 7-მა ველების რიცხვი
 * გააორმაგა (დროების სია, რიცხვების სია, ფანჯრის ორი ბოლო), და სწორედ ეს
 * არის ის მომენტი, როცა „ახლის დამატება" და „არსებულის ჩასწორება" ერთმანეთს
 * უნდა ეთანხმებოდნენ — ერთი ობიექტი ორივეს ერთნაირად ავსებს.
 */
interface ReminderDraft {
  mode: ReminderMode
  remindAt: string
  minutes: string
  /** ⚠️ ეტაპი 7 — დღეში რამდენიმე დრო */
  times: string[]
  weekdays: number[]
  /** ⚠️ ეტაპი 7 — თვეში რამდენიმე რიცხვი */
  days: number[]
  month: string
  repeat: string
  startsAt: string
  endsAt: string
  channels: ReminderChannel[]
}

const EMPTY_DRAFT: ReminderDraft = {
  mode: 'once',
  remindAt: '',
  minutes: '15',
  times: ['09:00'],
  weekdays: [1],
  days: [1],
  month: '1',
  repeat: '',
  startsAt: '',
  endsAt: '',
  channels: ['browser'],
}

/** არსებული შეხსენება → მონახაზი (ჩასწორება) */
function draftOf(reminder: NoteReminder): ReminderDraft {
  return {
    mode: reminder.mode,
    remindAt: toDateTimeLocal(reminder.remind_at),
    minutes: String(reminder.interval_minutes ?? 15),
    times: reminder.times_of_day.length ? reminder.times_of_day : ['09:00'],
    weekdays: reminder.weekdays.length ? reminder.weekdays : [1],
    days: reminder.days_of_month.length ? reminder.days_of_month : [1],
    month: String(reminder.month ?? 1),
    repeat: reminder.repeat_count ? String(reminder.repeat_count) : '',
    startsAt: toDateTimeLocal(reminder.starts_at),
    endsAt: toDateTimeLocal(reminder.ends_at),
    channels: reminder.channels.length ? reminder.channels : ['browser'],
  }
}

/** მონახაზი → მოთხოვნა. ⚠️ სხვა რეჟიმის ველები `null`-ად მიდის, არა „ძველად". */
function draftInput(draft: ReminderDraft, zone: string): NoteReminderInput {
  const usesClock = CLOCK_MODES.includes(draft.mode)
  const usesDays = DAY_MODES.includes(draft.mode)

  return {
    mode: draft.mode,
    // ⚠️ ლოკალური input → UTC; დანარჩენებს კი კედლის საათი + სარტყელი მიაქვთ
    remind_at: draft.mode === 'once' ? fromDateTimeLocal(draft.remindAt) : null,
    interval_minutes: draft.mode === 'interval' ? Number(draft.minutes) : null,
    times_of_day: usesClock ? draft.times : null,
    weekdays: draft.mode === 'weekly' ? draft.weekdays : null,
    days_of_month: usesDays ? draft.days : null,
    month: draft.mode === 'yearly' ? Number(draft.month) : null,
    // ჯერადობა `once`-ს არ ეხება: ის ისედაც ერთხელ ისვრის
    repeat_count: draft.mode !== 'once' && Number(draft.repeat) >= 1 ? Number(draft.repeat) : null,
    // ⚠️ ფანჯარა **ყველა რეჟიმს ეხება**, `once`-საც — ეს საზღვარია და არა რეჟიმი
    starts_at: fromDateTimeLocal(draft.startsAt),
    ends_at: fromDateTimeLocal(draft.endsAt),
    timezone: zone,
    channels: draft.channels,
  }
}

/**
 * ფანჯრის დასასრული დასაწყისამდე.
 *
 * ⚠️ backend ამას 422-ით აბრუნებს (`after:starts_at`); აქ ღილაკი ჩაქრება და
 * მიზეზი ეწერება — შეცდომის toast-ი „რატომ" კითხვას პასუხს არ სცემს.
 */
function windowBroken(draft: ReminderDraft): boolean {
  return !!draft.startsAt && !!draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt)
}

/** შევსებულია? — ერთი პასუხი „დამატებასაც" და „შენახვასაც" */
function draftReady(draft: ReminderDraft): boolean {
  if (windowBroken(draft)) {
    return false
  }

  switch (draft.mode) {
    case 'once':
      return !!draft.remindAt
    case 'interval':
      return Number(draft.minutes) >= 1
    case 'daily':
      return draft.times.length > 0
    case 'weekly':
      return draft.times.length > 0 && draft.weekdays.length > 0
    default:
      return draft.times.length > 0 && draft.days.length > 0
  }
}


export function NoteReminders({ noteId }: { noteId: number | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  /* ⚠️ **ორი ეკრანი და არა ერთი გრძელი გვერდი (ეტაპი 11 · ვიზუალი).**
     ადრე სამნაბიჯიანი რედაქტორი **ყოველთვის გახსნილი** იდგა სიის თავზე,
     ე.ი. „რა შეხსენებები მაქვს" ფორმის ქვემოთ იმალებოდა და ბლოკი ფორმას
     ჰგვადა და არა სიას. ახლა ნაგულისხმევი ეკრანი **სიაა**, რედაქტორი კი
     მაშინ ჩნდება, როცა მართლა ამატებ ან ასწორებ.
     `null` = სია · `'new'` = ახალი · ობიექტი = ჭასწორება. */
  const [editing, setEditing] = useState<NoteReminder | 'new' | null>(null)

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['note-reminders', noteId],
    queryFn: () => fetchNoteReminders(noteId!),
    // ⚠️ ჯერ შეუნახავ ჩანაწერს `id` არ აქვს — რექვესთი არც უნდა წავიდეს
    enabled: noteId != null,
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['note-reminders', noteId] })
    qc.invalidateQueries({ queryKey: ['notes'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  /** ⚠️ ერთი მუტაცია ორივეზე — „დამატება" და „შენახვა" ერთი და იგივე ფორმაა */
  /** მიმდინარე ჭასწორება — `'new'` ახალია და არა შეხსენება */
  const editingReminder = editing === 'new' ? null : editing

  const save = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: NoteReminderInput }) =>
      id ? updateNoteReminder(id, input) : createNoteReminder(noteId!, input),
    onSuccess: () => {
      setEditing(null)
      done()
    },
    onError: fail,
  })
  const toggle = useMutation({
    mutationFn: ({ reminder, active }: { reminder: NoteReminder; active: boolean }) =>
      updateNoteReminder(reminder.id, { ...reminderInput(reminder), is_active: active }),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteNoteReminder, onSuccess: done, onError: fail })

  /* ⚠️ `CustomFieldsCard`-ის ზუსტი ქცევა: შეხსენებას `note_entry_id` სჭირდება,
     ე.ი. ახალ ჩანაწერზე ველების ჩვენება ცრუ დაპირება იქნებოდა. */
  if (noteId == null) {
    return <p className="text-xs text-muted-foreground">{t('notes.remindersSaveFirst')}</p>
  }

  /* ---------- ეკრანი 2: რედაქტორი ---------- */
  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setEditing(null)} aria-label={t('actions.back')}>
            <ArrowLeft className="size-4" />
          </Button>
          <h4 className="flex-1 text-sm font-semibold">
            {t(editingReminder ? 'notes.reminderEditTitle' : 'notes.reminderNewTitle')}
          </h4>
        </div>

        <ReminderEditor
          // ⚠️ `key` აიძულებს რედაქტორს თავიდან აეწყოს, როცა სხვა შეხსენებაზე
          // გადავდივართ — თორემ მონახაზი ძველი შეხსენებისა დარჩებოდა
          key={editingReminder?.id ?? 'new'}
          reminder={editingReminder}
          pending={save.isPending}
          onCancel={() => setEditing(null)}
          // ⚠️ ჩასწორებისას აქტიურობა თან მიაქვს: `is_active`-ის გარეშე backend
          // ნაგულისხმევად `true`-ს ჩაწერს და გამორთული შეხსენება ჩუმად ჩაირთვებოდა
          onSubmit={(input) =>
            save.mutate({
              id: editingReminder?.id ?? null,
              input: editingReminder ? { ...input, is_active: editingReminder.is_active } : input,
            })
          }
        />
      </div>
    )
  }

  /* ---------- ეკრანი 1: სია ---------- */
  const active = activeCount(reminders)

  return (
    <div>
      {reminders.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t('notes.remindersSummary', { total: reminders.length, active })}
          </p>
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            {t('notes.addReminder')}
          </Button>
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}

      {/* ⚠️ ცარიელი ბლოკი `EmptyState`-ია და არა ერთი ნაცრისფერი წინადადება
          (Tasks §2.4-ის წესი): რა არის ცარიელი, რატომ და **რა ღილაკია შემდეგი**. */}
      {!isLoading && !reminders.length && (
        <EmptyState
          icon={<BellPlus className="size-6" />}
          title={t('notes.remindersEmpty')}
          hint={t('notes.remindersHint')}
          actions={
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" />
              {t('notes.addReminder')}
            </Button>
          }
        />
      )}

      <ul className="space-y-2">
        {sortReminders(reminders).map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            onEdit={() => setEditing(reminder)}
            onToggle={(on) => toggle.mutate({ reminder, active: on })}
            onDelete={async () => {
              const ok = await confirm({
                title: t('notes.reminderDeleteTitle'),
                variant: 'destructive',
              })
              if (ok) remove.mutate(reminder.id)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * შეხსენების რედაქტორი (ეტაპი 7).
 *
 * ⚠️ **სამ ნაბიჯად დაყოფილია და არა ერთ ბადედ.** ეტაპ 7-მა ველების რიცხვი
 * გააორმაგა; ძველი `grid sm:grid-cols-2` უკვე მაშინ არევდა რიგს (ჯერადობა
 * კვირის დღეებს ზემოთ ჩნდებოდა), ახლა კი საერთოდ ვეღარ იკითხებოდა *რა რის
 * შემდეგ* ივსება: ჯერ „როდის", მერე „რამდენ ხანს" და ბოლოს „სად მოვიდეს".
 * კომპონენტი იგივეა, რაც ვებძებნის დიალოგს აქვს (`StepSection`) — მეორე
 * ვიზუალი იმავე იდეისთვის სწორედ ის არის, რაც ერთმანეთს შორდება.
 *
 * ⚠️ **პერიოდი ველია და არა ჩაშენებული 10/15/20** (§13.2) — ჩიპები მხოლოდ
 * მალსახმობებია და ხელით შეყვანას არ ცვლის.
 */
function ReminderEditor({
  reminder,
  pending,
  onSubmit,
  onCancel,
}: {
  /** `null` = ახალი შეხსენება */
  reminder: NoteReminder | null
  pending: boolean
  onSubmit: (input: NoteReminderInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ReminderDraft>(() =>
    reminder ? draftOf(reminder) : EMPTY_DRAFT,
  )
  const [newTime, setNewTime] = useState('09:00')
  const [permission, setPermission] = useState(notificationPermission())

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const needsPermission = draft.channels.includes('browser') && permission !== 'granted'

  const patch = (next: Partial<ReminderDraft>) => setDraft((d) => ({ ...d, ...next }))

  const usesClock = CLOCK_MODES.includes(draft.mode)
  const usesDays = DAY_MODES.includes(draft.mode)
  const usesRepeat = draft.mode !== 'once'
  const broken = windowBroken(draft)

  /** ⚠️ დუბლიკატი ჩუმად იკარგება — „09:00" ორჯერ ორ გასროლას არ ნიშნავს */
  const addTime = () => {
    if (newTime && !draft.times.includes(newTime)) {
      patch({ times: [...draft.times, newTime].sort() })
    }
  }

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  return (
    <div className="space-y-3">
      <StepSection
        step={1}
        title={t('notes.reminderStepWhen')}
        hint={t('notes.reminderStepWhenHint')}
      >
        <ChipRow>
          {REMINDER_MODES.map((value) => (
            <Chip
              key={value}
              active={draft.mode === value}
              onClick={() => patch({ mode: value })}
            >
              {t(`notes.modes.${value}`)}
            </Chip>
          ))}
        </ChipRow>

        <div className="mt-4 space-y-4">
          {draft.mode === 'once' && (
            <div className="max-w-xs">
              <Label htmlFor="rem-at">{t('notes.reminderAt')}</Label>
              {/* §2.8 — იგივე პიქერი, რაც „როდისთვის"-ზე */}
              <DatePicker
                id="rem-at"
                withTime
                value={draft.remindAt || null}
                onChange={(v) => patch({ remindAt: v ?? '' })}
              />
            </div>
          )}

          {draft.mode === 'interval' && (
            <div className="max-w-xs">
              <Label htmlFor="rem-min">{t('notes.reminderInterval')}</Label>
              <Input
                id="rem-min"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.minutes}
                onChange={(e) => patch({ minutes: e.target.value })}
              />
              <ChipRow className="mt-2">
                {INTERVAL_PRESETS.map((n) => (
                  <Chip
                    key={n}
                    active={Number(draft.minutes) === n}
                    onClick={() => patch({ minutes: String(n) })}
                  >
                    {t('notes.everyMinutes', { count: n })}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          )}

          {/* ⚠️ §5.5 — რამდენიმე დღე ერთდროულად; ჩიპები და არა ჩამოსაშლელი,
              თორემ მრავალარჩევანი დამალული დარჩებოდა */}
          {draft.mode === 'weekly' && (
            <div>
              <Label>{t('notes.reminderWeekdays')}</Label>
              <ChipRow className="mt-1.5">
                {WEEKDAY_ORDER.map((d) => (
                  <Chip
                    key={d}
                    active={draft.weekdays.includes(d)}
                    onClick={() => patch({ weekdays: toggleIn(draft.weekdays, d).sort((a, b) => a - b) })}
                  >
                    {t(`notes.weekdays.${d}`)}
                  </Chip>
                ))}
              </ChipRow>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {draft.weekdays.length
                  ? t('notes.reminderWeekdaysHint')
                  : t('notes.reminderWeekdaysRequired')}
              </p>
            </div>
          )}

          {draft.mode === 'yearly' && (
            <div className="max-w-xs">
              <Label htmlFor="rem-month">{t('notes.reminderMonth')}</Label>
              <Select value={draft.month} onValueChange={(v) => patch({ month: v })}>
                <SelectTrigger id="rem-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {t(`notes.months.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ⚠️ ეტაპი 7 — თვეში **რამდენიმე** რიცხვი; 31 ჩიპი ბადეში იმიტომ
              დგას, რომ არჩეული ერთდროულად ჩანდეს (ჩამოსაშლელი ერთს აჩვენებდა) */}
          {usesDays && (
            <div>
              <Label>{t('notes.reminderDaysOfMonth')}</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {MONTH_DAYS.map((d) => (
                  <Chip
                    key={d}
                    active={draft.days.includes(d)}
                    className="min-w-9 justify-center px-2 py-1 tabular-nums"
                    onClick={() => patch({ days: toggleIn(draft.days, d).sort((a, b) => a - b) })}
                  >
                    {d}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {draft.days.length
                  ? t('notes.reminderDayOfMonthHint')
                  : t('notes.reminderDaysRequired')}
              </p>
            </div>
          )}

          {/* ⚠️ ეტაპი 7 — დღეში რამდენიმე დრო: სია + დამატების ველი */}
          {usesClock && (
            <div>
              <Label htmlFor="rem-time">{t('notes.reminderTimesLabel')}</Label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {draft.times.map((time) => (
                  <Chip
                    key={time}
                    active
                    className="tabular-nums"
                    aria-label={t('notes.reminderRemoveTime', { time })}
                    onClick={() => patch({ times: draft.times.filter((x) => x !== time) })}
                  >
                    {time}
                    <X className="size-3" />
                  </Chip>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  id="rem-time"
                  type="time"
                  className="w-32"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
                <Button type="button" size="sm" variant="outline" onClick={addTime}>
                  <Plus className="size-3.5" />
                  {t('notes.reminderAddTime')}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {draft.times.length
                  ? t('notes.reminderTimesHint')
                  : t('notes.reminderTimesRequired')}
              </p>
            </div>
          )}

          {/* სარტყელი ცხადად ჩანს — „09:00" ორაზროვანია, სანამ არ წერია სად */}
          {usesClock && <p className="text-xs text-muted-foreground">{t('notes.timezoneHint', { zone })}</p>}
        </div>
      </StepSection>

      {/* ⚠️ ეტაპი 7 — „ამ დიაპაზონში", „ამ პერიოდით", „ამდენი ხნით":
          სამივე ერთსა და იმავე კითხვაზეა პასუხი და ერთ ნაბიჯში დგას */}
      <StepSection
        step={2}
        title={t('notes.reminderStepWindow')}
        hint={t('notes.reminderStepWindowHint')}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="rem-starts">{t('notes.reminderWindowStart')}</Label>
            <DatePicker
              id="rem-starts"
              withTime
              value={draft.startsAt || null}
              onChange={(v) => patch({ startsAt: v ?? '' })}
            />
          </div>

          <div>
            <Label htmlFor="rem-ends">{t('notes.reminderWindowEnd')}</Label>
            <DatePicker
              id="rem-ends"
              withTime
              value={draft.endsAt || null}
              onChange={(v) => patch({ endsAt: v ?? '' })}
            />
          </div>

          {usesRepeat && (
            <div>
              <Label htmlFor="rem-repeat">{t('notes.reminderRepeat')}</Label>
              <Input
                id="rem-repeat"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                placeholder={t('notes.reminderRepeatNone')}
                value={draft.repeat}
                onChange={(e) => patch({ repeat: e.target.value })}
              />
            </div>
          )}
        </div>

        <p className={cn('mt-2 text-xs', broken ? 'text-destructive' : 'text-muted-foreground')}>
          {broken ? t('notes.reminderWindowInvalid') : t('notes.reminderWindowHint')}
        </p>
      </StepSection>

      <StepSection
        step={3}
        title={t('notes.reminderChannels')}
        hint={t('notes.reminderStepChannelsHint')}
      >
        <div className="flex flex-wrap items-center gap-4">
          {REMINDER_CHANNELS.map((channel) => (
            <label key={channel} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <Checkbox
                checked={draft.channels.includes(channel)}
                onCheckedChange={(on) =>
                  patch({
                    channels: on
                      ? [...draft.channels, channel]
                      : draft.channels.filter((c) => c !== channel),
                  })
                }
              />
              {t(`notes.channels.${channel}`)}
            </label>
          ))}
        </div>

        {needsPermission && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{t('notes.permissionHint')}</span>
            <button
              type="button"
              onClick={async () => setPermission(await requestNotificationPermission())}
              className="shrink-0 cursor-pointer underline"
            >
              {t('notes.permissionAsk')}
            </button>
          </p>
        )}
      </StepSection>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!draftReady(draft) || pending}
          onClick={() => onSubmit(draftInput(draft, zone))}
        >
          <BellPlus className="size-3.5" />
          {reminder ? t('actions.save') : t('notes.addReminder')}
        </Button>

        {/* ⚠️ ახლა ახალ შეხსენებაზეც ჩანს — ორივე შემთხვევაში სიაში აბრუნებს */}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
      </div>
    </div>
  )
}
