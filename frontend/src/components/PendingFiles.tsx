import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, FileText, Loader2, Trash2, Upload, type LucideIcon } from 'lucide-react'
import type { UploadKind } from '@/api/account'
import { acceptFor, uploadProblem, type PendingUpload, type PendingUploads } from '@/lib/pendingUploads'
import { limitFor, useUploadLimits } from '@/lib/uploadLimits'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FormSection } from '@/components/ui/form-layout'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ფაილები ჩანაწერის შექმნისთანავე** (Tasks §29.3) — კურსისა და ადგილის ფორმაში.

   ჩანაწერების §23.4-ის იგივე პატერნი (`lib/pendingUploads.ts`): ფაილი
   შენახვამდე ბრაუზერშია, შენახვისას ჯერ ჩანაწერი იქმნება, მერე ფაილები
   **სათითაოდ**; ჩავარდნილი სიაში რჩება მიზეზით და ფანჯარა ღია რჩება.

   ⚠️ **მხოლოდ ახალ ჩანაწერზე**: არსებულს ფაილები დეტალის ფანჯარაში აქვს
   (ატვირთვა, ნახვა, წაშლა) — ფორმაში მეორე, განსხვავებული ასლი არ სჭირდება.

   ⚠️ ბრაუზერის შემოწმება სერვერის იგივე ლიმიტით (`uploadProblem`) — ზედმეტად
   დიდი ან სხვა ფორმატის ფაილი შენახვამდე სახელდება და არა შექმნის შემდეგ.
   ============================================================ */

export interface PendingKind<K extends string> {
  kind: K
  label: string
  icon: LucideIcon
  /** რომელი ლიმიტი ვრცელდება — სერვერის სახეობა, როცა ფაილის სახეობა მას არ უდრის (სერტიფიკატი → `doc`) */
  limit?: UploadKind
}

export function PendingFilesSection<K extends string>({
  pending,
  kinds,
  title,
  hint,
}: {
  pending: PendingUploads<K>
  kinds: PendingKind<K>[]
  title: string
  hint?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data: limits } = useUploadLimits()

  const limitOf = (entry: PendingKind<K>) => limitFor(limits, entry.limit ?? (entry.kind as UploadKind))

  const pick = (entry: PendingKind<K>, files: File[]) => {
    const { kind } = entry
    const limit = limitOf(entry)
    const ok: File[] = []

    for (const file of files) {
      const problem = uploadProblem(file, kind, limit)

      if (problem) {
        toast({
          title: t(problem === 'too_large' ? 'uploads.tooLarge' : 'uploads.wrongType', {
            name: file.name,
            max: limit ? formatBytes(limit.max_bytes) : '',
          }),
          variant: 'error',
        })
      } else {
        ok.push(file)
      }
    }

    if (ok.length) pending.add(kind, ok)
  }

  return (
    <FormSection title={title} hint={hint} plain>
      <div className="space-y-3" data-testid="pending-files">
        {kinds.map((entry) => {
          const { kind, label, icon: Icon } = entry
          const items = pending.of(kind)

          return (
            <div key={kind} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                  {items.length > 0 && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs leading-none tabular-nums">{items.length}</span>
                  )}
                </span>
                <PickButton accept={acceptFor(kind, limitOf(entry))} onPicked={(files) => pick(entry, files)} />
              </div>

              {items.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {items.map((item) => (
                    <PendingRow key={item.key} item={item} onRemove={() => pending.remove(item.key)} />
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        <p className="text-xs text-muted-foreground">{t('uploads.pendingHint')}</p>
      </div>
    </FormSection>
  )
}

/** ფაილის ღილაკი + დამალული `<input>` */
function PickButton({ accept, onPicked }: { accept: string | undefined; onPicked: (files: File[]) => void }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
        <Upload className="size-3.5" />
        {t('uploads.pick')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={accept}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) onPicked(picked)
          e.target.value = ''
        }}
      />
    </>
  )
}

function PendingRow<K extends string>({ item, onRemove }: { item: PendingUpload<K>; onRemove: () => void }) {
  const { t } = useTranslation()

  return (
    <li className="rounded-md border border-border px-2 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        {item.status === 'uploading' ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : item.preview ? (
          <img src={item.preview} alt="" className="size-8 shrink-0 rounded-md object-cover" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(item.file.size)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive"
          disabled={item.status === 'uploading'}
          onClick={onRemove}
          aria-label={t('actions.delete')}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {item.status === 'error' && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {item.error}
        </p>
      )}
    </li>
  )
}
