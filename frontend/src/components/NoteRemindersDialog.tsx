import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { BellRing, ChevronRight, NotebookPen } from 'lucide-react'
import { fetchNoteReminders, type NoteEntry } from '@/api/notes'
import { NoteReminders } from '@/components/NoteReminders'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ModalShell } from '@/components/ui/modal-shell'
import { Button } from '@/components/ui/button'
import { activeCount } from '@/lib/reminders'
import { cn } from '@/lib/utils'

/* ============================================================
   **შეხსენებები ცალკე ფანჯარაში, ბმით ჩანაწერზე (ეტაპი 11).**

   ⚠️ ეტაპ 7-ზე ბლოკი პირდაპირ ფორმაში ჩაჯდა და **ეს არ გამოვიდა**: ფორმას
   ერთი საქმე აქვს („ჩანაწერის ველები"), შეხსენებას — მეორე („როდის
   შემახსენო"), და სამნაბიჯიანი რედაქტორი ველების ქვემოთ იმავე გვერდზე
   ორივეს ართულებდა. ახლა ფორმაში **ერთი ბარათია**, შიგთავსი კი თავის
   ფანჯარაშია.

   ⚠️ **„ცალკე" არ ნიშნავს „მოწყვეტილს"** — ფანჯარას თავში ცხადად აწერია,
   *რომელ ჩანაწერს* ეხება. სწორედ ეს ბმა იყო თხოვნის არსი: შეხსენება
   ჩანაწერის ფაქტია (`note_reminders.note_entry_id`) და ეს ეკრანზეც უნდა ჩანდეს.

   ⚠️ **ერთი შესვლის წერტილი სამივე ადგილიდან** — ფორმა, დეტალები და სიის
   ბეჯი ერთსა და იმავე ფანჯარას ხსნიან. მეორე გზა (მაგ. „მხოლოდ
   დეტალებში") სწორედ ის იყო, რამაც პირველად გააჩინა „დავამატე და ვეღარსად
   ვნახე".
   ============================================================ */

/**
 * რომელ ჩანაწერს სჭირდება ფანჯარა.
 *
 * ⚠️ **მთელი `NoteEntry` განზრახ არ იწერება** — შეხსენებების გვერდზე
 * (`/notes/reminders`) ჩანაწერი მხოლოდ `id`-ითა და სათაურით მოდის
 * (`note_reminders`-ის პასუხში), ე.ი. ფართო ტიპი იქ უბრალოდ ვერ შესრულდებოდა.
 * ფანჯარა სამ ველზე მეტს არც კითხულობს.
 */
export type ReminderNote = Pick<NoteEntry, 'id' | 'title'> &
  Partial<Pick<NoteEntry, 'category' | 'reminders_count'>>

/** შეხსენებების ფანჯარა — ერთი ჩანაწერისა */
export function NoteRemindersDialog({
  note,
  onBack,
  onClose,
}: {
  note: ReminderNote
  /** ⚠️ მხოლოდ მაშინ, როცა ფანჯარა **მოდალიდან** გაიხსნა და უკან სათქმელი აქვს */
  onBack?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <ModalShell title={t('notes.remindersTitle')} onBack={onBack} onClose={onClose} wide>
      {/* ბმა: „ეს შეხსენებები ამ ჩანაწერს ეკუთვნის".
          ⚠️ ჩანაწერის **თავისი** ხატულა (კატეგორიისა) და არა ზარი — ზოლი
          ჩანაწერზე ამბობს და არა შეხსენებაზე. */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-background text-muted-foreground">
          <ModuleIcon name={note.category?.icon ?? 'NotebookPen'} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('notes.reminderFor')}
          </span>
          <span className="block truncate text-sm font-medium">{note.title}</span>
        </span>
      </div>

      <div className="mt-5">
        <NoteReminders noteId={note.id} />
      </div>
    </ModalShell>
  )
}

