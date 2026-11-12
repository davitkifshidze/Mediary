import type { TFunction } from 'i18next'
import { galleryDownloadUrl, type GalleryAnyImage, type GalleryCastImage } from '@/api/gallery'
import { galleryPhotoInfo, isPortraitCategory } from '@/lib/galleryPhoto'
import type { PhotoItem } from '@/components/ui/photo-grid'

/**
 * **გალერეის ფოტო → ბადის უჯრა** — ერთი წესი ჩანაწერის პანელისთვის, მსახიობის გვერდისთვის
 * და სათაურის დასტის ფანჯრისთვის.
 *
 * ⚠️ **ჩაკეტილი უჯრა ცალკე შტოა და არა „ცარიელი ველებით"** (2026-09-20): ბილიკი, სახელი,
 * ზომა და კატეგორია პასუხში საერთოდ არ მოსულა — `src: ''`-ის გაგზავნა ბადეს გატეხილ
 * `<img>`-ს დაახატვინებდა. `albumId` კი ის ერთადერთია, რაც დაჭერისას სჭირდება: რომელი
 * ალბომის პაროლი ვკითხოთ.
 */
export function galleryPhotoItem(image: GalleryAnyImage | GalleryCastImage, t: TFunction, owner?: string | null): PhotoItem {
  if (image.locked) {
    return { id: image.id, src: '', locked: true, albumId: image.album_id, width: image.width, height: image.height }
  }

  return {
    id: image.id,
    src: image.url,
    title: image.original_name,
    subtitle: owner ?? (image.category ? t(`gallery.category.${image.category}`) : t('gallery.category.other')),
    portrait: isPortraitCategory(image.category),
    /* ⚠️ **პასუხს backend იძლევა**: მშობელს მთავარი სურათის სვეტი ან საერთოდ არ აქვს
       (მსახიობი — `photo_path` გლობალურია), ან სხვა ჰქვია. `category !== 'actor'` მხოლოდ პირველ
       შემთხვევას ხურავდა და სიმღერაზე/წიგნზე/თამაშზე ღილაკს ხატავდა, სადაც დაჭერა 500-ს
       აბრუნებდა. `?? …` — ძველი პასუხისთვის. */
    canPrimary: image.supports_primary ?? image.category !== 'actor',
    size: image.size,
    width: image.width,
    height: image.height,
    // „რა ვიცით ამ ფოტოზე": ერთი ფუნქცია ყველგან
    info: galleryPhotoInfo(image, t, { owner }),
    downloadUrl: galleryDownloadUrl(image.id),
  }
}
