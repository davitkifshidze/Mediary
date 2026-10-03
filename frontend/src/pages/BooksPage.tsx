import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  BookOpen,
  ExternalLink,
  FileText,
  Loader2,
  SquarePen,
  Plus,
  Quote,
  Search,
  Tags,
  Trash2,
  BookOpenCheck,
  Images,
} from 'lucide-react'
import {
  BOOK_STATUSES,
  setBookStatus,
  deleteBook,
  fetchBookGenres,
  fetchBooks,
  toggleBookFavorite,
  type Book,
  type BookFilters,
} from '@/api/books'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BookDetail } from '@/components/BookDetail'
import { ProgressDialog } from '@/components/BookProgress'
import { QuoteDialog } from '@/components/BookQuotes'
import { BookForm } from '@/components/BookForm'
import { ModuleIcon } from '@/components/ModuleIcon'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { useFilterDraft } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitCount } from '@/components/RecordVisits'
import { favoriteAction, MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { RatingBadge } from '@/components/ui/star-rating'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

/* ============================================================
   წიგნების მოდული (`book`, Tasks §12).

   იგივე მოდელი, რაც სიმღერებზე: **სტატუსი საიდბარის სექციაა** (`?view=`)
   და არა ფილტრების პანელის ნაწილი (Tasks 3-ის წესი), პანელი კი ჟანრებსა
   და ტეგებს ფილტრავს. მოქმედი ფილტრი მისამართშია — back და გაზიარებული
   ბმული ერთსა და იმავეს აჩვენებს.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'author', 'series', 'year', 'rating', 'pages'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { genres: [] as string[], tags: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function BooksPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  const genres = useMemo(
    () => new URLSearchParams(search).get('genre')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const tags = useMemo(
    () => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [],
    [search],
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Book | 'new' | null>(null)
  const [opened, setOpened] = useState<Book | null>(null)
  /* Tasks §23.4 — კონტექსტური მენიუს დიალოგები სიიდან */
  const [quoteFor, setQuoteFor] = useState<Book | null>(null)
  const [progressFor, setProgressFor] = useState<Book | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: BookFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „რჩეული" და „ყველა" სტატუსს არ ნიშნავს — დანარჩენი სექცია სტატუსია
    status: (BOOK_STATUSES as readonly string[]).includes(view) ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['books', filters, limit],
    queryFn: () => fetchBooks({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const genresQ = useQuery({ queryKey: ['book-genres'], queryFn: fetchBookGenres })
  const books = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allGenres = useMemo(() => genresQ.data ?? [], [genresQ.data])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['books'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleBookFavorite, onSuccess: invalidate, onError: fail })
  // Tasks §7 — სტატუსი კონტექსტური მენიუდან (სიაში ბეჯი მხოლოდ აჩვენებს)
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: (typeof BOOK_STATUSES)[number] }) => setBookStatus(id, next),
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: deleteBook,
    onSuccess: () => {
      invalidate()
      // ფაილები წიგნთან ერთად იშლება — კვოტის ინდიკატორიც უნდა განახლდეს
      qc.invalidateQueries({ queryKey: ['storage'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: fail,
  })

  /** ფორმის ტეგების შემოთავაზებები — ყველა სექციიდან დანახული ტეგი გროვდება */
  const [knownTags, setKnownTags] = useState<string[]>([])
  useEffect(() => {
    if (!books.length) return
    setKnownTags((prev) => {
      const merged = new Set([...prev, ...books.flatMap((b) => b.tags)])
      return merged.size === prev.length ? prev : [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [books])

  const tagOptions = useMemo(() => {
    const set = new Set([...knownTags, ...books.flatMap((b) => b.tags), ...tags])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [knownTags, books, tags])

  /* ---------- ფილტრის გაშვება ---------- */

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.genres.length) p.set('genre', next.genres.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/books', search: p.toString() })
  }

  /* მონახაზი, „ცვლილებაა?", გასუფთავება და მრიცხველი — ერთი აღწერა
     `lib/filters.ts`-ში. ⚠️ `clear()` **ორივე მხარეს** ასუფთავებს
     (მონახაზსაც და მისამართსაც) — ადრე მხოლოდ მისამართს წერდა და უკვე
     სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა. */
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { genres, tags },
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: 'genres' | 'tags', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  const onlyGenre = genres.length === 1 ? allGenres.find((x) => String(x.id) === genres[0]) : undefined
  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : (BOOK_STATUSES as readonly string[]).includes(view)
        ? t(`books.statuses.${view}`)
        : onlyGenre
          ? dictionaryName(onlyGenre, lang)
          : t('books.title')

  const title = (book: Book) =>
    (lang === 'ka' ? book.title_ka || book.title_en : book.title_en || book.title_ka) || '—'

  return (
    <PageContainer>
      <PageHeader
        module="book"
        title={heading}
        subtitle={t('books.count', { count: total })}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('books.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('books.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`books.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Link
              to="/dictionaries/book-genres"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('bookGenres.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('books.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !books.length && (
            <EmptyState
              title={term ? t('books.noResults', { q: term }) : t('books.empty')}
              hint={term || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clear}>
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('books.add')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {books.map((book) => {
              const cover = storageUrl(book.cover)
              /* Tasks §7 — მარჯვენა ღილაკის მენიუ: გახსნა · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
              const actions: MenuAction[] = [
                { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setOpened(book) },
                {
                  key: 'status',
                  label: t('form.status'),
                  sub: BOOK_STATUSES.map((s) => ({
                    key: `status:${s}`,
                    label: t(`books.statuses.${s}`),
                    checked: book.status === s,
                    run: () => status.mutate({ id: book.id, next: s }),
                  })),
                },
                favoriteAction(book.is_favorite, () => favorite.mutate(book.id), t),
                /* Tasks §23.4 — წიგნის პუნქტები: ციტატა · გვერდი · გალერეა (დეტალში) */
                { key: 'quote', label: t('books.menuAddQuote'), icon: Quote, separator: true, run: () => setQuoteFor(book) },
                { key: 'progress', label: t('books.menuProgress'), icon: BookOpenCheck, run: () => setProgressFor(book) },
                { key: 'gallery', label: t('books.menuGallery'), icon: Images, run: () => setOpened(book) },
                { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(book) },
                {
                  key: 'delete',
                  label: t('actions.delete'),
                  icon: MENU_ICONS.delete,
                  danger: true,
                  run: async () => {
                    const ok = await confirm({
                      title: t('books.deleteTitle'),
                      description: t('books.deleteHint', { name: title(book) }),
                      variant: 'destructive',
                    })
                    if (ok) remove.mutate(book.id)
                  },
                },
              ]
              return (
                <RecordContextMenu key={book.id} actions={actions}>
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <button
                    onClick={() => setOpened(book)}
                    aria-label={t('books.open')}
                    className="grid h-16 w-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted"
                  >
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <BookOpen className="size-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setOpened(book)}
                      className="block max-w-full cursor-pointer truncate text-left text-sm font-medium hover:text-primary"
                      title={title(book)}
                    >
                      {title(book)}
                    </button>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                      {book.author && <span className="truncate">{book.author}</span>}
                      {book.series_name && (
                        <span className="truncate">
                          {book.series_name}
                          {book.series_number ? ` #${book.series_number}` : ''}
                        </span>
                      )}
                      {book.year ? <span>{book.year}</span> : null}
                      {book.genre && (
                        <span className="inline-flex items-center gap-1">
                          <ModuleIcon name={book.genre.icon} className="size-3" />
                          {dictionaryName(book.genre, lang)}
                        </span>
                      )}
                      <span>{t(`books.formats.${book.format}`)}</span>
                      {book.pages ? <span>{t('books.pagesShort', { count: book.pages })}</span> : null}
                      {(book.files_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" />
                          {book.files_count}
                        </span>
                      )}
                      {/* Tasks §6.8 — ბრჭყალების აიქონი **ციტატებს** ითვლის; `notes_count` ყველა ჩანიშვნას შეიცავდა */}
                      {(book.quotes_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Quote className="size-3" />
                          {book.quotes_count}
                        </span>
                      )}
                    </p>

                    {/* პროგრესი მხოლოდ მაშინ, როცა კითხვა დაწყებულია */}
                    {(book.progress_percent ?? 0) > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 w-32 overflow-hidden rounded-md bg-muted">
                          <div
                            className="h-full rounded-md bg-primary"
                            style={{ width: `${book.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {book.progress_percent}%
                        </span>
                      </div>
                    )}

                    {book.tags.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {book.tags.map((tag) => (
                          <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                            #{tag}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  <span className="flex shrink-0 items-center gap-1">
                    {/* Tasks §21 — ფერი როლისაა (ლექსიკონის პალიტრა), ზომა — რიგის ღილაკისა */}
                    <EnumStatusBadge domain="book" status={book.status} size="row" className="mr-1" />
                    {/* Tasks §9 — „★ 4.6" ერთი ბეჯით ყველგან */}
                    <RatingBadge value={book.rating} size="row" className="mr-1" />
                    {/* Tasks §8 — რჩეული ტექსტით და ფერით, ერთი ზომით */}
                    <VisitCount value={book.visits_count} />
                    <FavoriteButton
                      active={book.is_favorite}
                      pending={favorite.isPending && favorite.variables === book.id}
                      onToggle={() => favorite.mutate(book.id)}
                    />
                    {/* §5.7 — ახალი `source_url` უპირატესია; `links[0]` ძველი
                        ჩანაწერებისთვის რჩება (მიგრაციამ პირველი ბმული გადმოიტანა,
                        მაგრამ ხელახლა შეყვანილი ლინკი ახლა აქ წერია) */}
                    {/* Tasks §14.2 — ბმულის სლოტი ყოველთვის ადგილზეა: უბმულო წიგნზე უხილავია, რომ ღილაკები არ გადაინაცვლონ */}
                    <a
                      href={book.source_url || book.links[0]?.url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('books.openLink')}
                      aria-hidden={!(book.source_url || book.links[0]?.url) || undefined}
                      title={book.source_url || book.links[0]?.label || book.links[0]?.url}
                      className={cn(
                        'grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground',
                        !(book.source_url || book.links[0]?.url) && 'invisible pointer-events-none',
                      )}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    <Button variant="edit" size="sm" onClick={() => setEditing(book)}>
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('books.deleteTitle'),
                          description: t('books.deleteHint', { name: title(book) }),
                          variant: 'destructive',
                        })
                        if (ok) remove.mutate(book.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
                </RecordContextMenu>
              )
            })}
          </ul>

          <ShowMore shown={books.length} total={total} onMore={showMore} loading={query.isFetching} />
        </div>

        {/* ---------- ფილტრები ---------- */}
        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* სტატუსი აქ განზრახ არ არის (Tasks 3) — ის საიდბარის სექციაა */}
          <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
            <FilterOptionList>
              {allGenres.map((genre) => (
                <FilterOption
                  key={genre.id}
                  label={dictionaryName(genre, lang)}
                  count={genre.books_count}
                  checked={draft.genres.includes(String(genre.id))}
                  onChange={(on) => toggle('genres', String(genre.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('filter.tags')} count={draft.tags.length}>
            {tagOptions.length ? (
              <FilterOptionList>
                {tagOptions.map((tag) => (
                  <FilterOption
                    key={tag}
                    label={`#${tag}`}
                    checked={draft.tags.includes(tag)}
                    onChange={(on) => toggle('tags', tag, on)}
                  />
                ))}
              </FilterOptionList>
            ) : (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">{t('books.noTags')}</p>
            )}
          </FilterGroup>
        </FilterPanel>
      </div>

      {quoteFor && <QuoteDialog book={quoteFor} onClose={() => setQuoteFor(null)} />}
      {progressFor && <ProgressDialog book={progressFor} onClose={() => setProgressFor(null)} />}

      {opened && (
        <BookDetail
          // სია განახლდება ჩანიშვნის/პროგრესის შემდეგ — მოდალს ახალი ობიექტი უნდა
          book={books.find((b) => b.id === opened.id) ?? opened}
          onClose={() => setOpened(null)}
        />
      )}

      {editing && (
        <BookForm
          book={editing === 'new' ? null : editing}
          genres={allGenres}
          knownTags={tagOptions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['book-genres'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}
