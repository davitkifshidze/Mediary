import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Lock, LockOpen, SquarePen, Trash2 } from 'lucide-react'
import { isHidden, reorderPersonalAlbums, type PersonalAlbum } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal, privatePreview } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { PhotoStack } from '@/components/ui/photo-stack'
import { contextMenuItems, MENU_ICONS } from '@/components/ui/record-menu'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { PersonalAlbumDialog } from '@/components/personal/PersonalAlbumDialog'
import { PersonalDeleteDialog } from '@/components/personal/PersonalDeleteDialog'
import { LockBadge, PersonalUnlockDialog } from '@/components/personal/PersonalLock'

/* ============================================================
   **ალბომების ბარათები (Tasks §33.5)** — „ალბომები" ჭრილი და ადამიანის
   „ალბომები" ჩანართი ერთსა და იმავეს ხატავს.

   ⚠️ **დასტა (`PhotoStack`) და არა ცალკე ბარათი** — გალერეის ალბომის
   ვიზუალი: მთავარი ფოტო ზემოთ, მთვლელი კუთხეში, მოქმედებები ქვემოთ და
   იგივე სია მარჯვენა კლიკზე (§7). ⚠️ რიგი გადათრევით (§11) — მთელი რიგი
   ერთად ინახება (`reorder`).

   ⚠️ **ჩაკეტილი ალბომი (§33.7)** — ბოქლომიანი დასტა; დაჭერა პაროლს ითხოვს.
   ============================================================ */

export function PersonalAlbumCards({
  albums,
  showOwner = true,
}: {
  albums: PersonalAlbum[]
  /** ადამიანის გვერდზე „ვისია" ზედმეტია */
  showOwner?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [editing, setEditing] = useState<PersonalAlbum | null>(null)
  const [deleting, setDeleting] = useState<PersonalAlbum | null>(null)
  const [unlocking, setUnlocking] = useState<PersonalAlbum | null>(null)

  const reorder = useMutation({
    mutationFn: reorderPersonalAlbums,
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const open = (album: PersonalAlbum) => navigate(`/personal/albums/${album.id}`)

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Sortable ids={albums.map((a) => a.id)} layout="grid" onReorder={(ids) => reorder.mutate(ids.map(Number))}>
          {albums.map((album) => {
            const hidden = isHidden(album)

            return (
              <SortableItem key={album.id} id={album.id}>
                <PhotoStack
                  title={album.name}
                  subtitle={showOwner ? (album.person?.name ?? t('personal.album.outside')) : (album.description ?? undefined)}
                  label={countLabel(t, album.photos, album.videos)}
                  count={album.photos + album.videos}
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
                  onClick={() => (hidden ? setUnlocking(album) : open(album))}
                  menu={contextMenuItems(
                    hidden
                      ? [{ key: 'unlock', label: t('personal.lock.unlock'), icon: LockOpen, run: () => setUnlocking(album) }]
                      : [
                          { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => open(album) },
                          { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(album) },
                          { key: 'delete', label: t('confirm.delete'), icon: MENU_ICONS.delete, danger: true, run: () => setDeleting(album) },
                        ],
                  )}
                  actions={
                    hidden ? (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setUnlocking(album)}>
                        <Lock className="size-3.5" />
                        {t('personal.lock.unlock')}
                      </Button>
                    ) : (
                      <>
                        <Button variant="edit" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing(album)}>
                          <SquarePen className="size-3.5" />
                          {t('actions.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 px-2 text-xs text-destructive"
                          onClick={() => setDeleting(album)}
                        >
                          <Trash2 className="size-3.5" />
                          {t('confirm.delete')}
                        </Button>
                      </>
                    )
                  }
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
    </>
  )
}
