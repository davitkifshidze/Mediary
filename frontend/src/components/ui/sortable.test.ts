import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **Drag & drop ერთი კომპონენტით** (Tasks §11, Q3).

   ⚠️ jsdom-ს განლაგება არ აქვს — ყველა მართკუთხედი ნულია, ე.ი. dnd-kit-ი
   „ქვემოთ" ვერაფერს იპოვიდა. ამიტომ `getBoundingClientRect` აქ ელემენტის
   რიგიდან ითვლება (`data-sortable-id`-ის ინდექსი × სიმაღლე). კლავიატურის
   სენსორი ამ რიცხვებზე მუშაობს: Space → ისარი → Space.

   მოწმდება: კლავიატურით გადალაგება მთელ რიგს აბრუნებს; აღებული ელემენტი
   წყვეტილ სლოტად იხატება და მაუსთან ასლი ჩნდება; Esc აუქმებს; `handle`-რეჟიმში
   კლავიატურა სახელურზეა და არა ბარათზე; `disabled` ელემენტი არ ითრევა.
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
const originalRect = Element.prototype.getBoundingClientRect

/** სიის რიგი → ვერტიკალური მართკუთხედები (40 px სიმაღლე, 10 px დაშორება) */
function mockRects() {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    // ⚠️ მაუსთან ასლი (`DragOverlay`) სიის გარეთაა — მისი მართკუთხედი იმ ელემენტისაა, რომლის ასლიცაა
    const ids = [...new Set([...document.querySelectorAll<HTMLElement>('[data-sortable-id]')].map((x) => x.dataset.sortableId))]
    const target = (this.closest('[data-sortable-id]') ?? this.querySelector('[data-sortable-id]')) as HTMLElement | null
    const index = target ? ids.indexOf(target.dataset.sortableId) : -1
    const top = index < 0 ? 0 : index * 50
    const rect = { x: 0, y: top, top, left: 0, width: 200, height: 40, right: 200, bottom: top + 40, toJSON: () => ({}) }
    return rect as DOMRect
  }
}

beforeEach(() => mockRects())

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  Element.prototype.getBoundingClientRect = originalRect
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  await flush()
  return container
}

async function key(target: Element, code: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }))
  })
  await flush()
}

const order = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-sortable-id]')].map((x) => x.dataset.sortableId)

async function list(onReorder: (ids: (string | number)[]) => void, extra: { handle?: boolean; disabled?: string[] } = {}) {
  const { Sortable, SortableHandle, SortableItem } = await import('@/components/ui/sortable')
  const ids = ['a', 'b', 'c']

  return mount(
    h(
      Sortable,
      { ids, onReorder },
      h(
        'ul',
        null,
        ...ids.map((id) =>
          h(
            SortableItem,
            { key: id, id, handle: extra.handle, disabled: extra.disabled?.includes(id), className: 'border border-border' },
            extra.handle ? h(SortableHandle) : null,
            h('span', null, id.toUpperCase()),
          ),
        ),
      ),
    ),
  )
}

describe('Sortable', () => {
  it('reorders with the keyboard and reports the whole new order', async () => {
    const onReorder = vi.fn()
    const el = await list(onReorder)
    expect(order(el)).toEqual(['a', 'b', 'c'])

    const item = el.querySelector('[data-sortable-id="a"]')!
    expect(item.getAttribute('aria-roledescription')).toBe('sortable')

    await key(item, 'Space')
    // აღებული — წყვეტილი სლოტი და მაუსთან ასლი
    expect(item.getAttribute('data-dragging')).toBe('true')
    expect(item.className).toContain('border-dashed!')
    expect(document.querySelector('[data-testid="sortable-ghost"]')?.textContent).toBe('A')

    await key(item, 'ArrowDown')
    await key(item, 'Space')

    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
    expect(document.querySelector('[data-testid="sortable-ghost"]')).toBeNull()
    expect(item.getAttribute('data-dragging')).toBeNull()
  })

  it('escape cancels without reporting', async () => {
    const onReorder = vi.fn()
    const el = await list(onReorder)
    const item = el.querySelector('[data-sortable-id="b"]')!

    await key(item, 'Space')
    await key(item, 'ArrowUp')
    await key(item, 'Escape')

    expect(onReorder).not.toHaveBeenCalled()
    expect(item.getAttribute('data-dragging')).toBeNull()
  })

  it('in handle mode the keyboard lives on the handle, not on the row', async () => {
    const onReorder = vi.fn()
    const el = await list(onReorder, { handle: true })
    const item = el.querySelector('[data-sortable-id="c"]')!
    expect(item.getAttribute('aria-roledescription')).toBeNull()

    const handle = item.querySelector('[data-sortable-handle][aria-roledescription="sortable"]')!
    expect(handle).toBeTruthy()
    expect(handle.getAttribute('aria-label')).toBe(i18n.t('actions.drag'))

    await key(handle, 'Space')
    await key(handle, 'ArrowUp')
    await key(handle, 'Space')

    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b'])
  })

  it('a disabled item is neither grabbable nor focusable for sorting', async () => {
    const el = await list(() => {}, { disabled: ['b'] })
    const item = el.querySelector('[data-sortable-id="b"]')!
    expect(item.getAttribute('aria-roledescription')).toBeNull()
    expect(item.className).not.toContain('cursor-grab')
    expect(el.querySelector('[data-sortable-id="a"]')?.className).toContain('cursor-grab')
  })
})
