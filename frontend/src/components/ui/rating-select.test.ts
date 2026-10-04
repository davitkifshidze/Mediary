import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **შეფასების ჩამოსაშლელი** (Tasks §42).

   შენი სიტყვები: „სელექთი, სადაც იქნებოდა 1…10 ვარსკვლავები: წინ ვარსკვლავი და
   მერე რიცხვი; და ბოლოში ვარსკვლავი და მერე ინფუთი, და შეგეძლებოდა წილადი".
   მოწმდება: „შეფასების გარეშე" + ★ 1…10, ხელით წილადი (`Enter`), მძიმე,
   გასუფთავება, სიის მიღმა შენახული 7.3 ღილაკზე ჩანს და ველში წინასწარაა.
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
  const { RatingSelect } = await import('@/components/ui/rating-select')

  function Harness() {
    const [value, setValue] = useState<number | null>(initial)
    return h(RatingSelect, {
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

const trigger = () => document.getElementById('r') as HTMLButtonElement
const options = () => [...document.querySelectorAll<HTMLButtonElement>('[data-rating-option]')]
const manual = () => document.querySelector<HTMLInputElement>('[data-rating-input]')

async function open() {
  await act(async () => trigger().click())
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('RatingSelect (§42)', () => {
  it('lists “no rating” and ★ 1 … ★ 10 with a star first and a muted “/ 10”, plus a fraction row at the end', async () => {
    await mount(null)
    expect(trigger().textContent).toContain(i18n.t('form.ratingNone'))
    expect(trigger().className).toContain('h-10')

    await open()
    const rows = options()
    expect(rows).toHaveLength(11)
    expect(rows[0].textContent).toBe(i18n.t('form.ratingNone'))
    expect(rows.slice(1).map((r) => r.textContent)).toEqual(Array.from({ length: 10 }, (_, i) => `${i + 1}/ 10`))
    // ვარსკვლავი რიცხვის წინაა
    expect(rows[5].querySelector('svg')?.nextSibling?.textContent).toBe('5')
    expect(manual()).not.toBeNull()
  })

  it('picks a whole score and shows it on the button as “★ 7 / 10”', async () => {
    const onChange = vi.fn()
    await mount(null, onChange)
    await open()

    await act(async () => options()[7].click())
    expect(onChange).toHaveBeenLastCalledWith(7)
    expect(trigger().textContent).toBe('7/ 10')
    // სია დაიხურა
    expect(options()).toHaveLength(0)
  })

  it('takes a typed fraction on Enter and accepts a comma', async () => {
    const onChange = vi.fn()
    await mount(null, onChange)

    await open()
    type(manual()!, '7.5')
    await act(async () => manual()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onChange).toHaveBeenLastCalledWith(7.5)
    expect(trigger().textContent).toBe('7.5/ 10')

    await open()
    type(manual()!, '8,25')
    await act(async () => manual()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    // მეათედამდე მრგვალდება (`parseRating`)
    expect(onChange).toHaveBeenLastCalledWith(8.3)
  })

  it('“no rating” clears the score', async () => {
    const onChange = vi.fn()
    await mount(6, onChange)
    expect(trigger().textContent).toBe('6/ 10')

    await open()
    await act(async () => options()[0].click())
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(trigger().textContent).toContain(i18n.t('form.ratingNone'))
  })

  it('a saved score outside the list (7.3) shows on the button and waits in the fraction field', async () => {
    await mount(7.3)
    expect(trigger().textContent).toBe('7.3/ 10')

    await open()
    expect(manual()!.value).toBe('7.3')
    // სიის არც ერთი რიგი არ არის მონიშნული
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(0)
  })
})
