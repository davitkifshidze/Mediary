import { useTranslation } from 'react-i18next'
import { Loader2, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   **რჩეული — ერთი ღილაკი ყველგან** (Tasks §8).

   შენი სიტყვები: „სადაც ვარსკვლავია გარედან, დატოვე აიქონი და მიაწერე
   „რჩეული“, და ფერში ჩასვი შესაბამისში — რჩეულია, ალბათ წითელ-ვარდისფრისკენ
   წასული; ეს ფუნქციონალი სხვაგანაც ყველგან".

   ⚠️ **აიქონი + ტექსტი, ერთი სიმაღლე (`h-9`)**: აქამდე სამი განსხვავებული
   ვარსკვლავი იყო — შიშველი `size-8`, `ghost icon` h-10 და ჩარჩოიანი `size-9`
   — და დეტალის ფანჯრებს რჩეული საერთოდ არ ჰქონდათ. `icon-only row actions`
   დახურული გადაწყვეტილებაა (`CLAUDE.md`) და ეს სწორედ ბოლო აიქონ-ღილაკი იყო.

   ⚠️ **ფერი — `--favorite`** (`index.css`, ორივე თემა): ჩართულზე ჩარჩო, ფონი
   და ტექსტი მისია, ვარსკვლავი შევსებული. ერთი ჩანაწერი — `text-favorite`;
   `text-[var(--favorite)]` ფორმა აღარ იწერება.

   ⚠️ **`xs` ზომა ბარათის სათაურის ზოლისთვის** (ვიდეო) — იგივე ღილაკი,
   მხოლოდ დაბალი; ბარათის კუთხის ნიშანი (`MovieCard`) ღილაკი არ არის და აქ არ ეხება.
   ============================================================ */

export function FavoriteButton({
  active,
  onToggle,
  pending,
  size = 'sm',
  className,
}: {
  active: boolean
  onToggle: () => void
  pending?: boolean
  size?: 'sm' | 'xs'
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={t(active ? 'actions.unfavorite' : 'actions.favorite')}
      disabled={pending}
      onClick={onToggle}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors disabled:opacity-60',
        size === 'sm' ? 'h-9 px-3 text-sm' : 'h-7 px-2 text-xs',
        active
          ? 'border-favorite bg-favorite/10 text-favorite'
          : 'border-border text-muted-foreground hover:border-favorite/50 hover:text-favorite',
        className,
      )}
    >
      {pending ? (
        <Loader2 className={cn(size === 'sm' ? 'size-4' : 'size-3.5', 'animate-spin')} />
      ) : (
        <Star className={cn(size === 'sm' ? 'size-4' : 'size-3.5', active && 'fill-current')} />
      )}
      {t('filter.favorite')}
    </button>
  )
}
