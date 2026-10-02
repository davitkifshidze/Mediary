import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **ვარსკვლავებით შეფასება** (Tasks §9).

   ⚠️ მოწმდება: შევსება მეათედამდე (4.6 → მესამე ვარსკვლავის 30 %), ნახევარზე
   დაჭერა ნახევარია (1 ქულა), სავსეზე — ორი, ხელით აკრეფილი „4.6" ქულად
   იქცევა და ვარსკვლავებს ავსებს, ✕ ასუფთავებს, „7 / 10" და „4.6 / 10"
   ერთი ფორმატითაა, ბეჯი „★ 4.6"-ს წერს.
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

async function mount(initial: number | null, onChange: (v: number | null) => void = () => {}) {
  const { StarRating } = await import('@/components/ui/star-rating')

  function Harness() {
    const [value, setValue] = useState<number | null>(initial)
    return h(StarRating, {
      id: 'r',
      value,
      onChange: (v: number | null) => {
        setValue(v)
        onChange(v)
      },
    })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Harness)))
  return container
}

/** ვარსკვლავის ღილაკზე დაჭერა კურსორის პოზიციით (`clientX` ღილაკის სიგანის წილით) */
async function clickStar(el: HTMLElement, index: number, fraction: number) {
  const button = el.querySelectorAll<HTMLButtonElement>('[role="group"] button')[index]
  button.getBoundingClientRect = () => ({ left: 100, width: 24, top: 0, height: 24, right: 124, bottom: 24, x: 100, y: 0, toJSON: () => ({}) })
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 + 24 * fraction, detail: 1 }))
  })
}

/** შევსების ფენების `clip-path` მარჯვენა მოჭრა პროცენტებში, ვარსკვლავების რიგით */
function fills(el: HTMLElement): number[] {
  return [...el.querySelectorAll<HTMLElement>('[role="group"] button')].map((b) => {
    const layer = b.querySelector<HTMLElement>('[data-testid="star-fill"]')
    if (!layer) return 0
    const m = /inset\(0 ([\d.]+)% 0 0\)/.exec(layer.style.clipPath)
    return m ? 100 - Number(m[1]) : 100
  })
}

describe('StarRating', () => {
  it('fills the stars to the tenth and writes the score as "4.6 / 10"', async () => {
    const el = await mount(4.6)
    expect(fills(el)).toEqual([100, 100, 30, 0, 0])
    expect(el.querySelector('[data-testid="star-rating-score"]')?.textContent).toBe('4.6 / 10')
    expect(el.querySelector<HTMLInputElement>('input')?.value).toBe('4.6')
  })

  it('the left half of a star is one point, the right half two', async () => {
    const onChange = vi.fn()
    const el = await mount(null, onChange)
    expect(el.querySelector('[data-testid="star-rating-score"]')?.textContent).toBe(i18n.t('form.ratingNone'))

    await clickStar(el, 0, 0.25)
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(fills(el)).toEqual([50, 0, 0, 0, 0])

    await clickStar(el, 3, 0.75)
    expect(onChange).toHaveBeenLastCalledWith(8)
    expect(fills(el)).toEqual([100, 100, 100, 100, 0])
    expect(el.querySelector('[data-testid="star-rating-score"]')?.textContent).toBe('8 / 10')
    // ველიც მიჰყვება
    expect(el.querySelector<HTMLInputElement>('input')?.value).toBe('8')
  })

  it('a typed decimal becomes the score and fills the stars; empty clears', async () => {
    const onChange = vi.fn()
    const el = await mount(null, onChange)
    const input = el.querySelector<HTMLInputElement>('input')!

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, '4.6')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(4.6)
    expect(fills(el)).toEqual([100, 100, 30, 0, 0])

    await act(async () => {
      setter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(fills(el)).toEqual([0, 0, 0, 0, 0])
  })

  it('the clear button removes the score and disappears', async () => {
    const onChange = vi.fn()
    const el = await mount(7, onChange)
    const clear = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('rating.clear')}"]`)
    expect(clear).toBeTruthy()

    await act(async () => clear!.click())
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(el.querySelector(`button[aria-label="${i18n.t('rating.clear')}"]`)).toBeNull()
    expect(el.querySelector<HTMLInputElement>('input')?.value).toBe('')
  })
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
})