/**
 * **კომპაქტური ბმული + ფანჯარა** — ჩანაწერის ფორმისთვის (2026-09-14).
 *
 * ⚠️ ეს **არ არის** ეტაპ 11-ის ბარათი, რომელიც ფორმიდან მოიხსნა. განსხვავება
 * არსებითია და შენი მითითებაც სწორედ ეს იყო: ფორმაში **მოდული** არ უნდა
 * იდგეს — არც ბლოკი და არც დიდი ბარათი; ერთი **დასახელებული, ხატულიანი
 * ღილაკი** კი „გასასვლელია" და არა სექცია. სწორედ იმას აკეთებს, რასაც სიის
 * ზარი: ხსნის შეხსენებების ფანჯარას.
 *
 * ⚠️ ის ფორმის **ქვედა რიგშია**, „გაუქმება/შენახვის" გვერდით, და არა ველებს
 * შორის — ე.ი. ვიზუალურადაც „გასასვლელია" და არა შესავსები ნაწილი.
 */
export function NoteRemindersLink({
  note,
  onOpen,
}: {
  note: ReminderNote | null
  onOpen: () => void
}) {
  const { t } = useTranslation()

  const { data } = useQuery({
    queryKey: ['note-reminders', note?.id ?? null],
    queryFn: () => fetchNoteReminders(note!.id),
    enabled: false,
  })

  const total = data?.length ?? note?.reminders_count ?? 0

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!note}
        // ⚠️ ჯერ შეუნახავ ჩანაწერზე მიზეზი `title`-შია — შეხსენებას `note_entry_id` სჭირდება
        title={note ? undefined : t('notes.remindersSaveFirst')}
        onClick={onOpen}
      >
        <BellRing className="size-4" />
        {t('notes.remindersTitle')}
        {total > 0 && (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs leading-none tabular-nums">
            {total}
          </span>
        )}
      </Button>
    </>
  )
}

/**
 * ბარათი-ღილაკი (ჩანაწერის დეტალებში).
 *
 * ⚠️ **ფანჯარას მშობელი ხატავს და არა ღილაკი** (2026-09-14). ეს `GroupsCut`-ის
 * წესის დარღვევა არ არის — იქ საქმე იმაში იყო, რომ state და JSX **ერთ**
 * კომპონენტში უნდა იდგეს; აქ ორივე მშობელშია. სხვაგვარად არც შეიძლება:
 * შეხსენებების ფანჯარა **მოდალის შიგნიდან** იხსნება და მშობელმა თავი უნდა
 * დამალოს (ქვემოთ, `NoteDetail`/`NoteForm`-ის „გადართვა") — ამას კი მხოლოდ
 * ის იზამს, ვისაც მდგომარეობა უჭირავს.
 */
export function NoteRemindersButton({
  note,
  onOpen,
}: {
  note: ReminderNote | null
  onOpen: () => void
}) {
  const { t } = useTranslation()

  /* ⚠️ **მრიცხველი ცოცხალია, მაგრამ ზედმეტ რექვესთს არ უშვებს**:
     `enabled: false` — ე.ი. ქეში თუ უკვე შევსებულია (ფანჯარა ერთხელ
     გაიხსნა), რიცხვი მაშინვე მიჰყვება ცვლილებას; თუ არა, სიიდან მოტანილ
     `reminders_count`-ს ვეყრდნობით. ფორმის გახსნაზე მხოლოდ ბეჯის ნომრის
     გამო მთელი სიის ჩამოტვირთვა ზედმეტი იქნებოდა. */
  const { data } = useQuery({
    queryKey: ['note-reminders', note?.id ?? null],
    queryFn: () => fetchNoteReminders(note!.id),
    enabled: false,
  })

  const total = data?.length ?? note?.reminders_count ?? 0
  const active = data ? activeCount(data) : null

  return (
    <>
      <button
        type="button"
        disabled={!note}
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors',
          note
            ? 'cursor-pointer hover:border-primary/40 hover:bg-muted/40'
            : 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-md',
            total > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {note ? <BellRing className="size-5" /> : <NotebookPen className="size-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t('notes.remindersTitle')}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {/* ⚠️ ჯერ შეუნახავ ჩანაწერზე მიზეზი **აქვე** წერია და არა ქვემოთ
                ცალკე სტრიქონად — შეხსენებას `note_entry_id` სჭირდება. */}
            {!note
              ? t('notes.remindersSaveFirst')
              : total === 0
                ? t('notes.remindersEmpty')
                : active == null
                  ? t('notes.remindersHint')
                  : t('notes.remindersSummary', { total, active })}
          </span>
        </span>

        {total > 0 && (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs leading-none tabular-nums">
            {total}
          </span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </>
  )
}
