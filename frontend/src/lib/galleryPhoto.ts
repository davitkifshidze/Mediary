import type { TFunction } from 'i18next'
import type { GalleryImage } from '@/api/gallery'
import type { PhotoInfoRow } from '@/components/ui/photo-grid'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   „რა ვიცით ამ ფოტოზე" (Tasks §4.3).

   ⚠️ **ერთი ფუნქცია სამივე ადგილისთვის** — ჩანაწერის გვერდი, მსახიობის
   გვერდი და გალერეის ბადე. სამი ასლი სამ სხვადასხვა ნაკრებს აჩვენებდა
   (და ერთს ორიგინალის ბმული აკლდებოდა).

   ⚠️ **ცარიელი ველი არ იწერება** — „წყარო: —" არაფერს ეუბნება მკითხველს.
   ============================================================ */

export function galleryPhotoInfo(
  image: GalleryImage,
  t: TFunction,
  extra: { owner?: string | null } = {},
): PhotoInfoRow[] {
  const rows: PhotoInfoRow[] = []

  const push = (label: string, value?: string | null, href?: string | null) => {
    if (value) rows.push({ label, value, href: href ?? undefined })
  }

  push(t('photos.infoName'), image.original_name)
  push(t('photos.infoFrom'), extra.owner)
  push(t('photos.infoSize'), image.size ? formatBytes(image.size) : null)
  push(
    t('photos.infoDimensions'),
    image.width && image.height ? `${image.width} × ${image.height}` : null,
  )
  push(t('photos.infoSource'), image.source ? t(`photos.source.${image.source}`, image.source) : null)
  // ⚠️ ორიგინალი ხშირად hotlink-ს კრძალავს და ესკიზი ჩამოიწერა — ეს ცალკე ფაქტია
  if (image.is_thumbnail) push(t('photos.infoThumbnail'), t('photos.infoThumbnailYes'))
  push(t('photos.infoOriginal'), image.source_url ? t('photos.infoOpen') : null, image.source_url)
  push(t('photos.infoDate'), image.created_at ? image.created_at.slice(0, 10) : null)

  return rows
}
