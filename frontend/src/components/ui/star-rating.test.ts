import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ქულის ჩვენება** (მინიჭება — `RatingSelect`, თავისი ტესტით).

   ⚠️ მოწმდება: დეტალის ვარსკვლავები მეათედამდე ივსება და „7 / 10" ერთი
   ფორმატითაა, ბეჯი „★ 4.6"-ს წერს, ქულის გარეშე არაფერი იხატება.
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

describe('RatingStars and RatingBadge', () => {
  it('render the same score format and nothing for a missing score', async () => {
    const { RatingBadge, RatingStars } = await import('@/components/ui/star-rating')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () =>
      root!.render(
        h('div', null, h(RatingStars, { value: 7 }), h(RatingBadge, { value: 4.6, size: 'row' }), h(RatingStars, { value: null })),
      ),
    )

    const stars = container.querySelectorAll('[data-testid="rating-stars"]')
    expect(stars).toHaveLength(1)
    expect(stars[0].textContent).toBe('7 / 10')
    expect(stars[0].querySelectorAll('[data-testid="star-fill"]')).toHaveLength(4)

    const badge = container.querySelector('span.h-9')
    expect(badge?.textContent).toBe('4.6')
    expect(badge?.querySelector('svg')).toBeTruthy()
  })

  it('fills a star to the tenth (4.6 → the third star 30 %)', async () => {
    const { RatingStars } = await import('@/components/ui/star-rating')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => root!.render(h(RatingStars, { value: 4.6 })))

    const clips = [...container.querySelectorAll<HTMLElement>('[data-testid="star-fill"]')].map((el) => el.style.clipPath)
    expect(clips).toEqual(['inset(0 0% 0 0)', 'inset(0 0% 0 0)', 'inset(0 70% 0 0)'])
    expect(container.textContent).toBe('4.6 / 10')
  })
})
