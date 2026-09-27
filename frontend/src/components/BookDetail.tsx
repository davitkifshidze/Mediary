import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Download, ExternalLink, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import {
  BOOK_MAX_RATING,
  createBookNote,
  deleteBookFile,
  deleteBookNote,
  fetchBookFiles,
  fetchBookNotes,
  setBookProgress,
  updateBookNote,
  uploadBookFiles,
  type Book,
  type BookFile,
} from '@/api/books'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { RecordNotes } from '@/components/RecordNotes'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   წიგნის დეტალები — პროგრესი, ფაილები (pdf/epub) და ციტატები (Tasks §12).

   ცალკე გვერდის ნაცვლად მოდალია: სია ბიბლიოთეკის მთავარი ხედია და
   ჩანაწერზე დაბრუნება ერთი Esc-ია.

   ⚠️ **რიგი §26.4-ით (თამაშის §22.2-ის წესი)**: თავში ყდა, სტატუსი, ჟანრი
   და მოკლე ცნობები — აქამდე ფანჯარა მათ **საერთოდ არ აჩვენებდა**; მერე
   კითხვის პროგრესი, ფოტოები, აღწერა, ბმულები, ფაილები და ციტატები.
   ⚠️ ფოტოები ფაილების სიიდან ამოვიდა და ზემოთ ვიტრინად დგას — ერთი ფოტო
   ორ ადგილას აღარ ჩანს.
   ============================================================ */

