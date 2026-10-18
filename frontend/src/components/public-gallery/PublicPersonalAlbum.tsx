import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, Loader2 } from 'lucide-react'
import {
  fetchPublicPersonalAlbum,
  publicPersonalThumb,
  publicPersonalUrl,
  type PublicCard,
  type PublicPersonalMedia,
} from '@/api/publicProfile'
import { useDateFormat } from '@/lib/dates'
import { countLabel } from '@/lib/personal'
import { ModalShell } from '@/components/ui/modal-shell'
import { PHOTO_PAGE_ALL, PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'
import { Pagination } from '@/components/ui/pagination'
import { usePages } from '@/lib/paged'

/* ============================================================
   **პირადი გალერეის საჯარო ალბომი.**

   ბარათი (`PublicPersonalAlbumTile`) და ფანჯარა (`PublicPersonalAlbumDialog`):
   ბადე კითხვის რეჟიმში, ლაითბოქსი ფოტოსაც ხსნის და ვიდეოსაც უკრავს.

   ⚠️ **ფაილი პირად დისკზეა** და გარეთ მხოლოდ საჯარო მარშრუტით გამოდის
   (`/public/profiles/{username}/personal-media/{id}/…`) — სერვერი ყოველ
   მოთხოვნაზე ამოწმებს, რომ ალბომი საჯაროა და ჩაკეტილი არაა. blob აქ ზედმეტია:
   ავტორიზაცია არ სჭირდება, ვიდეო კი Range-ით უნდა გადაიხვიოს.

   ⚠️ ჩაკეტილი ალბომი აქ **ვერასდროს** მოხვდება — ბოქლომიანი ბარათი საჯარო
   პროფილს არ აქვს (გალერეის ალბომისგან განსხვავებით).
   ============================================================ */

/** ერთ გვერდზე — სერვერის ჭერი 100-ია */
const PER_PAGE = 60

export function PublicPersonalAlbumTile({
  username,
  card,
  onOpen,
}: {
  username: string
  card: PublicCard
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const title = card.title_en || card.title_ka || '—'
  const cover = card.cover_id ? publicPersonalThumb(username, card.cover_id) : null

  return (
    <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
      <div className="grid aspect-[2/3] w-full place-items-center overflow-hidden rounded-lg border border-border bg-muted transition-colors group-hover:border-primary/50">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Folder className="size-8 text-muted-foreground transition-colors group-hover:text-primary" />
        )}
      </div>
      <p className="mt-2 truncate text-sm font-medium" title={title}>
        {title}
      </p>
      <p className="truncate text-xs text-muted-foreground">{countLabel(t, card.photos ?? 0, card.videos ?? 0)}</p>
    </button>
  )
}

export function PublicPersonalAlbumDialog({
  username,
  card,
  onClose,
}: {
  username: string
  card: PublicCard
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { date } = useDateFormat()

  // ნომრები + „მეტის ჩვენება" (ფოტოს გვერდი — `PER_PAGE`)
  const query = usePages({
    queryKey: ['public-personal-album', username, card.id],
    fetchPage: (page) => fetchPublicPersonalAlbum(username, card.id, page, PER_PAGE).then((r) => ({ ...r, items: r.data, total: r.meta.total, lastPage: r.meta.last_page })),
  })

  const media = query.items
  const items = useMemo(() => media.map((m) => toItem(m, t, date)), [media, t, date])
  const album = query.first?.album ?? card

  return (
    <ModalShell title={album.title_en || album.title_ka || '—'} onClose={onClose} size="wide">
      {album.subtitle && <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">{album.subtitle}</p>}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PhotoGrid readOnly items={items} pageSize={PHOTO_PAGE_ALL} emptyText={t('publicProfile.personalEmpty')} />
      )}

      <Pagination {...query.pagination} />
    </ModalShell>
  )
}

/** სერვერის რიგი → ბადის უჯრა (ესკიზი ბადეში, სრული ფოტო/ვიდეო ლაითბოქსში) */
function toItem(media: PublicPersonalMedia, t: (key: string) => string, date: (iso: string) => string): PhotoItem {
  const file = publicPersonalUrl(media.url)

  return {
    id: media.id,
    src: media.thumb ? publicPersonalUrl(media.thumb) : '',
    title: media.caption,
    subtitle: media.taken_at ? date(media.taken_at) : null,
    info: media.taken_at ? [{ label: t('personal.info.taken'), value: date(media.taken_at) }] : undefined,
    width: media.width,
    height: media.height,
    full: media.kind === 'photo' ? file : undefined,
    video: media.kind === 'video' ? { src: file, duration: media.duration } : undefined,
  }
}
