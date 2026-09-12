import { useEffect, useRef, useState } from 'react'

/* ============================================================
   რიცხვის „ნელა დათვლა" 0-დან სამიზნემდე (Tasks 2.1 / 19.10).

   `requestAnimationFrame`-ზეა და არა `setInterval`-ზე: ინტერვალი კადრს
   ჩამორჩება და რიცხვი ხტუნავს. მოძრაობა ბოლოსკენ ნელდება (ease-out),
   ე.ი. ბოლო ციფრები „დაჯდომას" ჰგავს.
   ============================================================ */

/** მთელი ანიმაციის ხანგრძლივობა, ms */
const DURATION = 1200

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export function useCountUp(target: number, duration = DURATION): number {
  const [value, setValue] = useState(0)
  const frame = useRef<number>(0)

  useEffect(() => {
    if (target <= 0) {
      setValue(target)
      return
    }

    // მომხმარებელმა ანიმაციები გამორთო — მაშინვე საბოლოო რიცხვი
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    let start: number | null = null

    const step = (now: number) => {
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      setValue(Math.round(easeOut(progress) * target))
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])

  return value
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const shown = useCountUp(value)

  return (
    <span className={className} aria-label={String(value)}>
      {shown.toLocaleString()}
    </span>
  )
}
