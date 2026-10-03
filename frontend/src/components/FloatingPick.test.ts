import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **მოტივტივე კამათელი** (Tasks §17.2/§17.3).

   ⚠️ მოწმდება: ბუშტი ასო-ასო იწერება (60 ms/ასო), ბოლოს სრული ტექსტია,
   4 წამში ქრება და **სესიაში მეორედ აღარ იწერება** (`sessionStorage`);
   ჰოვერზე სრული ტექსტი უმალ ჩანს; დაჭერა `onOpen`-ს უშვებს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
  window.sessionStorage.clear()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

async function mount(onOpen: () => void = () => {}) {
  const { FloatingPick } = await import('@/components/FloatingPick')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(FloatingPick, { module: 'movie', onOpen })))
  return container
}

const tip = () => document.getElementById('floating-pick-tip')

describe('FloatingPick', () => {
  it('types the hint letter by letter, holds it, then hides it and remembers the session', async () => {
    const text = i18n.t('pick.title')
    const el = await mount()

    // დასაწყისში ბუშტი არის, მაგრამ ტექსტი ჯერ ცარიელია
    expect(tip()).not.toBeNull()
    expect(tip()!.textContent?.replace('|', '')).toBe('')

    await act(async () => vi.advanceTimersByTime(60 * 3))
    expect(tip()!.textContent?.replace('|', '')).toBe(text.slice(0, 3))

    await act(async () => vi.advanceTimersByTime(60 * text.length))
    expect(tip()!.textContent).toBe(text)
    expect(tip()!.getAttribute('data-phase')).toBe('hold')
    expect(window.sessionStorage.getItem('pick_tip_shown')).toBe('1')

    await act(async () => vi.advanceTimersByTime(4000))
    expect(tip()).toBeNull()

    // ღილაკი კი ადგილზეა, მოდულის ფერის ცვლადით
    const button = el.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe(text)
    expect(button.className).toContain('rounded-full')
  })

  it('does not type again in the same session and shows the full text on hover', async () => {
    window.sessionStorage.setItem('pick_tip_shown', '1')
    const el = await mount()

    expect(tip()).toBeNull()

    const button = el.querySelector('button')!
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    })
    // React-ის `onMouseEnter` `mouseover`-ზე დგას
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(tip()?.textContent).toBe(i18n.t('pick.title'))

    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    expect(tip()).toBeNull()
  })

  it('opens the dialog on click', async () => {
    const onOpen = vi.fn()
    const el = await mount(onOpen)
    await act(async () => el.querySelector('button')!.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
