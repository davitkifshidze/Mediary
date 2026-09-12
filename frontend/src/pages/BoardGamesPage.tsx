import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  Dices,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Tags,
  Trash2,
  Users,
} from 'lucide-react'
import {
  BOARD_GAME_MAX_RATING,
  BOARD_GAME_STATUSES,
  deleteBoardGame,
  fetchBoardGameGenres,
  fetchBoardGames,
  toggleBoardGameFavorite,
  type BoardGame,
  type BoardGameFilters,
} from '@/api/boardGames'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BoardGameDetail } from '@/components/BoardGameDetail'
import { BoardGameForm } from '@/components/BoardGameForm'
import { ModuleIcon } from '@/components/ModuleIcon'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ბორდგეიმების მოდული (`board_game`, Tasks §14).

   იგივე მოდელი, რაც წიგნებზე: **სტატუსი საიდბარის სექციაა** (`?view=`),
   პანელი კი ჟანრს, მექანიკებსა და **მოთამაშეთა რაოდენობას** ფილტრავს —
   „ხუთნი ვართ, რა ვითამაშოთ" ამ მოდულის მთავარი კითხვაა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'year', 'rating', 'bgg', 'complexity', 'playtime'] as const

/** ფილტრის ჩიპები „რამდენი კაცით ვთამაშობთ"-ისთვის */
const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6, 8]

const STATUS_TONE: Record<string, string> = {
  owned: 'bg-gold/20 text-gold',
  wanted: 'bg-primary/15 text-primary',
  playing: 'bg-secondary text-foreground',
  sold: 'bg-destructive/15 text-destructive',
}

