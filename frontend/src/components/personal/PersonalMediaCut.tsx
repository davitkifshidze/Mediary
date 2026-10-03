import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Folders, Image, Inbox, LayoutGrid, Search, Users, Video } from 'lucide-react'
import {
  fetchPersonalGroups,
  PERSONAL_KEY,
  PERSONAL_SORTS,
  type PersonalGroup,
  type PersonalGrouping,
  type PersonalKind,
  type PersonalMediaFilters,
  type PersonalSort,
} from '@/api/personal'
import { formatMonth } from '@/lib/dates'
import { countLabel, privatePreviews } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { Input } from '@/components/ui/input'
import { PhotoStack } from '@/components/ui/photo-stack'
import { Select, SelectContent, SelectFitValue, SelectItem, SelectTrigger } from '@/components/ui/select'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'

/* ============================================================
   **„ფოტო & ვიდეო" (Tasks §33.5)** — ყველაფერი ერთად, დაჯგუფებით:
   **ყველა · ადამიანით · ალბომით · თვეებით · უჯგუფო**; ფილტრი — ფოტო/ვიდეო/
   რჩეული, ძებნა წარწერაში.

   ⚠️ **ჯგუფები სერვერზე ითვლება** (`GET /personal/media/groups`) — ათასობით
   ფოტოს ჩამოტანა მხოლოდ თვეებად დასაყოფად ზედმეტი იქნებოდა. ჯგუფზე დაჭერა
   იმავე ბადეს ხსნის ჯგუფის ფილტრით (`filter` სერვერის პასუხშივე მოდის).
   ============================================================ */

type Grouping = 'all' | PersonalGrouping | 'ungrouped'

const GROUPINGS: { key: Grouping; icon: typeof LayoutGrid; color: string }[] = [
  { key: 'all', icon: LayoutGrid, color: 'var(--primary)' },
  { key: 'person', icon: Users, color: 'var(--tool-people)' },
  { key: 'album', icon: Folders, color: 'var(--gold)' },
  { key: 'month', icon: CalendarDays, color: 'var(--tool-sync)' },
  { key: 'ungrouped', icon: Inbox, color: 'var(--status-undecided)' },
]

export function PersonalMediaCut() {
  const { t, i18n } = useTranslation()

  const [grouping, setGrouping] = useState<Grouping>('all')
  const [kind, setKind] = useState<'all' | PersonalKind>('all')
  const [favorite, setFavorite] = useState(false)
  // ⚠️ ძებნის შედეგიდან მოსული (`?q=`) — წარწერით ფოტო მაშინვე იფილტრება
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<PersonalSort>('taken')
  const [group, setGroup] = useState<PersonalGroup | null>(null)

  const base: PersonalMediaFilters = {
    kind: kind === 'all' ? undefined : kind,
    favorite: favorite || undefined,
    q: q.trim() || undefined,
    sort,
  }

  const by = grouping === 'person' || grouping === 'album' || grouping === 'month' ? grouping : null
  const groupsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'groups', by, { kind: base.kind, favorite: base.favorite }],
    queryFn: () => fetchPersonalGroups(by!, { kind: base.kind, favorite: base.favorite }),
    enabled: by !== null,
  })

  /** ჯგუფის სათაური — „უჯგუფო" ჯგუფს სახელი სერვერიდან არ მოდის */
  const titleOf = (g: PersonalGroup) => {
    if (g.title === null) {
      return t(g.key === 'month:undated' ? 'personal.groups.undated' : g.key.startsWith('person') ? 'personal.groups.noPerson' : 'personal.groups.noAlbum')
    }

    return g.key.startsWith('month:') ? formatMonth(g.title, i18n.language) : g.title
  }

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <CutTabs
        layout="inline"
        size="sm"
        options={(['all', 'photo', 'video'] as const).map((key) => ({
          key,
          label: t(`personal.kind.${key}`),
          icon: key === 'photo' ? Image : key === 'video' ? Video : LayoutGrid,
        }))}
        value={kind}
        onChange={(key) => setKind(key as 'all' | PersonalKind)}
      />
      <FavoriteButton active={favorite} onToggle={() => setFavorite((on) => !on)} />

      {!by && (
        <>
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('personal.media.search')} className="h-9 pl-9" />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as PersonalSort)}>
            <SelectTrigger className="h-9 w-auto">
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
        </>
      )}
    </div>
  )

  /* ---------- გახსნილი ჯგუფი ---------- */
  if (group) {
    return (
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setGroup(null)}>
            <ArrowLeft className="size-4" />
            {t('actions.back')}
          </Button>
          <h2 className="text-base font-semibold">{titleOf(group)}</h2>
          <span className="text-sm text-muted-foreground">{countLabel(t, group.photos, group.videos)}</span>
        </div>
        <PersonalMediaGrid filters={{ ...base, ...group.filter }} />
      </section>
    )
  }

  return (
    <section>
      <div className="mb-4">
        <CutTabs
          label={t('personal.groups.label')}
          options={GROUPINGS.map(({ key, icon, color }) => ({ key, label: t(`personal.groups.${key}`), icon, color }))}
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
      ) : groupsQ.isLoading ? (
        <GalleryStackSkeleton aspect="wide" />
      ) : !(groupsQ.data ?? []).length ? (
        <EmptyState icon={<Inbox className="size-6" />} title={t('personal.media.empty')} hint={t('personal.media.emptyHint')} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {(groupsQ.data ?? []).map((g) => (
            <li key={g.key}>
              <PhotoStack
                title={titleOf(g)}
                subtitle={g.subtitle ?? undefined}
                label={countLabel(t, g.photos, g.videos)}
                count={g.total}
                images={privatePreviews(g.previews)}
                aspect="wide"
                onClick={() => setGroup(g)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
