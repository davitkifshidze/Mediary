import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ExternalLink, FileX, HardDriveDownload } from 'lucide-react'
import { deleteVideoDownload, markVideoWatched, videoDownloadUrl, type Video } from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **ლოკალური ასლის დამკვრელი** (Tasks §21.2).

   შენი სიტყვები: „როდესაც ვიდეოს ვიწერ, ის ცალკე ფლეერში იხსნებოდეს".

   ⚠️ **ცალკე მოდალია და არა საერთო დამკვრელი**: ის (`lib/player.tsx`) YouTube-ის
   ემბედისთვისაა და რიგით უკრავს; ჩამოტვირთული ფაილი HTML5 `<video>`-ა —
   Range-ით გადახვევა, ხმა და სისწრაფე ბრაუზერისაა, ქსელის გარეშეც მუშაობს.
   აქამდე `ready`-ზე ბმული ფაილს **ბრაუზერის საკუთარ მნახველში** ხსნიდა
   (`<a target="_blank">`), ე.ი. აპი ტოვებდა.

   ⚠️ **ნახვა აქედანაც ითვლება** (`POST /videos/{id}/watched`) — ჩართვაზე
   ერთხელ, როგორც დამკვრელში; გახსნა ყურება არაა.

   ⚠️ წყარო `videoDownloadUrl()`-ია — პრივატული დისკი, მფლობელობით შემოწმებული
   მარშრუტი, `SafeMime` + 206 (§6.4/§21.1). `artisan serve` ერთნაკადიანია და
   დიდი ფაილის სტრიმი dev-ზე API-ს აყოვნებს — ეს dev-სერვერის ზღვარია.
   ============================================================ */

export function LocalVideoPlayer({
  video,
  onClose,
  onRemoved,
}: {
  video: Video
  onClose: () => void
  /** ფაილი წაიშალა — მშობელმა ფანჯარა/სია უნდა განაახლოს */
  onRemoved?: () => void
}) {
  const { t } = useTranslation()
  const { date } = useDateFormat()
  const confirm = useConfirm()
  const { toast } = useToast()
  const qc = useQueryClient()
  const counted = useRef(false)

  const remove = useMutation({
    mutationFn: () => deleteVideoDownload(video.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['videos'] })
      toast({ title: t('videos.local.removed'), variant: 'success' })
      onRemoved?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const askRemove = async () => {
    const ok = await confirm({
      title: t('videos.local.removeTitle'),
      description: t('videos.local.removeHint', { name: video.title, size: formatBytes(video.download_size) }),
      variant: 'destructive',
    })
    if (ok) remove.mutate()
  }

  // ჩართვაზე ერთხელ — ზუსტად ის წესი, რაც საერთო დამკვრელს აქვს
  const onPlay = () => {
    if (counted.current) return
    counted.current = true
    markVideoWatched(video.id)
      .then(() => qc.invalidateQueries({ queryKey: ['videos'] }))
      .catch(() => {})
  }

  const poster = storageUrl(video.thumbnail)

  return (
    <ModalShell title={video.title} onClose={onClose} size="full" hint={t('videos.local.playerHint')}>
      <div className="mt-4 overflow-hidden rounded-lg bg-black">
        <video
          controls
          autoPlay
          playsInline
          src={videoDownloadUrl(video.id)}
          poster={poster ?? undefined}
          className="aspect-video w-full"
          onPlay={onPlay}
          data-testid="local-video"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <HardDriveDownload className="size-4" />
            {formatBytes(video.download_size)}
          </span>
          {video.download_format && <span>{video.download_format}</span>}
          {video.downloaded_at && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {t('videos.local.downloadedAt', { date: date(video.downloaded_at) })}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <ExternalLink className="size-4" />
            {t('videos.source')}
          </a>
          <Button variant="destructiveOutline" size="sm" disabled={remove.isPending} onClick={() => void askRemove()}>
            <FileX className="size-4" />
            {t('videos.local.remove')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
