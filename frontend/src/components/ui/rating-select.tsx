import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check, ChevronDown, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRating, parseRating, RATING_MAX } from '@/lib/rating'
import { LAYER_POPUP } from '@/lib/layers'

/* ============================================================
   **ჩემი შეფასება — ჩამოსაშლელი „★ 1 … ★ 10" და ხელით ჩასაწერი წილადი**.

   შენი სიტყვები: „მინდოდა ყოფილიყო სელექთი, სადაც იქნებოდა 1-2-3-4-5…9-10
   ვარსკვლავები: წინ ვარსკვლავი და მერე რიცხვი; და ბოლოში ყოფილიყო ვარსკვლავი
   და მერე ინფუთი შესაყვანი, და შეგეძლებოდა წილადი შეგეყვანა. ყველგან ესეთი".
   ძველი `RatingSelect` (`21cdf0c^`) ბრუნდება, ოღონდ წილადის რიგით და ექვსივე
   ფორმაში (ფილმის `my_rating`-იც) — ვარსკვლავების ვიჯეტი წაიშალა.

   ⚠️ **Radix `Popover` და არა `Select`**: `Select`-ის typeahead სიის შიგნით
   მდგარ ველში აკრეფილ ციფრს ვარიანტის საძებნელად იყენებს და ფოკუსს ველს
   აცლის. აქ ვარიანტები ჩვეულებრივი ღილაკებია (ისრებით მოძრაობა — თვითონ),
   ბოლო რიგი კი ნამდვილი ველია: `Enter` ან ✓ ირჩევს, მძიმეც მიიღება.

   ⚠️ **მნიშვნელობა რიცხვია ან `null`**: `null` —
   „შეფასების გარეშე"; სერიალიზატორი მას ცარიელ სტრიქონად აგზავნის და
   backend ქულას შლის. ⚠️ **სიის მიღმა შენახული ქულა არ იკარგება**:
   ღილაკზე ის ჩანს, ხელით ჩაწერის ველში კი წინასწარაა ჩაწერილი.

   ⚠️ ჩვენება (ბეჯი „★ 4.6", დეტალის ვარსკვლავები) **უცვლელია** — შენიშვნა
   მინიჭებას ეხებოდა (`RatingStars`/`RatingBadge`, `star-rating.tsx`).
   ============================================================ */

const OPTIONS = Array.from({ length: RATING_MAX }, (_, i) => i + 1)

/** „★ 7.5 / 10" — ღილაკი და სიის რიგი ერთსა და იმავეს წერს */
function Mark({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <Star className="transition-transform size-3.5 shrink-0 fill-current text-gold" aria-hidden="true" />
      {formatRating(value)}
      <span className="text-muted-foreground">/ {RATING_MAX}</span>
    </span>
  )
}

function Option({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      data-rating-option
      onClick={onSelect}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-left text-sm outline-none hover:bg-muted focus:bg-muted',
        checked && 'font-medium',
      )}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">{checked && <Check className="size-4" />}</span>
      {children}
    </button>
  )
}

export function RatingSelect({
  id,
  value,
  onChange,
  invalid = false,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  /** შეცდომის ჩარჩო (სერვერის 422) */
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const custom = value != null && !OPTIONS.includes(value)
  const typed = parseRating(text)

  const openChange = (next: boolean) => {
    // ⚠️ სიის მიღმა შენახული ველში წინასწარაა — მისი შესწორება აქედან იწყება
    if (next) setText(custom ? formatRating(value) : '')
    setOpen(next)
  }

  const pick = (next: number | null) => {
    onChange(next)
    setOpen(false)
  }

  /** ისრები ვარიანტებსა და ბოლო ველს შორის; ველში — მხოლოდ ზემოთ ასვლა */
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[data-rating-option], [data-rating-input]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at === -1) return
    e.preventDefault()
    items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          data-testid="rating-select"
          className={cn(
            'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:outline-none',
            invalid && 'border-destructive',
          )}
        >
          <span className="truncate">
            {value == null ? <span className="text-muted-foreground">{t('form.ratingNone')}</span> : <Mark value={value} />}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          ref={list}
          role="listbox"
          onKeyDown={move}
          // ⚠️ ფოკუსი არჩეულზე — `Enter`-ით უცვლელად დახურვა და ისრებით გაგრძელება
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const target =
              list.current?.querySelector<HTMLElement>(custom ? '[data-rating-input]' : '[data-rating-option][aria-selected="true"]') ??
              list.current?.querySelector<HTMLElement>('[data-rating-option]')
            target?.focus()
          }}
          className={cn(
            LAYER_POPUP,
            'w-[var(--radix-popover-trigger-width)] min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          )}
        >
          <Option checked={value == null} onSelect={() => pick(null)}>
            <span className="text-muted-foreground">{t('form.ratingNone')}</span>
          </Option>
          {OPTIONS.map((n) => (
            <Option key={n} checked={value === n} onSelect={() => pick(n)}>
              <Mark value={n} />
            </Option>
          ))}

          {/* ბოლო რიგი — ★ + ხელით ჩასაწერი წილადი (0–10, მეათედამდე; მძიმეც მიიღება) */}
          <div className="relative mt-1 flex items-center gap-1.5 border-t border-border pb-0.5 pl-8 pr-1 pt-1.5">
            <span className="absolute left-2 flex size-4 items-center justify-center">{custom && <Check className="size-4" />}</span>
            <Star className="transition-transform size-3.5 shrink-0 fill-current text-gold" aria-hidden="true" />
            <input
              type="text"
              inputMode="decimal"
              data-rating-input
              aria-label={t('rating.manual')}
              placeholder="7.5"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (typed != null) pick(typed)
              }}
              className="h-8 w-16 min-w-0 rounded-md border border-border bg-card px-2 text-sm tabular-nums outline-none"
            />
            <span className="text-sm text-muted-foreground">/ {RATING_MAX}</span>
            <button
              type="button"
              aria-label={t('rating.manualApply')}
              title={t('rating.manualApply')}
              disabled={typed == null}
              onClick={() => typed != null && pick(typed)}
              className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="size-4" />
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
