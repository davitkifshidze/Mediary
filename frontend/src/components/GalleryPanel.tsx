import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { GalleryAnyImage, GalleryCastImage, GalleryImage } from '@/api/gallery'
import { formatBytes } from '@/lib/utils'
import { CutTabs } from '@/components/ui/cut-tabs'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { AlbumUnlockById } from '@/components/gallery/AlbumUnlockById'
import { galleryPhotoInfo } from '@/lib/galleryPhoto'

/* ============================================================
   გალერეის ფილტრები + ბადე (Tasks 10 · §2.9).

   ერთი კომპონენტი ორ ადგილას: **ჩანაწერის გვერდზე** (ტრეილერის ქვემოთ) და
   **მსახიობის გვერდზე**. ცალკე გვერდი განზრახ არ არსებობს — user-ს გალერეა
   ჩანაწერშივე უნდა.

   ⚠️ **ბადე, lightbox და მონიშვნები აქ არაა** — ისინი საერთო
   `ui/photo-grid.tsx`-შია (§2.9), რომელსაც ჩანაწერის გვერდიც, მსახიობის
   გვერდიც და პროფილის ფაილებიც იყენებს. აქ მხოლოდ **გალერეის საქმე** რჩება:
   კატეგორიის ჩიპები.

   ⚠️ **თემები აღარ არსებობს** (§4.5): ხელით მინიჭებული „რა არის სურათზე"
   მთლიანად მოიხსნა — ცხრილი, სვეტი, გვერდი და ეს ჩიპების რიგიც.
   ============================================================ */

/**
 * ფილტრის ჩიპი — კატეგორიით ჭრა (ყველა · კადრები · პოსტერები · მსახიობები).
 * `logo` ახლა აღარ ჩამოდის, მაგრამ ძველ ჩანაწერებზე არსებობს — ამიტომ ჩიპებში რჩება.
 */
type CategoryCut = 'all' | 'backdrop' | 'poster' | 'logo' | 'actor'

