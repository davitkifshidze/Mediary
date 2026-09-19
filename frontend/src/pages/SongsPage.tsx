import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import { Disc3, ExternalLink, Headphones, ListMusic, Loader2, Music, Paperclip, SquarePen, Play, Plus, Search, Star, Tags, Trash2 } from 'lucide-react'
import {
  SONG_MAX_RATING,
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
import { formatDuration, isDirectMediaUrl, probeMediaDuration } from '@/lib/videoDuration'
import { songItem, usePlayer } from '@/lib/player'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModuleIcon } from '@/components/ModuleIcon'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { PosterUploader } from '@/components/PosterUploader'
import { SongGenreDialog } from '@/components/SongGenreDialog'
import { DuplicateLinkNotice } from '@/components/DuplicateLinkNotice'
import { SongDetail } from '@/components/SongDetail'
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
import { DurationInput } from '@/components/ui/duration-input'
import { FieldLabel } from '@/components/ui/field-label'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/* ============================================================
   სიმღერების მოდული (`song`, 2026-09-03).

   იგივე მოდელი, რაც ვიდეოებზე — საიდბარის სექციები (ჟანრები + რჩეული),
   მარჯვენა ფილტრების პანელი და ერთი მოდალი ფორმისთვის — ოღონდ ველების
   ნაკრები მუსიკალურია: შემსრულებელი · ალბომი · წელი · ჟანრი · ქულა.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'artist', 'album', 'year', 'rating', 'played'] as const

/**
 * რამდენი მასალა ჰკიდია სიმღერას (§7.4).
 *
 * ⚠️ `undefined` = **არ დაგვითვლია** და არა ნული — ამიტომ `?? 0`, და ღილაკზე
 * რიცხვი მხოლოდ მაშინ ჩანს, როცა მართლა არის რაღაც.
 */
