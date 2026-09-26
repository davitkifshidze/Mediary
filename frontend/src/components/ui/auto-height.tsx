import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   სიმაღლის რბილი ცვლილება (Tasks §7.3/§7.4).

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

   ⚠️ `prefers-reduced-motion`-ზე გადასვლა CSS-შივე ითიშება.
   ============================================================ */

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
  const [height, setHeight] = useState<number | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    // jsdom-ში `ResizeObserver` არ არსებობს — იქ უბრალოდ `auto` რჩება
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      measure()
      setAnimate(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className={cn(
        scroll ? 'min-h-0 overflow-y-auto' : 'overflow-hidden',
        animate && 'fb-autoheight',
        className,
      )}
      style={height == null ? undefined : { height }}
    >
      <div ref={inner} className={innerClassName}>
        {children}
      </div>
    </div>
  )
}
