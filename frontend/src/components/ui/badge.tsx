import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   ბეჯი — პატარა პილული სტატუსისთვის, შეფასებისთვის და მისთანებისთვის
   (2026-09-14).

   ⚠️ **ის იმიტომ გაჩნდა, რომ პადინგი ერთ ადგილას იყოს.** ზუსტად ერთი და
   იგივე სტრიქონი — `rounded-[5px] px-1.5 py-0.5 text-xs` — ხელით ეწერა
   შენიშვნების, წიგნების, თამაშების, სამაგიდო თამაშებისა და ვიდეოების სიებს;
   „ღია"/„დაარქივებული" სწორედ ესენია. ხუთ ადგილას ხელით გაზრდა ნიშნავს, რომ
   მეექვსე დღეს დაშორდება.

   ⚠️ **ფონის ფერს გამომძახებელი წერს** (`STATUS_BADGE` / `STATUS_TONE` /
   `bg-secondary`): ტონების რუკები უკვე არსებობს და აქ მათი მესამე ასლი
   არ იბადება.

   ⚠️ **`rounded-md` და არა `rounded-[5px]`** — რადიუსი ერთი ტოკენია
   (`index.css`-ის `@theme inline`); ლიტერალი მას გვერდს უვლის.
   ============================================================ */

export function Badge({ className, children, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
