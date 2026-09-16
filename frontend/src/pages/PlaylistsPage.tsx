import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ListMusic,
  Loader2,
  SquarePen,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylist,
  fetchPlaylists,
  reorderPlaylists,
  updatePlaylist,
  type Playlist,
} from '@/api/playlists'
import { errorMessage } from '@/lib/errors'
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { songItem, usePlayer } from '@/lib/player'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   პლეილისტები — სიმღერების მოდულის ქვე-გვერდი (2026-09-03).

   აქ მხოლოდ ნაკრებები და მათი რიგი იმართება; სიმღერების რიგი შიდა
   გვერდზეა. თანმიმდევრობა drag & drop-ია (`useDragReorder`); ისრიანი
   ღილაკები განზრახ რჩება — native drag & drop კლავიატურით არ მუშაობს.
   ============================================================ */

export function PlaylistsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [editing, setEditing] = useState<Playlist | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Playlist | null>(null)

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
  })

  const reorder = useMutation({
    mutationFn: reorderPlaylists,
    onSuccess: (next) => qc.setQueryData(['playlists'], next),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const drag = useDragReorder(
    playlists.map((p) => p.id),
    (ids) => reorder.mutate(ids),
  )

  return (
    <PageContainer>
      <Link
        to="/songs"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('songs.title')}
      </Link>

      <PageHeader
        module="song"
        title={t('playlists.title')}
        hint={<InfoHint info={t('playlists.subtitle')} />}
        actions={
          <>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('playlists.add')}
            </Button>
          </>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">{t('api.loading')}</p>}
      {!isLoading && !playlists.length && (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('playlists.empty')}
        </p>
      )}

      <ul className="space-y-2">
        {playlists.map((playlist, i) => (
          <li
            key={playlist.id}
            {...drag.handlers(playlist.id)}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3',
              dragRowClass(drag, playlist.id),
            )}
          >
            <DragHandle />
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
              <ListMusic className="size-4" />
            </span>

            <Link to={`/playlists/${playlist.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-medium hover:text-primary">{playlist.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t('playlists.songCount', { count: playlist.songs_count ?? 0 })}
                {playlist.visibility === 'public' && ` · ${t('playlists.public')}`}
              </span>
            </Link>

            <span className="flex shrink-0 items-center gap-1">
              {/* §7.2 — სიმღერები სიაში არ მოდის (`songs_count`-ია), ამიტომ
                  ღილაკი ჯერ პლეილისტს ჩამოტვირთავს და მერე უშვებს */}
              <PlayPlaylistButton playlist={playlist} />
              <Button
                variant="ghost"
                size="icon"
                disabled={i === 0 || reorder.isPending}
                onClick={() => drag.moveBy(playlist.id, -1)}
                aria-label={t('videoTypes.moveUp')}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === playlists.length - 1 || reorder.isPending}
                onClick={() => drag.moveBy(playlist.id, 1)}
                aria-label={t('videoTypes.moveDown')}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(playlist)}>
                <SquarePen className="size-3.5" />
                {t('actions.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleting(playlist)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <PlaylistDialog
          playlist={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && <DeleteDialog playlist={deleting} onClose={() => setDeleting(null)} />}
    </PageContainer>
  )
}

/**
 * პლეილისტის გაშვება სიიდან (§7.2).
 *
 * ⚠️ ცალკე კომპონენტია, რომ ჩამოტვირთვის მდგომარეობა **თითო რიგს** ჰქონდეს:
 * გვერდის დონეზე ერთი `isPending` ყველა ღილაკს ერთდროულად დაატრიალებდა.
 * ცარიელ პლეილისტზე ღილაკი საერთოდ არ ჩანს — გამორთული ღილაკი „რატომ?"-ს
 * ტოვებდა, `songs_count` კი პასუხს უკვე შეიცავს.
 */
function PlayPlaylistButton({ playlist }: { playlist: Playlist }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const player = usePlayer()

  const start = useMutation({
    mutationFn: () => fetchPlaylist(playlist.id),
    onSuccess: (full) => {
      const items = (full.songs ?? []).map(songItem)
      if (items.length) player.play(items, 0, full.name)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!playlist.songs_count) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={start.isPending}
      onClick={() => start.mutate()}
      aria-label={t('playback.playAll')}
      title={t('playback.playAll')}
    >
      {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
    </Button>
  )
}

/** დამატება/გადარქმევა — ერთი მოდალი, როგორც ვიდეოს ტიპებზე */
function PlaylistDialog({ playlist, onClose }: { playlist: Playlist | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(playlist?.name ?? '')

  const save = useMutation({
    mutationFn: () =>
      playlist ? updatePlaylist(playlist.id, { name }) : createPlaylist({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] })
      toast({ title: t('toast.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={playlist ? t('playlists.rename') : t('playlists.add')} onClose={onClose}>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <Label htmlFor="playlist-name">{t('playlists.name')}</Label>
        <Input
          id="playlist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('playlists.namePlaceholder')}
          autoFocus
        />

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

/** წაშლა — სიმღერები ხელუხლებელი რჩება, მხოლოდ ნაკრები ქრება */
function DeleteDialog({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const remove = useMutation({
    mutationFn: () => deletePlaylist(playlist.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlists'] })
      toast({ title: t('playlists.deleted'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('playlists.deleteTitle')} onClose={onClose} destructive>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('playlists.deleteHint', {
          name: playlist.name,
          count: playlist.songs_count ?? 0,
        })}
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('actions.delete')}
        </Button>
      </div>
    </ModalShell>
  )
}
