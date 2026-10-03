import { useTranslation } from 'react-i18next'
import {
  CalendarDays,
  Clock,
  Download,
  ExternalLink,
  Eye,
  HardDriveDownload,
  ListVideo,
  Loader2,
  Play,
  RotateCcw,
  SquarePen,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { videoDownloadUrl, type Video } from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { cn, formatBytes } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'
import { Button, buttonVariants } from '@/components/ui/button'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VisitCount } from '@/components/RecordVisits'
import { VideoBadges } from '@/components/VideoBadges'

/* ============================================================
   **ვიდეოს ბარათი** (Tasks §19) — `VideosPage`-დან ცალკე გამოვიდა (§19.7).

   შენი სიტყვები: „თუ აქვს ტეგები, მერე ქვედა რედაქტირება და წყაროები ზოგგან
   მაღლაა, ზოგგან დაბლა — ცარიელი ადგილიც გაითვალისწინეთ, რომ ყველაფერი
   სიმეტრიული იყოს“.

   ⚠️ **სიმეტრია სლოტებითაა და არა პირობებით** (§14.2/§19.4): ბარათი
   `flex h-full flex-col`-ია, ბეჯების სტრიქონი ყოველთვის სამია (`VideoBadges`),
   მეტა-ხაზი ყოველთვის ერთი სტრიქონია (`truncate`, ცარიელზეც ადგილს იკავებს),
   ტეგების სლოტი `min-h-7`-ია ტეგების გარეშეც, მოქმედებების ზოლი `mt-auto`-თი
   ქვემოთაა და ყველა კონტროლი `h-9`. ჩამოტვირთვის მდგომარეობა **ერთი**
   ღილაკია (ზომა და ფორმატი თულთიპში), რომ ზოლის სიგრძე არ იცვლებოდეს;
   ლოკალური ასლის წაშლა კონტექსტურ მენიუშია.

   ⚠️ ჩამოტვირთვის ბეჯი ესკიზზე თემის ფერებზეა (§19.5): მზა — `--status-watched`,
   გაჩერებული — `--status-towatch`, ჩავარდნილი — `--destructive`; `rounded-md`.
   ============================================================ */

export interface VideoCardDownload {
  /** თულთიპის ტექსტი — მდგომარეობის ახსნა (`downloadHint`) */
  hint: string
  /** yt-dlp სერვერზე არის */
  available: boolean
  pending: boolean
  onStart: () => void
}

export interface VideoCardProps {
  video: Video
  actions: MenuAction[]
  lang: 'ka' | 'en'
  onOpen: () => void
  onPlay: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  favoritePending?: boolean
  download: VideoCardDownload
}

