import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2, User, X } from 'lucide-react'
import { galleryDownloadUrl, type GalleryCastImage, type GalleryCastMember, type GalleryImage } from '@/api/gallery'
import { AlbumUnlockById } from '@/components/gallery/AlbumUnlockById'
import { GalleryMoveDialog } from '@/components/gallery/GalleryMoveDialog'
import { castName } from '@/lib/display'
import { galleryPhotoInfo, isPortraitCategory } from '@/lib/galleryPhoto'
import { useContentLang } from '@/lib/settings'
import { Button, buttonVariants } from '@/components/ui/button'
import { PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'
import { PhotoStack } from '@/components/ui/photo-stack'
import { contextMenuItems, MENU_ICONS } from '@/components/ui/record-menu'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PhotoViewToggle, usePhotoView } from '@/components/ui/photo-view'

/* ============================================================
   მსახიობების ფოტოები ჩანაწერზე — **ქვე-სექცია**.

   მოთხოვნა: ფილმზე შესვლისას ჩანდეს ამ ფილმის მსახიობების ფოტოები,
   **დაჯგუფებული** — სახელი, პირველი ფოტო ზემოდან და დანარჩენი უკან
   „კარტებივით", რომ მიტანაზე გაიშალოს.

   ⚠️ **„დაჯგუფებული / არეული" გადამრთველი.** შენი
   პირობა: „შეგეძლოს ყველა იყოს არეულად ან დაჯგუფებულად, შეგეძლოს მიუთითო
   ერთი მსახიობის [ფოტოები] ერთად, ან არეულად". დაჯგუფებულში ერთი უჯრა
   **მსახიობია**, არეულში — ერთი **ფოტო**.

   ⚠️ **დასტაზე დაჭერა დიდ ფანჯარას ხსნის** (ადრე ფოტოები იქვე, გვერდზე იშლებოდა): ფოტოები
   გვერდებად, „გვერდზე რამდენი" (4-ის ჯერადები), ფოტოზე დაჭერით სლაიდერი — საერთო `PhotoGrid`.
   „არეულად" ხედს და ფანჯარას ერთი ხედის გადამრთველი აქვს (დიდი · პატარა · სტრიქონები),
   რომელიც ბრაუზერს ახსოვს.

   ⚠️ **თვითონ კარტი `ui/photo-stack.tsx`-შია**: იგივე დასტა
   გალერეის გვერდზეც ჩანს, ე.ი. ორი ასლი ორნაირად გაიშლებოდა.

   ⚠️ **ფოტოები მსახიობზეა მიბმული და არა ჩანაწერზე** (`gallery_images`
   `cast_member`-ით) — ე.ი. ერთი მსახიობის ფოტო ორ ფილმზე არ დუბლირდება და
   მისივე გვერდზეც იგივე დასტა ჩანს.

   ⚠️ **გადატანაც აქაა**: ფილმის გვერდზე მსახიობის ფოტოს
   მარჯვენა კლიკი იგივე „გადატანას" უნდა სთავაზობდეს, რასაც მსახიობის
   გვერდი — ერთი გვერდის ორ ბადეში ორი ქცევა არ უნდა იყოს. `keep`-ით
   იხსნება: ფოტო მსახიობზე რჩება და მხოლოდ ალბომი იცვლება, სანამ სხვას
   ცხადად არ აირჩევ.
   ============================================================ */

/** ⚠️ ტიპიც გაზიარებულია — ლოკალური ასლი ერთ დღეს გაშორდებოდა */
type Layout = GalleryLayout

