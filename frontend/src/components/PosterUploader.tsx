import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useTranslation } from 'react-i18next'
import { ImageUp, Trash2 } from 'lucide-react'
import { PosterImage } from './PosterImage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   მთავარი ფოტოს ჩარჩო — preview + drag&drop + შეცვლა/წაშლა.

   Tasks 5.4 — ვიდეოს მთავარი ფოტოც ამ კომპონენტზე გადავიდა, ამიტომ
   ფორმა (`variant`) პარამეტრია: `poster` = 2/3 (ფილმი/სერიალი/წიგნი),
   `wide` = 16/9 (ვიდეო და დანარჩენები).

   ## Tasks §38 — „ფოტო უზარმაზარია და ყველაფერს რევს"
   ⚠️ **`fill` — ჩარჩო ზომას აღარ იგონებს.** §14.1-ის ჩარჩო `sm:h-full`-ით
   მთელი სვეტის სიმაღლეს იღებდა (ლეიბლის ქვემოთ — ~26 px-ით სცდებოდა და
   შემდეგი სექციის სათაურს ფარავდა), სიგანეს პროპორციიდან ითვლიდა (ველებს
   ეკვროდა) და ფოტოს ბუნებრივ ზომას სვეტზე უშვებდა (TMDB-ის `w500` →
   ~500×750). ახლა სვეტის სიგანე ფიქსირებულია (`MediaRow`, `form-layout`),
   ჩარჩო კი `sm`-დან **`absolute inset-0`**-ია: რიგის სიმაღლეს მხოლოდ ველები
   წყვეტენ, ჩარჩო ლეიბლის ქვემოთ დარჩენილს ავსებს და ფოტო `object-cover`-ით
   ჩარჩოში ჩანს. ვიწრო ეკრანზე (სვეტი ველებს ზემოდან ადგება) ფიქსირებული
   ფორმა რჩება.
   ⚠️ **ფოტოიან ჩარჩოს ჰოვერზე „შეცვლა" და „წაშლა" აქვს** (§38.5; ადრე
   მხოლოდ ✕ — შესაცვლელად ჯერ უნდა წაგეშალა), ახალი ფაილი კი ჩარჩოზე
   ჩაგდებითაც ცვლის. ⚠️ დაფარული ღილაკები `pointer-events-none`-ია: სენსორულ
   ეკრანზე პირველი შეხება მხოლოდ აჩენს მათ — უხილავ „წაშლაზე" შემთხვევით
   არ დააჭერ.
   ============================================================ */

const SHAPE = {
  poster: 'aspect-[2/3] w-40',
  wide: 'aspect-video w-64',
} as const

/** `fill`: `sm`-დან ჩარჩო `MediaRow`-ის სვეტის დარჩენილ სიმაღლეს ავსებს */
const FILL = 'sm:absolute sm:inset-0 sm:aspect-auto sm:w-auto'

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
  /** ცარიელი ჩარჩოს მეორე, პატარა ხაზი (მაგ. „თუ არ ატვირთე, BGG-დან ჩამოვა") */
  hint?: string
  /** Tasks §38 — ჩარჩო `MediaRow`-ის სვეტს ავსებს (ველების სიმაღლე − ლეიბლი) */
  fill?: boolean
}) {
  const { t } = useTranslation()
  const onDrop = useCallback(
    (files: File[]) => {
      if (files[0]) onSelect(files[0])
    },
    [onSelect],
  )
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    // ფოტოიან ჩარჩოზე დაჭერა არაფერს ხსნის — ამისთვის „შეცვლაა"; ჩაგდება კი მუშაობს
    noClick: !!preview,
    noKeyboard: !!preview,
  })

  const shape = cn(SHAPE[variant], fill && FILL)

  if (preview) {
    return (
      <div
        {...getRootProps()}
        className={cn('group relative overflow-hidden rounded-lg border border-border', shape, isDragActive && 'border-primary')}
        data-testid="poster-preview"
      >
        <input {...getInputProps()} />
        <PosterImage src={preview} alt="preview" className="size-full object-cover" />

        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-2 text-center opacity-0 transition-opacity',
            'group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
            isDragActive && 'opacity-100',
          )}
        >
          {isDragActive ? (
            <span className="text-xs font-medium text-white">{t('form.photoDropReplace')}</span>
          ) : (
            <>
              <Button type="button" variant="edit" size="sm" className="bg-background" onClick={open}>
                <ImageUp className="size-3.5" />
                {t('form.photoChange')}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={onClear} aria-label="remove">
                <Trash2 className="size-3.5" />
                {t('actions.delete')}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      data-testid="poster-dropzone"
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-3 text-center text-xs text-muted-foreground transition-colors hover:border-primary',
        shape,
        isDragActive && 'border-primary bg-muted text-foreground',
      )}
    >
      <input {...getInputProps()} />
      <ImageUp className="mb-0.5 size-7 opacity-60" />
      <span className="font-medium text-foreground">{t('form.photoDrop')}</span>
      {hint && <span className="text-[11px] leading-snug">{hint}</span>}
    </div>
  )
}
