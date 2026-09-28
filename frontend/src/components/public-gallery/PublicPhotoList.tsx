import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, LockOpen } from 'lucide-react'
import {
  fetchPublicGalleryPhotos,
  type PublicGalleryPhoto,
  type PublicGalleryPhotoFilters,
} from '@/api/publicProfile'
import type { GallerySort } from '@/api/gallery'
import { isPortraitCategory } from '@/lib/galleryPhoto'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { PHOTO_PAGE_ALL, PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'
import { ShowMore } from '@/components/ui/show-more'
import { SortPick } from '@/components/gallery/SortPick'

/* ============================================================
   **საჯარო ფოტოების სია — ერთი კომპონენტი ოთხივე ჭრილისთვის** (Tasks §32).

   „ყველა ფოტო", ბიბლიოთეკის ჯგუფი, მსახიობი, ალბომი და „არეული" ხედი
   ერთსა და იმავე endpoint-ს ეკითხება (`gallery-photos`) — მხოლოდ ფილტრი
   განსხვავდება. მფლობელის `GroupPhotos`-ის ზუსტი როლი, ოღონდ **საჯარო
   API-ზე**: მფლობელის კომპონენტები შესულ `/gallery/*`-ს იძახებს, რაც
   უცხოსთვის 401-ია.

   ⚠️ **გვერდები გროვდება („მეტის ჩვენება") და არ იცვლება.** ლაითბოქსი
   მიღებულ სიას ხედავს, ე.ი. ჩამოტვირთული ყველა ფოტოს შორის ისრით
   გადადიხარ — ნომრიანი გვერდები მას მიმდინარე ოცდაოთხზე ჩაკეტავდა.

   ⚠️ **ბადე `PhotoGrid`-ია კითხვის რეჟიმში** (§1.1): სხვისი პროფილია, ე.ი.
   მონიშვნა, ჩამოტვირთვა და წაშლა აქ არაფერს ნიშნავს. ჩაკეტილი ფილა
   ბლარია და `onLocked` პაროლს ითხოვს.

   ⚠️ **„არეულის" სიდი ერთხელ იბადება** — გვერდებს შორის რიგი მდგრადი უნდა
   იყოს, თორემ მეორე გვერდი პირველზე ნანახს გაიმეორებდა.
   ============================================================ */

/** ერთ გვერდზე — სერვერის ჭერი 100-ია, 24 მფლობელის ნაგულისხმევია */
const PER_PAGE = 24

export function PublicPhotoList({
  username,
  filters,
  title,
  hint,
  onBack,
  showOwner,
  onLocked,
  emptyText,
}: {
  username: string
  filters: PublicGalleryPhotoFilters
  title?: ReactNode
  hint?: ReactNode
  onBack?: () => void
  /** ბრტყელ სიაში — ვისია ფოტო (ჯგუფის შიგნით ყველა ერთისაა, ე.ი. კატეგორია) */
  showOwner?: boolean
  /** ჩაკეტილ ფილაზე ან ალბომის „გახსნაზე" — რომელი ალბომის პაროლი */
  onLocked: (albumId: number) => void
  emptyText?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [sort, setSort] = useState<GallerySort>('new')
  const [seed] = useState(() => Math.floor(Math.random() * 100000))

  const query = useInfiniteQuery({
    queryKey: ['public-gallery', username, 'photos', filters, sort, sort === 'random' ? seed : 0],
    queryFn: ({ pageParam }) =>
      fetchPublicGalleryPhotos(username, {
        ...filters,
        sort,
        seed: sort === 'random' ? seed : undefined,
        page: pageParam,
        per_page: PER_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
  })

  /* ⚠️ **დუბლი id-ით იჭრება**: „ახალი" რიგში გვერდებს შორის ახალი ფოტო
     შეიძლება ჩაჯდეს და ერთი და იგივე მეორე გვერდზეც გამოჩნდეს. */
  const photos = useMemo(() => {
    const seen = new Set<number>()
    return (query.data?.pages ?? []).flatMap((page) =>
      page.data.filter((photo) => !seen.has(photo.id) && !!seen.add(photo.id)),
    )
  }, [query.data])

  const items = useMemo(
    () => photos.map((photo) => toItem(photo, showOwner, lang, t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t ენის ცვლილებაზე იცვლება, რასაც lang უკვე ფარავს
    [photos, showOwner, lang],
  )

  const first = query.data?.pages[0]
  const total = first?.meta.total ?? 0
  const album = first?.album
  const albumShut = !!album && album.locked && !album.unlocked

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t('actions.back')}
          </Button>
        )}
        {title && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-display text-lg font-semibold">{title}</h3>
              {hint}
            </div>
            {!!first && <p className="text-xs text-muted-foreground">{t('gallery.photos', { count: total })}</p>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* ⚠️ ალბომის თავი თვითონ ამბობს, ჩაკეტილია თუ არა — ფილაზე დაჭერა
              ერთადერთი გზა რომ ყოფილიყო, ცარიელ-ბლარიან ალბომზე ღილაკი
              საერთოდ არ იქნებოდა */}
          {albumShut && (
            <Button variant="outline" size="sm" onClick={() => onLocked(album.id)}>
              <LockOpen className="size-4" />
              {t('gallery.albumUnlock')}
            </Button>
          )}
          <SortPick value={sort} onChange={setSort} />
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PhotoGrid
          readOnly
          items={items}
          /* ⚠️ გვერდებს სერვერი ჭრის („მეტის ჩვენება" ქვემოთ), ე.ი. ბადე
             მიღებულ სიას მთლიანად ხატავს — საკუთარი გვერდები აქ მეორე,
             ცრუ დაყოფა იქნებოდა */
          pageSize={PHOTO_PAGE_ALL}
          emptyText={emptyText ?? t('publicProfile.gallery.empty')}
          onLocked={(item) => item.albumId != null && onLocked(item.albumId)}
        />
      )}

      <ShowMore
        shown={photos.length}
        total={total}
        loading={query.isFetchingNextPage}
        onMore={() => query.fetchNextPage()}
      />
    </section>
  )
}

/**
 * სერვერის რიგი → ბადის უჯრა.
 *
 * ⚠️ **ჩაკეტილი ცალკე შტოა** (`GalleryPhotoGrid`-ის წესი): მისამართი მას არ
 * აქვს, ე.ი. `src: ''` ბადეს ბლარის დახატვას და პაროლის კითხვას ეუბნება;
 * `albumId` — რომელი ალბომის პაროლი.
 */
function toItem(
  photo: PublicGalleryPhoto,
  showOwner: boolean | undefined,
  lang: 'ka' | 'en',
  t: (key: string) => string,
): PhotoItem {
  if (photo.locked) {
    return {
      id: photo.id,
      src: '',
      locked: true,
      albumId: photo.album_id,
      width: photo.width,
      height: photo.height,
    }
  }

  const owner = photo.owner
  const ownerTitle = owner ? (lang === 'ka' ? owner.title_ka || owner.title : owner.title || owner.title_ka) : null

  return {
    id: photo.id,
    src: photo.path,
    // ⚠️ თითო ფოტოზე და არა ბადეზე: ერთ გვერდზე ორივე დისკი ერევა
    private: photo.private,
    portrait: isPortraitCategory(photo.category),
    subtitle: showOwner
      ? ownerTitle
      : photo.category
        ? t(`gallery.category.${photo.category}`)
        : null,
    width: photo.width,
    height: photo.height,
  }
}
