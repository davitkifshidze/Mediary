import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Film, ImageIcon, Loader2, RotateCcw, UploadCloud, X } from 'lucide-react'
import { uploadPersonalMedia } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { uploadProblem } from '@/lib/pendingUploads'
import { limitFor, limitHint, useUploadLimits } from '@/lib/uploadLimits'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **ფოტოსა და ვიდეოს ატვირთვა მოწყობილობიდან.**

   შენი სიტყვები: „შეგეძლოს ატვირთო ფოტო-ვიდეო მასალა მხოლოდ ამ გალერეაში".

   ⚠️ **სათითაოდ, პროგრესით** (`lib/pendingUploads.ts`-ის წესი): ერთი ფაილი
   ერთ მოთხოვნაში, ერთდროულად ერთი — 300-მეგაბაიტიანი ვიდეო პაკეტში მთელ რიგს
   გააჭედავდა, ერთი ცუდი ფაილი (413 კვოტა, 422 ფორმატი) კი ყველას ჩააგდებდა.
   ჩავარდნილი სიაში რჩება მიზეზით და ხელახლა იცდება.

   ⚠️ **ბრაუზერის შემოწმება სერვერის ლიმიტითაა** (`GET /uploads/limits` —
   `personal_photo` / `personal_video`): ზედმეტად დიდი ვიდეო ატვირთვამდე
   ითქმის და არა 300 მეგაბაიტის გაგზავნის შემდეგ. ფოტო თუ ვიდეო — ამას
   ბრაუზერის `file.type` წყვეტს; ნამდვილ შემოწმებას სერვერი შიგთავსით აკეთებს.

   ⚠️ **ადგილი (ადამიანი/ალბომი) გამომძახებლისაა** — ადამიანის გვერდზე ფოტო
   მას ეკუთვნის, ალბომისაზე — ალბომს (სერვერი ადამიანის ალბომზე ადამიანსაც
   თვითონ სვამს).
   ============================================================ */

type Status = 'pending' | 'uploading' | 'done' | 'error'

interface QueueItem {
  key: number
  file: File
  status: Status
  /** 0–1 */
  progress: number
  error?: string
}

let nextKey = 1

/** ბრაუზერის ტიპით — სერვერი მაინც შიგთავსით წყვეტს */
function kindOf(file: File): 'personal_video' | 'personal_photo' {
  return file.type.startsWith('video/') ? 'personal_video' : 'personal_photo'
}

