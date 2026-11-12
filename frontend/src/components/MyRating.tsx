import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { formatRating, RATING_MAX } from '@/lib/rating'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RatingSelect } from '@/components/ui/rating-select'
import { RatingStars } from '@/components/ui/star-rating'

/**
 * **ჩემი ქულა პირდაპირ სიიდან** — ქულის ნიშანი დასაჭერია: იხსნება პატარა
 * `RatingSelect`, არჩევა მაშინვე ინახება.
 *
 * ⚠️ **ადგილი ყოველთვის დაკავებულია**: უქულო ჩანაწერზე იმავე ადგილას „შეფასება"
 * წერია. ქრობადი ნიშანი რიგს ახტუნებდა — შეფასებული და შეუფასებელი სტრიქონის
 * ღილაკები სხვადასხვა ადგილას იდგა.
 *
 * ⚠️ **არჩეული მაშინვე ჩანს** (`chosen`): სია პასუხის შემდეგ ახლდება, მანამდე
 * ეკრანზე ძველი ქულა დარჩებოდა. ჩავარდნაზე ძველი ბრუნდება — `onChange`-ის
 * დაპირება ამიტომ ბრუნდება.
 *
 * სამი იერი: `row` — სტრიქონის მოქმედებების ზოლი (h-9, ფიქსირებული სიგანე),
 * `inline` — ბარათის მეტა-ხაზი, `stars` — ჩანაწერის გვერდის ვარსკვლავები.
 */
export function MyRating({
  value,
  onChange,
  variant,
  className,
}: {
  value: number | null | undefined
  onChange: (value: number | null) => Promise<unknown>
  variant: 'row' | 'inline' | 'stars'
  className?: string
}) {
  const { t } = useTranslation()
  const [chosen, setChosen] = useState<number | null | undefined>(undefined)
  useEffect(() => setChosen(undefined), [value])

  const shown = chosen !== undefined ? chosen : (value ?? null)
  const rated = shown != null
  const title = rated ? t('rating.change', { score: `${formatRating(shown)} / ${RATING_MAX}` }) : t('rating.rateHint')

  const pick = (next: number | null) => {
    if (next === shown) return
    setChosen(next)
    void onChange(next).catch(() => setChosen(undefined))
  }

  /* ⚠️ ვარსკვლავის `transition-transform` — `index.css`-ის ზოგადი `.lucide-star`
     ჰოვერის გამორთვის სახელურია: ქულის ვარსკვლავი უკვე ფერადია */
  const starIcon = (size: string) => (
    <Star
      className={cn('transition-transform shrink-0', size, rated ? 'fill-current text-gold' : 'text-muted-foreground')}
      aria-hidden="true"
    />
  )

  const trigger =
    variant === 'row' ? (
      <Button
        variant="outline"
        size="sm"
        title={title}
        data-testid="my-rating"
        // ფიქსირებული სიგანე: „შეფასება" და „★ 7.5" ერთსა და იმავე ადგილს იკავებს
        className={cn('w-28 px-2 tabular-nums', className)}
      >
        {starIcon('size-3.5')}
        {rated ? formatRating(shown) : t('rating.rate')}
      </Button>
    ) : variant === 'inline' ? (
      <button
        type="button"
        data-kind="link"
        title={title}
        aria-label={title}
        data-testid="my-rating"
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center gap-0.5 font-medium transition-colors',
          rated ? 'text-gold' : 'hover:text-foreground',
          className,
        )}
      >
        {starIcon('size-3')}
        {rated ? (
          formatRating(shown)
        ) : (
          // ვიწრო ბარათზე (პატარა ბადე) მხოლოდ ვარსკვლავი რჩება — ადგილი მაინც დაკავებულია
          <span className="hidden @min-[10rem]:inline">{t('rating.rate')}</span>
        )}
      </button>
    ) : (
      <button
        type="button"
        data-kind="link"
        title={title}
        aria-label={title}
        data-testid="my-rating"
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm transition-opacity hover:opacity-75',
          className,
        )}
      >
        {rated ? (
          <RatingStars value={shown} />
        ) : (
          <>
            {starIcon('size-4')}
            <span className="text-muted-foreground">{t('rating.rate')}</span>
          </>
        )}
      </button>
    )

  return <RatingSelect value={shown} onChange={pick} trigger={trigger} />
}
