import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

/* ============================================================
   ტრიგერის სიგანე — სიის უგრძელესი ვარიანტით (Tasks §38.2).

   `w-auto` ტრიგერი არჩეულ ვარიანტს მიჰყვებოდა, სია კი — უგრძელესს: „20"-ის
   არჩევისას სია „ყველას" სიგანით იხსნებოდა, ტრიგერი კი ყოველ არჩევაზე
   ზომას იცვლიდა. აქ ყველა წარწერა grid-ის ერთ უჯრაშია დაწყობილი,
   უხილავად — სვეტი უგრძელესის სიგანეს იღებს, ზემოდან კი არჩეული ჩანს.
   ⚠️ ყველა `w-auto` ტრიგერს ეს სჭირდება — `scripts/select-fit.mjs` ამოწმებს.

   ⚠️ **ტოლობა ორივე მხარის ერთნაირ „გარსზე" დგას — 50px**: ტრიგერი =
   ჩარჩო 2 + `px-3` 24 + `gap-2` 8 + ისარი 16; ვარიანტი სიაში = ჩარჩო 2 +
   `p-1` 8 + `pl-8` 32 + `pr-2` 8. ერთ-ერთის შეცვლისას მეორეც უნდა გასწორდეს,
   თორემ სია ტრიგერს ისევ რამდენიმე პიქსელით გასცდება. ხედის სქროლბარს
   Radix თვითონ მალავს (`scrollbar-width: none`), ამიტომ ამ ჯამში არ ზის.

   ⚠️ უხილავი წარწერები `font-medium`-ია: სიაში მონიშნული ვარიანტი მუქდება
   და ოდნავ განიერდება — სიგანე მის მიხედვით უნდა აიღოს.
   ⚠️ `invisible` + `aria-hidden`: ეკრანის მკითხველი მხოლოდ არჩეულს კითხულობს
   (`textContent` კი ყველას შეიცავს — ტესტში ამას გაითვალისწინებ).
   ⚠️ ყველა უჯრა `truncate`-ია: ვიწრო ზოლში ტრიგერი იკუმშება და არჩეული
   „…"-ით იჭრება — უხილავი წარწერები მას ზოლიდან ვერ გაიტანს.
   ============================================================ */
function SelectFitValue({ labels, placeholder }: { labels: React.ReactNode[]; placeholder?: React.ReactNode }) {
  return (
    <span className="grid [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:truncate">
      <SelectValue placeholder={placeholder} />
      {labels.map((label, i) => (
        <span key={i} aria-hidden className="invisible font-medium">
          {label}
        </span>
      ))}
    </span>
  )
}

/* ============================================================
   ჩამოსაშლელის სიგანე = ტრიგერის სიგანე (Tasks §38.1).

   ⚠️ იყო შიგთავსზე `min-w-32`, ხედზე კი — ზუსტად ტრიგერის სიგანე:
   128px-ზე ვიწრო ტრიგერზე (გალერეის „აჩვენე" — ~96px) სია 128px-ად
   იხსნებოდა, ვარიანტები კი ტრიგერის სიგანეზე იდგა — მარჯვნივ ცარიელი ზოლი
   რჩებოდა. ახლა ქვედა ზღვარი თვითონ ტრიგერია, ხედი კი მთელ სიგანეს ავსებს:
   სია ტრიგერზე ვიწრო ვერ იქნება და ცარიელი ზოლი ვერ დარჩება.

   ⚠️ ტრიგერზე გრძელი ვარიანტი სიას **აფართოებს** და არ იჭრება — ძველად
   ერთსიტყვიანი წარწერა იჭრებოდა (ხედს Radix-ის `overflow-x: hidden` აქვს),
   გრძელი კი ორ ხაზზე გადადიოდა. ზედა ზღვარი ეკრანის თავისუფალი სიგანეა,
   რომ სია ეკრანს არ გასცდეს.
   ⚠️ `item-aligned` რეჟიმი აპში არსად გამოიყენება; იქ ძველი ქცევა რჩება.
   ============================================================ */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        LAYER_POPUP,
        'overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        position === 'popper'
          ? 'min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-content-available-width)] data-[side=bottom]:translate-y-1'
          : 'min-w-32',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn('fb-scroll max-h-[280px] overflow-y-scroll! p-1', position === 'popper' && 'w-full')}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[state=checked]:font-medium',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectGroup, SelectValue, SelectFitValue, SelectTrigger, SelectContent, SelectItem }
