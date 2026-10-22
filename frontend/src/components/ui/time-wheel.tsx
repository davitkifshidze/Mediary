import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker'
import '@ncdai/react-wheel-picker/style.css'
import { useTranslation } from 'react-i18next'
import { Check, Clock } from 'lucide-react'
import { LAYER_POPUP } from '@/lib/layers'
import { nowClock } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   **დროის ბორბლები — საათივით**.

   შენი სიტყვები: „შეხსენებაში დროის არჩევა არ მომწონს … ცოტა კარგი
   ბიბლიოთეკა — სქროლზე რომ ისქროლებოდეს მნიშვნელობები, საათივით".

   ⚠️ **ბიბლიოთეკა: `@ncdai/react-wheel-picker`** — iOS-ისებრი ბორბალი:
   ინერცია, თაგვით გადათრევა, თაგვის ბორბალი, უსასრულო ციკლი, კლავიატურა
   (ისრები, Home/End, აკრეფით ძებნა). **სტილის გარეშეა** — ფერი და ზომა
   ჩვენი ტოკენებითაა (`react-aria`-ს ველის არჩევის იგივე მიზეზი). შემოწმდა:
   React 19 (`peerDependencies`), დამოკიდებულება არ აქვს, და ის **ზარმაცი
   ჩანკიდანაა** — ეს ფაილი მხოლოდ თარიღის ამრჩევსა და ჩანაწერების გვერდს
   სჭირდება, საწყის ჩანკში არ ხვდება.

   ⚠️ **ARIA-ს როლებს ბიბლიოთეკა არ წერს** — ამიტომ ხელმისაწვდომი მთავარი
   გზა `TimePicker`-ის სეგმენტებიანი ველია (react-aria), ბორბლები კი სწრაფი
   არჩევისთვისაა; თითო ბორბალს სახელი `aria-label`-ით ჯგუფზე ეწერება.

   ⚠️ **ახლა popover-ია და არა ჩაშლილი ბლოკი.** 2026-09-15-ის „ბლოკი და არა
   popover" `lib/layers.ts`-ის წესამდე იყო მიღებული: ახლა popover პორტალშია
   და `LAYER_POPUP`-ზე დგას, ე.ი. მოდალშიც და კალენდრის popover-შიც ზემოთაა.
   ⚠️ Radix-ის ფენები ერთმანეთს ცნობს: **`Escape` მხოლოდ ამ popover-ს ხურავს**
   და არა მოდალს; კალენდრის შიგნით დაჭერა კალენდარს არ ხურავს.

   ⚠️ **მნიშვნელობა დადასტურებამდე მონახაზია.** ბორბლის ტრიალი ველს არ
   ცვლის — `onConfirm` მხოლოდ ღილაკზე (ან Enter-ზე) იძახება, გარეთ დაჭერა და
   `Escape` კი ცვლილებას აუქმებს: მნიშვნელობა **დადასტურებისთანავე** ემატება,
   ე.ი. დამატება ერთ ცხად ქმედებაზე დგას და არა ყოველ ტრიალზე.

   ⚠️ **„ახლა"** „არჩევის" გვერდითაა — ერთი დაჭერით მიმდინარე სთ:წთ-ს ადასტურებს;
   ცარიელ ველზე ბორბლებიც მიმდინარე დროიდან იწყება (აქამდე — 09:00-იდან).
   „არჩევა" ბორბლებზე დაყენებულ დროს ატარებს („არჩევა — 14:05") — დატრიალების
   შემდეგ ჩანს, რა დაიწერება; popover `w-80`-ია, რომ ორი ღილაკი ჩარჩოში ეტეოდეს
   (`w-64`-ზე „არჩევა — სთ:წთ" ჩარჩოს სცდებოდა).
   ============================================================ */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const HOURS: WheelPickerOption<number>[] = Array.from({ length: 24 }, (_, h) => ({ value: h, label: pad(h) }))
const MINUTES: WheelPickerOption<number>[] = Array.from({ length: 60 }, (_, m) => ({ value: m, label: pad(m) }))

/** `"09:30"` → `[9, 30]`; არასწორი ან ცარიელი → `null` */
export function parseClock(value: string | null | undefined): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((value ?? '').trim())
  if (!m) return null

  const h = Number(m[1])
  const min = Number(m[2])

  return h > 23 || min > 59 ? null : [h, min]
}

