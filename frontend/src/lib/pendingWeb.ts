import { importWebImages, type SerpImage, type SerpImportTarget, type SerpVideo } from '@/api/web'
import { saveSerpVideo, type GalleryParentKind } from '@/api/gallery'

/* ============================================================
   **ვებიდან არჩეული — ჩანაწერის შექმნამდე**.

   შენი სიტყვები: „ბუკმარკის დამატებისას ასევე ფოტოს ატვირთვასთან ერთად ძებნად
   მინდა, და ვიდეოსიც — როგორც ბუკმარკის ნახვაშია". ახალ ჩანაწერს id ჯერ არ
   აქვს, ამიტომ ძებნის ფანჯრები (`onPick`) მონიშნულს ფორმას უბრუნებენ, ის კი
   შექმნისთანავე **ფანჯრის ზუსტად იმავე ორ გზას** იყენებს: ფოტოები —
   `importWebImages`, ვიდეოები — `saveSerpVideo`.

   ⚠️ ჩავარდნა ჩანაწერს არ აუქმებს (როგორც ფაილებზე): რაც ვერ წავიდა,
   სიაში რჩება და „შენახვა" მას ხელახლა ცდის.
   ============================================================ */

export interface PendingWeb {
  images: SerpImage[]
  videos: SerpVideo[]
}

export const NO_PENDING_WEB: PendingWeb = { images: [], videos: [] }

/** რას ცდის შენახვა — და რა დარჩა (ჩავარდნილი) */
export async function sendPendingWeb(
  target: SerpImportTarget & GalleryParentKind,
  id: number,
  pending: PendingWeb,
): Promise<{ left: PendingWeb; added: number }> {
  const left: PendingWeb = { images: [], videos: [] }
  let added = 0

  if (pending.images.length) {
    try {
      added += (await importWebImages({ target, id, images: pending.images })).added
    } catch {
      // ⚠️ მთელი პარტია ვერ წავიდა (ქსელი, კვოტა) — ხელახლა ცდისთვის რჩება
      left.images = pending.images
    }
  }

  for (const video of pending.videos) {
    try {
      await saveSerpVideo(target, id, video)
      added++
    } catch {
      left.videos.push(video)
    }
  }

  return { left, added }
}
