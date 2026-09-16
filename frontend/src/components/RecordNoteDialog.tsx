import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Quote, SquarePen, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { UserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/feedback'
import type { RecordNote, RecordNoteInput } from '@/components/RecordNotes'

/* ============================================================
   ერთი ჩანიშვნის ფანჯარა (Tasks §6.3).

   შენი სიტყვები: „ციტატა და კომენტარი ტექსტები რამე ღილაკის მსგავსად იყოს
   და შიგნით მოდალი იხსნებოდეს, სადაც იქნება ვინ დაამატა, რა დაამატა,
   როდის, წაშლა ჰქონდეს".

   ⚠️ **„უკან გასვლა იმ გვერდზე, საიდანაც გახსენი" კოდს არ საჭიროებს.**
   `ModalShell`-ის დასტა ამას თვითონ აკეთებს: ჩადგმულ მოდალს უკან-ისარი
   **ავტომატურად** უჩნდება, ქვედა მოდალი (ჩანაწერის დეტალები) CSS-ით
   იმალება და **დამონტაჟებული რჩება** — ე.ი. დახურვაზე ზუსტად იმ ადგილას
   ბრუნდები, საიდანაც წამოხვედი, ნახევრად შევსებული ველების ჩათვლით.

   ⚠️ **წაშლას დადასტურება აქვს** (Tasks §6.4). ეს ასიმეტრია იყო და
   მონაცემის დაკარგვის რეალური გზა: ფაილის წაშლა `useConfirm`-ს გადიოდა,
   ჩანიშვნისა კი პირდაპირ იძახებდა მუტაციას.

   ⚠️ **„ვინ დაამატა" `useAuth()`-იდან მოდის და არა პასუხიდან.** `*_notes`
   ცხრილებს `user_id` აქვთ, მაგრამ `BelongsToUser`-ის `owner` სკოუპი +
   `EnsureRecordOwnership` ნიშნავს, რომ ეს **ყოველთვის ჩანაწერის მფლობელია** —
   ე.ი. სერვერზე ველის დამატება იმავე ფაქტს მეორედ იტყოდა. როცა ოდესმე
   თანაავტორობა გაჩნდება, ეს ერთი ადგილია, სადაც ის უნდა შეიცვალოს.
   ============================================================ */

export function RecordNoteDialog({
  note,
  quotes,
  onClose,
  onSave,
  onDelete,
  busy,
}: {
  note: RecordNote
  /** ციტატის/გვერდის კონტროლი — მხოლოდ წიგნს აქვს */
  quotes?: boolean
  onClose: () => void
  onSave: (input: RecordNoteInput) => void
  onDelete: () => void
  busy?: boolean
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const fmt = useDateFormat()
  const confirm = useConfirm()

  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [page, setPage] = useState(note.page == null ? '' : String(note.page))
  const [isQuote, setIsQuote] = useState(Boolean(note.is_quote))

  /* ⚠️ „შეიცვალა" **მხოლოდ მაშინ ჩანს, როცა მართლა შეიცვალა** — ორივე
     დროშტამპი შექმნისას იდენტურია, ე.ი. უპირობო ჩვენება ყოველ ჩანიშვნას
     „დარედაქტირებულს" დაარქმევდა. */
  const edited =
    note.updated_at && note.created_at && note.updated_at !== note.created_at ? note.updated_at : null

  const save = () => {
    const text = body.trim()
    if (!text) return
    onSave(
      quotes ? { body: text, is_quote: isQuote, page: page ? Number(page) : null } : { body: text },
    )
    setEditing(false)
  }

  return (
    <ModalShell
      title={t(note.is_quote ? 'recordNotes.quoteTitle' : 'recordNotes.title')}
      onClose={onClose}
    >
      <div className="mt-4 space-y-4">
        {/* ---------- ვინ და როდის ---------- */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {user && (
            <span className="flex items-center gap-1.5">
              <UserAvatar user={user} size="size-6" />
              <span className="text-foreground">{user.display_name}</span>
            </span>
          )}
          <span>
            {t('recordNotes.addedAt')}: {fmt.dateTime(note.created_at)}
          </span>
          {edited && (
            <span>
              {t('recordNotes.editedAt')}: {fmt.dateTime(edited)}
            </span>
          )}
        </div>

        {/* ---------- სხეული ---------- */}
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            {quotes && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={isQuote}
                    onChange={(e) => setIsQuote(e.target.checked)}
                    className="cursor-pointer"
                  />
                  {t('books.isQuote')}
                </label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="w-24"
                  placeholder={t('books.notePage')}
                  value={page}
                  onChange={(e) => setPage(e.target.value)}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className={
              note.is_quote
                ? 'rounded-md border border-primary/40 bg-secondary/40 p-3 text-sm italic'
                : 'rounded-md border border-border p-3 text-sm'
            }
          >
            <p className="whitespace-pre-wrap break-words">{note.body}</p>
          </div>
        )}

        {(note.is_quote || note.page != null) && !editing && (
          <div className="flex flex-wrap items-center gap-2">
            {note.is_quote && (
              <Badge className="bg-secondary">
                <Quote className="size-3.5" />
                {t('books.isQuote')}
              </Badge>
            )}
            {note.page != null && (
              <Badge className="bg-secondary">{t('books.pageShort', { page: note.page })}</Badge>
            )}
          </div>
        )}

        {/* ---------- მოქმედებები ---------- */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              const ok = await confirm({
                title: t('recordNotes.deleteTitle'),
                description: t('recordNotes.deleteHint'),
                variant: 'destructive',
              })
              if (ok) onDelete()
            }}
          >
            <Trash2 className="size-4" />
            {t('actions.delete')}
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBody(note.body)
                    setPage(note.page == null ? '' : String(note.page))
                    setIsQuote(Boolean(note.is_quote))
                    setEditing(false)
                  }}
                >
                  {t('actions.cancel')}
                </Button>
                <Button disabled={!body.trim() || busy} onClick={save}>
                  {t('actions.save')}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <SquarePen className="size-4" />
                {t('actions.edit')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
