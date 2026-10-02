import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **მოდალის „პატარა, ცარიელი სქროლი"** (Tasks §5).

   ⚠️ ზოლს წილადი სიმაღლე აჩენდა: `offsetHeight` 612.4-ს 612-ად კითხულობდა და
   ~1 px გადმოდიოდა. jsdom განლაგებას არ ითვლის, ამიტომ მოწმდება წმინდა
   ფუნქცია (`fitHeight`) და ის, რომ `autoGrow` ველი ხელით გაწელვას არ უშვებს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe('fitHeight', () => {
  it('rounds a fractional height up and keeps a 1px margin', async () => {
    const { fitHeight } = await import('@/components/ui/auto-height')

    expect(fitHeight(612.4)).toBe(614)
    expect(fitHeight(612)).toBe(613)
  })

  it('ignores a hidden (0) or broken measurement', async () => {
    const { fitHeight } = await import('@/components/ui/auto-height')

    expect(fitHeight(0)).toBeNull()
    expect(fitHeight(Number.NaN)).toBeNull()
    expect(fitHeight(-3)).toBeNull()
  })
})

describe('Textarea autoGrow', () => {
  it('renders without a resize handle and keeps the row floor', async () => {
    const { Textarea } = await import('@/components/ui/textarea')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(h(Textarea, { rows: 4, autoGrow: true, value: 'x', onChange: () => {} })))

    const el = container.querySelector('textarea')!
    expect(el.className).toContain('resize-none')
    expect(el.rows).toBe(4)
    // jsdom-ში `scrollHeight` 0-ია — ინლაინ სიმაღლე არ იწერება
    expect(el.style.height).toBe('')
  })
})
