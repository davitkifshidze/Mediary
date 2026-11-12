import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { GalleryAnyImage, GalleryImage } from '@/api/gallery'
import { groupActorPhotos, type ActorPhotoGroup } from '@/lib/actorPhotos'
import { galleryPhotoItem } from '@/components/gallery/photoItem'
import { AlbumUnlockById } from '@/components/gallery/AlbumUnlockById'
import { GalleryMoveDialog } from '@/components/gallery/GalleryMoveDialog'
import { Button } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { PhotoStack } from '@/components/ui/photo-stack'
import type { PhotoView } from '@/components/ui/photo-view'

/* ============================================================
   **მსახიობის ფოტოები სათაურის მიხედვით დაჯგუფებული.**

   დასტა თითო ფილმზე / სერიალზე, საიდანაც კადრია (`origin` — ფოტოზე ინახება ჩამოტვირთვისას),
   ცალკე „პორტრეტები" და „სხვა" (ძველი ფოტოები, რომლებზეც სათაური არ წერია, ხელით ატვირთული,
   ვებიდან მოტანილი). დასტაზე დაჭერა **დიდ ფანჯარას** ხსნის: ფოტოები გვერდებად, „გვერდზე
   რამდენი" (4-ის ჯერადები), ფოტოზე დაჭერით სლაიდერი — ეს ყველაფერი საერთო `PhotoGrid`-ია.

   ⚠️ ესკიზში ჩაკეტილი ფოტო არ ხვდება (ბილიკი პასუხში არ მოსულა), რიცხვი კი სრულია —
   `CastPhotoStacks`-ის წესი.
   ============================================================ */

export function ActorPhotoGroups({
  images,
  view,
  onDelete,
  onView,
}: {
  images: GalleryAnyImage[]
  view: PhotoView
  onDelete?: (images: GalleryImage[]) => void
  /** ფოტო გაიხსნა — გახსნების მთვლელი */
  onView?: (id: number) => void
}) {
  const { t } = useTranslation()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState<number | null>(null)
  const [moving, setMoving] = useState<number[] | null>(null)

  const groups = useMemo(() => groupActorPhotos(images), [images])
  // ფოტოების შეცვლისას (წაშლა, გადატანა) ღია ჯგუფი ახალი სიიდან იკითხება; გამქრალი — იხურება
  const open = groups.find((group) => group.key === openKey) ?? null

  const nameOf = (group: ActorPhotoGroup<GalleryAnyImage>) =>
    group.kind === 'title' ? (group.title ?? t('actorPhotos.untitled')) : t(`actorPhotos.group.${group.kind}`)

  const pick = (ids: number[], pool: GalleryAnyImage[]) =>
    ids.map((id) => pool.find((image) => image.id === id)).filter((image): image is GalleryImage => !!image && !image.locked)

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="actor-photo-groups">
        {groups.map((group) => (
          <li key={group.key} data-group={group.key}>
            <PhotoStack
              title={nameOf(group)}
              subtitle={group.kind === 'title' ? t(group.type === 'tv' ? 'actorPhotos.fromSeries' : 'actorPhotos.fromMovie') : undefined}
              label={t('gallery.photos', { count: group.photos.length })}
              count={group.photos.length}
              images={group.photos.flatMap((image) => (image.locked ? [] : [image.url]))}
              // კადრი ფართოა, პორტრეტი — ვერტიკალური
              aspect={group.kind === 'portraits' ? 'portrait' : 'wide'}
              onClick={() => setOpenKey(group.key)}
            />
          </li>
        ))}
      </ul>

      {open && (
        <ModalShell size="full" title={nameOf(open)} onClose={() => setOpenKey(null)}>
          <div data-testid="actor-photo-group-dialog">
            <PhotoGrid
              items={open.photos.map((image) => galleryPhotoItem(image, t))}
              view={view}
              onView={onView && ((item) => onView(item.id))}
              onDelete={onDelete && ((ids) => onDelete(pick(ids, open.photos)))}
              onMove={(ids) => {
                const movable = pick(ids, open.photos).map((image) => image.id)
                if (movable.length) setMoving(movable)
              }}
              onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
            />
          </div>

          <ModalFooter>
            <Button type="button" onClick={() => setOpenKey(null)}>
              <X className="size-4" />
              {t('actions.close')}
            </Button>
          </ModalFooter>
        </ModalShell>
      )}

      {unlocking != null && <AlbumUnlockById albumId={unlocking} onClose={() => setUnlocking(null)} />}
      {moving && <GalleryMoveDialog ids={moving} initialTarget="keep" onClose={() => setMoving(null)} />}
    </>
  )
}
