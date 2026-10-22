import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIST_PAGE_SIZE, usePagedList } from '@/lib/paged'
import { useDrillParams } from '@/lib/statsLinks'
import { Pagination } from '@/components/ui/pagination'
import {
  ExternalLink,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Search,
  Tags,
} from 'lucide-react'
import {
  deleteGame,
  fetchGameGenres,
  fetchGames,
  GAME_MODES,
  GAME_PLATFORMS,
  GAME_STATUSES,
  updateGame,
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
import { GenreChip, ModeChip, PlatformChip } from '@/components/GameMetaCards'
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
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { useRecordLayout } from '@/lib/recordLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'
import { RatingBadge } from '@/components/ui/star-rating'
import { RecordActionBar } from '@/components/RecordActionBar'
import { EnumStatusMenu } from '@/components/StatusMenu'

/* ============================================================
   თამაშების მოდული (`game`).

   იგივე მოდელი, რაც წიგნებსა და ბორდგეიმებზე: **სტატუსი საიდბარის სექციაა**
   (`?view=`), პანელი კი ჟანრს, **პლატფორმასა** და რეჟიმს ფილტრავს —
   „რა მაქვს PS5-ზე გასავლელი" ამ მოდულის მთავარი კითხვაა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'year', 'rating'] as const

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
  // ხედი მოდულზე ინახება; ნაგულისხმევი — ახლანდელი ხედი
  const [layout, setLayout] = useRecordLayout('game', 'rows')
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

  const drill = useDrillParams()
  const filters: GameFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    platform: platforms.length ? platforms.join(',') : undefined,
    mode: modes.length ? modes.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „რჩეული" და „ყველა" სტატუსს არ ნიშნავს — დანარჩენი სექცია სტატუსია
    status: (GAME_STATUSES as readonly string[]).includes(view) ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"; მიმდინარე გვერდი `?page=`-შია
  const query = usePagedList({
    queryKey: ['games', filters],
    fetchPage: (page) => fetchGames({ ...filters, page, per_page: LIST_PAGE_SIZE }),
  })
  const genresQ = useQuery({ queryKey: ['game-genres'], queryFn: fetchGameGenres })
  const games = query.items
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.total
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
  // სტატუსი კონტექსტური მენიუდან (სიაში ბეჯი მხოლოდ აჩვენებს)
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: (typeof GAME_STATUSES)[number] }) => updateGame(id, { status: next }),
    onSuccess: invalidate,
    onError: fail,
  })
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
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
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
          {/* ⚠️ ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
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

          <RecordList layout={layout}>
            {games.map((game) => {
              const cover = storageUrl(game.cover)
              // რიგის ბმული: ჯერ მაღაზია, მერე სხვა ბმული, ბოლოს ოფიციალური საიტი
              const store =
                game.links.find((l) => l.kind === 'store') ??
                game.links.find((l) => l.kind !== 'official') ??
                game.links[0]
              const fav = {
                active: game.is_favorite,
                pending: favorite.isPending && favorite.variables === game.id,
                onToggle: () => favorite.mutate(game.id),
              }
              const askDelete = async () => {
                const ok = await confirm({
                  title: t('games.deleteTitle'),
                  description: t('games.deleteHint', { name: title(game) }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(game.id)
              }
              const badges = (
                <>
                  <RatingBadge value={game.rating} size="row" className="mr-1" />
                </>
              )
              /* მარჯვენა ღილაკის მენიუ: გახსნა · ბმული · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
              const actions: MenuAction[] = [
                { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setOpened(game) },
                ...(store
                  ? [{ key: 'link', label: t('actions.openLink'), icon: MENU_ICONS.link, run: () => window.open(store.url, '_blank', 'noopener,noreferrer') }]
                  : []),
                {
                  key: 'status',
                  label: t('form.status'),
                  sub: GAME_STATUSES.map((s) => ({
                    key: `status:${s}`,
                    label: t(`games.statuses.${s}`),
                    checked: game.status === s,
                    run: () => status.mutate({ id: game.id, next: s }),
                  })),
                },
                favoriteAction(game.is_favorite, () => favorite.mutate(game.id), t),
                { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(game) },
                {
                  key: 'delete',
                  label: t('actions.delete'),
                  icon: MENU_ICONS.delete,
                  danger: true,
                  run: askDelete,
                },
              ]
              return (
                <RecordView
                  key={game.id}
                  title={title(game)}
                  onOpen={() => setOpened(game)}
                  openLabel={t('games.open')}
                  photo={cover}
                  shape="wide"
                  placeholder={<Gamepad2 className="size-5" />}
                  meta={
                    <>
                      {game.developer && <span className="truncate">{game.developer}</span>}
                      {game.year ? <span>{game.year}</span> : null}
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
                    </>
                  }
                  extra={
                    <>
                      {/* ჟანრები, პლატფორმები („ჩემი" სავსე) და რეჟიმები ერთი ფერებით, რაც დეტალის ბარათებს */}
                      <p className="mt-1 flex flex-wrap gap-1">
                        {(game.genres ?? []).slice(0, 4).map((genre) => (
                          <GenreChip key={genre.id} genre={genre} />
                        ))}
                        {game.platforms.map((p) => (
                          <PlatformChip key={p} platform={p} mine={p === game.my_platform} />
                        ))}
                        {game.modes.map((m) => (
                          <ModeChip key={m} mode={m} />
                        ))}
                      </p>
                    </>
                  }
                  actions={actions}
                  onDelete={askDelete}
                  favorite={fav}
                  badges={badges}
                  onEdit={() => setEditing(game)}
                  /* ⚠️ **არჩევითი მარცხნივ, ყოველთვის არსებული მარჯვნივ.**
                     შენი სიტყვები: „რამდენიმეს MC და რიცხვი აქვს და მერე „გადაუწყვეტელი“ —
                     სიმეტრია დაირღვა; რჩეულის გვერდით ჯერ საერთო ზომის სტატუსის ნიშანი
                     იყოს". ბმული და ქულა ზოგს აქვს, ზოგს არა — მათ მარჯვნივ დგომისას
                     სტატუსი და ღილაკები რიგიდან რიგში ინაცვლებდა. სტატუსს ერთი მინიმალური
                     სიგანეც აქვს, რომ რჩეული ყველა რიგში ერთ სვეტში იდგეს. */
                  /* ერთი ზოლი ყველა სიაზე: ქულა · სტატუსი (ჩამოსაშლელი) · რჩეული · ფაილები ·
                     მაღაზიის ბმული (უბმულოზე უხილავი სლოტი — რიგი აღარ „ხტება") · რედაქტირება · წაშლა */
                  bar={
                    <RecordActionBar
                      before={badges}
                      status={
                        <EnumStatusMenu
                          domain="game"
                          value={game.status}
                          options={GAME_STATUSES}
                          label={t('form.status')}
                          onChange={(next) => status.mutate({ id: game.id, next })}
                        />
                      }
                      favorite={fav}
                      files={{ count: game.files_count ?? 0, onOpen: () => setOpened(game) }}
                      link={{ href: store?.url, label: t('actions.link'), icon: ExternalLink, title: store?.label || store?.url }}
                      onEdit={() => setEditing(game)}
                      onDelete={askDelete}
                    />
                  }
                />
              )
            })}
          </RecordList>

          <Pagination {...query.pagination} />
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
          {/* სტატუსი აქ განზრახ არ არის — ის საიდბარის სექციაა */}
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
