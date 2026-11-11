import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   **ფოტოს ქვედა ზოლი** — მოქმედებები ფოტოს ქვედა კიდეზე, ერთ რიგში.

   ადრე „შეცვლა" და „წაშლა" ფოტოს შუაში, ერთმანეთის ქვეშ იდგა მთელ ფოტოზე
   გადაფარებულ მუქ ფენაზე — ფოტო აღარ ჩანდა და შუაში დაჭერა არაფერს აკეთებდა.
   ახლა მუქი მხოლოდ ქვედა ზოლია, შუა კი თავისუფალია (`PhotoEye` — გადიდება).

   ⚠️ **ერთი განსაზღვრება ორივე ადგილას**: ფორმის მთავარი ფოტო
   (`PosterUploader`) და ბადის ფილა (`RecordView`). ხილვადობას `index.css`
   მართავს (`.fb-photo-host` → `.fb-photo-bar`, `.fb-photo-eye`): ჰოვერზე,
   ფოკუსზე და ღია მენიუსთან ჩანს, **სენსორულ ეკრანზე — ყოველთვის** (იქ ჰოვერი
   არ არსებობს და პირველი შეხება მხოლოდ „გამოაჩენდა"). დამალული ზოლი
   შეხებას არ იღებს — უხილავ „წაშლაზე" შემთხვევით ვერ დააჭერ.

   ⚠️ მასპინძელს (`relative` ელემენტი ფოტოთი) `PHOTO_HOST` კლასი უნდა ეწეროს.
   ============================================================ */

/** მასპინძლის კლასი — მასზე ჰოვერი ზოლს აჩენს */
export const PHOTO_HOST = 'fb-photo-host'

const LAYOUT = {
  /** ორი თანაბარი ღილაკი — „შეცვლა" · „წაშლა" */
  halves: 'grid-cols-2',
  /** წამყვანი ღილაკი და მის გვერდით პატარა აიქონ-ღილაკი — „რედაქტირება" · ⋯ */
  lead: 'grid-cols-[minmax(0,1fr)_auto]',
} as const

export function PhotoBar({
  layout = 'halves',
  className,
  children,
  ...rest
}: {
  layout?: keyof typeof LAYOUT
  className?: string
  children: ReactNode
  'data-testid'?: string
}) {
  return (
    <div
      className={cn(
        'fb-photo-bar absolute inset-x-0 bottom-0 grid gap-1 bg-black/60 p-1',
        // ღილაკები უჯრას ავსებს; ვიწრო ფოტოზე შიგნითა დაშორება მცირდება, რომ წარწერა ჩაეტიოს
        '[&>*]:min-w-0 [&>*]:px-1.5',
        LAYOUT[layout],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/** ფოტოს შუაში — თვალი, რომელიც ფოტოს დიდად ხსნის */
export function PhotoEye({ label, className, ...rest }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        // მუქი ფირფიტა ფოტოზე კონტრასტისთვისაა და ჰოვერზე არ იცვლება — აიქონის ჰოვერი მხოლოდ აიქონზე ჩანს
        'fb-photo-eye absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md bg-black/55 text-white',
        className,
      )}
      {...rest}
    >
      <Eye className="size-5" />
    </button>
  )
}
