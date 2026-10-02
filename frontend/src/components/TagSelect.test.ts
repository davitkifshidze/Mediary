import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FeedbackProvider } from '@/components/ui/feedback'
import i18n from '@/i18n'

/* ============================================================
   **ტეგები — იგივეს დამატებაზე პოპაპი** (Tasks §13).

   ⚠️ მოწმდება მონტირებით: „rock", როცა „Rock" უკვე არის → გაფრთხილების
   ფანჯარა ჩნდება და სია უცვლელია (ბოლოს აკრეფილი იკარგება, პირველი რჩება);
   ახალი ტეგი Enter-ზე ემატება; ბიბლიოთეკაში ნაცნობი ფორმა („Jazz") რეგისტრს
   ინარჩუნებს; მენიუდან რეგისტრით განსხვავებული ვარიანტის არჩევაც ერთ ტეგს
   ტოვებს და იმავე გაფრთხილებას აჩვენებს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
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

const latest = { tags: [] as string[] }

async function mount(initial: string[], options: string[] = []) {
  const { TagSelect } = await import('@/components/TagSelect')

  function Harness() {
    const [value, setValue] = useState(initial)
    latest.tags = value
    return h(TagSelect, { inputId: 'tags', options, value, onChange: setValue })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(FeedbackProvider, null, h(Harness))))
  await flush()
  return container
}

const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

/** აკრეფა + Enter — ზუსტად ის, რასაც ადამიანი აკეთებს */
async function typeAndEnter(text: string) {
  const input = document.getElementById('tags') as HTMLInputElement
  await act(async () => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await flush()
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  })
  await flush()
}

const alertShown = (tag: string) => document.body.textContent?.includes(i18n.t('tags.duplicateAlert', { tag })) ?? false

async function closeAlert() {
  const ok = [...document.querySelectorAll('button')].find((b) => b.textContent === i18n.t('alert.ok'))
  expect(ok, 'გაფრთხილების ღილაკი ვერ მოიძებნა').toBeTruthy()
  await act(async () => ok!.click())
  await flush()
}

describe('TagSelect', () => {
  it('warns about a case-insensitive duplicate and keeps the first spelling', async () => {
    await mount(['Rock'])

    await typeAndEnter('rock')

    expect(alertShown('Rock')).toBe(true)
    expect(latest.tags).toEqual(['Rock'])

    await closeAlert()
    expect(alertShown('Rock')).toBe(false)
  })

  it('adds a new tag on Enter and reuses the library spelling of a known one', async () => {
    await mount(['Rock'], ['Jazz'])

    await typeAndEnter('blues')
    expect(latest.tags).toEqual(['Rock', 'blues'])

    await typeAndEnter('jazz')
    expect(latest.tags).toEqual(['Rock', 'blues', 'Jazz'])
    expect(document.body.textContent).not.toContain(i18n.t('tags.duplicateTitle'))
  })

  it('a case variant picked from the menu collapses into one tag with the same warning', async () => {
    const onChange = vi.fn()
    const { TagSelect } = await import('@/components/TagSelect')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(h(FeedbackProvider, null, h(TagSelect, { inputId: 'tags', options: ['Rock', 'rock'], value: ['Rock'], onChange }))),
    )
    await flush()

    // მენიუში „rock" ვარიანტია (ბიბლიოთეკაში ორი ფორმა არსებობს) — აკრეფა მას ფილტრავს, Enter ირჩევს
    await typeAndEnter('rock')

    expect(onChange).toHaveBeenCalledWith(['Rock'])
    expect(alertShown('rock')).toBe(true)
  })
})
