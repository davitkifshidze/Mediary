import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRating, parseRating, RATING_MAX, RATING_STARS, ratingFromStar, starFill } from '@/lib/rating'
import { Badge, type BadgeSize } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

/* ============================================================
   **„ჩემი ქულა" ვარსკვლავებით — ერთი ვიჯეტი ყველა მოდულზე** (Tasks §9).

   შენი სიტყვები: „ყველგან ჩემი ქულა ისე იყოს, როგორც წიგნებშია —
   ვარსკვლავები; და ასევე იყოს საშუალება შენი ხელითაც გაწერო, მაგალითად არ
   გინდა მთელი რიცხვი — იწერ, ვარსკვლავი ივსება და მერე ეწეროს 4.6 / 10".

   სამი ფორმა ერთი არითმეტიკით (`lib/rating.ts`):
   - `StarRating` — ფორმაში: ხუთი ვარსკვლავი **ნახევრებით** (Q1; მარცხენა
     ნახევარზე დაჭერა ნახევარია), ჰოვერზე წინასწარი შევსება, გვერდით
     **რიცხვითი ველი** `step 0.1` (0–10) და ტექსტი „4.6 / 10", გასუფთავების ✕;
   - `RatingStars` — დეტალის თავში: იგივე ვარსკვლავები მხოლოდ საკითხავად + „4.6 / 10";
   - `RatingBadge` — სტრიქონსა და ბარათზე: „★ 4.6" ერთი ზომით (`Badge`).

   ⚠️ **მეათედიც ივსება** — ვარსკვლავი ორი ფენაა: ნაცრისფერი კონტური და
   ზემოდან ოქროსფერი შევსებული, `clip-path: inset()`-ით მოჭრილი იმდენზე,
   რამდენიც ქულაა (4.6 → მესამე ვარსკვლავის 30 %). ნახევარი და მეათედი
   ერთნაირად იხატება, ე.ი. ხელით ჩაწერილი 4.6 და დაჭერით მიღებული 4.0 ერთი
   და იმავე ენაზე ჩანს.

   ⚠️ **ვარსკვლავებს `transition-transform` აქვთ** — ეს `index.css`-ის
   ზოგადი `.lucide-star` ჰოვერ-ანიმაციისა და ფერის **გამორთვის სახელურია**
   (`:not(.transition-transform)`): ვიჯეტის შიგნით ვარსკვლავი უკვე ფერადია
   და ხტუნვა შევსების წინასწარ ჩვენებას დაფარავდა.

   ⚠️ **რიცხვითი ველის ტექსტი ცალკე მდგომარეობაა** — „4." აკრეფისას ქულა 4-ია,
   ტექსტი კი „4." უნდა დარჩეს; ამიტომ ველი მნიშვნელობიდან მხოლოდ მაშინ
   ახლდება, როცა აკრეფილის წაკითხვა მნიშვნელობას აღარ ემთხვევა (ვარსკვლავზე
   დაჭერა, გასუფთავება, გარედან ჩატვირთვა).

   ⚠️ **ნული და ცარიელი „ქულის გარეშეა"** — backend-ის `Rating::normalize()`-ის
   იგივე წესი; ვარსკვლავებით ნული ვერც აირჩევა.
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

/**
 * ფორმის ვიჯეტი: ვარსკვლავები ნახევრებით + რიცხვითი ველი + „4.6 / 10" + ✕.
 * მნიშვნელობა რიცხვია ან `null` (ყოფილი `RatingSelect`-ის კონტრაქტი — სერიალიზატორი
 * `null`-ს ცარიელ სტრიქონად აგზავნის და backend ქულას შლის).
 */
export function StarRating({
  id,
  value,
  onChange,
  invalid = false,
  className,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  /** შეცდომის ჩარჩო (სერვერის 422) */
  invalid?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)
  const [text, setText] = useState(value == null ? '' : formatRating(value))

  // გარედან შეცვლილი მნიშვნელობა ველშიც ჩანს; აკრეფის შუაში („4.") არ ერევა
  useEffect(() => {
    if (parseRating(text) !== value) setText(value == null ? '' : formatRating(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const shown = hover ?? value

  /** კურსორი ვარსკვლავის მარცხენა ნახევარშია? კლავიატურით (`detail === 0`) — სავსე ვარსკვლავი */
  const isHalf = (e: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
    if ('detail' in e && e.detail === 0 && e.type === 'click') return false
    const rect = e.currentTarget.getBoundingClientRect()
    return rect.width > 0 && e.clientX - rect.left < rect.width / 2
  }

  const pick = (next: number | null) => {
    setHover(null)
    onChange(next)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="star-rating">
      <div
        role="group"
        aria-label={t('rating.mine')}
        className={cn('flex items-center rounded-md', invalid && 'ring-1 ring-destructive')}
        onPointerLeave={() => setHover(null)}
      >
        {Array.from({ length: RATING_STARS }, (_, i) => (
          <button
            key={i}
            type="button"
            className="cursor-pointer p-0.5"
            aria-label={t('rating.setTo', { value: formatRating(ratingFromStar(i, false)) })}
            onPointerMove={(e) => setHover(ratingFromStar(i, isHalf(e)))}
            onClick={(e) => pick(ratingFromStar(i, isHalf(e)))}
          >
            <StarIcon fill={starFill(shown, i)} className={STAR_SIZE.lg} />
          </button>
        ))}
      </div>

      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        max={RATING_MAX}
        value={text}
        aria-label={t('rating.mine')}
        placeholder="0.0"
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseRating(e.target.value))
        }}
        onBlur={() => setText(value == null ? '' : formatRating(value))}
        className={cn('h-9 w-20 tabular-nums', invalid && 'border-destructive')}
      />

      <span className="text-sm font-medium" data-testid="star-rating-score">
        {value == null ? (
          <span className="font-normal text-muted-foreground">{t('form.ratingNone')}</span>
        ) : (
          <Score value={value} />
        )}
      </span>

      {value != null && (
        <button
          type="button"
          onClick={() => pick(null)}
          aria-label={t('rating.clear')}
          title={t('rating.clear')}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
