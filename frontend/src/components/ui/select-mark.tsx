import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   **მონიშვნის ნიშანი — ერთი ყუთი ყველგან.**

   ვებ-ფოტოს ძებნა, ფოტო-ბადის მონიშვნა, იმპორტის ნიშნები, სერიები და სეზონის
   „ყველა ნანახია" ამ ერთ კომპონენტს ხატავს; ადრე ყუთი ოთხ ადგილას ცალ-ცალკე
   იყო დაწერილი — ოთხი ზომით, ოთხი ფერით და ორგან საერთოდ სხვა აიქონით.

   ⚠️ **მონიშნული — თეთრი ✓ ფერად ყუთში** (`--mark`, ორივე თემაში თავისი
   მნიშვნელობით). თემის `primary` აქ არ გამოდგება: მუქ თემაში ის ღიაა და ✓
   მუქი გამოდიოდა.

   ⚠️ **ჰოვერზე ✓ აღარ მწვანდება.** `index.css`-ის ზოგადი წესი ნებისმიერ
   ღილაკში `lucide-check`-ს ამწვანებს და ადიდებს („დადასტურება"); მონიშვნის
   ნიშანი კი დადასტურება არ არის. აიქონებს `transition-transform` აწერია —
   სწორედ ეს არის ზოგადი წესებიდან გამოსვლის ნიშანი (იხ. `index.css`).

   ⚠️ **თუ დაჭერა მონიშვნას მოხსნის — ჰოვერზე წითელი ✕.** ნიშანი თვითონ არ
   იცის, სად დგას: წესი `index.css`-შია და ნებისმიერ დასაჭერ წინაპარზე მუშაობს
   (ღილაკი, ბმული, `label`, ან `fb-mark-host` კლასიანი ფილა). გამორთულ
   ღილაკში ✕ არ ჩანს — იქ დაჭერა არაფერს ხსნის.
   ============================================================ */

const SIZES = {
  /** სტრიქონში და ტექსტიან ღილაკში */
  sm: { box: 'size-5', icon: 'size-3.5' },
  /** ფოტოს ფილაზე */
  md: { box: 'size-6', icon: 'size-4' },
} as const

export function SelectMark({
  checked,
  size = 'md',
  onPhoto = false,
  className,
}: {
  checked: boolean
  size?: keyof typeof SIZES
  /** მოუნიშნავი ყუთი ფოტოზე დგას — ნათელი ჩარჩო მუქ ფონზე, რომ ნებისმიერ სურათზე ჩანდეს */
  onPhoto?: boolean
  className?: string
}) {
  const { box, icon } = SIZES[size]

  return (
    <span
      data-select-mark={checked ? 'on' : 'off'}
      className={cn(
        'grid shrink-0 place-items-center rounded-md border transition-colors',
        box,
        checked ? 'fb-mark-on' : onPhoto ? 'border-white/70 bg-black/40' : 'border-border bg-background/90',
        className,
      )}
    >
      {checked && (
        <>
          <Check className={cn('fb-mark-check transition-transform', icon)} />
          <X className={cn('fb-mark-x transition-transform', icon)} />
        </>
      )}
    </span>
  )
}
