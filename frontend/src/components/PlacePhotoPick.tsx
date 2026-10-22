import { useTranslation } from 'react-i18next'
import { Check, Images, Star } from 'lucide-react'
import { CountBadge } from '@/components/ui/badge'
import { InfoHint } from '@/components/ui/info-hint'
import { cn } from '@/lib/utils'

/* ============================================================
   **წყაროს ფოტოები — რომელი ჩამოვიდეს და რომელი იყოს მთავარი**.

   ბმულიდან ან ძებნიდან მოსული ფოტოები ესკიზებად (`PendingWebMedia`-ს ფილების
   მსგავსად): ფილაზე დაჭერა ✓-ს რთავს და თიშავს (ნაგულისხმევად ყველა
   მონიშნულია), ★ — მთავარი ფოტო. შენახვისას მონიშნულები ადგილის გალერეაში
   ჩამოდის (`gallery_urls`, მთავარი — პირველი).

   ⚠️ ჩამოტვირთვა შენახვისას ხდება და არა აქ: Google-ის `photoUri` ხანმოკლეა,
   ფორმის დახურვისას კი არაფერი უნდა დარჩეს. ★ მხოლოდ მაშინ ჩანს, როცა მთავარი
   ფოტო მართლა წყაროდან მოვა (`starable`) — შენი ატვირთული ან შენახული მთავარს ის არ ცვლის.
   ============================================================ */

export function PlacePhotoPick({
  photos,
  picked,
  main,
  starable,
  hint,
  onToggle,
  onMain,
}: {
  photos: string[]
  picked: string[]
  main: string | null
  starable: boolean
  hint?: string
  onToggle: (url: string) => void
  onMain: (url: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border border-border p-3" data-testid="place-photos">
      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <Images className="size-4 text-muted-foreground" />
        {t('places.photoPickTitle')}
        <CountBadge count={picked.length} />
        {hint && <InfoHint info={hint} />}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {photos.map((url) => {
          const on = picked.includes(url)
          const isMain = on && url === main

          return (
            <li key={url} className="relative size-20">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={t('places.photoPickToggle')}
                data-testid="place-photo"
                onClick={() => onToggle(url)}
                className={cn(
                  'block size-full cursor-pointer overflow-hidden rounded-md border-2 bg-muted transition',
                  on ? 'border-primary' : 'border-border opacity-50 grayscale',
                )}
              >
                <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
              </button>
              {on && (
                <span className="pointer-events-none absolute right-1 top-1 grid size-5 place-items-center rounded bg-primary text-primary-foreground">
                  <Check className="size-3.5" />
                </span>
              )}
              {starable && on && (
                <button
                  type="button"
                  aria-label={t('places.photoPickMain')}
                  aria-pressed={isMain}
                  title={t('places.photoPickMain')}
                  data-testid="place-photo-main"
                  onClick={() => onMain(url)}
                  className="absolute bottom-1 left-1 grid size-6 cursor-pointer place-items-center rounded bg-black/60 text-white"
                >
                  <Star className={cn('size-3.5', isMain && 'fill-current text-[var(--gold)]')} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
