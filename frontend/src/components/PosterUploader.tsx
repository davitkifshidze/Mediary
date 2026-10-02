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

   ⚠️ **`fill` — ყუთის სიმაღლე ზუსტად გვერდითა ველების სიმაღლეა** (Tasks §14.1).
   შენი სიტყვები: „სიმღერებში ასატვირთის სიმაღლე იგივე იყოს, რაც ის სამი
   სტრიქონია — ინფუთების სიმეტრიები დაიცავი ყველგან". `FormSection`-ის
   მედია-სვეტი `sm:items-stretch`-ია, ყუთი `sm:h-full`-ით მას ავსებს, სიგანე
   კი `aspect-ratio`-დან გამოითვლება (2:3 ან 16:9; ფართო `max-w`-ით
   იკვეცება და ფოტო `object-cover`-ით ივსება). ვიწრო ეკრანზე, სადაც სვეტი
   ველებს ზემოდან ადგება, ფიქსირებული ზომები რჩება. ⚠️ `sm:min-h-40` —
   ორველიანი ფორმა (ბუკმარკი) ყუთს ბეჭდის ზომამდე არ დაპატარავებს.
   ============================================================ */

const SHAPE = {
  poster: 'aspect-[2/3] w-40',
  wide: 'aspect-video w-64',
} as const

/** `fill`: ვიწროზე იგივე ფიქსირებული ზომა, `sm`-დან — სიმაღლე მეზობლებისაა, სიგანე პროპორციიდან */
const FILL = {
  poster: 'aspect-[2/3] w-40 sm:h-full sm:min-h-40 sm:w-auto',
  wide: 'aspect-video w-64 sm:h-full sm:min-h-40 sm:w-auto sm:max-w-xs',
} as const

export function PosterUploader({
  preview,
  onSelect,
  onClear,
  variant = 'poster',
  hint,
  fill = false,
}: {
  preview: string | null
  onSelect: (file: File) => void
  onClear: () => void
  variant?: keyof typeof SHAPE
  /** ცარიელი მდგომარეობის ტექსტი; default — პოსტერის მინიშნება */
  hint?: string
  /** Tasks §14.1 — ყუთი გვერდითა ველების სიმაღლეს იღებს (`FormSection media`) */
  fill?: boolean
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

  const shape = fill ? FILL[variant] : SHAPE[variant]

  if (preview) {
    return (
      <div className={cn('relative', shape)} data-testid="poster-preview">
        <PosterImage src={preview} alt="preview" className="size-full rounded-lg border border-border object-cover" />
        <button
          type="button"
          onClick={onClear}
          aria-label="remove"
          className="absolute right-1.5 top-1.5 grid size-7 cursor-pointer place-items-center rounded-md bg-black/60 text-white shadow transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      data-testid="poster-dropzone"
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