export function PersonalUploader({
  personId,
  albumId,
  className,
  compact,
}: {
  personId?: number | null
  albumId?: number | null
  className?: string
  /** დაბალი ზონა — ადამიანისა და ალბომის გვერდზე ბადის თავზე */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const limitsQ = useUploadLimits()
  const photoLimit = limitFor(limitsQ.data, 'personal_photo')
  const videoLimit = limitFor(limitsQ.data, 'personal_video')

  const [queue, setQueue] = useState<QueueItem[]>([])
  const busy = useRef(false)
  /** რამდენი ავიდა ბოლო განახლების შემდეგ — სიები ყოველ ფაილზე თავიდან არ იკითხება */
  const sinceRefresh = useRef(0)

  const patch = (key: number, change: Partial<QueueItem>) =>
    setQueue((cur) => cur.map((item) => (item.key === key ? { ...item, ...change } : item)))

  const onDrop = useCallback(
    (files: File[]) => {
      const fresh = files.map((file): QueueItem => {
        const kind = kindOf(file)
        const problem = uploadProblem(file, kind, kind === 'personal_video' ? videoLimit : photoLimit)
        const limit = kind === 'personal_video' ? videoLimit : photoLimit

        return {
          key: nextKey++,
          file,
          progress: 0,
          status: problem ? 'error' : 'pending',
          error:
            problem === 'too_large'
              ? t('uploads.tooLarge', { name: file.name, max: formatBytes(limit?.max_bytes ?? 0) })
              : problem === 'wrong_type'
                ? t('uploads.wrongType', { name: file.name })
                : undefined,
        }
      })

      setQueue((cur) => [...cur, ...fresh])
    },
    [photoLimit, videoLimit, t],
  )

  /* ⚠️ **ერთდროულად ერთი** — შემდეგი მხოლოდ წინას დასრულების შემდეგ; რიგი
     ცოცხალია: ატვირთვის დროს ჩაგდებული ფაილი უბრალოდ ბოლოში დგება. */
  useEffect(() => {
    if (busy.current) return
    const next = queue.find((item) => item.status === 'pending')

    if (!next) {
      if (sinceRefresh.current > 0) {
        sinceRefresh.current = 0
        invalidatePersonal(qc)
      }
      return
    }

    busy.current = true
    patch(next.key, { status: 'uploading', progress: 0, error: undefined })

    uploadPersonalMedia(next.file, { person_id: personId, album_id: albumId }, (fraction) =>
      patch(next.key, { progress: fraction }),
    )
      .then(() => {
        patch(next.key, { status: 'done', progress: 1 })
        sinceRefresh.current += 1
        // დიდ რიგზე სიები შუალედშიც ახლდება — ბადე ცარიელი არ დგას ბოლომდე
        if (sinceRefresh.current >= 10) {
          sinceRefresh.current = 0
          invalidatePersonal(qc)
        }
      })
      .catch((e) => patch(next.key, { status: 'error', error: errorMessage(e) }))
      .finally(() => {
        busy.current = false
        // რიგი თვითონ გადაიხედება — `queue` შეიცვალა
        setQueue((cur) => [...cur])
      })
  }, [queue, personId, albumId, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
  })

  const done = queue.filter((item) => item.status === 'done').length
  const active = queue.filter((item) => item.status !== 'done')

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        data-testid="personal-dropzone"
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted',
          compact ? 'px-4 py-4' : 'px-6 py-10',
          isDragActive && 'border-primary bg-muted',
        )}
      >
        <input {...getInputProps()} data-testid="personal-upload-input" />
        <UploadCloud className={compact ? 'size-5' : 'size-8'} />
        <span className="font-medium text-foreground">
          {t(isDragActive ? 'personal.upload.dropActive' : 'personal.upload.drop')}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3.5" />
            {limitHint(photoLimit, (n) => t('uploads.moreFormats', { count: n }))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Film className="size-3.5" />
            {limitHint(videoLimit, (n) => t('uploads.moreFormats', { count: n }))}
          </span>
          {videoLimit?.capped_by_server && <InfoHint tone="warn" info={t('personal.upload.cappedHint')} />}
        </span>
      </div>

      {(active.length > 0 || done > 0) && (
        <div className="mt-3 rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {t('personal.upload.status', { done, total: queue.length })}
            </span>
            {done > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setQueue((cur) => cur.filter((item) => item.status !== 'done'))}
              >
                {t('personal.upload.clearDone')}
              </Button>
            )}
          </div>

          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {queue.map((item) => (
              <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="personal-upload-row">
                <span className="shrink-0 text-muted-foreground">
                  {item.status === 'uploading' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="size-4 text-destructive" />
                  ) : item.file.type.startsWith('video/') ? (
                    <Film className="size-4" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.file.name}</span>
                  {item.status === 'error' ? (
                    <span className="block truncate text-xs text-destructive">{item.error}</span>
                  ) : (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn('block h-full rounded-full transition-[width]', item.status === 'done' ? 'bg-emerald-500' : 'bg-primary')}
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(item.file.size)}</span>

                {item.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => patch(item.key, { status: 'pending', error: undefined, progress: 0 })}
                  >
                    <RotateCcw className="size-3.5" />
                    {t('personal.upload.retry')}
                  </Button>
                )}
                {(item.status === 'error' || item.status === 'pending') && (
                  <button
                    type="button"
                    onClick={() => setQueue((cur) => cur.filter((row) => row.key !== item.key))}
                    aria-label={t('actions.delete')}
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
