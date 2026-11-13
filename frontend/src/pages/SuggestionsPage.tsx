import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleAlert, EyeOff, Library, ListChecks, Loader2, Plus, RefreshCw, SlidersHorizontal, Sparkles, Star } from 'lucide-react'
import { fetchGenres } from '@/api/media'
import {
  EMPTY_FILTERS,
  fetchSuggestions,
  setSuggestionHidden,
  type SourceState,
  type SuggestCut,
  type SuggestFilters,
  type SuggestProgress,
  type SuggestSelection,
  type Suggestion,
  type SuggestionPage,
} from '@/api/suggestions'
import { genreName, movieTitle } from '@/lib/display'
import { errorMessage, isApiCode } from '@/lib/errors'
import { mediaKey, type MediaType } from '@/lib/media'
import { defaultPageSize, layoutColumns } from '@/lib/pageSize'
import { usePages } from '@/lib/paged'
import { useRecordLayout } from '@/lib/recordLayout'
import { useContentLang } from '@/lib/settings'
import { statusName, useStatuses } from '@/lib/statuses'
import { SOURCE_NAMES, defaultSelection, narrowingCount, useSuggestSelection } from '@/lib/suggest'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { FilterRange } from '@/components/FilterPanel'
import { ModuleIcon } from '@/components/ModuleIcon'
import { RecordList } from '@/components/RecordView'
import { BasisPicker } from '@/components/suggest/BasisPicker'
import { SuggestionItem } from '@/components/suggest/SuggestionItem'
import { Badge, CountBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useQueue } from '@/components/ui/queue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ViewToggle } from '@/components/ui/view-toggle'

/* ============================================================
   **„შემოთავაზებები"** — `/movies/suggestions`, `/series/suggestions`, `/anime/suggestions`;
   სამივე მოდულის ქვემენიუს პუნქტი.

   ზემოთ ვირჩევ, **რაზე დაყრდნობით** მინდა შემოთავაზება (სტატუსები, „რჩეული", ხელით
   მონიშნული სათაურები, დავიწროება), ქვემოთ ვიღებ მსგავს სათაურებს — ჩემი სიიდანაც
   (მაქვს და ჯერ არ მინახავს) და გარედანაც (ჯერ არ მაქვს), თითოზე „რატომ".

   ⚠️ **პირველი გაშვება დროს ითხოვს**: თითო საფუძველს წყარო ცალკე ეკითხება, ამიტომ
   მოთხოვნა მეორდება, სანამ მასალა გროვდება (`fetchSuggestions`), გვერდი კი პროგრესს
   ხატავს. ყველაფერი სერვერის ქეშში რჩება — მეორე გახსნა მყისიერია; „თავიდან" ქეშს
   გვერდს უვლის.
   ⚠️ **არჩევანი მოდულს ახსოვს** (`module_user.settings.suggest`); შედეგის ჭრილი და
   ფილტრი გვერდზე რჩება. ცვლილება ცოტა ხნით ელოდება (აკრეფა, რამდენიმე ჩიპი ზედიზედ) —
   თითო დაჭერაზე ახალი გაშვება არ იწყება.
   ⚠️ სიის გასაღები `[type]`-ით იწყება: დამატების რიგი და სტატუსის ცვლილება მას თვითონ
   აახლებს — დამატებული „ახალიდან" „ჩემი სიიდან"-ში გადადის, ნანახი კი ქრება.
   ============================================================ */

/** რამდენ ხანს ელოდება არჩევანის ცვლილება, სანამ გაშვება დაიწყება */
const SETTLE_MS = 400

const hasBasis = (selection: SuggestSelection) => selection.statuses.length > 0 || selection.favorite || selection.ids.length > 0

