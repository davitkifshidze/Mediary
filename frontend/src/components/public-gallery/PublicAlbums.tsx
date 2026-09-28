import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchPublicGalleryGroups, type PublicGalleryGroup } from '@/api/publicProfile'
import { InfoHint } from '@/components/ui/info-hint'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'
import { PublicGroupGrid } from '@/components/public-gallery/PublicGroupGrid'
import { PublicPhotoList } from '@/components/public-gallery/PublicPhotoList'

/* ============================================================
   **საჯარო „ალბომები" — საქაღალდეები** (Tasks §32.2).

   მფლობელის `AlbumsCut`-ის სტრუქტურა, ოღონდ მხოლოდ სანახავად: დასტა =
   ალბომი, დაჭერა = მისი ფოტოები, „არეული" = ყველა საჯარო ალბომის ფოტო
   ერთ ბადეზე (`album=any`).

   ⚠️ **ჩაკეტილი ალბომიც იხსნება** — შიგნით ბლარიანი ფილებია და „გახსნის"
   ღილაკი (მფლობელის §7.15-ის ზუსტი ქცევა). დასტა თვითონ ბუნდოვანია და
   ესკიზი არ აქვს: სერვერი ჩაკეტილს ესკიზს არ უგზავნის.

   ⚠️ **ცარიელი ალბომი აქ არ ჩანს** (სერვერის წესი): უცხო მნახველი მასში
   ვერაფერს ჩააგდებს, ე.ი. ცარიელი საქაღალდე მისთვის მხოლოდ ხმაურია.
   ============================================================ */

export function PublicAlbums({
  username,
  onLocked,
}: {
  username: string
  onLocked: (albumId: number) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<PublicGalleryGroup | null>(null)
  const [layout, setLayout] = useState<GalleryLayout>('grouped')

  const groupsQ = useQuery({
    queryKey: ['public-gallery', username, 'groups', 'album'],
    queryFn: () => fetchPublicGalleryGroups(username, 'album'),
    enabled: layout === 'grouped',
  })

  if (open) {
    return (
      <PublicPhotoList
        username={username}
        filters={{ owner: `album:${open.id}` }}
        title={open.title ?? `#${open.id}`}
        hint={open.subtitle ? <InfoHint info={open.subtitle} /> : undefined}
        onBack={() => setOpen(null)}
        showOwner
        onLocked={onLocked}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <LayoutToggle className="ml-auto" value={layout} onChange={setLayout} />
      </div>

      {layout === 'mixed' ? (
        <PublicPhotoList
          username={username}
          filters={{ album: 'any' }}
          title={t('gallery.cut.albums')}
          hint={<InfoHint info={t('gallery.mixedHint')} />}
          showOwner
          onLocked={onLocked}
          emptyText={t('publicProfile.gallery.emptyAlbums')}
        />
      ) : (
        <PublicGroupGrid
          groups={groupsQ.data?.groups ?? []}
          previews={groupsQ.data?.previews ?? {}}
          loading={groupsQ.isLoading}
          onOpen={setOpen}
          emptyText={t('publicProfile.gallery.emptyAlbums')}
        />
      )}
    </div>
  )
}
