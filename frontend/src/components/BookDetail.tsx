import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Image as ImageIcon, Plus, Quote, Trash2, Upload } from 'lucide-react'
import {
  createBookNote,
  deleteBookFile,
  deleteBookNote,
  fetchBookFiles,
  fetchBookNotes,
  setBookProgress,
  uploadBookFiles,
  type Book,
  type BookFile,
} from '@/api/books'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn, formatBytes } from '@/lib/utils'

/* ============================================================
   წიგნის დეტალები — პროგრესი, ფაილები (pdf/epub) და ციტატები (Tasks §12).

   ცალკე გვერდის ნაცვლად მოდალია: სია ბიბლიოთეკის მთავარი ხედია და
   ჩანაწერზე დაბრუნება ერთი Esc-ია.
   ============================================================ */

export function BookDetail({ book, onClose }: { book: Book; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <ModalShell title={book.title_en || book.title_ka || '—'} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
            `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
        <div className="flex justify-end">
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={book.visibility} />
        </div>

        <ProgressCard book={book} />

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('books.filesTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('books.filesHint')}</p>
          <FilesCard book={book} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('books.notesTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('books.notesHint')}</p>
          <NotesCard book={book} />
        </section>
      </div>
    </ModalShell>
  )
}

/* ---------- პროგრესი ---------- */

function ProgressCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [page, setPage] = useState(book.progress_page ? String(book.progress_page) : '')
  const [percent, setPercent] = useState(book.progress_percent ? String(book.progress_percent) : '')

  const save = useMutation({
    // ⚠️ გვერდი უპირატესია, თუ საერთო რაოდენობა ცნობილია — backend ორივეს
    // ერთმანეთს უსწორებს, ე.ი. ორი რიცხვი ვერასდროს დაშორდება
    mutationFn: (input: { page?: number | null; percent?: number | null }) =>
      setBookProgress(book.id, input),
    onSuccess: (saved) => {
      setPage(saved.progress_page ? String(saved.progress_page) : '')
      setPercent(saved.progress_percent ? String(saved.progress_percent) : '')
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({ title: t('books.progressSaved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="mb-3 text-sm font-semibold">{t('books.progressTitle')}</h3>

      <div className="flex flex-wrap items-end gap-3">
        {book.pages ? (
          <div>
            <Label htmlFor="b-page">{t('books.progressPage', { total: book.pages })}</Label>
            <Input
              id="b-page"
              type="number"
              inputMode="numeric"
              min={0}
              max={book.pages}
              className="mt-1.5 w-28"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </div>
        ) : null}

        <div>
          <Label htmlFor="b-percent">{t('books.progressPercent')}</Label>
          <Input
            id="b-percent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className="mt-1.5 w-24"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              // ვგზავნით მხოლოდ იმას, რაც შეიცვალა — თორემ ორივე ერთად
              // მიდის და backend-ს „რომელი ჯობია" ისევ უწევს გამოცნობა
              page !== (book.progress_page ? String(book.progress_page) : '')
                ? { page: page === '' ? null : Number(page) }
                : { percent: percent === '' ? null : Number(percent) },
            )
          }
        >
          {t('actions.save')}
        </Button>

        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {book.progress_percent ?? 0}%
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-md bg-muted">
        <div
          className="h-full rounded-md bg-primary transition-[width]"
          style={{ width: `${book.progress_percent ?? 0}%` }}
        />
      </div>
    </section>
  )
}

/* ---------- ფაილები ---------- */

const FILE_KINDS: BookFile['kind'][] = ['book', 'image', 'doc']

function FilesCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [kind, setKind] = useState<BookFile['kind']>('book')
  const input = useRef<HTMLInputElement>(null)

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['book-files', book.id],
    queryFn: () => fetchBookFiles(book.id),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['book-files', book.id] })
    qc.invalidateQueries({ queryKey: ['books'] })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadBookFiles(book.id, kind, picked),
    onSuccess: () => {
      done()
      toast({ title: t('books.fileUploaded'), variant: 'success' })
    },
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteBookFile, onSuccess: done, onError: fail })
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => remove.mutate(id) })


  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILE_KINDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors',
              kind === value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`books.fileKinds.${value}`)}
          </button>
        ))}

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-3.5" />
          {upload.isPending ? t('actions.saving') : t('books.fileUpload')}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={kind === 'image' ? 'image/*' : undefined}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length) upload.mutate(picked)
            e.target.value = ''
          }}
        />
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">{t('books.filesEmpty')}</p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            {file.kind === 'image' ? (
              <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            )}
            {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
            <button
              type="button"
              onClick={() => viewer.open(file)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary"
              title={t('files.viewerOpen')}
            >
              {file.original_name ?? file.url}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
            <a
              href={storageUrl(file.url) ?? '#'}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('books.fileDeleteTitle'),
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

      {/* ონლაინ მნახველი — ერთი კომპონენტი ყველა მოდულზე (2026-09-14) */}
      {viewer.node}
    </div>
  )
}

/* ---------- ჩანიშვნები და ციტატები ---------- */

function NotesCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [body, setBody] = useState('')
  const [page, setPage] = useState('')
  const [isQuote, setIsQuote] = useState(false)

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['book-notes', book.id],
    queryFn: () => fetchBookNotes(book.id),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['book-notes', book.id] })
    qc.invalidateQueries({ queryKey: ['books'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const add = useMutation({
    mutationFn: () =>
      createBookNote(book.id, {
        body,
        is_quote: isQuote,
        page: page ? Number(page) : null,
      }),
    onSuccess: () => {
      setBody('')
      setPage('')
      done()
    },
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteBookNote, onSuccess: done, onError: fail })

  return (
    <div>
      <div className="mb-3 space-y-2">
        <Textarea
          rows={2}
          placeholder={t(isQuote ? 'books.quotePlaceholder' : 'books.notePlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
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
          <Button
            size="sm"
            className="ml-auto"
            disabled={!body.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Plus className="size-3.5" />
            {t('actions.add')}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !notes.length && (
        <p className="text-xs text-muted-foreground">{t('books.notesEmpty')}</p>
      )}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              note.is_quote ? 'border-primary/40 bg-secondary/40 italic' : 'border-border',
            )}
          >
            <div className="flex items-start gap-2">
              {note.is_quote && <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{note.body}</p>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                onClick={() => remove.mutate(note.id)}
                aria-label={t('actions.delete')}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {note.page != null && (
              <p className="mt-1 text-xs not-italic text-muted-foreground">
                {t('books.pageShort', { page: note.page })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