export function CastPhotoStacks({
  images,
  cast,
  onDelete,
}: {
  /** ამ ჩანაწერის მსახიობების ფოტოები (`GalleryDetail.cast_images`) */
  images: GalleryCastImage[]
  /** ჩანაწერის შემადგენლობა — რიგი და სქესი აქედან მოდის */
  cast: GalleryCastMember[]
  onDelete?: (images: GalleryImage[]) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [openActor, setOpenActor] = useState<number | null>(null)
  const [layout, setLayout] = useState<Layout>('grouped')
  const [view, setView] = usePhotoView()
  /** რომელი ალბომის პაროლს ვკითხულობთ (ჩაკეტილ ფილაზე დაჭერა, 2026-09-20) */
  const [unlocking, setUnlocking] = useState<number | null>(null)
  /** რომელი ფოტოები გადაგვაქვს (`null` — დიალოგი დახურულია) */
  const [moving, setMoving] = useState<number[] | null>(null)
  const navigate = useNavigate()

  /**
   * ჯგუფები — **ჩანაწერის შემადგენლობის რიგით** (billing order), რომ მთავარი
   * როლები თავში იყოს; ფოტოების რაოდენობით დალაგება მეორეხარისხოვან
   * მსახიობს წამოწევდა მხოლოდ იმიტომ, რომ TMDB-ს მისი მეტი ფოტო აქვს.
   */
  const groups = useMemo(() => {
    const byActor = new Map<number, GalleryCastImage[]>()

    for (const image of images) {
      const id = image.actor?.id
      if (!id) continue
      const list = byActor.get(id)
      if (list) list.push(image)
      else byActor.set(id, [image])
    }

    const ordered = cast
      .filter((member) => byActor.has(member.id))
      .map((member) => ({ member, photos: byActor.get(member.id)! }))

    // შემადგენლობაში აღარმყოფი მსახიობის ფოტო (resync-ის შემდეგ) არ უნდა დაიკარგოს
    const known = new Set(ordered.map((g) => g.member.id))
    for (const [id, photos] of byActor) {
      if (known.has(id)) continue
      const actor = photos[0].actor!
      ordered.push({
        member: {
          id,
          name: actor.name,
          name_ka: actor.name_ka,
          gender: null,
          photo_path: null,
          has_tmdb: false,
          photos: photos.length,
        },
        photos,
      })
    }

    return ordered
  }, [images, cast])

  if (!groups.length) return null

  const nameOf = (member: GalleryCastMember) => castName(member, lang)

  /* ⚠️ **ჩაკეტილი ალბომის კადრი აქაც ჩანს — დაბლარულად** (2026-09-20).
     ბილიკი, სახელი და ზომა პასუხში არ მოსულა, ე.ი. ჩვეულებრივ უჯრად
     გადაქცევა გატეხილ `<img>`-ს ნიშნავდა. `actor` კი ჩაკეტილსაც მოსდევს —
     უამისოდ დაბლარული კადრი მსახიობის დასტიდან ამოვარდებოდა და ბარათზე
     რიცხვი სიას აღარ დაემთხვეოდა. */
  const toItem = (image: GalleryCastImage, owner: string | null): PhotoItem =>
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
          subtitle: owner ?? undefined,
          portrait: isPortraitCategory(image.category),
          size: image.size,
          width: image.width,
          height: image.height,
          info: galleryPhotoInfo(image, t, { owner }),
          downloadUrl: galleryDownloadUrl(image.id),
        }

  /** ⚠️ წაშლა ჩაკეტილს ვერ ეხება — `PhotoGrid` მას მონიშვნაშიც არ უშვებს */
  const pick = (ids: number[], pool: GalleryCastImage[]) =>
    ids
      .map((id) => pool.find((i) => i.id === id))
      .filter((i): i is GalleryCastImage & GalleryImage => Boolean(i) && !i!.locked)

  /** გადატანაც იმავე ფილტრზე დგას: ჩაკეტილს სერვერი ისედაც არ გადაიტანდა */
  const move = (ids: number[], pool: GalleryCastImage[]) => {
    const open = pick(ids, pool).map((image) => image.id)
    if (open.length) setMoving(open)
  }

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          {t('gallery.castStacks')}
          <span className="ml-2 normal-case tracking-normal">
            {t('gallery.castStacksCount', { actors: groups.length, photos: images.length })}
          </span>
        </h3>

        {/* ⚠️ **გადამრთველი გაზიარებულია** — ერთი მსახიობის ფოტოები
            ერთად თუ ყველაფერი არეულად */}
        {/* ხედი მხოლოდ იქ, სადაც ბადეა — „არეულად" */}
        {layout === 'mixed' && <PhotoViewToggle className="ml-auto" value={view} onChange={setView} />}
        <LayoutToggle
          className={layout === 'mixed' ? undefined : 'ml-auto'}
          value={layout}
          onChange={(next) => {
            setLayout(next)
            setOpenActor(null)
          }}
        />
      </div>

      {layout === 'mixed' ? (
        /* არეული — ერთი უჯრა ერთი ფოტოა, სახელი ხელმოწერაშია */
        <PhotoGrid
          items={images.map((image) =>
            toItem(image, image.actor ? castName(image.actor, lang) : null),
          )}
          emptyText={t('gallery.emptyActor')}
          view={view}
          onDelete={onDelete && ((ids) => onDelete(pick(ids, images)))}
          onMove={(ids) => move(ids, images)}
          onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {groups.map(({ member, photos }) => (
            <li key={member.id}>
              <PhotoStack
                title={nameOf(member)}
                label={t('gallery.photos', { count: photos.length })}
                count={photos.length}
                /* ⚠️ **ესკიზში ჩაკეტილი არ ხვდება** — ერთი ესკიზიც ბილიკს
                   გამოიტანდა; რიცხვი კი (`count`) ისევ სრულია, თორემ
                   ბარათი იტყუებოდა („0 ფოტო" სავსე დასტაზე). */
                images={photos.filter((image) => !image.locked).map((image) => image.url)}
                onClick={() => setOpenActor(member.id)}
                /* მარჯვენა ღილაკი: გახსნა · მსახიობის გვერდი · — · დასტის წაშლა */
                menu={contextMenuItems([
                  { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setOpenActor(member.id) },
                  { key: 'actor', label: t('gallery.actorPage'), icon: User, run: () => navigate(`/actors/${member.id}`) },
                  ...(onDelete && photos.some((image) => !image.locked)
                    ? [{
                        key: 'delete',
                        label: t('photos.deleteSelected', { count: photos.filter((image) => !image.locked).length }),
                        icon: MENU_ICONS.delete,
                        danger: true,
                        separator: true,
                        run: () => onDelete(pick(photos.map((i) => i.id), photos)),
                      }]
                    : []),
                ])}
                actions={
                  /* „მსახიობები გამოიძახო, გალერეა ნახო და წაშალო":
                     ერთეულების წაშლა ბადეშივე იყო, მთელი დასტისა კი — არსად,
                     ე.ი. ოცფოტოიანი მსახიობის გასუფთავება ოცი დაჭერა იყო.
                     ⚠️ დადასტურებას გამომძახებელი კითხულობს (`onDelete`),
                     ე.ი. კითხვა ერთი და იგივეა ბადეზეც და აქაც. */
                  /* ⚠️ **ჩაკეტილი ამ წაშლაშიც არ ხვდება** (2026-09-20) და
                     რიცხვიც მისი გამოკლებით იწერება: ღილაკი 12-ს რომ
                     წერდეს და 9-ს შლიდეს, დაბლარულ ფოტოს ჩუმად წაშლიდა. */
                  onDelete && photos.some((image) => !image.locked) ? (
                    <Button
                      type="button"
                      variant="destructiveOutline"
                      size="sm"
                      onClick={() => onDelete(pick(photos.map((i) => i.id), photos))}
                    >
                      <Trash2 className="size-3.5" />
                      {t('photos.deleteSelected', {
                        count: photos.filter((image) => !image.locked).length,
                      })}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* გახსნილი მსახიობი — დიდი ფანჯარა: თავისი ბადე, გვერდები, „გვერდზე რამდენი" და სლაიდერი
          (საერთო `PhotoGrid`). ⚠️ ჯგუფი ყოველ ჯერზე სიიდან იკითხება — ბოლო ფოტოს წაშლის შემდეგ
          ფანჯარა თავისით იხურება. */}
      {layout === 'grouped' &&
        openActor != null &&
        (() => {
          const group = groups.find((g) => g.member.id === openActor)
          if (!group) return null

          return (
            <ModalShell size="full" title={nameOf(group.member)} onClose={() => setOpenActor(null)}>
              <div data-testid="cast-stack-dialog">
                <div className="mb-3 flex justify-end">
                  <PhotoViewToggle value={view} onChange={setView} />
                </div>
                <PhotoGrid
                  items={group.photos.map((image) => toItem(image, nameOf(group.member)))}
                  emptyText={t('gallery.emptyActor')}
                  view={view}
                  onDelete={onDelete && ((ids) => onDelete(pick(ids, group.photos)))}
                  onMove={(ids) => move(ids, group.photos)}
                  onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
                />
              </div>

              <ModalFooter>
                <Link to={`/actors/${group.member.id}`} className={buttonVariants({ variant: 'outline' })}>
                  <User className="size-4" />
                  {t('gallery.actorPage')}
                </Link>
                <Button type="button" onClick={() => setOpenActor(null)}>
                  <X className="size-4" />
                  {t('actions.close')}
                </Button>
              </ModalFooter>
            </ModalShell>
          )
        })()}

      {/* ⚠️ ერთი განთავსება ორივე შტოზე (დაჯგუფებული და არეული) — მდგომარეობაც
          და JSX-იც ერთ კომპონენტშია, `GroupsCut`-ის ცოცხალი ხარვეზის წესი. */}
      {unlocking != null && (
        <AlbumUnlockById albumId={unlocking} onClose={() => setUnlocking(null)} />
      )}
      {moving && (
        <GalleryMoveDialog ids={moving} initialTarget="keep" onClose={() => setMoving(null)} />
      )}
    </section>
  )
}
