import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Images } from 'lucide-react'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { cn } from '@/lib/utils'

/* ============================================================
   „ყველა ფოტო" — **არეული ხედი** (§8.5).

   ⚠️ ეს ზუსტად ის გადამრთველია, რასაც მოთხოვნა ითხოვს: „შეგეძლოს ყველა
   იყოს არეულად ან დაჯგუფებულად". დაჯგუფებული ხედი ცალკე ჭრილებია
   (ჩანაწერები · მსახიობები), აქ კი ბადე ბრტყელია და რიგიც არჩევადი
   („ახალი · ძველი · არეული").

   ⚠️ **კატეგორიის ჩიპები ფილტრია და არა ჭრილი** — ისინი ფილტრში ჯდება
   და გვერდსაც პირველზე აბრუნებს, თორემ „მე-3 გვერდი" ცარიელი დარჩებოდა.
   ============================================================ */

const CATEGORIES = ['backdrop', 'poster', 'logo', 'actor'] as const

export function AllPhotosCut() {
  const { t } = useTranslation()
  const [category, setCategory] = useState<string>('all')

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Images className="size-4 text-muted-foreground" />
        {(['all', ...CATEGORIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            className={cn(
              'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
              category === key
                ? 'border-primary bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {key === 'all' ? t('filter.all') : t(`gallery.category.${key}`)}
          </button>
        ))}
      </div>

      <GroupPhotos
        title={t('gallery.allPhotos')}
        filters={{ category: category === 'all' ? undefined : category }}
        cacheKey={`all:${category}`}
        showOwner
      />
    </div>
  )
}
