import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **ჩემი შეფასება — 1…10 + „გარეშე"** (Tasks §25.2–§25.4).

   ⚠️ ორი რამ მხოლოდ მონტირებით ჩანს: „გარეშე" `null`-ს აბრუნებს (და არა
   ცარიელ სტრიქონს ან 0-ს — ეს §4.8-ის გასუფთავების მეორე ნახევარია), და
   სიის მიღმა არსებული მნიშვნელობა ტრიგერში რჩება (წიგნის ენის
   პრეცედენტი: ცარიელად დახატული ველი პირველივე შენახვაზე წაიშლებოდა).
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// Radix Select მონიშნულ რიგს ეკრანზე აბრუნებს — jsdom-ს ეს მეთოდი არ აქვს
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

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
  await flush()
}

const trigger = () => document.querySelector<HTMLButtonElement>('#r')!

async function open() {
  await act(async () => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await flush()
}

const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
const text = (el: Element) => (el.textContent ?? '').replace(/\s/g, '')
const option = (label: string) => options().find((o) => text(o) === label.replace(/\s/g, ''))

describe('RatingSelect', () => {
  it('an empty value reads "no rating" and the list is none + 1…10', async () => {
    await mount(null)
    expect(trigger().textContent).toContain(i18n.t('form.ratingNone'))

    await open()
    expect(options().map(text)).toEqual([
      i18n.t('form.ratingNone').replace(/\s/g, ''),
      ...Array.from({ length: 10 }, (_, i) => `${i + 1}/10`),
    ])
  })

  it('picking a score sends the number', async () => {
    const onChange = vi.fn()
    await mount(null, onChange)
    await open()

    await act(async () => option('7/10')!.click())
    await flush()

    expect(onChange).toHaveBeenCalledWith(7)
    expect(text(trigger())).toContain('7/10')
  })

  /** ⚡ §4.8 — „გარეშე" `null`-ია, ე.ი. სერიალიზატორი მას გასუფთავებად აგზავნის */
  it('"no rating" clears to null', async () => {
    const onChange = vi.fn()
    await mount(5, onChange)
    await open()

    await act(async () => option(i18n.t('form.ratingNone'))!.click())
    await flush()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('a value outside the list stays visible instead of reading as empty', async () => {
    await mount(12)
    expect(text(trigger())).toContain('12/10')
  })
})
