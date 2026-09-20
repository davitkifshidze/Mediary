import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchGalleryAlbums } from '@/api/gallery'
import { AlbumUnlockDialog } from '@/components/gallery/AlbumUnlockDialog'

/* ============================================================
   **პაროლის ფანჯარა მხოლოდ ალბომის id-ით (2026-09-20).**

   შენი მითითება: „ყველა ფოტოში ჩანდეს დაბლარულად და თუ პაროლს არ
   შეიყვან, არ გამოჩნდება" — ე.ი. ჩაკეტილ ფილას ახლა ბრტყელ სიაშიც
   ხვდები, სადაც ალბომი მხოლოდ `album_id`-ით არის ცნობილი.

   ⚠️ **სახელი ცალკე იკითხება და არა ფოტოს რიგში მოდის.** ჩაკეტილი რიგი
   განზრახ შიშველია (`id`, ზომები, `album_id`) — ყოველ ფოტოზე ალბომის
   სახელის მიწერა იმავე ფაქტს ასჯერ გაიმეორებდა.

   ⚠️ **მოთხოვნა მხოლოდ დაჭერის შემდეგ მიდის**: კომპონენტი სწორედ მაშინ
   მაუნთდება, ე.ი. ბადის გახსნა ალბომების სიას არ ჩამოტვირთავს.

   ⚠️ **სახელის მოლოდინში ფანჯარა მაინც იხსნება** — სათაური „ჩაკეტილი
   ალბომია", პაროლის ველი კი მუშა. სანამ სიას დაველოდებოდით, დაჭერა
   „არაფერი მოხდა"-დ წაიკითხებოდა.
   ============================================================ */

export function AlbumUnlockById({
  albumId,
  onClose,
  onUnlocked,
}: {
  albumId: number
  onClose: () => void
  onUnlocked?: () => void
}) {
  const { t } = useTranslation()
  const albums = useQuery({ queryKey: ['gallery-albums'], queryFn: fetchGalleryAlbums })
  const name = albums.data?.find((a) => a.id === albumId)?.name

  return (
    <AlbumUnlockDialog
      album={{ id: albumId, name: name ?? t('gallery.albumLocked') }}
      onClose={onClose}
      onUnlocked={onUnlocked}
    />
  )
}
