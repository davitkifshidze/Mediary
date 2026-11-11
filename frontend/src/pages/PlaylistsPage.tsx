import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ListMusic,
  Loader2,
  SquarePen,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  deletePlaylist,
  fetchPlaylist,
  fetchPlaylists,
  reorderPlaylists,
  type Playlist,
} from '@/api/playlists'
import { errorMessage } from '@/lib/errors'
import { sortByIds } from '@/lib/reorder'
import { songItem, usePlayer } from '@/lib/player'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { useRecordLayout } from '@/lib/recordLayout'
import { useToast } from '@/components/ui/feedback'
import { MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { PlaylistDialog } from '@/components/PlaylistDialog'

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
  // ფლეილისტების ხედი სიმღერის მოდულზე, თავისი გასაღებით (სიმღერების ხედს არ ეხება)
  const [layout, setLayout] = useRecordLayout('song', 'rows', 'playlist_view')

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: fetchPlaylists,
  })

  const navigate = useNavigate()
  const reorder = useMutation({
    mutationFn: reorderPlaylists,
    // ოპტიმისტურად: რიგი ჩაშვებისთანავე დგება, პასუხი მას ადასტურებს
    onMutate: (ids) => qc.setQueryData<Playlist[]>(['playlists'], (old) => (old ? sortByIds(old, ids, (p) => p.id) : old)),
    onSuccess: (next) => qc.setQueryData(['playlists'], next),
    onError: (e) => {
      toast({ title: errorMessage(e), variant: 'error' })
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
  })

  const playlistIds = playlists.map((p) => p.id)

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
            {/* ბარათები · ბადე · სტრიქონები (სიმღერის მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('playlists.add')}
            </Button>
          </>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">{t('api.loading')}</p>}
      {!isLoading && !playlists.length && (
        <EmptyState title={t('playlists.empty')} />
      )}

      {/* სამი განლაგება, გადათრევა სამივეში */}
      <RecordList layout={layout} sortable={{ ids: playlistIds, onReorder: (ids) => reorder.mutate(ids) }}>
        {playlists.map((playlist) => {
          /* მარჯვენა ღილაკის მენიუ: გახსნა · — · რედაქტირება · წაშლა */
          const actions: MenuAction[] = [
            { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => navigate(`/playlists/${playlist.id}`) },
            { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(playlist) },
            { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => setDeleting(playlist) },
          ]
          return (
            <RecordView
              key={playlist.id}
              sortId={playlist.id}
              title={playlist.name}
              onOpen={() => navigate(`/playlists/${playlist.id}`)}
              openLabel={t('actions.open')}
              rowPhotoClassName="size-9"
              placeholder={<ListMusic className="size-4" />}
              meta={
                <span className="truncate">
                  {t('playlists.songCount', { count: playlist.songs_count ?? 0 })}
                  {playlist.visibility === 'public' && ` · ${t('playlists.public')}`}
                </span>
              }
              actions={actions}
              onEdit={() => setEditing(playlist)}
              onDelete={() => setDeleting(playlist)}
              /* რჩეული პლეილისტს არ აქვს — ბარათის პირველი უჯრა დაკვრაა */
              lead={<PlayPlaylistButton playlist={playlist} />}
              bar={
                <span className="flex shrink-0 items-center gap-1">
                  {/* სიმღერები სიაში არ მოდის (`songs_count`-ია), ამიტომ
                      ღილაკი ჯერ პლეილისტს ჩამოტვირთავს და მერე უშვებს */}
                  <PlayPlaylistButton playlist={playlist} />
                  <Button variant="edit" size="sm" onClick={() => setEditing(playlist)}>
                    <SquarePen className="size-3.5" />
                    {t('actions.edit')}
                  </Button>
                  <Button
                    variant="destructiveOutline"
                    size="sm"
                    aria-label={t('actions.delete')}
                    onClick={() => setDeleting(playlist)}
                  >
                    <Trash2 className="size-3.5" />
                    {t('actions.delete')}
                  </Button>
                </span>
              }
            />
          )
        })}
      </RecordList>

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
 * პლეილისტის გაშვება სიიდან.
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

  /* ტექსტით და `h-9`-ით — რიგის სხვა ღილაკების ზომა; ბარათში 2×2-ის პირველი უჯრაა */
  return (
    <Button variant="outline" size="sm" disabled={start.isPending} onClick={() => start.mutate()}>
      {start.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      {t('playback.playAll')}
    </Button>
  )
}

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

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('actions.delete')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
