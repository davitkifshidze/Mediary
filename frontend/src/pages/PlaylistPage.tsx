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
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { songItem, usePlayer } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { Button, buttonVariants } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   ერთი პლეილისტი — სიმღერების რიგი.

   ⚠️ სიმღერების **სრული სია ერთი რექვესთით** იგზავნება
   (`PUT /playlists/{id}/songs`): დამატება, მოშორება და გადალაგება ერთი
   და იგივე ოპერაციაა, ე.ი. `sort_order` ვერასდროს გატყდება.
   ============================================================ */

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

  const songs = playlist?.songs ?? []
  const songIds = useMemo(() => songs.map((s) => s.id), [songs])

  const save = useMutation({
    mutationFn: (ids: number[]) => setPlaylistSongs(playlistId, ids),
    onSuccess: (next: Playlist) => {
      qc.setQueryData(['playlists', playlistId], next)
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const drag = useDragReorder(songIds, (ids) => save.mutate(ids))

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
          <p className="mt-1 text-sm text-muted-foreground">
            {t('playlists.songCount', { count: songs.length })}
            {playlist.visibility === 'public' && ` · ${t('playlists.public')}`}
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
          <Label className="mb-2 block">{t('playlists.pickSongs')}</Label>
          <IdMultiSelect
            items={available.map((s) => ({
              id: s.id,
              label: s.artist ? `${s.title} — ${s.artist}` : s.title,
            }))}
            value={toAdd}
            onChange={setToAdd}
            placeholder={poolQ.isLoading ? t('api.loading') : t('playlists.pickSongs')}
          />
          <p className="mt-2 text-xs text-muted-foreground">{t('playlists.addHint')}</p>
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
        {songs.map((song, i) => {
          const cover = storageUrl(song.thumbnail)
          return (
            <li
              key={song.id}
              {...drag.handlers(song.id)}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2',
                dragRowClass(drag, song.id),
              )}
            >
              <DragHandle />
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
                  onClick={() => drag.moveBy(song.id, -1)}
                  aria-label={t('videoTypes.moveUp')}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === songs.length - 1 || save.isPending}
                  onClick={() => drag.moveBy(song.id, 1)}
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
            </li>
          )
        })}
      </ol>
    </PageContainer>
  )
}
