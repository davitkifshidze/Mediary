import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { NotebookPen, Plus, Quote, Search, Trash2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { highlightParts } from '@/lib/searchResults'
import { RecordNoteDialog } from '@/components/RecordNoteDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **ჩანიშვნების საერთო ბლოკი — ხუთივე მოდულზე ერთი (Tasks §6.2/§6.7).**

   შენი სიტყვები: „ციტატა და კომენტარი ტექსტები რამე ღილაკის მსგავსად იყოს
   და შიგნით მოდალი იხსნებოდეს … წაშლა ჰქონდეს და ძებნა".

   ხუთივე ჩანიშვნის ცხრილს ერთი ფორმა აქვს — `{id, body, created_at,
   updated_at}` — წიგნს კი ზუსტად ორი დამატებითი ველი (`is_quote`, `page`).
   ე.ი. განსხვავება ერთი არჩევითი ტოტია და არა ხუთი ფაილში გამეორებული
   `switch`.

   ⚠️ **კომპონენტი მხოლოდ სხეულია** — სათაური და მინიშნება გამომძახებელს
   რჩება: `VideoDetail`/`SongDetail` ჩანიშვნებს **ტაბის შიგნით** ხატავენ
   (თავისი `badge`-ითა და `TabInfo`-თი), `BookDetail`/`GameDetail`/
   `BoardGameDetail` კი `<section>`-ად. საკუთარი `<h3>` ორივეგან ზედმეტი
   სათაური იქნებოდა.

   ⚠️ **ტექსტების სრული ნაკრები არ არის აქ ჩაბეტონებული**: დამატების
   placeholder და „დაამატე" ღილაკის წარწერა მოდულისაა (`videos.notePlaceholder`,
   `books.quotePlaceholder` …) და პროპებით მოდის — `EmptyState`-ის იგივე წესი.

   ⚠️ **ძებნა კლიენტზეა და ეს სწორია** — სია უკვე მთლიანად ჩამოტვირთულია
   (`GET /<module>/{id}/notes` გვერდებს არ ყოფს). ხაზგასმა `highlightParts()`-ია:
   ის `RegExp`-ს **არ** იყენებს, ე.ი. `(`-ის აკრეფა შაბლონად არ იკითხება
   და დამთხვევა ქართული სიტყვის **შიგნითაც** იპოვება.

   ⚠️ **წაშლის ღილაკი ჩანიშვნის ღილაკის *გარეთაა***: ჩალაგებული `<button>`
   არასწორი HTML-ია და ერთი დაჭერა ორივე მოქმედებას გაუშვებდა.

   ⚠️ **დიალოგი ამავე კომპონენტის ერთადერთ `return`-შია.** თუ ოდესმე აქ
   ადრეული `return` გაჩნდა, დიალოგი `const dialogs`-ში უნდა გავიდეს და
   **ორივე** ტოტმა დახატოს — ეს ცოცხალი ბაგია, რომელიც პროექტს `GroupsCut`-ზე
   უკვე დაუჯდა.
   ============================================================ */

/** ხუთივე მოდულის ჩანიშვნის საერთო ფორმა; `is_quote`/`page` მხოლოდ წიგნს აქვს */
export interface RecordNote {
  id: number
  body: string
  is_quote?: boolean
  page?: number | null
  created_at: string | null
  updated_at: string | null
}

export interface RecordNoteInput {
  body: string
  is_quote?: boolean
  page?: number | null
}

export interface RecordNotesApi {
  list: () => Promise<RecordNote[]>
  create: (input: RecordNoteInput) => Promise<unknown>
  update: (id: number, input: RecordNoteInput) => Promise<unknown>
  remove: (id: number) => Promise<void>
}

/** რამდენი ჩანიშვნიდან ჩნდება ძებნის ველი — ქვემოთ ის ხმაურია */
const SEARCH_FROM = 5

