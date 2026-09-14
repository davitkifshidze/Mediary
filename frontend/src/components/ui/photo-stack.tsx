import type { ReactNode } from 'react'
import { useState } from 'react'
import { ChevronDown, ChevronUp, ImageOff } from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'

/* ============================================================
   ფოტოების **დასტა** — ერთი ჯგუფი ერთი კარტით (Tasks §4.2 → **§8.6**).

   სახელი, ზემოთ პირველი ფოტო, დანარჩენი უკან კარტებივით; მიტანაზე
   იშლება, დაჭერაზე ჯგუფი იხსნება.

   ⚠️ **ერთი კომპონენტი ყველა ადგილისთვის** (§4.2-ის პირობა): ჩანაწერის
   გვერდზე მსახიობების დასტები, გალერეის ჯგუფები, მოდულების ჭრილი და
   მსახიობის გვერდი — ერთი და იგივე კარტია. მეორე ასლი ორ სხვადასხვა
   დასტას დახატავდა.

   ⚠️ **გაშლა JS-ის hover-ზეა და არა `group-hover:`-ზე** — კუთხე და
   წანაცვლება თითო კარტზე გამოითვლება (`i - (n-1)/2`), ე.ი. Tailwind-ის
   კლასებად ვერ ჩაიწერება (დინამიური მნიშვნელობებისგან Tailwind CSS-ს არ
   აგენერირებს).

   ## §8.6-ის ცვლილებები
   ⚠️ **ხუთი ბარათი ოთხის ნაცვლად** — ოთხზე დასტა „სამ ფოტოდ" იკითხებოდა.
   შესაბამისად backend-იც ხუთ ესკიზს აბრუნებს (`previews`), თორემ უკანა
   ბარათები ცარიელი იქნებოდა.
   ⚠️ **გაშლა ვეერისებურია** — კუთხე და წანაცვლება ინდექსის პროპორციულია და
   ცენტრიდან იზრდება; დამატებული `scale` და ჩრდილი ღრმად ჩაწყობის განცდას
   იძლევა. ეს **ერთი ფუნქციაა** (`fan`), რომ ორმა ზომამ (კომპაქტური/დიდი)
   ერთნაირად იმუშაოს.
   ⚠️ **ესკიზის უქონლობა ცალკე მდგომარეობაა** — ცარიელი ნაცრისფერი კარტი
   „ჩატვირთვად" იკითხებოდა; ახლა ხატულა ცხადად ამბობს, რომ ესკიზი არაა.

   ## ეტაპი 2-ის ცვლილება (2026-09-13)
   ⚠️ **მარჯვენა კლიკის მენიუ ბარათსაც აქვს** — გალერეის ჭრილებში სწორედ ეს
   ბარათია ძირითადი ერთეული, ე.ი. „ჩამოტვირთვა" და „ჯგუფის ყველა ფოტოს
   წაშლა" აქ უნდა იყოს და არა მხოლოდ ჯგუფის შიგნით.
   ⚠️ **შიგთავსს გამომძახებელი წერს** (`menu`) — დასტამ არ იცის, რას ნიშნავს
   „ჩამოტვირთვა" მსახიობზე, ჩანაწერზე თუ მოდულზე; მისი საქმე მხოლოდ ის არის,
   რომ ბარათი დასაჭერად გამოდგეს.
   ============================================================ */

/** რამდენი კარტი ჩანს დასტაში — მეტი უკან ისედაც არ იკითხება */
const STACK_CARDS = 5

/**
 * ერთი კარტის გარდაქმნა.
 *
 * `offset` — ცენტრიდან გადახრა (`i - (n-1)/2`), ე.ი. სიმეტრიული ვეერი.
 */
function fan(offset: number, spread: boolean) {
  return {
    transform: [
      `translateX(${(offset * (spread ? 34 : 7)).toFixed(2)}px)`,
      `translateY(${(spread ? -10 + Math.abs(offset) * 3 : Math.abs(offset) * 2).toFixed(2)}px)`,
      `rotate(${(offset * (spread ? 7.5 : 2.5)).toFixed(2)}deg)`,
      `scale(${spread ? 1 - Math.abs(offset) * 0.03 : 1})`,
    ].join(' '),
  }
}

