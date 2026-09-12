import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   გვერდის საერთო კონტეინერი (Tasks 2.1).

   ადრე თითო გვერდს თავისი `max-w-*` ჰქონდა (3xl…7xl), ამიტომ ერთი
   მოდულიდან მეორეზე გადასვლისას შიგთავსი „ხტებოდა". ახლა სიგანე
   **ერთ ადგილას** იწერება — გვერდი მხოლოდ `width`-ს ირჩევს.
   ============================================================ */

/** `wide` — ბადეები, ცხრილები, დეტალები · `narrow` — ფორმები (გრძელი ხაზი კითხვას აფუჭებს) */
export type PageWidth = 'wide' | 'narrow'

const WIDTH: Record<PageWidth, string> = {
  wide: 'max-w-7xl 2xl:max-w-[1600px]',
  narrow: 'max-w-4xl',
}

/** კლასი მათთვის, ვინც `<main>`-ს თვითონ აწყობს (მაგ. sticky ჰედერიანი გვერდი) */
export function pageContainer(width: PageWidth = 'wide', className?: string) {
  return cn('mx-auto w-full px-4 sm:px-6 lg:px-8', WIDTH[width], className)
}

export function PageContainer({
  width = 'wide',
  className,
  children,
}: {
  width?: PageWidth
  className?: string
  children: ReactNode
}) {
  return <main className={pageContainer(width, cn('py-6 sm:py-8', className))}>{children}</main>
}
