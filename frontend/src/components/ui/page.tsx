import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   გვერდის საერთო კონტეინერი.

   ადრე თითო გვერდს თავისი `max-w-*` ჰქონდა (3xl…7xl), ამიტომ ერთი
   მოდულიდან მეორეზე გადასვლისას შიგთავსი „ხტებოდა". ახლა სიგანე
   **ერთ ადგილას** იწერება — გვერდი მხოლოდ `width`-ს ირჩევს.
   ============================================================ */

/** `wide` — ბადეები, ცხრილები, დეტალები · `narrow` — ფორმები (გრძელი ხაზი კითხვას აფუჭებს) */
export type PageWidth = 'wide' | 'narrow'

/* ⚠️ **`wide` პრაქტიკულად ფანჯარას მიჰყვება.** `<main>` ეკრანია მინუს
   საიდბარი (240px): 2xl-მდე (<1536px) ის ≤ 1296px-ია, ე.ი. 1600-იანი ზღვარი
   არასდროს იკრავს; 2xl-ზე 1920 მხოლოდ ≥ 2160px ეკრანზე იწყებს ცენტრირებას.
   აქამდე (1280/1600) 1920px-იან მონიტორზე გვერდი ორივე მხარეს ცარიელ ზოლებს
   ტოვებდა. ⚠️ `Header.tsx` ძებნას იმავე კლასით აწყობს — ცენტრირების ზღვარი
   (2160 = 1920 + 240) იქაც ჩანს. */
const WIDTH: Record<PageWidth, string> = {
  wide: 'max-w-[1600px] 2xl:max-w-[1920px]',
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
