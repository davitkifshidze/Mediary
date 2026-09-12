import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BellPlus,
  BellRing,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  REMINDER_CHANNELS,
  REMINDER_MODES,
  createNoteReminder,
  deleteNoteFile,
  deleteNoteReminder,
  fetchNoteFiles,
  fetchNoteReminders,
  updateNoteReminder,
  uploadNoteFiles,
  type NoteEntry,
  type NoteFile,
  type NoteReminder,
  type NoteReminderInput,
  type ReminderChannel,
  type ReminderMode,
} from '@/api/notes'
import { PrivateFileLink } from '@/components/PrivateFile'
import { errorMessage } from '@/lib/errors'
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/lib/noteReminders'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn, formatBytes, fromDateTimeLocal } from '@/lib/utils'

/* ============================================================
   ჩანაწერის დეტალები — ბმულები, ატვირთვები და შეხსენებები (Tasks §13).

   ⚠️ ატვირთვები **კვოტაზე გადის** (§13.1 → 17.1): ლიმიტის ამოწურვაზე
   backend 413-ს აბრუნებს და toast ცხადად წერს, რამდენი დარჩა.
   ============================================================ */

export function NoteDetail({ note, onClose }: { note: NoteEntry; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <ModalShell title={note.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {note.due_at && (
          <p className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" />
            {new Date(note.due_at).toLocaleString()}
          </p>
        )}

        {note.description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.description}</p>
        )}

        {note.links.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('notes.links')}</h3>
            <ul className="space-y-1.5 text-sm">
              {note.links.map((link, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-primary hover:underline"
                  >
                    {link.label || link.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('notes.imagesTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('notes.imagesHint')}</p>
          <Images note={note} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('notes.filesTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('notes.filesHint')}</p>
          <Files note={note} kind="doc" />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('notes.videosTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('notes.videosHint')}</p>
          <Files note={note} kind="video" />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('notes.remindersTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('notes.remindersHint')}</p>
          <Reminders note={note} />
        </section>
      </div>
    </ModalShell>
  )
}

/* ---------- ატვირთვები ---------- */

/** ატვირთვის საერთო ქცევა — სამივე ბლოკს ერთი და იგივე სჭირდება */
function useNoteFiles(note: NoteEntry, kind: NoteFile['kind']) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['note-files', note.id, kind],
    queryFn: () => fetchNoteFiles(note.id, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['note-files', note.id] })
    qc.invalidateQueries({ queryKey: ['notes'] })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadNoteFiles(note.id, kind, picked),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteNoteFile, onSuccess: done, onError: fail })

  return { query, upload, remove }
}

function Images({ note }: { note: NoteEntry }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useNoteFiles(note, 'image')
  const images = query.data ?? []

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t('notes.addImages')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {/* §2.9 — საერთო ბადე: ბიბლიოთეკის lightbox, მონიშვნები, ჩამოტვირთვა.
          ⚠️ `privateDisk` — ფაილები `notes/`-შია, ე.ი. პრივატულ დისკზე და
          blob-ად იკითხება (§17.5); `/storage/*` მათ ვერ ხედავს. */}
      <PhotoGrid
        privateDisk
        emptyText={t('notes.imagesEmpty')}
        items={images.map((file) => ({
          id: file.id,
          src: file.url,
          title: file.original_name,
          size: file.size,
        }))}
        onDelete={async (ids) => {
          const ok = await confirm({ title: t('notes.fileDeleteTitle'), variant: 'destructive' })
          if (ok) ids.forEach((id) => remove.mutate(id))
        }}
      />
    </div>
  )
}

function Files({ note, kind }: { note: NoteEntry; kind: 'video' | 'doc' }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useNoteFiles(note, kind)
  const files = query.data ?? []

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t(kind === 'video' ? 'notes.addVideos' : 'notes.addFiles')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={kind === 'video' ? 'video/*' : undefined}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {!query.isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">
          {t(kind === 'video' ? 'notes.videosEmpty' : 'notes.filesEmpty')}
        </p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.original_name ?? file.url}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
            <PrivateFileLink
              url={file.url}
              name={file.original_name}
              download
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" />
            </PrivateFileLink>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('notes.fileDeleteTitle'),
                  description: t('books.fileDeleteHint', { name: file.original_name ?? file.url }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(file.id)
              }}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- შეხსენებები (§13.2) ---------- */

/** ადამიანური აღწერა — ერთი წყარო სიისთვისაც და ბარათისთვისაც */
function reminderLabel(reminder: NoteReminder, t: TFunction): string {
  const at = reminder.time_of_day ?? ''

  switch (reminder.mode) {
    case 'once':
      return reminder.remind_at
        ? `${t('notes.modes.once')} · ${new Date(reminder.remind_at).toLocaleString()}`
        : t('notes.modes.once')
    case 'interval':
      return t('notes.everyMinutes', { count: reminder.interval_minutes ?? 0 })
    case 'daily':
      return `${t('notes.modes.daily')} · ${at}`
    case 'weekly':
      // ⚠️ §5.5 — დღეები **რამდენიმეა**; ერთი არჩეული ძველივით გამოიყურება
      return `${reminder.weekdays.map((d) => t(`notes.weekdays.${d}`)).join(', ')} · ${at}`
    case 'monthly':
      return `${t('notes.monthlyOn', { day: reminder.day_of_month ?? 1 })} · ${at}`
    case 'yearly':
      return `${t('notes.yearlyOn', {
        month: t(`notes.months.${reminder.month ?? 1}`),
        day: reminder.day_of_month ?? 1,
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

function Reminders({ note }: { note: NoteEntry }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['note-reminders', note.id],
    queryFn: () => fetchNoteReminders(note.id),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['note-reminders', note.id] })
    qc.invalidateQueries({ queryKey: ['notes'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const add = useMutation({
    mutationFn: (input: NoteReminderInput) => createNoteReminder(note.id, input),
    onSuccess: done,
    onError: fail,
  })
  const toggle = useMutation({
    mutationFn: ({ reminder, active }: { reminder: NoteReminder; active: boolean }) =>
      updateNoteReminder(reminder.id, {
        mode: reminder.mode,
        remind_at: reminder.remind_at,
        interval_minutes: reminder.interval_minutes,
        time_of_day: reminder.time_of_day,
        weekdays: reminder.weekdays,
        day_of_month: reminder.day_of_month,
        month: reminder.month,
        repeat_count: reminder.repeat_count,
        timezone: reminder.timezone,
        channels: reminder.channels,
        is_active: active,
      }),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteNoteReminder, onSuccess: done, onError: fail })

  return (
    <div>
      <ReminderEditor pending={add.isPending} onAdd={(input) => add.mutate(input)} />

      {isLoading && <p className="mt-3 text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !reminders.length && (
        <p className="mt-3 text-xs text-muted-foreground">{t('notes.remindersEmpty')}</p>
      )}

      <ul className="mt-3 space-y-2">
        {reminders.map((reminder) => (
          <li
            key={reminder.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <BellRing className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{reminderLabel(reminder, t)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  reminder.channels.map((c) => t(`notes.channels.${c}`)).join(' · '),
                  repeatLabel(reminder, t),
                  reminder.next_at
                    ? `${t('notes.nextAt')}: ${new Date(reminder.next_at).toLocaleString()}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <Switch
              checked={reminder.is_active}
              onCheckedChange={(active) => toggle.mutate({ reminder, active })}
              aria-label={t('notes.reminderActive')}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('notes.reminderDeleteTitle'),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(reminder.id)
              }}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * ახალი შეხსენების ფორმა.
 *
 * ⚠️ **პერიოდი ველია და არა ჩაშენებული 10/15/20** (§13.2) — ჩიპები მხოლოდ
 * მალსახმობებია და ხელით შეყვანას არ ცვლის.
 */
function ReminderEditor({
  pending,
  onAdd,
}: {
  pending: boolean
  onAdd: (input: NoteReminderInput) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ReminderMode>('once')
  const [remindAt, setRemindAt] = useState('')
  const [minutes, setMinutes] = useState('15')
  const [time, setTime] = useState('09:00')
  // ⚠️ §5.5 — დღეები **მასივია**; ერთი არჩეული ძველი ქცევის იდენტურია
  const [weekdays, setWeekdays] = useState<number[]>([1])
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [month, setMonth] = useState('1')
  const [repeat, setRepeat] = useState('')
  const [channels, setChannels] = useState<ReminderChannel[]>(['browser'])
  const [permission, setPermission] = useState(notificationPermission())

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const needsPermission = channels.includes('browser') && permission !== 'granted'

  /** კედლის საათი ყველა პერიოდულს სჭირდება — ერთი პასუხი ოთხივეზე */
  const usesClock = mode === 'daily' || mode === 'weekly' || mode === 'monthly' || mode === 'yearly'
  const usesDayOfMonth = mode === 'monthly' || mode === 'yearly'
  // ჯერადობა `once`-ს არ ეხება: ის ისედაც ერთხელ ისვრის
  const usesRepeat = mode !== 'once'

  const submit = () => {
    onAdd({
      mode,
      // ⚠️ ლოკალური input → UTC; დანარჩენებს კი კედლის საათი + სარტყელი მიაქვთ
      remind_at: mode === 'once' ? fromDateTimeLocal(remindAt) : null,
      interval_minutes: mode === 'interval' ? Number(minutes) : null,
      time_of_day: usesClock ? time : null,
      weekdays: mode === 'weekly' ? weekdays : null,
      day_of_month: usesDayOfMonth ? Number(dayOfMonth) : null,
      month: mode === 'yearly' ? Number(month) : null,
      repeat_count: usesRepeat && Number(repeat) >= 1 ? Number(repeat) : null,
      timezone: zone,
      channels,
    })
  }

  const ready =
    (mode === 'once' && !!remindAt) ||
    (mode === 'interval' && Number(minutes) >= 1) ||
    (mode === 'weekly' && !!time && weekdays.length > 0) ||
    ((mode === 'daily' || mode === 'monthly' || mode === 'yearly') && !!time)

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rem-mode">{t('notes.reminderMode')}</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ReminderMode)}>
            <SelectTrigger id="rem-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_MODES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`notes.modes.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode === 'once' && (
          <div>
            <Label htmlFor="rem-at">{t('notes.reminderAt')}</Label>
            {/* §2.8 — იგივე პიქერი, რაც „როდისთვის"-ზე */}
            <DatePicker
              id="rem-at"
              withTime
              value={remindAt || null}
              onChange={(v) => setRemindAt(v ?? '')}
            />
          </div>
        )}

        {mode === 'interval' && (
          <div>
            <Label htmlFor="rem-min">{t('notes.reminderInterval')}</Label>
            <Input
              id="rem-min"
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[10, 15, 20, 60, 1440].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinutes(String(n))}
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  {t('notes.everyMinutes', { count: n })}
                </button>
              ))}
            </div>
          </div>
        )}

        {usesClock && (
          <div className="flex gap-2">
            {mode === 'yearly' && (
              <div className="flex-1">
                <Label htmlFor="rem-month">{t('notes.reminderMonth')}</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger id="rem-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {t(`notes.months.${m}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {usesDayOfMonth && (
              <div className="flex-1">
                <Label htmlFor="rem-dom">{t('notes.reminderDayOfMonth')}</Label>
                <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                  <SelectTrigger id="rem-dom">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex-1">
              <Label htmlFor="rem-time">{t('notes.reminderTime')}</Label>
              <Input
                id="rem-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ⚠️ §5.5 — რამდენიმე დღე ერთდროულად; ჩიპები და არა ჩამოსაშლელი,
            თორემ მრავალარჩევანი დამალული დარჩებოდა */}
        {mode === 'weekly' && (
          <div className="sm:col-span-2">
            <Label>{t('notes.reminderWeekdays')}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setWeekdays((all) =>
                      all.includes(d) ? all.filter((x) => x !== d) : [...all, d].sort((a, b) => a - b),
                    )
                  }
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                    weekdays.includes(d)
                      ? 'border-primary bg-secondary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(`notes.weekdays.${d}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {weekdays.length ? t('notes.reminderWeekdaysHint') : t('notes.reminderWeekdaysRequired')}
            </p>
          </div>
        )}

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
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('notes.reminderRepeatHint')}</p>
          </div>
        )}

        {usesDayOfMonth && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {t('notes.reminderDayOfMonthHint')}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{t('notes.reminderChannels')}</span>
        {REMINDER_CHANNELS.map((channel) => (
          <label key={channel} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox
              checked={channels.includes(channel)}
              onCheckedChange={(on) =>
                setChannels((all) =>
                  on ? [...all, channel] : all.filter((c) => c !== channel),
                )
              }
            />
            {t(`notes.channels.${channel}`)}
          </label>
        ))}
      </div>

      {/* სარტყელი ცხადად ჩანს — „09:00" ორაზროვანია, სანამ არ წერია სად */}
      {usesClock && (
        <p className="mt-2 text-xs text-muted-foreground">{t('notes.timezoneHint', { zone })}</p>
      )}

      {needsPermission && (
        <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
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

      <Button size="sm" className="mt-3" disabled={!ready || pending} onClick={submit}>
        <BellPlus className="size-3.5" />
        {t('notes.addReminder')}
      </Button>
    </div>
  )
}
