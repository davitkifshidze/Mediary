import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { UploadCloud, X } from 'lucide-react'
import { PosterImage } from './PosterImage'
import { cn } from '@/lib/utils'

/* ============================================================
   სურათის ატვირთვა — preview + drag&drop + ჩანაცვლება/წაშლა.

   Tasks 5.4 — ვიდეოს thumbnail-იც ამ კომპონენტზე გადავიდა, ამიტომ
   ფორმა (`variant`) პარამეტრია: `poster` = 2/3 (ფილმი/სერიალი),
   `wide` = 16/9 (ვიდეო).
   ============================================================ */

const SHAPE = {
  poster: 'aspect-[2/3] w-40',
  wide: 'aspect-video w-64',
} as const

export function PosterUploader({
  preview,
  onSelect,
  onClear,
  variant = 'poster',
  hint,
}: {
  preview: string | null
  onSelect: (file: File) => void
  onClear: () => void
  variant?: keyof typeof SHAPE
  /** ცარიელი მდგომარეობის ტექსტი; default — პოსტერის მინიშნება */
  hint?: string
}) {
  const { t } = useTranslation()
  const onDrop = useCallback(
    (files: File[]) => {
      if (files[0]) onSelect(files[0])
    },
    [onSelect],
  )
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
  })

  const shape = SHAPE[variant]

  if (preview) {
    return (
      <div className={cn('relative', variant === 'wide' ? 'w-64' : 'w-40')}>
        <PosterImage
          src={preview}
          alt="preview"
          className={cn(shape, 'rounded-lg border border-border object-cover')}
        />
        <button
          type="button"
          onClick={onClear}
          aria-label="remove"
          className="absolute right-1.5 top-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-black/60 text-white shadow transition-colors hover:bg-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-3 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-muted',
        shape,
        isDragActive && 'border-primary bg-muted text-foreground',
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className="size-7 opacity-60" />
      <span>{hint ?? t('form.posterHint')}</span>
    </div>
  )
}
