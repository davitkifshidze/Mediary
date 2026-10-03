import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, BookOpenCheck, Download, ExternalLink, FileText, Paperclip, Quote, Trash2, Upload } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import {
  createBookNote,
  deleteBookFile,
  deleteBookNote,
  fetchBookFiles,
  fetchBookNotes,
  setBookStatus,
  updateBookNote,
  BOOK_STATUSES,
  type BookStatus,
  uploadBookFiles,
  type Book,
  toggleBookFavorite,
} from '@/api/books'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { RecordNotes } from '@/components/RecordNotes'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { RecordGallery } from '@/components/RecordGallery'
import { ProgressCard, ProgressDialog } from '@/components/BookProgress'
import { BookQuotes, QuoteDialog } from '@/components/BookQuotes'
import { Tabs } from '@/components/ui/tabs'
import { favoriteAction, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { RatingStars } from '@/components/ui/star-rating'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
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

/** §22.2 — სწრაფი ჩიპები ვებძებნისთვის (`books.webChips.*`) */
const BOOK_WEB_TERMS = ['characters', 'author', 'adaptation', 'covers', 'illustrations'] as const

export function BookDetail({ book, onClose }: { book: Book; onClose: () => void }) {
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favoriteQc = useQueryClient()
  const favorite = useMutation({
    mutationFn: () => toggleBookFavorite(book.id),
    onSuccess: () => void favoriteQc.invalidateQueries({ queryKey: ['books'] }),
  })
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §22.2 — ვებძებნის ჩიპები შინაარსის ენაზე და არა ინტერფეისისაზე
  const fixedT = i18n.getFixedT(lang)
  /* Tasks §23.4 — ციტატის/გვერდის დიალოგები მენიუდან */
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const { toast: notify } = useToast()
  const statusMut = useMutation({
    mutationFn: (next: BookStatus) => setBookStatus(book.id, next),
    onSuccess: () => void favoriteQc.invalidateQueries({ queryKey: ['books'] }),
    onError: (e) => notify({ title: errorMessage(e), variant: 'error' }),
  })

  const title = book.title_en || book.title_ka || '—'
  const description =
    lang === 'ka' ? book.description_ka || book.description_en : book.description_en || book.description_ka
  // §5.7 — წყაროს ბმული + ძველი ჩანაწერის `links` (ფორმიდან მოხსნილი, მაგრამ შენახული)
  const links = [
    ...(book.source_url ? [{ label: t('fields.name.book.source_url'), url: book.source_url }] : []),
    ...book.links,
  ]

  /* Tasks §23.4 — კონტექსტური მენიუ დეტალის სათაურზე: სტატუსი ▸ · რჩეული ·
     ციტატის დამატება · გვერდის განახლება (იგივე პუნქტები, რაც სიის სტრიქონს აქვს) */
  const heroActions: MenuAction[] = [
    {
      key: 'status',
      label: t('form.status'),
      sub: BOOK_STATUSES.map((s) => ({
        key: `status:${s}`,
        label: t(`books.statuses.${s}`),
        checked: book.status === s,
        run: () => statusMut.mutate(s),
      })),
    },
    favoriteAction(book.is_favorite, () => favorite.mutate(), t),
    { key: 'quote', label: t('books.menuAddQuote'), icon: Quote, separator: true, run: () => setQuoteOpen(true) },
    { key: 'progress', label: t('books.menuProgress'), icon: BookOpenCheck, run: () => setProgressOpen(true) },
  ]

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: ყდა, სტატუსი, ჟანრი, მოკლე ცნობები (§26.4) ---------- */}
        <RecordContextMenu actions={heroActions}>
        <DetailHero
          image={storageUrl(book.cover)}
          alt={title}
          fallback={<BookOpen className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="book" status={book.status} />
              {/* Tasks §9 — ვარსკვლავები და „4.6 / 10" დეტალის თავში */}
              <RatingStars value={book.rating} />
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={book.visibility} />
              {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
              <VisitBadge type="book" id={book.id} />
              <FavoriteButton size="xs" active={book.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
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
        </RecordContextMenu>

        <ProgressCard book={book} />

        {/* ---------- გალერეა (Tasks §22) — ორი საცავი ერთ ხედად: შენი ატვირთული
            ფოტოები (`book_files image`) და ვებიდან ჩამოტვირთული (`gallery_images`,
            გალერეის მოდული) ბეჯებით „ატვირთული" / „ვებიდან" ---------- */}
        <DetailSection title={t('books.galleryTitle')} hint={t('books.galleryHint')}>
          <div className="space-y-6">
            <Photos book={book} />
            <RecordGallery
              type="book"
              id={book.id}
              bare
              query={[lang === 'ka' ? book.title_ka || book.title_en : book.title_en || book.title_ka, book.author]
                .filter(Boolean)
                .join(' ')}
              terms={BOOK_WEB_TERMS.map((key) => fixedT(`books.webChips.${key}`))}
            />
          </div>
        </DetailSection>

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
          <NotesCard book={book} onAddQuote={() => setQuoteOpen(true)} />
        </DetailSection>
      </div>

      {quoteOpen && <QuoteDialog book={book} onClose={() => setQuoteOpen(false)} />}
      {progressOpen && <ProgressDialog book={book} onClose={() => setProgressOpen(false)} />}
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
      /* §22.3 — ორი საცავი ერთ ხედად: ეს ბლოკი „ატვირთულია", ქვემოთ — „ვებიდან" */
      title={
        <span className="inline-flex items-center gap-2">
          {t('books.photosTitle')}
          <Badge className="bg-secondary text-secondary-foreground">{t('gallery.uploadedBadge')}</Badge>
        </span>
      }
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

/* ---------- ფაილები ---------- */

/**
 * Tasks §23.1 — **„ფაილის მიმაგრება"**: ერთი კომპაქტური ზონა „ჩააგდე ან აირჩიე"
 * და სია. სახის ჩიპები ქრება — სერვერი სახეს გაფართოებით ხვდება (`pdf/epub/…` →
 * წიგნი, დანარჩენი → დოკუმენტი; ფოტო ზემოთ ვიტრინად დგას); `accept` ორივე სიის
 * გაერთიანებაა, ლიმიტი სახეზე, როგორც იყო.
 */
const ATTACH_ACCEPT: Record<string, string[]> = {
  'application/*': ['.pdf', '.epub', '.mobi', '.azw3', '.djvu', '.doc', '.docx', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip'],
  'text/*': ['.txt', '.csv'],
}

function FilesCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()

  const { data: all = [], isLoading } = useQuery({
    queryKey: ['book-files', book.id],
    queryFn: () => fetchBookFiles(book.id),
  })
  const files = all.filter((file) => file.kind !== 'image')

  // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
  const done = useBookFilesRefresh(book)
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadBookFiles(book.id, null, picked),
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

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length) upload.mutate(accepted)
    },
    accept: ATTACH_ACCEPT,
    multiple: true,
    disabled: upload.isPending,
  })

  return (
    <div>
      <div
        {...getRootProps()}
        data-testid="attach-zone"
        className={cn(
          'mb-3 flex cursor-pointer items-center gap-3 rounded-md border border-dashed px-3 py-2.5 text-sm transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
          upload.isPending && 'opacity-60',
        )}
      >
        <input {...getInputProps()} />
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">{upload.isPending ? t('actions.saving') : t('books.dropHint')}</span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{t('books.dropFormats')}</span>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !files.length && (
        /* ⚠️ ბარე ნაცრისფერი `<p>` იყო — ზუსტად ის შემთხვევა, რისთვისაც
           `EmptyState` დაიწერა (რა ცარიელია · რატომ · რა არის შემდეგი). */
        <EmptyState
          icon={<Paperclip className="size-6" />}
          title={t('books.filesEmpty')}
          hint={t('books.filesHint')}
          actions={
            <Button variant="outline" size="sm" onClick={open}>
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

function NotesCard({ book, onAddQuote }: { book: Book; onAddQuote: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'notes' | 'quotes'>('notes')
  const { data: notes = [] } = useQuery({ queryKey: ['book-notes', book.id], queryFn: () => fetchBookNotes(book.id) })
  const quotes = notes.filter((n) => n.is_quote).length
  const plain = notes.length - quotes

  /* Tasks §23.2 — ⚠️ **ორი ჩანართი, ერთი ცხრილი**: `book_notes` ჩანიშვნასაც და
     ციტატასაც ინახავს (`is_quote`), მაგრამ ეკრანზე ისინი სხვადასხვა რამაა.
     ჩანიშვნების სხეული საერთოა (`RecordNotes`, ოთხი სხვა მოდულიც მას იყენებს),
     ციტატები — `BookQuotes`. ⚠️ ქეშის გასაღებები: ყველა ჩანიშვნა `['book-notes', id]`,
     გაფილტრული — `[..., 'notes']`; პრეფიქსით ორივე ინვალიდირდება. */
  return (
    <div>
      <Tabs
        items={[
          { value: 'notes', label: t('books.notesTab'), badge: plain || undefined },
          { value: 'quotes', label: t('books.quotesTab'), badge: quotes || undefined },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-3"
      />
      {tab === 'notes' ? (
        <RecordNotes
          queryKey={['book-notes', book.id, 'notes']}
          invalidate={[['books'], ['book-notes', book.id]]}
          api={{
            list: async () => (await fetchBookNotes(book.id)).filter((n) => !n.is_quote),
            create: (input) => createBookNote(book.id, input),
            update: (id, input) => updateBookNote(id, input),
            remove: deleteBookNote,
          }}
          placeholder={t('books.notePlaceholder')}
          addLabel={t('actions.add')}
          emptyTitle={t('books.notesEmpty')}
          emptyHint={t('recordNotes.emptyHint')}
        />
      ) : (
        <BookQuotes book={book} onAdd={onAddQuote} />
      )}
    </div>
  )
}
