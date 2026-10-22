import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePagedList } from '@/lib/paged'
import { usePageSize } from '@/lib/pageSize'
import { useDrillParams } from '@/lib/statsLinks'
import { Pagination } from '@/components/ui/pagination'
import { Disc3, ExternalLink, Headphones, Link2, ListMusic, Loader2, Music, Play, Plus, Search, Tags } from 'lucide-react'
import {
  createSong,
  deleteSong,
  fetchSongGenres,
  fetchSong,
  fetchSongMetadata,
  fetchSongs,
  toggleSongFavorite,
  updateSong,
  type Song,
  type SongFilters,
  type SongGenre,
  type SongInput,
} from '@/api/songs'
import { fetchPlaylists, setSongPlaylists } from '@/api/playlists'
import type { VideoMetadata } from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { songItem, usePlayer } from '@/lib/player'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModuleIcon } from '@/components/ModuleIcon'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { PosterUploader } from '@/components/PosterUploader'
import { SongGenreDialog } from '@/components/SongGenreDialog'
import { DuplicateLinkNotice } from '@/components/DuplicateLinkNotice'
import { TagSelect } from '@/components/TagSelect'
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
import { RatingSelect } from '@/components/ui/rating-select'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Chip } from '@/components/ui/chip'
import { genreColor, tintStyle } from '@/lib/gameMeta'
import { QuickFill } from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { useRecordLayout } from '@/lib/recordLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'
import { cn } from '@/lib/utils'
import { RatingBadge } from '@/components/ui/star-rating'
import { RecordActionBar } from '@/components/RecordActionBar'