/** ბორბლის სტილი — ჩვენი ტოკენებით; მონიშნული ზოლი `primary`-ის რბილი ფონია */
const WHEEL_CLASSES = {
  optionItem: 'text-muted-foreground tabular-nums',
  highlightWrapper: 'rounded-md bg-primary/10 text-foreground',
  highlightItem: 'font-semibold tabular-nums',
}

export function TimeWheelPopover({
  value,
  fallback,
  onConfirm,
  children,
  align = 'start',
  open: openProp,
  onOpenChange: onOpenChangeProp,
  autoFocus = true,
}: {
  /** რით გაიხსნას; ცარიელზე — `fallback`, მის გარეშე — მიმდინარე დრო */
  value: string | null
  fallback?: string
  onConfirm: (value: string) => void
  /** ტრიგერი (`asChild`) — ღილაკი ან ხატულა */
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  /**
   * ⚠️ **ღია მდგომარეობა გარედანაც იმართება**: `TimePicker` ბორბლებს
   * ველზე დაჭერითაც ხსნის, ტრიგერი კი ისევ საათის ხატულაა. გარეშე — ძველებურად, შიგნით.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * ⚠️ `false` — ფოკუსი popover-ში **არ** გადადის. ველიდან გახსნისას react-aria-ს
   * სეგმენტებს ფოკუსი რომ წაერთვას, აკრეფა გაწყდებოდა; ხატულიდან გახსნისას კი
   * ფოკუსი ბორბლებს სჭირდება (კლავიატურა, Enter).
   */
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const [innerOpen, setInnerOpen] = useState(false)
  const open = openProp ?? innerOpen
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)

  /* ⚠️ ყოველ გახსნაზე ველის ახლანდელი მნიშვნელობიდან იწყება — წინა გაუქმებული
     ტრიალი არ უნდა „დაბრუნდეს". ეფექტია და არა `onOpenChange`-ის შიგნით, რადგან
     კონტროლირებულ რეჟიმში გახსნა მშობლისგან მოდის და Radix-ის callback-ს არ გაივლის. */
  useEffect(() => {
    if (!open) return
    const [h, m] = parseClock(value) ?? parseClock(fallback ?? nowClock()) ?? [9, 0]
    setHour(h)
    setMinute(m)
  }, [open, value, fallback])

  const onOpenChange = (next: boolean) => {
    if (openProp === undefined) setInnerOpen(next)
    onOpenChangeProp?.(next)
  }

  const confirm = (picked = `${pad(hour)}:${pad(minute)}`) => {
    onConfirm(picked)
    onOpenChange(false)
  }

  /* Enter — დადასტურება (ბორბლებზეც). ⚠️ `preventDefault` — თორემ ფოკუსში
     მდგარი ღილაკი Enter-ზე მეორედაც დააჭერდა. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={4}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={autoFocus ? undefined : (e) => e.preventDefault()}
          className={cn(
            LAYER_POPUP,
            'fb-content w-80 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl focus:outline-none',
          )}
        >
          <WheelPickerWrapper>
            <div className="flex-1" role="group" aria-label={t('dates.hour')}>
              <WheelPicker options={HOURS} value={hour} onValueChange={setHour} infinite classNames={WHEEL_CLASSES} />
            </div>
            <span aria-hidden className="self-center px-1 text-lg font-semibold text-muted-foreground">
              :
            </span>
            <div className="flex-1" role="group" aria-label={t('dates.minute')}>
              <WheelPicker options={MINUTES} value={minute} onValueChange={setMinute} infinite classNames={WHEEL_CLASSES} />
            </div>
          </WheelPickerWrapper>

          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" variant="outline" size="sm" data-testid="time-now" onClick={() => confirm(nowClock())}>
              <Clock className="size-3.5" />
              {t('dates.now')}
            </Button>
            <Button type="button" size="sm" onClick={() => confirm()}>
              <Check className="size-3.5" />
              {t('dates.timeConfirm', { time: `${pad(hour)}:${pad(minute)}` })}
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
