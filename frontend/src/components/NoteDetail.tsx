import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { toggleNoteFavorite, type NoteEntry } from '@/api/notes'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { NoteUploads } from '@/components/NoteUploads'
import { NoteRemindersButton, NoteRemindersChip, NoteRemindersDialog } from '@/components/NoteRemindersDialog'
import { ModalShell } from '@/components/ui/modal-shell'
import { useDateFormat } from '@/lib/dates'

/* ============================================================
   ჩანაწერის დეტალები — ბმულები, ატვირთვები და შეხსენებები (Tasks §13).

   ⚠️ ატვირთვები **კვოტაზე გადის** (§13.1 → 17.1): ლიმიტის ამოწურვაზე
   backend 413-ს აბრუნებს და toast ცხადად წერს, რამდენი დარჩა.

   ⚠️ **რიგი §26.4-ით**: ფოტოები ზემოთ, მერე ვადა, აღწერა, ბმულები,
   დოკუმენტები და ვიდეოები. ⚠️ ფოტოები პრივატულ დისკზეა, ამიტომ ისინი
   `NoteUploads`-ის ბადეში რჩება და არა საჯარო ვიტრინაში (`DetailPhotos`).
   ============================================================ */

/* ⚠️ **`focus`-ის პროპი და გადახვევა მოიხსნა (ეტაპი 11).** ის ეტაპ 7-ზე
   იმიტომ დაიბადა, რომ შეხსენებები გრძელი მოდალის **ბოლოში** იყო ჩამარხული
   და სიის ბეჯს იქამდე უნდა მიეყვანა. ახლა ბეჯი პირდაპირ შეხსენებების
   ფანჯარას ხსნის, ე.ი. გადასახვევი აღარაფერია. */
export function NoteDetail({ note, onClose }: { note: NoteEntry; onClose: () => void }) {
  const { t } = useTranslation()
  // ⚠️ თარიღი `lib/dates.ts`-ზე გადის და არა `toLocaleString()`-ზე (Tasks 18):
  // პირდაპირი ძახილი ბრაუზერის ლოკალს მიჰყვებოდა და პარამეტრს არ ემორჩილებოდა
  const { dateTime } = useDateFormat()
  const [reminders, setReminders] = useState(false)
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const qc = useQueryClient()
  const favorite = useMutation({
    mutationFn: () => toggleNoteFavorite(note.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notes'] }),
  })

/* ⚠️ **შეხსენებების ფანჯარა უკანა მოდალს ცვლის და არ ეფარება** (2026-09-14,
   შენი არჩევანი: „ის გაქრეს, ეს გამოჩნდეს; დახურავ — პირიქით"). ორი ერთმანეთზე
   დადებული მოდალი ერთი და იმავე სიგანისა იყო, ე.ი. ქვედა კიდეებიდან მოჩანდა და
   პატარას ჰგავდა.

   ⚠️ **მშობელი კომპონენტი მონტირებული რჩება** — მხოლოდ მისი `ModalShell`
   იცვლება: ე.ი. ფორმის შევსებული ველები ადგილზეა, როცა ფანჯრიდან ბრუნდები.
   სწორედ ამიტომ უჭირავს მდგომარეობა მშობელს და არა ღილაკს. */
  if (reminders) {
    return (
      <NoteRemindersDialog
        note={note}
        onBack={() => setReminders(false)}
        onClose={() => setReminders(false)}
      />
    )
  }

  return (
    <ModalShell title={note.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* Tasks §8/§26.2 — ჰეროში ორივე ღილაკი: შემხსენებელი (ქარვისფერი) და რჩეული, ერთი სიმაღლის */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
          <VisitBadge type="note" id={note.id} />
          <NoteRemindersChip count={note.reminders_count ?? 0} onOpen={() => setReminders(true)} />
          <FavoriteButton active={note.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
        </div>

        {/* §26.2 — შემხსენებლების ბარათი **ზემოთ**, აღწერამდე (აქამდე ბოლოში იყო ჩამარხული) */}
        <NoteRemindersButton note={note} onOpen={() => setReminders(true)} />

        {/* ---------- ფოტოები — ზემოთ (§26.4) ---------- */}
        <NoteUploads noteId={note.id} kinds={['image']} />

        {note.due_at && (
          <p className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" />
            {dateTime(note.due_at)}
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
                    className="min-w-0 flex-1 truncate text-primary hover:text-primary/70"
                  >
                    {link.label || link.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* დოკუმენტები და ვიდეოები — იგივე კომპონენტი, რაც ფორმაშია */}
        <NoteUploads noteId={note.id} kinds={['doc', 'video']} />
      </div>
    </ModalShell>
  )
}