export function PhotoStack({
  title,
  subtitle,
  label,
  images,
  count,
  open,
  onClick,
  aspect = 'portrait',
  badge,
  actions,
  menu,
  className,
}: {
  title: string
  /** ორიენტირი სათაურის ქვეშ (მეორე ენა, დომენი, არხი…) */
  subtitle?: ReactNode
  /** ქვედა ხაზი — „12 ფოტო · 4 MB" და მისთანები (ტექსტს **გამომძახებელი** წერს) */
  label: ReactNode
  /** storage-ის გზები ან სრული URL-ები; პირველი ზემოთ ხატება */
  images: string[]
  /** ჯგუფის სრული რაოდენობა — კუთხეში პატარა ნიშნად */
  count?: number
  open?: boolean
  onClick?: () => void
  /** პორტრეტი (მსახიობი/პოსტერი) თუ ფართო კადრი */
  aspect?: 'portrait' | 'wide'
  /** ზედა მარცხენა ნიშანი (მაგ. „პრივატული") */
  badge?: ReactNode
  /** ქვედა მარჯვენა კონტროლები — ჩამოტვირთვა, ვებძებნა და მისთანები */
  actions?: ReactNode
  /**
   * მარჯვენა კლიკის მენიუს პუნქტები (`ContextMenuItem`-ები).
   *
   * ⚠️ **იგივე სიიდან უნდა დაიხატოს, რაც `actions`** — ორი ასლი აუცილებლად
   * გაშორდება და მომხმარებელი სწორედ იმ ერთადერთს ეძებს, სადაც პუნქტია.
   */
  menu?: ReactNode
  className?: string
}) {
  const [spread, setSpread] = useState(false)
  const cards = images.slice(0, STACK_CARDS)

  const card = (
    <div
      className={cn(
        'group/stack relative rounded-2xl border bg-card p-4 transition-all duration-300',
        open
          ? 'border-primary shadow-lg'
          : 'border-border hover:border-primary/60 hover:shadow-lg',
        className,
      )}
      onMouseEnter={() => setSpread(true)}
      onMouseLeave={() => setSpread(false)}
    >
      <button
        type="button"
        onFocus={() => setSpread(true)}
        onBlur={() => setSpread(false)}
        onClick={onClick}
        aria-expanded={open}
        className="block w-full cursor-pointer text-left"
      >
        {/* დასტა — უკანა კარტები პირველი იხატება, რომ პირველი ფოტო ზემოთ დარჩეს */}
        <span
          className={cn(
            'relative block w-full',
            aspect === 'portrait' ? 'aspect-[3/4]' : 'aspect-[16/10]',
          )}
        >
          {cards.length === 0 && (
            <span className="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground">
              <ImageOff className="size-6" />
            </span>
          )}

          {[...cards].reverse().map((path, reverseIndex) => {
            const index = cards.length - 1 - reverseIndex
            const offset = index - (cards.length - 1) / 2

            return (
              <span
                key={`${path}-${index}`}
                className="absolute inset-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-transform duration-300 ease-out"
                style={{ ...fan(offset, spread), zIndex: cards.length - index }}
              >
                <img
                  src={storageUrl(path) ?? ''}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-full object-cover"
                />
              </span>
            )
          })}

          {/* რაოდენობა — დასტის კუთხეში, ყოველთვის ზემოთ */}
          {count != null && count > 0 && (
            <span
              className="pointer-events-none absolute -right-1 -top-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary-foreground shadow-sm"
              style={{ zIndex: STACK_CARDS + 1 }}
            >
              {count}
            </span>
          )}

          {badge && (
            <span
              className="pointer-events-none absolute left-1 top-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
              style={{ zIndex: STACK_CARDS + 1 }}
            >
              {badge}
            </span>
          )}
        </span>

        <span className="mt-3 block min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          {subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            {onClick &&
              (open ? (
                <ChevronUp className="ml-auto size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="ml-auto size-3.5 shrink-0" />
              ))}
          </span>
        </span>
      </button>

      {/* ⚠️ მოქმედებები **ღილაკის გარეთაა** — ჩადგმული `<button>` HTML-ში
          დაუშვებელია და კლიკიც ჯგუფის გახსნაზე გადიოდა */}
      {actions && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {actions}
        </div>
      )}
    </div>
  )

  if (!menu) return card

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>{menu}</ContextMenuContent>
    </ContextMenu>
  )
}
