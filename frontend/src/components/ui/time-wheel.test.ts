import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **დროის ბორბლები მოდალის შიგნით** (Tasks §23.1).

   ⚠️ ზუსტად შენი შენიშვნა: ძველი ბლოკი გარეთ დაჭერაზე არ იხურებოდა,
   `Escape` კი **მთელ მოდალს** ხურავდა. popover-ი Radix-ის ფენაა, ე.ი.
   `Escape` მხოლოდ მას უნდა ეხებოდეს — ეს მხოლოდ მონტირებით მოწმდება.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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

async function mount(onChange: (v: string | null) => void, onClose: () => void) {
  const { ModalShell } = await import('@/components/ui/modal-shell')
  const { TimePicker } = await import('@/components/ui/time-picker')

  function Harness() {
    const [value, setValue] = useState<string | null>('10:15')

    return h(ModalShell, {
      title: 'modal',
      onClose,
      children: h(TimePicker, {
        value,
        onChange: (v: string | null) => {
          setValue(v)
          onChange(v)
        },
      }),
    })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => root!.render(h(TooltipProvider, null, h(Harness))))
  await flush()
}

const clockButton = () =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('dates.pickTime')}"]`)

const confirmButton = () =>
  [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(i18n.t('dates.timeConfirm', { time: '' }).trim()),
  )

describe('TimeWheelPopover', () => {
  it('Escape closes the wheels and leaves the modal open', async () => {
    const onClose = vi.fn()
    await mount(() => {}, onClose)

    await act(async () => clockButton()!.click())
    await flush()
    expect(confirmButton()).toBeTruthy()

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await flush()

    expect(confirmButton()).toBeFalsy()
    expect(onClose).not.toHaveBeenCalled()
  })

  /** ⚠️ მეორე შემთხვევა 23.1-იდან — ბორბლები **კალენდრის popover-ის** შიგნით */
  it('inside the calendar popover, Escape closes the wheels and keeps the calendar', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(
        h(TooltipProvider, null, h(DatePicker, { id: 'when', withTime: true, value: '2026-10-01T10:15', onChange: () => {} })),
      ),
    )
    await flush()

    await act(async () => document.querySelector<HTMLButtonElement>('#when')!.click())
    await flush()
    const calendar = () => document.querySelector('.rdp-root')
    expect(calendar()).toBeTruthy()

    await act(async () => clockButton()!.click())
    await flush()
    expect(confirmButton()).toBeTruthy()

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await flush()

    expect(confirmButton()).toBeFalsy()
    expect(calendar()).toBeTruthy()
  })

  it('confirm writes the wheel value and closes', async () => {
    const onChange = vi.fn()
    await mount(onChange, () => {})

    await act(async () => clockButton()!.click())
    await flush()

    await act(async () => confirmButton()!.click())
    await flush()

    // ბორბალი ველის მნიშვნელობიდან იწყება — დადასტურება იმავეს წერს
    expect(onChange).toHaveBeenCalledWith('10:15')
    expect(confirmButton()).toBeFalsy()
  })

  /* Tasks §4 — ველზე დაჭერაც ხსნის ბორბლებს; ფოკუსი სეგმენტებს რჩება, რომ
     აკრეფა არ გაწყდეს; დადასტურება ისევ ველის მნიშვნელობას წერს და ხურავს. */
  it('clicking the time field itself opens the wheels and keeps the focus in the field (§4)', async () => {
    const onChange = vi.fn()
    await mount(onChange, () => {})

    const segment = document.querySelector<HTMLElement>('[role="spinbutton"]')!
    expect(segment).toBeTruthy()

    await act(async () => {
      segment.focus()
      segment.click()
    })
    await flush()

    expect(confirmButton(), 'ბორბლები ველიდან გაიხსნა').toBeTruthy()
    // ფოკუსი popover-ში არ გადასულა
    const popover = confirmButton()!.closest('.fb-content')
    expect(popover?.contains(document.activeElement)).toBe(false)

    await act(async () => confirmButton()!.click())
    await flush()

    expect(onChange).toHaveBeenCalledWith('10:15')
    expect(confirmButton()).toBeFalsy()
  })

  it('the clock button still toggles the wheels after a field-opened session', async () => {
    await mount(() => {}, () => {})

    await act(async () => document.querySelector<HTMLElement>('[role="spinbutton"]')!.click())
    await flush()
    await act(async () => confirmButton()!.click())
    await flush()

    await act(async () => clockButton()!.click())
    await flush()
    expect(confirmButton()).toBeTruthy()
  })
})
