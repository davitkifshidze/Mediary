import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   სიმაღლის რბილი ცვლილება (Tasks §7.3/§7.4 → Tasks §5).

   შენი მოთხოვნა: „შიგნით რამის გაკეთების შემდეგ ზომები რბილად
   იცვლებოდეს". ⚠️ `height: auto` CSS-ით არ ანიმირდება, ხოლო
   `interpolate-size` ყველა ბრაუზერში ჯერ არ მუშაობს — ამიტომ შიგთავსს
   `ResizeObserver` ზომავს და გარე ყუთი **პიქსელურ** `height`-ს იღებს,
   რომელზეც CSS-გადასვლა მუშაობს (`.fb-autoheight`, `index.css`).

   ⚠️ **პირველი გაზომვა არ ანიმირდება**: გახსნისას ფანჯარა 0-დან არ
   უნდა „ამოიზარდოს" — ამოხტომის ანიმაცია (`.fb-content`) უკვე არსებობს.
   გადასვლა მხოლოდ მეორე გაზომვიდან ირთვება.

   ⚠️ **`max-h`-ს არ ეჯახება**: `scroll` რეჟიმში გარე ყუთი flex-ის
   ელემენტია `min-h-0`-ით, ე.ი. მშობლის ზღვარს მიღწეული ზრდას წყვეტს
   და შიგნით გადახვევას იწყებს — სიმაღლე მხოლოდ ზღვრამდე იცვლება.

   ## Tasks §5 — „პატარა, ცარიელი სქროლი" (ბუკმარკის რედაქტირება)
   ⚠️ **წილადი სიმაღლე ზევით მრგვალდება** (`fitHeight`): `offsetHeight`
   მთელი რიცხვია და Windows-ის 125/150 % მასშტაბზე 612.4 px-იანი შიგთავსი
   612-ზე დგებოდა — ~1 px გადმოდიოდა და გადახვევის ზოლი ჩნდებოდა, რომელიც
   არაფერს სქროლავდა. ახლა `getBoundingClientRect().height` + `ceil` + 1 px მარაგი.
   ⚠️ **ზრდის ანიმაციისას გადახვევა გამორთულია** (`settling`): 200 ms-ში
   შიგთავსი ყუთზე მაღალია და ზოლი ციმციმებდა — `transitionend`-ზე (ან
   სათადარიგო ტაიმერით) ბრუნდება.
   ⚠️ **0 არ ითვლება**: ზემოდან გახსნილი დიალოგი ამ მოდალს მალავს და
   გაზომვა 0-ს აბრუნებს — ბოლო ცნობილი სიმაღლე რჩება, თორემ დაბრუნებისას
   ფანჯარა 0-დან „ამოიზრდებოდა".

   ⚠️ `prefers-reduced-motion`-ზე გადასვლა CSS-შივე ითიშება.
   ============================================================ */

/** გაზომილი სიმაღლე → ყუთის სიმაღლე: ზევით დამრგვალება + 1 px; 0/უსასრულო → `null` */
export function fitHeight(measured: number): number | null {
  if (!Number.isFinite(measured) || measured <= 0) return null
  return Math.ceil(measured) + 1
}

/** გადასვლის ხანგრძლივობაზე ოდნავ მეტი — `transitionend` რომ არ მოვიდეს (reduced motion) */
const SETTLE_FALLBACK_MS = 260

export function AutoHeight({
  children,
  className,
  innerClassName,
  scroll,
}: {
  children: ReactNode
  /** გარე ყუთის კლასი */
  className?: string
  /** გასაზომი შიგთავსის კლასი (აქ დგას პადინგი, რომ გაზომვაში შევიდეს) */
  innerClassName?: string
  /** გარე ყუთი თვითონ გადაიხვევა (მოდალის სხეული) */
  scroll?: boolean
}) {
  const inner = useRef<HTMLDivElement>(null)
  const last = useRef<number | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [animate, setAnimate] = useState(false)
  const [settling, setSettling] = useState(false)

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return

    const measure = () => {
      const next = fitHeight(el.getBoundingClientRect().height)
      if (next == null || next === last.current) return false
      last.current = next
      setHeight(next)
      return true
    }

    measure()
    // jsdom-ში `ResizeObserver` არ არსებობს — იქ უბრალოდ `auto` რჩება
    if (typeof ResizeObserver === 'undefined') return

    let timer: number | undefined
    const ro = new ResizeObserver(() => {
      if (!measure()) return
      setAnimate(true)
      setSettling(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSettling(false), SETTLE_FALLBACK_MS)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={cn(
        scroll ? cn('min-h-0', settling ? 'overflow-hidden' : 'overflow-y-auto') : 'overflow-hidden',
        animate && 'fb-autoheight',
        className,
      )}
      style={height == null ? undefined : { height }}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'height') setSettling(false)
      }}
    >
      <div ref={inner} className={innerClassName}>
        {children}
      </div>
    </div>
  )
}
