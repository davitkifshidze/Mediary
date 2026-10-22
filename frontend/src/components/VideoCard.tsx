import { useTranslation } from 'react-i18next'
import {
  CalendarDays,
  Clock,
  Eye,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Play,
  TriangleAlert,
} from 'lucide-react'
import type { Video } from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { cn, formatBytes } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'
import { openOnClick } from '@/lib/recordClick'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { CardActions } from '@/components/RecordView'
import { VideoBadges } from '@/components/VideoBadges'

/* ============================================================
   **ვიდეოს ბარათი** — `VideosPage`-დან ცალკე გამოვიდა.

   შენი სიტყვები: „თუ აქვს ტეგები, მერე ქვედა რედაქტირება და წყაროები ზოგგან
   მაღლაა, ზოგგან დაბლა — ცარიელი ადგილიც გაითვალისწინეთ, რომ ყველაფერი
   სიმეტრიული იყოს“.

   ⚠️ **სიმეტრია სლოტებითაა და არა პირობებით**: ბარათი
   `flex h-full flex-col`-ია, ბეჯების სტრიქონი ყოველთვის სამია (`VideoBadges`),
   მეტა-ხაზი ყოველთვის ერთი სტრიქონია (`truncate`, ცარიელზეც ადგილს იკავებს),
   ტეგების სლოტი `min-h-7`-ია ტეგების გარეშეც, მოქმედებების ზოლი `mt-auto`-თი
   ქვემოთაა და ყველა კონტროლი `h-9`.

   ⚠️ ჩამოტვირთვის ბეჯი ესკიზზე თემის ფერებზეა: მზა — `--status-watched`,
   გაჩერებული — `--status-towatch`, ჩავარდნილი — `--destructive`; `rounded-md`.

   ⚠️ **ზოლი სიის ბარათების 2×2-ია** (`CardActions`): რჩეული · რედაქტირება /
   წაშლა · „მოქმედება". ჩამოტვირთვა, ლოკალური დაკვრა, წყარო და „აქედან დაკვრა"
   „მოქმედების" მენიუშია (იგივე სია, რაც მარჯვენა ღილაკზე); ჩამოტვირთვის
   მდგომარეობას ესკიზის ბეჯი ამბობს. ბარათზე დაჭერა ნებისმიერ ადგილას ფანჯარას
   ხსნის (`openOnClick`). სვეტები — სიის ბარათების წესით (`RecordList`, ≤ 3).
   ============================================================ */

export interface VideoCardProps {
  video: Video
  actions: MenuAction[]
  lang: 'ka' | 'en'
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  favoritePending?: boolean
  /** ჩამოტვირთვის ბეჯის თულთიპი — მდგომარეობის ახსნა (`downloadHint`) */
  downloadHint: string
}

export function VideoCard({
  video: v,
  actions,
  lang,
  onOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  favoritePending,
  downloadHint,
}: VideoCardProps) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const thumb = storageUrl(v.thumbnail)
  const running = v.download_status === 'running' && !v.download_stale

  return (
    <RecordContextMenu actions={actions}>
      <article
        className="flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card"
        onClick={openOnClick(onOpen)}
        data-testid="video-card"
      >
        {/* ⚠️ ფანჯრის გახსნა **ნახვად აღარ ითვლება**: ნახვას დამკვრელი ითვლის ჩართვაზე */}
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
          {/* „ეს ლოკალურად მაქვს“ საერთო სიაშიც ჩანს; ფერები თემიდან */}
          {v.download_status && (
            <span
              title={downloadHint}
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
          {/* სათაურიც ფანჯარას ხსნის, როგორც ესკიზი */}
          <h3 className="min-w-0 text-sm font-medium">
            <button
              type="button"
              onClick={onOpen}
              title={v.title}
              data-testid="video-title"
              className="block w-full cursor-pointer truncate text-left hover:text-primary"
            >
              {v.title}
            </button>
          </h3>

          {/* სამი ბეჯი ერთი ზომით, ზევით-ქვევით მეტი დაშორებით */}
          <VideoBadges video={v} lang={lang} className="my-3" />

          {/* მეტა-ხაზი — ყოველთვის ერთი სტრიქონი; ცარიელიც ადგილს იკავებს */}
          <p
            className="flex min-h-4 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground"
            data-testid="video-meta"
          >
            {/* კურსი — „საქაღალდე" */}
            {v.course && (
              <span className="inline-flex min-w-0 items-center gap-1" title={v.course.title} data-testid="video-course">
                <FolderOpen className="size-3 shrink-0" />
                <span className="truncate">{v.course.title}</span>
              </span>
            )}
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

          {/* ტეგების სლოტი — ტეგების გარეშეც ადგილზეა */}
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

          {/* 2×2 — რჩეული · რედაქტირება / წაშლა · „მოქმედება" (ჩამოტვირთვა, ლოკალური დაკვრა, წყარო, სტატუსი) */}
          <div className="mt-auto border-t border-border pt-2" data-testid="video-actions">
            <CardActions
              favorite={{ active: v.is_favorite, pending: favoritePending, onToggle: onToggleFavorite }}
              onEdit={onEdit}
              onDelete={onDelete}
              actions={actions}
            />
          </div>
        </div>
      </article>
    </RecordContextMenu>
  )
}
