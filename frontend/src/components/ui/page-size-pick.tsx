import { useTranslation } from 'react-i18next'
import { NumberPick } from '@/components/ui/number-pick'
import { LIST_PER_PAGE_MAX, PAGE_ALL, pageSizeOptions } from '@/lib/pageSize'
import { cn } from '@/lib/utils'

/* ============================================================
   **„გვერდზე რამდენი"** — ერთი ამრჩევი ყველა სიასა და ბადეზე.

   ვარიანტები სვეტების ჯერადია (`pageSizeOptions`) + „ყველა" (`0`, სიის
   ბოლოში) + „სხვა" (ხელით, ჭერამდე) — `NumberPick`-ის წესით. მოდულის
   სიებზე `PageHeader`-შია ხედის გადამრთველის გვერდით (`md`, `h-10`),
   ფოტოს ბადეზე — მის ხელსაწყოთა ზოლში (`sm`, `h-9`).

   ⚠️ **პატარა სიაზე იმალება** — როცა სულ უმცირეს ვარიანტზე ნაკლებია და
   არჩეული ზომა ისედაც ყველაფერს აჩვენებს; ხელით ჩაწერილი პატარა ზომა
   (მაგ. 3) კი ამრჩევს ტოვებს, თორემ უკან დაბრუნების გზა არ იქნებოდა.
   ============================================================ */

export function PageSizePick({
  value,
  onChange,
  columns,
  total,
  max = LIST_PER_PAGE_MAX,
  size = 'md',
  className,
}: {
  value: number
  onChange: (size: number) => void
  /** განლაგების სვეტები (`layoutColumns`); 1 — სტრიქონები */
  columns: number
  /** სულ რამდენია — პატარა სიაზე არჩევანს აზრი არ აქვს */
  total: number
  /** სერვერის ჭერი — „სხვა"-ს ზედა ზღვარი */
  max?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const { t } = useTranslation()
  const options = pageSizeOptions(columns)

  if (total <= options[0] && (value === PAGE_ALL || value >= total)) return null

  return (
    <span className={cn('flex items-center gap-2', className)} data-testid="page-size-pick">
      <span className="text-xs text-muted-foreground">{t('list.perPage')}</span>
      <NumberPick
        value={value}
        onChange={onChange}
        options={options}
        allowNone
        noneLabel={t('list.all')}
        noneLast
        size={size}
        min={1}
        max={max}
      />
    </span>
  )
}
