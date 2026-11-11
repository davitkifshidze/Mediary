import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

/* ============================================================
   **ტექსტიანი ღილაკის იერი.**

   ⚠️ მოწმდება `Button`-ის მხარე: `outline` ჩარჩოსაც ხატავს და ფონსაც, ჰოვერზე
   იცვლება; `ghost` — არცერთს (ამიტომ მხოლოდ-აიქონ ღილაკისაა); ჩარჩოიანი აიქონი
   ფონს არ იღებს; ვიწრო ადგილის ზომა არსებობს. სად რომელი იწერება —
   `scripts/plain-buttons.mjs`-ის საქმეა (`npm run lint`).
   ============================================================ */

const classes = (props: Parameters<typeof buttonVariants>[0]) => buttonVariants(props).split(/\s+/)

describe('Button variants', () => {
  it('draws a text button with a border, a background and a hover', () => {
    const outline = classes({ variant: 'outline' })

    expect(outline).toContain('border')
    expect(outline).toContain('bg-card')
    expect(outline).toContain('not-disabled:hover:bg-muted')
  })

  it('keeps ghost bare — it is the icon-only look', () => {
    const ghost = classes({ variant: 'ghost', size: 'icon' })

    expect(ghost).not.toContain('border')
    expect(ghost.some((c) => /^bg-/.test(c))).toBe(false)
    // აიქონის ჰოვერი მხოლოდ აიქონზე ჩანს — ფონის კვადრატი არ ჩნდება
    expect(ghost).toContain('not-disabled:hover:bg-transparent')
  })

  it('gives a bordered icon button no background', () => {
    const icon = classes({ variant: 'outline', size: 'icon' })

    expect(icon).toContain('border')
    expect(icon).toContain('bg-transparent')
    // ⚠️ ორივე ერთად არ იწერება — `<a>`-ზე გამარჯვებულს CSS-ის რიგი აირჩევდა
    expect(icon).not.toContain('bg-card')
  })

  it('has a compact size for tight places', () => {
    const compact = classes({ variant: 'outline', size: 'xs' })

    expect(compact).toContain('h-7')
    expect(compact).toContain('text-xs')
  })
})
