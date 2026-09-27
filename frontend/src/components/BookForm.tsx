import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  BOOK_FORMATS,
  BOOK_LANGUAGES,
  BOOK_MAX_RATING,
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
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BookGenreDialog } from '@/components/BookGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldLabel } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import {
  QuickFill,
  QuickFillCandidate,
  QuickFillMessage,
  QuickFillResults,
  QuickFillSearch,
} from '@/components/ui/quick-fill'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { RatingSelect } from '@/components/ui/rating-select'
import { useRecordExtras } from '@/lib/customFieldDraft'

/* ============================================================
   წიგნის ფორმა (Tasks §12).

   „სწრაფი შევსება" TMDB-ის ზუსტი ანალოგია, ოღონდ წყარო **Open Library**-ია
   (კლავიშს არ ითხოვს): ჯერ კანდიდატების სია, მერე არჩეულის დრაფტი.
   ⚠️ ავტომატურად არაფერი ემთხვევა და დრაფტი **მხოლოდ ცარიელ ველებს** ავსებს —
   ხელით შეყვანილი მონაცემი არასდროს იკარგება.
   ============================================================ */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'book-form'

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
    // Tasks §25.4 — რიცხვი ან `null` (`RatingSelect`), სტრიქონი აღარ
    rating: book?.rating ?? null,
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
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ წიგნზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('book', book)

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
    mutationFn: (input: BookInput) => (extras.current ? updateBook(extras.current.id, input) : createBook(input)),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['books'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      toast({ title: t('books.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს** (Tasks §4.1): ბლოკი
     `hidden`-ითაა, ე.ი. შეცდომა DOM-შია და ეკრანზე არა — ღილაკი „შენახვა"
     ვიზუალურად არაფერს აკეთებდა. ამიტომ ასეთი ველი თოსტით სახელდება. */
  const warnHidden = (missing: string[]) => {
    const hidden = hiddenPicks(missing, fields.shows)

    if (hidden.length > 0) {
      toast({
        title: t('validation.hiddenRequired', {
          fields: hidden.map((key) => fields.label(key)).join(', '),
        }),
        variant: 'error',
      })
    }
  }

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
      warnHidden(Object.keys(picked))

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
      /* ⚠️ §5.7 — `series_*`, `tags`, `isbn` და `description_en` **ფორმაზე
         აღარ ჩანს**, მაგრამ payload-ში რჩება განზრახ: სერია არსებულ ჩანაწერს
         რომ არ წაეშალოს რედაქტირებაზე, დანარჩენი კი Open Library-დან
         ივსება (ტეგების ფილტრი სწორედ ამით სუნთქავს). ცარიელი მნიშვნელობის
         გაგზავნა ჩუმად წაშლიდა იმას, რაც წყარომ მოიტანა.
         Tasks §25.4 — ქულა ისევ ფორმაზეა; `null` („გარეშე") ქულას ასუფთავებს. */
      rating: form.rating,
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
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ---------- §26.2 — სწრაფი შევსება (ყველა ფორმის ერთი ბლოკი) ---------- */}
        <QuickFill title={t('books.lookup')} hint={t('books.lookupHint')} htmlFor="b-lookup">
          <QuickFillSearch
            id="b-lookup"
            value={lookupQuery}
            onChange={setLookupQuery}
            onSearch={() => lookup.mutate()}
            busy={lookup.isPending}
            placeholder={t('books.lookupPlaceholder')}
            buttonLabel={t('books.lookupSearch')}
          />

          {/* ⚠️ „ქართული → ხელით" ცალკე მდგომარეობაა და არა ცარიელი სია (§5.7) */}
          {candidates && !candidates.length && (
            <QuickFillMessage>
              {lookupNotice === 'manual_only' ? t('books.lookupManualOnly') : t('books.lookupEmpty')}
            </QuickFillMessage>
          )}

          {candidates && candidates.length > 0 && (
            <QuickFillResults>
              {candidates.map((candidate) => (
                <QuickFillCandidate
                  key={candidate.key || candidate.isbn}
                  image={
                    candidate.cover_id ? `https://covers.openlibrary.org/b/id/${candidate.cover_id}-S.jpg` : null
                  }
                  title={candidate.title ?? '—'}
                  meta={[candidate.author, candidate.year, candidate.publisher].filter(Boolean).join(' · ')}
                  disabled={pick.isPending}
                  onPick={() => pick.mutate(candidate)}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>

        {/* ---------- §26 — ყდა ზემოთაა, სახელთან, ავტორთან და აღწერასთან ერთად ---------- */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('cover') && (
              <>
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
              </>
            )
          }
        >
          {/* ⚠️ სათაური `locked`-ია (§6.5) — ერთი ენა მაინც სავალდებულოა.
              ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` აქაც ისმის.
              ლეიბლი მაინც რედაქტორიდან მოდის, ენის მინიშნება კი ემატება,
              თორემ ორივე ველი ერთნაირად დაიწერებოდა. */}
          <FormField
            size="half"
            show={fields.shows('title')}
            label={`${fields.label('title')} · ${t('fields.langKa')}`}
            htmlFor="b-title-ka"
            required
            hint={t('form.requiredEitherLang')}
            error={errors.title_ka}
          >
            <Input
              id="b-title-ka"
              value={form.title_ka}
              onChange={(e) => setForm((f) => ({ ...f, title_ka: e.target.value }))}
            />
          </FormField>
          <FormField
            size="half"
            show={fields.shows('title')}
            label={`${fields.label('title')} · ${t('fields.langEn')}`}
            htmlFor="b-title-en"
            required
            hint={t('form.requiredEitherLang')}
            error={errors.title_en}
          >
            <Input
              id="b-title-en"
              value={form.title_en}
              onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('author')} htmlFor="b-author">
            <Input
              id="b-author"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            />
          </FormField>
          <FormField size="half" {...fields.field('publisher')} htmlFor="b-publisher">
            <Input
              id="b-publisher"
              placeholder={fields.placeholder('publisher')}
              value={form.publisher}
              onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
            />
          </FormField>
          {/* §5.7 — ISBN ფორმიდან მოხსნილია (Open Library-დან მაინც ივსება) */}

          {/* §5.7 — **მხოლოდ ქართული აღწერა** რჩება ფორმაზე. ინგლისური სვეტი
              არსად წასულა: Open Library სწორედ მას ავსებს და ჩანაწერზე ჩანს. */}
          <FormField
            {...fields.field('description')}
            label={`${fields.label('description')} · ${t('fields.langKa')}`}
            htmlFor="b-desc-ka"
          >
            <Textarea
              id="b-desc-ka"
              rows={FORM_TEXT_ROWS}
              value={form.description_ka}
              onChange={(e) => setForm((f) => ({ ...f, description_ka: e.target.value }))}
            />
          </FormField>
        </FormSection>

        {/* ---------- კლასიფიკაცია: სტატუსი · ჟანრი · ქულა ---------- */}
        <FormSection title={t('form.sections.classification')}>
          <FormField size="third" {...fields.field('status')} htmlFor="b-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}>
              <SelectTrigger id="b-status" className={errors.status ? 'border-destructive' : undefined}>
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
          </FormField>

          {/* ჟანრი — per-user ლექსიკონიდან, გვერდით „ახალი ჟანრი" */}
          <FormField size="third" {...fields.field('genre')} htmlFor="b-genre" error={errors.genre_id}>
            <div className="flex gap-1">
              <Select value={form.genreId} onValueChange={(v) => setForm((f) => ({ ...f, genreId: v }))}>
                <SelectTrigger id="b-genre" className={errors.genre_id ? 'border-destructive' : undefined}>
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
            {/* §5.7 — ტეგები და მრავალი ბმული ფორმიდან მოხსნილია: ბმულს ახლა
                ერთი „წყაროს ლინკი" ცვლის, ტეგებს კი Open Library ავსებს
                (ფილტრების პანელი მათზე ისევ მუშაობს). */}
          </FormField>

          {/* Tasks §25.4 — „ჩემი ქულა" ერთი ამრჩევით (ხუთივე ფორმაში იგივე) */}
          <FormField size="third" {...fields.field('rating')} htmlFor="b-rating" error={errors.rating}>
            <RatingSelect
              id="b-rating"
              max={BOOK_MAX_RATING}
              value={form.rating}
              invalid={!!errors.rating}
              onChange={(rating) => setForm((f) => ({ ...f, rating }))}
            />
          </FormField>
        </FormSection>

        {/* ---------- დეტალები: წელი · გვერდები · ენა · ფორმატი + წყაროს ბმული ---------- */}
        <FormSection title={t('form.sections.details')}>
          <FormField size="quarter" {...fields.field('year')} htmlFor="b-year">
            <Input
              id="b-year"
              type="number"
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </FormField>
          <FormField size="quarter" {...fields.field('pages')} htmlFor="b-pages">
            <Input
              id="b-pages"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.pages}
              onChange={(e) => setForm((f) => ({ ...f, pages: e.target.value }))}
            />
          </FormField>
          <FormField size="quarter" {...fields.field('language')} htmlFor="b-language">
            <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
              <SelectTrigger id="b-language">
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {BOOK_LANGUAGES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`books.languages.${value}`)}
                  </SelectItem>
                ))}
                {/* ⚠️ **ჩანაწერის საკუთარი მნიშვნელობა, თუ ის სიაში არაა.**
                    ჩვენივე `OpenLibraryClient` აბრუნებს `de`/`fr`-საც და
                    დანარჩენზე ნედლ MARC კოდს (`spa`, `ita`, `jpn`…). ასეთი
                    მნიშვნელობა მკაცრ სიაში **ცარიელ სელექტად** დაიხატებოდა
                    და პირველივე შენახვა `language`-ს `null`-ად გადააწერდა —
                    ე.ი. მონაცემს დაკარგავდა. */}
                {form.language && !(BOOK_LANGUAGES as readonly string[]).includes(form.language) && (
                  <SelectItem value={form.language}>{form.language}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </FormField>
          <FormField size="quarter" {...fields.field('format')} htmlFor="b-format">
            <Select value={form.format} onValueChange={(v) => setForm((f) => ({ ...f, format: v as typeof f.format }))}>
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
          </FormField>
          {/* §5.7 — სერია/ნომერი ფორმიდან მოხსნილია (ძველი მნიშვნელობა რჩება
              და სიაში ისევ ჩანს; დალაგებაც მუშაობს) */}

          {/* §5.7 — **ახალი ველი**: წყაროს / წასაკითხი ლინკი. ⚠️ ატვირთულ
              ebook ფაილს არ ცვლის — ეს გარე ბმულია (მაღაზია, ბიბლიოთეკა). */}
          <FormField {...fields.field('source_url')} htmlFor="b-source-url" error={errors.source_url}>
            <Input
              id="b-source-url"
              type="url"
              placeholder="https://…"
              value={form.source_url}
              onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
            />
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები. ⚠️ `<form>`-ის **გარეთაა**:
          არსებულ წიგნზე ბარათი თვითონ ინახავს თავს, ახალზე — მონახაზია */}
      <CustomFieldsCard
        module="book"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

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
