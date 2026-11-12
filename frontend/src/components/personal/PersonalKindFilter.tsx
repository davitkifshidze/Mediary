import { useTranslation } from 'react-i18next'
import { Image, LayoutGrid, Star, Video } from 'lucide-react'
import { CutTabs } from '@/components/ui/cut-tabs'

/* ============================================================
   **ქვეფილტრი „ყველა · ფოტო · ვიდეო · რჩეული"** — პირადი გალერეის ყველა მთავარ
   ჩანართში ერთი და იგივე ზოლი.

   „ყველა"-ში ის ფოტო/ვიდეოს სიას ჭრის; „პიროვნებებსა" და „ალბომებში" — ბარათებს:
   „ფოტო"-ზე ჩანს ის, ვისაც ფოტო აქვს, და ბარათი მხოლოდ ფოტოებს ითვლის (ალბომი ერთია
   და ორივეს იტევს — ფოტოების ჩანართზე მისი ფოტოები ჩანს, ვიდეოებისაზე — ვიდეოები).

   ⚠️ **„რჩეული" ფოტო/ვიდეოს გამორიცხავს** — რჩეული = ყველა რჩეული, ერთი ბარათით;
   ცალკე ღილაკი მაღალ ბარათებს შორის სხვა ზომისა იყო.
   ============================================================ */

export type PersonalKindFilterValue = 'all' | 'photo' | 'video' | 'favorite'

const ICONS = { all: LayoutGrid, photo: Image, video: Video, favorite: Star } as const

export function PersonalKindFilter({
  value,
  onChange,
  counts,
  favorite = true,
}: {
  value: PersonalKindFilterValue
  onChange: (next: PersonalKindFilterValue) => void
  /** ბარათის რიცხვი; ჩატვირთვამდე — რიცხვის გარეშე */
  counts?: Partial<Record<PersonalKindFilterValue, number>>
  /** „რჩეული" ბარათი — იქ, სადაც რჩეულის მონიშვნა არსებობს */
  favorite?: boolean
}) {
  const { t } = useTranslation()
  const keys: PersonalKindFilterValue[] = favorite ? ['all', 'photo', 'video', 'favorite'] : ['all', 'photo', 'video']

  return (
    <CutTabs
      layout="inline"
      size="sm"
      options={keys.map((key) => ({
        key,
        label: t(key === 'favorite' ? 'filter.favorite' : `personal.kind.${key}`),
        icon: ICONS[key],
        color: key === 'favorite' ? 'var(--favorite)' : undefined,
        count: counts?.[key],
      }))}
      value={value}
      onChange={(key) => onChange(key as PersonalKindFilterValue)}
    />
  )
}
