import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'

/* ============================================================
   **ხანგრძლივობის ველი — ერთი ჩარჩო, ერთი ხაზი**.

   შენი სიტყვები: „საათებს რომ ვაწვები, ერთი ინფუთი რომ ემატება, საათების
   გარეშე ქვევით ხტება და რეალურად შეყვანილი დრო კი კიდევ უფრო ქვევით".
   მოწმდება: ერთი ჩარჩო; საათის სეგმენტი ყოველთვის ჩანს (ჩასართავი ღილაკი
   აღარ არის — ე.ი. ჩართვაზე სიგანე არ იცვლება); ჯამი ჩარჩოს შიგნითაა;
   ≥ 1 სთ სწორად იშლება და გადავარდნა ნორმალიზდება.
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

async function mount(props: Record<string, unknown>) {
  const { DurationInput } = await import('@/components/ui/duration-input')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(h(DurationInput, { value: null, onChange: () => {}, ...props } as Parameters<typeof DurationInput>[0])),
  )
  return container
}

const inputs = (el: HTMLElement) => [...el.querySelectorAll('input')] as HTMLInputElement[]

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DurationInput', () => {
  it('is one h-10 frame with the hours segment always there — no toggle button', async () => {
    const el = await mount({ id: 'd' })
    const frames = el.querySelectorAll('[data-testid="duration-input"]')
    expect(frames).toHaveLength(1)
    expect(frames[0].className).toContain('h-10')
    expect(frames[0].className).toContain('flex-nowrap')
    // სთ · წთ · წმ — ჩარჩოს შიგნით, ღილაკი არ არის
    expect(inputs(el)).toHaveLength(3)
    expect(el.querySelector('button')).toBeNull()
    expect(inputs(el)[0].id).toBe('d')
  })

  it('splits ≥ 1 h correctly and shows the total inside the frame', async () => {
    const el = await mount({ value: 3930 })
    expect(inputs(el).map((i) => i.value)).toEqual(['1', '5', '30'])
    const total = el.querySelector('[data-testid="duration-total"]')!
    expect(total.textContent).toBe('1:05:30')
    expect(el.querySelector('[data-testid="duration-input"]')!.contains(total)).toBe(true)
  })

  it('minutes mode (film) has no seconds segment and words the total', async () => {
    const el = await mount({ value: 135, unit: 'minutes' })
    expect(inputs(el)).toHaveLength(2)
    expect(inputs(el).map((i) => i.value)).toEqual(['2', '15'])
    expect(el.querySelector('[data-testid="duration-total"]')?.textContent).toBe('2 სთ 15 წთ')
  })

  it('typing in hours emits seconds and nothing is added to the frame', async () => {
    const onChange = vi.fn()
    const el = await mount({ onChange })
    const before = el.querySelector('[data-testid="duration-input"]')!.children.length

    type(inputs(el)[0], '2')
    expect(onChange).toHaveBeenLastCalledWith(7200)
    type(inputs(el)[1], '3')
    expect(onChange).toHaveBeenLastCalledWith(7380)

    // ჯამი დაემატა — სხვა არაფერი (სეგმენტები იგივეა)
    expect(inputs(el)).toHaveLength(3)
    expect(el.querySelector('[data-testid="duration-input"]')!.children.length).toBe(before + 1)
  })

  it('normalises an overflow on blur: 90 min → 1 h 30 min', async () => {
    const { DurationInput } = await import('@/components/ui/duration-input')
    function Harness() {
      const [v, setV] = useState<number | null>(null)
      return h(DurationInput, { value: v, onChange: setV, unit: 'minutes' })
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(h(Harness)))

    const [hours, minutes] = inputs(container)
    type(minutes, '90')
    act(() => minutes.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))

    expect(hours.value).toBe('1')
    expect(minutes.value).toBe('30')
  })

  it('a min–max pair carries its prefix inside each frame', async () => {
    const el = await mount({ unit: 'minutes', prefix: 'მინ.' })
    expect(el.querySelector('[data-testid="duration-input"]')!.textContent).toContain('მინ.')
    expect(inputs(el)[0].getAttribute('aria-label')).toContain('მინ.')
  })
})
