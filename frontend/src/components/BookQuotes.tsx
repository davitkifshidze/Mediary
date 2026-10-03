import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Quote, Search, SquarePen, Trash2 } from 'lucide-react'
import { createBookNote, deleteBookNote, fetchBookNotes, updateBookNote, type Book, type BookNote } from '@/api/books'
import { copyText } from '@/lib/clipboard'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   **ციტატები — თავიდან** (Tasks §23.2).

   ⚠️ **ჩანიშვნებისგან ცალკეა**: `book_notes` ერთი ცხრილია (`is_quote`), მაგრამ
   ეკრანზე ციტატა სხვა რამაა — ბრჭყალების ბარათი, გვერდის ბეჯი, კოპირება.
   აქამდე ორივე ერთ სიაში იწერებოდა „ციტატაა" ჩექბოქსით (`RecordNotes`-ის
   `quotes` რეჟიმი), რომელიც ახლა მოიხსნა — დანარჩენ მოდულებს ის არასდროს
   ჰქონია.

   ⚠️ **დამატება/რედაქტირება ერთი დიალოგია** (`QuoteDialog`): `Textarea`
   ავტო-სიმაღლით და გვერდი `≤ pages` — კონტექსტური მენიუს „ციტატის დამატება"
   (§23.4) იმავე დიალოგს ხსნის სიიდანაც.

   ⚠️ ქეშის გასაღები `['book-notes', id]` **ყველა** ჩანიშვნას ინახავს (ციტატებიც),
   ჩანიშვნების ჩანართი კი `['book-notes', id, 'notes']`-ზე გაფილტრულს — ორივე
   პრეფიქსით ინვალიდირდება.
   ============================================================ */

const SEARCH_FROM = 5

export function QuoteDialog({ book, quote, onClose }: { book: Book; quote?: BookNote | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [body, setBody] = useState(quote?.body ?? '')
  const [page, setPage] = useState(quote?.page ? String(quote.page) : '')

  const save = useMutation({
    mutationFn: () => {
      const input = { body: body.trim(), is_quote: true, page: page ? Number(page) : null }
      return quote ? updateBookNote(quote.id, input) : createBookNote(book.id, input)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-notes', book.id] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: t('books.quoteSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const max = book.pages ?? 100000
  const pageInvalid = page !== '' && (Number(page) < 1 || Number(page) > max)

  return (
    <ModalShell title={t(quote ? 'books.quoteEdit' : 'books.quoteNew')} onClose={onClose} hint={t('books.quoteHint')}>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim() && !pageInvalid) save.mutate()
        }}
      >
        <div>
          <Label htmlFor="quote-body">{t('recordNotes.quoteTitle')}</Label>
          <Textarea
            id="quote-body"
            autoGrow
            rows={4}
            autoFocus
            className="mt-1.5"
            placeholder={t('books.quotePlaceholder')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="quote-page">
            {t('books.notePage')}
            {book.pages ? ` (≤ ${book.pages})` : ''}
          </Label>
          <Input
            id="quote-page"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            className="mt-1.5 w-28"
            value={page}
            onChange={(e) => setPage(e.target.value)}
          />
          {pageInvalid && <p className="mt-1 text-xs text-destructive">{t('books.pageOutOfRange', { max })}</p>}
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!body.trim() || pageInvalid || save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}

/** ციტატების ჩანართი — ბარათები, ძებნა, მენიუ (რედაქტირება · კოპირება · წაშლა) */
export function BookQuotes({ book, onAdd }: { book: Book; onAdd: () => void }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<BookNote | null>(null)

  const { data: notes = [], isLoading } = useQuery({ queryKey: ['book-notes', book.id], queryFn: () => fetchBookNotes(book.id) })
  const quotes = useMemo(() => notes.filter((n) => n.is_quote), [notes])
  const term = q.trim().toLowerCase()
  const shown = term ? quotes.filter((n) => n.body.toLowerCase().includes(term)) : quotes

  const remove = useMutation({
    mutationFn: deleteBookNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book-notes', book.id] })
      qc.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const copy = async (quote: BookNote) => {
    const text = quote.page ? `„${quote.body}“ — ${t('books.pageShort', { page: quote.page })}` : `„${quote.body}“`
    if (await copyText(text)) toast({ title: t('books.quoteCopied'), variant: 'success' })
  }

  const askDelete = async (quote: BookNote) => {
    const ok = await confirm({
      title: t('books.quoteDeleteTitle'),
      description: t('books.quoteDeleteHint'),
      variant: 'destructive',
    })
    if (ok) remove.mutate(quote.id)
  }

  return (
    <div data-testid="book-quotes">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {quotes.length >= SEARCH_FROM && (
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('books.quoteSearch')} className="h-9 pl-8" />
          </div>
        )}
        <Button size="sm" className="ml-auto" onClick={onAdd}>
          <Plus className="size-3.5" />
          {t('books.quoteNew')}
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && shown.length === 0 && (
        <EmptyState
          icon={<Quote className="size-6" />}
          title={term ? t('recordNotes.noMatch') : t('books.quotesEmpty')}
          hint={term ? t('recordNotes.noMatchHint') : t('books.quotesEmptyHint')}
          actions={
            term ? (
              <Button variant="outline" size="sm" onClick={() => setQ('')}>
                {t('recordNotes.clearSearch')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onAdd}>
                <Plus className="size-3.5" />
                {t('books.quoteNew')}
              </Button>
            )
          }
        />
      )}

      <ul className="space-y-2">
        {shown.map((quote) => (
          <li key={quote.id} className="rounded-md border border-primary/30 bg-secondary/30 p-3" data-testid="quote-card">
            <div className="flex items-start gap-2">
              <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm italic">{quote.body}</p>
              <ActionMenu label={t('actions.more')}>
                <ActionMenuClose asChild>
                  <button type="button" className={actionItemClass()} onClick={() => setEditing(quote)}>
                    <SquarePen className="size-3.5" />
                    {t('actions.edit')}
                  </button>
                </ActionMenuClose>
                <ActionMenuClose asChild>
                  <button type="button" className={actionItemClass()} onClick={() => void copy(quote)}>
                    <Copy className="size-3.5" />
                    {t('actions.copy')}
                  </button>
                </ActionMenuClose>
                <ActionMenuClose asChild>
                  <button type="button" className={actionItemClass('destructive')} onClick={() => void askDelete(quote)}>
                    <Trash2 className="size-3.5" />
                    {t('actions.delete')}
                  </button>
                </ActionMenuClose>
              </ActionMenu>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {quote.page != null && <Badge className="bg-secondary not-italic">{t('books.pageShort', { page: quote.page })}</Badge>}
              {quote.created_at && <span>{fmt.date(quote.created_at)}</span>}
            </div>
          </li>
        ))}
      </ul>

      {editing && <QuoteDialog book={book} quote={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
