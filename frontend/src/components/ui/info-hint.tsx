import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { AlertTriangle, Info } from 'lucide-react'
import { LAYER_TOOLTIP } from '@/lib/layers'
import { cn } from '@/lib/utils'

/* ============================================================
   **ინფო-აიქონი ტექსტის ნაცვლად** (Tasks §3).

   შენი სიტყვები: „ამ ინფორმაციებს ჯობს გვერდზე აიქონი და ტულტიპები; თუ
   რამე კრიტიკულია, წითელი აიქონი იყოს, თუ რამე საინფორმაციო — ლურჯი
   აიქონი, i. შეიძლება ორივე იყოს ერთზე და ორივეზე სხვადასხვა
   დამოუკიდებელი ინფორმაცია ისახებოდეს".

   ⚠️ **`Tooltip`-ზე ვერ აშენდებოდა და ეს გადამოწმებულია დაყენებულ
   წყაროში.** `@radix-ui/react-tooltip` შეხებას პირდაპირ აგდებს
   (`pointerType === "touch"` → `return`), `onPointerDown` ხურავს და
   დარაჯს აყენებს, `onClick` ხურავს — ე.ი. **ტელეფონზე დაჭერა არაფერს
   ხსნის**. ტექსტის ტულტიპში გადატანა იქ ტექსტის დაკარგვა იქნებოდა.
   `Popover` ორივეს პასუხობს: ჰოვერსაც და დაჭერასაც.

   ⚠️ **ორი მითითებისას ორი მეზობელი ტრიგერი იხატება** (ჯერ წითელი, მერე
   ლურჯი), თითოს **თავისი** popover — ზუსტად „ორივეზე სხვადასხვა
   დამოუკიდებელი ინფორმაცია". ერთ ტულტიპში ორი აბზაცი სხვა რამეა.

   ⚠️ **განსხვავება ფიგურაშია და არა მხოლოდ ფერში** — სამკუთხედი ↔ წრე.
   ფერი დალტონიკს არაფერს ეუბნება (პროექტის საკუთარი წესი როლების
   სამუშაოდან).

   ⚠️ **ლურჯი უფასოა, წითელს კლასი სჭირდება.** `index.css`-ის
   `@layer base` `.lucide-info`-ს `--icon-info`-ს (ლურჯს) აძლევს, ხოლო
   `.lucide-triangle-alert`-ს **ქარვისფერს** — ბაზური ფენა ნაგულისხმევია
   და კომპონენტის კლასი მას გადაფარავს, სწორედ ამისთვის არსებობს ეს
   ასიმეტრია.

   ⚠️ **lucide-ის კლასი ხატულის id-ია და არა React-ის სახელი**:
   `AlertTriangle` → `lucide-triangle-alert`. ამ შეცდომამ სამი წესი უკვე
   ჩუმად მოკლა ერთხელ.

   ⚠️ **`onOpenAutoFocus` ჩერდება.** `Popover` ფოკუსს იტაცებს — ეს უკვე
   ჩაწერილია `GlobalSearch`-ში („ამიტომ იქ `Popover` არ გამოიყენება:
   ფოკუსს იტაცებს და აკრეფას წყვეტს"). ჰოვერზე გახსნილი ახსნა ხომ ვერ
   წაგართმევს კურსორს იმ ველიდან, სადაც წერ.

   ⚠️ **`modal={false}`** (იგივე, რაც `ActionMenu`-ს) — ფოკუსის ხაფანგი
   და `<body>`-ზე `pointer-events: none` არ ჩნდება, ე.ი. მოდალის
   შიგნითაც მუშაობს.

   ⚠️ **პროპად უკვე ნათარგმნი ტექსტი მიდის და არასდროს გასაღები** —
   თორემ i18n აუდიტის „გასაღებისმაგვარი ლიტერალი `t()`-ს გარეთ"
   შემოწმება ჩავარდებოდა.

   ⚠️ **ცარიელზე არაფერი იხატება** — `lib/fields.ts`-ის არსებული წესი:
   ცარიელი ტულტიპი აიქონის უქონლობაზე უარესია.
   ============================================================ */

type Side = 'top' | 'right' | 'bottom' | 'left'

function Hint({
  text,
  critical,
  label,
  side,
  className,
}: {
  text: ReactNode
  critical: boolean
  label: string
  side: Side
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={cn(
          'inline-grid size-4 shrink-0 cursor-help place-items-center rounded-md align-text-bottom transition-colors',
          critical ? 'hover:bg-destructive/15' : 'hover:bg-muted',
          className,
        )}
      >
        {critical ? (
          <AlertTriangle className="size-3.5 text-destructive" />
        ) : (
          <Info className="size-3.5" />
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          /* ⚠️ კურსორი შიგთავსშიც უნდა შევიდეს — გრძელი ახსნა იკითხება
             და ზოგჯერ კოპირდება; `onMouseLeave` მხოლოდ ტრიგერზე რომ
             ყოფილიყო, ტექსტამდე მისვლისას დაიხურებოდა. */
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            LAYER_TOOLTIP,
            'fb-content max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md focus:outline-none',
          )}
        >
          {text}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export function InfoHint({
  info,
  critical,
  side = 'top',
  className,
}: {
  /** ლურჯი `i` — ახსნა. **უკვე ნათარგმნი ტექსტი**, არასდროს გასაღები. */
  info?: ReactNode
  /** წითელი სამკუთხედი — კრიტიკული. **უკვე ნათარგმნი ტექსტი**. */
  critical?: ReactNode
  side?: Side
  className?: string
}) {
  const { t } = useTranslation()

  if (!info && !critical) return null

  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {/* სიმძიმე წინ მიდის — ჯერ წითელი, მერე ლურჯი */}
      {critical && (
        <Hint text={critical} critical label={t('common.warning')} side={side} className={className} />
      )}
      {info && (
        <Hint text={info} critical={false} label={t('common.info')} side={side} className={className} />
      )}
    </span>
  )
}
