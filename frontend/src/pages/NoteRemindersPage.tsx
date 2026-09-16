import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellPlus, NotebookPen, Plus } from 'lucide-react'
import {
  deleteNoteReminder,
  fetchAllNoteReminders,
  updateNoteReminder,
  type NoteReminder,
} from '@/api/notes'
import { ReminderCard } from '@/components/ReminderCard'
import { NoteRemindersDialog } from '@/components/NoteRemindersDialog'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Button, buttonVariants } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { errorMessage } from '@/lib/errors'
import {
  activeCount,
  reminderInput,
  reminderState,
  sortReminders,
  type ReminderState,
} from '@/lib/reminders'

/* ============================================================
   **შეხსენებების საკუთარი გვერდი (ეტაპი 11.2).**

   ⚠️ სამჯერ სცადა და სამჯერვე იმიტომ არ გამოვიდა, რომ შეხსენება **სხვისი
   ეკრანის ნაწილად** იდგა: ჯერ ჩანაწერის დეტალების ბოლოში, მერე ჩანაწერის
   ფორმაში ბლოკად, მერე იმავე ფორმაში ბარათ-ღილაკად. შენი პასუხი სამივეზე
   ერთი იყო — „ისევ შიგნითაა, რედაქტირებაში". ახლა შეხსენებას **თავისი
   სექცია აქვს** და ჩანაწერის ფორმაში მისი კვალიც აღარ არის.

   ⚠️ **ბმა არ დაკარგულა — პირიქით, ახლა ჩანს**: თითო ბარათს აწერია, რომელ
   ჩანაწერს ეკუთვნის, და იქვე მიჰყავს. ეს სწორედ ის „ბმაა", რაზეც შენ
   ლაპარაკობდი — უბრალოდ ახლა შეხსენების მხრიდან იკითხება და არა ჩანაწერის.

   ⚠️ **სიის რიგი და მდგომარეობა `lib/reminders.ts`-იდან მოდის** — იმავე
   ფუნქციებიდან, რომლებსაც ჩანაწერის ფანჯარა იყენებს; ბარათიც ერთი და იგივეა
   (`components/ReminderCard.tsx`). ორი ასლი ერთ კვირაში გაშორდებოდა.
   ============================================================ */

/** ჭრილები — „ყველა" + სამი მდგომარეობა (`reminderState`) */
const CUTS = ['all', 'active', 'paused', 'done'] as const
type Cut = (typeof CUTS)[number]

export function NoteRemindersPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [cut, setCut] = useState<Cut>('all')
  /** რომელი ჩანაწერის ფანჯარაა გახსნილი — რედაქტირება იქ ხდება */
  const [opened, setOpened] = useState<{ id: number; title: string } | null>(null)

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['note-reminders', 'all'],
    queryFn: fetchAllNoteReminders,
  })

  /* ⚠️ ჩანაწერის ფანჯარა თავის `['note-reminders', id]`-ს ანახლებს, ე.ი. ამ
     გვერდის სიაც უნდა გადაიწეროს — თორემ ფანჯრის დახურვის შემდეგ ეკრანზე
     ძველი მდგომარეობა დარჩებოდა. */
  const done = () => {
    qc.invalidateQueries({ queryKey: ['note-reminders'] })
    qc.invalidateQueries({ queryKey: ['notes'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const toggle = useMutation({
    mutationFn: ({ reminder, active }: { reminder: NoteReminder; active: boolean }) =>
      updateNoteReminder(reminder.id, { ...reminderInput(reminder), is_active: active }),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteNoteReminder, onSuccess: done, onError: fail })

  const counts = useMemo(() => {
    const by: Record<ReminderState, number> = { active: 0, paused: 0, done: 0 }
    reminders.forEach((r) => (by[reminderState(r)] += 1))
    return by
  }, [reminders])

  const shown = useMemo(
    () => sortReminders(cut === 'all' ? reminders : reminders.filter((r) => reminderState(r) === cut)),
    [reminders, cut],
  )

  return (
    <PageContainer>
      <PageHeader
        module="note"
        title={t('notes.remindersTitle')}
        subtitle={
          reminders.length > 0
            ? t('notes.remindersSummary', { total: reminders.length, active: activeCount(reminders) })
            : undefined
        }
        actions={
          <Link to="/notes" className={buttonVariants({ variant: 'outline' })}>
            <NotebookPen className="size-4" />
            {t('notes.title')}
          </Link>
        }
      />

      {reminders.length > 0 && (
        <div className="mb-4">
          <CutTabs
            options={CUTS.map((value) => ({
              key: value,
              label: t(`notes.reminderCut.${value}`),
              count: value === 'all' ? reminders.length : counts[value],
            }))}
            value={cut}
            onChange={(key) => setCut(key as Cut)}
          />
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {/* ⚠️ ორი სხვადასხვა სიცარიელე და ორი სხვადასხვა ღილაკი: „ჯერ არაფერი
          დამიმატებია" ჩანაწერებზე მიგზავნის (შეხსენება ჩანაწერს ებმის),
          „ფილტრმა ჩამოჭრა" კი ფილტრს ხსნის. */}
      {!isLoading && !shown.length && (
        <EmptyState
          icon={<BellPlus className="size-6" />}
          title={reminders.length ? t('notes.remindersNoneInCut') : t('notes.remindersEmpty')}
          hint={reminders.length ? undefined : t('notes.remindersHint')}
          actions={
            reminders.length ? (
              <Button variant="outline" onClick={() => setCut('all')}>
                {t('filter.clear')}
              </Button>
            ) : (
              <Link to="/notes" className={buttonVariants()}>
                <Plus className="size-4" />
                {t('notes.remindersAddOnNote')}
              </Link>
            )
          }
        />
      )}

      <ul className="space-y-3">
        {shown.map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            // რედაქტირება ჩანაწერის თავის ფანჯარაში ხდება — ერთი რედაქტორი
            onEdit={() => reminder.note && setOpened(reminder.note)}
            onToggle={(active) => toggle.mutate({ reminder, active })}
            onDelete={async () => {
              const ok = await confirm({
                title: t('notes.reminderDeleteTitle'),
                variant: 'destructive',
              })
              if (ok) remove.mutate(reminder.id)
            }}
            noteLink={
              reminder.note && (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-[11px] leading-none">
                  <NotebookPen className="size-3 shrink-0" />
                  <span className="truncate">{reminder.note.title}</span>
                </span>
              )
            }
          />
        ))}
      </ul>

      {opened && <NoteRemindersDialog note={opened} onClose={() => setOpened(null)} />}
    </PageContainer>
  )
}
