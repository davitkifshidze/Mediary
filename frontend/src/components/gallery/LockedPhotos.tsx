import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import type { GalleryLockedImage } from '@/api/gallery'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { PHOTO_COLUMNS, PHOTO_PER_PAGE_MAX } from '@/lib/pageSize'
import { Button } from '@/components/ui/button'
import { PageSizePick } from '@/components/ui/page-size-pick'

/* ============================================================
   **ჩაკეტილი ალბომის ბადე.**

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
   საერთოდ არ მოსულა (და თვითონაც პირად დისკზე გადავიდა), ე.ი.
   ინსპექტორში კლასის მოხსნას გასაშიშვლებელი არაფერი აქვს.

   ⚠️ **სვეტები და „გვერდზე რამდენი" ჩვეულებრივი ბადისაა** (`PhotoGrid` — 4
   სვეტი, იგივე ამრჩევი): აქამდე აქ `xl`-ზე 5 სვეტი იყო და გახსნის შემდეგ
   ბადე სხვა ფორმას იღებდა; ზომის არჩევა კი საერთოდ არ იყო.
   ============================================================ */

export function LockedPhotos({
  photos,
  total,
  onUnlock,
  pageSize,
  onPageSizeChange,
}: {
  photos: GalleryLockedImage[]
  total: number
  onUnlock?: () => void
  pageSize: number
  onPageSizeChange: (size: number) => void
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
        <PageSizePick
          size="sm"
          columns={PHOTO_COLUMNS}
          max={PHOTO_PER_PAGE_MAX}
          value={pageSize}
          total={total}
          onChange={onPageSizeChange}
        />
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          /* ფიქსირებული ჩარჩო (`aspect-video`), როგორც ჩვეულებრივ უჯრას: განბლოკვის შემდეგ ზომა არ იცვლება */
          <li key={photo.id} className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
            <img src={LOCKED_PHOTO_PLACEHOLDER} alt="" aria-hidden className="size-full object-cover" />
          </li>
        ))}
      </ul>
    </div>
  )
}
