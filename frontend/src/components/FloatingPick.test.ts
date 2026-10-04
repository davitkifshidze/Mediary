import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **მოტივტივე კამათელი** (Tasks §17.2/§17.3 → §52.3).

   ⚠️ მოწმდება: წარწერა მუდამ ჩანს და ციკლად მიდის — ასო-ასო იწერება
   (70 ms/ასო) → 1.5 წამი დგას → ასო-ასო იშლება → პაუზა → თავიდან იწერება;
   `prefers-reduced-motion`-ზე — სრული ტექსტი უძრავად, კურსორის გარეშე;
   ჰოვერზე სრული ტექსტი უმალ ჩანს; დაჭერა `onOpen`-ს უშვებს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
const originalMatchMedia = window.matchMedia

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  window.matchMedia = originalMatchMedia
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
/** ბუშტის ტექსტი კურსორის გარეშე */
const words = () => tip()!.textContent!.replace('|', '')
const phase = () => tip()!.getAttribute('data-phase')

/** ტაიმერები ცალ-ცალკე უნდა გაიაროს — ყოველი ნაბიჯი ახალ რენდერს და ახალ ტაიმერს იწვევს */
async function tick(ms: number, step = 10) {
  for (let left = ms; left > 0; left -= step) {
    await act(async () => vi.advanceTimersByTime(Math.min(step, left)))
  }
}

describe('FloatingPick', () => {
  it('types the hint, holds it, erases it and types it again — forever', async () => {
    const text = i18n.t('pick.title')
    await mount()

    // დასაწყისში ბუშტი არის, მაგრამ ტექსტი ჯერ ცარიელია — მხოლოდ კურსორი
    expect(tip()).not.toBeNull()
    expect(words()).toBe('')
    expect(tip()!.querySelector('[data-caret]')).not.toBeNull()

    await tick(70 * 3)
    expect(words()).toBe(text.slice(0, 3))

    await tick(70 * text.length)
    expect(words()).toBe(text)
    expect(phase()).toBe('hold')

    // 1.5 წამი დგას, მერე ასო-ასო იშლება
    await tick(1500)
    expect(phase()).toBe('erasing')
    await tick(45 * 2)
    expect(words().length).toBeLessThan(text.length)

    await tick(45 * text.length)
    expect(words()).toBe('')
    expect(phase()).toBe('pause')

    // პაუზის შემდეგ — თავიდან; ბუშტი არ ქრება
    await tick(600)
    expect(phase()).toBe('typing')
    await tick(70 * text.length)
    expect(words()).toBe(text)
    expect(tip()).not.toBeNull()
  })

  it('keeps the full text still when the user prefers reduced motion', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    await mount()

    expect(words()).toBe(i18n.t('pick.title'))
    expect(tip()!.querySelector('[data-caret]')).toBeNull()

    await tick(5000, 100)
    expect(words()).toBe(i18n.t('pick.title'))
    expect(phase()).toBe('still')
  })

  it('shows the full text on hover while the loop goes on underneath', async () => {
    const el = await mount()
    const button = el.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe(i18n.t('pick.title'))
    expect(button.className).toContain('rounded-full')

    // React-ის `onMouseEnter` `mouseover`-ზე დგას
    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(words()).toBe(i18n.t('pick.title'))

    await act(async () => {
      button.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    // ჰოვერის შემდეგ ისევ ციკლის ტექსტია (ჯერ ცარიელი — დრო არ გასულა)
    expect(words()).toBe('')
  })

  it('opens the dialog on click', async () => {
    const onOpen = vi.fn()
    const el = await mount(onOpen)
    await act(async () => el.querySelector('button')!.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
