import { useCallback, useEffect, useRef, useState } from 'react'

/* ============================================================
   **„ეკრანზე გამოჩნდა" — ერთხელ და სამუდამოდ (Tasks PERF-09).**

   ⚠️ **ჩარჩო ერთჯერადია (latch) და არა ორმხრივი გადამრთველი** და ეს
   განზრახაა: მომხმარებელს რომ უჯრა გვერდში გაესრიალა, უკან დაბრუნებაზე
   ფაილი თავიდან უნდა წამოვიდეს — `usePrivateFileUrl` კი ცვლილებაზე
   object URL-ს **ათავისუფლებს**, ე.ი. ორმხრივი დროშა ფოტოს გაქრობას და
   ხელახალ ჩამოტვირთვას ნიშნავდა.

   ⚠️ **`IntersectionObserver`-ის არარსებობა „ჩანს"-ს უდრის.** jsdom-ს ის
   არ აქვს (ე.ი. ტესტები) და ძველ ბრაუზერსაც — და ორივეგან სწორი პასუხი
   დღევანდელი ქცევაა („ყველაფერი ჩამოტვირთე"), და არა ცარიელი ბადე.

   ⚠️ **callback-ref და არა `useRef` + `useEffect`**: ასე დამკვირვებელი
   ზუსტად მაშინ ებმება, როცა DOM-კვანძი გამოჩნდა. Radix-ის
   `asChild`/`Slot` ბავშვის `ref`-ს თავისიანთან **აკომპოზიციებს**, ე.ი.
   `ContextMenuTrigger`-ის შიგნითაც მუშაობს.
   ============================================================ */

/**
 * ბუფერი: ეკრანს გარეთ დარჩენილი ერთი-ნახევარი მწკრივი წინასწარ მოდის,
 * რომ სქროლი ცარიელ უჯრებს არ აჩვენებდეს.
 */
const DEFAULT_MARGIN = '600px'

/** @returns `[ref, inView]` — `ref` კვანძზე, `inView` ერთხელ ინთება */
export function useInViewOnce<T extends Element>(
  rootMargin: string = DEFAULT_MARGIN,
): [(node: T | null) => void, boolean] {
  // ⚠️ დამკვირვებლის გარეშე — ყველაფერი „ჩანს" (იხ. ზემოთ)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  const observer = useRef<IntersectionObserver | null>(null)

  const stop = useCallback(() => {
    observer.current?.disconnect()
    observer.current = null
  }, [])

  const ref = useCallback(
    (node: T | null) => {
      stop()
      if (!node || typeof IntersectionObserver === 'undefined') return

      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          setInView(true)
          // ერთხელ გამოჩნდა — მეტი დაკვირვება უსაქმოა
          stop()
        },
        { rootMargin },
      )

      io.observe(node)
      observer.current = io
    },
    [rootMargin, stop],
  )

  useEffect(() => stop, [stop])

  return [ref, inView]
}
