import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   სიმაღლის რბილი ცვლილება.

   შენი მოთხოვნა: „შიგნით რამის გაკეთების შემდეგ ზომები რბილად
   იცვლებოდეს". ⚠️ `height: auto` CSS-ით არ ანიმირდება, ხოლო
   `interpolate-size` ყველა ბრაუზერში ჯერ არ მუშაობს — ამიტომ შიგთავსს
   `ResizeObserver` ზომავს და გარე ყუთი **პიქსელურ** `height`-ს იღებს,
   რომელზეც CSS-გადასვლა მუშაობს (`.fb-autoheight`, `index.css`).

   ⚠️ **პირველი გაზომვა არ ანიმირდება**: გახსნისას ფანჯარა 0-დან არ
   უნდა „ამოიზარდოს" — ამოხტომის ანიმაცია (`.fb-content`) უკვე არსებობს.

   ⚠️ **`max-h`-ს არ ეჯახება**: `scroll` რეჟიმში გარე ყუთი flex-ის
   ელემენტია `min-h-0`-ით, ე.ი. მშობლის ზღვარს მიღწეული ზრდას წყვეტს
   და შიგნით გადახვევას იწყებს — სიმაღლე მხოლოდ ზღვრამდე იცვლება.

   ⚠️ **0 არ ითვლება**: ზემოდან გახსნილი დიალოგი ამ მოდალს მალავს და
   გაზომვა 0-ს აბრუნებს — ბოლო ცნობილი სიმაღლე რჩება, თორემ დაბრუნებისას
   ფანჯარა 0-დან „ამოიზრდებოდა".

   ## „ხტუნაობს, ცახცახებს, სქროლს უკეთებს" (ოთხი მიზეზი, ოთხი წესი)
   1. **გაზომვა ტრანსფორმაციის გარეშე** (`layoutHeight`): გახსნისას ფანჯარა
      `scale(0.96)`-დანაა, `getBoundingClientRect` კი ტრანსფორმაციას ითვლიდა —
      პირველი გაზომვა ~4%-ით მოკლე იყო და ფანჯარა ასე რჩებოდა. ახლა
      განლაგების სიმაღლე წილადით (`getComputedStyle`), ზევით მრგვალდება
      (მაგ. 612.4 px → 613); „+1 px"-ის მარაგი აღარ სჭირდება.
   2. **შიდა ყუთი მარჯინს აღარ უშვებს** (`flow-root`): ზედა პადინგი არ
      აქვს, ამიტომ პირველი შვილის `mt-4` მისგან „გადმოდიოდა" — გაზომვაში
      არ შედიოდა და პატარა ფანჯარაშიც ~15 px-იანი სქროლი ჩნდებოდა.
   3. **სქროლბარი სიგანეს აღარ ცვლის** (`scrollbar-gutter: stable`,
      `.fb-modal-body`): ზოლი სიგანეს ჭამდა → `aspect-video`/გადატანილი
      ტექსტი სიმაღლეს იცვლიდა → ახალი გაზომვა → `overflow-hidden` → ზოლი
      ქრებოდა → … ყოველ ~250 ms-ში, უსასრულოდ. ზოლის ადგილი ახლა მუდმივია
      (მისი სიგანე `--sb-gutter`-ად იწერება, რომ მოდალმა მარჯვენა პადინგს
      გამოაკლოს და კიდეები სიმეტრიული დარჩეს).
   4. **სქროლი ყოველთვის მუშაობს**: სხეული მუდამ `overflow-y-auto`-ა.
      ზრდის ანიმაციისას შიგთავსი ~200 ms-ით ყუთზე მაღალია — ზოლი ამ დროს
      მხოლოდ **ვიზუალურად** იმალება (`data-settling` → `clip-path` ზოლის
      ზოლზე), განლაგება და ბორბალი კი უცვლელია. ⚠️ ზოლი არ იმალება, თუ
      ყუთი უკვე ზღვარზე იყო (ზოლი ლეგიტიმურად ჩანდა) — თორემ ციმციმებდა.
   ⚠️ **რამდენიმე px-ის რყევა უანიმაციოდ** (`JITTER_PX`); გაშვებულ
   ანიმაციას კი პატარა ცვლილებაც აგრძელებს, თორემ შუა გზაზე გაწყდებოდა.

   ⚠️ `prefers-reduced-motion`-ზე გადასვლა CSS-შივე ითიშება.
   ============================================================ */

