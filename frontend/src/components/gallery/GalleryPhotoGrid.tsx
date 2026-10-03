import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  deleteGalleryImage,
  type GalleryLockedImage,
  type GalleryOwnedImage,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { galleryPhotoInfo, isPortraitCategory } from '@/lib/galleryPhoto'
import { PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { AlbumUnlockById } from '@/components/gallery/AlbumUnlockById'
import { GalleryMoveDialog } from '@/components/gallery/GalleryMoveDialog'

/* ============================================================
   გალერეის ბადე — **ერთი ფენა ყველა ჭრილისთვის** (§8.5).

   ⚠️ ბადე თვითონ `ui/photo-grid.tsx`-ია (lightbox, მონიშვნები, გვერდები);
   აქ მხოლოდ **გალერეის საქმე** რჩება: მშობლის სახელი, „რა ვიცით ამ ფოტოზე"
   და წაშლა კვოტის განახლებით. ხუთი ჭრილი ამ ლოგიკას ხუთჯერ დაწერდა.

   ⚠️ **წაშლა მყისიერია** (ბიბლიოთეკაა და არა ფორმა), მაგრამ დადასტურება
   ერთხელ იკითხება მთელ მონიშნულზე — თითოზე დიალოგი ათჯერ ამოხტებოდა.

   ⚠️ **გადატანის დიალოგი აქ ცხოვრობს და არა ჭრილებში** (§26.3): ბადე
   შვიდივე ჭრილშია, ე.ი. აქ ერთხელ დაწერილი მოქმედება ყველგან ჩნდება —
   და მდგომარეობაც და პორტალის JSX-იც **ერთ კომპონენტშია**, ის წესი,
   რომელიც `GroupsCut`-ის ცოცხალმა ხარვეზმა დაგვაწერინა (ღილაკი ერთ
   შტოში იყო, დიალოგი მეორეში, და დაჭერაზე არაფერი ხდებოდა).
   ============================================================ */

export function GalleryPhotoGrid({
  images,
  lightboxImages,
  loading,
  showOwner,
  emptyText,
  pageSize,
  onPageSizeChange,
  total,
  extraTools,
}: {
  /**
   * ⚠️ **სიაში ჩაკეტილი ალბომის ფოტოც ურევია** (2026-09-20, შენი მითითება:
   * „ყველა ფოტოში ჩანდეს დაბლარულად"). ასეთ რიგს ბილიკი არ მოსდევს —
   * ბადე მის ადგილას ბლარს ხატავს და დაჭერაზე პაროლს ითხოვს.
   */
  images: (GalleryOwnedImage | GalleryLockedImage)[]
  /** გახსნილი ხედის სრული სია (§3.7) — ბადეზე მეტიც შეიძლება იყოს */
  lightboxImages?: (GalleryOwnedImage | GalleryLockedImage)[]
  loading?: boolean
  showOwner?: boolean
  emptyText?: string
  /** გვერდებს **სერვერი** ჭრის, ე.ი. ბადე მართულ რეჟიმშია */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  total?: number
  extraTools?: React.ReactNode
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  /** §26.3 — რომელი ფოტოები გადაგვაქვს (ცარიელი = დიალოგი დახურულია) */
  const [moving, setMoving] = useState<number[] | null>(null)
  /** რომელი ალბომის პაროლს ვკითხულობთ (ჩაკეტილ ფილაზე დაჭერა, 2026-09-20) */
  const [unlocking, setUnlocking] = useState<number | null>(null)

  const remove = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => deleteGalleryImage(id))),
    onSuccess: () => {
      // ⚠️ კვოტაც და შეჯამებაც უნდა განახლდეს — ფოტო ორივეში ითვლება
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'storage', 'me'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.deleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const ownerOf = (image: GalleryOwnedImage) =>
    (image.owner?.title_ka || image.owner?.title) ?? null

  /* ⚠️ **ჩაკეტილი ცალკე შტოა და არა „ცარიელი ველებით" ჩვეულებრივი უჯრა**
     (2026-09-20): `url`, სახელი, ზომა და მშობელი პასუხში საერთოდ არ
     მოსულა — `src: ''` ბადეს გატეხილ `<img>`-ს დაახატვინებდა. `albumId`
     ერთადერთი დამატებაა და ის დაჭერისთვისაა: რომელი ალბომის პაროლი. */
  const toItem = (image: GalleryOwnedImage | GalleryLockedImage): PhotoItem =>
    image.locked
      ? {
          id: image.id,
          src: '',
          locked: true,
          albumId: image.album_id,
          width: image.width,
          height: image.height,
        }
      : unlockedItem(image)

  const unlockedItem = (image: GalleryOwnedImage): PhotoItem => ({
    id: image.id,
    src: image.url,
    /* ⚠️ **პირადი დისკი თითო ფოტოზეა** — გალერეის ბადე შერეულია
       (გახსნილი ალბომის ფაილები `gallery/locked`-შია), ე.ი. ბადის ერთი
       დროშა ერთ ნახევარს ყოველთვის ატყუებდა. */
    private: image.private,
    title: image.original_name,
    subtitle: showOwner
      ? (ownerOf(image) ?? undefined)
      : image.category
        ? t(`gallery.category.${image.category}`)
        : undefined,
    portrait: isPortraitCategory(image.category),
    size: image.size,
    width: image.width,
    height: image.height,
    // §4.3 — ზომა, სახელი, ვისია, წყარო, ორიგინალის ბმული, თარიღი
    info: galleryPhotoInfo(image, t, { owner: ownerOf(image) }),
  })

  if (loading) return <GallerySkeletonGrid />

  return (
    <>
    <PhotoGrid
      emptyText={emptyText ?? t('gallery.noPhotosYet')}
      emptyHint={t('gallery.emptyHint')}
      items={images.map(toItem)}
      lightboxItems={lightboxImages?.map(toItem)}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      total={total}
      extraTools={extraTools}
      onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
      onMove={(ids) => setMoving(ids)}
      onDelete={async (ids) => {
        const ok = await confirm({
          title: t('gallery.deleteTitle'),
          description: t('gallery.deleteHint'),
          confirmText: t('confirm.delete'),
          variant: 'destructive',
        })
        if (ok) remove.mutate(ids)
      }}
    />

    {moving && <GalleryMoveDialog ids={moving} onClose={() => setMoving(null)} />}

    {/* ⚠️ მდგომარეობაც და პორტალის JSX-იც ერთ კომპონენტშია — `GroupsCut`-ის
        ცოცხალი ხარვეზის წესი. */}
    {unlocking != null && (
      <AlbumUnlockById albumId={unlocking} onClose={() => setUnlocking(null)} />
    )}
    </>
  )
}

/**
 * ჩატვირთვის ჩონჩხი (§8.6).
 *
 * ⚠️ **„იტვირთება…" ტექსტი მოიხსნა**: ბადე ცარიელიდან სავსეში ხტებოდა და
 * გვერდი ყოველ გადასვლაზე „ხტუნავდა". ჩონჩხი იმავე ბადის ფორმას იკავებს.
 */
export function GallerySkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="aspect-video animate-pulse rounded-xl border border-border bg-muted/60"
        />
      ))}
    </ul>
  )
}

