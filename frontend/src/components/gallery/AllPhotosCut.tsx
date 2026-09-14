import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchGallerySummary } from '@/api/gallery'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { Chip, ChipRow } from '@/components/ui/chip'

/* ============================================================
   „ყველა ფოტო" — **არეული ხედი** (§8.5).

   ⚠️ ეს ზუსტად ის გადამრთველია, რასაც მოთხოვნა ითხოვს: „შეგეძლოს ყველა
   იყოს არეულად ან დაჯგუფებულად". დაჯგუფებული ხედი ცალკე ჭრილებია
   (ჩანაწერები · მსახიობები), აქ კი ბადე ბრტყელია და რიგიც არჩევადი
   („ახალი · ძველი · არეული").

   ⚠️ **კატეგორიის ჩიპები ფილტრია და არა ჭრილი** — ისინი ფილტრში ჯდება
   და გვერდსაც პირველზე აბრუნებს, თორემ „მე-3 გვერდი" ცარიელი დარჩებოდა.

   ⚠️ **სია ბაზიდან მოდის და არა კოდიდან** (2026-09-12). აქამდე ოთხივე
   კატეგორია კონსტანტა იყო, ამიტომ „ლოგო" იმ ბიბლიოთეკაშიც ჩანდა, სადაც
   არცერთი ლოგო არ არის — ჩიპზე დაჭერა ცარიელ ბადეს აბრუნებდა და კითხვას
   ტოვებდა „რატომ არაფერია". ახლა `GET /api/gallery` აბრუნებს
   `categories`-ს, ჩიპი რიცხვიანია და ნულიანი საერთოდ არ იხატება.

   ⚠️ **შეჯამება იმავე ქეშის გასაღებზეა** (`gallery-summary`), რომელსაც
   გვერდის მთვლელები კითხულობს — მეორე რექვესთი არ ჩნდება.
   ============================================================ */

/** რიგი მნიშვნელობით და არა ანბანით — „კადრი · პოსტერი · ლოგო · მსახიობი" */
const CATEGORY_ORDER = ['backdrop', 'poster', 'logo', 'actor'] as const

export function AllPhotosCut() {
  const { t } = useTranslation()
  const [category, setCategory] = useState<string>('all')

  const summaryQ = useQuery({ queryKey: ['gallery-summary'], queryFn: fetchGallerySummary })

  const counts = summaryQ.data?.categories ?? {}

  /* ⚠️ არჩეული კატეგორია რიგში რჩება მაშინაც, თუ ბოლო ფოტო წაიშალა —
     თორემ ჩიპი ფეხქვეშ გაქრებოდა და ბადე ცარიელი დარჩებოდა ახსნის გარეშე. */
  const shown = useMemo(
    () => CATEGORY_ORDER.filter((key) => (counts[key] ?? 0) > 0 || key === category),
    [counts, category],
  )

  return (
    <div>
      <ChipRow className="mb-4">
        <Chip active={category === 'all'} onClick={() => setCategory('all')} count={summaryQ.data?.photos}>
          {t('filter.all')}
        </Chip>
        {shown.map((key) => (
          <Chip
            key={key}
            active={category === key}
            onClick={() => setCategory(key)}
            count={counts[key] ?? 0}
          >
            {t(`gallery.category.${key}`)}
          </Chip>
        ))}
      </ChipRow>

      <GroupPhotos
        title={t('gallery.allPhotos')}
        filters={{ category: category === 'all' ? undefined : category }}
        cacheKey={`all:${category}`}
        showOwner
      />
    </div>
  )
}
