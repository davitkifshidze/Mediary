import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { ListSearch } from '@/components/ListSearch'

/* ============================================================
   **სიის ძებნის ველი**: წარწერა მოდულისაა, „სხვაგანაც" კი მხოლოდ მაშინ
   ჩნდება, როცა სიტყვას ჯვარედინი ძებნაც მიიღებს — და იმავე სიტყვით მიდის.
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

function render(value: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      h(MemoryRouter, null, h(ListSearch, { value, onChange: () => {}, placeholder: 'ძებნა ფილმებში…' })),
    ),
  )

  return container
}

describe('ListSearch', () => {
  it('ველს მოდულის წარწერა აქვს', () => {
    const box = render('')

    expect(box.querySelector('input')?.getAttribute('placeholder')).toBe('ძებნა ფილმებში…')
  })

  it('მოკლე სიტყვაზე „სხვაგანაც" არ ჩანს', () => {
    expect(render('').querySelector('a')).toBeNull()
    act(() => root?.unmount())
    expect(render(' l ').querySelector('a')).toBeNull()
  })

  it('„სხვაგანაც" იმავე სიტყვით ჯვარედინ ძებნაზე მიდის', () => {
    const link = render(' სიყვარული & Love ').querySelector('a')

    expect(link?.getAttribute('href')).toBe(`/search?q=${encodeURIComponent('სიყვარული & Love')}`)
  })
})