/**
 * ჯგუფების ჩონჩხი — დასტის პროპორციით. ⚠️ Tasks §6.7 — პროპორცია **ჯგუფის
 * ტიპს მიჰყვება**: მსახიობი `3/4`-ია, ჩანაწერი და ალბომი კი `16/10` — ყოველთვის
 * `3/4` რომ იყოს, ჩატვირთვისას განლაგება ხტებოდა.
 */
export function GalleryStackSkeleton({ count = 8, aspect = 'portrait' }: { count?: number; aspect?: 'portrait' | 'wide' }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        /* §25.6 — ჩონჩხი ბარათის ფორმას მიჰყვება: დასტა, სათაური, ჩიპები, ქვედა ზოლი */
        <li key={i} className="flex flex-col rounded-2xl border border-border bg-card p-4">
          <div className={cn('animate-pulse rounded-xl bg-muted/60', aspect === 'wide' ? 'aspect-[16/10]' : 'aspect-[3/4]')} />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="mt-2 flex gap-1">
            <div className="h-4 w-12 animate-pulse rounded bg-muted/50" />
            <div className="h-4 w-10 animate-pulse rounded bg-muted/50" />
          </div>
          <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-muted/50" />
          <div className="mt-3 h-9 animate-pulse rounded-md border border-border bg-muted/30" />
        </li>
      ))}
    </ul>
  )
}