/** ელემენტის **განლაგების** სიმაღლე — წილადით და ტრანსფორმაციის (`scale`) გარეშე */
export function layoutHeight(el: HTMLElement): number {
  const h = Number.parseFloat(getComputedStyle(el).height)
  return Number.isFinite(h) ? h : el.offsetHeight
}

/** გაზომილი სიმაღლე → ყუთის სიმაღლე: ზევით დამრგვალება; 0/უსასრულო → `null` */
export function fitHeight(measured: number): number | null {
  if (!Number.isFinite(measured) || measured <= 0) return null
  return Math.ceil(measured)
}

/** ამაზე ნაკლები ცვლილება უანიმაციოდ იწერება */
const JITTER_PX = 4

/** ანიმირდეს თუ არა: პირველი გაზომვა — არა; რყევა — არა; გაშვებული ანიმაცია — კი */
export function shouldAnimate(prev: number | null, next: number, running: boolean): boolean {
  if (prev == null) return false
  return running || Math.abs(next - prev) > JITTER_PX
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
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const last = useRef<number | null>(null)
  const running = useRef(false)
  const [height, setHeight] = useState<number | null>(null)
  const [animate, setAnimate] = useState(false)
  const [settling, setSettling] = useState(false)

  const settle = () => {
    running.current = false
    setSettling(false)
  }

  useLayoutEffect(() => {
    const box = outer.current
    const el = inner.current
    if (!box || !el) return
    let timer: number | undefined

    const measure = () => {
      /* ზოლის ადგილი (`scrollbar-gutter: stable`-ით ზოლის გარეშეც დაკავებულია).
         ⚠️ **პირდაპირ DOM-ში და სიმაღლის გაზომვამდე**: state-ით პადინგი ერთი
         რენდერით გვიან შეიცვლებოდა — პირველი გაზომვა ძველ პადინგს დაინახავდა
         და გახსნისთანავე ზედმეტი ანიმაცია მოჰყვებოდა. */
      if (scroll) {
        const gutter = `${Math.max(0, box.offsetWidth - box.clientWidth)}px`
        if (box.style.getPropertyValue('--sb-gutter') !== gutter) box.style.setProperty('--sb-gutter', gutter)
      }

      const next = fitHeight(layoutHeight(el))
      const prev = last.current
      if (next == null || next === prev) return
      last.current = next

      const anim = shouldAnimate(prev, next, running.current)
      setAnimate(anim)
      setHeight(next)
      if (!anim) return

      // ზრდისას შიგთავსი ანიმაციის ბოლომდე ყუთზე მაღალია — ზოლი დროებით იმალება,
      // თუ ყუთი ზღვარზე უკვე არ იყო (მაშინ ზოლი ისედაც ჩანდა და უნდა დარჩეს)
      if (scroll && prev != null && next > prev && prev <= box.clientHeight + 1) setSettling(true)
      running.current = true
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        running.current = false
        setSettling(false)
      }, SETTLE_FALLBACK_MS)
    }

    measure()
    // jsdom-ში `ResizeObserver` არ არსებობს — იქ უბრალოდ `auto` რჩება
    if (typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(measure)
    ro.observe(el)

    return () => {
      ro.disconnect()
      window.clearTimeout(timer)
    }
  }, [scroll])

  return (
    <div
      ref={outer}
      data-settling={settling || undefined}
      className={cn(scroll ? 'min-h-0 overflow-y-auto' : 'overflow-hidden', animate && 'fb-autoheight', className)}
      // ⚠️ `--sb-gutter`-ს `measure` წერს — React-ის `style`-ში არ უნდა იყოს, თორემ გადაეწერება
      style={height == null ? undefined : { height }}
      onTransitionEnd={(e) => {
        // ⚠️ მხოლოდ საკუთარი გადასვლა — ჩადგმული `AutoHeight`-ის მოვლენაც ამოდის აქამდე
        if (e.target === e.currentTarget && e.propertyName === 'height') settle()
      }}
    >
      <div ref={inner} className={cn('flow-root', innerClassName)}>
        {children}
      </div>
    </div>
  )
}
