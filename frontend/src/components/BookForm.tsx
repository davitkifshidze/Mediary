import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Plus, Search } from 'lucide-react'
import {
  BOOK_FORMATS,
  BOOK_STATUSES,
  createBook,
  fetchBookCandidates,
  fetchBookDraft,
  updateBook,
  type Book,
  type BookCandidate,
  type BookGenre,
  type BookInput,
  type BookLink,
} from '@/api/books'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BookGenreDialog } from '@/components/BookGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldLabel } from '@/components/ui/field-label'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   წიგნის ფორმა (Tasks §12).

   „სწრაფი შევსება" TMDB-ის ზუსტი ანალოგია, ოღონდ წყარო **Open Library**-ია
   (კლავიშს არ ითხოვს): ჯერ კანდიდატების სია, მერე არჩეულის დრაფტი.
   ⚠️ ავტომატურად არაფერი ემთხვევა და დრაფტი **მხოლოდ ცარიელ ველებს** ავსებს —
   ხელით შეყვანილი მონაცემი არასდროს იკარგება.
   ============================================================ */

export function BookForm({
  book,
  genres,
  onClose,
  onSaved,
}: {
  book: Book | null
  genres: BookGenre[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('book')

  const [form, setForm] = useState({
    title_ka: book?.title_ka ?? '',
    title_en: book?.title_en ?? '',
    description_ka: book?.description_ka ?? '',
    description_en: book?.description_en ?? '',
    author: book?.author ?? '',
    publisher: book?.publisher ?? '',
    isbn: book?.isbn ?? '',
    year: book?.year ? String(book.year) : '',
    pages: book?.pages ? String(book.pages) : '',
    language: book?.language ?? '',
    genreId: book?.genre_id ? String(book.genre_id) : '',
    series_name: book?.series_name ?? '',
    series_number: book?.series_number ? String(book.series_number) : '',
    format: book?.format ?? 'print',
    // ⚠️ ცარიელით იწყება — არჩევანი მომხმარებლისაა, ნაგულისხმები აღარ იწერება
    status: book?.status ?? '',
    rating: book?.rating ? String(book.rating) : '',
    tags: book?.tags ?? [],
    // §5.7 — ერთი „წყაროს / წასაკითხი ლინკი" (ადრე მხოლოდ ატვირთული ebook იყო)
    source_url: book?.source_url ?? '',
  })
  /* ⚠️ §5.7 — ბმულების რედაქტორი ფორმიდან წავიდა, `state` კი დარჩა
     **განზრახ**: ძველი ჩანაწერის `links` ისევ იგზავნება და რედაქტირება მას
     ჩუმად არ შლის. ახალი ბმული ახლა `source_url`-შია. */
  const [links] = useState<BookLink[]>(book?.links ?? [])
  const [openLibraryId, setOpenLibraryId] = useState(book?.openlibrary_id ?? '')
  const [coverId, setCoverId] = useState<number | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(storageUrl(book?.cover))
  const [removeCover, setRemoveCover] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGenre, setNewGenre] = useState(false)

  /* ---------- სწრაფი შევსება Open Library-დან ---------- */

  const [lookupQuery, setLookupQuery] = useState('')
  const [candidates, setCandidates] = useState<BookCandidate[] | null>(null)
  // ⚠️ „ქართული → ხელით" ცალკე მდგომარეობაა და არა ცარიელი სია (§5.7)
  const [lookupNotice, setLookupNotice] = useState<string | null>(null)

  const lookup = useMutation({
    mutationFn: () => {
      const value = lookupQuery.trim()
      // ციფრებისგან შემდგარი 10/13-ნიშნა სტრიქონი ISBN-ია და არა სათაური
      const isIsbn = /^[0-9Xx-]{10,17}$/.test(value)
      return fetchBookCandidates(isIsbn ? { isbn: value } : { query: value })
    },
    onSuccess: (data) => {
      setCandidates(data.results)
      setLookupNotice(data.notice)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const pick = useMutation({
    /**
     * ⚠️ დრაფტი და ძებნის შედეგი **ერთდება**. ძებნის რიგს აქვს ისეთი ველები,
     * რაც ნაწარმოებზე არ დევს (`pages` მედიანა, `isbn`), დეტალებს კი — აღწერა
     * და გამომცემელი. ერთის მეორეთი ჩანაცვლება მონაცემს კარგავდა.
     */
    mutationFn: async (candidate: BookCandidate) => {
      if (!candidate.key) return candidate
      const draft = await fetchBookDraft(candidate.key)
      const merged = { ...candidate }
      for (const [key, value] of Object.entries(draft)) {
        if (value !== null && value !== '' && !(Array.isArray(value) && !value.length)) {
          ;(merged as Record<string, unknown>)[key] = value
        }
      }
      return merged
    },
    onSuccess: (draft) => {
      applyDraft(draft)
      setCandidates(null)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ⚠️ **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არასდროს ვაბათილებთ */
  const applyDraft = (draft: BookCandidate) => {
    setForm((f) => ({
      ...f,
      title_en: f.title_en || (draft.title ?? ''),
      description_en: f.description_en || (draft.description ?? ''),
      author: f.author || (draft.author ?? ''),
      publisher: f.publisher || (draft.publisher ?? ''),
      isbn: f.isbn || (draft.isbn ?? ''),
      year: f.year || (draft.year ? String(draft.year) : ''),
      pages: f.pages || (draft.pages ? String(draft.pages) : ''),
      language: f.language || (draft.language ?? ''),
      tags: f.tags.length ? f.tags : draft.subjects.slice(0, 5),
    }))
    if (draft.key) setOpenLibraryId(draft.key)
    // ყდა შენახვისას ჩამოიტვირთება; **კვოტაში არ ითვლება** (19.4/B)
    if (draft.cover_id && !coverPreview) {
      setCoverId(draft.cover_id)
      setCoverPreview(`https://covers.openlibrary.org/b/id/${draft.cover_id}-M.jpg`)
    }
  }

  /* ---------- შენახვა ---------- */

  const save = useMutation({
    mutationFn: (input: BookInput) => (book ? updateBook(book.id, input) : createBook(input)),
    onSuccess: () => {
      toast({ title: t('books.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და ჟანრიც სავალდებულოა — შემოწმება ქსელამდე, რათა ველი
       იმავე წამს გაწითლდეს. გასაღებები backend-ის შეცდომებისაა, ე.ი. ცემა ერთია. */
    const picked = pickErrors(
      { status: form.status, genre_id: form.genreId },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)

      return
    }

    setErrors({})

    const { tags, removed } = dedupeTags(form.tags)
    if (removed > 0) {
      setForm((f) => ({ ...f, tags }))
      toast({ title: t('tags.duplicate', { count: removed }), variant: 'info' })
    }

    save.mutate({
      title_ka: form.title_ka || null,
      title_en: form.title_en || null,
      description_ka: form.description_ka || null,
      description_en: form.description_en || null,
      author: form.author || null,
      publisher: form.publisher || null,
      isbn: form.isbn || null,
      year: form.year ? Number(form.year) : null,
      pages: form.pages ? Number(form.pages) : null,
      language: form.language || null,
      genre_id: form.genreId ? Number(form.genreId) : null,
      series_name: form.series_name || null,
      series_number: form.series_number ? Number(form.series_number) : null,
      format: form.format,
      // ⚠️ ზემოთი დაცვა უკვე დაადგინა, რომ ცარიელი არ არის — ეს მხოლოდ ტიპის დავიწროებაა
      status: form.status as (typeof BOOK_STATUSES)[number],
      source_url: form.source_url || null,
      /* ⚠️ §5.7 — ეს სამი ველი **ფორმაზე აღარ ჩანს**, მაგრამ payload-ში რჩება
         განზრახ: `rating`/`series_*` არსებულ ჩანაწერს რომ არ წაეშალოს
         რედაქტირებაზე, `tags`/`isbn`/`description_en` კი Open Library-დან
         ივსება (ტეგების ფილტრი სწორედ ამით სუნთქავს). ცარიელი მნიშვნელობის
         გაგზავნა ჩუმად წაშლიდა იმას, რაც წყარომ მოიტანა. */
      rating: form.rating ? Number(form.rating) : null,
      tags,
      links: links.filter((l) => l.url.trim()),
      openlibrary_id: openLibraryId || null,
      openlibrary_cover_id: coverId,
      cover,
      remove_cover: removeCover,
    })
  }

  return (
    <ModalShell title={t(book ? 'books.edit' : 'books.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* ---------- სწრაფი შევსება ---------- */}
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <Label htmlFor="b-lookup">{t('books.lookup')}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="b-lookup"
              placeholder={t('books.lookupPlaceholder')}
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // ⚠️ ფორმის submit-ს ვაჩერებთ — Enter აქ „ძებნას" ნიშნავს
                  e.preventDefault()
                  if (lookupQuery.trim()) lookup.mutate()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!lookupQuery.trim() || lookup.isPending}
              onClick={() => lookup.mutate()}
            >
              {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t('books.lookupSearch')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('books.lookupHint')}</p>

          {candidates && (
            <div className="mt-3 space-y-1.5">
              {!candidates.length && (
                <p className="text-xs text-muted-foreground">
                  {lookupNotice === 'manual_only' ? t('books.lookupManualOnly') : t('books.lookupEmpty')}
                </p>
              )}
              {candidates.map((candidate) => (
                <button
                  key={candidate.key || candidate.isbn}
                  type="button"
                  disabled={pick.isPending}
                  onClick={() => pick.mutate(candidate)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted"
                >
                  {candidate.cover_id ? (
                    <img
                      src={`https://covers.openlibrary.org/b/id/${candidate.cover_id}-S.jpg`}
                      alt=""
                      className="h-12 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="h-12 w-8 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{candidate.title ?? '—'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[candidate.author, candidate.year, candidate.publisher]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- სათაური ორ ენაზე ---------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {/* ⚠️ სათაური `locked`-ია (§6.5) — ერთი ენა მაინც სავალდებულოა.
                ლეიბლი მაინც რედაქტორიდან მოდის, ენის მინიშნება კი ემატება,
                თორემ ორივე ველი ერთნაირად დაიწერებოდა. */}
            <FieldLabel htmlFor="b-title-ka" required hint={t('form.requiredEitherLang')}>
              {fields.label('title')} · {t('fields.langKa')}
            </FieldLabel>
            <Input
              id="b-title-ka"
              value={form.title_ka}
              onChange={(e) => setForm((f) => ({ ...f, title_ka: e.target.value }))}
            />
            {errors.title_ka && <p className="mt-1 text-xs text-destructive">{errors.title_ka}</p>}
          </div>
          <div>
            <FieldLabel htmlFor="b-title-en" required hint={t('form.requiredEitherLang')}>
              {fields.label('title')} · {t('fields.langEn')}
            </FieldLabel>
            <Input
              id="b-title-en"
              value={form.title_en}
              onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
            />
            {errors.title_en && <p className="mt-1 text-xs text-destructive">{errors.title_en}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className={fields.shows('author') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-author" required={fields.required('author')} hint={fields.hint('author')}>
              {fields.label('author')}
            </FieldLabel>
            <Input
              id="b-author"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            />
          </div>
          {fields.shows('publisher') && (
            <div>
              <FieldLabel htmlFor="b-publisher" required={fields.required('publisher')} hint={fields.hint('publisher')}>
                {fields.label('publisher')}
              </FieldLabel>
              <Input
                id="b-publisher"
                placeholder={fields.placeholder('publisher')}
                value={form.publisher}
                onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
              />
            </div>
          )}
          {/* §5.7 — ISBN ფორმიდან მოხსნილია (Open Library-დან მაინც ივსება) */}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className={fields.shows('year') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-year" required={fields.required('year')} hint={fields.hint('year')}>
              {fields.label('year')}
            </FieldLabel>
            <Input
              id="b-year"
              type="number"
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </div>
          <div className={fields.shows('pages') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-pages" required={fields.required('pages')} hint={fields.hint('pages')}>
              {fields.label('pages')}
            </FieldLabel>
            <Input
              id="b-pages"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.pages}
              onChange={(e) => setForm((f) => ({ ...f, pages: e.target.value }))}
            />
          </div>
          <div className={fields.shows('language') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-language" required={fields.required('language')} hint={fields.hint('language')}>
              {fields.label('language')}
            </FieldLabel>
            <Input
              id="b-language"
              placeholder="ka / en / ru"
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
            />
          </div>
          {/* §5.7 — „ჩემი ქულა" ფორმიდან მოხსნილია (ძველი მნიშვნელობა რჩება) */}
        </div>

        {/* §5.7 — **ახალი ველი**: წყაროს / წასაკითხი ლინკი. ⚠️ ატვირთულ
            ebook ფაილს არ ცვლის — ეს გარე ბმულია (მაღაზია, ბიბლიოთეკა). */}
        <div className={fields.shows('source_url') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="b-source-url" required={fields.required('source_url')} hint={fields.hint('source_url')}>
            {fields.label('source_url')}
          </FieldLabel>
          <Input
            id="b-source-url"
            type="url"
            placeholder="https://…"
            value={form.source_url}
            onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
          />
          {errors.source_url && <p className="mt-1 text-xs text-destructive">{errors.source_url}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className={fields.shows('format') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-format" required={fields.required('format')} hint={fields.hint('format')}>
              {fields.label('format')}
            </FieldLabel>
            <Select
              value={form.format}
              onValueChange={(v) => setForm((f) => ({ ...f, format: v as typeof f.format }))}
            >
              <SelectTrigger id="b-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOK_FORMATS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`books.formats.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="b-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger
                id="b-status"
                className={errors.status ? 'border-destructive' : undefined}
              >
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {BOOK_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`books.statuses.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>
          {/* §5.7 — სერია/ნომერი ფორმიდან მოხსნილია (ძველი მნიშვნელობა რჩება
              და სიაში ისევ ჩანს; დალაგებაც მუშაობს) */}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('genre') ? undefined : 'hidden'}>
            {/* ჟანრი — per-user ლექსიკონიდან, გვერდით „ახალი ჟანრი" */}
            <FieldLabel htmlFor="b-genre" required={fields.required('genre')} hint={fields.hint('genre')}>
              {fields.label('genre')}
            </FieldLabel>
            <div className="flex gap-1">
              <Select
                value={form.genreId}
                onValueChange={(v) => setForm((f) => ({ ...f, genreId: v }))}
              >
                <SelectTrigger
                  id="b-genre"
                  className={errors.genre_id ? 'border-destructive' : undefined}
                >
                  <SelectValue placeholder={t('validation.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre.id} value={String(genre.id)}>
                      {dictionaryName(genre, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setNewGenre(true)}
                title={t('bookGenres.add')}
                aria-label={t('bookGenres.add')}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {errors.genre_id && <p className="mt-1 text-xs text-destructive">{errors.genre_id}</p>}

            {/* §5.7 — ტეგები და მრავალი ბმული ფორმიდან მოხსნილია: ბმულს ახლა
                ერთი „წყაროს ლინკი" ცვლის, ტეგებს კი Open Library ავსებს
                (ფილტრების პანელი მათზე ისევ მუშაობს). */}
          </div>

          <div className={fields.shows('cover') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('cover')} hint={fields.hint('cover')}>
              {fields.label('cover')}
            </FieldLabel>
            <PosterUploader
              hint={t('books.coverHint')}
              preview={coverPreview}
              onSelect={(file) => {
                setCover(file)
                setCoverId(null)
                setRemoveCover(false)
                setCoverPreview(URL.createObjectURL(file))
              }}
              onClear={() => {
                setCover(null)
                setCoverId(null)
                setCoverPreview(null)
                setRemoveCover(true)
              }}
            />
          </div>
        </div>

        {/* §5.7 — **მხოლოდ ქართული აღწერა** რჩება ფორმაზე. ინგლისური სვეტი
            არსად წასულა: Open Library სწორედ მას ავსებს და ჩანაწერზე ჩანს. */}
        <div className={fields.shows('description') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="b-desc-ka" required={fields.required('description')} hint={fields.hint('description')}>
            {fields.label('description')} · {t('fields.langKa')}
          </FieldLabel>
          <Textarea
            id="b-desc-ka"
            rows={4}
            value={form.description_ka}
            onChange={(e) => setForm((f) => ({ ...f, description_ka: e.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>

      {/* §6 ფაზა 3 — მორგებული ველები. ⚠️ `<form>`-ის **გარეთაა**: ბარათი
          თვითონ ინახავს თავს (მნიშვნელობები ცალკე ცხრილშია) და ჩადგმული
          ღილაკი მშობელი ფორმის submit-ს გაუშვებდა. */}
      <div className="mt-4">
        <CustomFieldsCard module="book" recordId={book?.id ?? null} />
      </div>

      {/* სწრაფი „ახალი ჟანრი" — შენახვისთანავე select-ში ირჩევა */}
      {newGenre && (
        <BookGenreDialog
          genre={null}
          onClose={() => setNewGenre(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, genreId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
