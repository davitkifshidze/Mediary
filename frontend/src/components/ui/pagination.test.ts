import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Pagination, pageWindow } from '@/components/ui/pagination'
import i18n from '@/i18n'

/* ============================================================
   **გვერდების ნომრები**.

   ⚠️ ფანჯარა: პირველი სამი · მიმდინარე ±1 · ბოლო სამი, ყოველ გამოტოვებაზე
   „…" — „‹ 1 2 3 … 5 [6] 7 … 10 11 12 ›". „…"-ზე დაჭერით ნომერი იწერება;
   „მეტის ჩვენების" შემდეგ ჩატვირთული დიაპაზონი ერთად ინიშნება.
   ============================================================ */

describe('pageWindow', () => {
  it('1 page', () => {
    expect(pageWindow(1, 1)).toEqual([1])
  })

  it('5 pages — all of them, without gaps', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(5, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('12 pages — the example from the task', () => {
    expect(pageWindow(6, 12)).toEqual([1, 2, 3, null, 5, 6, 7, null, 10, 11, 12])
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, null, 10, 11, 12])
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, null, 10, 11, 12])
    expect(pageWindow(12, 12)).toEqual([1, 2, 3, null, 10, 11, 12])
  })

  it('100 pages', () => {
    expect(pageWindow(50, 100)).toEqual([1, 2, 3, null, 49, 50, 51, null, 98, 99, 100])
    expect(pageWindow(99, 100)).toEqual([1, 2, 3, null, 98, 99, 100])
  })
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function render(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  const onPage = vi.fn()
  const onMore = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(Pagination, { page: 6, lastPage: 12, total: 115, onPage, onMore, ...props })))
  return { el: container, onPage, onMore }
}

const buttons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button')]

describe('Pagination', () => {
  it('draws ‹ 1 2 3 … 5 [6] 7 … 10 11 12 ›, the total and „show more"', () => {
    const { el } = render()

    const labels = buttons(el).map((b) => b.textContent)
    expect(labels).toEqual(['', '1', '2', '3', '…', '5', '6', '7', '…', '10', '11', '12', '', i18n.t('list.showMore')])
    expect(el.querySelector('[aria-current="page"]')?.textContent).toBe('6')
    expect(el.textContent).toContain(i18n.t('pagination.total', { count: 115 }))
  })

  it('numbers and arrows move; „show more" appends', () => {
    const { el, onPage, onMore } = render()

    act(() => buttons(el).find((b) => b.textContent === '11')!.click())
    expect(onPage).toHaveBeenLastCalledWith(11)
    act(() => el.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('pagination.next')}"]`)!.click())
    expect(onPage).toHaveBeenLastCalledWith(7)
    act(() => el.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('pagination.prev')}"]`)!.click())
    expect(onPage).toHaveBeenLastCalledWith(5)
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="pagination-more"]')!.click())
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('„…" becomes a field: Enter goes to the typed page (clamped), Escape cancels', () => {
    const { el, onPage } = render()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

    act(() => buttons(el).filter((b) => b.textContent === '…')[1].click())
    let input = el.querySelector('input')!
    act(() => {
      setter.call(input, '9')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onPage).toHaveBeenLastCalledWith(9)
    expect(el.querySelector('input')).toBeNull()

    act(() => buttons(el).filter((b) => b.textContent === '…')[0].click())
    input = el.querySelector('input')!
    act(() => {
      setter.call(input, '400')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onPage).toHaveBeenLastCalledWith(12)

    onPage.mockClear()
    act(() => buttons(el).filter((b) => b.textContent === '…')[0].click())
    act(() => el.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onPage).not.toHaveBeenCalled()
  })

  it('after „show more" the loaded range is marked together and ‹ goes before it', () => {
    const { el, onPage } = render({ from: 4, page: 6 })

    const marked = buttons(el).filter((b) => ['4', '5', '6'].includes(b.textContent ?? ''))
    expect(marked.every((b) => b.className.includes('bg-primary'))).toBe(true)
    act(() => el.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('pagination.prev')}"]`)!.click())
    expect(onPage).toHaveBeenLastCalledWith(3)
  })

  it('on the last page there is no „show more" and › is off; an empty list draws nothing', () => {
    let { el } = render({ page: 12 })
    expect(el.querySelector('[data-testid="pagination-more"]')).toBeNull()
    expect(el.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('pagination.next')}"]`)!.disabled).toBe(true)

    act(() => root?.unmount())
    container?.remove()
    ;({ el } = render({ total: 0, page: 1, lastPage: 1 }))
    expect(el.innerHTML).toBe('')
  })
})