/* ============================================================
   სიმღერების მოდული (`song`, 2026-09-03).

   იგივე მოდელი, რაც ვიდეოებზე — საიდბარის სექციები (ჟანრები + რჩეული),
   მარჯვენა ფილტრების პანელი და ერთი მოდალი ფორმისთვის — ოღონდ ველების
   ნაკრები მუსიკალურია: შემსრულებელი · ალბომი · წელი · ჟანრი · ქულა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'artist', 'album', 'year', 'rating', 'played'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { genres: [] as string[], tags: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function SongsPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [params, setParams] = useSearchParams()
  // ხედი მოდულზე ინახება; ნაგულისხმევი — ახლანდელი ხედი
  const [layout, setLayout] = useRecordLayout('song', 'rows')
  const [pageSize, setPageSize, columns] = usePageSize('song', layout)
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  // მოქმედი ფილტრი მისამართშია (ბიბლიოთეკის მოდელი): საიდბარი და პანელი ერთსა და იმავეს ხედავს
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
  const [editing, setEditing] = useState<Song | 'new' | null>(null)
  // დაკვრა გლობალურ ზოლშია: სიმღერაზე დაჭერა **მთელ გაფილტრულ სიას**
  // აგდებს რიგში, ე.ი. დამთავრებისას შემდეგი თავისით ჩაირთვება.
  const player = usePlayer()

  /* დასაკრავი რიგი **მთელი გაფილტრული სიაა** და არა ჩატვირთული გვერდი.
     ⚠️ ეს წესი გვერდებად დაყოფამდე არსებობდა და განზრახ უცვლელი რჩება:
     500 სიმღერიან ფილტრზე „დაკვრა" 60-ზე არ უნდა გაჩერდეს. დამატებითი
     მოთხოვნა მხოლოდ **ცხად დაჭერაზე** ხდება (და ქეშდება), და არა სექციის
     გახსნაზე — სწორედ ის იყო ძვირი. წყარო თუ არ მოვიდა, ჩატვირთულს ვუკრავთ:
     დუმილი უარესი პასუხია.
     ⚠️ საწყისი **id-ით** იძებნება: გვერდებად დაყოფის შემდეგ მეორე გვერდის
     პირველი სიმღერა ინდექსით 0 იყო — სრულ სიაში ეს პირველი გვერდის პირველია. */
  const playFrom = async (song?: Song) => {
    let list = songs
    try {
      const full = await qc.fetchQuery({
        queryKey: ['songs', filters, 'queue'],
        queryFn: () => fetchSongs({ ...filters, all: true }),
      })
      list = full.items
    } catch {
      // ჩატვირთული გვერდი რჩება
    }
    const at = song ? list.findIndex((entry) => entry.id === song.id) : 0
    player.play(list.map(songItem), Math.max(at, 0), t('songs.title'))
  }
  // მიმაგრებული ფაილები/ჩანიშვნები. ⚠️ დაკვრისგან **ცალკეა**:
  // სიმღერაზე დაჭერა ისევ უკრავს, სამაგრები ცალკე ღილაკზეა.

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const drill = useDrillParams()
  const filters: SongFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"; მიმდინარე გვერდი `?page=`-შია
  const query = usePagedList({
    queryKey: ['songs', filters],
    fetchPage: (page, per_page) => fetchSongs({ ...filters, page, per_page }),
    pageSize,
  })
  const genresQ = useQuery({ queryKey: ['song-genres'], queryFn: fetchSongGenres })
  const songs = query.items
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

  const invalidate = () => qc.invalidateQueries({ queryKey: ['songs'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleSongFavorite, onSuccess: invalidate, onError: fail })
  const remove = useMutation({ mutationFn: deleteSong, onSuccess: invalidate, onError: fail })

  /** ფორმის ტეგების შემოთავაზებები — ყველა სექციიდან დანახული ტეგი გროვდება */
  const [knownTags, setKnownTags] = useState<string[]>([])
  useEffect(() => {
    if (!songs.length) return
    setKnownTags((prev) => {
      const merged = new Set([...prev, ...songs.flatMap((s) => s.tags)])
      return merged.size === prev.length ? prev : [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [songs])

  const tagOptions = useMemo(() => {
    const set = new Set([...knownTags, ...songs.flatMap((s) => s.tags), ...tags])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [knownTags, songs, tags])

  /* ---------- ფილტრის გაშვება ---------- */

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.genres.length) p.set('genre', next.genres.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/songs', search: p.toString() })
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
      : onlyGenre
        ? dictionaryName(onlyGenre, lang)
        : t('songs.title')

  return (
    <PageContainer>
      <PageHeader
        module="song"
        title={heading}
        subtitle={t('songs.count', { count: total })}
        actions={
          <>
            {/* მთელი (გაფილტრული) სია რიგში — რიგის პირველი ღილაკი: ის გვერდის
                მთავარი მოქმედებაა და ჰედერის მეორე ხაზზე ჩასვლისასაც თავში რჩება.
                აქამდე მხოლოდ მთავარ ფოტოზე დაჭერა უკრავდა. */}
            {songs.length > 0 && (
              <Button variant="outline" onClick={() => playFrom()}>
                <Play className="size-4" />
                {t('playback.playAll')}
              </Button>
            )}
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
            {/* „გვერდზე რამდენი“ — ხედის სვეტების ჯერადი, მოდულზე ინახება */}
            <PageSizePick value={pageSize} onChange={setPageSize} columns={columns} total={total} />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('songs.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('songs.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`songs.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Link
              to="/playlists"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ListMusic className="size-4" />
              {t('playlists.title')}
            </Link>
            <Link
              to="/dictionaries/song-genres"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('songGenres.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('songs.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !songs.length && (
            <EmptyState
              title={term ? t('songs.noResults', { q: term }) : t('songs.empty')}
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
                    {t('songs.add')}
                  </Button>
                </>
              }
            />
          )}

          <RecordList layout={layout}>
            {songs.map((song) => {
              const cover = storageUrl(song.thumbnail)
              const fav = {
                active: song.is_favorite,
                pending: favorite.isPending && favorite.variables === song.id,
                onToggle: () => favorite.mutate(song.id),
              }
              const askDelete = async () => {
                const ok = await confirm({
                  title: t('songs.deleteTitle'),
                  description: t('songs.deleteHint', { name: song.title }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(song.id)
              }
              const badges = (
                <>
                  <RatingBadge value={song.rating} size="row" className="mr-1" />
                </>
              )
              /* მარჯვენა ღილაკის მენიუ: დაკვრა · წყარო · რჩეული · — · რედაქტირება · წაშლა */
              const actions: MenuAction[] = [
                { key: 'play', label: t('playback.playFromHere'), icon: MENU_ICONS.play, run: () => void playFrom(song) },
                {
                  key: 'source',
                  label: t('playback.openSource'),
                  icon: MENU_ICONS.link,
                  run: () => window.open(song.url, '_blank', 'noopener,noreferrer'),
                },
                favoriteAction(song.is_favorite, () => favorite.mutate(song.id), t),
                { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(song) },
                {
                  key: 'delete',
                  label: t('actions.delete'),
                  icon: MENU_ICONS.delete,
                  danger: true,
                  run: askDelete,
                },
              ]
              return (
                /* სიმღერას ფანჯარა არ აქვს: ფოტო უკრავს, სათაური ტექსტია */
                <RecordView
                  key={song.id}
                  title={song.title}
                  staticTitle
                  onOpen={() => void playFrom(song)}
                  openLabel={t('songs.play')}
                  photo={cover}
                  placeholder={<Music className="size-5" />}
                  photoHover={<Play className="size-5 text-white" />}
                  meta={
                    <>
                      {song.artist && <span className="truncate">{song.artist}</span>}
                      {song.album && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Disc3 className="size-3 shrink-0" />
                          {song.album}
                          {song.year ? ` (${song.year})` : ''}
                        </span>
                      )}
                      {!song.album && song.year ? <span>{song.year}</span> : null}
                      {/* ჟანრები **მრავალია** — ყველა ჩანს */}
                      {(song.genres ?? []).map((genre) => (
                        <span key={genre.id} className="inline-flex items-center gap-1">
                          <ModuleIcon name={genre.icon} className="size-3" />
                          {dictionaryName(genre, lang)}
                        </span>
                      ))}
                      {song.play_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Headphones className="size-3" />
                          {song.play_count}
                        </span>
                      )}
                    </>
                  }
                  extra={
                    /* რომელ პლეილისტშია. ⚠️ „არცერთში" **ცხადად** ეწერება:
                       ცარიელი ადგილი „არ ვიცი"-საც ნიშნავდა და „არცერთსაც". */
                    song.playlists && (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <ListMusic className="size-3 shrink-0" />
                        {song.playlists.length === 0 ? (
                          <span className="italic">{t('songs.noPlaylist')}</span>
                        ) : (
                          song.playlists.map((p) => (
                            <Link
                              key={p.id}
                              to={`/playlists/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-[5px] bg-secondary px-1.5 py-0.5 hover:text-foreground"
                            >
                              {p.name}
                            </Link>
                          ))
                        )}
                      </p>
                    )
                  }
                  tags={song.tags}
                  actions={actions}
                  onDelete={askDelete}
                  favorite={fav}
                  badges={badges}
                  onEdit={() => setEditing(song)}
                  /* ერთი ზოლი ყველა სიაზე: ქულა · რჩეული · ბმული · რედაქტირება · წაშლა;
                     სიმღერას სტატუსი და ფაილები არ აქვს (დახურული გადაწყვეტილებები) */
                  bar={
                    <RecordActionBar
                      before={badges}
                      favorite={fav}
                      link={{ href: song.url, label: t('actions.link'), icon: ExternalLink, title: t('songs.source') }}
                      onEdit={() => setEditing(song)}
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
          {/* „ყველა"/„რჩეული" აქ განზრახ არ არის — ისინი საიდბარის სექციებია */}
          <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
            <FilterOptionList>
              {allGenres.map((genre) => (
                <FilterOption
                  key={genre.id}
                  label={dictionaryName(genre, lang)}
                  count={genre.songs_count}
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
              <p className="px-1.5 py-1 text-xs text-muted-foreground">{t('songs.noTags')}</p>
            )}
          </FilterGroup>
        </FilterPanel>
      </div>


      {editing && (
        <SongForm
          song={editing === 'new' ? null : editing}
          allTags={knownTags}
          genres={allGenres}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['song-genres'] })
            qc.invalidateQueries({ queryKey: ['playlists'] })
            setEditing(null)
          }}
          /* „ეს უკვე გაქვს → გახსნა". ⚠️ ჩანაწერი id-ით მოაქვს
             და არა ჩატვირთული სიიდან: დუბლი შეიძლება მიმდინარე ფილტრს
             მიღმა იყოს. */
          onOpenExisting={async (existingId) => {
            // სიმღერას დეტალის ფანჯარა აღარ აქვს: დუბლი ფორმაში იხსნება
            setEditing(await fetchSong(existingId))
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'song-form'

function SongForm({
  song,
  allTags,
  genres,
  onClose,
  onSaved,
  onOpenExisting,
}: {
  song: Song | null
  allTags: string[]
  genres: SongGenre[]
  onClose: () => void
  onSaved: () => void
  /** დუბლის გახსნა */
  onOpenExisting: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  // რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('song')

  const [form, setForm] = useState({
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    album: song?.album ?? '',
    year: song?.year ? String(song.year) : '',
    url: song?.url ?? '',
    tags: song?.tags ?? [],
    // „ჩემი ქულა" ბრუნდება: რიცხვი ან `null` (`RatingSelect`)
    rating: song?.rating ?? null,
  })
  // ჟანრები **მრავალია** — ჩიპებით ირჩევა, თამაშის ნიმუშით
  const [genreIds, setGenreIds] = useState<number[]>(song?.genre_ids ?? [])
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(storageUrl(song?.thumbnail))
  // ბმულის ფოტო პირდაპირ ჩარჩოშია და შენახვისას `thumbnail_url`-ად მიდის (ვიდეოს წესი)
  const [linkThumb, setLinkThumb] = useState<string | null>(null)
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<VideoMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [newGenre, setNewGenre] = useState(false)
  const lastFetched = useRef<string>(song?.url ?? '')
  const qc = useQueryClient()
  // დამატებითი ველები ახალ სიმღერაზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('song', song)

  /** რომელ პლეილისტებში შედის ეს სიმღერა */
  const initialPlaylists = useMemo(() => song?.playlist_ids ?? [], [song])
  const [playlistIds, setPlaylistIds] = useState<number[]>(initialPlaylists)
  const playlistsQ = useQuery({ queryKey: ['playlists'], queryFn: fetchPlaylists })

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/შემსრულებლის/ტეგების/ფოტოს წამოღებას.
   * ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ.
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    try {
      const m = await fetchSongMetadata(clean, song?.id)
      setMeta(m)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        // YouTube-ის „author" არხის სახელია — შემსრულებლის საუკეთესო მიახლოება
        artist: f.artist || (m.author ?? ''),
        tags: f.tags.length ? f.tags : m.tags,
      }))
      setLinkThumb(m.image_url)
    } catch {
      setMeta(null)
    } finally {
      setMetaLoading(false)
    }
  }

  const save = useMutation({
    /**
     * სიმღერა + პლეილისტები ორ რექვესთია: pivot-ს ცალკე endpoint ამუშავებს
     * (`PUT /songs/{id}/playlists`), თანაც ახალ სიმღერას id მხოლოდ შენახვის
     * შემდეგ აქვს. მეორე რექვესთი მხოლოდ მაშინ მიდის, თუ არჩევანი შეიცვალა.
     */
    mutationFn: async (input: SongInput) => {
      const saved = extras.current ? await updateSong(extras.current.id, input) : await createSong(input)

      const changed =
        playlistIds.length !== initialPlaylists.length ||
        playlistIds.some((id) => !initialPlaylists.includes(id))
      if (changed) await setSongPlaylists(saved.id, playlistIds)

      return saved
    },
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['songs'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      toast({ title: t('songs.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს**: ბლოკი
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

    /* ⚠️ ჟანრი სავალდებულოა — pivot-ია, ე.ი. „მინიმუმ ერთი".
       ⚠️ სტატუსი აქ **არ მოწმდება**: სიმღერას სტატუსი საერთოდ არ აქვს
       (`StatusDomain`-ში არ არის) — აქ მისი მოთხოვნა წესის დარღვევა არ არის, არასებობაა. */
    const picked = pickErrors({ genre_ids: genreIds }, t('validation.pickOne'))
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    // submit-ზე დუბლი უხმოდ იჭრება: `TagSelect` უკვე გააფრთხილა, აქ მხოლოდ გარანტია
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url,
      artist: form.artist || null,
      album: form.album || null,
      year: form.year ? Number(form.year) : null,
      genre_ids: genreIds,
      // ქულა ისევ ფორმაზეა, ე.ი. `null` („გარეშე") მას ასუფთავებს
      rating: form.rating,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
      thumbnail_url: !thumbnail && !thumbPreview ? linkThumb : null,
    })
  }

  return (
    <ModalShell title={t(song ? 'songs.edit' : 'songs.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
            ⚠️ `url` `locked`-ია — ჩაკეტვის მოხსნა ცხადი ქმედებაა,
            მაგრამ `shows()`-ს ფორმა მაინც ეკითხება: მოხსნის შემდეგ
            ჩამრთველი რომ მართლა მუშაობდეს. */}
        <QuickFill
          show={fields.shows('url')}
          title={fields.label('url')}
          htmlFor="s-url"
          required
          hint={t('songs.urlHint')}
          icon={<Link2 className="size-3.5 text-primary" />}
        >
          <Input
            id="s-url"
            autoFocus
            placeholder="https://www.youtube.com/watch?v=…"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            onBlur={(e) => void loadMeta(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (pasted) setTimeout(() => void loadMeta(pasted), 0)
            }}
          />
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}

          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {/* ბმულის დუბლი (ვიდეოს იგივე კომპონენტი) */}
          {!metaLoading && meta?.existing && (
            <DuplicateLinkNotice title={meta.existing.title} onOpen={() => onOpenExisting(meta.existing!.id)} />
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card p-2">
              {meta.image_url && (
                <img src={meta.image_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{meta.title ?? t('videos.metaNoTitle')}</p>
                {/* აღწერა ბარათში (სიმღერას საკუთარი აღწერის ველი არ აქვს) */}
                {meta.description && <p className="line-clamp-2">{meta.description}</p>}
                <p className="capitalize">
                  {meta.platform}
                  {meta.author && ` · ${meta.author}`}
                </p>
                {meta.platform === 'youtube' && !meta.youtube_key && !meta.ytdlp && (
                  <p className="mt-0.5">{t('videos.metaNeedsKey')}</p>
                )}
              </div>
            </div>
          )}
        </QuickFill>

        {/* ყდა ზემოთაა, ძირითად ველებთან ერთად: ორი წყვილი და ქულა */}
        <FormSection
          title={t('form.sections.basic')}
          mediaVariant="wide"
          mediaLabel={
            <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
              {fields.label('thumbnail')}
            </FieldLabel>
          }
          media={
            fields.shows('thumbnail') && (
              <PosterUploader
                fill
                variant="wide"
                hint={t('songs.coverHint')}
                preview={thumbPreview ?? linkThumb}
                onSelect={(file) => {
                  setThumbnail(file)
                  setRemoveThumb(false)
                  setThumbPreview(URL.createObjectURL(file))
                }}
                onClear={() => {
                  setThumbnail(null)
                  setThumbPreview(null)
                  setLinkThumb(null)
                  setRemoveThumb(true)
                }}
              />
            )
          }
        >
          <FormField size="half" {...fields.field('title')} htmlFor="s-title" error={errors.title}>
            <Input
              id="s-title"
              placeholder={fields.placeholder('title') ?? t('songs.namePlaceholder')}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('artist')} htmlFor="s-artist" error={errors.artist}>
            <Input
              id="s-artist"
              placeholder={fields.placeholder('artist') ?? t('songs.artistPlaceholder')}
              value={form.artist}
              onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('album')} htmlFor="s-album">
            <Input
              id="s-album"
              value={form.album}
              placeholder={fields.placeholder('album')}
              onChange={(e) => setForm((f) => ({ ...f, album: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('year')} htmlFor="s-year" error={errors.year}>
            <Input
              id="s-year"
              type="number"
              inputMode="numeric"
              min={1850}
              max={2200}
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('rating')} htmlFor="s-rating" error={errors.rating}>
            <RatingSelect
              id="s-rating"
              value={form.rating}
              invalid={!!errors.rating}
              onChange={(rating) => setForm((f) => ({ ...f, rating }))}
            />
          </FormField>

        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {/* ჟანრები — per-user ლექსიკონი, ⚠️ **მრავალი** */}
          <FormField
            {...fields.field('genres')}
            error={errors.genre_ids}
          >
            {/* ჟანრის ჩიპები აიქონით/ფერით, „დამატება" ღილაკი ჩიპების გვერდით */}
            <div
              className={cn(
                'flex flex-wrap items-center gap-1.5',
                // ⚠️ აქ `Select` არ არის (ჭიპებია), ამიტომ წითელდება მთელ ბლოკს
                errors.genre_ids && 'rounded-md border border-destructive p-1.5',
              )}
            >
              {genres.map((genre) => {
                const on = genreIds.includes(genre.id)
                const color = genreColor(genre)
                return (
                <Chip
                  key={genre.id}
                  active={on}
                  check
                  onClick={() =>
                    setGenreIds((cur) =>
                      cur.includes(genre.id) ? cur.filter((id) => id !== genre.id) : [...cur, genre.id],
                    )
                  }
                  icon={<ModuleIcon name={genre.icon} className="size-3.5" style={on ? undefined : (color ? { color } : undefined)} />}
                  style={tintStyle(color, on)}
                >
                  {dictionaryName(genre, lang)}
                </Chip>
                )
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => setNewGenre(true)}>
                <Plus className="size-3.5" />
                {t('songGenres.add')}
              </Button>
            </div>
          </FormField>

          <FormField
            size="half"
            {...fields.field('tags')}
            hint={joinHints(fields.hint('tags'), t('videos.tagsDedupeHint'))}
            htmlFor="s-tags"
          >
            <TagSelect
              inputId="s-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </FormField>

          <FormField
            size="half"
            {...fields.field('playlists')}
            hint={joinHints(fields.hint('playlists'), t('playlists.songHint'))}
            htmlFor="s-playlists"
          >
            <IdMultiSelect
              items={(playlistsQ.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
              value={playlistIds}
              onChange={setPlaylistIds}
              placeholder={playlistsQ.isLoading ? t('api.loading') : t('playlists.pickForSong')}
            />
          </FormField>
        </FormSection>
      </form>

      {/* დამატებითი ველები; ახალ სიმღერაზე მონახაზი */}
      <CustomFieldsCard
        module="song"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

      {/* სწრაფი „ახალი ჟანრი" — შენახვისთანავე select-ში ირჩევა */}
      {newGenre && (
        <SongGenreDialog
          genre={null}
          onClose={() => setNewGenre(false)}
          onSaved={(saved) => setGenreIds((cur) => [...cur, saved.id])}
        />
      )}
    </ModalShell>
  )
}
