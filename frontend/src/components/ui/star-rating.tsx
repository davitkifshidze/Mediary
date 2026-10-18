import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRating, RATING_MAX, RATING_STARS, starFill } from '@/lib/rating'
import { Badge, type BadgeSize } from '@/components/ui/badge'

/* ============================================================
   **„ჩემი ქულა" ვარსკვლავებით — ჩვენება** (მინიჭება — `RatingSelect`).

   შენი სიტყვები: „ყველგან ჩემი ქულა ისე იყოს, როგორც წიგნებშია —
   ვარსკვლავები; და ასევე იყოს საშუალება შენი ხელითაც გაწერო, მაგალითად არ
   გინდა მთელი რიცხვი — იწერ, ვარსკვლავი ივსება და მერე ეწეროს 4.6 / 10".

   ⚠️ **ფორმის ვიჯეტი (`StarRating`: ხუთი ვარსკვლავი ნახევრებით +
   რიცხვითი ველი) წაიშალა**: „ფილმებზე ქულების მინიჭება არის საშინელება — მინდოდა
   ყოფილიყო სელექთი". მინიჭება ახლა `ui/rating-select.tsx`-ია; აქ ჩვენება რჩება:
   - `RatingStars` — დეტალის თავში: იგივე ვარსკვლავები მხოლოდ საკითხავად + „4.6 / 10";
   - `RatingBadge` — სტრიქონსა და ბარათზე: „★ 4.6" ერთი ზომით (`Badge`).

   ⚠️ **მეათედიც ივსება** — ვარსკვლავი ორი ფენაა: ნაცრისფერი კონტური და
   ზემოდან ოქროსფერი შევსებული, `clip-path: inset()`-ით მოჭრილი იმდენზე,
   რამდენიც ქულაა (4.6 → მესამე ვარსკვლავის 30 %). ნახევარი და მეათედი
   ერთნაირად იხატება, ე.ი. ხელით ჩაწერილი 4.6 და დაჭერით მიღებული 4.0 ერთი
   და იმავე ენაზე ჩანს.

   ⚠️ **ვარსკვლავებს `transition-transform` აქვთ** — ეს `index.css`-ის
   ზოგადი `.lucide-star` ჰოვერ-ანიმაციისა და ფერის **გამორთვის სახელურია**
   (`:not(.transition-transform)`): ქულის ვარსკვლავი უკვე ფერადია და ხტუნვა
   შევსებას დაფარავდა.

   ⚠️ **ნული და ცარიელი „ქულის გარეშეა"** — backend-ის `Rating::normalize()`-ის
   იგივე წესი; ასეთზე არაფერი იხატება.
   ============================================================ */

type StarSize = 'xs' | 'sm' | 'md' | 'lg'

const STAR_SIZE: Record<StarSize, string> = {
  xs: 'size-3.5',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
}

/** ერთი ვარსკვლავი: კონტური + შევსების ფენა `fill` წილით (0…1) */
function StarIcon({ fill, className }: { fill: number; className?: string }) {
  return (
    <span className={cn('relative inline-block shrink-0', className)} aria-hidden="true">
      <Star className="transition-transform size-full text-muted-foreground/40" />
      {fill > 0 && (
        <Star
          data-testid="star-fill"
          className="transition-transform absolute inset-0 size-full fill-current text-gold"
          style={{ clipPath: `inset(0 ${Math.round((1 - fill) * 1000) / 10}% 0 0)` }}
        />
      )}
    </span>
  )
}

function Stars({ value, size, className }: { value: number | null; size: StarSize; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: RATING_STARS }, (_, i) => (
        <StarIcon key={i} fill={starFill(value, i)} className={STAR_SIZE[size]} />
      ))}
    </span>
  )
}

/** „4.6 / 10" — ერთი ფორმატი ყველგან */
function Score({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      {formatRating(value)} <span className="font-normal text-muted-foreground">/ {RATING_MAX}</span>
    </span>
  )
}

/**
 * მხოლოდ საკითხავად — დეტალის თავი (ყველა მოდალი, ფილმის გვერდი).
 * ქულის გარეშე არაფერი იხატება — ადგილი არ „იკარგება", რადგან თავში ბეჯები `flex-wrap`-ითაა.
 */
export function RatingStars({
  value,
  size = 'sm',
  className,
}: {
  value: number | null | undefined
  size?: StarSize
  className?: string
}) {
  if (value == null) return null

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)}
      title={`${formatRating(value)} / ${RATING_MAX}`}
      data-testid="rating-stars"
    >
      <Stars value={value} size={size} />
      <Score value={value} />
    </span>
  )
}

/** სტრიქონის/ბარათის ბეჯი „★ 4.6" — ფონი და ზომა `Badge`-ისაა */
export function RatingBadge({
  value,
  size = 'default',
  className,
}: {
  value: number | null | undefined
  size?: BadgeSize
  className?: string
}) {
  if (value == null) return null

  return (
    <Badge size={size} className={cn('bg-secondary tabular-nums', className)} title={`${formatRating(value)} / ${RATING_MAX}`}>
      <Star className="transition-transform size-3.5 shrink-0 fill-current text-gold" aria-hidden="true" />
      {formatRating(value)}
    </Badge>
  )
}
