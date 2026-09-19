import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Images, Lock, LockOpen, SquarePen, Trash2 } from 'lucide-react'
import {
  deleteGalleryAlbum,
  fetchGalleryAlbums,
  fetchGalleryGroups,
  lockGalleryAlbum,
  type GalleryAlbum,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { useDeleteGroupPhotos } from '@/lib/galleryDelete'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { PhotoStack } from '@/components/ui/photo-stack'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'
import { AlbumDialog } from '@/components/gallery/AlbumDialog'
import { AlbumUnlockDialog } from '@/components/gallery/AlbumUnlockDialog'

/* ============================================================
   **ალბომების ჭრილი (Tasks §26.4 → 2026-09-16).**

   შენი პირველი მითითება: „გალერიაში მქონდეს ასევე უკატეგორიო სექციაც,
   სადაც შეგეძლება ფოტოების გადატანა, დახარისხება, დაჯგუფება".
   შენი მეორე: „უკატეგორიოს მაგივრად შემოიღე დასახელება ალბომი".

   ⚠️ **სექციას ახლა „ალბომები" ჰქვია და ეს სახელის შეცვლაზე მეტია.**
   ჭრილს მისი **ნარჩენით** ერქვა („ფოტოები, რომლებსაც მშობელი არ ჰყავთ"),
   შინაარსი კი ყოველთვის ალბომები იყო — აქ ქმნი საქაღალდეს და აქ ალაგებ.
   „უკატეგორიო" ახლა ერთი ბარათია შიგნით („ალბომის გარეშე"), ე.ი.
   მდგომარეობა და არა სექციის სახელი.

   ⚠️ **„ალბომის გარეშე" ბარათი აღარ არსებობს** (შენი მითითება, 2026-09-16:
   „ალბომებში ნუა ალბომის გარეშე საქაღალდე"). ჯერ ბოლოში გადავიტანეთ, მერე
   კი სულ მოიხსნა: საქაღალდე ის არასდროს ყოფილა — სექციის ნარჩენი იყო, და
   სექციას, რომელსაც „ალბომები" ჰქვია, არაფერი ესაქმებოდა. უმშობლო ფოტოები
   ისევ „ყველა ფოტოშია" და გადატანის ფანჯარაში „ალბომიდან ამოღება" ისევ
   მუშაობს — უბრალოდ ბარათად აღარ იხატება.

   ⚠️ **ამიტომ „არეული" ხედი `album=any`-ზეა და არა `owner=none`-ზე**: ის
   ალბომებში ჩალაგებულ ფოტოებს აჩვენებს ბრტყლად. `owner=none` ზუსტად იმ
   საქაღალდეს დააბრუნებდა, რომელიც ეს-ესაა მოვხსენით.

   ⚠️ **ცარიელი ალბომიც იხატება.** ჩვეულებრივ ნულიან ჯგუფს არ ვხატავთ,
   აქ კი პირიქითაა — ცარიელი საქაღალდე რომ გამქრალიყო, სანამ პირველ
   ფოტოს ჩააგდებდი, გადატანა შეუძლებელი იქნებოდა.

   ⚠️ **ალბომი ფოტოს მშობელს არ ცვლის** — ალბომში ჩაგდებული ფილმის კადრიც
   კანონიერია და აქაც ჩანს: ჯგუფის რიცხვი `album_id`-ს ითვლის.

   ⚠️ **რედაქტირება მოდალშია** (შენი მითითება): ადრე ეს ხელსაწყოების
   ზოლში ჩამჯდარი ერთი ინპუტი იყო — ფოკუსი ბარათიდან ეკრანის სხვა
   კუთხეში ხტებოდა და ალბომს სახელის გარდა ვერაფერს მისცემდი.

   ⚠️ **ჩაკეტილი ალბომი ბუნდოვანია და ცარიელი** — სერვერი მისი ფოტოს
   ესკიზსაც არ გზავნის, ე.ი. blur ფარდა კი არა, სიცარიელეა (იხ.
   `AlbumLock` backend-ში). ბარათზე დაჭერა პაროლს ითხოვს.
   ============================================================ */

export function AlbumsCut() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  const [open, setOpen] = useState<{ id: number; title: string } | null>(null)
  /** `null` — დახურულია · `{album: null}` — ახალი · `{album}` — რედაქტირება */
  const [editing, setEditing] = useState<{ album: GalleryAlbum | null } | null>(null)
  const [unlocking, setUnlocking] = useState<GalleryAlbum | null>(null)
  /** §28 — ალბომების დასტები თუ ყველა უკატეგორიო ფოტო ერთ ბადეზე */
  const [layout, setLayout] = useState<GalleryLayout>('grouped')

  const groupsQ = useQuery({
    queryKey: ['gallery-groups', 'album', {}],
    queryFn: () => fetchGalleryGroups('album', {}),
  })

  const albumsQ = useQuery({ queryKey: ['gallery-albums'], queryFn: fetchGalleryAlbums })

  const refresh = () =>
    ['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums'].forEach(
      (key) => qc.invalidateQueries({ queryKey: [key] }),
    )

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryAlbum(id),
    onSuccess: () => {
      refresh()
      toast({ title: t('gallery.albumDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * ჯგუფის **ყველა ფოტოს** წაშლა (შენი მითითება, 2026-09-16).
   *
   * ⚠️ ალბომის წაშლა და მისი ფოტოების წაშლა **ორი სხვადასხვა მოქმედებაა** და
   * ასეთივე უნდა დარჩეს: საქაღალდის მოშორება ბიბლიოთეკის წაშლა ვერ იქნება
   * (`album_id`-ს `nullOnDelete` სწორედ ამიტომ აქვს). ამიტომ ეს ცალკე
   * ღილაკია, ცალკე დადასტურებით და დათვლილი რიცხვით.
   *
   * ⚠️ **ლოგიკა `lib/galleryDelete.ts`-შია** — იმავეს ჯგუფების ჭრილიც
   * იყენებს, ე.ი. ორი ასლი გაშორდებოდა.
   */
  const removePhotos = useDeleteGroupPhotos()

  /** „ისევ ჩაკეტე" — პაროლი რჩება, უბრალოდ სესია იხურება */
  const relock = useMutation({
    mutationFn: (id: number) => lockGalleryAlbum(id),
    onSuccess: () => {
      refresh()
      toast({ title: t('gallery.albumRelocked'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const groups = groupsQ.data?.groups ?? []
  const previews = groupsQ.data?.previews ?? {}

  const albumOf = (id: number) => albumsQ.data?.find((a) => a.id === id)

  const titleOf = (id: number) => albumOf(id)?.name ?? `#${id}`

  /* ⚠️ **მოდალები ერთ ცვლადშია და ორივე შტო ხატავს მას** — `GroupsCut`-ის
     ცოცხალი შეცდომის წესი: მდგომარეობა კომპონენტისაა, ე.ი. JSX ერთ
     დაბრუნების შტოში რომ ჩარჩენილიყო, ღილაკი აინთებოდა და ფანჯარა
     არ გაიხსნებოდა. */
  const dialogs = (
    <>
      {editing && <AlbumDialog album={editing.album} onClose={() => setEditing(null)} />}
      {unlocking && (
        <AlbumUnlockDialog
          album={unlocking}
          onClose={() => setUnlocking(null)}
          onUnlocked={() => setOpen({ id: unlocking.id, title: unlocking.name })}
        />
      )}
    </>
  )

  if (open) {
    return (
      <>
        {dialogs}
        <GroupPhotos
          title={open.title}
          hint={<InfoHint info={t('gallery.albumHint')} />}
          filters={{ owner: `album:${open.id}` }}
          cacheKey={`album:${open.id}`}
          onBack={() => setOpen(null)}
          showOwner
          emptyText={t('gallery.albumEmpty')}
          /* §7.15 — ჩაკეტილი ალბომი ბლარიან ფილებად იხატება და პაროლს
             აქვე ითხოვს; ადრე აქ 423 ჩერდებოდა და ბადე საერთოდ არ ჩანდა */
          onUnlock={() => {
            const album = albumOf(open.id)
            if (album) setUnlocking(album)
          }}
        />
      </>
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InfoHint info={t('gallery.albumsHint')} />

        <div className="ml-auto flex items-center gap-2">
          <LayoutToggle value={layout} onChange={setLayout} />
          <Button variant="outline" size="sm" onClick={() => setEditing({ album: null })}>
            <FolderPlus className="size-4" />
            {t('gallery.albumAdd')}
          </Button>
        </div>
      </div>

      {/* §28 — „არეული": ყველა უმშობლო ფოტო ერთ ბრტყელ ბადეზე.
          ⚠️ ალბომებში დახარისხებულებიც აქ ჩანს, რადგან ალბომი მშობელს არ
          ცვლის — ე.ი. ჭრილი იგივე რჩება, მხოლოდ გამოსახულება იცვლება.
          ⚠️ ჩაკეტილის ფოტოები აქაც არ ჩანს: მათ სერვერი არ გზავნის. */}
      {layout === 'mixed' ? (
        <GroupPhotos
          title={t('gallery.cut.albums')}
          hint={<InfoHint info={t('gallery.mixedHint')} />}
          filters={{ album: 'any' }}
          cacheKey="flat:albums"
          emptyText={t('gallery.albumsEmpty')}
        />
      ) : groupsQ.isLoading ? (
        <GalleryStackSkeleton />
      ) : !groups.length ? (
        <EmptyState
          icon={<FolderPlus className="size-6" />}
          title={t('gallery.albumsEmpty')}
          hint={t('gallery.albumsEmptyHint')}
          actions={
            <Button size="sm" onClick={() => setEditing({ album: null })}>
              <FolderPlus className="size-4" />
              {t('gallery.albumAdd')}
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((group) => {
            const album = albumOf(group.id)
            const locked = !!group.locked && !group.unlocked

            /** წაშლის ფილტრი — იგივე ენა, რითიც ჯგუფში შესვლა */
            const filters = { owner: `album:${group.id}` }

            return (
              <li key={`album:${group.id}`}>
                <PhotoStack
                  title={titleOf(group.id)}
                  label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
                  count={group.photos}
                  images={previews[`album:${group.id}`] ?? []}
                  aspect="wide"
                  locked={locked}
                  badge={group.locked ? t(locked ? 'gallery.albumLocked' : 'gallery.albumOpen') : undefined}
                  /* ⚠️ **ჩაკეტილიც იხსნება — შიგნით ბლარიანი ფილებია და
                     პაროლის ღილაკი** (შენი მითითება: „დააჭერ → ბლარი →
                     პაროლი → ნამდვილი"). აქ აღამავალი განშტოება პირდაპირ
                     პაროლის ფანჯარას ხსნიდა — ეს მაშინ იყო სწორი, როდესაც სერვერი
                     423-ს აბრუნებდა და ბადე ცარიელი იყო; §7.15-ის შემდეგ `lockedPhotos()`
                     ბლარიან რიგებს აბრუნებს (`path` არასდროს), ე.ი. აქ გაჩერება
                     ბლარიან ბადესთან ერთად პაროლის ღილაკსაც ანდებდა. */
                  onClick={() => setOpen({ id: group.id, title: titleOf(group.id) })}
                  actions={
                    /* ⚠️ **ფოტოების წაშლა ორივე ბარათს აქვს**, სახელის
                       რედაქტირება და ალბომის წაშლა კი მხოლოდ ნამდვილს:
                       „ალბომის გარეშე" ფსევდო-ჯგუფია — მას არც სახელი აქვს
                       და არც წაშლა, ე.ი. იქ ეს ღილაკები ვერაფერს გააკეთებდა. */
                    <>
                      {group.photos > 0 && !locked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('gallery.deleteGroupTitle'),
                              description: t('gallery.deleteGroupHint', {
                                count: group.photos,
                                name: titleOf(group.id),
                              }),
                              confirmText: t('confirm.delete'),
                              variant: 'destructive',
                            })
                            if (ok) removePhotos.mutate(filters)
                          }}
                        >
                          <Images className="size-3.5" />
                          {t('gallery.deleteGroup', { count: group.photos })}
                        </Button>
                      )}
                      {album ? (
                        <>
                          {group.locked && group.unlocked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => relock.mutate(album.id)}
                            >
                              <Lock className="size-3.5" />
                              {t('gallery.albumRelock')}
                            </Button>
                          )}
                          {locked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setUnlocking(album)}
                            >
                              <LockOpen className="size-3.5" />
                              {t('gallery.albumUnlock')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditing({ album })}
                          >
                            <SquarePen className="size-3.5" />
                            {t('actions.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('gallery.albumDeleteTitle'),
                                description: t('gallery.albumDeleteHint', { name: album.name }),
                                confirmText: t('confirm.delete'),
                                variant: 'destructive',
                              })
                              if (ok) remove.mutate(album.id)
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            {t('confirm.delete')}
                          </Button>
                        </>
                      ) : null}
                    </>
                  }
                />
              </li>
            )
          })}
        </ul>
      )}

      {dialogs}
    </section>
  )
}