export function VideoCard({
  video: v,
  actions,
  lang,
  onOpen,
  onPlay,
  onEdit,
  onDelete,
  onToggleFavorite,
  favoritePending,
  download,
}: VideoCardProps) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const thumb = storageUrl(v.thumbnail)
  const running = v.download_status === 'running' && !v.download_stale

  return (
    <RecordContextMenu actions={actions}>
      <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card" data-testid="video-card">
        {/* ⚠️ §35.6 — ფანჯრის გახსნა **ნახვად აღარ ითვლება**: ნახვას დამკვრელი ითვლის ჩართვაზე */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={v.title}
          className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
        >
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">
              <Play className="size-8" />
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
            <Play className="size-10 text-white" />
          </span>
          {v.duration && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs text-white">
              {formatDuration(v.duration)}
            </span>
          )}
          {/* §7.1 — „ეს ლოკალურად მაქვს“ საერთო სიაშიც ჩანს; ფერები თემიდან (§19.5) */}
          {v.download_status && (
            <span
              title={download.hint}
              data-testid="download-badge"
              className={cn(
                'absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-white',
                v.download_status === 'ready' && 'bg-[var(--status-watched)]',
                running && 'bg-black/75',
                v.download_status === 'running' && v.download_stale && 'bg-[var(--status-towatch)]',
                v.download_status === 'failed' && 'bg-destructive',
              )}
            >
              {running ? (
                <Loader2 className="size-3 animate-spin" />
              ) : v.download_status === 'failed' || v.download_stale ? (
                <TriangleAlert className="size-3" />
              ) : (
                <HardDriveDownload className="size-3" />
              )}
              {v.download_status === 'ready'
                ? `${t('videos.local.ready')} · ${formatBytes(v.download_size)}`
                : t(v.download_stale ? 'videos.local.stalled' : `videos.local.${v.download_status}`)}
            </span>
          )}
        </button>

        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={v.title}>
              {v.title}
            </h3>
            <VisitCount value={v.visits_count} />
            {/* Tasks §8 — რჩეული ტექსტით და ფერით; ბარათის სათაურის ზოლში დაბალი ზომა */}
            <FavoriteButton size="xs" active={v.is_favorite} pending={favoritePending} onToggle={onToggleFavorite} />
          </div>

          {/* §19.3 — სამი ბეჯი ერთი ზომით, ზევით-ქვევით მეტი დაშორებით */}
          <VideoBadges video={v} lang={lang} className="my-3" />

          {/* მეტა-ხაზი — ყოველთვის ერთი სტრიქონი; ცარიელიც ადგილს იკავებს */}
          <p
            className="flex min-h-4 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
            data-testid="video-meta"
          >
            {v.channel && (
              <span className="min-w-0 truncate" title={v.channel}>
                {v.channel}
              </span>
            )}
            {v.published_at && (
              <span className="inline-flex shrink-0 items-center gap-1" title={t('fields.name.video.published_at')}>
                <CalendarDays className="size-3" />
                {fmt.date(v.published_at)}
              </span>
            )}
            {v.watch_count > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Eye className="size-3" />
                {v.watch_count}
              </span>
            )}
            {v.watched_at && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock className="size-3" />
                {fmt.date(v.watched_at)}
              </span>
            )}
          </p>

          {/* ტეგების სლოტი — ტეგების გარეშეც ადგილზეა (§19.4) */}
          <div
            className="mt-2 flex min-h-7 flex-wrap items-center gap-1"
            data-testid="video-tags"
            aria-hidden={v.tags.length === 0 || undefined}
          >
            {v.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px]">
                #{tag}
              </span>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-1 border-t border-border pt-2" data-testid="video-actions">
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}
            >
              <ExternalLink className="size-3.5" />
              {t('videos.source')}
            </a>
            {/* §7.2 — რიგში ჩართვა: აქედან **გაფილტრული სია** უკრავს რიგრიგობით */}
            <Button variant="ghost" size="sm" onClick={onPlay} aria-label={t('playback.playFromHere')}>
              <ListVideo className="size-3.5" />
            </Button>

            {/* §7.1/§19.4 — ლოკალური ასლი ერთ ღილაკში; მზაზე — გახსნა, თორემ — ჩამოტვირთვა */}
            {v.download_status === 'ready' ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={videoDownloadUrl(v.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('videos.local.open')}
                    data-testid="download-control"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-[var(--status-watched)]')}
                  >
                    <HardDriveDownload className="size-3.5" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('videos.local.open')} · {download.hint}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={running || download.pending}
                    aria-label={t('videos.local.start')}
                    data-testid="download-control"
                    onClick={download.onStart}
                  >
                    {running ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : v.download_stale ? (
                      /* ⚠️ დამტრიალებელი აქ ტყუილი იქნებოდა — არაფერი ტრიალებს; „ხელახლა სცადე“ */
                      <RotateCcw className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {download.available ? download.hint : t('videos.local.unavailable')}
                </TooltipContent>
              </Tooltip>
            )}

            <Button variant="edit" size="sm" onClick={onEdit}>
              <SquarePen className="size-3.5" />
              {t('actions.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              aria-label={t('actions.delete')}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </article>
    </RecordContextMenu>
  )
}
