import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Music,
  Play,
  Plus,
  X,
} from 'lucide-react'
import { fetchPlaylist, setPlaylistSongs, type Playlist } from '@/api/playlists'
import { fetchSongs } from '@/api/songs'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { moveWithin, sortByIds } from '@/lib/reorder'
import { songItem, usePlayer } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sortable, SortableHandle, SortableItem } from '@/components/ui/sortable'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { useToast } from '@/components/ui/feedback'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { VisitBadge } from '@/components/RecordVisits'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   ერთი პლეილისტი — სიმღერების რიგი.

   ⚠️ სიმღერების **სრული სია ერთი რექვესთით** იგზავნება
   (`PUT /playlists/{id}/songs`): დამატება, მოშორება და გადალაგება ერთი
   და იგივე ოპერაციაა, ე.ი. `sort_order` ვერასდროს გატყდება.
   ============================================================ */

/** სტაბილური ცარიელი სია — ჩატვირთვისას `useMemo` რომ არ ცვიოდეს */
const NO_SONGS: NonNullable<Playlist['songs']> = []

export function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const playlistId = Number(id)
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  // §7.2 — სწორედ აქ აქვს აზრი ავტომატურ გადასვლას: რიგი პლეილისტის რიგია
  const player = usePlayer()

  const [adding, setAdding] = useState(false)
  const [toAdd, setToAdd] = useState<number[]>([])

  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlists', playlistId],
    queryFn: () => fetchPlaylist(playlistId),
    enabled: Number.isFinite(playlistId),
  })

  // დამატების აუზი — ჩემი სიმღერები; მოთხოვნა მხოლოდ პანელის გახსნაზე
  // ⚠️ `all` — პლეილისტში დასამატებელი ავზი მთელი ბიბლიოთეკაა
  const poolQ = useQuery({
    queryKey: ['songs', 'playlist-pool'],
    queryFn: () => fetchSongs({ all: true }).then((p) => p.items),
    enabled: adding,
  })

  /* ⚠️ **მოდულის დონის ცარიელი სია და არა ინლაინ `[]`** (Tasks DEBT-08, იგივე
     ხარვეზი, რაც PERF-11-ში): `playlist?.songs ?? []` ყოველ რენდერზე ახალი
     მასივია, ე.ი. ქვედა `useMemo`-ს deps ყოველთვის იცვლებოდა და memo
     არასდროს ინახებოდა. ესაა ერთადერთი `exhaustive-deps`-ის ნაპოვარი,
     რომელსაც suppress არ ჰქონდა — და სწორედ ის უშლიდა ხელს წესის
     `error`-ად ჩართვას. */
  const songs = playlist?.songs ?? NO_SONGS
  const songIds = useMemo(() => songs.map((s) => s.id), [songs])

  const save = useMutation({
    mutationFn: (ids: number[]) => setPlaylistSongs(playlistId, ids),
    /* Tasks §11 — ოპტიმისტურად: სიმღერა ჩაშვებისთანავე თავის ადგილზე დგება (აქამდე მხოლოდ
       პასუხზე ხტებოდა). ⚠️ ჯერ მიმდინარე ჩამოტვირთვა ჩერდება, თორემ ძველი რიგი ახალს დააწერდა. */
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['playlists', playlistId] })
      qc.setQueryData<Playlist>(['playlists', playlistId], (old) =>
        old?.songs ? { ...old, songs: sortByIds(old.songs, ids, (s) => s.id) } : old,
      )
    },
    onSuccess: (next: Playlist) => {
      qc.setQueryData(['playlists', playlistId], next)
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
    onError: (e) => {
      toast({ title: errorMessage(e), variant: 'error' })
      qc.invalidateQueries({ queryKey: ['playlists', playlistId] })
    },
  })

  const moveBy = (id: number, delta: number) => {
    const next = moveWithin(songIds, id, delta)
    if (next) save.mutate(next)
  }

  const add = () => {
    if (!toAdd.length) return
    // უკვე შემავალი დუბლად არ ჯდება — backend-იც ასუფთავებს, ეს UX-ია
    save.mutate([...songIds, ...toAdd.filter((x) => !songIds.includes(x))])
    setToAdd([])
    setAdding(false)
  }

  const available = useMemo(
    () => (poolQ.data ?? []).filter((s) => !songIds.includes(s.id)),
    [poolQ.data, songIds],
  )

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
      </PageContainer>
    )
  }

  if (!playlist) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('playlists.notFound')}</p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Link
        to="/playlists"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('playlists.title')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{playlist.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {t('playlists.songCount', { count: songs.length })}
              {playlist.visibility === 'public' && ` · ${t('playlists.public')}`}
            </span>
            {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი (გვერდის მაუნთზე ითვლება) */}
            <VisitBadge type="playlist" id={playlist.id} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. ⚠️ `playlist` დომენია,
              მოდული კი `song` — პლეილისტი მუსიკის მოდულში ცხოვრობს (§15). */}
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={playlist.visibility} />
          {/* §7.2 — მთელი პლეილისტი თანმიმდევრობით; ერთი დამთავრდება →
              შემდეგი თავისით ჩაირთვება (ეს არის ამოცანის არსი) */}
          {songs.length > 0 && (
            <Button
              variant="outline"
              onClick={() => player.play(songs.map(songItem), 0, playlist.name)}
            >
              <Play className="size-4" />
              {t('playback.playAll')}
            </Button>
          )}
          <Button onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" />
            {t('playlists.addSongs')}
          </Button>
        </div>
      </div>

      {/* ---------- სიმღერების დამატება ---------- */}
      {adding && (
        <section className="mb-4 rounded-xl border border-border bg-card p-5">
          <Label className="mb-2 flex items-center gap-1.5">{t('playlists.pickSongs')} <InfoHint info={t('playlists.addHint')} /></Label>
          <IdMultiSelect
            items={available.map((s) => ({
              id: s.id,
              label: s.artist ? `${s.title} — ${s.artist}` : s.title,
            }))}
            value={toAdd}
            onChange={setToAdd}
            placeholder={poolQ.isLoading ? t('api.loading') : t('playlists.pickSongs')}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {t('actions.cancel')}
            </Button>
            <Button disabled={!toAdd.length || save.isPending} onClick={add}>
              {t('actions.add')}
            </Button>
          </div>
        </section>
      )}

      {!songs.length && (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('playlists.noSongs')}
        </p>
      )}

      <ol className="space-y-2">
        <Sortable ids={songIds} onReorder={(ids) => save.mutate(ids)}>
        {songs.map((song, i) => {
          const cover = storageUrl(song.thumbnail)
          /* Tasks §7 — მარჯვენა ღილაკის მენიუ: აქედან დაკვრა · წყარო · — · მოხსნა პლეილისტიდან */
          const actions: MenuAction[] = [
            {
              key: 'play',
              label: t('playback.playFromHere'),
              icon: MENU_ICONS.play,
              run: () => player.play(songs.map(songItem), i, playlist.name),
            },
            {
              key: 'source',
              label: t('playlists.openSource'),
              icon: MENU_ICONS.link,
              run: () => window.open(song.url, '_blank', 'noopener,noreferrer'),
            },
            {
              key: 'remove',
              label: t('playlists.removeSong'),
              icon: MENU_ICONS.delete,
              danger: true,
              separator: true,
              disabled: save.isPending,
              run: () => save.mutate(songIds.filter((x) => x !== song.id)),
            },
          ]
          return (
            <RecordContextMenu key={song.id} actions={actions}>
            <SortableItem id={song.id} handle className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <SortableHandle />
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {i + 1}
              </span>

              {/* §7.2 — სურათზე დაჭერა **ამ ადგილიდან** უშვებს პლეილისტს */}
              <button
                onClick={() => player.play(songs.map(songItem), i, playlist.name)}
                aria-label={t('playback.playFromHere')}
                title={t('playback.playFromHere')}
                className="group relative h-10 w-16 shrink-0 cursor-pointer overflow-hidden rounded bg-muted"
              >
                {cover ? (
                  <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center">
                    <Music className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-4 text-white" />
                </span>
              </button>

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{song.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {song.artist ? `${song.artist} · ` : ''}
                  {song.platform}
                  {song.duration ? ` · ${formatDuration(song.duration)}` : ''}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1">
                {/* `Button` `asChild`-ს არ იცნობს — ბმულს იმავე სტილს პირდაპირ ვაძლევთ */}
                <a
                  href={song.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('playlists.openSource')}
                  title={t('playlists.openSource')}
                  className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                >
                  <ExternalLink className="size-4" />
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === 0 || save.isPending}
                  onClick={() => moveBy(song.id, -1)}
                  aria-label={t('videoTypes.moveUp')}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === songs.length - 1 || save.isPending}
                  onClick={() => moveBy(song.id, 1)}
                  aria-label={t('videoTypes.moveDown')}
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  disabled={save.isPending}
                  onClick={() => save.mutate(songIds.filter((x) => x !== song.id))}
                  aria-label={t('playlists.removeSong')}
                >
                  <X className="size-4" />
                </Button>
              </span>
            </SortableItem>
            </RecordContextMenu>
          )
        })}
        </Sortable>
      </ol>
    </PageContainer>
  )
}
