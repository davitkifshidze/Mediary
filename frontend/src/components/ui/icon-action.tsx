import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* ============================================================
   მოქმედება — აიქონი **და სახელი**, ერთი ზომით (Tasks §6).

   ⚠️ **სახელი ღილაკზე წერია და აიქონის გვერდით დგას** (შენი შესწორება,
   2026-09-27: „ჯობს აიქონებთან ერთად იყოს რედაქტირება, წაშლა და რაც არის").
   პირველ ვერსიაში ღილაკი მხოლოდ აიქონი იყო და სახელი თულთიპში იმალებოდა —
   ეს უარყოფილია. `iconOnly` მხოლოდ იქ რჩება, სადაც სახელი რიგს გადატვირთავდა
   და აიქონი თავისთავად ცხადია (ზემოთ/ქვემოთ გადაადგილება). თულთიპი ჩნდება
   მხოლოდ მაშინ, როცა ის ღილაკზე დაწერილზე **მეტს** ამბობს.

   ⚠️ **რატომ ცალკე კომპონენტი და არა `Button size="icon"`.** რიგის
   მოქმედებები ხელით ეწერა ყოველ გვერდზე (`grid size-8 …`), სახელი
   ზოგს `aria-label`-ში ჰქონდა, ზოგს ბრაუზერის `title`-ში, წაშლას კი
   საერთოდ არა — ე.ი. „რას აკეთებს ეს ღილაკი" პასუხი ცათ წერია. აქ
   სახელი **სავალდებულო** პროპია და ერთდროულად თულთიპიც არის და
   `aria-label`-იც — ერთი წყარო, ორივე მიმართულებით.

   ⚠️ **Radix-ის თულთიპი შეხებაზე არ იხსნება** (`info-hint.tsx`-ის
   დოკბლოკი) — აიქონ-ღილაკზე ეს მისაღებია, რადგან დაჭერა მოქმედებას
   ასრულებს; სწორედ ამიტომ `aria-label` აუცილებელია.

   ⚠️ **ზომა ორია**: `sm` (32px) — ბარათი და რიგი, `md` (40px) — გვერდის
   სათაური. ორივე `Button`-ის `icon-sm`/`icon`-ს ემთხვევა, ე.ი. ერთ რიგში
   ტექსტიანი ღილაკიც და აიქონიც ერთ სიმაღლეზე დგას.

   ⚠️ **ფონი ჰოვერზე არ ეხატება** (§5.2) — ანიმაცია და ფერი აიქონს
   `index.css`-იდან მოსდევს (`.lucide-*`). `tone` მხოლოდ მოსვენებულ ფერს
   წყვეტს: `danger` წითელია, `favorite` — აქტიურზე შევსებული ვარსკვლავი
   `--favorite` ტოკენით (§6.6 — `gold` აღარ).

   ⚠️ **`count` ფიქსირებული სიგანის ადგილშია** (შეხსენების ზარის წესი):
   ნულზე ცარიელია და არა გამქრალი, თორემ რიგები ერთმანეთს აღარ ეთანადება.
   ============================================================ */

export type IconActionTone = 'default' | 'danger' | 'favorite'
export type IconActionSize = 'sm' | 'md'

export interface IconActionProps {
  icon: LucideIcon
  /** `aria-label` და (თუ `text` განსხვავდება) თულთიპი */
  label: string
  /** ღილაკზე დაწერილი სახელი — ნაგულისხმევად `label` */
  text?: string
  /** მხოლოდ აიქონი (სახელი თულთიპში) — ზემოთ/ქვემოთ ისრები და მისთანები */
  iconOnly?: boolean
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
  /** ბმული — ყოველთვის ახალ ჩანართში (რიგის ბმულები გარე მისამართია) */
  href?: string
  /** `href`-ის ფაილს ბრაუზერი ჩამოტვირთავს და არ გახსნის */
  download?: boolean
  /** აპის შიდა მარშრუტი (`Link`) — იმავე ჩანართში */
  to?: string
  tone?: IconActionTone
  /** რჩეულზე — შევსებული აიქონი; სხვაგან — ტონის სრული ფერი */
  active?: boolean
  size?: IconActionSize
  /** `undefined` — რიცხვის ადგილი არ იხატება; `0` — ადგილი ცარიელია */
  count?: number
  disabled?: boolean
  className?: string
  /** აიქონის საკუთარი კლასი (მაგ. დამტრიალებელის `animate-spin`) */
  iconClassName?: string
  /** `aria-pressed` — გადამრთველი მოქმედებისთვის (რჩეული) */
  pressed?: boolean
}

const BOX: Record<IconActionSize, string> = {
  sm: 'h-8 min-w-8 text-xs',
  md: 'h-10 min-w-10 text-sm',
}

const TONE: Record<IconActionTone, string> = {
  default: 'text-muted-foreground hover:text-foreground',
  danger: 'text-destructive',
  favorite: 'text-muted-foreground',
}

export const IconAction = React.forwardRef<HTMLElement, IconActionProps>(function IconAction(
  { icon: Icon, label, text, iconOnly, onClick, href, download, to, tone = 'default', active, size = 'sm', count, disabled, className, iconClassName, pressed },
  ref,
) {
  const cls = cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    iconOnly ? 'px-1.5' : 'px-2',
    BOX[size],
    TONE[tone],
    active && tone === 'default' && 'text-foreground',
    className,
  )
  const glyph = (
    <Icon
      className={cn(
        size === 'md' ? 'size-[18px]' : 'size-4',
        tone === 'favorite' && active && 'fill-current text-[var(--favorite)]',
        iconClassName,
      )}
    />
  )
  const shown = text ?? label
  const inner = (
    <>
      {glyph}
      {!iconOnly && <span>{shown}</span>}
      {count !== undefined && (
        <span className="w-3 text-left text-xs tabular-nums">{count > 0 ? count : ''}</span>
      )}
    </>
  )

  const trigger = to ? (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      to={to}
      aria-label={label}
      onClick={onClick}
      className={cls}
    >
      {inner}
    </Link>
  ) : href ? (
    <a
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      download={download || undefined}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={onClick}
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cls}
    >
      {inner}
    </button>
  )

  // თულთიპი მხოლოდ მაშინ, როცა ღილაკზე დაწერილს რამეს ამატებს
  if (!iconOnly && shown === label) return trigger

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
})

/* ============================================================
   რიგის ნიშანი თულთიპით — არაინტერაქტიული მდგომარეობა, რომელიც
   მოქმედებების რიგში დგას („საჯარო"). ⚠️ სიმაღლე `IconAction`-ისაა,
   თორემ ერთ რიგში ისევ ორი სიმაღლე გაჩნდება (§6.2).
   ============================================================ */
export function IconMark({
  icon: Icon,
  label,
  text,
  size = 'sm',
  className,
}: {
  icon: LucideIcon
  /** თულთიპი — სრული ახსნა */
  label: string
  /** ნიშანზე დაწერილი მოკლე სახელი („საჯარო") */
  text?: string
  size?: IconActionSize
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium',
            text ? 'px-2' : 'px-1.5',
            BOX[size],
            className,
          )}
        >
          <Icon className={size === 'md' ? 'size-[18px]' : 'size-4'} />
          {text && <span>{text}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
