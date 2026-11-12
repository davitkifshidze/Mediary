import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  fetchPersonalGroups,
  PERSONAL_KEY,
  type PersonalGroup,
  type PersonalGrouping,
  type PersonalMediaFilters,
} from '@/api/personal'
import { countLabel, privatePreviews } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoStack } from '@/components/ui/photo-stack'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'

/* ============================================================
   **ჯგუფების ბადე** — „ფოტო & ვიდეოს" „პიროვნებით/ალბომით" და პიროვნების
   გვერდის „ალბომით" ხედი; ერთი კომპონენტი, რომ ორივეგან ერთნაირად იხატოს.

   ⚠️ **ჯგუფები სერვერზე ითვლება** (`GET /personal/media/groups`) — ათასობით
   ფოტოს ჩამოტანა მხოლოდ ჯგუფებად დასაყოფად ზედმეტი იქნებოდა. ჯგუფზე დაჭერა
   იმავე ბადეს ხსნის ჯგუფის ფილტრით (`filter` სერვერის პასუხშივე მოდის) და
   გამომძახებლის ფილტრებით (სახეობა, რჩეული, ძებნა, პიროვნება).

   ⚠️ **გახსნილი ჯგუფი აქვე ინახება** — დაჯგუფების შეცვლაზე მშობელი
   კომპონენტს `key`-ით თავიდან სვამს და გახსნილი ჯგუფი იხურება.

   ⚠️ **„…-ის გარეშე" ჯგუფი არ არის** — ეს ფილტრია: ბადეში მხოლოდ ნამდვილი ჯგუფები
   (პიროვნებები, ალბომები) დგას, ბოლოს კი ბმული „ალბომის გარეშე: N →", რომელიც იმავე
   სიას ფილტრით ხსნის. ფსევდო-ჯგუფი ბარათებს შორის ნამდვილ ალბომად იკითხებოდა.
   ============================================================ */

export function PersonalGroups({
  by,
  filters,
  primary,
}: {
  by: PersonalGrouping
  filters: PersonalMediaFilters
  /** პიროვნების გვერდზე — „მთავარად დაყენება" გახსნილი ჯგუფის ბადეშიც */
  primary?: { id: number | null; set: (mediaId: number) => void }
}) {
  const { t } = useTranslation()
  const [group, setGroup] = useState<PersonalGroup | null>(null)

  const scope = { kind: filters.kind, favorite: filters.favorite, person_id: filters.person_id }
  const groupsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'groups', by, scope],
    queryFn: () => fetchPersonalGroups(by, scope),
  })

  /** ჯგუფის სათაური — „გარეშე" ჯგუფს სახელი სერვერიდან არ მოდის */
  const titleOf = (g: PersonalGroup) =>
    g.title ?? t(g.key.startsWith('person') ? 'personal.groups.noPerson' : 'personal.groups.noAlbum')

  /* ---------- გახსნილი ჯგუფი ---------- */
  if (group) {
    return (
      <section data-testid="personal-group-open">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGroup(null)}>
            <ArrowLeft className="size-4" />
            {t('actions.back')}
          </Button>
          <h2 className="text-base font-semibold">{titleOf(group)}</h2>
          <span className="text-sm text-muted-foreground">{countLabel(t, group.photos, group.videos)}</span>
        </div>
        <PersonalMediaGrid filters={{ ...filters, ...group.filter }} primary={primary} />
      </section>
    )
  }

  if (groupsQ.isLoading) return <GalleryStackSkeleton aspect="wide" />

  const all = groupsQ.data ?? []
  // სერვერი „გარეშე" ნარჩენს სათაურის გარეშე აბრუნებს — ის ჯგუფი არ არის
  const groups = all.filter((g) => g.title !== null)
  const rest = all.find((g) => g.title === null) ?? null

  if (!all.length) {
    return <EmptyState kind="photo" title={t('personal.media.empty')} hint={t('personal.media.emptyHint')} />
  }

  /** „ალბომის გარეშე: N →" — ფილტრი და არა ჯგუფი */
  const restLink = rest && (
    <Button variant="outline" size="sm" className="mt-4" onClick={() => setGroup(rest)} data-testid="personal-groups-rest">
      {t(by === 'person' ? 'personal.groups.restPerson' : 'personal.groups.restAlbum', { count: rest.total })}
      <ArrowRight className="size-4" />
    </Button>
  )

  if (!groups.length) return <div>{restLink}</div>

  return (
    <div>
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="personal-groups">
      {groups.map((g) => (
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
    {restLink}
    </div>
  )
}
