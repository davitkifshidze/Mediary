import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteGalleryImage, fetchGalleryPhotos, type GalleryPhotoFilters } from '@/api/gallery'
import { errorMessage } from './errors'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ჯგუფის ყველა ფოტოს წაშლა — ერთი განსაზღვრება (2026-09-16).**

   ⚠️ **ერთიანი endpoint არ არსებობს** — `DELETE /gallery/images/{id}` თითოზეა,
   ე.ი. სია გვერდ-გვერდ იკითხება და თითოეული იშლება. ყოველ წრეზე **პირველივე
   გვერდი** მოგვაქვს ხელახლა, რადგან წინა წრემ ის უკვე წაშალა.

   ⚠️ **აქამდე ეს `GroupsCut`-ის შიგნით იჯდა.** ალბომების ჭრილს იგივე
   მოქმედება დასჭირდა („ჯგუფის ყველა ფოტო წავშალო"), და მეორე ასლი
   ზუსტად ის იქნებოდა, რასაც ეს პროექტი თავს არიდებს: ერთ დღეს ერთგან
   ქეშის გაუქმება დაემატებოდა, მეორეგან — არა.

   ⚠️ **გაუქმებული ქეშების სია ნაწილია განსაზღვრების**: ფოტოს წაშლა
   მოცულობასაც ათავისუფლებს, ე.ი. `storage`-იც და `me`-ც ძველდება —
   თორემ კვოტის ზოლი ძველ რიცხვს აჩვენებდა.
   ============================================================ */

/** ერთ წრეზე რამდენი ფოტო წაიშალოს — ჯგუფი 1000-ზე დიდიც შეიძლება იყოს */
export const DELETE_CHUNK = 200

/** ⚠️ უსასრულო ციკლის დამცავი: თუ წაშლა ჩუმად ვერ ხერხდება, ვჩერდებით */
export const DELETE_MAX_ROUNDS = 50

/**
 * წაშლის მუტაცია, რომელსაც ფილტრი გადაეცემა — ე.ი. „რომელი ჯგუფი" იმავე
 * ენაზე იწერება, რითიც ჯგუფის შიგნით შესვლა (`owner=…` / `from=…`).
 */
export function useDeleteGroupPhotos() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (filters: GalleryPhotoFilters) => {
      let removed = 0

      for (let round = 0; round < DELETE_MAX_ROUNDS; round++) {
        const page = await fetchGalleryPhotos({ ...filters, per_page: DELETE_CHUNK })
        if (!page.data.length) break

        for (const image of page.data) {
          await deleteGalleryImage(image.id)
          removed++
        }
      }

      return removed
    },
    onSuccess: (removed) => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'storage', 'me'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.groupDeleted', { count: removed }), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
}
