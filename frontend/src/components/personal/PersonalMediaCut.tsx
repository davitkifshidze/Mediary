import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Folders, Image, Inbox, LayoutGrid, Search, Star, Users, Video } from 'lucide-react'
import {
  fetchPersonalSummary,
  PERSONAL_KEY,
  PERSONAL_SORTS,
  type PersonalGrouping,
  type PersonalMediaFilters,
  type PersonalSort,
} from '@/api/personal'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { PersonalGroups } from '@/components/personal/PersonalGroups'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'

/* ============================================================
   **„ფოტო & ვიდეო"** — ყველაფერი ერთად, დაჯგუფებით:
   **ყველა · პიროვნებით · ალბომით · დაუჯგუფებელი**; ქვემოთ ქვე-ფილტრი —
   **ყველა · ფოტოები · ვიდეოები · რჩეული**, მარჯვნივ ძებნა წარწერაში და სორტირება.

   ⚠️ **ჯგუფები სერვერზე ითვლება** და ერთი კომპონენტით იხატება
   (`PersonalGroups` — იგივეა პიროვნების გვერდის „ალბომით" ხედი). გახსნილ
   ჯგუფზე ზედა ბარათები და ქვე-ფილტრი რჩება — ფილტრი ჯგუფის ბადესაც ეხება.

   ⚠️ **თვეებით დაჯგუფება წაიშალა** („თვეებით სისულელე ტაბი მოაშორე") —
   გადაღების თარიღი მხოლოდ სორტირებაა. „დაუჯგუფებელი" ბარათი + ქვე-ფილტრი
   ფოტო/ვიდეო ზუსტად „ცალკე ფოტო/ვიდეოს" იძლევა (`ungrouped=1&kind=photo`),
   ამიტომ ზედა ტაბები სამი რჩება. ჯგუფის ბარათები მოქმედებით ბრუნვაშია
   („პიროვნებით", „ალბომით"), რომ ზედა ჭრილებს („პიროვნებები", „ალბომები") არ დაემთხვეს.

   ⚠️ **რჩეული ქვე-ფილტრის მეოთხე ბარათია და არა ცალკე ღილაკი**: `h-9`
   რჩეული მაღალ ბარათებს შორის „სხვა ზომისა" იყო. ის ფოტო/ვიდეოს
   გამორიცხავს — რჩეული = ყველა რჩეული, ფოტოც და ვიდეოც.

   ⚠️ **ძებნა და სორტირება ყოველთვის ჩანს** (მარჯვნივ): ჯგუფურ ხედში აკრეფა
   „ყველა" ხედზე გადადის — ძებნის შედეგი ჯგუფებად არ იყოფა.
   ============================================================ */

type Grouping = 'all' | PersonalGrouping | 'ungrouped'

type Filter = 'all' | 'photo' | 'video' | 'favorite'

const GROUPINGS: { key: Grouping; icon: typeof LayoutGrid; color: string }[] = [
  { key: 'all', icon: LayoutGrid, color: 'var(--primary)' },
  { key: 'person', icon: Users, color: 'var(--tool-people)' },
  { key: 'album', icon: Folders, color: 'var(--gold)' },
  { key: 'ungrouped', icon: Inbox, color: 'var(--status-undecided)' },
]

const FILTERS: { key: Filter; icon: typeof LayoutGrid; color?: string }[] = [
  { key: 'all', icon: LayoutGrid },
  { key: 'photo', icon: Image },
  { key: 'video', icon: Video },
  { key: 'favorite', icon: Star, color: 'var(--favorite)' },
]

export function PersonalMediaCut() {
  const { t } = useTranslation()

  const [grouping, setGrouping] = useState<Grouping>('all')
  const [filter, setFilter] = useState<Filter>('all')
  // ⚠️ ძებნის შედეგიდან მოსული (`?q=`) — წარწერით ფოტო მაშინვე იფილტრება
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<PersonalSort>('taken')

  // ⚠️ იგივე ქეშია, რაც გვერდის მთვლელებს — ცალკე მოთხოვნა არ მიდის
  const summary = useQuery({ queryKey: [PERSONAL_KEY, 'summary'], queryFn: fetchPersonalSummary }).data

  const base: PersonalMediaFilters = {
    kind: filter === 'photo' || filter === 'video' ? filter : undefined,
    favorite: filter === 'favorite' || undefined,
    q: q.trim() || undefined,
    sort,
  }

  const by: PersonalGrouping | null = grouping === 'person' || grouping === 'album' ? grouping : null

  /** ბარათის რიცხვი `summary`-დან; ჩატვირთვამდე — რიცხვის გარეშე */
  const groupingCount = (key: Grouping) => {
    if (!summary) return undefined
    if (key === 'person') return summary.people
    if (key === 'album') return summary.albums
    if (key === 'ungrouped') return summary.ungrouped

    return summary.photos + summary.videos
  }

  const filterCount = (key: Filter) => {
    if (!summary) return undefined
    if (key === 'photo') return summary.photos
    if (key === 'video') return summary.videos
    if (key === 'favorite') return summary.favorites

    return summary.photos + summary.videos
  }

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="personal-media-toolbar">
      <CutTabs
        layout="inline"
        size="sm"
        options={FILTERS.map(({ key, icon, color }) => ({
          key,
          label: t(key === 'favorite' ? 'filter.favorite' : `personal.kind.${key}`),
          icon,
          color,
          count: filterCount(key),
        }))}
        value={filter}
        onChange={(key) => setFilter(key as Filter)}
      />

      {/* ძებნა + სორტირება — მარჯვნივ */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative w-56 max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              // ძებნის შედეგი ჯგუფებად არ იყოფა — „ყველა" ხედი
              if (by && e.target.value.trim()) setGrouping('all')
            }}
            placeholder={t('personal.media.search')}
            aria-label={t('personal.media.search')}
            className="h-9 pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as PersonalSort)}>
          <SelectTrigger className="h-9 w-auto" aria-label={t('sort.label')}>
            <SelectFitValue labels={PERSONAL_SORTS.map((s) => t(`personal.sort.${s}`))} />
          </SelectTrigger>
          <SelectContent>
            {PERSONAL_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`personal.sort.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  return (
    <section>
      <div className="mb-4" data-testid="personal-media-groupings">
        <CutTabs
          label={t('personal.groups.label')}
          options={GROUPINGS.map(({ key, icon, color }) => ({
            key,
            label: t(`personal.groups.${key}`),
            icon,
            color,
            count: groupingCount(key),
          }))}
          value={grouping}
          onChange={(key) => setGrouping(key as Grouping)}
        />
      </div>

      {toolbar}

      {!by ? (
        <PersonalMediaGrid
          filters={{ ...base, ungrouped: grouping === 'ungrouped' || undefined }}
          emptyText={t(grouping === 'ungrouped' ? 'personal.media.emptyUngrouped' : 'personal.media.empty')}
          emptyHint={grouping === 'ungrouped' ? undefined : t('personal.media.emptyHint')}
        />
      ) : (
        <PersonalGroups key={by} by={by} filters={base} />
      )}
    </section>
  )
}
