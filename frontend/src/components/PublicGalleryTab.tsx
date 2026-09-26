import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  fetchPublicGalleryPhotos,
  unlockPublicAlbum,
  type PublicGalleryPhoto,
} from '@/api/publicProfile'
import { errorMessage } from '@/lib/errors'
import { isPortraitCategory } from '@/lib/galleryPhoto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PHOTO_PAGE_ALL, PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **საჯარო პროფილის გალერეა (Tasks §7.4).**

   შენი სიტყვები: „სხვა იუზერმა ნახოს ჩემს გალერეაში გასაჯაროებული
   ფოტოები, ხოლო პაროლიანი ალბომები ვერ ნახოს … თუ პაროლს შეიყვანს, მერე
   გამოჩნდეს რეალური".

   ⚠️ **ჩანართი ფოტოებს ხატავს და არა ალბომებს.** დომენი `gallery_album`-ია
   (ერთადერთი, რასაც ხილვადობის გადამრთველი აქვს), მაგრამ *შიგთავსი*
   გამოთვლადია: საჯარო ჩანაწერების, მათი მსახიობებისა და საჯარო ალბომების
   ფოტოები. ბარათებად ალბომების ჩვენება „3 საქაღალდეს" აჩვენებდა იქ, სადაც
   ორასი ფოტოა.

   ⚠️ **ჩაკეტილი ფოტო რიგად მოდის, ფაილის გარეშე** (§7.11): `path` პასუხში
   საერთოდ არ არის, ე.ი. blur ნამდვილად ცარიელია.

   ⚠️ **ბადე საერთო `PhotoGrid`-ია, კითხვის რეჟიმში (Tasks §1).** აქამდე ტაბი
   თავის `<img>`-ებს ხატავდა და ყველა `path`-ს `storageUrl()`-ში ატარებდა —
   პაროლით გახსნილი ალბომის ფაილი კი პირად დისკზეა და მისი `path` API-ის
   მარშრუტია, ე.ი. მისამართი `/storage/public/profiles/…` ხდებოდა (404) და
   ფილა ცარიელი რჩებოდა. `PhotoGrid` პირადს blob-ად კითხულობს (axios ქუქის
   აგზავნის, ე.ი. სესიის განბლოკვა მოქმედებს), ჩაკეტილს ბლარად ხატავს და
   ჩვეულებრივ ფოტოზე ლაითბოქსს ხსნის — აქამდე დაჭერა არაფერს აკეთებდა.
   ⚠️ **კითხვის რეჟიმი** (`readOnly`): სხვისი პროფილია, ე.ი. მონიშვნა,
   ჩამოტვირთვა და წაშლა აქ არაფერს ნიშნავს.

   ⚠️ **პაროლი მფლობელისაა** — უცხოსთვის ალბომი პრაქტიკულად ჩაკეტილი
   რჩება; მექანიზმი კი უნდა არსებობდეს, თორემ მფლობელიც ვერ ნახავდა
   საკუთარ საჯარო ბმულზე.
   ============================================================ */

/**
 * სერვერის რიგი → ბადის უჯრა.
 *
 * ⚠️ **ჩაკეტილი ცალკე შტოა** (`GalleryPhotoGrid`-ის წესი): მისამართი მას არ
 * აქვს, ე.ი. `src: ''` ბადეს ბლარის დახატვას და პაროლის კითხვას ეუბნება;
 * `albumId` — რომელი ალბომის პაროლი.
 */
function toItem(photo: PublicGalleryPhoto): PhotoItem {
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

  return {
    id: photo.id,
    src: photo.path,
    // ⚠️ თითო ფოტოზე და არა ბადეზე: ერთ გვერდზე ორივე დისკი ერევა
    private: photo.private,
    portrait: isPortraitCategory(photo.category),
    width: photo.width,
    height: photo.height,
  }
}

export function PublicGalleryTab({ username }: { username: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PublicGalleryPhoto[]>([])
  const [unlocking, setUnlocking] = useState<number | null>(null)
  const [password, setPassword] = useState('')

  const query = useQuery({
    queryKey: ['public-gallery', username, page],
    queryFn: () => fetchPublicGalleryPhotos(username, page),
  })

  // გვერდები გროვდება („მეტის ჩვენება"), პირველი გვერდი კი სიას ანულებს
  const photos = useMemo(() => {
    if (!query.data) return rows
    return query.data.meta.current_page === 1
      ? query.data.data
      : [...rows.filter((r) => !query.data!.data.some((n) => n.id === r.id)), ...query.data.data]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows დაგროვილი შედეგია და deps-ში მისი ჩადება უსასრულო ციკლია
  }, [query.data])

  // ⚠️ memo: პაროლის აკრეფა ტაბს ხელახლა ხატავს და ახალი მასივი ბადის ეფექტებს ყოველ ასოზე გაუშვებდა
  const items = useMemo(() => photos.map(toItem), [photos])

  const unlock = useMutation({
    mutationFn: (albumId: number) => unlockPublicAlbum(username, albumId, password),
    onSuccess: () => {
      setUnlocking(null)
      setPassword('')
      setRows([])
      setPage(1)
      qc.invalidateQueries({ queryKey: ['public-gallery', username] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const meta = query.data?.meta

  if (query.isLoading && !photos.length) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!photos.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('publicProfile.emptyDomain')}</p>
  }

  return (
    <div className="pb-10">
      {/* ⚠️ გვერდებს სერვერი ჭრის („მეტის ჩვენება" ქვემოთ), ე.ი. ბადე მიღებულ
          სიას მთლიანად ხატავს — საკუთარი გვერდები აქ მეორე, ცრუ დაყოფა იქნებოდა */}
      <PhotoGrid
        readOnly
        items={items}
        pageSize={PHOTO_PAGE_ALL}
        onLocked={(item) => item.albumId != null && setUnlocking(item.albumId)}
      />

      {!!meta && meta.current_page < meta.last_page && (
        <div className="flex justify-center pt-6">
          <Button
            variant="outline"
            onClick={() => {
              setRows(photos)
              setPage((p) => p + 1)
            }}
            disabled={query.isFetching}
          >
            {query.isFetching && <Loader2 className="size-4 animate-spin" />}
            {t('actions.loadMore')}
          </Button>
        </div>
      )}

      {unlocking !== null && (
        <ModalShell title={t('gallery.albumUnlock')} onClose={() => setUnlocking(null)} hint={t('gallery.albumUnlockHint')}>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (password) unlock.mutate(unlocking)
            }}
          >
            <div>
              <Label htmlFor="public-album-password">{t('gallery.albumPassword')}</Label>
              <Input
                id="public-album-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <ModalFooter>
              <Button type="button" variant="ghost" onClick={() => setUnlocking(null)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={!password || unlock.isPending}>
                {t('gallery.albumUnlock')}
              </Button>
            </ModalFooter>
          </form>
        </ModalShell>
      )}
    </div>
  )
}
