import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Inbox, SquarePen, Trash2 } from 'lucide-react'
import {
  createGalleryAlbum,
  deleteGalleryAlbum,
  fetchGalleryAlbums,
  fetchGalleryGroups,
  updateGalleryAlbum,
  type GalleryAlbum,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoStack } from '@/components/ui/photo-stack'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'

/* ============================================================
   **უკატეგორიო ჭრილი და მისი ალბომები (Tasks §26.4).**

   შენი სიტყვები: „გალერიაში მქონდეს ასევე უკატეგორიო სექციაც, სადაც
   შეგეძლება ფოტოების გადატანა, დახარისხება, დაჯგუფება".

   ⚠️ **„უკატეგორიო" მდგომარეობაა და არა ცალკე საცავი**: ეს უბრალოდ ის
   ფოტოებია, რომელთა მშობელი `null`-ია (`owner=none`). სწორედ ამიტომ
   ჩნდება აქ ჩანაწერიდან „გადმოგდებული" ფოტოც (§25.5) — ის არსად გადადის,
   უბრალოდ მშობელს კარგავს.

   ⚠️ **ალბომი „ჯგუფია უკატეგორიოში"** — ცალკე ღერძი, რომელიც მშობელს არ
   ცვლის. ამიტომ ალბომში ჩაგდებული ფილმის კადრიც კანონიერია და აქაც ჩანს:
   ჯგუფის რიცხვი `album_id`-ს ითვლის და არა უმშობლოებს, ე.ი. „ჯგუფში 12
   წერია, შიგნით 4-ია" ვერ მოხდება.

   ⚠️ **პირველი ბარათი ყოველთვის „ალბომის გარეშე"-ა** (`album:0`) და
   ნულიანიც რჩება: სწორედ ის ადგილია, საიდანაც ფოტოებს ალბომებში ეზიდები.

   ⚠️ **ცარიელი ალბომიც იხატება.** ჩვეულებრივ ნულიან ჯგუფს არ ვხატავთ,
   აქ კი პირიქითაა — ცარიელი საქაღალდე რომ გამქრალიყო, სანამ პირველ ფოტოს
   ჩააგდებდი, გადატანა შეუძლებელი იქნებოდა.
   ============================================================ */

export function UncategorizedCut() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  const [open, setOpen] = useState<{ id: number; title: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<GalleryAlbum | null>(null)
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

  const save = useMutation({
    mutationFn: () =>
      editing
        ? updateGalleryAlbum(editing.id, { name: name.trim() })
        : createGalleryAlbum({ name: name.trim() }),
    onSuccess: () => {
      refresh()
      setAdding(false)
      setEditing(null)
      setName('')
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryAlbum(id),
    onSuccess: () => {
      refresh()
      toast({ title: t('gallery.albumDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const groups = groupsQ.data?.groups ?? []
  const previews = groupsQ.data?.previews ?? {}

  const titleOf = (id: number) =>
    id === 0
      ? t('gallery.albumNone')
      : (albumsQ.data?.find((a) => a.id === id)?.name ?? `#${id}`)

  if (open) {
    return (
      <GroupPhotos
        title={open.title}
        subtitle={t('gallery.albumHint')}
        /* ⚠️ „ალბომის გარეშე" **უმშობლოა** და არა „ალბომი 0": ორივე ჭრილი
           სხვადასხვა კითხვაა და endpoint-ზეც სხვადასხვა პარამეტრია. */
        filters={open.id === 0 ? { owner: 'none' } : { owner: `album:${open.id}` }}
        cacheKey={`album:${open.id}`}
        onBack={() => setOpen(null)}
        showOwner
        emptyText={t('gallery.albumEmpty')}
      />
    )
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{t('gallery.uncategorizedHint')}</p>

        <div className="ml-auto flex items-center gap-2">
          <LayoutToggle value={layout} onChange={setLayout} />
          {(adding || editing) && (
            <>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('gallery.albumName')}
                className="h-9 w-48"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) save.mutate()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setEditing(null)
                    setName('')
                  }
                }}
              />
              <Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
                {t('actions.save')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false)
                  setEditing(null)
                  setName('')
                }}
              >
                {t('actions.cancel')}
              </Button>
            </>
          )}

          {!adding && !editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true)
                setName('')
              }}
            >
              <FolderPlus className="size-4" />
              {t('gallery.albumAdd')}
            </Button>
          )}
        </div>
      </div>

      {/* §28 — „არეული": ყველა უმშობლო ფოტო ერთ ბრტყელ ბადეზე.
          ⚠️ ალბომებში დახარისხებულებიც აქ ჩანს, რადგან ალბომი მშობელს არ
          ცვლის — ე.ი. ჭრილი იგივე რჩება, მხოლოდ გამოსახულება იცვლება. */}
      {layout === 'mixed' ? (
        <GroupPhotos
          title={t('gallery.cut.uncategorized')}
          subtitle={t('gallery.mixedHint')}
          filters={{ owner: 'none' }}
          cacheKey="flat:uncategorized"
          emptyText={t('gallery.uncategorizedEmpty')}
        />
      ) : groupsQ.isLoading ? (
        <GalleryStackSkeleton />
      ) : !groups.length ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title={t('gallery.uncategorizedEmpty')}
          hint={t('gallery.uncategorizedEmptyHint')}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((group) => {
            const album = albumsQ.data?.find((a) => a.id === group.id)

            return (
              <li key={`album:${group.id}`}>
                <PhotoStack
                  title={titleOf(group.id)}
                  label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
                  count={group.photos}
                  images={previews[`album:${group.id}`] ?? []}
                  aspect="wide"
                  onClick={() => setOpen({ id: group.id, title: titleOf(group.id) })}
                  actions={
                    /* ⚠️ „ალბომის გარეშე" ფსევდო-ჯგუფია — მას არც სახელი აქვს
                       და არც წაშლა; რედაქტირების ღილაკი იქ ვერაფერს გააკეთებდა. */
                    album ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditing(album)
                            setName(album.name)
                          }}
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
                    ) : undefined
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
