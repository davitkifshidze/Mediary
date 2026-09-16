import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchGallerySummary } from '@/api/gallery'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { CutTabs } from '@/components/ui/cut-tabs'

/* ============================================================
   „ყველა ფოტო" — **არეული ხედი** (§8.5).

   ⚠️ ეს ზუსტად ის გადამრთველია, რასაც მოთხოვნა ითხოვს: „შეგეძლოს ყველა
   იყოს არეულად ან დაჯგუფებულად". დაჯგუფებული ხედი ცალკე ჭრილებია
   (ჩანაწერები · მსახიობები), აქ კი ბადე ბრტყელია და რიგიც არჩევადი
   („ახალი · ძველი · არეული").

   ⚠️ **კატეგორიის არჩევანი ფილტრია და არა ჭრილი** — ის ფილტრში ჯდება
   და გვერდსაც პირველზე აბრუნებს, თორემ „მე-3 გვერდი" ცარიელი დარჩებოდა.

   ⚠️ **სია ბაზიდან მოდის და არა კოდიდან** (2026-09-12). აქამდე ოთხივე
   კატეგორია კონსტანტა იყო, ამიტომ „ლოგო" იმ ბიბლიოთეკაშიც ჩანდა, სადაც
   არცერთი ლოგო არ არის — ჩიპზე დაჭერა ცარიელ ბადეს აბრუნებდა და კითხვას
   ტოვებდა „რატომ არაფერია". ახლა `GET /api/gallery` აბრუნებს
   `categories`-ს, ბარათი რიცხვიანია და ნულიანი საერთოდ არ იხატება.

   ⚠️ **ჩიპების ნაცვლად ბარათებია** (§24.1, 2026-09-15) — იგივე ვიზუალი,
   რაც აუდიტ-ლოგს აქვს. ეს იყო შენი შენიშვნა: „ყველა კადრი, პოსტერები —
   ისევე სტილის, როგორც ლოგებში მაქვს".

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
     თორემ ბარათი ფეხქვეშ გაქრებოდა და ბადე ცარიელი დარჩებოდა ახსნის გარეშე. */
  const options = useMemo(
    () => [
      { key: 'all', label: t('filter.all'), count: summaryQ.data?.photos },
      ...CATEGORY_ORDER.filter((key) => (counts[key] ?? 0) > 0 || key === category).map((key) => ({
        key,
        label: t(`gallery.category.${key}`),
        count: counts[key] ?? 0,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, category, summaryQ.data, t],
  )

  return (
    <div>
      <div className="mb-4">
        <CutTabs
          label={t('gallery.categoryScope')}
          options={options}
          value={category}
          onChange={setCategory}
        />
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
