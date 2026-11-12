import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { FilterGroup, FilterOption, FilterOptionList, FilterPanel } from '@/components/FilterPanel'

/* ============================================================
   **ფილტრის პანელი — გრძელი სია დარჩენილ სიმაღლეს იკავებს.**

   ⚠️ მოწმდება: პანელში გრძელსიიან ჯგუფს ჭერი აღარ აქვს და იჭიმება, მოკლე სია
   და სხვა ჯგუფები თავის ზომაზე რჩება, ჩაკეცილი ჯგუფი არ იჭიმება, პანელის
   გარეთ დახატული სია კი ძველ ჭერს ინარჩუნებს.
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

function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(MemoryRouter, null, node)))

  return container
}

const options = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    h(FilterOption, { key: i, label: `ჟანრი ${i + 1}`, checked: false, onChange: () => {} }),
  )

const group = (title: string, count: number) =>
  h(FilterGroup, { key: title, title, children: h(FilterOptionList, { children: options(count) }) })

const panel = (...children: ReactNode[]) =>
  h(FilterPanel, {
    activeCount: 0,
    dirty: false,
    onApply: () => {},
    onClear: () => {},
    open: false,
    onOpenChange: () => {},
    children,
  })

/** ჯგუფის სქროლადი სია */
const listOf = (box: HTMLElement, title: string) => {
  const heading = [...box.querySelectorAll('button[data-kind="accordion"]')].find((b) => b.textContent?.includes(title))

  return {
    group: heading!.parentElement!.parentElement as HTMLElement,
    list: heading!.parentElement!.parentElement!.querySelector('.fb-scroll') as HTMLElement | null,
    heading: heading as HTMLButtonElement,
  }
}

describe('FilterPanel', () => {
  it('გრძელი სია პანელში იჭიმება და ჭერი აღარ აქვს', () => {
    const box = render(panel(group('ჟანრები', 20), group('სტატუსი', 3)))
    const long = listOf(box, 'ჟანრები')

    expect(long.group.dataset.fill).toBe('true')
    expect(long.group.className).toContain('flex-auto')
    expect(long.list!.style.maxHeight).toBe('')
    expect(long.list!.className).toContain('flex-1')
  })

  it('მოკლე სია და მისი ჯგუფი თავის ზომაზე რჩება', () => {
    const box = render(panel(group('ჟანრები', 20), group('სტატუსი', 3)))
    const short = listOf(box, 'სტატუსი')

    expect(short.group.dataset.fill).toBeUndefined()
    expect(short.group.className).toContain('shrink-0')
    expect(short.list!.style.maxHeight).toBe('260px')
  })

  it('ჩაკეცილი ჯგუფი არ იჭიმება', () => {
    const box = render(panel(group('ჟანრები', 20)))

    act(() => listOf(box, 'ჟანრები').heading.click())

    const closed = listOf(box, 'ჟანრები')
    expect(closed.group.dataset.fill).toBeUndefined()
    expect(closed.list).toBeNull()
  })

  it('პანელის გარეთ გრძელი სია ჭერს ინარჩუნებს', () => {
    const box = render(group('ჟანრები', 20))
    const outside = listOf(box, 'ჟანრები')

    expect(outside.group.dataset.fill).toBeUndefined()
    expect(outside.list!.style.maxHeight).toBe('260px')
  })
})