export function RecordNotes({
  queryKey,
  api,
  invalidate = [],
  quotes,
  placeholder,
  quotePlaceholder,
  addLabel,
  emptyTitle,
  emptyHint,
}: {
  queryKey: QueryKey
  api: RecordNotesApi
  /** დამატებით გასასუფთავებელი ქეშები (ჩანაწერების სია, სადაც `notes_count` ზის) */
  invalidate?: QueryKey[]
  /** ციტატის ნიშანი და გვერდის ველი — მხოლოდ წიგნს */
  quotes?: boolean
  placeholder: string
  quotePlaceholder?: string
  addLabel: string
  emptyTitle: string
  emptyHint?: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [body, setBody] = useState('')
  const [page, setPage] = useState('')
  const [isQuote, setIsQuote] = useState(false)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  const { data: notes = [], isLoading } = useQuery({ queryKey, queryFn: api.list })

  const done = () => {
    qc.invalidateQueries({ queryKey })
    invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }))
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const add = useMutation({
    mutationFn: () =>
      api.create(
        quotes
          ? { body: body.trim(), is_quote: isQuote, page: page ? Number(page) : null }
          : { body: body.trim() },
      ),
    onSuccess: () => {
      setBody('')
      setPage('')
      done()
    },
    onError: fail,
  })

  const save = useMutation({
    mutationFn: ({ id, input }: { id: number; input: RecordNoteInput }) => api.update(id, input),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: api.remove,
    onSuccess: () => {
      setOpenId(null)
      done()
    },
    onError: fail,
  })

  const term = q.trim()
  const shown = useMemo(() => {
    if (!term) return notes
    const needle = term.toLowerCase()
    return notes.filter((n) => n.body.toLowerCase().includes(needle))
  }, [notes, term])

  /* ⚠️ **გახსნილი ჩანიშვნა id-ით ინახება და არა ობიექტად**: რედაქტირების
     შემდეგ სია თავიდან იკითხება, ე.ი. ობიექტის ასლი ძველ ტექსტს აჩვენებდა. */
  const open = openId == null ? null : (notes.find((n) => n.id === openId) ?? null)

  return (
    <div>
      {/* ---------- დამატება ---------- */}
      <div className="mb-3 space-y-2">
        <Textarea
          rows={2}
          placeholder={quotes && isQuote ? (quotePlaceholder ?? placeholder) : placeholder}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {quotes && (
            <>
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
            </>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!body.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="size-3.5" />
            {addLabel}
          </Button>
        </div>
      </div>

      {/* ---------- ძებნა ---------- */}
      {notes.length >= SEARCH_FROM && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('recordNotes.search')}
            className="h-9 pl-8"
          />
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}

      {/* ⚠️ „ჩანიშვნა არ მაქვს" და „ძებნამ დამალა" **ორი სხვადასხვა ფაქტია** —
          ერთი ტექსტი მეორეს ვერ იტყოდა და ცარიელი სია ტყუილად წაიკითხებოდა. */}
      {!isLoading && !shown.length && (
        <EmptyState
          icon={<NotebookPen className="size-6" />}
          title={term ? t('recordNotes.noMatch') : emptyTitle}
          hint={term ? t('recordNotes.noMatchHint') : emptyHint}
          actions={
            term ? (
              <Button variant="outline" size="sm" onClick={() => setQ('')}>
                {t('recordNotes.clearSearch')}
              </Button>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2">
        {shown.map((note) => (
          <li
            key={note.id}
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
              note.is_quote ? 'border-primary/40 bg-secondary/40' : 'border-border',
            )}
          >
            {note.is_quote && <Quote className="mt-1 size-3.5 shrink-0 text-muted-foreground" />}

            {/* ⚠️ სტრიქონი **ღილაკია** — ფაილის სახელის იგივე იდიომა. სამ
                ხაზზე იკვეცება, თორემ გრძელი ციტატა სიას გამოუსადეგარს ხდის. */}
            <button
              type="button"
              onClick={() => setOpenId(note.id)}
              className="min-w-0 flex-1 cursor-pointer text-left transition-colors hover:text-primary"
            >
              <span
                className={cn(
                  'line-clamp-3 whitespace-pre-wrap break-words',
                  note.is_quote && 'italic',
                )}
              >
                {highlightParts(note.body, term).map((part, i) =>
                  part.hit ? (
                    <mark key={i} className="rounded-md bg-primary/20 text-foreground">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
              {note.page != null && (
                <Badge className="mt-1 bg-secondary not-italic">
                  {t('books.pageShort', { page: note.page })}
                </Badge>
              )}
            </button>

            {/* ⚠️ წაშლა **ღილაკის გარეთაა** (ჩალაგებული `<button>` არასწორი
                HTML-ია) და **დადასტურებას გადის** (Tasks §6.4) — ადრე ის
                პირდაპირ იძახებდა მუტაციას, მაშინ როცა ფაილის წაშლა უკვე
                კითხულობდა. */}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('recordNotes.deleteTitle'),
                  description: t('recordNotes.deleteHint'),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(note.id)
              }}
              aria-label={t('actions.delete')}
              title={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {open && (
        <RecordNoteDialog
          note={open}
          quotes={quotes}
          busy={save.isPending || remove.isPending}
          onClose={() => setOpenId(null)}
          onSave={(input) => save.mutate({ id: open.id, input })}
          onDelete={() => remove.mutate(open.id)}
        />
      )}
    </div>
  )
}