export function BookDetail({ book, onClose }: { book: Book; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const title = book.title_en || book.title_ka || '—'
  const description =
    lang === 'ka' ? book.description_ka || book.description_en : book.description_en || book.description_ka
  // §5.7 — წყაროს ბმული + ძველი ჩანაწერის `links` (ფორმიდან მოხსნილი, მაგრამ შენახული)
  const links = [
    ...(book.source_url ? [{ label: t('fields.name.book.source_url'), url: book.source_url }] : []),
    ...book.links,
  ]

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: ყდა, სტატუსი, ჟანრი, მოკლე ცნობები (§26.4) ---------- */}
        <DetailHero
          image={storageUrl(book.cover)}
          alt={title}
          fallback={<BookOpen className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="book" status={book.status} />
              {book.rating != null && (
                <Badge className="bg-secondary tabular-nums">
                  {book.rating}/{BOOK_MAX_RATING}
                </Badge>
              )}
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={book.visibility} />
            </>
          }
        >
          {book.genre && (
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                <ModuleIcon name={book.genre.icon} className="size-3" />
                {dictionaryName(book.genre, lang)}
              </span>
            </div>
          )}
          <DetailFacts>
            {book.author && <span className="text-foreground">{book.author}</span>}
            {book.publisher && <span>{book.publisher}</span>}
            {book.year ? <span>{book.year}</span> : null}
            {book.pages ? <span>{t('books.pagesShort', { count: book.pages })}</span> : null}
            {book.language && (
              <span>{t(`books.languages.${book.language}`, { defaultValue: book.language })}</span>
            )}
            <span>{t(`books.formats.${book.format}`)}</span>
          </DetailFacts>
        </DetailHero>

        <ProgressCard book={book} />

        {/* ---------- ფოტოები — ზემოთ და დიდად (§26.4) ---------- */}
        <Photos book={book} />

        {description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>}

        {links.length > 0 && (
          <DetailSection title={t('books.linksTitle')}>
            <ul className="space-y-1.5 text-sm">
              {links.map((link, i) => (
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
          </DetailSection>
        )}

        <DetailSection title={t('books.filesTitle')} hint={t('books.filesHint')}>
          <FilesCard book={book} />
        </DetailSection>

        <DetailSection title={t('books.notesTitle')} hint={t('books.notesHint')}>
          <NotesCard book={book} />
        </DetailSection>
      </div>
    </ModalShell>
  )
}

/* ---------- ფოტოები (§26.4) ---------- */

/** ფაილების ატვირთვის/წაშლის შემდეგ — სია, კვოტა და ჰედერის ინდიკატორი (17.1) */
function useBookFilesRefresh(book: Book) {
  const qc = useQueryClient()

  return () => {
    qc.invalidateQueries({ queryKey: ['book-files', book.id] })
    qc.invalidateQueries({ queryKey: ['books'] })
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
}

function Photos({ book }: { book: Book }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const done = useBookFilesRefresh(book)
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  // ⚠️ იგივე query, რაც ფაილების სიას — ქეში ერთია, მოთხოვნა ერთხელ მიდის
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['book-files', book.id],
    queryFn: () => fetchBookFiles(book.id),
  })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadBookFiles(book.id, 'image', picked),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteBookFile, onSuccess: done, onError: fail })

  return (
    <DetailPhotos
      title={t('books.photosTitle')}
      hint={t('books.photosHint')}
      items={files
        .filter((file) => file.kind === 'image')
        .map((file) => ({ id: file.id, src: file.url, title: file.original_name }))}
      loading={isLoading}
      uploading={upload.isPending}
      onUpload={(picked) => upload.mutate(picked)}
      onDelete={(id) => remove.mutate(id)}
      uploadLabel={t('books.addPhotos')}
      emptyTitle={t('books.photosEmpty')}
      deleteTitle={t('books.photoDeleteTitle')}
    />
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

/** ⚠️ ფოტოები აქ აღარაა — ზემოთ ვიტრინად დგას (§26.4) */
const FILE_KINDS: BookFile['kind'][] = ['book', 'doc']

function FilesCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [kind, setKind] = useState<BookFile['kind']>('book')
  const input = useRef<HTMLInputElement>(null)

  const { data: all = [], isLoading } = useQuery({
    queryKey: ['book-files', book.id],
    queryFn: () => fetchBookFiles(book.id),
  })
  const files = all.filter((file) => file.kind !== 'image')

  // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
  const done = useBookFilesRefresh(book)
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
      {/* ⚠️ სახეობის გადამრთველი `Chip`-ია და არა ხელით აწყობილი პილული
          (Tasks §6.6) — `ui/chip.tsx` სწორედ იმისთვის გამოვიდა, რომ თორმეტი
          ასლი ხუთი სხვადასხვა პადინგით არ ეხატა. */}
      <ChipRow className="mb-3">
        {FILE_KINDS.map((value) => (
          <Chip key={value} active={kind === value} onClick={() => setKind(value)}>
            {t(`books.fileKinds.${value}`)}
          </Chip>
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
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length) upload.mutate(picked)
            e.target.value = ''
          }}
        />
      </ChipRow>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !files.length && (
        /* ⚠️ ბარე ნაცრისფერი `<p>` იყო — ზუსტად ის შემთხვევა, რისთვისაც
           `EmptyState` დაიწერა (რა ცარიელია · რატომ · რა არის შემდეგი). */
        <EmptyState
          icon={<Paperclip className="size-6" />}
          title={t('books.filesEmpty')}
          hint={t('books.filesHint')}
          actions={
            <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
              <Upload className="size-3.5" />
              {t('books.fileUpload')}
            </Button>
          }
        />
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
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
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
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

  /* ⚠️ სხეული გაზიარებულია (`components/RecordNotes.tsx`, Tasks §6.2/§6.7) —
     წიგნი ერთადერთია, სადაც `quotes` ჩართულია: `is_quote` და `page` მხოლოდ
     `book_notes`-ს აქვს. დანარჩენ ოთხ მოდულს ზუსტად იგივე კომპონენტი
     ემსახურება ამ ორი ველის გარეშე. */
  return (
    <RecordNotes
      queryKey={['book-notes', book.id]}
      invalidate={[['books']]}
      api={{
        list: () => fetchBookNotes(book.id),
        create: (input) => createBookNote(book.id, input),
        update: (id, input) => updateBookNote(id, input),
        remove: deleteBookNote,
      }}
      quotes
      placeholder={t('books.notePlaceholder')}
      quotePlaceholder={t('books.quotePlaceholder')}
      addLabel={t('actions.add')}
      emptyTitle={t('books.notesEmpty')}
      emptyHint={t('recordNotes.emptyHint')}
    />
  )
}
