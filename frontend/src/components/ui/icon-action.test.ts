import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { SquarePen, Star } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { IconAction, type IconActionProps } from '@/components/ui/icon-action'

/* ============================================================
   `IconAction`-ის კონტრაქტი (Tasks §6).

   ⚠️ სახელი ღილაკზე აიქონის გვერდით წერია (შენი შესწორება) და
   `aria-label`-შიც დგას; `iconOnly`-ზე — მხოლოდ `aria-label`-ში და
   თულთიპში. რომელიმე რომ გაქრეს, `tsc` ამას ვერ დაინახავს.
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

function mount(props: IconActionProps) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root!.render(h(MemoryRouter, null, h(TooltipProvider, null, h(IconAction, props)))),
  )
  return container.firstElementChild as HTMLElement
}

describe('IconAction', () => {
  it('writes the action name next to the icon (the user asked for icon + name)', () => {
    const el = mount({ icon: SquarePen, label: 'რედაქტირება', onClick: () => {} })
    expect(el.tagName).toBe('BUTTON')
    expect(el.getAttribute('aria-label')).toBe('რედაქტირება')
    expect(el.textContent).toBe('რედაქტირება')
  })

  it('keeps a short visible name and the full one for screen readers', () => {
    const el = mount({ icon: Star, label: 'რჩეულში დამატება', text: 'რჩეული' })
    expect(el.textContent).toBe('რჩეული')
    expect(el.getAttribute('aria-label')).toBe('რჩეულში დამატება')
  })

  it('draws only the icon when asked to (reorder arrows)', () => {
    const el = mount({ icon: SquarePen, label: 'ზემოთ', iconOnly: true })
    expect(el.textContent).toBe('')
    expect(el.getAttribute('aria-label')).toBe('ზემოთ')
  })

  it('keeps the count slot even at zero, so rows line up', () => {
    const el = mount({ icon: SquarePen, label: 'x', count: 0 })
    const slot = el.querySelector('span.tabular-nums')
    expect(slot).not.toBeNull()
    expect(slot!.textContent).toBe('')
  })

  it('opens an external link in a new tab and an internal one in place', () => {
    const ext = mount({ icon: SquarePen, label: 'x', href: 'https://example.com' })
    expect(ext.getAttribute('target')).toBe('_blank')
    act(() => root?.unmount())
    container?.remove()

    const int = mount({ icon: SquarePen, label: 'x', to: '/movies/1/edit' })
    expect(int.getAttribute('href')).toBe('/movies/1/edit')
    expect(int.getAttribute('target')).toBeNull()
  })

  it('fills the star with the favourite token, never gold', () => {
    const el = mount({ icon: Star, label: 'x', tone: 'favorite', active: true })
    const cls = el.querySelector('svg')!.getAttribute('class') ?? ''
    expect(cls).toContain('--favorite')
    expect(cls).not.toContain('gold')
  })
})
