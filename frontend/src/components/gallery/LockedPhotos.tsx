import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import type { GalleryLockedImage } from '@/api/gallery'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { Button } from '@/components/ui/button'

/* ============================================================
   **ჩაკეტილი ალბომის ბადე (Tasks §7.10/§7.11/§7.15).**

   შენი სიტყვები: „ჩაკეტილ ფოტოებს ბლარიანი ფოტო დაუდგეს — აჯობებს ერთი
   სტატიკური ბლარის ფოტო; თუ პაროლს შეიყვანს, მერე გამოჩნდეს რეალური".

   ⚠️ **ერთი სტატიკური აქტივი და არა თითო ფოტოზე გენერირებული.** შენ
   ორივე ვარიანტი დაასახელე; სტატიკური სამი მიზეზით სჯობს: გენერირებული
   ბლარი **რეალური ფოტოდან** მიიღება (ფერი და კომპოზიცია მაინც
   გამოსჭვივის), თითო ფოტოზე ფაილი დისკსა და კვოტას ხარჯავს, და
   გამოსახულების დასამუშავებელი ბიბლიოთეკა პროექტში საერთოდ არ არის.
   ერთი `public/`-ში მდგომი ფაილი **არაფერს ჟონავს და არაფერი ჯდება**.

   ⚠️ **პროპორცია `width`/`height`-იდან მოდის** — ეს ერთადერთი ორი რიცხვია,
   რასაც სერვერი ჩაკეტილზე აგზავნის (`path` არასდროს). უამისოდ ბადე
   პაროლის შეყვანისას ახტებოდა, რადგან ნამდვილი ფოტოები სხვა
   პროპორციისაა — ზომა კი ფოტოს შინაარსზე არაფერს ამბობს.

   ⚠️ **ეს არ არის „დაბუნდოვნებული ნამდვილი ფოტო".** ფაილი პასუხში
   საერთოდ არ მოსულა (და თვითონაც პირად დისკზე გადავიდა, §7.9), ე.ი.
   ინსპექტორში კლასის მოხსნას გასაშიშვლებელი არაფერი აქვს.
   ============================================================ */

export function LockedPhotos({
  photos,
  total,
  onUnlock,
}: {
  photos: GalleryLockedImage[]
  total: number
  onUnlock?: () => void
}) {
  const { t } = useTranslation()

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <Lock className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-sm">{t('gallery.lockedGridHint', { count: total })}</span>
        {onUnlock && (
          <Button size="sm" onClick={onUnlock}>
            {t('gallery.albumUnlock')}
          </Button>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {photos.map((photo) => (
          <li
            key={photo.id}
            className="overflow-hidden rounded-md border border-border bg-muted"
            style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 2' }}
          >
            <img src={LOCKED_PHOTO_PLACEHOLDER} alt="" aria-hidden className="size-full object-cover" />
          </li>
        ))}
      </ul>
    </div>
  )
}
