import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2, User } from 'lucide-react'
import type { GalleryCastImage, GalleryCastMember, GalleryImage } from '@/api/gallery'
import { castName } from '@/lib/display'
import { galleryPhotoInfo } from '@/lib/galleryPhoto'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { PhotoStack } from '@/components/ui/photo-stack'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'

/* ============================================================
   მსახიობების ფოტოები ჩანაწერზე — **ქვე-სექცია** (Tasks §4.2 → **§8.5**).

   მოთხოვნა: ფილმზე შესვლისას ჩანდეს ამ ფილმის მსახიობების ფოტოები,
   **დაჯგუფებული** — სახელი, პირველი ფოტო ზემოდან და დანარჩენი უკან
   „კარტებივით", რომ მიტანაზე გაიშალოს.

   ⚠️ **§8.5-ის სიახლე — „დაჯგუფებული / არეული" გადამრთველი.** შენი
   პირობა: „შეგეძლოს ყველა იყოს არეულად ან დაჯგუფებულად, შეგეძლოს მიუთითო
   ერთი მსახიობის [ფოტოები] ერთად, ან არეულად". დაჯგუფებულში ერთი უჯრა
   **მსახიობია**, არეულში — ერთი **ფოტო**.

   ⚠️ **თვითონ კარტი `ui/photo-stack.tsx`-შია** (§4.2): იგივე დასტა
   გალერეის გვერდზეც ჩანს, ე.ი. ორი ასლი ორნაირად გაიშლებოდა.

   ⚠️ **ფოტოები მსახიობზეა მიბმული და არა ჩანაწერზე** (`gallery_images`
   `cast_member`-ით) — ე.ი. ერთი მსახიობის ფოტო ორ ფილმზე არ დუბლირდება და
   მისივე გვერდზეც იგივე დასტა ჩანს.
   ============================================================ */

/** ⚠️ ტიპიც გაზიარებულია (§28) — ლოკალური ასლი ერთ დღეს გაშორდებოდა */
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

  const toItem = (image: GalleryCastImage, owner: string | null) => ({
    id: image.id,
    src: image.url,
    title: image.original_name,
    subtitle: owner ?? undefined,
    portrait: image.category === 'actor' || image.category === 'poster',
    size: image.size,
    width: image.width,
    height: image.height,
    info: galleryPhotoInfo(image, t, { owner }),
  })

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
          {t('gallery.castStacks')}
          <span className="ml-2 normal-case tracking-normal">
            {t('gallery.castStacksCount', { actors: groups.length, photos: images.length })}
          </span>
        </h3>

        {/* ⚠️ **გადამრთველი გაზიარებულია** (§28) — ერთი მსახიობის ფოტოები
            ერთად თუ ყველაფერი არეულად */}
        <LayoutToggle
          className="ml-auto"
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
          onDelete={
            onDelete &&
            ((ids) =>
              onDelete(
                ids
                  .map((id) => images.find((i) => i.id === id))
                  .filter((i): i is GalleryCastImage => Boolean(i)),
              ))
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {groups.map(({ member, photos }) => (
            <li key={member.id}>
              <PhotoStack
                title={nameOf(member)}
                label={t('gallery.photos', { count: photos.length })}
                count={photos.length}
                images={photos.map((image) => image.url)}
                open={openActor === member.id}
                onClick={() => setOpenActor((cur) => (cur === member.id ? null : member.id))}
                actions={
                  /* §25.4 — „მსახიობები გამოიძახო, გალერეა ნახო და წაშალო":
                     ერთეულების წაშლა ბადეშივე იყო, მთელი დასტისა კი — არსად,
                     ე.ი. ოცფოტოიანი მსახიობის გასუფთავება ოცი დაჭერა იყო.
                     ⚠️ დადასტურებას გამომძახებელი კითხულობს (`onDelete`),
                     ე.ი. კითხვა ერთი და იგივეა ბადეზეც და აქაც. */
                  onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive"
                      onClick={() => onDelete(photos)}
                    >
                      <Trash2 className="size-3.5" />
                      {t('photos.deleteSelected', { count: photos.length })}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      {/* გახსნილი მსახიობი — თავისი ბადე, გვერდები და lightbox (საერთო `PhotoGrid`) */}
      {layout === 'grouped' &&
        openActor != null &&
        (() => {
          const group = groups.find((g) => g.member.id === openActor)
          if (!group) return null

          return (
            <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">{nameOf(group.member)}</h4>
                <Link
                  to={`/actors/${group.member.id}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <User className="size-3.5" />
                  {t('gallery.actorPage')}
                </Link>
              </div>

              <PhotoGrid
                items={group.photos.map((image) => toItem(image, nameOf(group.member)))}
                emptyText={t('gallery.emptyActor')}
                onDelete={
                  onDelete &&
                  ((ids) =>
                    onDelete(
                      ids
                        .map((id) => group.photos.find((i) => i.id === id))
                        .filter((i): i is GalleryCastImage => Boolean(i)),
                    ))
                }
              />
            </div>
          )
        })()}
    </section>
  )
}
