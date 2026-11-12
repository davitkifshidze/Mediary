import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, LockOpen, Star } from 'lucide-react'
import { isHidden, reorderPersonalAlbums, togglePersonalAlbumFavorite, type PersonalAlbum } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal, privatePreview } from '@/lib/personal'
import { useToast } from '@/components/ui/feedback'
import { PhotoStack } from '@/components/ui/photo-stack'
import { contextMenuItems, favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { PersonalAlbumDialog } from '@/components/personal/PersonalAlbumDialog'
import { PersonalDeleteDialog } from '@/components/personal/PersonalDeleteDialog'
import { LockBadge } from '@/components/locks/RecordLock'
import { PersonalUnlockDialog, usePersonalLockMenu } from '@/components/personal/PersonalLock'
import { CardActions } from '@/components/personal/PersonalCardActions'

/* ============================================================
   **ალბომების ბარათები** — „ალბომები" ჭრილი და პიროვნების
   „ალბომები" ჩანართი ერთსა და იმავეს ხატავს.

   ⚠️ **დასტა (`PhotoStack`) და არა ცალკე ბარათი** — გალერეის ალბომის
   ვიზუალი: მთავარი ფოტო ზემოთ, მთვლელი კუთხეში, მოქმედებები ქვემოთ და
   იგივე სია მარჯვენა კლიკზე. ⚠️ რიგი გადათრევით — მთელი რიგი
   ერთად ინახება (`reorder`).

   ⚠️ **ჩაკეტილი ალბომი** — ბოქლომიანი დასტა; დაჭერა პაროლს ითხოვს.
   ჩაკეტვა/ისევ ჩაკეტვა/პაროლი `⋯`-სა და მარჯვენა ღილაკის მენიუშია, ღილაკები —
   პიროვნების ბარათის წესით (`CardActions`). „ჩაკეტილი ფოტოებიც" (ცალკეული
   ფოტოს ჩაკეტვის სისტემური ალბომი) აქ ჩვეულებრივი ბოქლომიანი ბარათია.
   ============================================================ */

export function PersonalAlbumCards({
  albums,
  showOwner = true,
  kind,
}: {
  albums: PersonalAlbum[]
  /** ქვეფილტრი „ფოტო" / „ვიდეო": ბარათი მხოლოდ იმ სახეობას ითვლის და ალბომი იმ ჩანართზე იხსნება */
  kind?: 'photo' | 'video'
  /** პიროვნების გვერდზე „ვისია" ზედმეტია */
  showOwner?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [editing, setEditing] = useState<PersonalAlbum | null>(null)
  const [deleting, setDeleting] = useState<PersonalAlbum | null>(null)
  const [unlocking, setUnlocking] = useState<PersonalAlbum | null>(null)
  const lockMenu = usePersonalLockMenu('albums')

  const reorder = useMutation({
    mutationFn: reorderPersonalAlbums,
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** რჩეული ალბომი სიის თავშია (რიგს სერვერი ალაგებს) */
  const favorite = useMutation({
    mutationFn: (id: number) => togglePersonalAlbumFavorite(id),
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const open = (album: PersonalAlbum) => navigate(`/personal/albums/${album.id}${kind ? `?kind=${kind}` : ''}`)
  /** ბარათის შიგთავსი — „12 ფოტო · 3 ვიდეო", ან მხოლოდ არჩეული სახეობა */
  const photosOf = (album: PersonalAlbum) => (kind === 'video' ? 0 : album.photos)
  const videosOf = (album: PersonalAlbum) => (kind === 'photo' ? 0 : album.videos)

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Sortable ids={albums.map((a) => a.id)} layout="grid" onReorder={(ids) => reorder.mutate(ids.map(Number))}>
          {albums.map((album) => {
            const hidden = isHidden(album)
            /* ⋯ და მარჯვენა კლიკი — ერთი სია */
            const menu: MenuAction[] = hidden
              ? [{ key: 'unlock', label: t('lock.unlock'), icon: LockOpen, run: () => setUnlocking(album) }, ...lockMenu.items(album)]
              : [
                  { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => open(album) },
                  favoriteAction(album.is_favorite, () => favorite.mutate(album.id), t),
                  ...lockMenu.items(album),
                  { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(album) },
                  { key: 'delete', label: t('confirm.delete'), icon: MENU_ICONS.delete, danger: true, run: () => setDeleting(album) },
                ]

            return (
              <SortableItem key={album.id} id={album.id} disabled={!!kind}>
                <PhotoStack
                  title={album.name}
                  subtitle={showOwner ? (album.person?.name ?? t('personal.album.outside')) : (album.description ?? undefined)}
                  label={countLabel(t, photosOf(album), videosOf(album))}
                  count={photosOf(album) + videosOf(album)}
                  images={privatePreview(album.cover)}
                  aspect="wide"
                  locked={hidden}
                  badge={
                    album.locked ? (
                      <LockBadge hidden={hidden} />
                    ) : album.visibility === 'public' ? (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="size-3" />
                        {t('personal.album.publicBadge')}
                      </span>
                    ) : undefined
                  }
                  meta={album.is_favorite ? <Star className="size-3.5 fill-current text-favorite" aria-label={t('filter.favorite')} /> : undefined}
                  onClick={() => (hidden ? setUnlocking(album) : open(album))}
                  menu={contextMenuItems(menu)}
                  actions={<CardActions hidden={hidden} menu={menu} onUnlock={() => setUnlocking(album)} onOpen={() => open(album)} onEdit={() => setEditing(album)} onDelete={() => setDeleting(album)} />}
                />
              </SortableItem>
            )
          })}
        </Sortable>
      </ul>

      {editing && <PersonalAlbumDialog album={editing} onClose={() => setEditing(null)} />}
      {deleting && <PersonalDeleteDialog target={{ kind: 'album', album: deleting }} onClose={() => setDeleting(null)} />}
      {unlocking && (
        <PersonalUnlockDialog kind="albums" record={unlocking} onClose={() => setUnlocking(null)} onUnlocked={() => open(unlocking)} />
      )}
      {lockMenu.dialog}
    </>
  )
}