export function BoardGamesPage() {
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
  const mechanics = useMemo(
    () => new URLSearchParams(search).get('mechanic')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const players = new URLSearchParams(search).get('players') ?? ''

  const [draft, setDraft] = useState({ genres, mechanics, players })
  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<BoardGame | 'new' | null>(null)
  const [opened, setOpened] = useState<BoardGame | null>(null)

  useEffect(() => {
    setDraft({ genres, mechanics, players })
  }, [genres, mechanics, players])

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: BoardGameFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    mechanic: mechanics.length ? mechanics.join(',') : undefined,
    players: players ? Number(players) : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „რჩეული" და „ყველა" სტატუსს არ ნიშნავს — დანარჩენი სექცია სტატუსია
    status: (BOARD_GAME_STATUSES as readonly string[]).includes(view) ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['board-games', filters, limit],
    queryFn: () => fetchBoardGames({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const genresQ = useQuery({ queryKey: ['board-game-genres'], queryFn: fetchBoardGameGenres })
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['board-games'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({
    mutationFn: toggleBoardGameFavorite,
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: deleteBoardGame,
    onSuccess: () => {
      invalidate()
      // ფაილები თამაშთან ერთად იშლება — კვოტის ინდიკატორიც უნდა განახლდეს
      qc.invalidateQueries({ queryKey: ['storage'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: fail,
  })

  /** ფორმის მექანიკების შემოთავაზებები — ყველა სექციიდან დანახული გროვდება */
  const [knownMechanics, setKnownMechanics] = useState<string[]>([])
  useEffect(() => {
    if (!games.length) return
    setKnownMechanics((prev) => {
      const merged = new Set([...prev, ...games.flatMap((g) => g.mechanics)])
      return merged.size === prev.length ? prev : [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [games])

  const mechanicOptions = useMemo(() => {
    const set = new Set([...knownMechanics, ...games.flatMap((g) => g.mechanics), ...mechanics])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [knownMechanics, games, mechanics])

  /* ---------- ფილტრის გაშვება ---------- */

  const activeCount = genres.length + mechanics.length + (players ? 1 : 0)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  const dirty =
    !same(draft.genres, genres) || !same(draft.mechanics, mechanics) || draft.players !== players

  /** მიმდინარე სექცია (`?view=`) ინახება — პანელი მას არ ცვლის (Tasks 3) */
  const applyDraft = (next: typeof draft) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.genres.length) p.set('genre', next.genres.join(','))
    if (next.mechanics.length) p.set('mechanic', next.mechanics.join(','))
    if (next.players) p.set('players', next.players)
    setPanelOpen(false)
    navigate({ pathname: '/board-games', search: p.toString() })
  }

  const toggle = (key: 'genres' | 'mechanics', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  const onlyGenre = genres.length === 1 ? allGenres.find((x) => String(x.id) === genres[0]) : undefined
  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : (BOARD_GAME_STATUSES as readonly string[]).includes(view)
        ? t(`boardGames.statuses.${view}`)
        : onlyGenre
          ? dictionaryName(onlyGenre, lang)
          : t('boardGames.title')

  const range = (min: number | null, max: number | null) =>
    [...new Set([min, max].filter(Boolean))].join('–')

  return (
    <PageContainer>
      <PageHeader
        module="board_game"
        title={heading}
        subtitle={t('boardGames.count', { count: total })}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('boardGames.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('boardGames.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`boardGames.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Link
              to="/dictionaries/board-game-genres"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('boardGameGenres.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('boardGames.add')}
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
              title={term ? t('boardGames.noResults', { q: term }) : t('boardGames.empty')}
              hint={term || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={() => applyDraft({ genres: [], mechanics: [], players: '' })}>
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('boardGames.add')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {games.map((game) => {
              const image = storageUrl(game.image)
              return (
                <li
                  key={game.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <button
                    onClick={() => setOpened(game)}
                    aria-label={t('boardGames.open')}
                    className="grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted"
                  >
                    {image ? (
                      <img src={image} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Dices className="size-5 text-muted-foreground" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setOpened(game)}
                      className="block max-w-full cursor-pointer truncate text-left text-sm font-medium hover:underline"
                      title={game.title}
                    >
                      {game.title}
                    </button>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                      {game.designer && <span className="truncate">{game.designer}</span>}
                      {game.year ? <span>{game.year}</span> : null}
                      {game.genre && (
                        <span className="inline-flex items-center gap-1">
                          <ModuleIcon name={game.genre.icon} className="size-3" />
                          {dictionaryName(game.genre, lang)}
                        </span>
                      )}
                      {range(game.players_min, game.players_max) && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          {range(game.players_min, game.players_max)}
                        </span>
                      )}
                      {range(game.playtime_min, game.playtime_max) && (
                        <span>
                          {range(game.playtime_min, game.playtime_max)} {t('boardGames.minutesShort')}
                        </span>
                      )}
                      {game.complexity ? <span>⚙ {game.complexity}</span> : null}
                      {(game.images_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ImageIcon className="size-3" />
                          {game.images_count}
                        </span>
                      )}
                      {(game.files_count ?? 0) - (game.images_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" />
                          {(game.files_count ?? 0) - (game.images_count ?? 0)}
                        </span>
                      )}
                    </p>

                    {game.mechanics.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {game.mechanics.slice(0, 6).map((m) => (
                          <span key={m} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                            {m}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'mr-1 rounded-[5px] px-1.5 py-0.5 text-xs',
                        STATUS_TONE[game.status] ?? 'bg-secondary',
                      )}
                    >
                      {t(`boardGames.statuses.${game.status}`)}
                    </span>
                    {game.bgg_rating != null && (
                      <span className="mr-1 rounded-[5px] bg-secondary px-1.5 py-0.5 text-xs tabular-nums">
                        BGG {game.bgg_rating}
                      </span>
                    )}
                    {game.rating != null && (
                      <span className="mr-1 rounded-[5px] bg-secondary px-1.5 py-0.5 text-xs tabular-nums">
                        {game.rating}/{BOARD_GAME_MAX_RATING}
                      </span>
                    )}
                    <button
                      onClick={() => favorite.mutate(game.id)}
                      aria-label={t(game.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-gold"
                    >
                      <Star className={cn('size-4', game.is_favorite && 'fill-gold text-gold')} />
                    </button>
                    {(game.links[0]?.url || game.bgg_url) && (
                      <a
                        href={game.links[0]?.url || game.bgg_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('books.openLink')}
                        title={game.links[0]?.label || game.bgg_url || ''}
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
                          title: t('boardGames.deleteTitle'),
                          description: t('boardGames.deleteHint', { name: game.title }),
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
          onApply={() => applyDraft(draft)}
          onClear={() => applyDraft({ genres: [], mechanics: [], players: '' })}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* სტატუსი აქ განზრახ არ არის (Tasks 3) — ის საიდბარის სექციაა */}
          <FilterGroup title={t('boardGames.players')} count={draft.players ? 1 : 0}>
            <div className="flex flex-wrap gap-1.5 px-1.5 py-1">
              {PLAYER_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, players: d.players === String(n) ? '' : String(n) }))
                  }
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                    draft.players === String(n)
                      ? 'border-primary bg-secondary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {n}
                  {n === 8 ? '+' : ''}
                </button>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
            <FilterOptionList>
              {allGenres.map((genre) => (
                <FilterOption
                  key={genre.id}
                  label={dictionaryName(genre, lang)}
                  count={genre.board_games_count}
                  checked={draft.genres.includes(String(genre.id))}
                  onChange={(on) => toggle('genres', String(genre.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('boardGames.mechanics')} count={draft.mechanics.length}>
            {mechanicOptions.length ? (
              <FilterOptionList>
                {mechanicOptions.map((m) => (
                  <FilterOption
                    key={m}
                    label={m}
                    checked={draft.mechanics.includes(m)}
                    onChange={(on) => toggle('mechanics', m, on)}
                  />
                ))}
              </FilterOptionList>
            ) : (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">
                {t('boardGames.noMechanics')}
              </p>
            )}
          </FilterGroup>
        </FilterPanel>
      </div>

      {opened && (
        <BoardGameDetail
          // სია განახლდება ატვირთვის შემდეგ — მოდალს ახალი ობიექტი უნდა
          game={games.find((g) => g.id === opened.id) ?? opened}
          onClose={() => setOpened(null)}
        />
      )}

      {editing && (
        <BoardGameForm
          game={editing === 'new' ? null : editing}
          allMechanics={knownMechanics}
          genres={allGenres}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['board-game-genres'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}