function materialCount(song: Song): number {
  return (song.images_count ?? 0) + (song.documents_count ?? 0) + (song.notes_count ?? 0)
}

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
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  // მოქმედი ფილტრი მისამართშია (2.2-ის მოდელი): საიდბარი და პანელი ერთსა და იმავეს ხედავს
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
  // §7.2 — დაკვრა გლობალურ ზოლშია: სიმღერაზე დაჭერა **მთელ გაფილტრულ სიას**
  // აგდებს რიგში, ე.ი. დამთავრებისას შემდეგი თავისით ჩაირთვება.
  const player = usePlayer()

  /* §7.2 — დასაკრავი რიგი **მთელი გაფილტრული სიაა** და არა ჩატვირთული გვერდი.
     ⚠️ ეს წესი გვერდებად დაყოფამდე არსებობდა და განზრახ უცვლელი რჩება:
     500 სიმღერიან ფილტრზე „დაკვრა" 60-ზე არ უნდა გაჩერდეს. დამატებითი
     მოთხოვნა მხოლოდ **ცხად დაჭერაზე** ხდება (და ქეშდება), და არა სექციის
     გახსნაზე — სწორედ ის იყო ძვირი. წყარო თუ არ მოვიდა, ჩატვირთულს ვუკრავთ:
     დუმილი უარესი პასუხია. */
  const playFrom = async (index: number) => {
    try {
      const full = await qc.fetchQuery({
        queryKey: ['songs', filters, 'queue'],
        queryFn: () => fetchSongs({ ...filters, all: true }),
      })
      player.play(full.items.map(songItem), index, t('songs.title'))
    } catch {
      player.play(songs.map(songItem), index, t('songs.title'))
    }
  }
  // §7.4 — მიმაგრებული ფაილები/ჩანიშვნები. ⚠️ დაკვრისგან **ცალკეა**:
  // სიმღერაზე დაჭერა ისევ უკრავს, სამაგრები ცალკე ღილაკზეა.
  const [material, setMaterial] = useState<Song | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: SongFilters = {
    q: term || undefined,
    genre_id: genres.length ? genres.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['songs', filters, limit],
    queryFn: () => fetchSongs({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const genresQ = useQuery({ queryKey: ['song-genres'], queryFn: fetchSongGenres })
  const songs = useMemo(() => query.data?.items ?? [], [query.data])
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
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
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

          <ul className="space-y-2">
            {songs.map((song, i) => {
              const cover = storageUrl(song.thumbnail)
              return (
                <li
                  key={song.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <button
                    onClick={() => playFrom(i)}
                    aria-label={t('songs.play')}
                    className="group relative grid h-12 w-12 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md bg-muted"
                  >
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Music className="size-5 text-muted-foreground" />
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="size-5 text-white" />
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={song.title}>
                      {song.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                      {song.artist && <span className="truncate">{song.artist}</span>}
                      {song.album && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Disc3 className="size-3 shrink-0" />
                          {song.album}
                          {song.year ? ` (${song.year})` : ''}
                        </span>
                      )}
                      {!song.album && song.year ? <span>{song.year}</span> : null}
                      {/* ჟანრები **მრავალია** (`DECISIONS.md` §5) — ყველა ჩანს */}
                      {(song.genres ?? []).map((genre) => (
                        <span key={genre.id} className="inline-flex items-center gap-1">
                          <ModuleIcon name={genre.icon} className="size-3" />
                          {dictionaryName(genre, lang)}
                        </span>
                      ))}
                      {song.duration ? <span>{formatDuration(song.duration)}</span> : null}
                      {song.play_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Headphones className="size-3" />
                          {song.play_count}
                        </span>
                      )}
                    </p>
                    {/* §5.3 — რომელ პლეილისტშია. ⚠️ „არცერთში" **ცხადად** ეწერება:
                        ცარიელი ადგილი „არ ვიცი"-საც ნიშნავდა და „არცერთსაც". */}
                    {song.playlists && (
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
                    )}
                    {song.tags.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {song.tags.map((tag) => (
                          <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                            #{tag}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>

                  <span className="flex shrink-0 items-center gap-1">
                    {song.rating != null && (
                      <Badge className="mr-1 bg-secondary tabular-nums">
                        {song.rating}/{SONG_MAX_RATING}
                      </Badge>
                    )}
                    <button
                      onClick={() => favorite.mutate(song.id)}
                      aria-label={t(song.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-gold"
                    >
                      <Star className={cn('size-4', song.is_favorite && 'fill-gold text-gold')} />
                    </button>
                    <a
                      href={song.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('songs.source')}
                      title={t('songs.source')}
                      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    {/* §7.4 — ტექსტი, ნოტები, ფოტოები, ჩანიშვნები */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMaterial(song)}
                      aria-label={t('songs.material')}
                      title={t('songs.material')}
                    >
                      <Paperclip className="size-3.5" />
                      {materialCount(song) > 0 && (
                        <span className="tabular-nums">{materialCount(song)}</span>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(song)}>
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('songs.deleteTitle'),
                          description: t('songs.deleteHint', { name: song.title }),
                          variant: 'destructive',
                        })
                        if (ok) remove.mutate(song.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>

          <ShowMore shown={songs.length} total={total} onMore={showMore} loading={query.isFetching} />
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
          {/* „ყველა"/„რჩეული" აქ განზრახ არ არის (Tasks 3) — ისინი საიდბარის სექციებია */}
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

      {material && <SongDetail song={material} onClose={() => setMaterial(null)} />}

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
          /* FEAT-17 — „ეს უკვე გაქვს → გახსნა". ⚠️ ჩანაწერი id-ით მოაქვს
             და არა ჩატვირთული სიიდან: დუბლი შეიძლება მიმდინარე ფილტრს
             მიღმა იყოს. */
          onOpenExisting={async (existingId) => {
            const found = await fetchSong(existingId)
            setEditing(null)
            setMaterial(found)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

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
  /** FEAT-17 — დუბლის გახსნა */
  onOpenExisting: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('song')

  const [form, setForm] = useState({
    title: song?.title ?? '',
    artist: song?.artist ?? '',
    album: song?.album ?? '',
    year: song?.year ? String(song.year) : '',
    url: song?.url ?? '',
    tags: song?.tags ?? [],
  })
  // ჟანრები **მრავალია** (`DECISIONS.md` §5) — ჩიპებით ირჩევა, თამაშის ნიმუშით
  const [genreIds, setGenreIds] = useState<number[]>(song?.genre_ids ?? [])
  // ხანგრძლივობა ავტომატურია — ხელით ველი არაა, მნიშვნელობა state-ში რჩება
  const [duration, setDuration] = useState<number | null>(song?.duration ?? null)
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(storageUrl(song?.thumbnail))
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<VideoMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [probing, setProbing] = useState(false)
  const [newGenre, setNewGenre] = useState(false)
  const lastFetched = useRef<string>(song?.url ?? '')

  /** რომელ პლეილისტებში შედის ეს სიმღერა */
  const initialPlaylists = useMemo(() => song?.playlist_ids ?? [], [song])
  const [playlistIds, setPlaylistIds] = useState<number[]>(initialPlaylists)
  const playlistsQ = useQuery({ queryKey: ['playlists'], queryFn: fetchPlaylists })

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/ფოტოს/ხანგრძლივობის წამოღებას.
   * ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ.
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    let fetchedDuration: number | null = null
    try {
      const m = await fetchSongMetadata(clean, song?.id)
      setMeta(m)
      fetchedDuration = m.duration
      if (m.duration) setDuration((d) => d ?? m.duration)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        // YouTube-ის „author" არხის სახელია — შემსრულებლის საუკეთესო მიახლოება
        artist: f.artist || (m.author ?? ''),
        tags: f.tags.length ? f.tags : m.tags,
      }))
    } catch {
      setMeta(null)
    } finally {
      setMetaLoading(false)
    }

    if (!fetchedDuration && isDirectMediaUrl(clean)) {
      setProbing(true)
      const seconds = await probeMediaDuration(clean)
      setProbing(false)
      if (seconds) setDuration((d) => d ?? seconds)
    }
  }

  const save = useMutation({
    /**
     * სიმღერა + პლეილისტები ორ რექვესთია: pivot-ს ცალკე endpoint ამუშავებს
     * (`PUT /songs/{id}/playlists`), თანაც ახალ სიმღერას id მხოლოდ შენახვის
     * შემდეგ აქვს. მეორე რექვესთი მხოლოდ მაშინ მიდის, თუ არჩევანი შეიცვალა.
     */
    mutationFn: async (input: SongInput) => {
      const saved = song ? await updateSong(song.id, input) : await createSong(input)

      const changed =
        playlistIds.length !== initialPlaylists.length ||
        playlistIds.some((id) => !initialPlaylists.includes(id))
      if (changed) await setSongPlaylists(saved.id, playlistIds)

      return saved
    },
    onSuccess: () => {
      toast({ title: t('songs.saved'), variant: 'success' })
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

    const { tags, removed } = dedupeTags(form.tags)
    if (removed > 0) {
      setForm((f) => ({ ...f, tags }))
      toast({ title: t('tags.duplicate', { count: removed }), variant: 'info' })
    }

    save.mutate({
      title: form.title,
      url: form.url,
      artist: form.artist || null,
      album: form.album || null,
      year: form.year ? Number(form.year) : null,
      genre_ids: genreIds,
      // ⚠️ §5.3 — „ჩემი ქულა" ფორმიდან მოიხსნა და **აღარ იგზავნება**: ცარიელი
      // მნიშვნელობა არსებულ ქულას ჩუმად წაშლიდა (ძველი ჩანაწერები ისევ ჩანს)
      duration,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(song ? 'songs.edit' : 'songs.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* ⚠️ `url` `locked`-ია (§6.5) — ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4),
            მაგრამ `shows()`-ს ფორმა მაინც ეკითხება: მოხსნის შემდეგ
            ჩამრთველი რომ მართლა მუშაობდეს. */}
        <div className={fields.shows('url') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="s-url" required>{fields.label('url')}</FieldLabel>
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
          <p className="mt-1 text-xs text-muted-foreground">{t('songs.urlHint')}</p>

          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {/* FEAT-17 — ბმულის დუბლი (ვიდეოს იგივე კომპონენტი) */}
          {!metaLoading && meta?.existing && (
            <DuplicateLinkNotice
              title={meta.existing.title}
              onOpen={() => onOpenExisting(meta.existing!.id)}
            />
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card/50 p-2">
              {meta.thumbnail_url && (
                <img src={meta.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{meta.title ?? t('videos.metaNoTitle')}</p>
                <p className="capitalize">
                  {meta.platform}
                  {meta.author && ` · ${meta.author}`}
                  {duration ? ` · ${formatDuration(duration)}` : ''}
                </p>
                {meta.platform === 'youtube' && !meta.youtube_key && (
                  <p className="mt-0.5">{t('videos.metaNeedsKey')}</p>
                )}
              </div>
            </div>
          )}
          {probing && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.durationProbing')}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('title') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="s-title" required={fields.required('title')} hint={fields.hint('title')}>
              {fields.label('title')}
            </FieldLabel>
            <Input
              id="s-title"
              placeholder={fields.placeholder('title') ?? t('songs.namePlaceholder')}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className={fields.shows('artist') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="s-artist" required={fields.required('artist')} hint={fields.hint('artist')}>
              {fields.label('artist')}
            </FieldLabel>
            <Input
              id="s-artist"
              placeholder={fields.placeholder('artist') ?? t('songs.artistPlaceholder')}
              value={form.artist}
              onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
            />
            {errors.artist && <p className="mt-1 text-xs text-destructive">{errors.artist}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {fields.shows('album') && (
          <div>
            <FieldLabel htmlFor="s-album" required={fields.required('album')} hint={fields.hint('album')}>
              {fields.label('album')}
            </FieldLabel>
            <Input
              id="s-album"
              value={form.album}
              placeholder={fields.placeholder('album')}
              onChange={(e) => setForm((f) => ({ ...f, album: e.target.value }))}
            />
          </div>
          )}
          <div className={fields.shows('year') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="s-year" required={fields.required('year')} hint={fields.hint('year')}>
              {fields.label('year')}
            </FieldLabel>
            <Input
              id="s-year"
              type="number"
              inputMode="numeric"
              min={1850}
              max={2200}
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
            {errors.year && <p className="mt-1 text-xs text-destructive">{errors.year}</p>}
          </div>
        </div>

        {/* §2.5 — ხანგრძლივობა ხელით (ბმულიდან probe მაინც მუშაობს); ბაზაში წამები */}
        <div className={fields.shows('duration') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="s-duration" required={fields.required('duration')} hint={fields.hint('duration')}>
            {fields.label('duration')}
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <DurationInput id="s-duration" value={duration} onChange={setDuration} />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {duration ? formatDuration(duration) : '—'}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {/* ჟანრები — per-user ლექსიკონი, ⚠️ **მრავალი** (`DECISIONS.md` §5) */}
            <div className={fields.shows('genres') ? 'flex items-center justify-between' : 'hidden'}>
              <FieldLabel required={fields.required('genres')} hint={fields.hint('genres')}>
                {fields.label('genres')}
              </FieldLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setNewGenre(true)}
                title={t('songGenres.add')}
              >
                <Plus className="size-3.5" />
                {t('songGenres.add')}
              </Button>
            </div>
            <div
              className={cn(
                fields.shows('genres') ? 'mt-1 flex flex-wrap gap-1.5' : 'hidden',
                // ⚠️ აქ `Select` არ არის (ჭიპებია), ამიტომ წითელდება მთელ ბლოკს
                errors.genre_ids && 'rounded-md border border-destructive p-1.5',
              )}
            >
              {genres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() =>
                    setGenreIds((cur) =>
                      cur.includes(genre.id) ? cur.filter((id) => id !== genre.id) : [...cur, genre.id],
                    )
                  }
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                    genreIds.includes(genre.id)
                      ? 'border-primary bg-secondary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {dictionaryName(genre, lang)}
                </button>
              ))}
            </div>
            {errors.genre_ids && <p className="mt-1 text-xs text-destructive">{errors.genre_ids}</p>}

            <div className={fields.shows('tags') ? 'mt-4' : 'hidden'}>
              <FieldLabel htmlFor="s-tags" required={fields.required('tags')} hint={fields.hint('tags')}>
                {fields.label('tags')}
              </FieldLabel>
              <TagSelect
                inputId="s-tags"
                options={allTags}
                value={form.tags}
                onChange={(tags) => setForm((f) => ({ ...f, tags }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('videos.tagsDedupeHint')}</p>
            </div>

            <div className={fields.shows('playlists') ? 'mt-4' : 'hidden'}>
              <FieldLabel htmlFor="s-playlists" required={fields.required('playlists')} hint={fields.hint('playlists')}>
                {fields.label('playlists')}
              </FieldLabel>
              <IdMultiSelect
                items={(playlistsQ.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
                value={playlistIds}
                onChange={setPlaylistIds}
                placeholder={playlistsQ.isLoading ? t('api.loading') : t('playlists.pickForSong')}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('playlists.songHint')}</p>
            </div>
          </div>

          <div className={fields.shows('thumbnail') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
              {fields.label('thumbnail')}
            </FieldLabel>
            <PosterUploader
              variant="wide"
              hint={t('songs.coverHint')}
              preview={thumbPreview}
              onSelect={(file) => {
                setThumbnail(file)
                setRemoveThumb(false)
                setThumbPreview(URL.createObjectURL(file))
              }}
              onClear={() => {
                setThumbnail(null)
                setThumbPreview(null)
                setRemoveThumb(true)
              }}
            />
          </div>
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

      {/* §6 ფაზა 3 — მორგებული ველები (იხ. `CustomFieldsCard`: ბარათი თვითონ ინახავს თავს) */}
      <div className="mt-4">
        <CustomFieldsCard module="song" recordId={song?.id ?? null} />
      </div>

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