export function GalleryPanel({
  images,
  bytes,
  onDelete,
  onPrimary,
  primaryPath,
  actions,
  emptyText,
  categories = true,
}: {
  /**
   * ჩანაწერის ფოტოები + (სურვილისამებრ) მსახიობების ფოტოები ერთ ბადეში.
   *
   * ⚠️ **ზოგი მათგანი ჩაკეტილი ალბომისაა** (2026-09-20) — ასეთს ბილიკი არ
   * მოსდევს და ბადე მის ადგილას ბლარს ხატავს; `GalleryAnyImage`-ის
   * დისკრიმინანტი სწორედ იმიტომაა, რომ `tsc` ყველა განშტოებას მოითხოვდეს.
   */
  images: (GalleryAnyImage | GalleryCastImage)[]
  bytes?: number
  /** ⚠️ **მასივი** — მონიშნულების წაშლა ერთი ქმედებაა (§2.9) */
  onDelete?: (images: GalleryImage[]) => void
  /** მსახიობის ფოტოზე არ გადმოეცემა — გლობალურ ლექსიკონს ვერ ვცვლით */
  onPrimary?: (image: GalleryImage) => void
  primaryPath?: string | null
  /** ჩამოტვირთვის ღილაკი და მისთანები — სათაურის მარჯვნივ */
  actions?: ReactNode
  emptyText?: string
  categories?: boolean
}) {
  const { t } = useTranslation()
  const [cut, setCut] = useState<CategoryCut>('all')
  /** რომელი ალბომის პაროლს ვკითხულობთ (ჩაკეტილ ფილაზე დაჭერა, 2026-09-20) */
  const [unlocking, setUnlocking] = useState<number | null>(null)

  /**
   * ⚠️ **ჩაკეტილს კატეგორია არ მოსდევს და ეს განზრახულია.** პასუხში მხოლოდ
   * `id`, ზომები და `album_id` მოდის, ე.ი. „კადრია თუ პოსტერი" ჯერ არ
   * ვიცით — ჩიპებში ის „ყველაში" ჩანს და კონკრეტულ ჭრილში არა. მოგონილი
   * კატეგორია ჩიპის რიცხვს ატყუებდა.
   */
  const categoryOf = (image: GalleryAnyImage | GalleryCastImage) =>
    image.locked ? null : image.category

  const shown = useMemo(
    () => (cut === 'all' ? images : images.filter((i) => categoryOf(i) === cut)),
    [images, cut],
  )

  const present = useMemo(() => {
    const set = new Set(images.map((i) => categoryOf(i)))
    return (['backdrop', 'poster', 'logo', 'actor'] as const).filter((c) => set.has(c))
  }, [images])

  /** „მთავარი" ფოტო id-ით — `PhotoGrid` მისამართს არ ადარებს */
  const primaryId = useMemo(
    () =>
      primaryPath
        ? (images.find((i) => !i.locked && i.url === primaryPath)?.id ?? null)
        : null,
    [images, primaryPath],
  )

  const actorOf = (image: GalleryAnyImage | GalleryCastImage) =>
    'actor' in image ? image.actor?.name : null

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          {t('gallery.title')}
          {images.length > 0 && (
            <span className="ml-2 normal-case tracking-normal">
              {t('gallery.photos', { count: images.length })}
              {bytes != null && ` · ${formatBytes(bytes)}`}
            </span>
          )}
        </h2>
        {/* ⚠️ **მოქმედებები ერთ დაჯგუფებულ ზოლშია** (შენი მითითება,
            2026-09-14). ადრე ისინი პირდაპირ `justify-between`-იან რიგში
            იდგნენ, ე.ი. ბრაუზერი სამივეს **მთელ სიგანეზე** ფანტავდა და სამ
            დამოუკიდებელ ღილაკად იკითხებოდნენ. ჩარჩო ამბობს, რომ ეს ერთი
            ხელსაწყოთა ზოლია, `gap-0`+გამყოფი კი მათ ერთმანეთს აახლოებს. */}
        {actions && (
          <div className="inline-flex items-center overflow-hidden rounded-md border border-border divide-x divide-border">
            {actions}
          </div>
        )}
      </div>

      {/* კატეგორიის ჩიპები — მხოლოდ მაშინ, თუ ერთზე მეტი სახეა */}
      {categories && present.length > 1 && (
        <div className="mb-4">
          <CutTabs
            options={(['all', ...present] as CategoryCut[]).map((c) => ({
              key: c,
              label: c === 'all' ? t('filter.all') : t(`gallery.category.${c}`),
              count:
                c === 'all' ? images.length : images.filter((i) => categoryOf(i) === c).length,
            }))}
            value={cut}
            onChange={(key) => setCut(key as CategoryCut)}
            size="sm"
            layout="inline"
          />
        </div>
      )}

      {/* ბადე, lightbox და მონიშვნები — საერთო `PhotoGrid` (§2.9).
          ⚠️ ჩიპები აქ რჩება: ისინი გალერეის საქმეა და არა ბადის, ე.ი.
          `PhotoGrid`-ს მოდულის ცოდნა არ სჭირდება. */}
      <PhotoGrid
        items={shown.map((image) =>
          /* ⚠️ **ჩაკეტილი უჯრა ცალკე შტოა და არა „ცარიელი ველებით"**
             (2026-09-20): ბილიკი, სახელი, ზომა და კატეგორია პასუხში
             საერთოდ არ მოსულა — `src: ''`-ის გაგზავნა ბადეს გატეხილ
             `<img>`-ს დაახატვინებდა. `albumId` კი ის ერთადერთია, რაც
             დაჭერისას სჭირდება: რომელი ალბომის პაროლი ვკითხოთ. */
          image.locked
            ? {
                id: image.id,
                src: '',
                locked: true,
                albumId: image.album_id,
                width: image.width,
                height: image.height,
              }
            : {
                id: image.id,
                src: image.url,
                title: image.original_name,
                subtitle:
                  actorOf(image) ??
                  (image.category
                    ? t(`gallery.category.${image.category}`)
                    : t('gallery.category.other')),
                portrait: image.category === 'actor' || image.category === 'poster',
                /* ⚠️ **პასუხს backend იძლევა** (Tasks BUG-20): მშობელს მთავარი
                   სურათის სვეტი ან საერთოდ არ აქვს (მსახიობი — `photo_path`
                   გლობალურია), ან სხვა ჰქვია. `category !== 'actor'` მხოლოდ პირველ
                   შემთხვევას ხურავდა და სიმღერაზე/წიგნზე/თამაშზე ღილაკს ხატავდა,
                   სადაც დაჭერა 500-ს აბრუნებდა. `?? true` — ძველი პასუხისთვის. */
                canPrimary: image.supports_primary ?? image.category !== 'actor',
                size: image.size,
                width: image.width,
                height: image.height,
                // §4.3 — „რა ვიცით ამ ფოტოზე": ერთი ფუნქცია ყველგან
                info: galleryPhotoInfo(image, t, { owner: actorOf(image) }),
              },
        )}
        emptyText={emptyText ?? t('gallery.emptyRecord')}
        primaryId={primaryId}
        onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
        onPrimary={
          onPrimary &&
          ((id) => {
            const image = shown.find((i) => i.id === id)
            // ⚠️ მეორე ფენა: `canPrimary`-ს გარდა თვითონ გამოძახებაც იცავს თავს
            if (image && !image.locked && image.category !== 'actor') onPrimary(image)
          })
        }
        onDelete={
          onDelete &&
          ((ids) =>
            onDelete(
              ids
                .map((id) => shown.find((i) => i.id === id))
                .filter((i): i is GalleryImage => Boolean(i) && !i!.locked),
            ))
        }
      />

      {/* ⚠️ მდგომარეობაც და პორტალის JSX-იც ერთ კომპონენტშია — `GroupsCut`-ის
          ცოცხალი ხარვეზის წესი (ღილაკი ერთ შტოში, დიალოგი მეორეში). */}
      {unlocking != null && (
        <AlbumUnlockById albumId={unlocking} onClose={() => setUnlocking(null)} />
      )}
    </>
  )
}
