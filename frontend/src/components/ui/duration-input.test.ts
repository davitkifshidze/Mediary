import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **ხანგრძლივობა — ერთი ველი (წამები) და მზა ვარიანტები (წუთები)**.

   შენი სიტყვები: „ვიდეოს ხანგრძლივობა ესეთი ინფუთი საშინელებაა". მოწმდება:
   ტექსტის ყველა ფორმა (`1:05:30`, `65:30`, `90`, `1სთ 5წთ`, `1h 5m`), ექო,
   ველიდან გასვლისას ფორმატირება, წაუკითხავი ტექსტი (წითელი ჩარჩო, მნიშვნელობა
   არ იცვლება), ბორბლები მხოლოდ დადასტურებაზე; წუთებში — მზა ვარიანტები,
   „სხვა" სიაში არარსებულზე და „არ არის" = `null`.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/ui/duration-input')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** ველი თავისი მდგომარეობით — როგორც ფორმაში */
async function mount(props: Record<string, unknown> = {}, onChange = vi.fn()) {
  const { DurationInput } = await import('@/components/ui/duration-input')
  function Harness() {
    const [v, setV] = useState<number | null>((props.value as number | null) ?? null)
    return h(DurationInput, {
      ...props,
      value: v,
      onChange: (next: number | null) => {
        setV(next)
        onChange(next)
      },
    } as Parameters<typeof DurationInput>[0])
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Harness)))
  await flush()
  return { el: container, onChange }
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const field = (el: HTMLElement) => el.querySelector<HTMLInputElement>('[data-testid="duration-input"] input')!
const echo = (el: HTMLElement) => el.querySelector('[data-testid="duration-total"]')?.textContent ?? null

describe('parseDuration', () => {
  it('reads every written form and refuses what it cannot read', async () => {
    const { parseDuration } = await import('@/components/ui/duration-input')

    expect(parseDuration('1:05:30')).toBe(3930)
    expect(parseDuration('65:30')).toBe(3930)
    expect(parseDuration('90')).toBe(90)
    expect(parseDuration('1სთ 5წთ')).toBe(3900)
    expect(parseDuration('1 საათი 5 წუთი 30 წამი')).toBe(3930)
    expect(parseDuration('1h 5m 30s')).toBe(3930)
    expect(parseDuration('  ')).toBeNull()
    expect(parseDuration('0')).toBeNull()
    // წუთი/წამი 60-ზე მეტი — ბოლო ნაწილებში შეცდომაა
    expect(parseDuration('1:75')).toBeUndefined()
    expect(parseDuration('1:61:00')).toBeUndefined()
    expect(parseDuration('abc')).toBeUndefined()
    expect(parseDuration('5 dogs')).toBeUndefined()
  })
})

describe('DurationInput — seconds', () => {
  it('is one field showing the formatted value, with the id on the input', async () => {
    const { el } = await mount({ id: 'd', value: 3930 })

    expect(el.querySelectorAll('[data-testid="duration-input"] input')).toHaveLength(1)
    expect(field(el).id).toBe('d')
    expect(field(el).value).toBe('1:05:30')
    // ფორმატირებულზე ექო ზედმეტია
    expect(echo(el)).toBeNull()
  })

  it('typing emits seconds, echoes how it read it and formats on blur', async () => {
    const { el, onChange } = await mount()

    type(field(el), '90')
    expect(onChange).toHaveBeenLastCalledWith(90)
    expect(echo(el)).toBe('= 1:30')

    type(field(el), '1სთ 5წთ')
    expect(onChange).toHaveBeenLastCalledWith(3900)

    act(() => field(el).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(field(el).value).toBe('1:05:00')
    expect(echo(el)).toBeNull()
  })

  it('unreadable text marks the frame and keeps the last good value', async () => {
    const { el, onChange } = await mount({ value: 60 })

    type(field(el), 'abc')
    expect(onChange).not.toHaveBeenCalled()
    expect(el.querySelector('[data-testid="duration-input"]')!.className).toContain('border-destructive')
    expect(echo(el)).toBe(i18n.t('duration.invalid'))

    // ცარიელი = „მითითებული არაა"
    type(field(el), '')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('the clock opens h/m/s wheels that change the value only on confirm', async () => {
    const { el, onChange } = await mount({ value: 3930 })

    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="duration-wheel"]')!.click())
    await flush()
    expect(onChange).not.toHaveBeenCalled()

    const confirm = document.querySelector<HTMLButtonElement>('[data-testid="duration-wheel-confirm"]')!
    expect(confirm.textContent).toContain('1:05:30')
    await act(async () => confirm.click())

    expect(onChange).toHaveBeenLastCalledWith(3930)
    expect(document.querySelector('[data-testid="duration-wheel-confirm"]')).toBeNull()
  })
})

describe('DurationInput — minutes', () => {
  const trigger = (el: HTMLElement) => el.querySelector('[role="combobox"]')!

  it('a preset shows in words, an off-list value opens "other", empty is "none"', async () => {
    let mounted = await mount({ unit: 'minutes', value: 90 })
    expect(trigger(mounted.el).textContent).toContain('1 სთ 30 წთ')
    act(() => root?.unmount())
    mounted.el.remove()

    mounted = await mount({ unit: 'minutes', value: 142 })
    expect(trigger(mounted.el).textContent).toContain(i18n.t('numberPick.other'))
    expect(mounted.el.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('142')
    act(() => root?.unmount())
    mounted.el.remove()

    mounted = await mount({ unit: 'minutes', value: null, prefix: 'მინ.' })
    expect(trigger(mounted.el).textContent).toContain(i18n.t('duration.none'))
    expect(mounted.el.querySelector('[data-testid="duration-input"]')!.textContent).toContain('მინ.')
  })
})
