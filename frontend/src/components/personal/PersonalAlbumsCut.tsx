import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FolderPlus, UserRound } from 'lucide-react'
import { fetchPersonalAlbums, PERSONAL_KEY, type PersonalAlbum } from '@/api/personal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalAlbumCards } from '@/components/personal/PersonalAlbumCards'
import { PersonalAlbumDialog } from '@/components/personal/PersonalAlbumDialog'

/* ============================================================
   **„ალბომები" (Tasks §33.5)** — ჯერ „გარე" ალბომები, მერე ადამიანების
   ალბომები, თითო ადამიანი თავისი სათაურით (ჯგუფებად).

   ⚠️ **ცარიელი ალბომიც იხატება** (გალერეის წესი): საქაღალდე, რომელიც
   პირველ ფოტომდე გაქრებოდა, მასში გადატანას შეუძლებელს გახდიდა.
   ============================================================ */

export function PersonalAlbumsCut() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)

  const albumsQ = useQuery({ queryKey: [PERSONAL_KEY, 'albums', {}], queryFn: () => fetchPersonalAlbums() })

  const { outside, byPerson } = useMemo(() => {
    const all = albumsQ.data ?? []
    const groups = new Map<number, { name: string; albums: PersonalAlbum[] }>()

    for (const album of all) {
      if (!album.person) continue
      const group = groups.get(album.person.id) ?? { name: album.person.name, albums: [] }
      group.albums.push(album)
      groups.set(album.person.id, group)
    }

    return {
      outside: all.filter((album) => !album.person),
      byPerson: [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)),
    }
  }, [albumsQ.data])

  const dialog = adding && (
    <PersonalAlbumDialog album={null} onClose={() => setAdding(false)} onSaved={(saved) => navigate(`/personal/albums/${saved.id}`)} />
  )

  if (albumsQ.isLoading) return <GalleryStackSkeleton aspect="wide" />

  if (!outside.length && !byPerson.length) {
    return (
      <>
        <EmptyState
          icon={<FolderPlus className="size-6" />}
          title={t('personal.albums.empty')}
          hint={t('personal.albums.emptyHint')}
          actions={
            <Button size="sm" onClick={() => setAdding(true)}>
              <FolderPlus className="size-4" />
              {t('personal.album.add')}
            </Button>
          }
        />
        {dialog}
      </>
    )
  }

  return (
    <div className="space-y-8">
      {outside.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t('personal.albums.outside')}
            <InfoHint info={t('personal.albums.outsideHint')} />
          </h2>
          <PersonalAlbumCards albums={outside} />
        </section>
      )}

      {byPerson.map(([personId, group]) => (
        <section key={personId}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <UserRound className="size-4 text-muted-foreground" />
            <button
              type="button"
              className="cursor-pointer text-left hover:text-primary"
              onClick={() => navigate(`/personal/people/${personId}`)}
            >
              {group.name}
            </button>
          </h2>
          <PersonalAlbumCards albums={group.albums} showOwner={false} />
        </section>
      ))}

      {dialog}
    </div>
  )
}

/** სათაურის ღილაკი — „ალბომის დამატება" */
export function AddAlbumButton({ personId }: { personId?: number | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" />
        {t('personal.album.add')}
      </Button>
      {open && (
        <PersonalAlbumDialog
          album={null}
          personId={personId}
          onClose={() => setOpen(false)}
          onSaved={(saved) => navigate(`/personal/albums/${saved.id}`)}
        />
      )}
    </>
  )
}
