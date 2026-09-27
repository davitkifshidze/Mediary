import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **ჩემი შეფასება — 1-დან 10-მდე + „შეფასების გარეშე"** (Tasks §25.2/§25.4).

   ერთი ამრჩევი ხუთივე ფორმაში (Q17): ადგილი, წიგნი, თამაში, სამაგიდო
   თამაში და სიმღერა. ⚠️ ფილმზე, სერიალსა და ანიმეზე `rating` TMDB-ის
   ქულაა და ეს კომპონენტი მას **არ** ეხება.

   ⚠️ **მნიშვნელობა რიცხვია ან `null`** — ფორმის state-ში სტრიქონი აღარ
   ინახება, ე.ი. „ცარიელი" ერთადერთი ფორმით ითქმის და payload-ს
   გადაყვანა აღარ სჭირდება. `null` — „გასუფთავება" (§4.8): სერიალიზატორი
   მას ცარიელ სტრიქონად აგზავნის და backend-ი ველს ასუფთავებს.

   ⚠️ **„გარეშე" სიტყვაა და არა ცარიელი სტრიქონი**: Radix-ის `SelectItem`-ს
   `value=""` ეკრძალება (ის placeholder-ის დასაბრუნებლადაა დაცული).

   ⚠️ **სიის მიღმა არსებული მნიშვნელობა არ იკარგება** (წიგნის ენის
   პრეცედენტი, §6.1): Radix სიაში არარსებულ მნიშვნელობას ცარიელ ტრიგერად
   ხატავს — ველი შეუვსებელი ჩანს და პირველივე შენახვა მას `null`-ად
   გადაწერდა. ამიტომ ასეთი მნიშვნელობა სიას თვითონ ემატება; რას უზამს
   მას სერვერი, ეს სერვერის გადასაწყვეტია და არა ფორმის ჩუმი წაშლის.
   ============================================================ */

/** შეფასების ჭერი — იგივე რიცხვი `Place/Book/Game/BoardGame/Song::MAX_RATING`-შია */
export const RATING_MAX = 10

/** „შეფასების გარეშე" — Radix-ს ცარიელი მნიშვნელობა ეკრძალება */
const NONE = 'none'

export function RatingSelect({
  id,
  value,
  onChange,
  max = RATING_MAX,
  invalid = false,
}: {
  id?: string
  value: number | null
  onChange: (value: number | null) => void
  max?: number
  /** შეცდომის ჩარჩო (სერვერის 422) */
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const options = Array.from({ length: max }, (_, i) => i + 1)
  const outside = value != null && !options.includes(value)

  return (
    <Select
      value={value == null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      <SelectTrigger id={id} className={invalid ? 'border-destructive' : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{t('form.ratingNone')}</span>
        </SelectItem>
        {outside && (
          <SelectItem value={String(value)}>
            <Mark value={value} max={max} />
          </SelectItem>
        )}
        {options.map((n) => (
          <SelectItem key={n} value={String(n)}>
            <Mark value={n} max={max} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** „★ 7 / 10" — ტრიგერი და სიის რიგი ერთსა და იმავეს წერს */
function Mark({ value, max }: { value: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <Star className="size-3.5 fill-current text-[var(--favorite)]" />
      {value}
      <span className="text-muted-foreground">/ {max}</span>
    </span>
  )
}
