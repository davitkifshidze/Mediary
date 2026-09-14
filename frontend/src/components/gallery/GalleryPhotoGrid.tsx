import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteGalleryImage, type GalleryOwnedImage } from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { galleryPhotoInfo } from '@/lib/galleryPhoto'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   გალერეის ბადე — **ერთი ფენა ყველა ჭრილისთვის** (§8.5).

   ⚠️ ბადე თვითონ `ui/photo-grid.tsx`-ია (lightbox, მონიშვნები, გვერდები);
   აქ მხოლოდ **გალერეის საქმე** რჩება: მშობლის სახელი, „რა ვიცით ამ ფოტოზე"
   და წაშლა კვოტის განახლებით. ხუთი ჭრილი ამ ლოგიკას ხუთჯერ დაწერდა.

   ⚠️ **წაშლა მყისიერია** (ბიბლიოთეკაა და არა ფორმა), მაგრამ დადასტურება
   ერთხელ იკითხება მთელ მონიშნულზე — თითოზე დიალოგი ათჯერ ამოხტებოდა.
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
  images: GalleryOwnedImage[]
  /** გახსნილი ხედის სრული სია (§3.7) — ბადეზე მეტიც შეიძლება იყოს */
  lightboxImages?: GalleryOwnedImage[]
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

  const toItem = (image: GalleryOwnedImage) => ({
    id: image.id,
    src: image.url,
    title: image.original_name,
    subtitle: showOwner
      ? (ownerOf(image) ?? undefined)
      : image.category
        ? t(`gallery.category.${image.category}`)
        : undefined,
    portrait: image.category === 'actor' || image.category === 'poster',
    size: image.size,
    width: image.width,
    height: image.height,
    // §4.3 — ზომა, სახელი, ვისია, წყარო, ორიგინალის ბმული, თარიღი
    info: galleryPhotoInfo(image, t, { owner: ownerOf(image) }),
  })

  if (loading) return <GallerySkeletonGrid />

  return (
    <PhotoGrid
      emptyText={emptyText ?? t('gallery.noPhotosYet')}
      emptyHint={t('gallery.emptyHint')}
      items={images.map(toItem)}
      lightboxItems={lightboxImages?.map(toItem)}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      total={total}
      extraTools={extraTools}
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

/** ჯგუფების ჩონჩხი — დასტის პროპორციით */
export function GalleryStackSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-border bg-card p-4">
          <div className="aspect-[3/4] animate-pulse rounded-xl bg-muted/60" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-muted/50" />
        </li>
      ))}
    </ul>
  )
}
