import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  Clock,
  ExternalLink,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Tags,
  Trash2,
} from 'lucide-react'
import {
  deleteGame,
  fetchGameGenres,
  fetchGames,
  GAME_MAX_RATING,
  GAME_MODES,
  GAME_PLATFORMS,
  GAME_STATUSES,
  toggleGameFavorite,
  type Game,
  type GameFilters,
} from '@/api/games'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { GameDetail } from '@/components/GameDetail'
import { GameForm } from '@/components/GameForm'
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
import { cn } from '@/lib/utils'
import { formatMinutes } from '@/lib/videoDuration'

/* ============================================================
   თამაშების მოდული (`game`, Tasks §11).

   იგივე მოდელი, რაც წიგნებსა და ბორდგეიმებზე: **სტატუსი საიდბარის სექციაა**
   (`?view=`), პანელი კი ჟანრს, **პლატფორმასა** და რეჟიმს ფილტრავს —
   „რა მაქვს PS5-ზე გასავლელი" ამ მოდულის მთავარი კითხვაა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'year', 'rating', 'metacritic', 'playtime'] as const

const STATUS_TONE: Record<string, string> = {
  undecided: 'bg-secondary',
  to_play: 'bg-primary/15 text-primary',
  playing: 'bg-gold/20 text-gold',
  finished: 'bg-secondary text-foreground',
  abandoned: 'bg-destructive/15 text-destructive',
}

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { genres: [] as string[], platforms: [] as string[], modes: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function GamesPage() {
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
  const platforms = useMemo(
    () => new URLSearchParams(search).get('platform')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const modes = useMemo(
    () => new URLSearchParams(search).get('mode')?.split(',').filter(Boolean) ?? [],
    [search],
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Game | 'new' | null>(null)
  const [opened, setOpened] = useState<Game | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: GameFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    platform: platforms.length ? platforms.join(',') : undefined,
    mode: modes.length ? modes.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „რჩეული" და „ყველა" სტატუსს არ ნიშნავს — დანარჩენი სექცია სტატუსია
    status: (GAME_STATUSES as readonly string[]).includes(view) ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['games', filters, limit],
    queryFn: () => fetchGames({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const genresQ = useQuery({ queryKey: ['game-genres'], queryFn: fetchGameGenres })
  const games = useMemo(() => query.data?.items ?? [], [query.data])
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['games'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleGameFavorite, onSuccess: invalidate, onError: fail })
  const remove = useMutation({
    mutationFn: deleteGame,
    onSuccess: () => {
      invalidate()
      // ფაილები თამაშთან ერთად იშლება — კვოტის ინდიკატორიც უნდა განახლდეს
      qc.invalidateQueries({ queryKey: ['storage'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: fail,
  })

  /* ---------- ფილტრის გაშვება ---------- */

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.genres.length) p.set('genre', next.genres.join(','))
    if (next.platforms.length) p.set('platform', next.platforms.join(','))
    if (next.modes.length) p.set('mode', next.modes.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/games', search: p.toString() })
  }

  /* მონახაზი, „ცვლილებაა?", გასუფთავება და მრიცხველი — ერთი აღწერა
     `lib/filters.ts`-ში. ⚠️ `clear()` **ორივე მხარეს** ასუფთავებს
     (მონახაზსაც და მისამართსაც) — ადრე მხოლოდ მისამართს წერდა და უკვე
     სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა. */
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { genres, platforms, modes },
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: keyof typeof draft, value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  const title = (game: Game) =>
    (lang === 'ka' ? game.title_ka || game.title_en : game.title_en || game.title_ka) ?? `#${game.id}`

  const onlyGenre = genres.length === 1 ? allGenres.find((x) => String(x.id) === genres[0]) : undefined
  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : (GAME_STATUSES as readonly string[]).includes(view)
        ? t(`games.statuses.${view}`)
        : onlyGenre
          ? dictionaryName(onlyGenre, lang)
          : t('games.title')

  return (
    <PageContainer>
      <PageHeader
        module="game"
        title={heading}
        subtitle={t('games.count', { count: total })}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('games.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('games.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`games.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Link
              to="/dictionaries/game-genres"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('gameGenres.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('games.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !games.length && (
            <EmptyState
              title={term ? t('games.noResults', { q: term }) : t('games.empty')}
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
                    {t('games.add')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {games.map((game) => {
              const cover = storageUrl(game.cover)
              const store = game.links.find((l) => l.kind !== 'official') ?? game.links[0]
              return (
                <li
                  key={game.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <button
                    onClick={() => setOpened(game)}
                    aria-label={t('games.open')}
                    className="grid h-14 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted"
                  >
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Gamepad2 className="size-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setOpened(game)}
                      className="block max-w-full cursor-pointer truncate text-left text-sm font-medium hover:underline"
                      title={title(game)}
                    >
                      {title(game)}
                    </button>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                      {game.developer && <span className="truncate">{game.developer}</span>}
                      {game.year ? <span>{game.year}</span> : null}
                      {game.hltb_main ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatMinutes(game.hltb_main, t('games.hoursShort'), t('games.minutesShort'))}
                        </span>
                      ) : null}
                      {(game.videos_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Play className="size-3" />
                          {game.videos_count}
                        </span>
                      )}
                      {(game.images_count ?? 0) + (game.gallery_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="size-3" />
                          {(game.images_count ?? 0) + (game.gallery_count ?? 0)}
                        </span>
                      )}
                    </p>

                    <p className="mt-1 flex flex-wrap gap-1">
                      {(game.genres ?? []).slice(0, 4).map((genre) => (
                        <span
                          key={genre.id}
                          className="inline-flex items-center gap-1 rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]"
                        >
                          <ModuleIcon name={genre.icon} className="size-3" />
                          {dictionaryName(genre, lang)}
                        </span>
                      ))}
                      {game.platforms.map((p) => (
                        <span
                          key={p}
                          className={cn(
                            'rounded-[5px] px-1.5 py-0.5 text-[11px]',
                            // „ჩემი" პლატფორმა გამორჩეულია — სწორედ ის მაინტერესებს
                            p === game.my_platform
                              ? 'bg-primary/15 font-medium text-primary'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {t(`games.platforms.${p}`)}
                        </span>
                      ))}
                    </p>
                  </div>

                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'mr-1 rounded-[5px] px-1.5 py-0.5 text-xs',
                        STATUS_TONE[game.status] ?? 'bg-secondary',
                      )}
                    >
                      {t(`games.statuses.${game.status}`)}
                    </span>
                    {game.metacritic != null && (
                      <span className="mr-1 rounded-[5px] bg-secondary px-1.5 py-0.5 text-xs tabular-nums">
                        MC {game.metacritic}
                      </span>
                    )}
                    {game.rating != null && (
                      <span className="mr-1 rounded-[5px] bg-secondary px-1.5 py-0.5 text-xs tabular-nums">
                        {game.rating}/{GAME_MAX_RATING}
                      </span>
                    )}
                    <button
                      onClick={() => favorite.mutate(game.id)}
                      aria-label={t(game.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-gold"
                    >
                      <Star className={cn('size-4', game.is_favorite && 'fill-gold text-gold')} />
                    </button>
                    {store && (
                      <a
                        href={store.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('books.openLink')}
                        title={store.label || store.url}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setEditing(game)}>
                      <Pencil className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('games.deleteTitle'),
                          description: t('games.deleteHint', { name: title(game) }),
                          variant: 'destructive',
                        })
                        if (ok) remove.mutate(game.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>

          <ShowMore shown={games.length} total={total} onMore={showMore} loading={query.isFetching} />
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
          <FilterGroup title={t('games.platformsLabel')} count={draft.platforms.length}>
            <FilterOptionList>
              {GAME_PLATFORMS.map((p) => (
                <FilterOption
                  key={p}
                  label={t(`games.platforms.${p}`)}
                  checked={draft.platforms.includes(p)}
                  onChange={(on) => toggle('platforms', p, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
            <FilterOptionList>
              {allGenres.map((genre) => (
                <FilterOption
                  key={genre.id}
                  label={dictionaryName(genre, lang)}
                  count={genre.games_count}
                  checked={draft.genres.includes(String(genre.id))}
                  onChange={(on) => toggle('genres', String(genre.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('games.modesLabel')} count={draft.modes.length}>
            <FilterOptionList>
              {GAME_MODES.map((m) => (
                <FilterOption
                  key={m}
                  label={t(`games.modes.${m}`)}
                  checked={draft.modes.includes(m)}
                  onChange={(on) => toggle('modes', m, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>
        </FilterPanel>
      </div>

      {opened && (
        <GameDetail
          // სია განახლდება ატვირთვის შემდეგ — მოდალს ახალი ობიექტი უნდა
          game={games.find((g) => g.id === opened.id) ?? opened}
          onClose={() => setOpened(null)}
        />
      )}

      {editing && (
        <GameForm
          game={editing === 'new' ? null : editing}
          genres={allGenres}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['game-genres'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}