export function SuggestionsPage({ type }: { type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const { enqueue, isQueued } = useQueue()

  const statusesQ = useStatuses(type)
  const statuses = useMemo(() => statusesQ.data ?? [], [statusesQ.data])
  const genresQ = useQuery({ queryKey: ['genres', type], queryFn: () => fetchGenres(type) })
  const genres = genresQ.data ?? []

  /* საფუძველი: შენახული, ან (სანამ არაფერი შენახულა) ნანახი + რჩეული; `draft` — ჯერ დაუმშვიდებელი ცვლილება */
  const [saved, save] = useSuggestSelection(type)
  const fallback = useMemo(() => defaultSelection(statuses), [statuses])
  const settled = saved ?? fallback
  const [draft, setDraft] = useState<SuggestSelection | null>(null)
  const selection = draft ?? settled
  const change = (patch: Partial<SuggestSelection>) => setDraft({ ...selection, ...patch })

  useEffect(() => {
    if (!draft) return
    const id = setTimeout(() => {
      save(draft)
      setDraft(null)
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [draft, save])

  const [filters, setFilters] = useState<SuggestFilters>(EMPTY_FILTERS)
  const [layout, setLayout] = useRecordLayout(type, 'cards', 'suggest_view')
  const columns = layoutColumns(layout)
  // ხედის შეცვლაზე ზომა ახალი ხედის ნაგულისხმევზე ბრუნდება (სვეტების ჯერადი)
  const [picked, setPicked] = useState<{ layout: string; size: number } | null>(null)
  const pageSize = picked?.layout === layout ? picked.size : defaultPageSize(columns, layout)

  const [progress, setProgress] = useState<SuggestProgress | null>(null)
  const [narrowing, setNarrowing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [addStatus, setAddStatus] = useState<string | null>(null)
  // „თავიდან" ერთ მოთხოვნას მიჰყვება: `run` გასაღებს ცვლის, დროშა კი პირველივე მოთხოვნაზე იხსნება
  const [run, setRun] = useState(0)
  const refresh = useRef(false)

  const list = usePages<SuggestionPage>({
    queryKey: [type, 'suggestions', settled, filters, run],
    fetchPage: (page, perPage) => {
      const fresh = refresh.current
      refresh.current = false

      return fetchSuggestions(type, settled, filters, page, perPage, { refresh: fresh, onProgress: (next) => setProgress(next) })
    },
    pageSize,
    // სანამ სტატუსები არ ჩანს, ნაგულისხმევი საფუძველი ცარიელია — ტყუილი „აირჩიე" არ უნდა გაიელვოს
    enabled: saved !== null || !statusesQ.isLoading,
    refetchOnWindowFocus: false,
  })
  const head = list.first

  const hide = useMutation({
    mutationFn: (v: { item: Suggestion; hidden: boolean }) => setSuggestionHidden(type, v.item, v.hidden),
    onSuccess: (_data, v) => {
      toast({ title: t(v.hidden ? 'suggest.hiddenDone' : 'suggest.restoredDone'), variant: 'success' })
      qc.invalidateQueries({ queryKey: [type, 'suggestions'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const again = () => {
    refresh.current = true
    setRun((n) => n + 1)
  }

  const setFilter = (patch: Partial<SuggestFilters>) => setFilters((cur) => ({ ...cur, ...patch }))
  const toggleStatus = (key: string) =>
    change({
      statuses: selection.statuses.includes(key) ? selection.statuses.filter((k) => k !== key) : [...selection.statuses, key],
      // სტატუსის შეცვლაზე ხელით მონიშვნა იხსნება — ის წინა ავზიდან იყო არჩეული
      ids: [],
    })

  // ახალი სათაური ამ სტატუსით ემატება; ნაგულისხმევი — ლექსიკონის ნაგულისხმევი
  const statusForNew = addStatus ?? statuses.find((s) => s.is_default)?.key ?? statuses[0]?.key
  const addable = list.items.filter((item) => !item.owned && !item.hidden && !isQueued(item.tmdb_id, type))
  const noKey = isApiCode(list.error, 'credential_missing')
  const working = list.isFetching && progress !== null
  const narrowed = narrowingCount(selection)

  return (
    <PageContainer>
      <PageHeader
        module={type}
        title={t('suggest.section')}
        hint={<InfoHint wide info={t(mediaKey('suggest.hint', type))} />}
        actions={
          <>
            <ViewToggle value={layout} onChange={setLayout} />
            <PageSizePick value={pageSize} onChange={(size) => setPicked({ layout, size })} columns={columns} />
            <Button type="button" variant="outline" disabled={list.isFetching || !hasBasis(settled)} onClick={again} data-testid="suggest-refresh">
              <RefreshCw className={list.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              {t('suggest.again')}
            </Button>
          </>
        }
      />

      {/* ---------- რაზე დგას შემოთავაზება ---------- */}
      <section className="mb-5 rounded-lg border border-border bg-card p-4" data-testid="suggest-basis">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{t('suggest.basis.title')}</h2>
          <InfoHint wide info={t('suggest.basis.hint', { limit: head?.basis.limit ?? 30 })} />
          {head && head.basis.used > 0 && (
            <Badge className="ml-auto bg-secondary" data-testid="suggest-basis-used">
              {head.basis.total > head.basis.used
                ? t('suggest.basis.usedOf', { used: head.basis.used, total: head.basis.total })
                : t('suggest.basis.used', { count: head.basis.used })}
            </Badge>
          )}
        </div>

        <ChipRow className="mt-3">
          {statuses.map((status) => (
            <Chip
              key={status.key}
              check
              active={selection.statuses.includes(status.key)}
              icon={<ModuleIcon name={status.icon ?? 'Circle'} className="size-3.5 shrink-0" />}
              onClick={() => toggleStatus(status.key)}
              data-testid="suggest-status"
            >
              {statusName(status, lang)}
            </Chip>
          ))}
          <Chip
            check
            active={selection.favorite}
            icon={<Star className="size-3.5 shrink-0" />}
            onClick={() => change({ favorite: !selection.favorite, ids: [] })}
            data-testid="suggest-favorite"
          >
            {t('filter.favorite')}
          </Chip>
        </ChipRow>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={selection.statuses.length === 0 && !selection.favorite}
            onClick={() => setPicking(true)}
            data-testid="suggest-pick"
          >
            <ListChecks className="size-3.5" />
            {t('suggest.basis.pick')}
            <CountBadge count={selection.ids.length} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setNarrowing((open) => !open)} aria-expanded={narrowing} data-testid="suggest-narrow">
            <SlidersHorizontal className="size-3.5" />
            {t('suggest.basis.narrow')}
            <CountBadge count={narrowed} />
          </Button>

          {/* ხელით მონიშნული სათაურები — ჩიპზე დაჭერა მონიშვნას ხსნის */}
          {selection.ids.length > 0 &&
            head?.basis.records
              .filter((record) => selection.ids.includes(record.id))
              .map((record) => (
                <Chip key={record.id} active remove onClick={() => change({ ids: selection.ids.filter((id) => id !== record.id) })} data-testid="suggest-picked">
                  {movieTitle(record, lang)}
                </Chip>
              ))}
        </div>

        {narrowing && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3" data-testid="suggest-narrow-fields">
            <FilterRange
              label={t('filter.year')}
              from={selection.yearMin}
              to={selection.yearMax}
              onFrom={(value) => change({ yearMin: value })}
              onTo={(value) => change({ yearMax: value })}
              min={1870}
            />
            <FilterRange
              label={t('filter.myRating')}
              from={selection.myRatingMin}
              to={selection.myRatingMax}
              onFrom={(value) => change({ myRatingMin: value })}
              onTo={(value) => change({ myRatingMax: value })}
              min={0}
              max={10}
              step={0.1}
            />
            <FilterRange
              label={t('filter.tmdbRating')}
              from={selection.ratingMin}
              to={selection.ratingMax}
              onFrom={(value) => change({ ratingMin: value })}
              onTo={(value) => change({ ratingMax: value })}
              min={0}
              max={10}
              step={0.1}
            />
            {genres.length > 0 && (
              <ChipRow className="sm:col-span-3">
                {genres.map((genre) => (
                  <Chip
                    key={genre.slug}
                    check
                    active={selection.genre.includes(genre.slug)}
                    onClick={() =>
                      change({
                        genre: selection.genre.includes(genre.slug) ? selection.genre.filter((slug) => slug !== genre.slug) : [...selection.genre, genre.slug],
                      })
                    }
                  >
                    {genreName(genre, lang)}
                  </Chip>
                ))}
              </ChipRow>
            )}
          </div>
        )}

        {head && <SourceNotes sources={head.sources} plot={head.plot} />}
      </section>

      {/* ---------- შედეგი ---------- */}
      {noKey ? (
        <CredentialMissingNotice provider="tmdb" />
      ) : list.isError ? (
        <QueryErrorState error={list.error} onRetry={list.refetch} retrying={list.isFetching} />
      ) : !hasBasis(settled) ? (
        <EmptyState icon={<Sparkles className="size-6" />} title={t('suggest.emptyBasisTitle')} hint={t('suggest.emptyBasisHint')} />
      ) : working ? (
        <Progress progress={progress} />
      ) : !head ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('api.loading')}
        </div>
      ) : head.basis.used === 0 ? (
        <EmptyState icon={<Sparkles className="size-6" />} title={t('suggest.emptyPoolTitle')} hint={t('suggest.emptyPoolHint')} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <CutTabs
              layout="inline"
              options={[
                { key: 'all', label: t('suggest.cut.all'), count: head.counts.all, icon: Sparkles, color: 'var(--mod)' },
                { key: 'mine', label: t('suggest.cut.mine'), count: head.counts.mine, icon: Library, color: 'var(--tool-sync)' },
                { key: 'new', label: t('suggest.cut.new'), count: head.counts.new, icon: Plus, color: 'var(--tool-bulk)' },
              ]}
              value={filters.hidden ? '' : filters.cut}
              onChange={(key) => setFilter({ cut: key as SuggestCut, hidden: false })}
            />
            <Chip
              active={filters.hidden}
              count={head.counts.hidden}
              icon={<EyeOff className="size-3.5 shrink-0" />}
              onClick={() => setFilter({ hidden: !filters.hidden })}
              data-testid="suggest-hidden"
            >
              {t('suggest.hiddenList')}
            </Chip>
          </div>

          {!filters.hidden && (
            <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="suggest-filters">
              <Select value={filters.genre || 'any'} onValueChange={(value) => setFilter({ genre: value === 'any' ? '' : value })}>
                <SelectTrigger className="w-44" aria-label={t('filter.genres')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('discover.anyGenre')}</SelectItem>
                  {genres.map((genre) => (
                    <SelectItem key={genre.slug} value={genre.slug}>
                      {genreName(genre, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {t('filter.year')}
                <Input type="number" className="w-20" placeholder={t('filter.from')} value={filters.yearMin} onChange={(e) => setFilter({ yearMin: e.target.value })} />
                <span>–</span>
                <Input type="number" className="w-20" placeholder={t('filter.to')} value={filters.yearMax} onChange={(e) => setFilter({ yearMax: e.target.value })} />
              </label>

              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {t('suggest.ratingFrom')}
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  className="w-20"
                  placeholder="0.0"
                  value={filters.ratingMin}
                  onChange={(e) => setFilter({ ratingMin: e.target.value })}
                />
              </label>

              {/* ახალი სათაურის სტატუსი და „ყველა ნაჩვენები" — მხოლოდ იქ, სადაც ახალი სათაურები ჩანს */}
              {filters.cut !== 'mine' && statuses.length > 0 && (
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">{t('suggest.addAs')}</span>
                  <Select value={statusForNew} onValueChange={setAddStatus}>
                    <SelectTrigger className="w-44" aria-label={t('suggest.addAs')} data-testid="suggest-add-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status.key} value={status.key}>
                          {statusName(status, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={addable.length === 0}
                    onClick={() =>
                      enqueue(
                        addable.map((item) => ({ tmdbId: item.tmdb_id, title: (lang === 'ka' ? item.title_ka : null) || item.title, status: statusForNew })),
                        type,
                      )
                    }
                    data-testid="suggest-add-shown"
                  >
                    <Plus className="size-4" />
                    {t('suggest.addShown')}
                    <CountBadge count={addable.length} />
                  </Button>
                </span>
              )}
            </div>
          )}

          {list.items.length === 0 ? (
            filters.hidden ? (
              <EmptyState icon={<EyeOff className="size-6" />} title={t('suggest.emptyHiddenTitle')} hint={t('suggest.emptyHiddenHint')} />
            ) : (
              <EmptyState kind="search" title={t('suggest.emptyTitle')} hint={t('suggest.emptyHint')} />
            )
          ) : (
            <>
              <RecordList layout={layout}>
                {list.items.map((item) => (
                  <SuggestionItem
                    key={item.tmdb_id}
                    item={item}
                    type={type}
                    statuses={statuses}
                    addStatus={statusForNew}
                    hiding={hide.isPending}
                    onHide={(hidden) => hide.mutate({ item, hidden })}
                  />
                ))}
              </RecordList>
              <Pagination {...list.pagination} />
            </>
          )}
        </>
      )}

      {picking && (
        <BasisPicker
          type={type}
          selection={selection}
          onClose={() => setPicking(false)}
          onApply={(ids) => {
            change({ ids })
            setPicking(false)
          }}
        />
      )}
    </PageContainer>
  )
}

/** პროგრესი, სანამ სერვერი მასალას აგროვებს — რა ეტაპია და რამდენი დარჩა */
function Progress({ progress }: { progress: SuggestProgress | null }) {
  const { t } = useTranslation()
  const stage = progress?.stage ?? 'sources'
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  return (
    <div role="status" className="rounded-lg border border-border bg-card p-4" data-testid="suggest-progress">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin text-[var(--mod)]" />
        <span>{t(`suggest.progress.${stage}`)}</span>
        {progress && progress.total > 0 && (
          <span className="tabular-nums text-muted-foreground">
            {progress.done} / {progress.total}
          </span>
        )}
        <InfoHint info={t('suggest.progress.hint')} />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-md bg-muted">
        <div className="h-full rounded-md bg-[var(--mod)] transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/**
 * წყაროების მდგომარეობა — მხოლოდ ის, რაც შედეგს აკლებს: გასაღების გარეშე ან ჩავარდნილი
 * დამატებითი წყარო, და სათაურები, რომლებზეც სიუჟეტის შედარება ჯერ არ არის.
 */
function SourceNotes({ sources, plot }: { sources: SuggestionPage['sources']; plot: SuggestionPage['plot'] }) {
  const { t } = useTranslation()

  const notes = (Object.entries(sources) as [keyof typeof sources, SourceState][])
    .filter(([, state]) => state === 'missing' || state === 'failed')
    .map(([source, state]) => ({
      key: `${source}-${state}`,
      missing: state === 'missing',
      text: t(source === 'gemini' ? `suggest.source.gemini.${state}` : `suggest.source.${state}`, { source: SOURCE_NAMES[source] }),
    }))

  if (plot && plot.missing > 0 && sources.gemini === 'ok') {
    notes.push({ key: 'plot', missing: false, text: t('suggest.source.plotMissing', { count: plot.missing }) })
  }

  if (!notes.length) return null

  return (
    <ul className="mt-3 space-y-1 border-t border-border pt-3" data-testid="suggest-sources">
      {notes.map((note) => (
        <li key={note.key} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-source={note.key}>
          <CircleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{note.text}</span>
          {note.missing && (
            <Link to="/credentials" data-kind="link" className="font-medium text-foreground hover:text-primary">
              {t('suggest.source.toCredentials')}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}
