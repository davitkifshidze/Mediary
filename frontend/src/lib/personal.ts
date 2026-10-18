import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { PERSONAL_KEY, personalFileUrl, type PersonalMedia } from '@/api/personal'
import type { PhotoInfoRow, PhotoItem } from '@/components/ui/photo-grid'
import type { StackPreview } from '@/components/ui/photo-stack'
import { formatDuration } from '@/lib/videoDuration'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **პირადი გალერეა — SPA-ს საერთო დამხმარეები.**
   ============================================================ */

/**
 * **ყველა სია ერთად ძველდება** — ატვირთვა, გადატანა, წაშლა ადამიანის
 * მთვლელსაც ცვლის, ალბომისასაც, ჯგუფებსაც და შეჯამებასაც. ერთ ფესვზე
 * (`['personal', …]`) აწყობილი გასაღებები სწორედ ამიტომაა.
 * ⚠️ მთავარი გვერდის ბარათიც (`dashboard`) და ურნაც ითვლის.
 */
export function invalidatePersonal(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: [PERSONAL_KEY] })
  void qc.invalidateQueries({ queryKey: ['dashboard'] })
  void qc.invalidateQueries({ queryKey: ['trash'] })
}

/** ესკიზი დასტისთვის — პირადი დისკი, blob-ად იკითხება (`PhotoStack`) */
export function privatePreview(url: string | null | undefined): StackPreview[] {
  return url ? [{ url, private: true }] : []
}

export function privatePreviews(urls: readonly string[]): StackPreview[] {
  return urls.map((url) => ({ url, private: true }))
}

/** „12 ფოტო · 3 ვიდეო" — ნულოვანი ნაწილი არ იწერება */
export function countLabel(t: TFunction, photos: number, videos: number): string {
  const parts = [
    photos > 0 ? t('personal.photos', { count: photos }) : null,
    videos > 0 ? t('personal.videos', { count: videos }) : null,
  ].filter(Boolean)

  return parts.length ? parts.join(' · ') : t('personal.emptyCount')
}

/**
 * **ფოტო/ვიდეო → ბადის უჯრა.**
 *
 * ⚠️ ბადე ესკიზს ხატავს (`src`, blob), ლაითბოქსი — სრულ ფოტოს (`full`,
 * პირდაპირი მისამართი), ვიდეო კი `<video>`-ით უკრავს (`video.src`, Range).
 * ჩამოტვირთვა ორიგინალს აძლევს (`downloadUrl` — `attachment`).
 */
export function personalPhotoItem(
  media: PersonalMedia,
  t: TFunction,
  date: (iso: string) => string,
): PhotoItem {
  const direct = personalFileUrl(media)
  const info: PhotoInfoRow[] = [
    { label: t('personal.info.file'), value: media.original_name },
    { label: t('personal.info.size'), value: formatBytes(media.size) },
  ]

  if (media.width && media.height) info.push({ label: t('personal.info.dimensions'), value: `${media.width} × ${media.height}` })
  if (media.duration) info.push({ label: t('personal.info.duration'), value: formatDuration(media.duration) ?? '' })
  if (media.taken_at) info.push({ label: t('personal.info.taken'), value: date(media.taken_at) })

  return {
    id: media.id,
    src: media.thumb ?? '',
    private: true,
    title: media.caption || media.original_name,
    subtitle: media.caption,
    info,
    width: media.width,
    height: media.height,
    size: media.size,
    favorite: media.is_favorite,
    full: media.kind === 'photo' ? direct : undefined,
    downloadUrl: `${direct}?download=1`,
    video: media.kind === 'video' ? { src: direct, mime: media.mime, duration: media.duration } : undefined,
  }
}
