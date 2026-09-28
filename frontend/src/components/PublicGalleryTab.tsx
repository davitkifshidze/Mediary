import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPublicGallerySummary,
  type PublicGallerySummary,
  type PublicProfile,
} from '@/api/publicProfile'
import { GALLERY_CUTS } from '@/lib/galleryCuts'
import { CutTabs } from '@/components/ui/cut-tabs'
import { PublicAlbumUnlockDialog } from '@/components/public-gallery/PublicAlbumUnlockDialog'
import { PublicAlbums } from '@/components/public-gallery/PublicAlbums'
import { PublicLibrary } from '@/components/public-gallery/PublicLibrary'
import { PublicPhotoList } from '@/components/public-gallery/PublicPhotoList'
import { PublicVideos } from '@/components/public-gallery/PublicVideos'

/* ============================================================
   **საჯარო პროფილის გალერეა — მფლობელის სტრუქტურით (Tasks §7.4 → §32).**

   შენი სიტყვები: „გალერეაში იგივე სტრუქტურით ჩანდეს — ფაილებით,
   ჩანართებითა და ალბომებით, როგორც რეალურადაა".

   აქამდე ეს ერთი ბრტყელი ბადე იყო (უახლესი პირველი). ახლა — მფლობელის
   გალერეის ჭრილები, ბარათებად: **ყველა ფოტო · ბიბლიოთეკა · ალბომები ·
   ვიდეოები**, თითოს თავისი რიცხვით.

   ⚠️ **„მოდულების" და „წყაროების" ჭრილი აქ განზრახ არ არის** (§32.4):
   მთავარი ფოტოები და მოდულების ფაილები ჩანაწერის ნაწილია და არა
   გალერეის ერთეული (`note` კი საერთოდ პირადია), „წყაროები" კი მფლობელის
   ტექნიკური კითხვაა — „რომელმა ძრავამ მოიტანა".

   ⚠️ **საჯარო ტყუპები და არა მფლობელის კომპონენტები „წაკითხვის რეჟიმში"**:
   `GroupsCut`/`AlbumsCut`/`VideosCut` შესულ `/gallery/*`-ს იძახებს (უცხოსთვის
   401) და მათი ნახევარი ჩამწერი მოქმედებაა — ჩამოტვირთვა, ვებძებნა,
   გადატანა, წაშლა, რედაქტირება. ერთი კომპონენტი ორ რეჟიმში ყოველ
   მომავალ მფლობელის ღილაკს „საჯაროზე დამალე"-ს დაავალებდა; ერთი
   დავიწყებული და წაშლის ღილაკი უცხოს ეკრანზე გაჩნდებოდა. საერთოა ის,
   რაც **სანახავია**: `PhotoGrid` (კითხვის რეჟიმი), `PhotoStack`, `CutTabs`,
   `SortPick`, `LayoutToggle`.

   ⚠️ **ხილვადობას სერვერი წყვეტს** (`PublicGallery`, სამი წესი) — აქ არცერთი
   „ვინ რას ხედავს" პირობა არ წერია.

   ⚠️ **პაროლის ფანჯარა ერთია და აქ ცხოვრობს**: ჩაკეტილი ფილა ოთხივე
   ჭრილში შეიძლება იყოს. მდგომარეობაც და პორტალის JSX-იც ერთ კომპონენტშია
   (`GroupsCut`-ის ცოცხალი ხარვეზის წესი).
   ============================================================ */

const PUBLIC_CUTS = ['all', 'records', 'albums', 'videos'] as const
type PublicCut = (typeof PUBLIC_CUTS)[number]

/** რიგი მნიშვნელობით და არა ანბანით — „კადრი · პოსტერი · ლოგო · მსახიობი" */
const CATEGORY_ORDER = ['backdrop', 'poster', 'logo', 'actor'] as const

export function PublicGalleryTab({ username, profile }: { username: string; profile: PublicProfile }) {
  const { t } = useTranslation()
  const [cut, setCut] = useState<PublicCut>('all')
  const [unlocking, setUnlocking] = useState<number | null>(null)

  const summaryQ = useQuery({
    queryKey: ['public-gallery', username, 'summary'],
    queryFn: () => fetchPublicGallerySummary(username),
  })

  const summary = summaryQ.data

  /* ⚠️ ხატულა `GALLERY_CUTS`-იდან — იგივე, რასაც მფლობელი საიდბარში და
     გალერეის ქვე-მენიუში ხედავს (ბიბლიოთეკა `LibraryBig`-ია და არა ფილმის
     ფირი: მასში წიგნიც და თამაშიც ზის). */
  const options = useMemo(() => {
    const counts: Record<PublicCut, number | undefined> = {
      all: summary?.photos,
      records: summary?.records,
      albums: summary?.albums,
      videos: summary?.videos,
    }

    return PUBLIC_CUTS.map((key) => ({
      key,
      label: t(`gallery.cut.${key}`),
      icon: GALLERY_CUTS.find((c) => c.key === key)?.icon,
      count: counts[key],
    }))
  }, [summary, t])

  const onLocked = (albumId: number) => setUnlocking(albumId)

  return (
    <div className="pb-10">
      <div className="mb-5">
        <CutTabs
          size="sm"
          layout="inline"
          options={options}
          value={cut}
          onChange={(key) => setCut(key as PublicCut)}
        />
      </div>

      {cut === 'all' && <PublicAllPhotos username={username} summary={summary} onLocked={onLocked} />}
      {cut === 'records' && <PublicLibrary username={username} profile={profile} onLocked={onLocked} />}
      {cut === 'albums' && <PublicAlbums username={username} onLocked={onLocked} />}
      {cut === 'videos' && <PublicVideos username={username} />}

      {unlocking !== null && (
        <PublicAlbumUnlockDialog username={username} albumId={unlocking} onClose={() => setUnlocking(null)} />
      )}
    </div>
  )
}

/**
 * „ყველა ფოტო" — კატეგორიის ბარათები და ერთი ბრტყელი ბადე.
 *
 * ⚠️ **კატეგორიების სია ბაზიდან მოდის** (`summary.categories`) — მფლობელის
 * `AllPhotosCut`-ის წესი: ნულიანი კატეგორია ბარათად არ იხატება, თორემ
 * „ლოგოზე" დაჭერა ცარიელ ბადეს დააბრუნებდა ახსნის გარეშე.
 */
function PublicAllPhotos({
  username,
  summary,
  onLocked,
}: {
  username: string
  summary: PublicGallerySummary | undefined
  onLocked: (albumId: number) => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<string>('all')

  const counts = summary?.categories
  const options = useMemo(
    () => [
      { key: 'all', label: t('filter.all'), count: summary?.photos },
      ...CATEGORY_ORDER.filter((key) => (counts?.[key] ?? 0) > 0 || key === category).map((key) => ({
        key,
        label: t(`gallery.category.${key}`),
        count: counts?.[key] ?? 0,
      })),
    ],
    [counts, category, summary?.photos, t],
  )

  return (
    <div className="space-y-4">
      {options.length > 1 && (
        <CutTabs
          label={t('gallery.categoryScope')}
          size="sm"
          layout="inline"
          options={options}
          value={category}
          onChange={setCategory}
        />
      )}

      <PublicPhotoList
        username={username}
        filters={{ category: category === 'all' ? undefined : category }}
        showOwner
        onLocked={onLocked}
      />
    </div>
  )
}
