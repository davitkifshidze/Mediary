import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCheck, CheckCircle2, Film, ImageIcon, Loader2, RotateCcw, Upload, UploadCloud, X } from 'lucide-react'
import { uploadPersonalMedia } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent, useModules } from '@/lib/modules'
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

   ⚠️ **ადგილი (პიროვნება/ალბომი) გამომძახებლისაა** — პიროვნების გვერდზე ფოტო
   მას ეკუთვნის, ალბომისაზე — ალბომს (სერვერი პიროვნების ალბომზე პიროვნებასაც
   თვითონ სვამს).

   ⚠️ **ზონა აღარ არის** („დიდი ღილაკი ჩააგდე… არ მომწონს"): ფაილს ირჩევს
   ერთი „ატვირთვა" ღილაკი (`PersonalUploadButton` → `ref.open()`), ხოლო
   **მთელი შიგთავსი** (`children` — ბადე, ჩანართები) გადათრევის სამიზნეა —
   გადათრევისას ზემოდან მოდულის ფერის ნახევრად გამჭვირვალე „გაუშვი აქ"
   ფარავს. რიგი კომპაქტური პანელია შიგთავსის თავზე და მხოლოდ მაშინ ჩანს,
   როცა რამე ტვირთავს ან აიტვირთა; ფორმატები და ზღვრები ღილაკის `i`-შია.
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

/** რას აძლევს ატვირთვა გარეთ — ღილაკი ფაილის ამრჩევს ამით ხსნის */
export interface PersonalUploaderHandle {
  open: () => void
}

let nextKey = 1

/** ბრაუზერის ტიპით — სერვერი მაინც შიგთავსით წყვეტს */
function kindOf(file: File): 'personal_video' | 'personal_photo' {
  return file.type.startsWith('video/') ? 'personal_video' : 'personal_photo'
}

export function PersonalUploader({
  ref,
  personId,
  albumId,
  className,
  children,
}: {
  ref?: Ref<PersonalUploaderHandle>
  personId?: number | null
  albumId?: number | null
  className?: string
  /** გადათრევის სამიზნე — ბადე/ჩანართები; რიგის პანელი მის თავზე დგება */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { all } = useModules()
  const limitsQ = useUploadLimits()
  const photoLimit = limitFor(limitsQ.data, 'personal_photo')
  const videoLimit = limitFor(limitsQ.data, 'personal_video')
  const color = all.find((m) => m.key === 'personal')?.color

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

  /* ⚠️ `noClick`/`noKeyboard` — შიგთავსზე დაჭერა ფოტოს ხსნის და არა ფაილის
     ამრჩევს; ამრჩევს მხოლოდ ღილაკი ხსნის (`open`) */
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
  })

  useImperativeHandle(ref, () => ({ open }), [open])

  const done = queue.filter((item) => item.status === 'done').length

  return (
    <div {...getRootProps({ className: cn('relative', className) })} data-testid="personal-drop-target">
      <input {...getInputProps()} data-testid="personal-upload-input" />

      {/* ---------- რიგი — კომპაქტური პანელი შიგთავსის თავზე ---------- */}
      {queue.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card" data-testid="personal-upload-queue">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('personal.upload.status', { done, total: queue.length })}</span>
            {done > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQueue((cur) => cur.filter((item) => item.status !== 'done'))}
              >
                <CheckCheck className="size-4" />
                {t('personal.upload.clearDone')}
              </Button>
            )}
          </div>

          <ul className="fb-scroll max-h-48 divide-y divide-border overflow-y-auto">
            {queue.map((item) => (
              <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="personal-upload-row">
                <span className="shrink-0 text-muted-foreground">
                  {item.status === 'uploading' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="size-4 text-[var(--icon-ok)]" />
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
                        className={cn(
                          'block h-full rounded-full transition-[width]',
                          item.status === 'done' ? 'bg-[var(--icon-ok)]' : 'bg-primary',
                        )}
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(item.file.size)}</span>

                {item.status === 'error' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch(item.key, { status: 'pending', error: undefined, progress: 0 })}
                  >
                    <RotateCcw className="size-4" />
                    {t('personal.upload.retry')}
                  </Button>
                )}
                {(item.status === 'error' || item.status === 'pending') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQueue((cur) => cur.filter((row) => row.key !== item.key))}
                  >
                    <X className="size-4" />
                    {t('personal.upload.remove')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      {/* ---------- გადათრევა — მთელ სამიზნეზე, მოდულის ფერით ---------- */}
      {isDragActive && (
        <div
          style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
          className="pointer-events-none absolute inset-0 z-10 grid min-h-32 place-items-center rounded-xl border-2 border-dashed border-[var(--mod)] bg-[var(--mod-soft)] backdrop-blur-[1px]"
          data-testid="personal-drop-overlay"
        >
          <span className="flex items-center gap-2 rounded-md bg-background/90 px-4 py-2 text-sm font-medium text-[var(--mod)] shadow-sm">
            <UploadCloud className="size-5" />
            {t('personal.upload.dropActive')}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * **„ატვირთვა" — ერთი ღილაკი ყველგან** (პიროვნება, ალბომი, `/personal`-ის
 * ფანჯარა), ფორმატები და ზღვრები მის `i`-შია. რას აკეთებს დაჭერა,
 * გამომძახებელი წყვეტს: გვერდზე ფაილის ამრჩევს ხსნის, `/personal`-ზე — ფანჯარას.
 */
export function PersonalUploadButton({ onClick, size }: { onClick: () => void; size?: 'sm' }) {
  const { t } = useTranslation()
  const limitsQ = useUploadLimits()
  const photoLimit = limitFor(limitsQ.data, 'personal_photo')
  const videoLimit = limitFor(limitsQ.data, 'personal_video')
  const more = (n: number) => t('uploads.moreFormats', { count: n })

  return (
    <span className="inline-flex items-center gap-1.5">
      <Button type="button" size={size} onClick={onClick}>
        <Upload className="size-4" />
        {t('actions.upload')}
      </Button>
      <InfoHint
        tone={videoLimit?.capped_by_server ? 'warn' : undefined}
        info={
          <>
            <span className="block">{t('personal.upload.photoLimit', { limit: limitHint(photoLimit, more) })}</span>
            <span className="block">{t('personal.upload.videoLimit', { limit: limitHint(videoLimit, more) })}</span>
            {videoLimit?.capped_by_server && <span className="mt-1 block">{t('personal.upload.cappedHint')}</span>}
          </>
        }
      />
    </span>
  )
}
